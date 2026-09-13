#!/usr/bin/env bash
# Exporte les images de la release pour un serveur sans accès à Internet.
set -euo pipefail
racine=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
cd "$racine"
construire=false
if [[ ${1:-} == --construire ]]; then construire=true; shift; fi
version=$(sed -n 's/.*"version": "\([^"]*\)".*/\1/p' package.json)
sortie=${1:-"$racine/dist/rationarium-$version"}
[[ ! -e "$sortie/compose.yaml" && ! -e "$sortie/images.tar" && ! -e "$sortie/.env" ]] || { echo 'Choisir un dossier neuf.' >&2; exit 1; }
export VERSION_RATIONARIUM="$version"
export POSTGRES_MOTDEPASSE=construction-sans-donnees
export COOKIE_SECRET=construction-sans-donnees
compose=(docker compose --env-file deploiement/.env.example -f deploiement/compose.yaml)
if [[ "$construire" == true ]]; then
  "${compose[@]}" -f deploiement/compose.construction.yaml build api web
  "${compose[@]}" pull --policy always base
else
  "${compose[@]}" pull --policy always
fi
images_texte=$("${compose[@]}" config --images)
mapfile -t images < <(printf '%s\n' "$images_texte" | sort -u)
plateforme=$(docker image inspect "${images[0]}" --format '{{.Os}}/{{.Architecture}}')
for image in "${images[@]}"; do
  [[ $(docker image inspect "$image" --format '{{.Os}}/{{.Architecture}}') == "$plateforme" ]] || { echo "Architecture incompatible : $image" >&2; exit 1; }
done
bash deploiement/preparer-compose.sh "$sortie"
printf '\n# Aucune image ne doit être téléchargée sur le serveur cible.\nMODE_IMAGES=never\nRESEAU_INTERNE=true\n' >> "$sortie/.env.example"
docker image save --output "$sortie/images.tar" "${images[@]}"
docker image inspect "${images[@]}" --format '{{.Id}} {{.Os}}/{{.Architecture}} {{range .RepoTags}}{{.}} {{end}}' > "$sortie/IMAGES.txt"
(cd "$sortie" && sha256sum images.tar > SHA256SUMS)
printf 'Paquet hors ligne prêt : %s (%s)\n' "$sortie" "$plateforme"
