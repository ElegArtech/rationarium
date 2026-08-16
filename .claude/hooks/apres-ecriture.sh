#!/usr/bin/env bash
# Contrôles immédiats après écriture — hook PostToolUse sur Edit|Write.
#
# Ne bloque rien : l'écriture a eu lieu. Signale tôt, pour que l'agent corrige
# dans le même mouvement plutôt qu'à la revue.

set -uo pipefail

entree=$(cat)
chemin=$(printf '%s' "$entree" | jq -r '.tool_input.file_path // empty')
[ -z "$chemin" ] && exit 0

racine="${CLAUDE_PROJECT_DIR:-$(pwd)}"
relatif="${chemin#"$racine"/}"

case "$relatif" in
  apps/web/src/*.css)
    sortie=$(cd "$racine" && pnpm exec stylelint "$relatif" 2>&1) || {
      echo "stylelint signale un écart au contrat de style :" >&2
      echo "$sortie" >&2
      echo "Rappel : aucune couleur littérale hors socle.css. Employer un jeton (docs/design/DESIGN.md)." >&2
    }
    ;;

  apps/web/src/*.tsx)
    # Chaîne visible en dur : heuristique volontairement large, elle signale, elle ne bloque pas.
    if grep -nP '>[^<>{}\n]*\p{L}{4,}[^<>{}\n]*<' "$chemin" 2>/dev/null | grep -qv 't('; then
      echo "Chaîne possiblement en dur dans $relatif — RG-GEN-08 interdit toute chaîne figée." >&2
      echo "Tout libellé visible passe par i18next, en français et en anglais." >&2
    fi
    ;;
esac

exit 0
