## Purpose

네 provider가 모두 받아들이는 "portable core" 샘플 스키마의 범위를 정하고, 그 스키마가 네 타깃 모두에서 마이그레이션과 검증을 통과해야 한다는 요구사항을 둔다.

## Requirements

### Requirement: 샘플 스키마는 공통 분모 객체만 선언한다
The system SHALL declare the sample schema using only object kinds every target accepts — schema, table, column, primary key, foreign key, CHECK constraint, index (plain, composite, unique, expression, partial, GIN with an operator class), enum type, jsonb column, view — and MUST NOT declare RLS, functions, triggers, roles, or grants.

#### Scenario: Nile preset 검증을 통과한다
- **WHEN** Nile preset을 등록한 설정으로 선언을 검증한다
- **THEN** `nile-rls-unsupported`, `nile-function-unsupported`, `nile-trigger-unsupported`, `nile-grant-unsupported` 오류 없이 성공한다

#### Scenario: 고급 객체가 체인에 있다
- **WHEN** 커밋된 마이그레이션 체인을 읽는다
- **THEN** `create type ... as enum`, `jsonb` 열, `using gin`, `unique index ... where`, 표현식 인덱스, `alter type ... add value`, `create or replace view`가 각각 한 번 이상 나타난다

### Requirement: 테넌트 열을 갖는다
The system SHALL give every sample table a `tenant_id uuid NOT NULL` column so that Nile treats the table as tenant-aware and the other providers treat it as an ordinary column, and SHALL include `tenant_id` in every sample table's primary key and in every foreign key that references a sample table.

#### Scenario: 테이블 정의
- **WHEN** 생성된 마이그레이션 SQL을 읽는다
- **THEN** 모든 `create table` 문에 `"tenant_id" uuid not null`이 포함되고, 모든 primary key 제약이 `"tenant_id"`로 시작한다

### Requirement: 제약 식은 열을 한정하지 않는다
The system SHALL render column references inside CHECK constraint expressions, index expressions and partial index predicates with at most two parts (`"table"."column"` or a bare column name), never schema-qualified, because Nile rejects three-part references on tenant-aware tables. Declarations SHALL interpolate columns (not raw text) so that a rename retargets the expression.

#### Scenario: CHECK 렌더링
- **WHEN** 생성된 마이그레이션 SQL의 `check (...)`, 표현식 인덱스, `where ...` 절을 읽는다
- **THEN** `"lab"."projects"."name"` 같은 3단계 참조가 없고 `"projects"."name"` 또는 열 이름만 나타난다

#### Scenario: 열 이름 변경이 식에 반영된다
- **WHEN** 식에서 참조하는 열을 `--rename`으로 바꾼 뒤 generate한다
- **THEN** 마이그레이션은 `rename column`만 내고, 식을 위한 drop+add는 내지 않는다

### Requirement: 마이그레이션 체인은 파일 검증을 통과한다
The system SHALL keep `hejbro verify` passing on the committed declarations, migrations, and snapshot.

#### Scenario: 로컬 검증
- **WHEN** `pnpm verify`를 실행한다
- **THEN** 모든 검사가 통과하고 exit 0으로 끝난다

### Requirement: 네 타깃 모두에서 적용과 대조가 통과한다
The system SHALL apply the migration chain to each of the four targets with exit 0, and a subsequent live `check` against each target SHALL return exit 0 (declarations match the catalog).

#### Scenario: 타깃 하나의 적용과 대조
- **WHEN** 비어 있는 타깃에 `pnpm target <name> migrate`를 실행한 뒤 `pnpm target <name> check`를 실행한다
- **THEN** 두 명령 모두 exit 0으로 끝난다

#### Scenario: 재적용은 아무것도 하지 않는다
- **WHEN** 이미 적용된 타깃에 `pnpm target <name> migrate`를 다시 실행한다
- **THEN** 적용할 것이 없다고 보고하며 exit 0으로 끝난다

### Requirement: 결과 기록
The system SHALL record, for each target, the hejbro version, the provider's Postgres major version, and the outcome of migrate, check, reset + fresh migrate, and smoke in a committed results table, and SHALL record per migration file whether each target accepted it.

#### Scenario: 결과 표가 갱신된다
- **WHEN** 네 타깃에 대한 적용이 끝난다
- **THEN** 결과 표에 타깃 네 행과 마이그레이션 파일별 수용 여부 표가 있고, 각 셀에 exit 코드 또는 SQLSTATE가 적혀 있다

### Requirement: 체인은 고급 경로를 파일 하나씩으로 나눈다
The system SHALL add each of the following as its own migration file so that a provider's refusal is attributable to one path: re-qualified expressions, enum + jsonb + GIN + expression unique partial index, a plain column rename, a rename of a column referenced by a CHECK and an index expression, enum value addition used in the same run (which hejbro SHALL split into two files), and a join view.

#### Scenario: enum 값 추가와 사용이 분할된다
- **WHEN** 기존 enum에 값을 추가하고 같은 run에서 그 값을 인덱스 술어에 쓴 뒤 generate한다
- **THEN** 두 개의 마이그레이션 파일이 생성되고, 첫 파일에는 `alter type ... add value`만, 둘째 파일에 술어가 들어간다

#### Scenario: provider가 한 파일을 거부한다
- **WHEN** 어떤 타깃이 체인의 파일 하나를 거부한다
- **THEN** 그 이전 파일까지는 ledger에 적용됨으로 남고, `status`는 거부된 파일부터를 pending으로 보고한다

### Requirement: 다시 세울 수 있다
The system SHALL, after the chain is applied, tear the target down with hejbro's own `reset` and apply the whole chain again from empty with exit 0, so that a full-chain fresh apply is also measured per target.

#### Scenario: 리셋 후 전체 재적용
- **WHEN** 체인이 적용된 타깃에 `pnpm target <name> reset --confirm-drop <db>:<n>`을 실행한 뒤 `migrate`를 실행한다
- **THEN** reset은 exit 0이고 선언한 객체가 모두 사라지며, migrate는 체인의 모든 파일을 적용하고 exit 0으로 끝난다
