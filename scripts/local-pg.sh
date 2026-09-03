#!/bin/sh
# 로컬 순정 Postgres 타깃. .env.example의 POSTGRES_DATABASE_URL 기본값과 맞춘다.
#   pnpm local-pg up    # 없으면 만들고, 멈춰 있으면 시작하고, 떠 있으면 그대로 둔다
#   pnpm local-pg down  # 컨테이너와 데이터 제거
#   pnpm local-pg logs  # 로그 추적
set -eu

NAME=hejbro-lab-pg
IMAGE=postgres:18-alpine
HOST_PORT=54329
DB_NAME=hejbro_lab
DB_USER=postgres
DB_PASSWORD=postgres   # 로컬 전용 기본값. .env.example과 동일.

container_state() {
  # docker inspect는 실패해도 stdout에 빈 줄을 찍으므로 개행을 지우고 빈 값이면 absent로 본다
  state=$(docker inspect -f '{{.State.Status}}' "$NAME" 2>/dev/null | tr -d '\n')
  if [ -z "$state" ]; then echo "absent"; else echo "$state"; fi
}

wait_ready() {
  i=0
  while [ "$i" -lt 30 ]; do
    if docker exec "$NAME" pg_isready -U "$DB_USER" -d "$DB_NAME" >/dev/null 2>&1; then
      echo "local-pg: ready on localhost:$HOST_PORT/$DB_NAME"
      return 0
    fi
    i=$((i + 1))
    sleep 1
  done
  echo "local-pg: postgres did not become ready in 30s" >&2
  return 1
}

case "${1:-}" in
  up)
    case "$(container_state)" in
      running)
        echo "local-pg: already running"
        ;;
      absent)
        docker run -d --name "$NAME" \
          -e POSTGRES_USER="$DB_USER" \
          -e POSTGRES_PASSWORD="$DB_PASSWORD" \
          -e POSTGRES_DB="$DB_NAME" \
          -p "$HOST_PORT:5432" \
          "$IMAGE" >/dev/null
        echo "local-pg: created $NAME ($IMAGE)"
        ;;
      *)
        docker start "$NAME" >/dev/null
        echo "local-pg: started $NAME"
        ;;
    esac
    wait_ready
    ;;
  down)
    docker rm -f "$NAME" >/dev/null 2>&1 && echo "local-pg: removed $NAME" || echo "local-pg: nothing to remove"
    ;;
  logs)
    docker logs -f "$NAME"
    ;;
  *)
    echo "usage: local-pg.sh up|down|logs" >&2
    exit 2
    ;;
esac
