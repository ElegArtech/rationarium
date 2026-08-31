---
description: Contrôle la finition d'une vue portée, état par état, et rend un tableau de jugement. La maquette sert d'intention, plus de verdict.
argument-hint: "[NN]"
---

# Vérifier la vue $0

## Étage 1 — mécanique

```bash
pnpm a11y -- $0     # bloquant : aucune violation, dans les deux thèmes
pnpm ui:diff $0     # relevé, NON bloquant depuis le dégel du 2026-08-31
```

`ui:diff` ne prononce plus. Sa sortie se lit ligne à ligne : chaque écart est soit un défaut à corriger, soit une évolution assumée du produit — et c'est toi qui tranches, en le disant.

Ce qui est contrôlé, et pourquoi seulement cela : les textes contractuels, les jetons employés, les repères d'accessibilité, le débordement. Une comparaison au pixel contre la maquette produirait un flot de faux positifs — polices, lissage, données d'exemple, barres de défilement.

**Écarts attendus, à ne pas signaler** : sur les 26 maquettes non conformes RGAA, les jetons `--placeholder`, `--line-strong` et `--leave-pending` diffèrent volontairement (`mockups/GEL.md`, écart 5).

## Étage 2 — jugé, non bloquant

Captures côte à côte, maquette et implémentation, état par état. Tu rends un verdict **motivé** sur : hiérarchie visuelle, densité, espacement, lisibilité des grilles denses.

Ce verdict **n'est pas bloquant** : il oriente le regard humain à la revue de vague. Dire « il me semble que la colonne de gauche a perdu son poids visuel » est utile ; dire « conforme » sans avoir regardé ne l'est pas.

## Étage 3 — non-régression

Une fois la vue validée par l'humain, sa propre capture devient sa référence. La comparaison stricte s'applique alors implémentation ↔ implémentation, où elle a un sens.

## Sortie

| État | Étage 1 | Étage 2 | Note |
| --- | --- | --- | --- |
| … | ✓ / écart | ✓ / réserve | … |

Puis, explicitement : **combien de signalements de l'étage 1 se sont révélés faux**. Cette mesure alimente le point ouvert n° 5 du pilote (`cadrage/04 § 12`) — un contrôle mécanique mal spécifié produit de la fausse confiance dans les deux sens.
