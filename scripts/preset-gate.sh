#!/bin/sh
# provider preset 호환성 게이트. hejbro 0.2.0-pre.1 부터 `hejbro verify` 가 등록된 preset 검증기를 함께
# 실행하므로(#752) preset 을 등록한 설정마다 verify 를 돌린다. 다만 verify 는 `--config` 를 무시하고
# cwd 의 hejbro.config.ts 만 읽으므로(findings/2026-09-04-config-flag-ignored-by-live-commands.md)
# scripts/provider-workdir.ts 가 만든 작업 디렉터리에서 실행한다.
# 0.2.0-pre.0 에서는 verify 가 검증기 자체를 건너뛰어 generate 로 우회했다
# (findings/2026-09-03-verify-skips-preset-validators.md).
set -eu
root=$(pwd)
for provider in nile supabase; do
  workdir=$(node scripts/provider-workdir.ts "$provider")
  (cd "$workdir" && "$root/node_modules/.bin/hejbro" verify)
  echo "preset-gate: $provider ok"
done
