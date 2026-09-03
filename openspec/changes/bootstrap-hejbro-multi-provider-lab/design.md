## Context

동기는 proposal.md의 Why를 본다. 설계에 영향을 주는 현재 상태와 제약은 다음과 같다.

- 저장소에는 OpenSpec 골격, commitlint/husky, pnpm `package.json`만 있다. TypeScript 설정도 hejbro 프로젝트도 없다.
- hejbro CLI(`0.2.0-pre.0`)의 라이브 명령(`migrate`, `status`, `check`, `reset`)은 `--url` 플래그 또는 `DATABASE_URL` 환경 변수 하나만 읽는다. 여러 provider를 구분하는 개념이 CLI에 없다.
- `@hejbro/neon`, `@hejbro/nile`은 `0.2.0-pre.0`에만 존재한다. `hejbro`와 `@hejbro/supabase`의 `latest`는 `0.1.1`이라 pre 라인을 써야 네 provider가 맞춰진다. 스냅샷 `formatVersion`은 pre-1.0에서 업그레이드 경로가 없으므로 버전 혼용은 곧 체인 파손이다.
- Nile preset은 RLS와 사용자 함수 선언을 generate 시점에 거부한다. Nile은 5432 순정 Postgres 프로토콜이며 `tenant_id uuid` 열이 있는 테이블을 테넌트 테이블로 취급한다.
- Supabase의 transaction-mode pooler(6543)는 세션 상태를 유지하지 않는다. `migrate`는 ledger와 트랜잭션을 쓰므로 direct 또는 session-mode(5432) 경로여야 한다.
- 로컬에는 Docker 29가 있지만 `docker compose` 플러그인과 `psql`은 없다. Node는 24(`--env-file` 내장), 패키지 매니저는 pnpm 11이다.
- GitHub 저장소는 public이고 secret scanning과 push protection이 켜져 있다. 다만 push protection은 알려진 provider 토큰 패턴만 잡고, 일반 `postgres://user:pass@host` 문자열은 잡지 않는다.
- gh CLI는 `~/.local/bin/gh` 래퍼가 현재 디렉터리에 따라 `hejbro-assist` 계정으로 전환한다. Discussions 게시는 GraphQL `createDiscussion`만 지원한다(REST 없음).

## Goals / Non-Goals

**Goals:**
- 선언 하나, 마이그레이션 체인 하나를 네 타깃에 그대로 적용한다. 타깃 차이는 접속 정보에만 있다.
- 접속 정보는 프로세스 환경 변수로만 흐르고 argv, 로그, 커밋, 에이전트 컨텍스트에는 닿지 않는다.
- 발견 사항 기록과 게시가 스크립트 한 번으로 끝나서 실험 중 마찰이 없다.

**Non-Goals:**
- provider별 preset 고유 기능의 선언·실행. 다만 preset을 "검증 게이트"로만 쓰는 것은 허용한다(아래 D2).
- CI에서 provider에 접속하는 일. 이 변경의 CI는 DB 없는 검사만 한다.

## Decisions

### D1. hejbro 패키지는 전부 `0.2.0-pre.0`에 정확히 고정한다
`hejbro`, `@hejbro/pg`, `@hejbro/nile`, `@hejbro/supabase`를 `^` 없이 정확한 버전으로 적는다. 대안인 `latest`(`0.1.1`)에는 Nile 드라이버가 없고, 캐럿 범위는 pre 라인에서 스냅샷 형식이 바뀌면 체인이 깨진다. 버전 갱신은 후속 변경(`track-hejbro-releases`)에서 명시적 PR로만 한다. `@hejbro/neon`은 쿼리 레이어 드라이버(`@neondatabase/serverless` 기반)라 마이그레이션 적용에는 쓰이지 않으므로 제외한다.

