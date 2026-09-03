# 적용 결과

portable core 스키마(`src/lab.schema.ts`, 마이그레이션 2개)를 네 타깃에 적용한 기록.

| 타깃 | hejbro | Postgres | migrate | check | 재migrate | 비고 |
|---|---|---|---|---|---|---|
| postgres | 0.2.0-pre.0 | 18.6 (`postgres:18-alpine`) | exit 0, 2개 적용 | exit 0, no differences | nothing to apply | 2026-09-03. 체인 v3(복합 PK, raw 술어) 기준 |
| nile | 0.2.0-pre.0 | 15.19 (us-west-2) | exit 0, 2개 적용 | **exit 2**, CHECK 3건 비교 불가 (`command tag EXPLAIN unhandled`) | nothing to apply | 2026-09-03. 체인 v1은 PK에 tenant_id 없음(42P17), v2는 3단계 열 참조(42622)로 거부. findings 참고 |
| supabase | 0.2.0-pre.0 | | | | | |
| neon | 0.2.0-pre.0 | 18.6 (aarch64, ap-southeast-1) | exit 0, 2개 적용 | exit 0, no differences | nothing to apply | 2026-09-03. direct(non-pooled) 접속, sslmode=require. 체인 v3 기준. pg 드라이버 SSL 경고 1건 |

## 체인 이력

| 버전 | 내용 | 결과 |
|---|---|---|
| v1 | `id uuid primary key` + `tenant_id` 열, CHECK/partial index 는 열 참조 보간 | postgres·neon 통과, nile 42P17 (PK 에 tenant_id 필요) |
| v2 | PK `(tenant_id, id)`, FK `(tenant_id, project_id)` | postgres·neon 통과, nile 42622 (3단계 열 참조) |
| v3 | v2 + CHECK/술어를 raw sql(열 이름만)로 | 세 타깃 migrate 통과. nile 은 check 만 exit 2 |

리셋은 `hejbro reset` 이 FK 순서 문제로 실패해 `pnpm target <t> sql "drop schema lab cascade; delete from hejbro.migration_ledger"` 로 했다. Nile 은 `DROP … CASCADE` 를 지원하지 않는다.

## pg 드라이버 SSL 경고

`sslmode=require` 를 pg-connection-string 이 `verify-full` 로 취급한다는 예고 경고. 동작에는 영향 없음.
