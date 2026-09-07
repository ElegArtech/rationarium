#!/usr/bin/env bash
# ════════════════════════════════════════════════════════════════════════════
# Sauvegarde de Rationarium — L-29.
#
# Une sauvegarde qu'on n'a jamais restaurée n'est pas une sauvegarde : c'est une
# intention. Le cycle complet est rejoué par
# `apps/api/src/exploitation/sauvegarde.int.test.ts`, à chaque boucle.
#
# Ce script fait trois choses, et la troisième est celle qu'on oublie :
#
#   1. Le `pg_dump` en format personnalisé — compressé, restaurable
#      sélectivement, et dont `pg_restore` sait rejouer l'ordre des dépendances.
#   2. Le **contrôle de relisibilité** immédiat : un fichier de sauvegarde
#      illisible se découvre normalement le jour de la panne. `pg_restore
#      --list` le lit sans rien restaurer, et coûte une seconde.
#   3. Les **rôles**, sauvegardés à part. `CREATE ROLE` est global à l'instance
#      et non au schéma : `pg_dump` ne l'emporte pas. Une restauration sur une
#      instance neuve rendrait une base correcte à laquelle l'application ne
#      pourrait pas se connecter, et dont le journal d'audit serait modifiable.
#
# Emploi :
#   ./sauvegarde.sh                 # dans le répertoire deploiement/, avec .env
#
# Depuis cron, une fois par nuit :
#   30 2 * * * cd /opt/rationarium/deploiement && ./sauvegarde.sh >> /var/log/rationarium-sauvegarde.log 2>&1
# ════════════════════════════════════════════════════════════════════════════

set -euo pipefail

racine="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$racine"

# Le `.env` se LIT, il ne se SOURCE pas.
#
# Compose n'interprète pas ce fichier par un shell : `RATIONARIUM_HOTE` y porte
# une liste séparée par des virgules, sans guillemets, ce qui est parfaitement
# licite pour lui. Un `. ./.env` en fait une commande — « 10.88.0.1: command
# not found » — et la sauvegarde s'arrêtait là, sur une ligne qui ne la
# concerne pas. Un script d'exploitation doit lire le fichier de l'exploitation
# tel qu'il est, pas tel qu'un shell l'aimerait.
lire_env() {
  [ -f .env ] || return 0
  while IFS= read -r ligne || [ -n "$ligne" ]; do
    case "$ligne" in "" | "#"*) continue ;; esac
    cle="${ligne%%=*}"
    [ "$cle" = "$ligne" ] && continue
    case "$cle" in *[!A-Za-z0-9_]*) continue ;; esac
    valeur="${ligne#*=}"
    # Compose retire les guillemets encadrants : on fait de même, sinon une
    # valeur citée arriverait ici avec ses guillemets et pas là-bas.
    case "$valeur" in
      \"*\") valeur="${valeur#\"}"; valeur="${valeur%\"}" ;;
      "'"*"'") valeur="${valeur#\'}"; valeur="${valeur%\'}" ;;
    esac
    export "$cle=$valeur"
  done < .env
}
lire_env

destination="${RATIONARIUM_SAUVEGARDES:-/var/sauvegardes/rationarium}"
retention="${RATIONARIUM_RETENTION:-30}"
base="${POSTGRES_BASE:-rationarium}"
utilisateur="${POSTGRES_UTILISATEUR:?POSTGRES_UTILISATEUR manquant}"
horodatage="$(date -u +%Y%m%dT%H%M%SZ)"

mkdir -p "$destination"

archive="$destination/rationarium-$horodatage.dump"
roles="$destination/rationarium-$horodatage.roles.sql"

echo "── sauvegarde $horodatage ──"

# 1. Les données et la structure.
#
# L'archive est écrite DANS le conteneur, relue là, puis copiée. Le trajet par
# un tube — `docker compose exec … > archive.dump` — produit bien un fichier
# valide, mais le trajet inverse ne fonctionne pas : `pg_restore --list` lu sur
# `/dev/stdin` d'un `exec` rend « did not find magic string in file header »
# sur une archive parfaitement saine. Un contrôle qui échoue sur du bon crie au
# loup, et un contrôle auquel on ne croit plus ne sert à rien.
docker compose exec -T base \
  pg_dump --username "$utilisateur" --dbname "$base" --format=custom --compress=9 \
  --file=/tmp/rationarium-sauvegarde.dump

# 2. La relecture immédiate, à la source. `--list` échoue sur une archive
#    tronquée ou corrompue, ce qui est le mode de défaillance le plus courant :
#    un disque plein rend un fichier de taille plausible.
entrees="$(docker compose exec -T base pg_restore --list /tmp/rationarium-sauvegarde.dump | grep -c ';' || true)"

# 3. La sortie du conteneur, puis les rôles — hors de portée de pg_dump.
docker compose cp base:/tmp/rationarium-sauvegarde.dump "$archive"
docker compose exec -T base rm -f /tmp/rationarium-sauvegarde.dump

docker compose exec -T base \
  pg_dumpall --username "$utilisateur" --roles-only \
  > "$roles"

taille="$(du -h "$archive" | cut -f1)"
echo "archive : $archive ($taille) — relue sans erreur, $entrees entrées"
echo "rôles   : $roles"

# 4. La rétention. `-mtime +N` ne supprime que les fichiers de sauvegarde de ce
#    répertoire : le motif est nommé, jamais un `*`.
supprimes="$(find "$destination" -maxdepth 1 -name 'rationarium-*.dump' -mtime "+$retention" -print -delete | wc -l)"
find "$destination" -maxdepth 1 -name 'rationarium-*.roles.sql' -mtime "+$retention" -delete
echo "rétention $retention jours : $supprimes archive(s) supprimée(s)"

# 5. Ce que ce script NE fait pas, et qui doit être décidé (`cadrage/03 § 8.3`) :
#    la copie hors machine. Une sauvegarde qui vit sur le disque qu'elle protège
#    ne protège de rien d'autre que d'une erreur humaine.
echo "rappel : la copie hors machine reste à la charge de l'exploitant."