### D2. 단일 패키지, 단일 체인, 공유 설정은 `presets: []`
`hejbro.config.ts`는 `entry: ["src/lab.schema.ts"]`, `migrationsDir: "migrations"`, `snapshotPath: "hejbro.snapshot.json"`, `prefixStrategy: "index"`, `presets: []`로 둔다. 대안으로 provider별 패키지 네 개(체인 네 개)를 검토했으나 "같은 선언을 어디에나"라는 실험 목적과 어긋나고 스키마가 네 벌로 갈라진다.
Nile·Supabase preset은 별도 설정 파일 `hejbro.nile.config.ts`, `hejbro.supabase.config.ts`(entry·migrations·snapshot은 같고 `presets`만 다름)로 둔다. 게이트는 `scripts/preset-gate.sh`(`pnpm gate:presets`)가 각 설정으로 `hejbro generate`를 실행해 검증기 오류가 없고 아무 파일도 쓰지 않았음을 확인하는 방식이다. 처음 계획한 `verify --config`는 preset 검증기를 실행하지 않아 게이트가 되지 못했다(2026-09-03 확인, findings/2026-09-03-verify-skips-preset-validators.md).

### D3. 타깃 스크립트는 환경 변수를 자식 프로세스 env로만 넘긴다
`scripts/target.ts <target> <migrate|status|check|doctor>`가 타깃 이름을 환경 변수 이름으로 매핑하고, `DATABASE_URL`을 자식 프로세스의 env에 넣어 `hejbro <cmd>`를 spawn한다. `--url` 플래그는 쓰지 않는다. argv는 `ps`와 셸 히스토리에 남지만 env는 그렇지 않기 때문이다. 스크립트는 TypeScript(`.ts`)로 쓰고 Node 24의 내장 타입 스트리핑으로 직접 실행한다(빌드 단계 없음, 하우스 룰 적용 대상). `.env` 로딩은 `node --env-file-if-exists=.env`로 하고 dotenv 의존성을 추가하지 않는다. `.env`가 없으면 Node가 실패하므로 `package.json` 스크립트는 `--env-file-if-exists=.env`를 쓴다(Node 22.9+).

### D4. 출력 마스킹은 URL 파싱으로 한다
타깃을 보고할 때 `new URL(value)`로 파싱해 `hostname`과 `pathname`만 출력한다. 정규식으로 비밀번호를 지우는 방식은 특수문자가 들어간 비밀번호에서 새는 경우가 있어 채택하지 않는다. 파싱에 실패하면 "형식이 잘못됨"만 출력하고 원문은 출력하지 않는다. `hejbro` 자체가 오류 메시지에 URL을 포함하는지는 첫 실행에서 확인하고, 포함한다면 finding으로 기록하고 스크립트에서 stderr를 후처리한다.

### D5. 비밀 검사는 secretlint, 훅은 husky pre-commit, CI는 전체 스캔
gitleaks는 바이너리 설치가 필요하고 pnpm 워크플로우와 분리된다. secretlint는 devDependency로 고정할 수 있고 `@secretlint/secretlint-rule-preset-recommend`가 basic-auth 형식(`scheme://user:pass@host`)을 잡는다. 여기에 `@secretlint/secretlint-rule-pattern`으로 `neon.tech`, `thenile.dev`, `supabase.co`, `supabase.com` 호스트를 포함한 접속 문자열 패턴을 추가한다. pre-commit은 staged 파일만 검사해 빠르게 끝내고, CI는 `secretlint "**/*"`로 전체를 검사한다. `.secretlintignore`에 `pnpm-lock.yaml`, `node_modules`, `.env.example`을 둔다. `.env.example`의 placeholder는 `USER:PASSWORD` 대문자만 허용해 실제 값과 구분한다.

### D6. 에이전트 차단은 `.claude/settings.json`의 deny 규칙
`permissions.deny`에 `Read(./.env)`, `Read(./.env.local)`, `Read(./.env.*.local)`을 둔다. `.env.example`은 읽을 수 있어야 하므로 `.env.*` 전체를 막지 않는다. Bash로 `cat .env`를 하는 경로는 이 규칙으로 막히지 않으므로 CLAUDE.md에 "환경 파일은 열지 않는다"를 명시한다. 이 파일은 커밋한다(개인 설정은 `settings.local.json`).

