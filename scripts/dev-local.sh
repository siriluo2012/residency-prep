#!/usr/bin/env bash
# Bring up a fully local stack: Postgres, schema, staged content, demo publish.
# Does not need ANTHROPIC_API_KEY or a Supabase project.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

PORT="${RP_PG_PORT:-55432}"
DATABASE_URL="${DATABASE_URL:-postgresql://postgres@127.0.0.1:${PORT}/postgres}"
export DATABASE_URL

write_env() {
  local dest="$1"
  if [[ -f "$dest" ]] && grep -q '^DATABASE_URL=' "$dest" 2>/dev/null; then
    return
  fi
  cat > "$dest" <<EOF
# Local development — no Supabase, no Anthropic required.
DATABASE_URL=${DATABASE_URL}
NEXT_PUBLIC_SITE_URL=http://localhost:3000
RP_SINK=file
RP_EMBED_BACKEND=hash
# Optional always-on local user (skips /login; Sign out will not work):
# RP_DEV_USER_ID=00000000-0000-4000-8000-000000000001
# RP_DEV_USER_EMAIL=physician@localhost
EOF
  echo "wrote $dest"
}

write_env "$ROOT/.env"
write_env "$ROOT/apps/web/.env"

pg_up() {
  if command -v pg_isready >/dev/null 2>&1; then
    pg_isready -h 127.0.0.1 -p "$PORT" -q && return 0
  fi
  if command -v python3 >/dev/null 2>&1; then
    python3 - <<PY >/dev/null 2>&1 && return 0 || true
import socket
s = socket.create_connection(("127.0.0.1", int("$PORT")), 1)
s.close()
PY
  fi
  return 1
}

if pg_up; then
  echo "Postgres already listening on 127.0.0.1:${PORT}"
else
  started=
  if command -v docker >/dev/null 2>&1; then
    docker compose up -d
    started=docker
  elif command -v podman >/dev/null 2>&1; then
    podman compose up -d || podman-compose up -d
    started=podman
  elif command -v apptainer >/dev/null 2>&1; then
    DATADIR="${RP_PGDATA:-$ROOT/.pgdata}"
    mkdir -p "$DATADIR"
    echo "Starting Postgres 16 with Apptainer (data dir $DATADIR)"
    apptainer instance stop rp-pg >/dev/null 2>&1 || true
    apptainer instance start --bind "$DATADIR:/var/lib/postgresql/data" docker://postgres:16 rp-pg \
      postgres -c listen_addresses=127.0.0.1 -p "$PORT" || true
    started=apptainer
  fi
  if [[ -z "${started:-}" ]]; then
    echo "No Postgres on :${PORT} and no docker/podman/apptainer. Start one, then re-run." >&2
    echo "  docker compose up -d" >&2
    echo "  export DATABASE_URL=$DATABASE_URL" >&2
    exit 1
  fi
  echo "Waiting for Postgres..."
  for i in $(seq 1 40); do
    pg_up && break
    sleep 1
  done
  pg_up || { echo "Postgres did not become ready on :${PORT}" >&2; exit 1; }
fi

node apps/web/scripts/apply-sql.mjs apps/web/scripts/local-auth-shim.sql
npm run db:migrate
npm run db:seed
npm run db:load-staged -w apps/web
npm run db:publish-demo -w apps/web

echo
echo "Local stack ready."
echo "  DATABASE_URL=$DATABASE_URL"
echo "  npm run dev          # http://localhost:3000"
echo "  Sign in → Continue locally (physician) for QBank, flashcards, review, OET."
echo "  Anthropic and Supabase are optional (see README)."
