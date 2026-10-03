#!/usr/bin/env bash
# Assemble les images déjà contrôlées, sans les reconstruire.
set -euo pipefail
racine=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
cd "$racine"
node scripts/livraison-check.mjs --stable
version=$(node -p "require('./package.json').version")
sortie=${1:-"$racine/dist/livraison-$version"}
[[ ! -e "$sortie" ]] || { echo 'Choisir un dossier neuf.' >&2; exit 1; }
mkdir -p "$sortie"
sortie=$(cd "$sortie" && pwd)
bash deploiement/preparer-compose.sh "$sortie/rationarium-$version-compose"
bash deploiement/preparer-hors-ligne.sh --local "$sortie/rationarium-$version-linux-amd64"
for nom in "rationarium-$version-compose" "rationarium-$version-linux-amd64"; do
  tar -C "$sortie" -czf "$sortie/$nom.tar.gz" "$nom"
  tar -tzf "$sortie/$nom.tar.gz" > "$sortie/$nom.contenu"
  if grep -Eq '(^|/)(\.env|node_modules|sauvegardes)(/|$)' "$sortie/$nom.contenu"; then
    echo 'Contenu privé ou dépendances de travail dans une archive.' >&2; exit 1
  fi
  (cd "$sortie" && sha256sum "$nom.tar.gz" > "$nom.tar.gz.sha256")
done
cp deploiement/installer.sh "$sortie/installer-rationarium.sh"
(cd "$sortie" && sha256sum ./*.tar.gz installer-rationarium.sh > SHA256SUMS && sha256sum -c SHA256SUMS)
