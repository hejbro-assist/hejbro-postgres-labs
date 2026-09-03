---
title: hejbro reset 이 FK 로 참조되는 테이블을 먼저 드롭하려다 실패한다
hejbro_version: 0.2.0-pre.0
provider: all
kind: bug
status: draft
discussion: 
---

## 요약

두 테이블 사이에 외래 키(`tasks.project_id → projects.id`)가 있으면 `hejbro reset --confirm-drop` 이 참조되는 쪽(`projects`)을 먼저 드롭하려 해서 Postgres 가 `cannot drop table lab.projects because other objects depend on it` 으로 거부한다. 선언 순서(projects, tasks)를 그대로 따르는 것으로 보이며, 의존 관계의 역순이나 `cascade` 가 필요하다. 순정 Postgres 18 과 Neon(PG 18) 양쪽에서 같은 결과였다.

## 재현 절차

1. 아래처럼 두 테이블을 선언하고 `hejbro generate` 후 `hejbro migrate` 로 적용한다.
   - `lab.projects(id uuid primary key, …)`
   - `lab.tasks(id uuid primary key, project_id uuid not null, …)` + `extras.foreignKeys: [{ columns: [t.projectId], references: { table: projects, columns: [projects.id] }, onDelete: "cascade" }]`
2. `hejbro reset` 을 실행해 확인 문자열을 받는다: `reset would drop 3 declared object(s) … table:lab.projects, table:lab.tasks, schema:lab`
3. `hejbro reset --confirm-drop <db>:3` 을 실행한다.

## 기대 결과

세 객체가 모두 제거되고 exit 0.

## 실제 결과

```
error: cannot drop table lab.projects because other objects depend on it
```

ledger 는 그대로 2건 적용 상태로 남아 있고, 이후 `hejbro status` 도 "nothing pending" 이라 리셋이 절반만 된 상태를 알려 주지 않는다.

## 환경

- Postgres 18.6 (`postgres:18-alpine`), Neon PostgreSQL 18.6
- 확인 문자열의 객체 나열 순서: `table:lab.projects, table:lab.tasks, schema:lab`
