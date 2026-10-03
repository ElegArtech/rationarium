#!/usr/bin/env bash
set -euo pipefail
# Même un changement manuel de PGDATA ne doit pas rouvrir une base glibc.
[[ "$PGDATA" == /var/lib/postgresql/18/rationarium-alpine ]] || {
  echo 'PGDATA incompatible : utiliser le répertoire Alpine livré.' >&2; exit 1;
}
ancien=$(find /var/lib/postgresql -path "$PGDATA" -prune -o -name PG_VERSION -print -quit)
if [[ -n "$ancien" ]]; then
  echo 'Ancienne base détectée : migration logique vers un volume neuf obligatoire. Consulter docs/migration-postgresql.md.' >&2
  exit 1
fi
exec /usr/local/bin/docker-entrypoint.sh "$@"
