## ADDED Requirements

### Requirement: provider 설정 파일로 hejbro 명령을 실행한다
The system SHALL, when running a hejbro command for a target, make hejbro load `hejbro.<target>.config.ts` if that file exists, and SHALL print which config file was used. Because hejbro's live commands read only the `hejbro.config.ts` in their working directory, the system SHALL run them in a git-ignored working directory that holds a copy of the provider config under that name and links to the repository's declarations, migrations, snapshot and certificates.

#### Scenario: Nile은 preset 설정으로 check한다
- **WHEN** `pnpm target nile check`를 실행한다
- **THEN** hejbro는 `hejbro.nile.config.ts`의 preset을 읽고(text 비교 모드 안내가 출력됨), 출력 첫 줄에 그 파일 이름과 작업 디렉터리가 나타난다

#### Scenario: 설정 파일이 없는 타깃
- **WHEN** `pnpm target postgres check`를 실행한다
- **THEN** 저장소 루트에서 기본 `hejbro.config.ts`로 실행된다

#### Scenario: 상대 경로 인증서
- **WHEN** 접속 문자열에 `sslrootcert=certs/...` 상대 경로가 있는 supabase 타깃에 `status`를 실행한다
- **THEN** 작업 디렉터리에서도 인증서가 풀려 연결이 성공한다

### Requirement: 리셋은 hejbro의 reset으로 한다
The system SHALL reset a target only through `pnpm target <name> reset`, and the repository documentation MUST NOT instruct a manual `drop schema` as the reset path. A failed `reset` SHALL leave the ledger unchanged.

#### Scenario: 리셋 성공
- **WHEN** 체인이 적용된 타깃에 `pnpm target <name> reset --confirm-drop <db>:<n>`을 실행한다
- **THEN** exit 0이고, 이후 `status`는 ledger가 비어 있고 모든 파일이 pending이라고 보고한다

### Requirement: 쿼리 레이어 실측 명령을 제공한다
The system SHALL accept `smoke` as a target command alongside `migrate`, `status`, `check`, `reset`, `sql`, and SHALL run it with the same credential handling (environment variable only, masked output).

#### Scenario: 명령 목록
- **WHEN** 알 수 없는 명령으로 `pnpm target postgres foo`를 실행한다
- **THEN** 오류 메시지의 유효한 명령 목록에 `smoke`가 포함된다
