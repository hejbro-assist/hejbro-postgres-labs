---
title: npx skills add quickstart-now/hejbro 가 저장소 내부 .claude/skills 까지 설치해 소비자의 동명 스킬을 덮어쓴다
hejbro_version: 0.2.0-pre.0
provider: all
kind: improvement
status: draft
discussion: 
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
