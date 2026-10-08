#!/usr/bin/env bash
# Migration logique avec volume source conservé. À lancer depuis le kit 1.0.0.
set -Eeuo pipefail
umask 077
sortie=${1:?Usage : migrer-postgresql.sh dossier-neuf-de-preuves}
[[ ! -e "$sortie" ]] || { echo 'Le dossier de preuves doit être neuf.' >&2; exit 1; }
mkdir -p "$sortie"
sortie=$(cd "$sortie" && pwd)
source "$(dirname -- "${BASH_SOURCE[0]}")/commun.sh"
mkdir "$racine/.migration-postgresql.lock" 2>/dev/null || { echo 'Migration déjà en cours ou verrou à examiner après interruption.' >&2; exit 1; }
trap 'code=$?; rmdir "$racine/.migration-postgresql.lock"; exit "$code"' EXIT
[[ -f .env ]] || { echo 'Configuration .env requise.' >&2; exit 1; }
# Les surcharges implicites pourraient imposer encore l'image/volume source.
[[ ! -f compose.override.yaml && ! -f compose.override.yml && -z "${COMPOSE_FILE:-}" ]] || {
  echo 'Intégrer puis retirer les surcharges Compose avant la migration.' >&2; exit 1;
}
[[ -z "${VOLUME_POSTGRES:-}" ]] || { echo 'Ne pas exporter VOLUME_POSTGRES : utiliser .env.' >&2; exit 1; }
source_base=$(docker compose ps -q base)
[[ -n "$source_base" ]] || { echo 'La base source doit être démarrée.' >&2; exit 1; }
volume_source=$(docker inspect "$source_base" --format '{{range .Mounts}}{{if eq .Destination "/var/lib/postgresql"}}{{.Name}}{{end}}{{end}}')
[[ "$volume_source" =~ ^[a-zA-Z0-9][a-zA-Z0-9_.-]+$ ]] || { echo 'La source doit être un volume Docker nommé.' >&2; exit 1; }
[[ $(docker exec "$source_base" sh -c '. /etc/os-release; printf %s "$ID"') == debian ]] || {
  echo 'Cette migration exige une source Debian ; une base Alpine se met à jour normalement.' >&2; exit 1;
}
[[ $(docker exec "$source_base" psql -XAt -U "$utilisateur" -d "$base" -c 'SHOW server_version_num') == 18???? ]] || {
  echo 'Seule la majeure PostgreSQL 18 est prise en charge.' >&2; exit 1;
}
autres_bases=$(docker exec -i "$source_base" psql -XAt -U "$utilisateur" -d "$base" -v base="$base" <<'SQL'
SELECT count(*) FROM pg_database WHERE NOT datistemplate AND datname NOT IN ('postgres', :'base');
SQL
)
[[ "$autres_bases" == 0 ]] || { echo 'Autres bases présentes : prévoir leur migration explicitement avant de poursuivre.' >&2; exit 1; }
mapfile -t images_base < <(docker compose config --images | grep -E '/rationarium-base[:@]')
[[ ${#images_base[@]} == 1 ]] || { echo 'Image cible PostgreSQL introuvable.' >&2; exit 1; }
cible=${images_base[0]}
docker image inspect "$cible" > /dev/null
[[ $(docker run --rm --network none --entrypoint sh "$cible" -c '. /etc/os-release; printf %s "$ID"') == alpine ]]
volume_cible="${volume_source}-alpine-$(date -u +%Y%m%dT%H%M%S)-$RANDOM"
! docker volume inspect "$volume_cible" >/dev/null 2>&1 || { echo 'Volume cible déjà présent.' >&2; exit 1; }
cp .env "$sortie/env-avant"
# Sauvegarder les identifiants immuables, pas seulement les tags de retour.
{
  printf 'services:\n'
  for paire in "base:$source_base" "api:$conteneur_api" "web:$conteneur_web"; do
    service=${paire%%:*}; conteneur=${paire#*:}
    printf '  %s:\n    image: %s\n    pull_policy: never\n' "$service" "$(docker inspect "$conteneur" --format '{{.Image}}')"
    # Depuis 1.0.2, le kit connecte l'API sous le rôle applicatif, dont le
    # secret est un fichier que les images antérieures ne lisent pas : le
    # retour leur rend la connexion qu'elles avaient.
    if [[ "$service" == api ]]; then
      printf '    environment:\n      PGUSER: ${POSTGRES_UTILISATEUR:-rationarium}\n      PGPASSWORD: ${POSTGRES_MOTDEPASSE}\n'
    fi
  done
  printf 'volumes:\n  donnees:\n    name: %s\n' "$volume_source"
} > "$sortie/retour.yaml"
# Le retour ne lance PAS les migrations applicatives de la candidate.
{
  printf '#!/usr/bin/env bash\nset -euo pipefail\numask 077\ncd %q\n' "$racine"
  printf '[[ ${1:-} == --avant-reouverture ]] || { echo "Retour refusé : confirmer que les utilisateurs ne sont pas revenus, avec --avant-reouverture." >&2; exit 1; }\n'
  printf 'docker compose stop api web base\ncp %q .env\n' "$sortie/env-avant"
  printf 'docker compose -f compose.yaml -f %q up -d --no-deps --wait --wait-timeout 180 base\n' "$sortie/retour.yaml"
  printf 'docker compose -f compose.yaml -f %q up -d --no-deps --wait --wait-timeout 180 api web\n' "$sortie/retour.yaml"
} > "$sortie/retour.sh"
# Une empreinte par table compare le contenu logique indépendamment du tri libc.
cat > "$sortie/empreintes.sql" <<'SQL'
SET timezone = 'UTC';
SELECT format('SELECT %L, count(*), md5(coalesce(string_agg(h, '''' ORDER BY h COLLATE "C"), '''')) FROM (SELECT md5(to_jsonb(t)::text) h FROM %I.%I t) lignes;', schemaname || '.' || tablename, schemaname, tablename)
FROM pg_tables WHERE schemaname NOT IN ('pg_catalog', 'information_schema') ORDER BY schemaname COLLATE "C", tablename COLLATE "C"
\gexec
SQL
empreintes() {
  docker compose exec -T base psql -XqAt -v ON_ERROR_STOP=1 -U "$utilisateur" -d "$base" < "$sortie/empreintes.sql" > "$1"
  [[ -s "$1" ]] || { echo 'Aucune table mesurée.' >&2; return 1; }
}
echec() {
  code=$?
  trap - ERR
  docker compose stop api web >/dev/null 2>&1 || true
  printf 'Migration interrompue. Source conservée : %s. Retour : bash %q --avant-reouverture\n' "$volume_source" "$sortie/retour.sh" >&2
  exit "$code"
}
trap echec ERR
docker compose stop api web
# sauvegarde.sh constate les services arrêtés et ne les redémarre pas.
bash "$racine/sauvegarde.sh" "$sortie/sauvegarde"
empreintes "$sortie/avant.txt"
# Les rôles de connexion conservent leurs hachés ; ce fichier est privé (umask 077).
docker exec "$source_base" pg_dumpall -U "$utilisateur" --roles-only > "$sortie/roles-migration.sql"
roles_empreinte="SELECT rolname, md5((to_jsonb(r) - 'oid')::text) FROM pg_authid r ORDER BY rolname COLLATE \"C\";"
docker exec "$source_base" psql -XAt -v ON_ERROR_STOP=1 -U "$utilisateur" -d "$base" -c "$roles_empreinte" > "$sortie/roles-avant.txt"
mapfile -t archives < <(find "$sortie/sauvegarde" -maxdepth 1 -name '*.dump')
[[ ${#archives[@]} == 1 ]]
archive=${archives[0]}
docker compose stop base
# .env reste un fichier Compose, jamais évalué comme un programme shell.
awk '!/^VOLUME_POSTGRES=/' .env > "$sortie/env-cible"
printf '\nVOLUME_POSTGRES=%s\n' "$volume_cible" >> "$sortie/env-cible"
cp "$sortie/env-cible" .env
docker compose up -d --no-deps --wait --wait-timeout 180 base
# Rejouer les rôles avant les ACL ; recréer la base depuis template0.
docker run --rm -i --pull never --network none --entrypoint node "$image_api" /rationarium/deploiement/roles-restauration.mjs < "$sortie/roles-migration.sql" | docker compose exec -T base psql -X -v ON_ERROR_STOP=1 -U "$utilisateur" -d postgres > "$sortie/roles.log"
docker compose exec -T base dropdb -U "$utilisateur" --force "$base"
docker compose exec -T base createdb -U "$utilisateur" -O "$utilisateur" -T template0 "$base"
docker compose cp "$archive" base:/tmp/migration.dump
docker compose exec -T base pg_restore -U "$utilisateur" -d "$base" --no-owner --exit-on-error /tmp/migration.dump
docker compose exec -T base rm /tmp/migration.dump
empreintes "$sortie/apres.txt"
cmp "$sortie/avant.txt" "$sortie/apres.txt"
docker compose exec -T base psql -XAt -v ON_ERROR_STOP=1 -U "$utilisateur" -d "$base" -c "$roles_empreinte" > "$sortie/roles-apres.txt"
cmp "$sortie/roles-avant.txt" "$sortie/roles-apres.txt"
docker compose exec -T base psql -XAt -v ON_ERROR_STOP=1 -U "$utilisateur" -d "$base" -c "SELECT datcollate, datctype, datlocprovider, datcollversion FROM pg_database WHERE datname=current_database(); SELECT count(*) FROM pg_index WHERE NOT indisvalid;" > "$sortie/collation-index.txt"
[[ $(tail -n 1 "$sortie/collation-index.txt") == 0 ]]
docker compose up -d --wait --wait-timeout 180
printf 'Source conservée : %s\nCible : %s\nEmpreintes de toutes les tables identiques avant migrations applicatives.\n' "$volume_source" "$volume_cible" > "$sortie/VERDICT.txt"
printf 'Migration terminée. Vérifier les parcours avant réouverture. Retour disponible : bash %q --avant-reouverture\n' "$sortie/retour.sh"
