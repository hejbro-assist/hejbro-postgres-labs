## ADDED Requirements

### Requirement: 보고한 발견 사항은 새 버전에서 재검증한다
The system SHALL, when a hejbro version that claims to fix a reported finding is adopted, re-run that finding's reproduction on the same provider and record the outcome in the finding file: `status: resolved` plus a `resolved_in: <version>` field when the reproduction no longer fails, or an appended section naming the version and the still-failing step when it does. `pnpm finding validate` SHALL accept `resolved_in` as an optional field and SHALL require it when `status` is `resolved`.

#### Scenario: 해결 확인
- **WHEN** 0.2.0-pre.0에서 기록한 재현 절차를 0.2.0-pre.1로 다시 실행해 기대 결과가 나온다
- **THEN** 파일의 `status`는 `resolved`, `resolved_in`은 `0.2.0-pre.1`이고 본문에 재검증 절이 있다

#### Scenario: 해결 안 됨
- **WHEN** 같은 재현이 여전히 실패한다
- **THEN** `status`는 `posted`로 남고, 본문에 버전과 실패 단계가 적힌 재검증 절이 추가된다

#### Scenario: resolved에 버전이 없다
- **WHEN** `status: resolved`인데 `resolved_in`이 비어 있는 파일을 검증한다
- **THEN** 검증은 실패하고 `resolved_in`을 지목한다

### Requirement: preset 호환성 게이트는 verify가 담당한다
The system SHALL gate provider-preset compatibility in CI with `hejbro verify` run under every provider config file (in the provider working directory, since `verify` ignores `--config`), and SHALL fail CI when verify reports a preset validator error.

#### Scenario: 게이트 통과
- **WHEN** CI가 nile과 supabase 설정으로 verify를 실행한다
- **THEN** 두 실행 모두 preset 검증기 검사를 포함해 통과한다

#### Scenario: preset이 거부하는 선언
- **WHEN** tenant-aware 테이블의 PK에서 `tenant_id`를 뺀 선언으로 nile 설정 verify를 실행한다
- **THEN** verify는 `nile-tenant-primary-key-missing`을 출력하고 0이 아닌 코드로 끝난다
