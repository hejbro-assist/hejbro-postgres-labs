## Why

hejbro `0.2.0-pre.1`(2026-09-04)이 우리가 보고한 quickstart-now/hejbro#750의 다섯 항목(#752~#756)을 고쳤다고 발표했다. 이 저장소의 결과 표와 findings는 전부 `0.2.0-pre.0` 기준이므로, 같은 네 타깃(postgres, neon, nile, supabase)에서 픽스를 확인하고 결과를 갱신해야 다음 보고가 의미를 갖는다. 첫 변경은 "가장 공통된 객체"만 다뤘으므로, 이번에는 hejbro가 pre.0에서 함께 내놓은 고급 경로(alter, enum 분할, rename, view, 쿼리 레이어, `assertSchema`)까지 네 타깃에서 실측한다.

## What Changes

- hejbro 패키지 네 개를 `0.2.0-pre.1`로 정확 고정하고, pre.0으로 만든 체인·스냅샷·ledger가 그대로 이어지는지(`verify`, `status`, `check`) 확인한다.
- #750 다섯 항목을 항목별로 재검증한다: `verify --config`의 preset 검증기 실행(#752), `reset`의 FK 순서(#753), CHECK/술어의 2단계 열 참조(#754), EXPLAIN 없는 Nile에서의 `check`(#755), `npx skills add -s hejbro`(#756). 결과를 findings의 `status`와 본문에 기록한다.
- 스키마를 확장해 고급 경로를 체인에 추가한다: CHECK/partial index 술어를 다시 열 보간으로 되돌려 rename 추적을 복구, `pgEnum` 열, `jsonb` 열 + GIN 인덱스, 표현식 unique partial 인덱스, `--rename` 열 이름 변경, 기존 enum에 값 추가 + 같은 run에서 사용(마이그레이션 2파일 분할), join view. 각 경로는 마이그레이션 파일 하나씩이다.
- 쿼리 레이어 실측 스크립트(`pnpm target <t> smoke`)를 추가한다: provider별 드라이버(`pgDriver`, `nileDriver`+`asTenant`, `supabaseDriver`)로 `db()` 핸들을 만들고 `assertSchema`, 트랜잭션·중첩 트랜잭션, insert/upsert/join select/related/delete cascade를 한 번에 돌린다.
- 타깃 스크립트가 provider 설정 파일(`hejbro.<target>.config.ts`)이 있으면 `--config`로 자동 첨부한다. Nile의 `check`는 preset이 선언한 `explainUnavailable`로만 답을 낼 수 있기 때문이다.
- 게이트 `pnpm gate:presets`를 `hejbro verify --config`로 바꾼다(#752가 고쳐졌다면 generate 우회가 필요 없다).
- `RESULTS.md`를 pre.1 결과로 갱신하고, 새 발견 사항은 findings에 기록해 hejbro 이슈로 보고한다.

## Capabilities

### New Capabilities
- `query-layer-smoke`: 네 타깃에서 hejbro 쿼리 레이어(`db()`, provider 드라이버, `assertSchema`, 트랜잭션, 관계 읽기)를 실측하는 스크립트의 동작.

### Modified Capabilities
- `portable-core-schema`: 공통 분모 객체 범위에 enum, jsonb, 표현식/unique/partial 인덱스, view를 추가한다. "제약 식은 열을 한정하지 않는다"를 "2단계(`"table"."column"`)까지 허용"으로 바꾼다. 결과 표에 고급 경로별 결과 열을 요구한다.
- `provider-targets`: `reset`을 리셋 수단으로 요구하고(수동 `drop schema` 금지), provider 설정 파일 자동 첨부와 `smoke` 명령을 추가한다.
- `hejbro-feedback-loop`: 보고한 발견 사항을 새 hejbro 버전에서 재검증하고 결과(`resolved`/미해결)를 파일에 기록하는 요구를 추가한다. 게이트가 `verify --config`로 바뀌면 관련 설명도 따라간다.

## Impact

- `package.json`(hejbro 네 패키지 버전), `pnpm-lock.yaml`.
- `src/lab.schema.ts`, `migrations/0003~0008`, `hejbro.snapshot.json`.
- `scripts/target.ts`(`--config` 자동 첨부, `smoke` 명령), 새 `scripts/smoke.ts`, `scripts/preset-gate.sh` 교체, `.github/workflows/ci.yml`.
- `findings/2026-09-03-*.md`의 `status`와 재검증 절, 새 findings, `RESULTS.md`.
- `.claude/skills/hejbro`(pre.1 스킬로 갱신, `-s hejbro` 사용).
- 검증 기준: 네 타깃에서 `migrate` exit 0, `check` exit 0(Nile 포함), `reset` 후 재`migrate` exit 0, `smoke` exit 0. 어느 하나라도 아니면 원인 층(우리 코드 / hejbro / provider)을 밝혀 finding으로 남긴다. 알려진 미해결 이슈(#772 view/query의 3단계 참조, #781 generated column)는 결과에 "측정값"으로 남기되 spec을 낮추지 않는다.
