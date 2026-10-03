#!/usr/bin/env bash
set -euo pipefail
image=${1:?Image PostgreSQL requise}
# Un redémarrage doit accepter les PG_VERSION internes au cluster Alpine.
docker run --rm --network none --entrypoint bash "$image" -ec '
  test ! -e /usr/local/bin/gosu
  test "$(su-exec postgres id -u)" = 70
  test "$PGDATA" = /var/lib/postgresql/18/rationarium-alpine
  apk info -e su-exec
  # Complète le scan de distribution : une CVE peut manquer à son catalogue.
  for paquet in libxml2 libxslt llvm21-libs perl sqlite-libs acl-libs pcre2 systemd eudev-libs gzip minizip; do
    if apk info -e "$paquet"; then echo "Composant interdit : $paquet" >&2; exit 1; fi
  done
  test -z "$(find /usr /lib -name '*libxml2*' -o -name '*libxslt*' -o -name '*LLVM*')"
  configuration=$(pg_config --configure)
  for option in without-libxml without-libxslt without-llvm; do
    printf "%s" "$configuration" | grep -q -- "--$option"
  done
  minimum() {
    paquet=$1; seuil=$2; branche=$3
    version=$(apk info -v -e "$paquet"); version=${version#"$paquet"-}
    case "$version" in "$branche"*) ;; *) echo "Branche à réexaminer : $paquet@$version" >&2; exit 1;; esac
    test "$(apk version -t "$version" "$seuil")" != "<"
    printf "%s %s : version corrigée exigée (%s)\n" "$paquet" "$version" "$seuil"
  }
  minimum libssl3 3.5.9-r0 3.5.
  minimum libcrypto3 3.5.9-r0 3.5.
  minimum libldap 2.6.15-r0 2.6.
  minimum libncursesw 6.6_p20260516-r0 6.6_
  minimum libuuid 2.42.3-r1 2.42.
  minimum zlib 1.3.2-r0 1.3.
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
