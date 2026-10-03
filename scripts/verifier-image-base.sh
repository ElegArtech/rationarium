#!/usr/bin/env bash
set -euo pipefail
image=${1:?Image PostgreSQL requise}
# Un redémarrage doit accepter les PG_VERSION internes au cluster Alpine.
docker run --rm --network none --entrypoint bash "$image" -ec '
  test ! -e /usr/local/bin/gosu
  test "$(su-exec postgres id -u)" = 70
  test "$PGDATA" = /var/lib/postgresql/18/rationarium-alpine
  apk info -e su-exec
  mkdir -p "$PGDATA/base/1"
  touch "$PGDATA/PG_VERSION" "$PGDATA/base/1/PG_VERSION"
  bash /usr/local/bin/entree-rationarium.sh postgres --version
'
# Les anciens emplacements standards et personnalisés doivent tous être refusés.
for emplacement in 18/docker ancien/personnalise; do
  docker run --rm --network none --entrypoint bash "$image" -ec '
    mkdir -p "/var/lib/postgresql/$1"
    touch "/var/lib/postgresql/$1/PG_VERSION"
    if bash /usr/local/bin/entree-rationarium.sh postgres --version > /tmp/verdict 2>&1; then
      echo "Ancien stockage accepté à tort." >&2; exit 1
    fi
    grep -q "Ancienne base détectée" /tmp/verdict
  ' -- "$emplacement"
done
