#!/usr/bin/env bash
# ════════════════════════════════════════════════════════════════════════════
# Restauration de Rationarium — L-29.
#
# **Cette procédure détruit la base en place.** Elle est écrite pour être
# exécutée un jour de panne, par quelqu'un qui ne l'a pas écrite, sous
# pression. D'où trois partis pris :
#
#   - Elle **nomme ce qu'elle va détruire** et demande confirmation (`RG-GEN-01`
#     vaut aussi pour l'exploitation). `--sans-confirmation` existe pour les
#     bascules programmées, et il faut l'écrire en toutes lettres.
#   - Elle **arrête l'application avant**, la redémarre après. Restaurer sous
#     une application qui écrit donne une base à moitié restaurée.
#   - Elle **restaure les rôles avant les données**, sinon les `GRANT` de la
#     sauvegarde échouent, et le journal d'audit revient modifiable — sans que
#     rien ne le signale.
#
# Emploi :
#   ./restauration.sh /var/sauvegardes/rationarium/rationarium-20260816T023000Z.dump
#
# L'épreuve du cycle complet — sauvegarde, destruction, restauration,
# vérification des garde-fous — est rejouée à chaque boucle par
# `apps/api/src/exploitation/sauvegarde.int.test.ts`.
# ════════════════════════════════════════════════════════════════════════════

set -euo pipefail

racine="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$racine"

archive="${1:-}"
confirmation="${2:-}"

if [ -z "$archive" ]; then
  echo "emploi : ./restauration.sh <archive.dump> [--sans-confirmation]" >&2
  exit 2
fi
if [ ! -r "$archive" ]; then
  echo "archive illisible : $archive" >&2
  exit 2
fi

if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  . ./.env
  set +a
fi

base="${POSTGRES_BASE:-rationarium}"
utilisateur="${POSTGRES_UTILISATEUR:?POSTGRES_UTILISATEUR manquant}"
roles="${archive%.dump}.roles.sql"

# ── Ce que l'archive contient, avant de détruire quoi que ce soit ────────────
#
# L'archive est copiée DANS le conteneur avant d'être lue. `pg_restore` sur le
# `/dev/stdin` d'un `docker compose exec` rend « did not find magic string in
# file header » sur une archive saine : le tube d'entrée n'arrive pas intact.
# Le découvrir un jour de panne coûterait une heure — et donnerait à croire que
# la sauvegarde est perdue.
docker compose cp "$archive" base:/tmp/rationarium-restauration.dump
nettoyer() { docker compose exec -T base rm -f /tmp/rationarium-restauration.dump >/dev/null 2>&1 || true; }
trap nettoyer EXIT

echo "archive     : $archive"
echo "objets      : $(docker compose exec -T base pg_restore --list /tmp/rationarium-restauration.dump | grep -c ';' || true) entrées"
echo "base cible  : $base (elle sera DÉTRUITE puis recréée)"
[ -r "$roles" ] && echo "rôles       : $roles" || echo "rôles       : ABSENT — les privilèges ne seront pas restaurés"

if [ "$confirmation" != "--sans-confirmation" ]; then
  printf 'Taper le nom de la base pour confirmer la destruction : '
  read -r reponse
  [ "$reponse" = "$base" ] || { echo "abandon."; exit 1; }
fi

# ── 1. Arrêter ce qui écrit ─────────────────────────────────────────────────
echo "── arrêt de l'application ──"
docker compose stop api web

# ── 2. Les rôles d'abord ────────────────────────────────────────────────────
# `CREATE ROLE` est global à l'instance : sur une instance neuve, le rôle
# applicatif n'existe pas, et les `GRANT` de l'archive échoueraient en silence
# — laissant `rationarium_app` sans restriction sur le journal d'audit.
if [ -r "$roles" ]; then
  echo "── restauration des rôles ──"
  docker compose exec -T base psql --username "$utilisateur" --dbname postgres < "$roles" > /dev/null
fi

# ── 3. Base neuve ───────────────────────────────────────────────────────────
echo "── recréation de la base ──"
docker compose exec -T base psql --username "$utilisateur" --dbname postgres \
  -c "DROP DATABASE IF EXISTS \"$base\" WITH (FORCE)" \
  -c "CREATE DATABASE \"$base\" OWNER \"$utilisateur\""

# ── 4. Restauration ─────────────────────────────────────────────────────────
echo "── restauration des données ──"
docker compose exec -T base \
  pg_restore --username "$utilisateur" --dbname "$base" --no-owner --exit-on-error \
  /tmp/rationarium-restauration.dump

# ── 5. Vérification — la partie qu'on saute quand tout a l'air d'aller ──────
echo "── vérification ──"
docker compose exec -T base psql --username "$utilisateur" --dbname "$base" --tuples-only <<'SQL'
\echo 'utilisateurs :'
SELECT count(*) FROM users;
\echo 'contraintes d''exclusion (RG-CNG-25, doit être > 0) :'
SELECT count(*) FROM pg_constraint WHERE contype = 'x';
\echo 'droits de rationarium_app sur audit_log (attendu : INSERT et SELECT, RIEN d''autre) :'
SELECT string_agg(privilege_type, ', ' ORDER BY privilege_type)
FROM information_schema.table_privileges
WHERE grantee = 'rationarium_app' AND table_name = 'audit_log';
SQL

# ── 6. Redémarrage ──────────────────────────────────────────────────────────
echo "── redémarrage ──"
docker compose up -d api web

echo
echo "Restauration terminée. Contrôler la sonde de disponibilité :"
echo "  docker compose exec api node -e \"fetch('http://127.0.0.1:3000/api/sante/pret').then(r=>r.json()).then(console.log)\""
