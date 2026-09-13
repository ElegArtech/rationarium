#!/usr/bin/env bash
# Capture cohérente : base, rôles, pièces jointes, configuration et autorité HTTPS.
set -euo pipefail
source "$(dirname -- "${BASH_SOURCE[0]}")/commun.sh"
destination=${1:-$destination}
[[ "$retention" =~ ^[0-9]+$ ]] || { echo 'RATIONARIUM_RETENTION doit être un nombre de jours, ou 0.' >&2; exit 1; }
mkdir -p "$destination"
destination=$(cd "$destination" && pwd)
prefixe="rationarium-$(date -u +%Y%m%dT%H%M%S%NZ)"
services_actifs=()
while IFS= read -r service; do
  case "$service" in api|web) services_actifs+=("$service") ;; esac
done <<< "$(docker compose ps --status running --services)"
reprendre() {
  if (( ${#services_actifs[@]} )); then docker compose start "${services_actifs[@]}"; fi
}
trap reprendre EXIT
docker compose stop api web

docker compose exec -T base pg_dump -U "$utilisateur" -d "$base" --format=custom --file=/tmp/rationarium-sauvegarde.dump
docker compose exec -T base pg_restore --list /tmp/rationarium-sauvegarde.dump > /dev/null
docker compose cp base:/tmp/rationarium-sauvegarde.dump "$destination/$prefixe.dump"
docker compose exec -T base rm -f /tmp/rationarium-sauvegarde.dump
docker compose exec -T base pg_dumpall -U "$utilisateur" --roles-only --no-role-passwords > "$destination/$prefixe.roles.sql"
docker run --rm --pull never --network none --mount "type=volume,src=$volume_documents,dst=/source,readonly" --entrypoint tar "$image_api" -C /source -czf - . > "$destination/$prefixe.documents.tar.gz"
docker run --rm --pull never --network none --user 0:0 --mount "type=volume,src=$volume_caddy,dst=/source,readonly" --entrypoint tar "$image_api" -C /source -czf - . > "$destination/$prefixe.caddy.tar.gz"
tar -czf "$destination/$prefixe.configuration.tar.gz" .env compose.yaml Caddyfile certificats
for suffixe in documents caddy configuration; do tar -tzf "$destination/$prefixe.$suffixe.tar.gz" > /dev/null; done
(cd "$destination" && sha256sum "$prefixe.dump" "$prefixe.roles.sql" "$prefixe.documents.tar.gz" "$prefixe.configuration.tar.gz" "$prefixe.caddy.tar.gz" > "$prefixe.sha256")
chmod 600 "$destination/$prefixe".*
# Une rétention n'est appliquée que si elle a été explicitement configurée.
if (( 10#$retention > 0 )); then
  while IFS= read -r -d '' manifeste; do
    ancien=${manifeste%.sha256}
    rm -f -- "$ancien.dump" "$ancien.roles.sql" "$ancien.documents.tar.gz" "$ancien.configuration.tar.gz" "$ancien.caddy.tar.gz" "$manifeste"
  done < <(find "$destination" -maxdepth 1 -name 'rationarium-*.sha256' -mtime "+$retention" -print0)
fi
printf 'Sauvegarde terminée : %s/%s.dump\n' "$destination" "$prefixe"
