#!/usr/bin/env bash
# Rassemble des images complètes pour un serveur sans accès à Internet.
set -euo pipefail
racine=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
cd "$racine"
command -v python3 > /dev/null || { echo 'La préparation du paquet requiert Python 3.' >&2; exit 1; }
construire=false
if [[ ${1:-} == --construire ]]; then construire=true; shift; fi
version=$(sed -n 's/.*"version": "\([^"]*\)".*/\1/p' package.json)
sortie=${1:-"$racine/dist/rationarium-$version"}
[[ ! -e "$sortie/compose.yaml" && ! -e "$sortie/images" && ! -e "$sortie/.env" ]] || { echo 'Choisir un dossier neuf.' >&2; exit 1; }
export VERSION_RATIONARIUM="$version"
export POSTGRES_MOTDEPASSE=construction-sans-donnees
export COOKIE_SECRET=construction-sans-donnees
compose=(docker compose --env-file deploiement/.env.example -f deploiement/compose.yaml)
if [[ "$construire" == true ]]; then
  "${compose[@]}" -f deploiement/compose.construction.yaml build api web
  "${compose[@]}" pull --policy always base
fi
images_texte=$("${compose[@]}" config --images)
mapfile -t images < <(printf '%s\n' "$images_texte" | sort -u)
bash deploiement/preparer-compose.sh "$sortie"
sortie=$(cd "$sortie" && pwd)
mkdir -p "$sortie/images"
printf '\n# Aucune image ne doit être téléchargée sur le serveur cible.\nMODE_IMAGES=never\nRESEAU_INTERNE=true\n' >> "$sortie/.env.example"
# Copier depuis le registre évite les exports partiels du magasin containerd
# lorsque plusieurs images locales partagent des couches recompressées.
skopeo=quay.io/skopeo/stable@sha256:545723edab7793112a5c8fc36963f5cad43c6f27c0bda63c5fbc8b5d4d336036
if [[ "$construire" == false ]]; then docker pull "$skopeo"; fi
numero=0
for image in "${images[@]}"; do
  numero=$((numero + 1))
  fichier="images/$numero.tar"
  if [[ "$construire" == true ]]; then
    docker image save --output "$sortie/$fichier" "$image"
  else
    docker run --rm --user "$(id -u):$(id -g)" --env HOME=/tmp \
      --env HTTP_PROXY --env HTTPS_PROXY --env NO_PROXY --env http_proxy --env https_proxy --env no_proxy \
      --mount "type=bind,src=$sortie/images,dst=/sortie" "$skopeo" \
      --override-os linux --override-arch amd64 copy \
      "docker://$image" "docker-archive:/sortie/$numero.tar:$image"
  fi
  python3 deploiement/verifier-images.py "$sortie/$fichier"
  printf '%s linux/amd64 %s\n' "$fichier" "$image" >> "$sortie/IMAGES.txt"
done
(cd "$sortie" && sha256sum images/*.tar > SHA256SUMS)
printf 'Paquet hors ligne prêt : %s (linux/amd64)\n' "$sortie"
