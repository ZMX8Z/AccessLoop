#!/usr/bin/env bash
# Credentials are accepted only through the environment and never printed.
set -euo pipefail
umask 077
fail() { printf '%s\n' "$1" >&2; exit 2; }
[ "$#" -eq 2 ] || fail 'USAGE: backup-restore.sh backup|restore /absolute/path/database.dump'
action="$1"
archive="$2"
case "$archive" in /*) ;; *) fail 'ARCHIVE_PATH_MUST_BE_ABSOLUTE' ;; esac
case "$action" in backup|restore) ;; *) fail 'ACTION_INVALID' ;; esac
command -v node >/dev/null 2>&1 || fail 'NODE_MISSING'
command -v shasum >/dev/null 2>&1 || fail 'SHASUM_MISSING'
load_connection() {
  local connection_variables item
  connection_variables=$(CONNECTION_TO_VALIDATE="$1" node <<'NODE'
try {
  const u = new URL(process.env.CONNECTION_TO_VALIDATE)
  if (!["postgres:", "postgresql:"].includes(u.protocol) || !u.hostname || u.pathname.length < 2 || u.hash) throw new Error()
  const values = { PGHOST: u.hostname.replace(/^\[|\]$/g, ''), PGPORT: u.port || '5432', PGUSER: decodeURIComponent(u.username), PGPASSWORD: decodeURIComponent(u.password), PGDATABASE: decodeURIComponent(u.pathname.slice(1)), PGCONNECT_TIMEOUT: '5', PGPASSFILE: '/dev/null' }
  const options = { sslmode: 'PGSSLMODE', sslrootcert: 'PGSSLROOTCERT', sslcert: 'PGSSLCERT', sslkey: 'PGSSLKEY', sslpassword: 'PGSSLPASSWORD', channel_binding: 'PGCHANNELBINDING', ssl_min_protocol_version: 'PGSSLMINPROTOCOLVERSION', application_name: 'PGAPPNAME', options: 'PGOPTIONS', target_session_attrs: 'PGTARGETSESSIONATTRS', gssencmode: 'PGGSSENCMODE' }
  for (const [key, value] of u.searchParams) {
    if (key === 'connect_timeout') continue
    if (!options[key]) throw new Error()
    values[options[key]] = value
  }
  if (Object.values(values).some(value => /[\x00-\x1f]/.test(value))) throw new Error()
  for (const [key, value] of Object.entries(values)) console.log(key + '=' + value)
} catch { process.exit(1) }
NODE
) || fail 'DATABASE_URL_INVALID'
  unset PGHOST PGHOSTADDR PGPORT PGUSER PGPASSWORD PGDATABASE PGSERVICE PGSERVICEFILE PGOPTIONS PGAPPNAME PGSSLMODE PGSSLROOTCERT PGSSLCERT PGSSLKEY PGSSLPASSWORD PGCHANNELBINDING PGSSLMINPROTOCOLVERSION PGTARGETSESSIONATTRS PGGSSENCMODE
  while IFS= read -r item; do export "$item"; done <<< "$connection_variables"
}
cleanup_path=''
trap '[ -z "$cleanup_path" ] || rm -f "$cleanup_path"' EXIT
if [ "$action" = 'backup' ]; then
  [ -n "${DATABASE_URL:-}" ] || fail 'DATABASE_URL_MISSING'
  load_connection "$DATABASE_URL"
  command -v pg_dump >/dev/null 2>&1 || fail 'PG_DUMP_MISSING'
  [ ! -e "$archive" ] && [ ! -L "$archive" ] && [ ! -e "$archive.sha256" ] && [ ! -L "$archive.sha256" ] || fail 'ARCHIVE_ALREADY_EXISTS'
  cleanup_path=$(mktemp "${archive}.partial.XXXXXX") || fail 'ARCHIVE_DIRECTORY_UNAVAILABLE'
  if ! pg_dump --no-password --format=custom --file="$cleanup_path" 2>/dev/null; then fail 'BACKUP_FAILED'; fi
  digest=$(shasum -a 256 "$cleanup_path" | cut -d ' ' -f 1)
  ln "$cleanup_path" "$archive" 2>/dev/null || fail 'ARCHIVE_ALREADY_EXISTS'
  if ! (set -o noclobber; printf '%s\n' "$digest" > "$archive.sha256") 2>/dev/null; then
    rm -f "$archive"
    fail 'CHECKSUM_WRITE_FAILED'
  fi
  printf 'BACKUP_CREATED sha256=%s\n' "$digest"
else
  [ -n "${RESTORE_DATABASE_URL:-}" ] || fail 'RESTORE_DATABASE_URL_MISSING'
  load_connection "$RESTORE_DATABASE_URL"
  [ "${RESTORE_CONFIRM:-}" = 'isolated-empty-database' ] || fail 'RESTORE_REQUIRES_ISOLATED_EMPTY_DATABASE'
  [ "$RESTORE_DATABASE_URL" != "${DATABASE_URL:-}" ] || fail 'RESTORE_TARGET_EQUALS_SOURCE'
  [ -f "$archive" ] && [ ! -L "$archive" ] && [ -f "$archive.sha256" ] && [ ! -L "$archive.sha256" ] || fail 'ARCHIVE_OR_CHECKSUM_MISSING'
  expected=$(cat "$archive.sha256")
  [[ "$expected" =~ ^[a-f0-9]{64}$ ]] || fail 'CHECKSUM_INVALID'
  actual=$(shasum -a 256 "$archive" | cut -d ' ' -f 1)
  [ "$expected" = "$actual" ] || fail 'CHECKSUM_MISMATCH'
  command -v psql >/dev/null 2>&1 || fail 'PSQL_MISSING'
  command -v pg_restore >/dev/null 2>&1 || fail 'PG_RESTORE_MISSING'
  query="SELECT CASE WHEN EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname NOT IN ('pg_catalog', 'information_schema') AND n.nspname NOT LIKE 'pg_toast%' AND c.relkind IN ('r','p','v','m','S','f')) THEN 'nonempty' ELSE 'empty' END"
  target_state=$(psql --no-psqlrc --no-password --tuples-only --no-align --set=ON_ERROR_STOP=1 --command="$query" 2>/dev/null) || fail 'RESTORE_TARGET_CONNECTION_FAILED'
  [ "$target_state" = 'empty' ] || fail 'RESTORE_TARGET_NOT_EMPTY'
  # Empty dbname selects the parsed PGDATABASE value without putting credentials in argv.
  if ! pg_restore --no-password --dbname='' --no-owner --no-privileges --exit-on-error --single-transaction "$archive" 2>/dev/null; then fail 'RESTORE_FAILED_ROLLED_BACK'; fi
  printf 'RESTORE_COMPLETED sha256=%s\n' "$actual"
fi
