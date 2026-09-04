# query-layer-smoke Specification

## Purpose
hejbro의 쿼리 레이어(`db()` 핸들, provider 드라이버, `assertSchema`, 트랜잭션, 관계 읽기)가 네 타깃에서 실제로 동작하는지 한 명령으로 실측하고, 실패 시 어느 층이 원인인지 드러나게 한다.

## Requirements

### Requirement: 타깃 이름으로 쿼리 레이어 실측을 실행한다
The system SHALL provide `pnpm target <name> smoke` that builds a typed query handle from the committed declarations using the connection string of the named target, and SHALL choose the driver decoration by target: plain for `postgres` and `neon`, the Nile decoration with a tenant context for `nile`, and the Supabase decoration (session endpoint) for `supabase`. The command MUST NOT print any credential.

#### Scenario: 타깃별 드라이버 선택
- **WHEN** `pnpm target nile smoke`를 실행한다
- **THEN** 모든 실행 문장은 테넌트 컨텍스트 아래에서 실행되고, 출력에는 타깃 이름과 host만 나타난다

#### Scenario: 알 수 없는 타깃
- **WHEN** `pnpm target planetscale smoke`를 실행한다
- **THEN** 명령은 0이 아닌 코드로 종료하고 유효한 타깃 이름 네 개를 나열한다

### Requirement: 실측은 선언과 데이터베이스의 일치를 먼저 단언한다
The system SHALL call `assertSchema` on the handle before any data statement and SHALL report the number of compared and not-compared identities. When the assertion fails the command SHALL print the failure `code` and every finding, and SHALL exit non-zero without running data statements.

#### Scenario: 일치하는 타깃
- **WHEN** 체인이 전부 적용된 타깃에 `smoke`를 실행한다
- **THEN** 비교된 선언 수가 출력되고 비교 불가 선언은 0건이다

#### Scenario: 마이그레이션이 덜 적용된 타깃
- **WHEN** 마지막 마이그레이션이 적용되지 않은 타깃에 `smoke`를 실행한다
- **THEN** `assert-schema-diverged` 코드와 어긋난 선언 이름이 출력되고 데이터 문장은 실행되지 않는다

### Requirement: 실측은 쓰기·읽기·정리를 한 트랜잭션 묶음으로 수행한다
The system SHALL, inside one transaction, insert one project and two tasks, upsert one of the tasks by its primary key, read the tasks joined to their project and as nested rows, run a nested transaction that is rolled back on purpose, delete the project and confirm the tasks are gone by cascade, and SHALL leave no row behind on success. Each step SHALL print a one-line result with the row count or the returned value.

#### Scenario: 정상 실행
- **WHEN** 체인이 전부 적용된 타깃에 `smoke`를 실행한다
- **THEN** 모든 단계가 기대 행 수를 출력하고, 종료 후 실측이 만든 행은 남아 있지 않으며, exit 0으로 끝난다

#### Scenario: 중첩 트랜잭션 롤백
- **WHEN** 중첩 트랜잭션 안에서 CHECK를 위반하는 insert를 시도한다
- **THEN** 중첩 트랜잭션만 롤백되고, 바깥 트랜잭션의 이전 insert는 유지된 채 다음 단계가 계속된다

### Requirement: 실측은 타깃별로 필요한 준비와 정리를 한다
The system SHALL, on the `nile` target, register the test tenant in the platform's tenant registry before inserting and remove it afterwards, and SHALL use one tenant id for every statement.

#### Scenario: Nile 테넌트 등록
- **WHEN** `pnpm target nile smoke`를 실행한다
- **THEN** 실측 전에 테넌트가 등록되고 실측 후에 제거되어, 실행 전후의 테넌트 수가 같다

### Requirement: 실패는 원인 층이 드러나게 보고한다
The system SHALL print, for any failed step, the step name, the error `code` when present, and the database's own SQLSTATE and message when present, and SHALL exit with a non-zero code.

#### Scenario: provider가 문장을 거부한다
- **WHEN** 어떤 단계의 SQL을 provider가 거부한다
- **THEN** 출력에는 단계 이름, SQLSTATE, 서버 메시지가 나타나고 exit 코드는 0이 아니다
