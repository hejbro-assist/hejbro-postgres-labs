---
title: nilePreset·nileDriver 가 Nile 이 거부하는 네 가지(표현식 인덱스, 스키마 한정 enum 열, 열 rename, 오류 뒤 savepoint 복구)를 미리 거르지 않아 migrate 나 실행 시점에야 실패한다
hejbro_version: 0.2.0-pre.1
provider: nile
kind: improvement
status: posted
discussion: https://github.com/quickstart-now/hejbro/issues/827
---

## 요약

Nile(PG 15.19)에 직접 SQL 로 측정한 결과 아래 셋은 tenant-aware 여부와 무관하게 거부된다. hejbro 의 `nilePreset` 은 이들을 generate 에서 통과시키므로, 체인은 `migrate` 에서 provider 오류로 멈춘다. 첫 두 개는 preset 검증기로 거를 수 있고(`identity`·`serial` 과 같은 "measured only" 등급), 세 번째는 rename 이 alter 라서 검증기보다는 `generate --rename` 시점의 경고나 문서가 맞을 것이다. 세 번째 대신 렌더러 쪽 선택지도 있다: enum 열 타입을 Nile 에서는 이름만으로 렌더링하면 통과한다(아래 재현 3).

## 재현 절차

Nile 에서 스크래치 스키마 `labx` 에 실행했다. `labx.projects` 는 `tenant_id uuid` 를 가진 tenant-aware 테이블, `labx.plain` 은 `tenant_id` 가 없는 테이블.

1. 표현식 인덱스
   ```sql
   create index "i1" on "labx"."projects" ("tenant_id", (lower("title"))) where "archived_at" is null;  -- functions are not supported in index column expression
   create index "i2" on "labx"."projects" ((lower("projects"."title")));                                -- 같은 오류
   create index "i3" on "labx"."plain" ((lower("title")));                                              -- 같은 오류 (plain 테이블도)
   ```
   hejbro 선언 `index("…").unique().on(t.tenantId, sql\`lower(${t.title})\`).where(isNull(t.archivedAt))` 이 이 SQL 을 낸다(`0004_add_priority_and_metadata.sql`).
2. 스키마 한정 enum 열
   ```sql
   create type "labx"."prio" as enum ('a','b');                                        -- ok
   create table "labx"."t1" (…, "p" "labx"."prio" not null default 'a', …);            -- schema "labx" does not exist
   create type "public"."prio_pub" as enum ('a','b');                                  -- ok
   create table "labx"."t2" (…, "p" "public"."prio_pub" not null default 'a', …);      -- type "public.prio_pub" does not exist
   create table "labx"."t3" (…, "p" prio_pub not null default 'a', …);                 -- ok (search_path: public, users, _nile_shared, extensions)
   select 'a'::"labx"."prio";                                                          -- schema "labx" does not exist
   ```
   hejbro 는 `pgEnum(lab, "task_priority", …)` 의 열을 `"lab"."task_priority"` 로 한정해 렌더링한다(`0004`).
3. 열 rename
   ```sql
   alter table "labx"."projects" rename column "title" to "name";   -- this form of ALTER TABLE is not supported
   alter table "labx"."plain" rename column "title" to "name";      -- 같은 오류
   ```
   hejbro 의 `generate --rename lab.tasks.position=sort_order` 가 이 문장을 낸다(`0005`, `0006`).

4. 오류 뒤 savepoint 복구 (쿼리 레이어 `tx.transaction()` 의 중첩 트랜잭션)
   ```sql
   begin; savepoint hejbro_sp_1;
   insert into lab.tasks (...) values (..., '   ');   -- 23514 (CHECK 위반)
   rollback to savepoint hejbro_sp_1;                 -- 25P01 current transaction is aborted, commands ignored until end of transaction block
   ```
   plain 테이블(`public.zz_sp`)에서도 같다. 오류가 없을 때의 `rollback to savepoint` 는 통과한다. `nileDriver` 로 만든 핸들에서 `tx.transaction(inner => …)` 안의 문장이 실패하면 hejbro 는 `savepoint-rollback-failed` 를 던지고, 바깥 트랜잭션의 나머지 문장은 전부 25P01 로 실패한다. 부수 관찰: `create temporary table` 도 `not supported`.

통과한 것(참고): `create type … as enum`, `alter type … add value`, GIN `jsonb_path_ops`, `drop constraint`/`add constraint`, `drop index`/`create index`(열 이름 술어), 3단계 참조가 든 `create or replace view` 와 join select.

## 기대 결과

- `nilePreset` 이 표현식 인덱스(`nile-expression-index-unsupported`)와 스키마 한정 타입의 열(또는 `pgEnum` 자체, `nile-enum-column-unsupported`)을 refuse 하거나, enum 열 타입을 Nile 에서는 search_path 에 의존한 이름만으로 렌더링한다.
- `--rename` 이 Nile preset 아래에서는 적용 불가 경고를 내거나 `references/nile-preset.md` 의 거부 표에 오른다.
- `nileDriver` 가 "savepoint 복구 불가" 를 드라이버 capability 로 선언해 `tx.transaction()` 이 Nile 에서는 진입 전에 코드 있는 오류로 거부되거나, 문서의 플랫폼 표에 오른다.

## 실제 결과

generate 는 통과하고 `hejbro migrate` 가 해당 파일에서 provider 오류로 멈춘다. 이 저장소에서는 `0003` 이 먼저 42P01 로 막혀(`2026-09-04-nile-rejects-two-part-refs-in-index-predicates.md`) `0004`~`0006` 은 직접 SQL 로만 측정했다.

## 환경

- Nile: PostgreSQL 15.19 (Debian), us-west-2, 2026-09-04
- 관련 hejbro 이슈: #754, #772, #573 (identity/serial 을 같은 방식으로 측정해 refuse 한 선례)
