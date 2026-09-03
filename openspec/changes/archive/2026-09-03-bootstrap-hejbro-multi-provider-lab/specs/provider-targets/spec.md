## Purpose

Neon, Nile, Supabase, 순정 Postgres 네 provider를 이름으로 선택해 같은 마이그레이션 체인에 hejbro 명령을 실행하는 방식과, 설정되지 않은 타깃을 다루는 규칙을 정한다.

## ADDED Requirements

### Requirement: 타깃 이름과 환경 변수의 대응이 고정되어 있다
The system SHALL define exactly four target names — `neon`, `nile`, `supabase`, `postgres` — and SHALL read each target's connection string from its own environment variable: `NEON_DATABASE_URL`, `NILE_DATABASE_URL`, `SUPABASE_DATABASE_URL`, `POSTGRES_DATABASE_URL`.

#### Scenario: 타깃 이름으로 명령을 실행한다
- **WHEN** 사용자가 `pnpm target supabase status`를 실행한다
- **THEN** `SUPABASE_DATABASE_URL`의 접속 정보로 hejbro `status`가 실행된다

#### Scenario: 알 수 없는 타깃은 거부된다
- **WHEN** 사용자가 `pnpm target planetscale status`를 실행한다
- **THEN** 명령은 0이 아닌 코드로 종료하고 유효한 타깃 이름 네 개를 나열한다

### Requirement: 설정되지 않은 타깃은 값을 노출하지 않고 안내한다
The system SHALL exit with a non-zero code when the selected target's environment variable is missing or empty, SHALL name the variable to fill, and MUST NOT print any environment variable value.

#### Scenario: 변수가 비어 있다
- **WHEN** `NILE_DATABASE_URL`이 설정되지 않은 채 `pnpm target nile migrate`를 실행한다
- **THEN** 출력은 `NILE_DATABASE_URL`을 `.env`에 채우라고 안내하고, 다른 변수의 값도 출력하지 않는다

### Requirement: 타깃 설정 상태를 한눈에 보여 준다
The system SHALL provide a `doctor` command that reports, for each of the four targets, whether its variable is set and whether a connection succeeds, without printing any credential.

#### Scenario: 일부만 설정된 상태
- **WHEN** `POSTGRES_DATABASE_URL`만 설정된 상태에서 `pnpm target doctor`를 실행한다
- **THEN** `postgres`는 설정됨·연결 성공(또는 실패 사유)으로, 나머지 세 타깃은 미설정으로 표시된다

### Requirement: 순정 Postgres 타깃을 로컬에서 띄울 수 있다
The system SHALL provide a command that starts a local Postgres 18 instance whose connection string matches the committed `.env.example` default for `POSTGRES_DATABASE_URL`, and the command SHALL be idempotent.

#### Scenario: 처음 실행
- **WHEN** 로컬 인스턴스가 없는 상태에서 `pnpm local-pg up`을 실행한다
- **THEN** Postgres 18이 기동되고, 예시 파일의 기본 `POSTGRES_DATABASE_URL`로 연결이 성공한다

#### Scenario: 이미 실행 중
- **WHEN** 인스턴스가 이미 실행 중인 상태에서 `pnpm local-pg up`을 다시 실행한다
- **THEN** 오류 없이 종료하고 인스턴스는 하나만 유지된다

### Requirement: 모든 타깃은 같은 마이그레이션 체인을 사용한다
The system SHALL apply the single committed migration chain to every target; there SHALL be no target-specific migration file.

#### Scenario: 두 타깃에 같은 파일이 적용된다
- **WHEN** `neon`과 `postgres` 타깃에 각각 `migrate`를 실행한다
- **THEN** 두 타깃의 ledger는 동일한 마이그레이션 파일 목록과 해시를 기록한다
