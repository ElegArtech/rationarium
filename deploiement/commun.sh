#!/usr/bin/env bash
# Paramètres lus par Compose ; les secrets ne sont jamais interprétés par le shell.
set -euo pipefail
umask 077
racine=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
cd "$racine"
configuration=$(docker compose config --environment)
destination=./sauvegardes
retention=0
while IFS= read -r ligne; do
  case "$ligne" in
    RATIONARIUM_SAUVEGARDES=*) destination=${ligne#*=} ;;
    RATIONARIUM_RETENTION=*) retention=${ligne#*=} ;;
  esac
done <<< "$configuration"
unset configuration
base=$(docker compose exec -T base printenv POSTGRES_DB)
utilisateur=$(docker compose exec -T base printenv POSTGRES_USER)
conteneur_api=$(docker compose ps -aq api)
[[ -n "$conteneur_api" ]] || { echo 'Créer les services de cette installation avant de continuer.' >&2; exit 1; }
image_api=$(docker inspect "$conteneur_api" --format '{{.Config.Image}}')
volume_documents=$(docker inspect "$conteneur_api" --format '{{range .Mounts}}{{if eq .Destination "/var/lib/rationarium/documents"}}{{.Name}}{{end}}{{end}}')
conteneur_web=$(docker compose ps -aq web)
volume_caddy=$(docker inspect "$conteneur_web" --format '{{range .Mounts}}{{if eq .Destination "/data"}}{{.Name}}{{end}}{{end}}')
[[ -n "$volume_documents" && -n "$volume_caddy" ]] || { echo 'Volumes de l’installation introuvables.' >&2; exit 1; }
