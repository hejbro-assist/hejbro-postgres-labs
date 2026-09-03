#!/bin/sh
# provider preset 호환성 게이트. `hejbro verify --config` 는 preset 검증기를 돌리지 않으므로
# (findings/2026-09-03-verify-skips-preset-validators.md) preset 을 등록한 설정으로 generate 를
# 실행해 (1) 검증기 오류가 없고 (2) 아무 파일도 쓰지 않았음을 확인한다.
set -eu
for provider in nile supabase; do
  config="hejbro.$provider.config.ts"
  before=$(git status --porcelain -- migrations hejbro.snapshot.json)
  pnpm -s exec hejbro generate --config "$config"
  after=$(git status --porcelain -- migrations hejbro.snapshot.json)
  if [ "$before" != "$after" ]; then
    echo "preset-gate: $config 로 generate 가 파일을 썼습니다. 공유 설정으로 먼저 generate 하세요." >&2
    exit 1
  fi
  echo "preset-gate: $provider ok"
done
