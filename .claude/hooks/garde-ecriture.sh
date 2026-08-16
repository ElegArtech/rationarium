#!/usr/bin/env bash
# Garde d'écriture — hook PreToolUse sur Edit|Write.
#
# Tient mécaniquement trois interdits structurels de CLAUDE.md. Un interdit
# tenu par un hook s'applique quoi que décide le modèle ; un interdit tenu par
# une consigne dépend de son attention. Ceux-ci ne peuvent pas en dépendre.
#
# Sortie 2 = blocage, stderr renvoyé à l'agent comme motif.

set -euo pipefail

entree=$(cat)
chemin=$(printf '%s' "$entree" | jq -r '.tool_input.file_path // .tool_input.path // empty')
[ -z "$chemin" ] && exit 0

racine="${CLAUDE_PROJECT_DIR:-$(pwd)}"
relatif="${chemin#"$racine"/}"

case "$relatif" in
  mockups/*)
    if [ "$relatif" != "mockups/GEL.md" ]; then
      echo "BLOQUÉ — mockups/ est la référence gelée (gel du 2026-08-16)." >&2
      echo "Une conformité visuelle ne se règle jamais en modifiant l'étalon." >&2
      echo "Si la maquette est réellement en cause : procédure de dégel en mockups/GEL.md § 2," >&2
      echo "qui est une décision humaine, suivie d'un diff retour vers cadrage/01 et 02." >&2
      exit 2
    fi
    ;;

  cadrage/*)
    echo "BLOQUÉ — cadrage/ évolue par décision humaine tracée, jamais par effet de bord." >&2
    echo "Fichier visé : $relatif" >&2
    echo "La démarche correcte est le diff retour (cadrage/04 § 8.4) : proposer la mise à jour," >&2
    echo "la faire arbitrer, puis la porter avec sa trace en commit." >&2
    exit 2
    ;;

  packages/db/prisma/schema.prisma|packages/db/prisma/migrations/*)
    if [ ! -f "$racine/.claude/TACHE-SCHEMA" ]; then
      echo "BLOQUÉ — le schéma de base ne se modifie pas dans une tâche de fonctionnalité." >&2
      echo "Motif : des migrations concurrentes en vague parallèle produisent un modèle de" >&2
      echo "compromis. Voir cadrage/04 § 5.3." >&2
      echo "Une tâche de schéma déclarée pose le marqueur .claude/TACHE-SCHEMA." >&2
      exit 2
    fi
    ;;
esac

exit 0
