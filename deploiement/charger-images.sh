#!/usr/bin/env bash
set -euo pipefail
cd -- "$(dirname -- "${BASH_SOURCE[0]}")"
sha256sum --check SHA256SUMS
if [[ -f images.tar ]]; then
  docker image load --input images.tar
else
  for archive in images/*.tar; do docker image load --input "$archive"; done
fi
printf 'Images chargées. Lancer bash configurer.sh ou suivre docs/hors-ligne.md.\n'
