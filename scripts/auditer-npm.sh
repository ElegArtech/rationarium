#!/usr/bin/env bash
set -euo pipefail
racine=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
cd "$racine"
sortie=${1:?Usage : auditer-npm.sh dossier-preuves}
mkdir -p "$sortie"
pnpm audit --prod --json > "$sortie/npm-production.json" || test "$?" -eq 1
node scripts/securite-check.mjs npm "$sortie/npm-production.json" --production
pnpm audit --json > "$sortie/npm-complet.json" || test "$?" -eq 1
node scripts/securite-check.mjs npm "$sortie/npm-complet.json"
