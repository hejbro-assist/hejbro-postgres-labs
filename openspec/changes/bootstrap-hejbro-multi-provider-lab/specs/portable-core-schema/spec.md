## Purpose

네 provider가 모두 받아들이는 "portable core" 샘플 스키마의 범위를 정하고, 그 스키마가 네 타깃 모두에서 마이그레이션과 검증을 통과해야 한다는 요구사항을 둔다.

## ADDED Requirements

### Requirement: 샘플 스키마는 공통 분모 객체만 선언한다
The system SHALL declare the sample schema using only object kinds every target accepts — schema, table, column, primary key, foreign key, CHECK constraint, index — and MUST NOT declare RLS, functions, triggers, roles, grants, or views in this change.

#### Scenario: Nile preset 검증을 통과한다
- **WHEN** Nile preset을 등록한 설정으로 선언을 컴파일한다
- **THEN** `nile-rls-unsupported`나 `nile-function-unsupported` 오류 없이 성공한다

### Requirement: 테넌트 열을 갖는다
The system SHALL give every sample table a `tenant_id uuid NOT NULL` column so that Nile treats the table as tenant-aware and the other providers treat it as an ordinary column.

#### Scenario: 테이블 정의
- **WHEN** 생성된 마이그레이션 SQL을 읽는다
- **THEN** 모든 `create table` 문에 `"tenant_id" uuid not null`이 포함된다

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
The system SHALL record, for each target, the hejbro version, the provider's Postgres major version, and the migrate/check outcome in a committed results table.

#### Scenario: 결과 표가 갱신된다
- **WHEN** 네 타깃에 대한 적용이 끝난다
- **THEN** 저장소의 결과 표에 네 행이 있고 각 행에 hejbro 버전, Postgres 버전, 결과가 적혀 있다
