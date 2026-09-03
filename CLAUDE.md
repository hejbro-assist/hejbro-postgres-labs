# hejbro-postgres-labs

Postgres 실험(labs) 저장소. OpenSpec 기반 spec-driven 워크플로우를 따른다.

## 작업 흐름 (OpenSpec)

1. `/opsx:propose "<아이디어>"` — 변경 제안 생성 (proposal, specs, design, tasks)
2. `/opsx:apply` — tasks.md 기준으로 구현
3. `/opsx:archive` — 완료된 변경을 아카이브하고 specs를 갱신
4. `/opsx:explore` — 구현 전 탐색, `/opsx:update` — 제안 수정, `/opsx:sync` — specs 동기화

- 변경/스펙 이름은 kebab-case 영문, 본문은 한국어 (`openspec/config.yaml` 참고)
- 상태 확인: `openspec status --change "<name>"`, 검증: `openspec validate`

## 저장소 규칙

- 원격: `origin` = `hejbro-assist/hejbro-postgres-labs` (계정 hejbro-assist)
- 브랜치: feature → PR → `dev` (squash merge) → `main` (merge commit)
- 커밋: conventional commits, subject 전부 소문자. husky + commitlint가 강제한다.
- 패키지 매니저: pnpm. Node는 22.18 이상(hejbro의 engines와 동일). 스크립트는 `.ts`를 Node가 직접 실행한다(빌드 없음).

## credential 규칙

- 접속 정보는 `.env`에만 둔다. `.env.example`만 커밋한다.
- **환경 파일(`.env`, `.env.local`, `.env.*.local`)은 어떤 도구로도 열지 않는다.** Read 도구는 `.claude/settings.json`이 막고, Bash에서도 `cat`·`grep` 등으로 읽지 않는다. 설정 여부는 `pnpm target doctor`로만 확인한다.
- 스크립트 출력에 접속 문자열을 찍지 않는다. 타깃은 이름과 host로만 식별한다.
- 커밋 전 secretlint(pre-commit)와 CI 전체 스캔이 비밀 패턴을 막는다. `--no-verify`로 우회하지 않는다.