### D7. 로컬 Postgres는 `docker run` 스크립트
compose 플러그인이 없으므로 `scripts/local-pg.sh up|down|logs`가 `postgres:18-alpine`을 컨테이너 이름 `hejbro-lab-pg`, 호스트 포트 `54329`(기본 5432 충돌 회피), 사용자/비밀번호 `postgres`/`postgres`, DB `hejbro_lab`으로 띄운다. `up`은 컨테이너 존재·실행 여부를 검사해 멱등하게 동작하고 `pg_isready`가 될 때까지 기다린다. 이 접속 정보는 로컬 전용이라 `.env.example`에 실제 값으로 적는다. Postgres 18은 2026-09 기준 최신 안정판(19는 베타)이다. hejbro의 자체 round-trip은 17을 쓰므로, 로컬 타깃이 18에서 문제를 내면 그것 자체가 hejbro에 보고할 finding이다. 확장은 쓰지 않는다(`gen_random_uuid()`는 PG13+ 내장).

### D8. provider 접속 경로
- Neon: 콘솔의 direct(non-pooled) 접속 문자열. pooled 엔드포인트는 PgBouncer transaction 모드라 `migrate`에 부적합하다.
- Supabase: direct 접속 또는 session-mode pooler(5432). transaction-mode(6543) 금지.
- Nile: 콘솔의 표준 5432 접속 문자열.
- 세 provider 모두 `sslmode=require`가 문자열에 포함되어야 한다. 스크립트는 host가 `localhost`가 아닌데 `sslmode`가 없으면 경고한다.

### D9. 샘플 스키마와 마이그레이션 분할
스키마 이름은 `lab`. 마이그레이션은 두 파일로 나눈다.
- `0001_add_lab`: `lab` 스키마와 `lab.projects(tenant_id uuid, id uuid default gen_random_uuid(), name text not null, archived_at timestamptz, created_at timestamptz not null default now(), primary key (tenant_id, id))`, CHECK `length(btrim(name)) > 0`, partial index `projects(tenant_id) where archived_at is null`.
- `0002_add_tasks`: `lab.tasks(tenant_id, id, project_id uuid not null, title text not null, status text not null default 'todo', position integer not null default 0, created_at, primary key (tenant_id, id), foreign key (tenant_id, project_id) references lab.projects(tenant_id, id) on delete cascade)`, CHECK `status in ('todo','doing','done')`, 복합 인덱스 `tasks(tenant_id, status)`.
- PK와 FK가 `tenant_id`를 포함하는 이유: Nile은 tenant-aware 테이블의 PK에 `tenant_id`가 없으면 거부한다(42P17). 두 열에 `.primaryKey()`를 붙이면 hejbro가 복합 PK를 렌더링한다.
- CHECK와 partial index 술어는 열을 보간하지 않는 raw `sql` 템플릿으로 쓴다. hejbro가 열 참조를 3단계(`"lab"."projects"."name"`)로 렌더링하면 Nile이 42622로 거부하기 때문이다(findings/2026-09-03-nile-rejects-qualified-column-refs.md). 대가로 rename 추적을 잃는다.
`tenants` 테이블은 선언하지 않는다. Nile은 내장 `public.tenants`를 갖고 있어 충돌하고, 다른 provider에서는 실험 목적상 필요 없다. 두 단계로 나누는 이유는 "체인이 두 개 이상일 때 ledger가 순서를 지키는가"를 네 타깃에서 확인하기 위해서다.

### D10. 발견 사항 파일과 게시 스크립트
`findings/YYYY-MM-DD-<slug>.md`는 YAML frontmatter(`title`, `hejbro_version`, `provider`, `kind`, `status`, `discussion`)와 본문으로 구성한다. `scripts/finding.ts validate|post <file>`가 frontmatter를 파싱(의존성 없이 `---` 블록을 직접 파싱, 값은 단순 스칼라만 허용)하고, `post`는 `gh api graphql`로 `repository.id`와 `discussionCategories`를 조회한 뒤 `createDiscussion`을 호출한다. 카테고리 대응은 spec을 따른다. 게시 전 secretlint를 해당 파일에 실행해 비밀이 있으면 거부한다. 게시 후 URL을 frontmatter에 써 넣는다. 템플릿은 `findings/_template.md`에 두고 validate 대상에서 제외한다.
gh 래퍼가 디렉터리 기준으로 계정을 바꾸므로 스크립트는 `gh`를 그대로 호출하되, 게시 직전 `gh api user`로 로그인이 `hejbro-assist`인지 확인하고 아니면 거부한다.

