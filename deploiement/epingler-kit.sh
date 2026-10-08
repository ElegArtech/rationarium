#!/usr/bin/env bash
# Après publication : le kit Compose en ligne désigne les images par empreinte,
# puis son archive et les empreintes de la livraison sont recalculées.
# Usage : epingler-kit.sh dossier-livraison version registre/rationarium-base@sha256:… …-api@… …-web@…
set -euo pipefail
livraison=${1:?Dossier de livraison manquant}
version=${2:?Version manquante}
shift 2
[[ $# == 3 ]] || { echo 'Trois références attendues : base, api, web.' >&2; exit 1; }
livraison=$(cd "$livraison" && pwd)
nom="rationarium-$version-compose"
archive="$livraison/$nom.tar.gz"
[[ -f "$archive" ]] || { echo "Archive absente : $archive" >&2; exit 1; }
declare -A references
for reference in "$@"; do
  [[ "$reference" =~ ^[a-z0-9][a-z0-9./_-]*/rationarium-(base|api|web)@sha256:[0-9a-f]{64}$ ]] || {
    echo "Référence d’image invalide : $reference" >&2; exit 1;
  }
  composant=${BASH_REMATCH[1]}
  [[ -z "${references[$composant]:-}" ]] || { echo "Composant en double : $composant" >&2; exit 1; }
  references[$composant]=$reference
done
temporaire=$(mktemp -d)
trap 'rm -rf -- "$temporaire"' EXIT
tar -xzf "$archive" -C "$temporaire"
compose="$temporaire/$nom/compose.yaml"
[[ -f "$compose" ]] || { echo 'compose.yaml absent du kit.' >&2; exit 1; }
for composant in base api web; do
  motif="image: \${REGISTRE_RATIONARIUM:-ghcr.io/elegartech}/rationarium-$composant:\${VERSION_RATIONARIUM:-$version}"
  attendu=$(grep -cF -- "$motif" "$compose" || true)
  (( attendu > 0 )) || { echo "Aucune image $composant $version à épingler dans compose.yaml." >&2; exit 1; }
  python3 - "$compose" "$motif" "image: ${references[$composant]}" <<'PY'
import sys
chemin, avant, apres = sys.argv[1:]
texte = open(chemin, encoding='utf-8').read()
open(chemin, 'w', encoding='utf-8').write(texte.replace(avant, apres))
PY
  [[ $(grep -cF -- "image: ${references[$composant]}" "$compose") == "$attendu" ]]
done
if grep -E '^\s*image:' "$compose" | grep -v '@sha256:' > /dev/null; then
  echo 'Une image du kit reste désignée par un tag.' >&2; exit 1
fi
sed -i "1a # Images épinglées par empreinte à la publication de v$version : REGISTRE_RATIONARIUM et\n# VERSION_RATIONARIUM ne s'appliquent pas à ce fichier." "$compose"
tar -C "$temporaire" -czf "$archive" "$nom"
tar -tzf "$archive" > "$livraison/$nom.contenu"
(cd "$livraison" && sha256sum "$nom.tar.gz" > "$nom.tar.gz.sha256")
(cd "$livraison" && sha256sum ./*.tar.gz installer-rationarium.sh > SHA256SUMS && sha256sum -c --quiet SHA256SUMS)
printf 'Kit épinglé : %s\n' "$archive"
