---
title: CHECK 와 partial index 술어의 3단계 열 참조("schema"."table"."col") 를 Nile 이 12바이트 스키마 이름 오류로 거부한다
hejbro_version: 0.2.0-pre.0
provider: nile
kind: bug
status: posted
discussion: https://github.com/quickstart-now/hejbro/issues/750
---

## 요약

hejbro 는 CHECK 식과 partial index 의 `where` 술어 안 열 참조를 항상 `"lab"."projects"."name"` 처럼 스키마까지 한정해 렌더링한다. Nile 은 public 이 아닌 스키마의 tenant-aware 테이블을 내부적으로 `<database id>_<schema>` 이름으로 다루는데, 3단계 참조가 있으면 그 내부 이름에 스키마 길이 제한을 적용해 `schema name can't be more than 12 bytes` (SQLSTATE 42622) 로 거부한다. 열 이름만 쓰거나 `"projects"."name"` 처럼 2단계로 쓰면 같은 문장이 통과한다. 그래서 `nilePreset` 검증을 통과한 선언이 `hejbro migrate` 에서 실패한다.

## 재현 절차

1. Nile 데이터베이스(PostgreSQL 15.19)에 아래를 실행한다. 통과한다.
   ```sql
   create schema "lab";
   create table "lab"."projects" ("tenant_id" uuid not null, "id" uuid not null, "name" text not null,
     constraint "projects_pkey" primary key ("tenant_id", "id"));
   alter table "lab"."projects" add constraint "c1" check (length(btrim("name")) > 0);
   alter table "lab"."projects" add constraint "c3" check (length(btrim("projects"."name")) > 0);
   ```
2. 아래를 실행한다. 실패한다.
   ```sql
   alter table "lab"."projects" add constraint "c2" check (length(btrim("lab"."projects"."name")) > 0);
   -- error: schema name can't be more than 12 bytes
   create index "i3" on "lab"."projects" ("tenant_id") where "lab"."projects"."archived_at" is null;
   -- 같은 오류
   ```
3. hejbro 로는 `check("projects_name_not_blank", sql\`length(btrim(${t.name})) > 0\`)` 또는 `index().on(t.tenantId).where(isNull(t.archivedAt))` 를 선언하고 `hejbro generate` 후 `hejbro migrate` 하면 2 와 같은 SQL 이 나가 `apply-failed (42622)` 로 끝난다.

## 기대 결과

`nilePreset` 을 등록한 generate 가 통과한 선언은 Nile 에 적용된다. 최소한 preset 이 이 경우를 refuse 하거나, 렌더러가 CHECK/술어 안에서는 열을 한정하지 않거나 2단계로만 한정한다.

## 실제 결과

- `hejbro generate --config hejbro.nile.config.ts`: 오류 없음
- `hejbro migrate`: `error[apply-failed]: 0001_add_lab.sql — applying "0001_add_lab.sql" failed (42622): schema name can't be more than 12 bytes`

## 추가 관찰

- 범위는 "tenant-aware 테이블" 이다. 측정 결과:

  | 테이블 | 스키마 | 3단계 참조 CHECK | 결과 |
  |---|---|---|---|
  | tenant-aware | `lab` | `"lab"."projects"."name"` | 42622 schema name can't be more than 12 bytes |
  | tenant-aware | `public` | `"public"."zz_p"."name"` | 42622 (같은 오류) |
  | 비테넌트 (`tenant_id` 없음) | `lab` | `"lab"."plain"."name"` | 통과 |
  | tenant-aware | `lab` | 열 이름만 / `"projects"."name"` | 통과 |

- partial index 술어의 3단계 참조(`where "lab"."projects"."archived_at" is null`)는 다른 오류로 실패한다: `missing FROM-clause entry for table "projects"`. 열 이름만 쓰면 통과한다.
- Nile 은 `DROP SCHEMA … CASCADE` 를 지원하지 않는다 (`DROP CASCADE is not supported`). `hejbro reset` 이 Nile 에서 동작하려면 이 점도 고려가 필요하다.
- Nile 의 오류 메시지는 내부 이름을 그대로 노출한다: `schema "01a0672d-…_lab" already exists`.

## 우회

선언에서 열을 보간하지 않는 raw sql 을 쓰면 통과한다: `check("…", sql\`length(btrim(name)) > 0\`)`, `index().on(t.tenantId).where(sql\`archived_at is null\`)`. 대신 rename 추적을 잃는다.

## 환경

- Nile: PostgreSQL 15.19 (Debian), us-west-2
- 같은 SQL 은 순정 Postgres 18.6 과 Neon(PG 18.6)에서 정상
