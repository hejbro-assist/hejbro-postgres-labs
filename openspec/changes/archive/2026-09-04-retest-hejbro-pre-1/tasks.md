## 1. pre.1 도입과 체인 호환 확인

- [x] 1.1 `hejbro`, `@hejbro/pg`, `@hejbro/nile`, `@hejbro/supabase`를 `0.2.0-pre.1`로 정확 고정 설치하고 `pnpm exec hejbro --help`가 `v0.2.0-pre.1`을 출력하는지, `pnpm check-types`가 통과하는지 확인한다
- [x] 1.2 파일을 바꾸지 않은 채 `pnpm verify`를 실행해 pre.0 스냅샷과 체인을 pre.1이 그대로 읽는지 확인하고, 실패하면 finding 초안을 만든다
- [x] 1.3 `pnpm local-pg up` 후 네 타깃에 `status`와 `check`를 실행해 pre.0으로 적용된 ledger를 pre.1이 이어받는지(pending 없음, postgres·neon·supabase는 no differences) 기록한다

## 2. 타깃 스크립트와 게이트

- [x] 2.1 `scripts/target.ts`에 `hejbro.<target>.config.ts`가 있으면 그 설정으로 실행하는 동작을 구현하고(`--config`는 live 명령이 무시해 `scripts/provider-workdir.ts`의 작업 디렉터리를 cwd로 씀, design D5), `pnpm target nile status` 출력에 `hejbro.nile.config.ts`가, `pnpm target postgres status` 출력에는 설정 안내가 없는지 확인한다
- [x] 2.2 `scripts/target.ts`에 `smoke` 명령(자식 프로세스 env로 `DATABASE_URL`·`LAB_TARGET` 전달, 마스킹 재사용)을 추가하고 `pnpm target postgres foo`의 명령 목록에 `smoke`가 포함되는지 확인한다
- [x] 2.3 `scripts/preset-gate.sh`를 `hejbro verify --config` 기반으로 바꾸고 `pnpm gate:presets`가 nile·supabase 모두 preset 검증기 검사를 포함해 통과하는지 확인한다. CI 워크플로우의 단계 이름도 맞춘다
- [x] 2.4 `scripts/finding.ts`에 `resolved_in`(선택, `status: resolved`면 필수) 검증을 추가하고 `resolved`인데 `resolved_in`이 빈 임시 파일이 exit 1로 그 필드를 지목하는지, `pnpm finding validate all`이 통과하는지 확인한다

## 3. #750 재검증 (검증)

- [x] 3.1 #752: `tasks.tenantId`에서 `.primaryKey()`를 임시로 떼고 `pnpm exec hejbro verify --config hejbro.nile.config.ts`가 `nile-tenant-primary-key-missing`으로 exit 1인지 확인한 뒤 원복하고, 결과를 `findings/2026-09-03-verify-skips-preset-validators.md`의 재검증 절과 `status`/`resolved_in`에 기록한다
- [x] 3.2 #753: postgres 타깃에 `pnpm target postgres reset` → 안내된 `--confirm-drop` 재실행이 exit 0이고 `lab` 스키마가 없으며 `status`가 ledger 비어 있음을 보고하는지 확인한 뒤 `migrate`로 되돌리고, 결과를 `findings/2026-09-03-reset-drops-referenced-table-first.md`에 기록한다
- [x] 3.3 #756: `.claude/skills/openspec-*/SKILL.md`의 sha256을 찍고 `npx skills add quickstart-now/hejbro -s hejbro -y -a claude-code`를 실행한 뒤 해시가 같고 `.claude/skills/hejbro`만 바뀌었는지, `skills-lock.json`에 openspec 경로가 없는지 확인해 `findings/2026-09-03-skills-add-installs-internal-skills.md`에 기록한다. 갱신된 스킬의 `version`도 적는다
- [x] 3.4 #754·#755는 4.1과 5.2에서 확인한 뒤 `findings/2026-09-03-nile-rejects-qualified-column-refs.md`, `findings/2026-09-03-check-cannot-compare-checks-on-nile.md`에 기록한다

## 4. 체인 확장 (각 파일은 로컬 postgres에 먼저 적용)

