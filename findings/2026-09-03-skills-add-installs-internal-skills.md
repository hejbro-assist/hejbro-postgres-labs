---
title: npx skills add quickstart-now/hejbro 가 저장소 내부 .claude/skills 까지 설치해 소비자의 동명 스킬을 덮어쓴다
hejbro_version: 0.2.0-pre.0
provider: all
kind: improvement
status: posted
discussion: https://github.com/quickstart-now/hejbro/issues/750
---

## 요약

README의 안내대로 `npx skills add quickstart-now/hejbro` 를 실행하면 `skills/hejbro` 외에 hejbro 저장소가 자체 개발용으로 두는 `.claude/skills/openspec-*` 여섯 개와 `roundtrip-verification` 까지 소비자 프로젝트의 `.claude/skills/` 에 복사된다. 소비자가 OpenSpec 을 쓰고 있으면 `openspec init` 이 만든 같은 이름의 스킬이 hejbro 저장소 버전으로 덮어써진다.

## 재현 절차

1. OpenSpec 을 쓰는 프로젝트에서 `openspec init --tools claude` 를 실행해 `.claude/skills/openspec-apply-change/SKILL.md` 등을 만든다.
2. `npx skills add quickstart-now/hejbro -y -a claude-code` 를 실행한다 (`--full-depth` 없이).
3. `git status` 로 `.claude/skills/` 변경을 본다.

## 기대 결과

`skills/hejbro` 하나만 설치되고, 기존 `.claude/skills/openspec-*` 는 그대로다.

## 실제 결과

설치 로그에 `openspec-apply-change (copied)`, `openspec-archive-change (copied)`, `openspec-explore`, `openspec-propose`, `openspec-sync-specs`, `openspec-update-change`, `roundtrip-verification` 이 함께 나타나고, `skills-lock.json` 에는 `skillPath: ".claude/skills/openspec-apply-change/SKILL.md"` 처럼 저장소 내부 경로가 기록된다. 기존 여섯 파일이 모두 modified 상태가 된다.

## 제안

- README 안내를 `npx skills add quickstart-now/hejbro -s hejbro` 처럼 스킬 이름을 지정하는 형태로 바꾸거나,
- 저장소 내부 전용 스킬을 skills CLI 가 탐색하지 않는 위치로 옮기거나 skills CLI 의 제외 설정(있다면)을 두는 것을 제안한다.

## 환경

- skills CLI: `npx skills@latest` (2026-09-03 기준 최신)
- 소비자 쪽 OpenSpec: `@fission-ai/openspec` 1.12.0
- 관련 파일: 소비자 저장소의 `skills-lock.json`

## 재검증 (0.2.0-pre.1, 2026-09-04)

hejbro #756 으로 추적, #771 에서 README 의 설치 명령을 `npx skills add quickstart-now/hejbro -s hejbro` 로 바꾸고 닫았다("skills CLI 에 제외 수단이 없다"는 판단). 그러나 재현은 그대로 실패한다.

- 문서대로 `-s hejbro` 를 붙이면 `.claude/skills/hejbro` 만 갱신되고 openspec 스킬 6개의 sha256 은 그대로.
- `-s` 없이 실행하면 pre.1 시점 `dev` 에서도 `Found 8 skills` — `.claude/skills/openspec-*` 6개와 `roundtrip-verification` 을 소비자 쪽에 복사해 동명 스킬을 덮어쓴다(git 으로 복구했다).
- 원인은 그대로다: 내부 스킬이 skills CLI 의 탐색 경로(`.claude/skills/`)에 있고, 숨김 표시가 없다. skills CLI 1.5.23 은 `SKILL.md` frontmatter 의 `metadata.internal: true` 를 문서화하고 있고, 스크래치 저장소에서 측정하니 그 표시가 있는 스킬은 `--list` 에도 `-s` 없는 설치에도 나오지 않았다(표시 없는 스킬은 설치됨).
- 그래서 `resolved` 가 아니라 `posted` 로 되돌리고, 위 측정을 담아 새 이슈로 올렸다: https://github.com/quickstart-now/hejbro/issues/834 (원인 층: hejbro 저장소의 스킬 frontmatter, 픽스는 파일 7개에 `metadata.internal: true`).
