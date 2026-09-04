---
title: Nile 은 partial index 술어의 2단계 열 참조("table"."column")를 42P01 로 거부해 0.2.0-pre.1 의 #754 수정이 인덱스에는 미치지 못한다
hejbro_version: 0.2.0-pre.1
provider: nile
kind: bug
status: draft
discussion: 
---

## 요약

pre.1 은 테이블 결속 식의 열 참조를 `"projects"."archived_at"` 처럼 2단계로 렌더링한다(#754). CHECK 제약에서는 Nile 이 이 형태를 받지만, partial index 의 `where` 술어에서는 tenant-aware 테이블에 한해 `missing FROM-clause entry for table "projects"` (42P01) 로 거부한다. 그래서 pre.0 에서 raw 텍스트로 우회했던 선언을 열 보간으로 되돌린 마이그레이션 `0003_requalify_expressions` 이 Nile 에서 실패하고, 이후 파일은 Nile 에 적용되지 않는다. 열 이름만 쓰면 통과한다. pre.0 보고서(#750 항목 3)에 "partial index 술어는 다른 오류로 실패한다 … 열 이름만 쓰면 통과" 라고 적었는데, 2단계 형태는 그때 CHECK 에서만 측정했다.

## 재현 절차

1. Nile(PG 15.19)에서 tenant-aware 테이블을 만든다.
   ```sql
   create schema "labx";
   create table "labx"."projects" ("tenant_id" uuid not null, "id" uuid not null default gen_random_uuid(),
     "title" text not null, "archived_at" timestamptz, primary key ("tenant_id","id"));
   ```
2. 아래를 실행한다.
   ```sql
   alter table "labx"."projects" add constraint "c" check (length(btrim("projects"."title")) > 0);   -- ok
   create index "i_bare" on "labx"."projects" ("tenant_id") where "archived_at" is null;               -- ok
   create index "i_2part" on "labx"."projects" ("tenant_id") where "projects"."archived_at" is null;   -- 42P01
   ```
3. `tenant_id` 가 없는 plain 테이블에서는 3번째 문장도 통과한다.
4. hejbro 로는 `index().on(t.tenantId).where(isNull(t.archivedAt))` 를 선언해 generate → `pnpm target nile migrate` 하면 `applying "0003_requalify_expressions.sql" failed (42P01): missing FROM-clause entry for table "projects"`.

## 기대 결과

`nilePreset` 을 등록한 선언이 generate 를 통과하면 Nile 에 적용된다. 인덱스 술어(그리고 인덱스 표현식)의 열 참조를 열 이름만으로 렌더링하거나, preset 이 2단계 참조가 든 인덱스 술어를 refuse 한다.

## 실제 결과

`0003` 이 42P01 로 실패한다. ledger 는 `0001`·`0002` 만 기록하고 `status` 는 7 개 pending 으로 정확히 보고한다.

## 환경

- Nile: PostgreSQL 15.19 (Debian), us-west-2
- 같은 파일은 Postgres 18.6, Neon 18.6, Supabase 17.6 에서 exit 0
- 관련 hejbro 이슈: #754 (닫힘), #772
