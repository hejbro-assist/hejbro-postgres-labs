# 적용 결과

portable core 스키마(`src/lab.schema.ts`, 마이그레이션 2개)를 네 타깃에 적용한 기록.

| 타깃 | hejbro | Postgres | migrate | check | 재migrate | 비고 |
|---|---|---|---|---|---|---|
| postgres | 0.2.0-pre.0 | 18.6 (`postgres:18-alpine`) | exit 0, 2개 적용 | exit 0, no differences | nothing to apply | 2026-09-03 |
| nile | 0.2.0-pre.0 | | | | | |
| supabase | 0.2.0-pre.0 | | | | | |
| neon | 0.2.0-pre.0 | 18.6 (aarch64, ap-southeast-1) | exit 0, 2개 적용 | exit 0, no differences | nothing to apply | 2026-09-03. direct(non-pooled) 접속, sslmode=require. pg 드라이버 SSL 경고 1건(비고 아래) |
