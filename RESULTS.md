# 적용 결과

`src/lab.schema.ts` 의 선언과 마이그레이션 체인(`migrations/0001`~`0009`)을 네 타깃에 적용한 기록. 최신은 hejbro `0.2.0-pre.1`(2026-09-04). pre.0 결과는 맨 아래 "이력"에 있다.

## 타깃별 요약 (hejbro 0.2.0-pre.1, 2026-09-04)

| 타깃 | Postgres | migrate (0001~0009) | check | reset → 전체 재적용 | smoke | 비고 |
|---|---|---|---|---|---|---|
| postgres | 18.6 (`postgres:18-alpine`) | exit 0, 9개 적용 | exit 0, no differences | reset exit 0 (5객체) → 9개 재적용 → check 0 → smoke 0 | exit 0, 12단계 통과 | 컨테이너를 새로 띄워 pre.1로 처음부터 적용 |
| neon | 18.6 (ap-southeast-1) | exit 0 (pre.0 ledger 2개 위에 7개) | exit 0, no differences | reset exit 0 → 9개 → 0 → 0 | exit 0 | pre.0 ledger를 pre.1이 그대로 이어받음 |
| supabase | 17.6 (ap-northeast-2, session pooler) | exit 0 (2+7) | exit 0, no differences | reset exit 0 → 9개 → 0 → 0 | exit 0 | `supabasePreset` 작업 디렉터리에서 실행. `check`가 storage bucket은 비교하지 않는다고 안내 |
| nile | 15.19 (us-west-2) | **exit 1**, `0003`에서 42P01 (0001·0002만 적용) | **exit 1/2** (0003 이후 객체 없음 + `in (...)` CHECK 비교 불가) | reset **exit 1** `reset-drop-failed (42704)`: 선언은 됐지만 DB에 없는 enum을 드롭하려다 롤백. 전체 재적용은 0003에서 다시 멈춤 | **exit 1** `assert-schema-diverged` 9건에서 정지 | 아래 "Nile" 절 참고 |

명령: `pnpm target <t> migrate|check|status|reset|smoke`. nile·supabase는 `hejbro.<t>.config.ts`의 preset을 보도록 `.hejbro-target/<t>/`에서 실행된다(`scripts/provider-workdir.ts`). 리셋은 `pnpm target <t> reset` → 안내된 `--confirm-drop <db>:<n>`으로 한다. 직접 `drop schema`는 쓰지 않는다.

## 마이그레이션 파일별 수용 여부

