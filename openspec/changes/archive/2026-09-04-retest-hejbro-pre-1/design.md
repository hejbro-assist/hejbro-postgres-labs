## Context

동기는 proposal.md의 Why를 본다. 설계에 영향을 주는 현재 상태와 제약은 다음과 같다.

- 네 타깃에는 pre.0으로 만든 `0001_add_lab`, `0002_add_tasks`가 적용되어 있고 ledger가 그 해시를 기록하고 있다. 마이그레이션 파일 배너의 `-- hejbro: 0.2.0-pre.0` 줄은 파일 해시의 일부이므로 파일을 건드리지 않는다. pre.1이 pre.0 스냅샷을 그대로 읽는지는 `pnpm verify`가 첫 관문이다.
- Postgres 버전: postgres 18.6(`postgres:18-alpine`), neon 18.6, nile 15.19, supabase 17.6. 확장은 쓰지 않는다. GIN 인덱스의 `jsonb_path_ops`는 내장 opclass다.
- pre.1 변경 사항(릴리스 노트, 2026-09-04): 테이블 결속 식의 열 참조가 `"table"."column"`으로 렌더링(333dae8), `verify`가 preset 검증기 실행(e22ea23), `reset`이 FK 순서로 드롭(e22ea23, 6973aab), preset이 `explainUnavailable`을 선언하면 `check`가 텍스트 정규화 비교로 답함(adb916c), `generate`가 kind 안에서 의존성 순서로 문장을 냄, 조인이 있는 select의 전체 테이블 projection이 스키마 한정으로 렌더링(17f5495).
- hejbro 0.2.x 큐에 열려 있는 관련 이슈: #772(view·함수 본문·쿼리 문장의 3단계 참조가 Nile에서 미측정), #778(index 술어·generated column 식이 서버 렌더링으로 비교되지 않음), #781(generated column이 항상 default 차이로 보고됨), #782(`notNullElements` CHECK가 explainUnavailable preset에서 절대 일치 안 됨).
- `hejbro check`는 접속 정보를 `--url`/`DATABASE_URL`에서만 읽지만 preset은 `--config`로 읽는다. 지금 `scripts/target.ts`는 `--config`를 붙이지 않으므로 Nile의 `check`는 preset 없이 돌아 EXPLAIN 경로로 간다.
- Nile 제약(첫 변경에서 실측): `DROP ... CASCADE` 불가, EXPLAIN 불가, `::regnamespace` 불가, 스키마 이름 12바이트, 한 문장에 테넌트 하나, tenant-aware 테이블의 PK에 `tenant_id` 필수, identity/serial 불가. tenant-aware 테이블에 행을 넣으려면 `public.tenants`에 테넌트가 있어야 한다.
- `@hejbro/nile`의 `nileDriver`는 `contextRequired: true`라 컨텍스트 없는 실행이 `context-required`로 실패한다. `assertSchema`는 `handle.driver`로 읽으므로 예외다.

## Goals / Non-Goals

