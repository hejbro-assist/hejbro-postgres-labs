---
title: Nile 은 EXPLAIN 을 지원하지 않아 hejbro check 가 CHECK 제약을 비교하지 못하고 exit 2 로 끝난다
hejbro_version: 0.2.0-pre.0
provider: nile
kind: improvement
status: posted
discussion: https://github.com/quickstart-now/hejbro/issues/750
---

## 요약

`hejbro check` 는 CHECK 제약의 선언식과 카탈로그 식을 비교할 때 EXPLAIN 을 사용한다. Nile 은 `explain select 1` 자체를 `command tag EXPLAIN unhandled` 오류로 거부하므로, CHECK 가 하나라도 있는 선언은 Nile 에서 `check` 가 `check-not-compared` 로 exit 2 를 돌려준다. 마이그레이션은 정상 적용되었고 카탈로그 식도 `pg_get_constraintdef` 로 읽힌다(바깥 괄호가 한 겹 적을 뿐). EXPLAIN 이 없을 때 정규화된 텍스트 비교로 물러나는 경로가 있으면 Nile 에서도 `check` 가 답을 낼 수 있다.

## 재현 절차

1. CHECK 제약이 있는 테이블(예: `check("projects_name_not_blank", sql\`length(btrim(name)) > 0\`)`)을 선언해 `hejbro generate` 하고 Nile 에 `hejbro migrate` 한다 (성공).
2. 같은 Nile 에 `hejbro check` 를 실행한다.
3. 비교용으로 Nile 에서 `explain select 1` 을 직접 실행한다.

## 기대 결과

2 가 `check: no differences.` 로 exit 0. 또는 EXPLAIN 을 못 쓰는 환경에서는 텍스트 비교로 판정한 뒤 그 사실을 경고로 알린다.

## 실제 결과

```
error[check-not-compared]: lab.projects.projects_name_not_blank
  declared check constraint "lab.projects.projects_name_not_blank" could not be compared: command tag EXPLAIN unhandled.
  Declared expression: "length(btrim(name)) > 0". Catalog expression: "(length(btrim(name)) > 0)".
  Next: confirm the connected role can run EXPLAIN against this table, then rerun `hejbro check`.
check: could not answer -- 3 declared object(s) could not be compared.
```

3 의 결과: `error: command tag EXPLAIN unhandled` (Nile 서버가 직접 돌려주는 오류). 즉 "connected role can run EXPLAIN" 안내는 Nile 에서는 해결책이 될 수 없다.

## 추가 관찰

- Nile 의 `pg_get_constraintdef` 는 `CHECK (length(btrim(name)) > 0)` 처럼 바깥 괄호를 한 겹 덜 붙인다. 순정 Postgres 18 은 `CHECK ((length(btrim(name)) > 0))`.
- Nile 에서 `'lab'::regnamespace` 는 `schema "lab" does not exist` 로 실패하지만 `select oid from pg_namespace where nspname='lab'` 은 정상이다. 카탈로그를 읽을 때 regnamespace 캐스트에 의존하면 Nile 에서 깨진다.

## 환경

- Nile: PostgreSQL 15.19 (Debian), us-west-2
- 같은 선언은 순정 Postgres 18.6 과 Neon(PG 18.6)에서 `check: no differences.`

## 재검증 (0.2.0-pre.1, 2026-09-04)

hejbro #755 로 추적, PR #780/#795/#802 로 수정. `nilePreset` 이 `explainUnavailable: true` 를 선언하고 `check` 는 그 preset 이 등록돼 있으면 정규화 텍스트 비교로 간다.

- preset 이 등록된 설정으로 `check` → `check-constraint expressions were compared by normalized text on this run …` 안내가 붙고, `length(btrim(name)) > 0` 류 CHECK 2건은 일치한다.
- `status in ('todo', 'doing', 'done')` 은 카탈로그의 `(status = ANY (ARRAY['todo'::text, …]))` 와 정규화 후에도 달라 `check-not-compared` 1건, **exit 2 그대로**. 기대 결과(exit 0)에 못 미친다. 이 잔여분은 `2026-09-04-nile-check-in-list-text-mismatch.md` 로 기록했다.
- 주의: `check --config hejbro.nile.config.ts` 로는 preset 이 닿지 않는다(`--config` 무시, `2026-09-04-config-flag-ignored-by-live-commands.md`). 위 결과는 preset 설정을 `hejbro.config.ts` 로 둔 작업 디렉터리에서 얻었다.
- `status` 는 `posted` 로 유지한다(재현의 마지막 단계가 아직 실패한다).
