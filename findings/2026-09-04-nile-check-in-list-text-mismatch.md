---
title: text 비교 모드의 check 는 in (...) CHECK 를 카탈로그의 = ANY(ARRAY[...]::text) 와 일치시키지 못해 Nile 에서 여전히 exit 2 다
hejbro_version: 0.2.0-pre.1
provider: nile
kind: improvement
status: draft
discussion: 
---

## 요약

pre.1 의 `explainUnavailable` 경로(#755)는 Nile 에서 CHECK 3건 중 2건(`length(btrim(name)) > 0` 류)을 정규화된 텍스트로 일치시킨다. 그러나 `status in ('todo', 'doing', 'done')` 은 Postgres 가 `(status = ANY (ARRAY['todo'::text, 'doing'::text, 'done'::text]))` 로 저장하므로 정규화 후에도 달라 `check-not-compared` 로 남고 `check` 는 exit 2 다. 오류의 `Next:` 는 선언을 카탈로그 철자(`= ANY (ARRAY[...])`)로 바꾸라고 하는데, 선언이 typed 연산자 `inArray(t.status, [...])` 일 때는 따를 수 없다(렌더링을 사용자가 고를 수 없다).

## 재현 절차

1. `check("tasks_status_allowed", inArray(t.status, ["todo", "doing", "done"]))` 을 선언해 Nile 에 migrate 한다(성공).
2. `nilePreset` 이 등록된 `hejbro.config.ts` 가 있는 디렉터리에서 `hejbro check` 를 실행한다.

## 기대 결과

`in (a, b, c)` 와 `= ANY (ARRAY[a::type, b::type, c::type])` 를 같은 것으로 보는 정규화 단계가 있거나, text 모드에서는 `inArray` 를 카탈로그 철자로 렌더링해 비교한다. 그러면 Nile 에서도 `check: no differences.` 로 exit 0 이 된다.

## 실제 결과

```
check-constraint expressions were compared by normalized text on this run, because a registered preset declares this platform cannot plan a statement -- a spelling difference the server would treat as equal is reported as not compared.
error[check-not-compared]: lab.tasks.tasks_status_allowed
  ... Declared expression: "status in ('todo', 'doing', 'done')". Catalog expression: "(status = ANY (ARRAY['todo'::text, 'doing'::text, 'done'::text]))". Next: restate the declaration to match the catalog's own spelling: (status = ANY (ARRAY['todo'::text, 'doing'::text, 'done'::text]))
check: could not answer -- 1 declared object(s) could not be compared.   (exit 2)
```

## 환경

- Nile: PostgreSQL 15.19, us-west-2. 같은 선언은 Postgres 18.6·Neon·Supabase 의 서버 비교 경로에서 `no differences`
- 관련 hejbro 이슈: #755 (닫힘), #782 (서버가 붙이는 캐스트 계열)
