## Purpose

provider 접속 정보(사용자명·비밀번호가 담긴 접속 문자열)가 저장소 이력, 명령 출력, CI 로그, 코딩 에이전트의 컨텍스트 어디에도 평문으로 남지 않도록 보장한다.

## ADDED Requirements

### Requirement: 접속 정보는 로컬 환경 파일에만 존재한다
The system SHALL keep every provider connection string only in a local environment file (`.env`) that git ignores, and SHALL commit only an example file that contains variable names and placeholder values.

#### Scenario: .env 파일은 추적되지 않는다
- **WHEN** 작업 트리에 `.env` 파일이 존재하는 상태에서 `git status`를 실행한다
- **THEN** `.env`는 untracked로도 staged로도 나타나지 않는다

#### Scenario: 예시 파일에는 placeholder만 있다
- **WHEN** 커밋된 `.env.example`을 읽는다
- **THEN** 모든 값은 `postgres://USER:PASSWORD@HOST/DB` 같은 placeholder이고, 실제 host·비밀번호는 없다

### Requirement: 커밋 전에 비밀 패턴을 검사한다
The system SHALL scan staged files before every commit and MUST refuse the commit when any staged content contains a connection string with an embedded password or another recognized secret pattern.

#### Scenario: 접속 문자열이 든 파일의 커밋이 거부된다
- **WHEN** `postgres://alice:s3cret@ep-x.neon.tech/db` 문자열이 포함된 파일을 stage하고 커밋한다
- **THEN** 커밋은 실패하고, 출력은 문제 파일과 줄 번호를 가리킨다

#### Scenario: placeholder는 통과한다
- **WHEN** `.env.example`처럼 placeholder만 있는 파일을 stage하고 커밋한다
- **THEN** 커밋은 성공한다

### Requirement: 명령 출력에서 접속 정보를 마스킹한다
The system SHALL never print a password to stdout or stderr from any repository script, and SHALL identify a target only by its name and host when reporting.

#### Scenario: 타깃 상태 출력에 비밀번호가 없다
- **WHEN** 접속 정보가 설정된 타깃에 대해 상태 조회 명령을 실행한다
- **THEN** 출력에는 타깃 이름과 host만 나타나고 `:<password>@` 형태는 나타나지 않는다

#### Scenario: 연결 실패 메시지에도 비밀번호가 없다
- **WHEN** 잘못된 비밀번호로 타깃에 연결을 시도한다
- **THEN** 오류 메시지에 비밀번호 값이 포함되지 않는다

### Requirement: 코딩 에이전트는 환경 파일을 읽을 수 없다
The system SHALL configure the repository so that a coding agent's file-reading tool is denied access to `.env`.

#### Scenario: 에이전트의 .env 읽기가 거부된다
- **WHEN** 코딩 에이전트가 저장소의 `.env`를 읽으려 한다
- **THEN** 읽기는 거부되고 파일 내용은 에이전트 컨텍스트에 들어가지 않는다

### Requirement: CI에서 저장소 전체를 검사한다
The system SHALL run a secret scan over all committed files in CI and MUST fail the workflow when a secret pattern is found; GitHub push protection SHALL remain enabled on the repository.

#### Scenario: CI가 유출을 잡는다
- **WHEN** 접속 문자열이 포함된 커밋이 pre-commit 훅을 우회해 push된다
- **THEN** CI 워크플로우는 secret scan 단계에서 실패한다