- [x] 4.1 `src/lab.schema.ts`의 CHECK 3건과 partial index 술어를 열 보간(`${t.name}`, `isNull(t.archivedAt)`, `inArray(t.status, ...)`)으로 되돌리고 `hejbro generate --name requalify_expressions`로 `0003`을 만든 뒤, SQL에 3단계 참조가 없고 `"projects"."name"` 형태인지, 로컬 postgres `migrate`·`check`가 exit 0인지 확인한다
- [x] 4.2 `pgEnum` `task_priority`, `tasks.priority`, `projects.metadata jsonb`, GIN 인덱스, 표현식 unique partial 인덱스를 선언하고 `generate --name add_priority_and_metadata`로 `0004`를 만든 뒤 SQL에 `create type`, `using gin`, `unique index ... where`가 있는지, 로컬 postgres `migrate`·`check`가 exit 0인지 확인한다
- [x] 4.3 `tasks.position`을 `sortOrder`로 바꾸고 `generate`가 `ambiguous-column-rename`으로 멈추는지 확인한 뒤 안내된 `--rename lab.tasks.position=sort_order --name rename_task_position`으로 `0005`를 만들고, SQL이 `rename column`만 내는지, 로컬 postgres `migrate`·`check`가 exit 0인지 확인한다. 이어서 CHECK와 표현식 인덱스가 참조하는 `projects.name`을 `title`로 바꿔 `0006`을 만들고 역시 `rename column`만 나오는지 확인한다(식 되짚기 측정)
- [x] 4.4 enum에 `urgent`를 추가하고 `tasks_urgent_idx`(술어 `priority = 'urgent'`)를 선언한 뒤 `generate --name add_urgent_priority`가 파일 두 개(`0007`, `0008`)를 만드는지, 첫 파일이 `alter type ... add value`만 담는지, 로컬 postgres `migrate`·`check`가 exit 0인지 확인한다
- [x] 4.5 `defineView(lab, "open_tasks", ...)`(tasks ⋈ projects, archived_at is null)를 선언하고 `generate --name add_open_tasks_view`로 `0009`를 만든 뒤 로컬 postgres `migrate`·`check`가 exit 0인지 확인한다
- [x] 4.6 `pnpm verify`, `pnpm gate:presets`, `pnpm check-types`가 통과하는지 확인하고 체인을 커밋한다

## 5. 쿼리 레이어 실측 스크립트

- [x] 5.1 `scripts/smoke.ts`를 design D4대로 구현한다(타깃별 드라이버, `assertSchema`, Nile 테넌트 등록/정리, 트랜잭션 단계, 단계별 기대값 비교, 실패 시 code/SQLSTATE 출력). `pnpm check-types`가 통과하고 로컬 postgres에서 `pnpm target postgres smoke`가 모든 단계를 기대값과 함께 출력하며 exit 0인지, 종료 후 `lab.projects`가 비어 있는지 확인한다
- [x] 5.2 로컬 postgres에서 마지막 마이그레이션을 `reset` 없이 되돌린 상태(예: `drop view lab.open_tasks` 후)로 `smoke`를 실행해 `assert-schema-diverged`와 선언 이름이 출력되고 데이터 단계가 실행되지 않는지 확인한 뒤 `migrate`로 복구한다

## 6. 네 타깃 적용 (검증)

- [x] 6.1 nile: `migrate`(0003~0008) → `check` → `smoke`를 실행하고 파일별 수용 여부·SQLSTATE, `check` exit 코드(#755), `smoke` 각 단계 결과(#772 조인 렌더링 포함)를 기록한다. 거부된 파일이 있으면 finding을 작성한다
- [x] 6.2 supabase: 같은 순서를 돌리고 preset 경고 출력과 함께 기록한다
- [x] 6.3 neon: 같은 순서를 돌리고 기록한다
- [x] 6.4 네 타깃 모두 `reset --confirm-drop` → `migrate`(전체 체인) → `check` → `smoke`를 돌려 fresh apply 결과를 기록한다. Nile은 reset의 drop 순서(view, enum 포함)와 `CASCADE` 없는 드롭이 통과하는지 본다

## 7. 결과 기록과 보고

- [x] 7.1 `RESULTS.md`를 pre.1 기준으로 다시 쓴다: 타깃 4행(hejbro, Postgres, migrate, check, reset+fresh, smoke), 마이그레이션 파일별 × 타깃 수용 표, #750 항목별 재검증 표, 남은 pre.0 절은 "이력"으로 이동. 리셋 안내(`RESULTS.md`)를 `pnpm target <t> reset`으로 바꾼다(README에는 리셋 절이 없었다)
- [x] 7.2 새 발견 사항을 `findings/2026-09-04-*.md`로 작성하고 `pnpm finding validate all`이 통과하는지 확인한다. 열려 있는 hejbro 이슈(#772, #778, #782 등)와 겹치는 건은 파일에 그 번호를 적는다
- [x] 7.3 #750에 재검증 결과 코멘트(영어, 항목별 표)를 올리고, 겹치지 않는 새 발견은 새 이슈(제목에 `0.2.0-pre.1`)로 올린 뒤 finding 파일의 `discussion`에 URL을 기록한다
- [ ] 7.4 `git log -p`에서 `://[^/]*:[^@]*@` 패턴이 없는지 확인하고, feature 브랜치를 push해 PR(CI 통과)을 만든다
