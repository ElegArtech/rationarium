#!/usr/bin/env bash
# Produit le kit d'installation depuis les sources, sans inclure d'image ni de secret.
set -euo pipefail
racine=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
cd "$racine"
version=$(sed -n 's/.*"version": "\([^"]*\)".*/\1/p' package.json)
sortie=${1:-"$racine/dist/rationarium-$version-compose"}
[[ ! -e "$sortie/compose.yaml" && ! -e "$sortie/.env" ]] || { echo 'Choisir un dossier neuf.' >&2; exit 1; }
mkdir -p "$sortie/docs" "$sortie/certificats" "$sortie/apps/web/public/licences"
cp deploiement/{compose.yaml,Caddyfile,.env.example,configurer.sh,commun.sh,sauvegarde.sh,restauration.sh,charger-images.sh} "$sortie/"
cp README.md LICENSE THIRD_PARTY_NOTICES.md "$sortie/"
cp docs/{installation,hors-ligne,exploitation,utilisation,architecture,reference-fonctionnelle}.md docs/telecharger.svg "$sortie/docs/"
cp apps/web/public/licences/tierces.txt "$sortie/apps/web/public/licences/"
printf 'Rationarium %s\n\nLancer bash configurer.sh, ou lire docs/installation.md.\n' "$version" > "$sortie/LISEZ-MOI.txt"
printf 'Kit Compose prêt : %s\n' "$sortie"
