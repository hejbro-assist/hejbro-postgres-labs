## Purpose

hejbro를 써 보며 발견한 버그, 개선점, 기능 요청, 적용 사례를 저장소에 기록하고 hejbro 저장소의 Discussions에 올리는 형식과 절차를 정한다.

## ADDED Requirements

### Requirement: 발견 사항은 한 건당 파일 하나로 기록한다
The system SHALL store each finding as one Markdown file under `findings/`, named `YYYY-MM-DD-<slug>.md`, with frontmatter that carries: `title`, `hejbro_version`, `provider`, `kind`, `status`, `discussion`. `kind` SHALL be one of `bug`, `improvement`, `feature`, `question`, `showcase`. `provider` SHALL be one of the four target names or `all`.

#### Scenario: 유효한 기록
- **WHEN** 필수 필드가 모두 채워진 파일에 대해 `pnpm finding validate <file>`을 실행한다
- **THEN** exit 0으로 끝난다

#### Scenario: 필드 누락
- **WHEN** `hejbro_version`이 빠진 파일에 대해 `pnpm finding validate <file>`을 실행한다
- **THEN** 누락된 필드 이름을 출력하고 0이 아닌 코드로 종료한다

### Requirement: 본문은 재현 가능해야 한다
The system SHALL require the body of a `bug` or `improvement` finding to contain the sections `재현 절차`, `기대 결과`, `실제 결과`.

#### Scenario: 버그 기록에 재현 절차가 없다
- **WHEN** `kind: bug`인 파일에 `재현 절차` 섹션이 없는 상태로 검증한다
- **THEN** 검증은 실패하고 빠진 섹션 이름을 출력한다

### Requirement: 발견 사항을 Discussions에 게시한다
The system SHALL provide a command that posts a finding to the hejbro repository's Discussions, choosing the category from `kind` — `bug`·`question` → Q&A, `improvement`·`feature` → Ideas, `showcase` → Show and tell — and SHALL write the resulting discussion URL back into the file's `discussion` field.

#### Scenario: 첫 게시
- **WHEN** `discussion`이 비어 있는 파일에 대해 `pnpm finding post <file>`을 실행한다
- **THEN** 대응 카테고리에 discussion이 생성되고, 파일의 `discussion` 필드에 그 URL이 기록된다

#### Scenario: 중복 게시 방지
- **WHEN** `discussion`에 URL이 이미 있는 파일에 대해 `pnpm finding post <file>`을 실행한다
- **THEN** 새 discussion을 만들지 않고 기존 URL을 출력하며 종료한다

### Requirement: 게시 본문에 비밀이 없어야 한다
The system SHALL scan the finding body for secret patterns before posting and MUST refuse to post when a connection string with a password or another secret pattern is present.

#### Scenario: 접속 문자열이 본문에 있다
- **WHEN** 본문에 `postgres://u:p@host/db`가 포함된 파일을 게시하려 한다
- **THEN** 게시는 거부되고 문제 위치가 출력된다

### Requirement: 게시 계정
The system SHALL post discussions as the `hejbro-assist` GitHub account.

#### Scenario: 작성자 확인
- **WHEN** 게시된 discussion을 조회한다
- **THEN** 작성자는 `hejbro-assist`다

### Requirement: CI가 기록 형식을 지킨다
The system SHALL validate every file under `findings/` in CI and MUST fail the workflow on an invalid finding.

#### Scenario: 잘못된 기록이 push된다
- **WHEN** 필수 필드가 빠진 finding 파일이 포함된 커밋이 push된다
- **THEN** CI 워크플로우는 findings 검증 단계에서 실패한다