| 파일 | 경로 | postgres | neon | supabase | nile |
|---|---|---|---|---|---|
| 0001_add_lab | 스키마, 테이블, 복합 PK, CHECK, partial index (raw 텍스트 술어) | ok | ok | ok | ok |
| 0002_add_tasks | 복합 FK on delete cascade, CHECK 2건, 복합 인덱스 | ok | ok | ok | ok |
| 0003_requalify_expressions | CHECK·술어를 열 보간으로 (drop+add constraint, index 재생성, 2단계 참조 `"projects"."name"`) | ok | ok | ok | **42P01** `missing FROM-clause entry for table "projects"` (partial index 술어의 2단계 참조) |
| 0004_add_priority_and_metadata | `create type … as enum`, enum 열 + default, jsonb 열 + default, GIN `jsonb_path_ops`, 표현식 unique partial 인덱스 | ok | ok | ok | 미적용 (0003에서 정지). 직접 SQL 실측: enum 생성 ok, GIN ok, **표현식 인덱스 불가**, **스키마 한정 enum 타입 열 불가** |
| 0005_rename_task_position | `rename column` | ok | ok | ok | 미적용. 직접 SQL: **`this form of ALTER TABLE is not supported`** |
| 0006_rename_project_name | CHECK·표현식 인덱스가 참조하는 열의 `rename column` (drop+add 없음) | ok | ok | ok | 미적용 (위와 같음) |
| 0007_add_urgent_priority | `alter type … add value` (hejbro가 분할한 첫 파일) | ok | ok | ok | 미적용. 직접 SQL: ok |
| 0008_add_urgent_priority | enum 값을 쓰는 partial index (분할된 둘째 파일) | ok | ok | ok | 미적용 |
| 0009_add_open_tasks_view | join view (본문은 3단계 참조) | ok | ok | ok | 미적용. 직접 SQL: **ok** (#772의 view 항목은 Nile에서 통과) |

## smoke (쿼리 레이어) 단계

`pnpm target <t> smoke` (`scripts/smoke.ts`). postgres·neon은 `pgDriver`, supabase는 `supabaseDriver(pgDriver)`, nile은 `nileDriver(pgDriver)` + `asTenant` 컨텍스트 provider.

| 단계 | 내용 | postgres / neon / supabase |
|---|---|---|
| assertSchema | 선언 5개 비교, 비교 불가 0 | ok |
| insertProject / insertTasks | returning, 다중 행 insert | 1 / 2 rows |
| upsertTask | `onConflictDoUpdate` (복합 PK) | title 갱신 확인 |
| joinSelect | `innerJoin` + `and(eq, eq)` + `orderBy` (enum 열 읽기 `normal/urgent`) | 2 rows |
| nestedRead | `jsonArrayFrom` 상관 서브쿼리, jsonb 열 `{}` | 2 nested |
| viewSelect | raw `sql`로 view 조회 | 2 rows |
| nestedRollback | `tx.transaction` 안 CHECK 위반 → 23514, 바깥 트랜잭션 유지 | ok |
| deleteProjectCascade / countAfterCascade | FK cascade | 1 / 0 |

Nile은 체인이 0003에서 막혀 `assertSchema`가 `assert-schema-diverged`(9건)로 멈춘다(설계대로 데이터 단계는 실행되지 않음). `nileDriver` + `asTenant` 경로는 0001·0002 상태를 선언한 일회성 스크립트로 따로 측정했다. 결과는 아래 "Nile" 절.

## #750 재검증 (pre.0에서 보고한 5건)

| # | 항목 | hejbro 추적 | pre.1 결과 | finding |
|---|---|---|---|---|
| 1 | `verify`가 preset 검증기 미실행 | #752 | **해결**. 검사 5→6, `tenant_id` 없는 PK로 `nile-tenant-primary-key-missing` exit 1. 단 `--config`는 여전히 무시(아래 신규 1) | `2026-09-03-verify-skips-preset-validators.md` resolved |
| 2 | `reset` FK 순서 | #753 | **해결**. `tasks → projects → schema` 순으로 드롭, exit 0, ledger 비움. 네 타깃 중 셋에서 view·enum 포함 5객체 reset 통과 | `2026-09-03-reset-drops-referenced-table-first.md` resolved |
| 3 | Nile 3단계 열 참조 42622 | #754 | **해결(CHECK)**. 2단계 렌더링, 42622 사라짐. 그러나 partial index 술어의 2단계 참조는 42P01(아래 신규 2) | `2026-09-03-nile-rejects-qualified-column-refs.md` resolved |
| 4 | Nile `check` EXPLAIN | #755 | **부분**. text 비교 모드로 2/3 일치, `in (...)`은 비교 불가로 exit 2 유지(아래 신규 3) | `2026-09-03-check-cannot-compare-checks-on-nile.md` posted 유지 |
| 5 | `skills add`가 내부 스킬 설치 | #756/#771 → #834 | **미해결**. README만 `-s hejbro`로 바뀌었고 `-s` 없이 실행하면 여전히 내부 스킬 7개를 덮어씀. skills CLI의 `metadata.internal: true`가 숨김 수단임을 측정해 #834로 다시 올림 | `2026-09-03-skills-add-installs-internal-skills.md` posted 유지 |

## 신규 발견 (0.2.0-pre.1)

1. `verify`·`check`·`migrate`·`status`·`reset`이 `--config`를 조용히 무시(hejbro #819와 같은 사실, `migrate`·`status` 추가) — `findings/2026-09-04-config-flag-ignored-by-live-commands.md`
2. Nile: partial index 술어의 2단계 참조 42P01 — `findings/2026-09-04-nile-rejects-two-part-refs-in-index-predicates.md`
3. Nile: text 비교 모드가 `in (...)`과 `= ANY(ARRAY[...])`를 일치시키지 못함 — `findings/2026-09-04-nile-check-in-list-text-mismatch.md`
4. Nile 플랫폼 제한(표현식 인덱스, 열 rename, 스키마 한정 타입 이름, 오류 뒤 savepoint 복구)을 `nilePreset`/`nileDriver`가 미리 거르거나 선언하지 못함 — `findings/2026-09-04-nile-preset-misses-platform-limits.md`
5. `reset`이 선언됐지만 DB에 없는 객체(부분 적용 체인) 때문에 실패 — `findings/2026-09-04-reset-fails-on-partially-applied-chain.md`

## Nile 상세 (직접 SQL 실측, PG 15.19, 2026-09-04)

tenant-aware = `tenant_id uuid` 열이 있는 테이블. 스크래치 스키마 `labx`에서 측정 후 객체를 하나씩 드롭했다(`DROP … CASCADE` 불가).

| 문장 | tenant-aware | plain |
|---|---|---|
| CHECK 안 2단계 참조 `"projects"."title"` | ok | ok |
| partial index 술어 2단계 참조 | **42P01 missing FROM-clause entry** | ok |
| partial index 술어 열 이름만 | ok | ok |
| 표현식 인덱스 `(lower("title"))` (2단계든 열 이름이든) | **functions are not supported in index column expression** | 같은 오류 |
| GIN `("metadata" jsonb_path_ops)` | ok | - |
| `create type … as enum`, `alter type … add value` | ok | - |
| enum 열 타입을 스키마 한정으로 (`"labx"."prio"`, `"public"."prio_pub"`) | **schema "labx" does not exist / type "public.prio_pub" does not exist** | 같은 오류 |
| enum 열 타입을 이름만으로 (search_path `public, users, _nile_shared, extensions`) | ok | - |
| `'a'::"labx"."prio"` 캐스트 | schema "labx" does not exist | - |
| `alter table … rename column` | **this form of ALTER TABLE is not supported** | 같은 오류 |
| `drop constraint` + `add constraint` (0003 형태) | ok | - |
| `drop index` + `create index` (열 이름 술어) | ok | - |
| `create or replace view` 본문의 3단계 참조 (hejbro 렌더링 그대로) | ok | - |
| `savepoint` → 오류 → `rollback to savepoint` | **25P01 current transaction is aborted** | 같은 오류 |
| `savepoint` → (오류 없음) → `rollback to savepoint` | ok | - |
| `create temporary table` | - | **not supported** |
| join select의 3단계 참조 | ok (테넌트 컨텍스트 없이). 컨텍스트가 있으면 테넌트가 등록돼 있어야 함 | - |

hejbro 쪽 함의: `nilePreset`은 표현식 인덱스·enum 열·rename을 generate 시점에 거르지 않는다(finding 4). 렌더러는 인덱스 술어의 열 참조를 Nile에서는 열 이름만으로 내야 한다(finding 2). #772의 view·join 항목은 Nile에서 통과했다.

### Nile 쿼리 레이어 (일회성 스크립트, 0001·0002 상태 선언)

`nileDriver(pgDriver)` + `db(schema, driver, { context: () => asTenant(id) })` 로 0001·0002 상태(projects.name, tasks.position)를 선언한 스크립트(`.hejbro-target/nile-query-witness.ts`, 커밋하지 않음).

| 단계 | 결과 |
|---|---|
| 컨텍스트 없는 select | `context-required` 로 즉시 거부 (설계대로) |
| 테넌트 등록 (`driver.execute`, 컨텍스트 없이) | ok |
| insert project / 2행 insert (한 테넌트) | ok |
| join select — 렌더링 `select "lab"."tasks"."id" … from "lab"."tasks" inner join "lab"."projects" on …` (3단계 참조) | **ok**, 2행 (#772의 query 항목: Nile 통과) |
| 전체 테이블 projection + join (17f5495 스키마 한정 렌더링) | ok |
| 중첩 트랜잭션 안 CHECK 위반 → savepoint 롤백 | **실패** `savepoint-rollback-failed` (cause `query-execution-failed`). 이후 바깥 트랜잭션은 25P01 로 모두 실패 |

직접 SQL로 재현: `begin; savepoint s; <CHECK 위반 insert>; rollback to savepoint s` → `25P01 current transaction is aborted` (tenant-aware·plain 모두). 오류 없이 `rollback to savepoint` 만 하면 통과한다. 즉 **Nile은 오류 뒤의 savepoint 복구를 지원하지 않는다.** hejbro 의 `tx.transaction()` 오류 격리 계약은 Nile 에서 성립하지 않는다(finding 4에 항목 추가).

### Nile reset (0001·0002 선언으로)

`.hejbro-target/nile-old/`에 pre.0 시점(481fdb0)의 선언·스냅샷·0001·0002 를 두고 실행. `reset` → `table:lab.tasks, table:lab.projects, schema:lab` 3객체 → `--confirm-drop …:3` → **exit 0**, `lab` 스키마 없음, ledger 비움. `CASCADE` 없이 테이블→스키마 순으로 드롭돼 Nile 에서도 #753 픽스가 동작한다. 이어서 `migrate` 로 0001·0002 를 다시 적용했다(현재 Nile 상태).

## 이력

### hejbro 0.2.0-pre.0 (2026-09-03)

| 타깃 | Postgres | migrate | check | 재migrate | 비고 |
|---|---|---|---|---|---|
| postgres | 18.6 | exit 0, 2개 적용 | exit 0 | nothing to apply | 체인 v3(복합 PK, raw 술어) |
| nile | 15.19 | exit 0, 2개 적용 | exit 2, CHECK 3건 비교 불가 (`command tag EXPLAIN unhandled`) | nothing to apply | 체인 v1은 42P17, v2는 42622로 거부 |
| supabase | 17.6 | exit 0, 2개 적용 | exit 0 | nothing to apply | session pooler + `sslrootcert` |
| neon | 18.6 | exit 0, 2개 적용 | exit 0 | nothing to apply | direct 접속 |

체인 이력: v1 `id uuid primary key` + 열 보간 → nile 42P17. v2 PK `(tenant_id, id)` → nile 42622(3단계 참조). v3 raw 술어 → 세 타깃 통과, nile check만 exit 2. 리셋은 `hejbro reset`이 FK 순서 문제로 실패해 `drop schema … cascade` + ledger delete로 했다(pre.1에서 `reset`으로 교체).

## pg 드라이버 SSL 경고

`sslmode=require`를 pg-connection-string이 `verify-full`로 취급한다는 예고 경고. 동작에는 영향 없음.
