#!/usr/bin/env bash
# Remplace la base, les pièces jointes et l'autorité Caddy par une sauvegarde complète.
set -euo pipefail
archive=${1:-}
confirmation=${2:-}
[[ -r "$archive" && "$archive" == *.dump ]] || { echo 'Usage : restauration.sh /chemin/archive.dump [--sans-confirmation]' >&2; exit 1; }
archive=$(cd "$(dirname "$archive")" && pwd)/$(basename "$archive")
source "$(dirname -- "${BASH_SOURCE[0]}")/commun.sh"
prefixe=${archive%.dump}
for suffixe in dump roles.sql documents.tar.gz configuration.tar.gz caddy.tar.gz sha256; do
  [[ -r "$prefixe.$suffixe" ]] || { echo "Sauvegarde incomplète : $suffixe manquant." >&2; exit 1; }
done
attendu=$(cd "$(dirname "$archive")" && sha256sum "$(basename "$prefixe").dump" "$(basename "$prefixe").roles.sql" "$(basename "$prefixe").documents.tar.gz" "$(basename "$prefixe").configuration.tar.gz" "$(basename "$prefixe").caddy.tar.gz")
[[ $(cat "$prefixe.sha256") == "$attendu" ]] || { echo 'Empreintes de la sauvegarde non conformes.' >&2; exit 1; }
for suffixe in documents caddy configuration; do tar -tzf "$prefixe.$suffixe.tar.gz" > /dev/null; done
docker compose cp "$archive" base:/tmp/rationarium-restauration.dump
trap 'docker compose exec -T base rm -f /tmp/rationarium-restauration.dump >/dev/null 2>&1 || true' EXIT
docker compose exec -T base pg_restore --list /tmp/rationarium-restauration.dump > /dev/null
printf 'La restauration remplace la base %s, les pièces jointes et l’autorité HTTPS.\n' "$base"
if [[ "$confirmation" != --sans-confirmation ]]; then
  read -r -p 'Taper le nom de la base pour confirmer : ' reponse
  [[ "$reponse" == "$base" ]] || { echo 'Restauration annulée.' >&2; exit 1; }
fi
# En cas d'échec après cet arrêt, les services restent arrêtés pour permettre la reprise.
docker compose stop api web
docker run --rm -i --pull never --network none --entrypoint node "$image_api" /rationarium/deploiement/roles-restauration.mjs < "$prefixe.roles.sql" | docker compose exec -T base psql -X -v ON_ERROR_STOP=1 -U "$utilisateur" -d postgres > /dev/null
docker compose exec -T base dropdb -U "$utilisateur" --if-exists --force "$base"
docker compose exec -T base createdb -U "$utilisateur" --owner "$utilisateur" "$base"
docker compose exec -T base pg_restore -U "$utilisateur" -d "$base" --no-owner --exit-on-error /tmp/rationarium-restauration.dump
restaurer_volume() {
  docker run --rm -i --pull never --network none --user "$3" --mount "type=volume,src=$1,dst=/cible" --entrypoint sh "$image_api" -c 'find /cible -mindepth 1 -delete && tar -C /cible -xzf - --no-same-owner' < "$2"
}
restaurer_volume "$volume_documents" "$prefixe.documents.tar.gz" 1000:1000
restaurer_volume "$volume_caddy" "$prefixe.caddy.tar.gz" 0:0
docker compose exec -T base psql -X -v ON_ERROR_STOP=1 -U "$utilisateur" -d "$base" -c 'SELECT count(*) AS utilisateurs_restaures FROM users;'
docker compose start api web
printf 'Restauration terminée. Vérifier la connexion, les pièces jointes et le planning.\n'
printf 'La configuration .env et les certificats fournis restent ceux de cette installation.\n'
