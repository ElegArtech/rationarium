#!/usr/bin/env bash
set -euo pipefail
cd -- "$(dirname -- "${BASH_SOURCE[0]}")"
sha256sum --check SHA256SUMS
docker image load --input images.tar
printf 'Images chargées. Lancer bash configurer.sh ou suivre docs/hors-ligne.md.\n'
