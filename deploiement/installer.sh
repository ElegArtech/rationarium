#!/usr/bin/env bash
# Télécharge et lance le kit d'installation de cette version.
set -euo pipefail
VERSION=1.0.0-rc.1
DOSSIER=${1:-"$PWD/rationarium"}
for outil in curl tar sha256sum docker; do
  command -v "$outil" > /dev/null || { printf 'Prérequis manquant : %s. Voir le guide d’installation.\n' "$outil" >&2; exit 1; }
done
docker info > /dev/null 2>&1 || { echo 'Docker doit être démarré et accessible à votre compte.' >&2; exit 1; }
docker compose version > /dev/null
case $(docker info --format '{{.OSType}}/{{.Architecture}}') in
  linux/x86_64|linux/amd64) ;;
  *) echo 'Cette version fournit des images pour Linux x86-64.' >&2; exit 1 ;;
esac
if [[ -e "$DOSSIER" ]] && { [[ ! -d "$DOSSIER" ]] || [[ -n $(ls -A "$DOSSIER") ]]; }; then
  echo 'Choisir un dossier vide : aucune installation existante ne sera remplacée.' >&2; exit 1
fi
TEMPORAIRE=$(mktemp -d)
trap 'rm -rf -- "$TEMPORAIRE"' EXIT
ARCHIVE="rationarium-$VERSION-compose.tar.gz"
URL="https://github.com/ElegArtech/rationarium/releases/download/v$VERSION"
printf 'Téléchargement de Rationarium %s…\n' "$VERSION"
curl --fail --location --show-error --output "$TEMPORAIRE/$ARCHIVE" "$URL/$ARCHIVE"
curl --fail --location --show-error --output "$TEMPORAIRE/$ARCHIVE.sha256" "$URL/$ARCHIVE.sha256"
(cd "$TEMPORAIRE" && sha256sum --check "$ARCHIVE.sha256")
mkdir -p "$DOSSIER"
tar -xzf "$TEMPORAIRE/$ARCHIVE" -C "$DOSSIER" --strip-components=1
bash "$DOSSIER/configurer.sh"
