#!/usr/bin/env bash
set -euo pipefail
destination=${1:?Usage : installer-trivy.sh dossier}
[[ $(uname -s) == Linux && $(uname -m) == x86_64 ]] || { echo 'Cet outil de livraison cible Linux x86-64.' >&2; exit 1; }
mkdir -p "$destination"
temporaire=$(mktemp -d)
trap 'rm -rf -- "$temporaire"' EXIT
curl --fail --location --retry 3 'https://github.com/aquasecurity/trivy/releases/download/v0.75.0/trivy_0.75.0_Linux-64bit.tar.gz' -o "$temporaire/trivy.tar.gz"
printf '%s  %s\n' 'c6e65abddb348e25f10549df887045629cf28cc72453cd1c63acb717316b3f3f' "$temporaire/trivy.tar.gz" | sha256sum --check
tar -xzf "$temporaire/trivy.tar.gz" -C "$destination" trivy
"$destination/trivy" --version
