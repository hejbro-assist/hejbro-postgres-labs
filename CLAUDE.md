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
- 패키지 매니저: pnpm
