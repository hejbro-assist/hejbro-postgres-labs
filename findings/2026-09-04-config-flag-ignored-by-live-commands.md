---
title: verify·check·migrate·status·reset 이 --config 를 조용히 무시하고 cwd 의 hejbro.config.ts 만 읽는다
hejbro_version: 0.2.0-pre.1
provider: all
kind: bug
status: draft
discussion: 
---

## 요약

`hejbro check --config hejbro.nile.config.ts` 는 오류 없이 실행되지만 실제로는 `hejbro.config.ts` 를 읽는다. `node_modules/hejbro/dist/cli.js` 에서 `--config` 를 `loadConfig` 에 넘기는 명령은 `generate` 와 `history` 뿐이고, `verify`·`check`·`migrate`·`status`·`reset`·`restore` 는 `loadConfig(cwd, undefined)` 를 호출한다. 그래서 preset 을 별도 설정 파일에 두는 방식(provider 별 `hejbro.<provider>.config.ts`)으로는 pre.1 의 두 픽스 — `verify` 의 preset 검증기(#752), `explainUnavailable` 을 선언한 preset 의 text 비교 `check`(#755) — 에 닿을 수 없다. hejbro #819 가 같은 사실을 `check`·`verify`·`reset`·`restore` 에 대해 이미 적고 있다. 여기서는 `migrate` 와 `status` 도 같고, 플래그가 거부되지 않고 조용히 무시된다는 점을 보탠다.

## 재현 절차

1. `hejbro.config.ts` 는 `presets: []`, `hejbro.nile.config.ts` 는 같은 entry 에 `presets: [nilePreset]` 으로 둔다.
2. `hejbro verify --config hejbro.nile.config.ts` → `verify: 5 checks passed`.
3. `hejbro.nile.config.ts` 를 `hejbro.config.ts` 이름으로 복사한 디렉터리에서 `hejbro verify` → `verify: 6 checks passed` (preset 검증기 검사가 붙는다).
4. Nile 에 `hejbro check --config hejbro.nile.config.ts` → `command tag EXPLAIN unhandled` 로 exit 2 (EXPLAIN 경로). 3 과 같은 디렉터리에서 `hejbro check` → `check-constraint expressions were compared by normalized text on this run` (text 경로).
5. `hejbro check --help` 는 `--url` 만 나열하고 `--config` 를 언급하지 않는다.

## 기대 결과

`--config` 를 모든 명령이 읽거나, 받지 않는 명령은 알 수 없는 플래그로 거부한다. 조용히 무시하면 사용자는 preset 이 적용됐다고 믿게 된다(pre.0 에서 "verify 가 preset 검증기를 돌리지 않는다"고 보고한 finding 의 실제 원인도 이것이었을 수 있다).

## 실제 결과

2·4 처럼 기본 설정으로 실행된다. 오류도 경고도 없다.

## 우회

`scripts/provider-workdir.ts` 가 `.hejbro-target/<provider>/` 에 provider 설정을 `hejbro.config.ts` 로 복사하고 `src`·`migrations`·`hejbro.snapshot.json`·`certs` 를 심볼릭 링크한 뒤, 그 디렉터리를 cwd 로 hejbro 를 실행한다. 접속 문자열의 상대 경로(`sslrootcert=certs/...`)도 이 링크로 풀린다.

## 환경

- hejbro 0.2.0-pre.1 (`dist/cli.js` 의 `runCheck`, `runVerify`, `runMigrate`, `runStatus`, `runReset`, `runRestore`)
- 관련 hejbro 이슈: #819
