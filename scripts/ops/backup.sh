#!/usr/bin/env bash
# Linux operator artifact. UNTESTED against Oracle; invoke through the secret wrapper.
set -euo pipefail
set +x
umask 077
ROOT="$(git -C "$(dirname -- "${BASH_SOURCE[0]}")" rev-parse --show-toplevel)"
COMPOSE=(docker compose -p gifts-oracle --project-directory "$ROOT" -f "$ROOT/docs/deployment/docker-compose.oracle.yml")
fail() { printf '%s\n' 'ERROR: Backup failed; inspect locally through the secret wrapper.' >&2; exit 1; }
trap fail ERR
: "${BACKUP_DIR:?set an absolute external private backup directory}"
[[ "$BACKUP_DIR" = /* && -d "$BACKUP_DIR" && ! -L "$BACKUP_DIR" ]] || fail
[[ "$(stat -c %a "$BACKUP_DIR")" = 700 && "$(stat -c %u "$BACKUP_DIR")" = "$(id -u)" ]] || fail
command -v flock >/dev/null || fail
exec 9>"$BACKUP_DIR/.backup.lock"
flock -n 9 || fail
# A quiet ledger plus quiet media is a consistent recovery point. Do not stop writers implicitly.
running="$("${COMPOSE[@]}" ps --status running --services 2>/dev/null)"
case $'\n'"$running"$'\n' in *$'\napp\n'*|*$'\nworker\n'*) fail ;; esac
bundle="$(mktemp -d "$BACKUP_DIR/.gifts-$(date -u +%Y%m%dT%H%M%SZ)-XXXXXX")"
cleanup() { if [[ -n "${bundle:-}" && -d "$bundle" ]]; then rm -rf -- "$bundle"; fi; }
trap cleanup EXIT
"${COMPOSE[@]}" exec -T postgres sh -c 'exec pg_dump --format=custom --no-owner --no-acl -U "$POSTGRES_USER" -d "$POSTGRES_DB"' >"$bundle/database.dump" 2>/dev/null
"${COMPOSE[@]}" exec -T postgres pg_restore --list <"$bundle/database.dump" >/dev/null 2>&1
mkdir -m 700 "$bundle/media"
"${COMPOSE[@]}" cp app:/data/media/. "$bundle/media" >/dev/null 2>&1
# Do not follow symlinks in stored media.
tar -C "$bundle/media" -cf "$bundle/media.tar" . 2>/dev/null
rm -rf -- "$bundle/media"
(cd "$bundle" && sha256sum database.dump media.tar >SHA256SUMS)
# Strip the temporary leading dot; publish only after both archives and hashes succeed.
name="${bundle##*/}"
final="$BACKUP_DIR/${name#.}"
[[ ! -e "$final" ]] || fail
mv -T -- "$bundle" "$final"
bundle=''
printf '%s\n' "$final"
