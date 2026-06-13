#!/usr/bin/env bash
# ============================================================================
# Calldone ws/db — SQL/RLS test runner.
#
# Preferred path (matches the contract, R21): `supabase db reset` then run the
# numbered test files in supabase/tests/. If the Supabase CLI is installed this
# script uses it. If not, it falls back to an ephemeral `supabase/postgres`
# Docker container that ships the same auth schema, the anon/authenticated/
# service_role roles, pg_cron, and the supabase_realtime publication — i.e. a
# faithful stand-in for `supabase db reset`.
#
# In the Docker-fallback path the script first installs the two pieces a hosted
# Supabase project provides natively but this base image lacks at this version:
#   * auth.jwt() and claims-reading auth.uid()/auth.role() (read request.jwt.claims)
#   * the auth.users.is_anonymous column
# These are HARNESS fixtures only — they are NOT part of the migration.
#
# Usage:
#   supabase/tests/run.sh            # auto-detect: CLI if present, else Docker
#   supabase/tests/run.sh --docker   # force the Docker fallback
#
# Exit code 0 = all tests passed; non-zero = a migration error or a failed
# assertion (raised exception under ON_ERROR_STOP=1).
# ============================================================================
set -euo pipefail

export PATH="/usr/bin:/bin:/usr/local/bin:/opt/homebrew/bin:$PATH"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SUPA_DIR="$(cd "$HERE/.." && pwd)"
MIGRATION="$SUPA_DIR/migrations/00000000000000_initial_schema.sql"
SEED="$SUPA_DIR/seed.sql"

FORCE_DOCKER=0
[ "${1:-}" = "--docker" ] && FORCE_DOCKER=1

run_tests_with_psql() {
  # $1 = psql connection args (as a single string)
  local CONN="$1"
  echo "---- applying numbered test files ----"
  # 00_helpers first, then 01..NN in lexical order.
  # shellcheck disable=SC2086
  psql $CONN -v ON_ERROR_STOP=1 -q -f "$HERE/00_helpers.sql"
  for f in $(ls "$HERE"/[0-9][0-9]_*.sql | sort); do
    [ "$(basename "$f")" = "00_helpers.sql" ] && continue
    # shellcheck disable=SC2086
    psql $CONN -v ON_ERROR_STOP=1 -q -f "$f"
  done
}

if [ "$FORCE_DOCKER" -eq 0 ] && command -v supabase >/dev/null 2>&1; then
  echo "==> Supabase CLI detected; using 'supabase db reset'"
  ( cd "$SUPA_DIR/.." && supabase db reset )
  # supabase exposes the local db on 54322 by default (config.toml [db].port)
  CONN="-h 127.0.0.1 -p 54322 -U postgres -d postgres"
  export PGPASSWORD="${PGPASSWORD:-postgres}"
  run_tests_with_psql "$CONN"
  echo "ALL TESTS PASSED (supabase db reset path)"
  exit 0
fi

echo "==> Supabase CLI not found (or --docker forced); using Docker fallback"
command -v docker >/dev/null 2>&1 || { echo "ERROR: docker not available"; exit 2; }

IMAGE="supabase/postgres:15.8.1.060"
CONTAINER="calldone_wsdb_test"
PORT="${WSDB_TEST_PORT:-55432}"
export PGPASSWORD=postgres
CONN="-h 127.0.0.1 -p $PORT -U postgres -d postgres"

docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
docker run -d --name "$CONTAINER" -e POSTGRES_PASSWORD=postgres -p "$PORT:5432" "$IMAGE" >/dev/null
echo "---- waiting for postgres ----"
# The image restarts the server once during first-time init, so a single
# pg_isready can race that bounce. Require a real client SELECT to succeed, and
# require it twice in a row to be sure we are past the restart.
ok=0
for _ in $(seq 1 90); do
  if psql $CONN -tAc 'select 1' >/dev/null 2>&1; then
    ok=$((ok+1)); [ "$ok" -ge 2 ] && break
  else
    ok=0
  fi
  sleep 1
done
[ "$ok" -ge 2 ] || { echo "ERROR: postgres did not become ready"; docker logs "$CONTAINER" 2>&1 | tail -20; exit 2; }

echo "---- installing harness fixtures (auth.jwt/uid/role from claims; is_anonymous) ----"
psql $CONN -v ON_ERROR_STOP=1 -q <<'SQL'
create or replace function auth.jwt() returns jsonb language sql stable as $fn$
  select coalesce(
    nullif(current_setting('request.jwt.claim', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')
  )::jsonb;
$fn$;
create or replace function auth.uid() returns uuid language sql stable as $fn$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid;
$fn$;
create or replace function auth.role() returns text language sql stable as $fn$
  select coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')
  )::text;
$fn$;
alter table auth.users add column if not exists is_anonymous boolean not null default false;
SQL

echo "---- applying migration ----"
psql $CONN -v ON_ERROR_STOP=1 -q -f "$MIGRATION"

echo "---- applying seed (idempotency-checked) ----"
psql $CONN -v ON_ERROR_STOP=1 -q -f "$SEED"
psql $CONN -v ON_ERROR_STOP=1 -q -f "$SEED"   # second run must be a no-op

run_tests_with_psql "$CONN"

echo "---- tearing down container ----"
docker rm -f "$CONTAINER" >/dev/null 2>&1 || true

echo "ALL TESTS PASSED (Docker fallback path)"
