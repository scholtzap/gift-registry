#!/usr/bin/env bash
# Linux operator artifact. No drop, --clean, implicit database creation, or auto rollback.
# UNTESTED against Oracle; invoke through the secret wrapper after reviewing a trusted dump.
set -euo pipefail
set +x
umask 077
ROOT="$(git -C "$(dirname -- "${BASH_SOURCE[0]}")" rev-parse --show-toplevel)"
COMPOSE=(docker compose -p gifts-oracle --project-directory "$ROOT" -f "$ROOT/docs/deployment/docker-compose.oracle.yml")
fail() { printf '%s\n' 'ERROR: Restore refused or failed; app must remain stopped.' >&2; exit 1; }
trap fail ERR
[[ $# = 2 ]] || fail
bundle="$1"
target="$2"
[[ "$bundle" = /* && -d "$bundle" && ! -L "$bundle" ]] || fail
[[ "$(stat -c %a "$bundle")" = 700 && "$(stat -c %u "$bundle")" = "$(id -u)" ]] || fail
[[ "$target" =~ ^[a-z][a-z0-9_]{0,62}$ && "$target" != postgres && "$target" != template0 && "$target" != template1 ]] || fail
for file in database.dump media.tar SHA256SUMS; do
  [[ -f "$bundle/$file" && ! -L "$bundle/$file" ]] || fail
done
(cd "$bundle" && sha256sum --check --status SHA256SUMS) || fail
running="$("${COMPOSE[@]}" ps --status running --services 2>/dev/null)"
case $'\n'"$running"$'\n' in *$'\napp\n'*|*$'\nworker\n'*) fail ;; esac
# The target must already exist and have no non-system relations. Never clear an existing DB.
relation_sql="SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname NOT LIKE 'pg_toast%' AND c.relkind IN ('r','p','S','v','m','f');"
relations="$("${COMPOSE[@]}" exec -T postgres sh -c 'exec psql -X -At -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$1" -c "$2"' sh "$target" "$relation_sql" 2>/dev/null)"
[[ "$relations" = 0 ]] || fail
# pg_dump does not include cluster roles; policy TO clauses need these before restoration.
role_sql="SELECT count(*) FROM pg_roles WHERE rolname IN ('app_owned','app_friend') AND NOT rolcanlogin;"
roles="$("${COMPOSE[@]}" exec -T postgres sh -c 'exec psql -X -At -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$1" -c "$2"' sh "$target" "$role_sql" 2>/dev/null)"
[[ "$roles" = 2 ]] || fail
"${COMPOSE[@]}" exec -T postgres pg_restore --list <"$bundle/database.dump" >/dev/null 2>&1
printf 'WARNING: Restore trusted database archive into empty target %s. Media is NOT restored. Type RESTORE %s to continue: ' "$target" "$target" >/dev/tty
IFS= read -r confirmation </dev/tty || fail
[[ "$confirmation" = "RESTORE $target" ]] || fail
"${COMPOSE[@]}" exec -T postgres sh -c 'exec pg_restore --exit-on-error --single-transaction --no-owner --no-acl -U "$POSTGRES_USER" --dbname="$1"' sh "$target" <"$bundle/database.dump" >/dev/null 2>&1
printf '%s\n' 'OK: Database restored. Keep app stopped; reapply policies, restore media to a new volume, and run leak checks before switching traffic.'
