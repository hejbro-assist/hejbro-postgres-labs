## Why

hejbro(TypeScript 선언 → 결정적 마이그레이션 SQL)를 Neon, Nile, Supabase, 순정 Postgres 네 provider에 실제로 적용해 보고, 그 과정에서 발견한 버그·개선점·기능 요청을 hejbro 저장소의 Discussions에 꾸준히 올리는 것이 이 저장소의 목적이다. 지금은 OpenSpec 골격만 있고 hejbro 프로젝트도, 접속 정보를 안전하게 다루는 장치도, 발견 사항을 기록하는 틀도 없다. 접속 문자열을 다루기 시작하기 전에 유출 차단 장치부터 세워야 한다.

## What Changes

- hejbro 프로젝트 골격: `hejbro.config.ts`, 선언 파일, `migrations/`, `hejbro.snapshot.json`. 버전은 네 provider 드라이버가 모두 존재하는 `0.2.0-pre.0` 라인으로 고정한다.
- provider 네 곳(neon, nile, supabase, postgres)을 하나의 마이그레이션 체인에 대한 "타깃"으로 정의하고, 타깃 이름으로 `migrate`/`status`/`check`를 실행하는 스크립트를 둔다. 순정 Postgres 타깃은 Docker `postgres:17-alpine` 컨테이너를 올리는 스크립트로 제공한다.
- 네 provider가 공통으로 받아들이는 "portable core" 샘플 스키마 하나를 선언하고, 네 타깃 모두에서 `migrate` → `check` 통과를 확인한다. Nile은 RLS와 사용자 함수를 거부하므로 샘플은 테이블, CHECK, 인덱스, FK로 한정한다.
- credential 다층 보호: `.env`는 gitignore, `.env.example`만 커밋, secretlint pre-commit 훅, Claude Code의 `.env` 읽기 차단, 스크립트 출력에서 접속 문자열 마스킹, GitHub push protection(이미 켜짐) 유지.
- 발견 사항 기록 틀: `findings/`에 한 건당 파일 하나(템플릿: hejbro 버전, provider, 재현 절차, 기대/실제, 분류, Discussion 링크)를 남기고, 이를 hejbro Discussions에 올리는 스크립트를 둔다. 분류별 카테고리는 버그·질문 → Q&A, 개선·기능 요청 → Ideas, 적용 사례 → Show and tell.
- CI(GitHub Actions)는 DB 없이 `hejbro verify`와 secretlint 전체 스캔만 돌린다.

## Capabilities

### New Capabilities
- `credential-protection`: provider 접속 정보가 저장소, 로그, 에이전트 출력 어디에도 평문으로 남지 않도록 보장하는 규칙.
- `provider-targets`: 네 provider를 타깃 이름으로 선택해 hejbro 명령을 실행하는 방식과, 설정되지 않은 타깃을 다루는 규칙.
- `portable-core-schema`: 네 provider가 모두 받아들이는 샘플 스키마의 범위와, 네 타깃에서 마이그레이션·검증이 통과해야 한다는 요구사항.
- `hejbro-feedback-loop`: 발견 사항을 저장소에 기록하고 hejbro Discussions에 올리는 형식과 절차.

### Modified Capabilities
(없음)

## Non-goals

- provider별 고유 기능(Supabase 스토리지·auth 헬퍼, Neon `pg_session_jwt`, Nile `asTenant`) 실험과 쿼리 레이어·성능 실험. 다음 변경에서 다룬다.
- hejbro 신규 버전 자동 감지·자동 적용과 CI에서 실제 provider에 마이그레이션 적용. 접속 정보를 GitHub Secrets에 올리는 일이 전제되므로 별도 변경(`track-hejbro-releases`)으로 분리한다.
- Neon, Nile, Supabase 프로젝트 생성 자동화. 사용자가 각 콘솔에서 수동으로 만든다.
- 로컬 Docker round-trip(pg_dump diff) 검증.

## 검증 기준

- `git log -p`, 작업 트리, CI 로그, 스크립트 출력 어디에서도 `postgres://…:<password>@` 형태가 없다. 가짜 접속 문자열을 커밋 시도하면 pre-commit이 거부한다.
- 네 타깃 각각에서 `migrate`가 exit 0, 이어지는 `check`가 exit 0(선언과 카탈로그 일치)을 반환한다.
- `hejbro verify`가 로컬과 CI에서 통과한다.
- 접속 정보가 없는 타깃을 지정하면 어떤 변수를 채워야 하는지 알려 주고 종료하며, 값은 출력하지 않는다.
- 첫 적용 과정에서 나온 발견 사항이 최소 한 건 `findings/`에 기록되고 Discussions에 올라간다.

## Impact

- 새 의존성: `hejbro`, `@hejbro/pg`, `@hejbro/nile`, `@hejbro/supabase`(모두 `0.2.0-pre.0`), `pg`, `typescript`, `secretlint` 계열. `@hejbro/neon`은 쿼리 레이어 전용이라 이 변경에서는 쓰지 않는다.
- 새 파일: `hejbro.config.ts`, `src/lab.schema.ts`, `migrations/`, `scripts/`, `findings/`, `.env.example`, `.secretlintrc.json`, `.husky/pre-commit`, `.claude/settings.json`, `.github/workflows/ci.yml`.
- 외부 시스템: Neon, Nile, Supabase 프로젝트 세 개가 사용자 계정에 새로 생성되어야 한다. 로컬 Docker가 필요하다. Discussions 게시는 hejbro-assist 계정으로 이루어진다.
