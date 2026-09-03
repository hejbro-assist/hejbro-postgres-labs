---
title: hejbro verify --config 는 preset 검증기를 돌리지 않아 provider 호환성 게이트로 쓸 수 없다
hejbro_version: 0.2.0-pre.0
provider: nile
kind: improvement
status: draft
discussion: 
---

## 요약

같은 선언에 대해 `hejbro generate --config hejbro.nile.config.ts` 는 `nile-tenant-primary-key-missing` 으로 거부하는데, `hejbro verify --config hejbro.nile.config.ts` 는 "5 checks passed" 로 통과한다. verify 는 스냅샷·체인 일관성만 보고 preset 의 validator 는 실행하지 않는 것으로 보인다. 그래서 "이 선언이 Nile 에서 받아들여지는가" 를 CI 에서 DB 없이 묻는 용도로 verify 를 쓰면 실제 `migrate` 에서야 플랫폼 오류(42P17)를 만난다.

## 재현 절차

1. `hejbro.config.ts`(presets: []) 로 `tenant_id uuid not null` 열과 `id uuid primary key` 만 있는 테이블을 선언하고 `hejbro generate` 로 체인을 만든다.
2. entry·migrationsDir·snapshotPath 는 같고 `presets: [nilePreset]` 만 다른 `hejbro.nile.config.ts` 를 둔다.
3. `hejbro verify --config hejbro.nile.config.ts` 를 실행한다.
4. `hejbro generate --config hejbro.nile.config.ts` 를 실행한다.

## 기대 결과

3 과 4 가 같은 판정을 내린다. 최소한 verify 가 preset 검증기의 오류를 보고하거나, 문서에 "preset 검증은 generate 에서만 일어난다" 가 명시된다.

## 실제 결과

- 3: `verify: 5 checks passed (2 migrations, snapshot sha256:…)` exit 0
- 4: `error[nile-tenant-primary-key-missing]: lab.projects … Next: include tenant_id in the primary key.` exit 1
- 실제 Nile 에 `hejbro migrate` 하면 `applying "0001_add_lab.sql" failed (42P17): primary key of tenant-aware table must have the "tenant_id" column`

## 제안

- `verify` 에 등록된 preset 의 validator 를 실행하는 여섯 번째 검사를 추가하거나,
- `hejbro generate --check`(파일을 쓰지 않는 dry-run) 같은 명령을 두어 CI 에서 preset 호환성만 물을 수 있게 하거나,
- 위 둘이 의도가 아니라면 `references/generate-verify-workflow.md` 에 "verify 는 preset 검증을 하지 않는다" 를 적어 주면 좋겠다.

## 환경

- Nile: PostgreSQL 15.19, us-west-2
- 관련 파일: `hejbro.nile.config.ts`, `src/lab.schema.ts`
