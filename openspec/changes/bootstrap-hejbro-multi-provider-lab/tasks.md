## 1. 프로젝트 골격과 의존성

- [x] 1.1 `package.json`에 `type: module`, `packageManager`(pnpm 11 고정), 스크립트 자리(`target`, `local-pg`, `finding`, `verify`, `check-types`)를 추가하고 `pnpm install`이 성공하는지 확인한다
- [x] 1.2 `hejbro`, `@hejbro/pg`, `@hejbro/nile`, `@hejbro/supabase`를 `0.2.0-pre.0` 정확 고정으로, `pg`·`@types/pg`·`typescript`를 devDependency로 추가하고 `pnpm exec hejbro --help`가 `v0.2.0-pre.0`을 출력하는지 확인한다
- [x] 1.3 `tsconfig.json`(ESM, strict, `noEmit`)을 만들고 `pnpm check-types`가 빈 프로젝트에서 통과하는지 확인한다
- [x] 1.4 `pnpm exec hejbro init`으로 `hejbro.config.ts`, `migrations/`, `hejbro.snapshot.json`을 생성하고 design D2대로 `entry`·`presets: []`를 설정한 뒤 파일 세 개가 존재하는지 확인한다

## 2. credential 보호 장치

- [x] 2.1 `.gitignore`에 `.env`, `.env.local`, `.env.*.local`, `*.pem`, `*.key`를 추가하고 `.env` 더미 파일을 만들어 `git status`에 나타나지 않는지 확인한 뒤 더미를 지운다
- [x] 2.2 `.env.example`에 네 변수(`NEON_DATABASE_URL`, `NILE_DATABASE_URL`, `SUPABASE_DATABASE_URL`, `POSTGRES_DATABASE_URL`)를 `USER:PASSWORD` placeholder(postgres는 로컬 실제 기본값)와 provider별 접속 경로 주석(D8)으로 작성하고 파일이 커밋 가능한지 확인한다
- [x] 2.3 `secretlint`, `@secretlint/secretlint-rule-preset-recommend`, `@secretlint/secretlint-rule-pattern`을 devDependency로 추가하고 `.secretlintrc.json`(preset + provider 호스트 패턴)과 `.secretlintignore`(`pnpm-lock.yaml`, `node_modules`, `.env.example`)를 작성한 뒤, 가짜 접속 문자열이 든 임시 파일에 `pnpm exec secretlint`가 실패하는지 확인한다
- [x] 2.4 `.husky/pre-commit`에 staged 파일만 secretlint로 검사하는 훅을 작성하고, 가짜 접속 문자열 파일을 stage해 커밋이 거부되는지·`.env.example`은 통과하는지 확인한다
- [x] 2.5 `.claude/settings.json`에 `permissions.deny`로 `Read(./.env)`, `Read(./.env.local)`, `Read(./.env.*.local)`을 추가하고, CLAUDE.md에 "환경 파일은 열지 않는다" 규칙을 적은 뒤 JSON이 유효한지 확인한다

## 3. 타깃 스크립트와 로컬 Postgres

- [x] 3.1 `scripts/local-pg.sh up|down|logs`를 작성한다(`postgres:18-alpine`, 컨테이너 `hejbro-lab-pg`, 포트 `54329`, DB `hejbro_lab`, `pg_isready` 대기). `up`을 두 번 실행해 컨테이너가 하나만 있고 두 번째 실행이 exit 0인지 확인한다
- [x] 3.2 `scripts/target.ts`의 타깃 → 변수 매핑, 알 수 없는 타깃 거부, 미설정 변수 안내(값 미출력)를 구현하고 `pnpm target planetscale status`와 변수 없는 `pnpm target nile status`가 각각 안내 메시지와 함께 exit 1인지 확인한다
- [x] 3.3 `scripts/target.ts`에 `migrate|status|check|reset` 실행(자식 프로세스 env로 `DATABASE_URL` 전달, argv에 URL 없음)과 URL 파싱 기반 마스킹(D4), 비로컬 host의 `sslmode` 누락 경고, `.env` 권한 600 경고를 구현하고 `pnpm target postgres status` 출력에 `:postgres@`가 없는지 확인한다
- [x] 3.4 `scripts/target.ts doctor`를 구현하고(`pg` 클라이언트로 `select version()` 시도, 설정됨/미설정/연결 성공/실패 사유만 출력) `POSTGRES_DATABASE_URL`만 있는 상태에서 실행해 네 행이 기대대로 표시되는지 확인한다
- [x] 3.5 `package.json` 스크립트를 `node --env-file-if-exists=.env scripts/target.ts` 형태로 연결하고 `.env`가 없을 때도 `pnpm target doctor`가 실행되는지 확인한다

## 4. portable core 스키마

