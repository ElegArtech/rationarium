#!/usr/bin/env bash
set -euo pipefail
racine=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
cd "$racine"
registre=${1:?Usage : scanner-images.sh registre version dossier-preuves}
version=${2:?Version manquante}
sortie=${3:?Dossier de preuves manquant}
trivy=${TRIVY_BIN:-trivy}
mkdir -p "$sortie"
"$trivy" --version > "$sortie/analyseur.txt"
for composant in api web base; do
  image="$registre/rationarium-$composant:$version"
  identifiant=$(docker image inspect "$image" --format '{{.Id}}')
  "$trivy" image --scanners vuln --list-all-pkgs --format json --output "$sortie/$composant.json" "$image"
  [[ $(docker image inspect "$image" --format '{{.Id}}') == "$identifiant" ]] || { echo 'Image modifiée pendant le scan.' >&2; exit 1; }
  printf '%s %s\n' "$image" "$identifiant" >> "$sortie/images.txt"
  node scripts/securite-check.mjs image "$sortie/$composant.json" "$composant"
done
docker run --rm --network none \
  --mount "type=bind,src=$racine/scripts/verifier-image-api.mjs,dst=/controle-image.mjs,readonly" \
  --entrypoint node "$registre/rationarium-api:$version" /controle-image.mjs
# Inventaire et témoins positifs/négatifs du démarrage sécurisé.
bash scripts/verifier-image-base.sh "$registre/rationarium-base:$version"