**Goals:**
- #750 다섯 항목 각각에 "고쳐졌다/아니다"를 pre.1 실측으로 답하고 파일에 남긴다.
- 고급 경로 다섯 가지(재한정, enum+jsonb+표현식 인덱스, rename, enum 값 추가 분할, view)를 파일 하나씩으로 나눠 provider별 수용 여부가 파일 단위로 읽히게 한다.
- 쿼리 레이어를 provider 드라이버 세 종류로 실제 실행해 본다. 특히 Nile에서 조인 select가 3단계 참조를 내는지(#772)를 측정한다.
- 리셋을 hejbro 자체 명령으로 되돌린다.

**Non-Goals:**
- RLS, 함수, 트리거, grant, role. Nile preset이 generate 시점에 거부하므로 공유 체인에 들어갈 수 없다. provider별 체인 분기는 이 저장소의 목적("같은 선언을 어디에나")과 어긋난다.
- generated column. #781이 열려 있어 네 타깃 모두에서 `check`가 exit 1이 되고, 그러면 pre.1의 다른 결과가 가려진다. 다음 변경에서 단독으로 측정한다.
- `@hejbro/neon`(serverless WebSocket 드라이버). Neon 타깃은 직접 접속이므로 `pgDriver`로 충분하고, 이 패키지는 실행 경로가 아니라 드라이버 종류가 다를 뿐이다.
- `import`, `baseline`, `raise`, `link`/`vendor`. brownfield·polyrepo 경로는 별도 변경으로 다룬다.

## Decisions

### D1. 네 패키지를 `0.2.0-pre.1`로 정확 고정하고, pre.0 체인 위에 이어 붙인다
`pnpm add -E hejbro@0.2.0-pre.1 @hejbro/pg@0.2.0-pre.1 @hejbro/nile@0.2.0-pre.1 @hejbro/supabase@0.2.0-pre.1`. 체인을 리셋해 pre.1로 다시 만드는 대안은 "pre.0으로 적용한 ledger를 pre.1이 이어받는가"라는 측정을 잃는다. 첫 단계는 파일 갱신 없이 `pnpm verify` → 각 타깃 `status` → `check`이고, 여기서 실패하면 그것이 첫 finding이다(스냅샷 형식 호환).

### D2. #750 재검증은 항목마다 원래 재현 절차를 그대로 돌린다
| # | 재현 | 기대(pre.1) |
|---|---|---|
| 1 `verify` preset | 임시로 `tasks.tenantId`의 `.primaryKey()`를 뗀 선언으로 `hejbro verify --config hejbro.nile.config.ts` | `nile-tenant-primary-key-missing`, exit 1. 선언은 원복 |
| 2 `reset` | 체인 적용된 타깃에 `reset` → `--confirm-drop <db>:<n>` | exit 0, 객체 없음, ledger 비어 있음 |
| 3 3단계 참조 | CHECK/술어를 `${t.name}`·`isNull(t.archivedAt)`로 되돌려 generate → Nile migrate | SQL에 `"projects"."name"`, Nile exit 0 |
| 4 Nile check | `pnpm target nile check`(D5로 `--config` 자동) | exit 0, no differences |
| 5 skills add | `.claude/skills/openspec-*`의 해시를 찍고 `npx skills add quickstart-now/hejbro -s hejbro -y -a claude-code` 후 다시 비교 | openspec 스킬 변경 없음, `skills/hejbro`만 갱신 |
항목 1은 실제 게이트 교체(D6)와 겹치므로 negative witness는 한 번만 수동으로 돌리고 결과를 RESULTS에 적는다. 재현이 실패하면 finding의 재검증 절에 남기고 이슈에 코멘트한다.

### D3. 고급 경로는 마이그레이션 파일 하나씩, 의도한 순서로
| 파일 | 선언 변경 | 측정하는 것 |
|---|---|---|
| `0003_requalify_expressions` | CHECK 3건과 partial index 술어를 raw 텍스트에서 열 보간으로 | alter(drop+add constraint, index 재생성) 경로, 2단계 렌더링, Nile 수용 |
| `0004_add_priority_and_metadata` | `pgEnum(lab, "task_priority", ["low","normal","high"])`, `tasks.priority` enum 열 `default('normal')`, `projects.metadata jsonb not null default '{}'`, `index("projects_metadata_idx").using("gin").on(op(t.metadata, "jsonb_path_ops"))`, `index("projects_tenant_id_lower_name_key").unique().on(t.tenantId, sql\`lower(${t.name})\`).where(isNull(t.archivedAt))` | Nile의 CREATE TYPE, tenant-aware 테이블의 GIN/표현식/unique partial 인덱스, jsonb default |
| `0005_rename_task_position` | `tasks.position` → `sortOrder`(`--rename lab.tasks.position=sort_order`) | 단순 rename 경로 |
| `0006_rename_project_name` | `projects.name` → `title`(`--rename lab.projects.name=title`). CHECK와 표현식 unique 인덱스가 이 열을 참조 | rename이 식을 되짚는지(drop+add 없이 `rename column`만) |
| `0007_*`, `0008_*` (hejbro가 분할) | enum에 `urgent` 추가 + `index("tasks_urgent_idx").on(t.tenantId, t.sortOrder).where(eq(t.priority, "urgent"))` | 두 파일 분할, Nile의 ALTER TYPE ADD VALUE |
| `0009_add_open_tasks_view` | `defineView(lab, "open_tasks", select({...}, tasks).innerJoin(projects, ...).where(isNull(projects.archivedAt)))` | view 경로. Nile에서 3단계 참조가 나면 #772의 측정값 |
view를 마지막에 두는 이유는 #772가 Nile에서 실패할 가능성이 가장 높은 파일이고, 파일 단위 트랜잭션이라 그 앞 파일은 적용된 채로 남기 때문이다. CHECK에 `inArray(t.status, [...])`를 쓰면 pre.0 finding(#750-3)이 지적한 `in (...)` → `= ANY(...)` rewrite 비교가 서버 렌더링으로 처리되는지도 함께 본다. Nile은 explainUnavailable 경로라 텍스트 정규화가 이 rewrite를 못 잡을 수 있다. 그 경우 finding이다.

### D4. `smoke`는 `scripts/smoke.ts` 하나, 드라이버 선택만 타깃별로
`scripts/target.ts`가 `smoke`를 받으면 `DATABASE_URL`과 `LAB_TARGET`을 env로 넣고 `node scripts/smoke.ts`를 spawn한다(마스킹 경로 재사용). `smoke.ts`는:
1. 드라이버: `postgres`/`neon` → `pgDriver(url)`; `nile` → `nileDriver(pgDriver(url))` + `asTenant(TENANT_ID)`를 `db()`의 `context` 옵션으로 등록; `supabase` → `supabaseDriver(pgDriver(url))`(session 경로).
2. `assertSchema(handle)` → compared/notCompared 수 출력. 실패 시 `code`와 findings 출력 후 exit 1.
3. Nile 준비: `insert into public.tenants (id, name)`(raw `sql`, `handle.execute`). 다른 타깃은 생략.
4. `handle.transaction(tx => ...)`: 프로젝트 1건 insert(returning id) → task 2건 insert(한 문장에 한 테넌트) → 같은 PK로 `onConflictDoUpdate`(title 갱신) → `select(tasks).innerJoin(projects, ...)` 행 수 2 → `select(projects).related({ tasks: true })`는 `.references()` 기반이라 복합 FK에서는 못 쓴다. 대신 `jsonArrayFrom`으로 중첩 읽기 → `tx.transaction(nested => CHECK 위반 insert)`를 catch, 이후 count가 그대로 2 → `deleteFrom(projects)` → tasks count 0.
5. Nile 정리: `delete from public.tenants where id = ...`.
6. 각 단계는 `step <name>: <value>` 한 줄. 실패는 `step <name> failed: code=<code> sqlstate=<code> <message>`.
단계별 기대값을 스크립트가 직접 비교해 틀리면 exit 1로 끝낸다. 테넌트 id는 고정 UUID 상수(예: `0000…-0001`)로 두고 시작 시 잔여 행을 먼저 지운다(직전 실행이 실패했을 때).

### D5. provider 설정은 작업 디렉터리의 `hejbro.config.ts`로 넘긴다 (2026-09-04 수정)
처음 계획은 `--config hejbro.<target>.config.ts` 자동 첨부였다. 구현 중 확인한 사실: pre.1 CLI에서 `--config`를 읽는 명령은 `generate`·`history`뿐이고 `verify`·`check`·`migrate`·`status`·`reset`·`restore`는 `loadConfig(cwd, undefined)`로 플래그를 조용히 무시한 채 cwd의 `hejbro.config.ts`를 읽는다(`node_modules/hejbro/dist/cli.js`의 `runCheck` 등, findings/2026-09-04-config-flag-ignored-by-live-commands.md). 그래서 Nile `check`에 `--config`를 붙여도 preset이 닿지 않아 EXPLAIN 경로로 갔다.
대안 둘을 비교했다. (a) 공유 `hejbro.config.ts`에 `presets: [nilePreset, supabasePreset]`를 함께 등록: hejbro의 모델("preset은 프로젝트 설정에")과 맞지만, `explainUnavailable`이 네 타깃 전부의 `check`를 text 모드로 낮추고 preset kind 등록이 스냅샷·generate에 영향을 줄 수 있어 다른 세 타깃의 측정이 바뀐다. (b) `scripts/provider-workdir.ts`가 `.hejbro-target/<target>/`에 provider 설정을 `hejbro.config.ts` 이름으로 복사하고 `src`·`migrations`·`hejbro.snapshot.json`·`certs`를 심볼릭 링크한 뒤 그 디렉터리를 cwd로 hejbro를 실행: 다른 타깃의 측정은 그대로이고 어떤 명령이든 preset을 본다. (b)를 택했다. 이것은 효과 층의 우회이고 원인은 hejbro의 플래그 처리이므로, finding으로 보고하고 픽스가 나오면 디렉터리 우회를 지운다. `certs` 링크는 supabase 접속 문자열의 상대 경로 `sslrootcert=certs/...`가 새 cwd에서 `ENOENT`로 실패해서 추가했다.

### D6. 게이트 교체
`scripts/preset-gate.sh`는 provider마다 D5의 작업 디렉터리에서 `hejbro verify`를 실행한다. pre.1에서 검사 수가 5→6으로 늘고, `tasks.tenantId`의 `.primaryKey()`를 뗀 선언으로 돌리면 `nile-tenant-primary-key-missing`이 나와(2026-09-04 확인) 검증기가 실제로 돈다. `generate` 우회는 지웠다.

### D7. finding 재검증 표기
frontmatter에 `resolved_in`(선택, `status: resolved`면 필수)을 추가하고 `scripts/finding.ts`가 검증한다. 본문 끝에 `## 재검증 (0.2.0-pre.1)` 절을 붙인다. 이슈 #750은 닫혀 있으므로 재검증 결과는 코멘트 하나로 묶어 올린다(영어). 새 발견은 새 파일 + 새 이슈(제목에 버전).

### D8. 실행 순서
타깃별 순서는 postgres → nile → supabase → neon. 단계는 (a) pre.1 설치 후 `verify`·`status`·`check`, (b) 체인 확장(0003~0008 생성은 로컬 postgres에 먼저 적용해 보며 한 파일씩), (c) 네 타깃 `migrate`·`check`·`smoke`, (d) `reset` → `migrate` → `check` → `smoke`(fresh), (e) 결과 표. Nile에서 파일이 거부되면 그 파일 이후는 Nile에 적용하지 않고, 결과 표의 파일별 행에 SQLSTATE를 적는다. Nile용으로 체인을 고치지 않는다(작업 규칙: spec을 낮추지 않는다).

## Risks / Trade-offs

- [pre.1이 pre.0 스냅샷을 못 읽는다] → D1 첫 단계에서 드러난다. finding으로 남기고, 그 경우에만 체인을 리셋해 다시 만든다.
- [Nile이 CREATE TYPE 또는 ALTER TYPE ADD VALUE를 거부한다] → 0004에서 멈추고 이후 파일은 Nile에 미적용. 파일별 표에 기록. 체인은 그대로 둔다.
- [`check`가 인덱스 술어를 서버 렌더링으로 비교하지 않아(#778) 0006/0007의 `= 'urgent'` 술어나 표현식 인덱스가 어긋난다고 보고] → 결과에 #778 측정값으로 적는다. 이슈가 열려 있으므로 새로 만들지 않고 코멘트.
- [`inArray` CHECK가 Nile의 텍스트 비교에서 `= ANY(...)`와 불일치] → finding 후보. 열려 있는 #782와 같은 계열이면 코멘트.
- [Nile에서 `nileDriver`의 컨텍스트 렌더링이 `set nile.tenant_id`를 첫 문장으로 보내야 하는데 `pg`의 세션 설정과 충돌] → `pgDriver`는 체크아웃 시점에 세션 설정을 보내므로 지원 형태. 실패하면 finding.
- [`smoke`가 실패 도중 죽어 행이 남는다] → 시작 시 고정 테넌트 id의 잔여 행을 먼저 지운다.
- [reset이 view·enum까지 드롭 순서를 못 맞춘다] → #753 재검증의 일부. 실패하면 finding.

## Migration Plan

1. 패키지 갱신 커밋(체인 변경 없음) → verify·status·check 결과 기록.
2. 스크립트 변경(`--config`, `smoke`, 게이트, finding `resolved_in`) 커밋.
3. 마이그레이션 0003~0008을 파일 단위 커밋, 각 파일은 로컬 postgres에 먼저 적용해 본다.
4. 네 타깃 적용·리셋·재적용·smoke, 결과 표와 findings 갱신 커밋.
5. 이슈 코멘트/새 이슈, 아카이브.
롤백: 각 타깃은 `pnpm target <t> reset`으로 비운다. 저장소 쪽은 feature 브랜치를 버린다.

## Open Questions

- Nile에서 `public.tenants`에 넣는 열이 `(id, name)`으로 충분한지. `smoke` 첫 실행에서 확인하며, 설계나 spec에는 영향 없다.
- `related()`가 복합 FK(`extras.foreignKeys`)를 지원하는지. 문서는 `.references()` 기반이라고만 적고 있어 D4는 `jsonArrayFrom`을 쓴다. 지원한다면 smoke에 한 단계를 더한다.