- [x] 4.1 `src/lab.schema.ts`에 D9의 `lab` 스키마와 `projects` 테이블(CHECK, partial index 포함)을 선언하고 `pnpm exec hejbro generate --name add_lab`으로 `0001_add_lab.sql`이 생성되며 배너에 `tenant_id`가 포함되는지 확인한다
- [x] 4.2 `tasks` 테이블(FK on delete cascade, status CHECK, 복합 인덱스)을 추가 선언하고 `pnpm exec hejbro generate --name add_tasks`로 `0002_add_tasks.sql`이 생성되는지 확인한다
- [x] 4.3 `hejbro.nile.config.ts`, `hejbro.supabase.config.ts`(presets만 다름)를 만들고 `pnpm exec hejbro verify --config` 각각의 결과를 기록한다. 스냅샷 불일치로 실패하면 D2의 대체 게이트(`generate --config`의 오류 유무)로 바꾸고 그 사실을 finding 초안으로 남긴다
- [x] 4.4 `pnpm verify`(`hejbro verify`)가 통과하고 `pnpm check-types`가 통과하는지 확인한다

## 5. 발견 사항 기록과 게시

- [x] 5.1 `findings/_template.md`와 `findings/README.md`(필드 설명, kind→카테고리 대응표)를 작성한다
- [x] 5.2 `scripts/finding.ts validate <file|all>`을 구현하고(frontmatter 필수 필드, `kind`·`provider` 허용값, bug/improvement의 세 섹션) 유효한 파일은 exit 0, `hejbro_version` 누락 파일은 필드 이름과 함께 exit 1인지 확인한다
- [x] 5.3 `scripts/finding.ts post <file>`을 구현한다(secretlint 사전 검사, `gh api user`로 `hejbro-assist` 확인, GraphQL로 repository·category id 조회 후 `createDiscussion`, URL을 frontmatter에 기록, URL이 있으면 거부). 접속 문자열이 든 파일로 실행해 거부되는지, `discussion`이 채워진 파일로 실행해 중복 생성이 없는지 확인한다

## 6. CI

- [x] 6.1 `.github/workflows/ci.yml`을 작성한다(push main/dev, pull_request, Node 24, pnpm frozen install, `check-types`, `verify`, `secretlint "**/*"`, `finding validate all`). 워크플로우 파일이 `actionlint` 또는 `gh workflow view`로 문법 오류 없이 인식되는지 확인한다
- [x] 6.2 feature 브랜치를 push해 PR을 만들고 CI 네 단계가 모두 통과하는지 확인한다

## 7. provider 준비 (사용자 작업)

- [ ] 7.1 사용자가 Neon 프로젝트를 만들고 direct(non-pooled) 접속 문자열을 `.env`의 `NEON_DATABASE_URL`에 넣는다. `pnpm target doctor`에서 `neon`이 연결 성공으로 표시되는지 확인한다
- [ ] 7.2 사용자가 Nile 데이터베이스를 만들고 접속 문자열을 `NILE_DATABASE_URL`에 넣는다. `doctor`에서 `nile`이 연결 성공인지 확인한다
- [ ] 7.3 사용자가 Supabase 프로젝트를 만들고 direct 또는 session pooler(5432) 접속 문자열을 `SUPABASE_DATABASE_URL`에 넣는다. `doctor`에서 `supabase`가 연결 성공인지 확인한다

## 8. 네 타깃 적용과 대조 (검증)

- [x] 8.1 `postgres` 타깃에 `migrate` → `check` → `migrate`(재실행)를 돌려 exit 0 / 0 / "nothing to apply"인지 확인하고 결과를 기록한다
- [ ] 8.2 `nile` 타깃에 같은 순서를 돌린다. `lab` 스키마나 FK가 거부되면 D9의 리스크 절차(체인 리셋 후 `public`으로 재생성)를 따르고 finding을 작성한다
- [ ] 8.3 `supabase` 타깃에 같은 순서를 돌리고 결과를 기록한다
- [ ] 8.4 `neon` 타깃에 같은 순서를 돌리고 결과를 기록한다
- [ ] 8.5 `RESULTS.md`에 네 행(타깃, hejbro 버전, Postgres 버전, migrate/check 결과, 비고)을 작성하고 커밋한다
- [x] 8.6 `git log -p`와 CI 로그에서 `://[^/]*:[^@]*@` 패턴을 grep해 접속 문자열이 한 건도 없는지 확인한다

## 9. 첫 피드백

- [x] 9.1 8단계에서 나온 발견 사항 중 최소 한 건을 `findings/`에 작성하고 `pnpm finding validate`가 통과하는지 확인한다
- [ ] 9.2 `pnpm finding post`로 게시하고 discussion 작성자가 `hejbro-assist`인지, 파일에 URL이 기록되었는지 확인한다