### D11. CI는 DB 없는 검사 네 가지
`.github/workflows/ci.yml`은 `push`(main, dev)와 `pull_request`에서 pnpm 설치 후 `tsc --noEmit`, `hejbro verify`, `secretlint "**/*"`, `finding validate` 전체를 실행한다. Node 24, pnpm은 `packageManager` 필드로 고정한다. 결과 표(`RESULTS.md`)는 사람이 갱신하는 문서라 CI가 검증하지 않는다.

## Risks / Trade-offs

- [pre 버전 API가 예고 없이 바뀐다] → 정확한 버전 고정. 갱신은 후속 변경의 명시적 PR에서만 하고, 그때 네 타깃을 다시 돌린다.
- [Nile이 `public` 외 스키마나 `lab.projects` 같은 FK 대상을 거부할 수 있다] → 첫 적용에서 확인. 거부되면 스키마를 `public`으로 옮기는 별도 마이그레이션이 아니라 체인을 리셋하고 다시 생성한다(아직 실험 초기라 리셋 비용이 0). 그 사실은 첫 finding이 된다.
- [Supabase `check`가 `auth`·`storage` 같은 미선언 스키마를 문제 삼을 수 있다] → `check`는 선언한 객체만 대조한다고 문서화되어 있으나, 아니라면 finding으로 기록한다.
- [push protection이 일반 postgres URL을 못 잡는다] → secretlint pre-commit과 CI 전체 스캔이 실제 게이트다. 훅은 `--no-verify`로 우회 가능하므로 CI 스캔을 반드시 둔다.
- [`.env`가 디스크에 평문으로 있다] → 사용자가 선택한 방식이다. 스크립트가 `.env` 권한이 `600`이 아니면 경고한다. 암호화가 필요해지면 dotenvx로 옮기는 변경을 따로 만든다.
- [hejbro 자체가 오류 메시지에 접속 문자열을 포함할 수 있다] → D4의 후처리와 finding.
- [pre-commit이 대용량 staged 파일에서 느릴 수 있다] → `.secretlintignore`로 lockfile 제외, 검사 대상은 staged 파일만.

## Migration Plan

1. 의존성과 골격, 비밀 보호 장치를 먼저 커밋한다(접속 정보가 아직 없어도 CI가 통과하는 상태).
2. 사용자가 Neon, Nile, Supabase 프로젝트를 만들고 `.env`를 채운다. `pnpm target doctor`로 네 타깃 연결을 확인한다.
3. `postgres` → `nile` → `supabase` → `neon` 순서로 `migrate`·`check`를 돌린다. Nile을 두 번째로 두는 이유는 거부 가능성이 가장 높아 체인 리셋이 필요하다면 일찍 알기 위해서다.
4. 결과 표와 첫 finding을 커밋하고 게시한다.

롤백: 타깃별로 `pnpm target <name> reset`(hejbro가 관리하는 객체만 제거)을 실행하거나 provider 프로젝트를 삭제한다. 저장소 쪽은 feature 브랜치를 버리면 된다.

## Open Questions

- (해결됨 2026-09-03) preset을 등록한 설정으로 `verify`는 통과하지만 preset 검증기를 실행하지 않는다. 게이트는 `pnpm gate:presets`(generate 기반)로 바꿨다.
- Neon, Nile, Supabase의 현재 기본 Postgres 메이저 버전. 결과 표에 기록할 값이며 설계에는 영향이 없다.
- (관찰됨 2026-09-03) `hejbro check` exit 2는 "비교 불가"다. Nile에서 CHECK 제약 비교에 쓰는 EXPLAIN의 command tag를 hejbro가 처리하지 못해 CHECK 3건이 비교 불가였다. 그래서 Nile은 spec의 "check exit 0"을 hejbro 수정 전에는 만족할 수 없다. 결정 필요: Nile은 exit 2를 문서화된 예외로 둘지, portable core에서 CHECK를 뺄지.
