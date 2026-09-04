---
title: hejbro reset 이 선언은 됐지만 DB 에 없는 객체를 드롭하려다 실패해, 체인이 중간까지만 적용된 데이터베이스를 되돌리지 못한다
hejbro_version: 0.2.0-pre.1
provider: nile
kind: bug
status: draft
discussion: 
---

## 요약

`reset` 은 드롭 목록을 현재 선언에서 만든다. 체인 9개 중 2개만 적용된 Nile(0003 이 provider 오류로 거부된 상태)에서 `reset --confirm-drop` 은 아직 만들어진 적 없는 `lab.task_priority` enum 을 드롭하려다 `42704` 로 실패하고 전체를 롤백한다. 즉 provider 가 파일 하나를 거부한 바로 그 상황 — 리셋이 가장 필요한 상황 — 에서 리셋이 안 된다. 롤백과 ledger 보존 자체는 pre.1 의 약속대로 동작했다.

## 재현 절차

1. 체인 `0001`~`0009`(enum·view 포함) 중 `0001`·`0002` 만 적용된 데이터베이스를 만든다. 이 저장소에서는 Nile 이 `0003` 을 42P01 로 거부해 자연히 그 상태가 된다. (다른 provider 라면 `0002` 까지 migrate 한 뒤 선언만 확장해도 같다.)
2. `hejbro reset` → `reset would drop 5 declared object(s) …: view:lab.open_tasks, table:lab.tasks, table:lab.projects, enum:lab.task_priority, schema:lab`.
3. `hejbro reset --confirm-drop <db>:5`.

## 기대 결과

존재하는 객체(`lab.tasks`, `lab.projects`, `lab` 스키마)를 드롭하고 ledger 를 비운다. 드롭 대상은 선언이 아니라 카탈로그에 실제로 있는 것(또는 `drop … if exists`)이어야 한다. 최소한 확인 메시지의 객체 수가 "실제로 드롭할 수 있는 것" 이어야 한다.

## 실제 결과

```
error[reset-drop-failed]: hejbro reset
  hejbro reset failed to drop your declared objects (42704): type "lab.task_priority" does not exist. The transaction was rolled back — nothing was dropped and the ledger is unchanged. Next: run `hejbro status` to confirm, resolve what the error above describes, then rerun `hejbro reset`.
```
`status` 는 그대로 2 applied / 7 pending. 이후 `migrate` 는 다시 `0003` 에서 멈춘다. (view 는 `drop view` 가 존재하지 않는 객체에 대해 먼저 실행됐을 텐데 오류가 enum 에서 났다 — 드롭 순서가 view → table → enum → schema 이고 view 드롭은 `if exists` 이거나 view 가 enum 보다 늦게 처리되는지는 확인하지 못했다.)

## 환경

- Nile: PostgreSQL 15.19, us-west-2. 같은 `reset` 은 체인이 전부 적용된 Postgres 18.6·Neon·Supabase 에서 exit 0
- 관련 hejbro 이슈: #753 (닫힘), #797
