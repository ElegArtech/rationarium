# ADR-0012 — Aucune bibliothèque de graphiques, de Gantt ni de planning

- **Statut** : accepté — 2026-08-16
- **Source** : `cadrage/03 § 4, D12` et `§ 3.2`

## Contexte

C'est la décision qui surprend le plus, et elle mérite d'être comprise plutôt que subie.

Les huit modules d'analyse de la vue 30, les trois vues de planning, les deux Gantt et les deux matrices **existent déjà** en HTML, CSS et SVG dans les maquettes — dans le vocabulaire graphique du produit, avec leurs états vides rédigés, leurs deux thèmes traités et leurs feuilles d'impression.

## Décision

**Aucune bibliothèque.** Le portage en composants React est du travail **mécanique**, pas de la conception.

Si de la mise à l'échelle ou de l'interpolation devient nécessaire, `d3-scale` et `d3-shape` fournissent les **calculs** sans imposer de DOM. C'est la seule ouverture, et elle est limitée aux calculs.

## Ce qui est désormais interdit

- Introduire Recharts, ECharts, Chart.js, Victory, Nivo ou équivalent. Ils apportent leur propre palette, leur propre typographie et leur propre gestion du thème sombre — trois choses à combattre ensuite, indéfiniment.
- Introduire un composant de Gantt : dhtmlxGantt, Frappe, Syncfusion, Bryntum. Ils imposent un DOM, un thème, et pour les commerciaux une licence — incompatible avec `C3` et, pour les seconds, avec `C2`.
- Introduire un planificateur clés en main.
- Importer `d3` en entier. Seuls `d3-scale` et `d3-shape` sont ouverts, et pour leurs calculs seulement.

## Le raisonnement à retenir

Introduire une bibliothèque reviendrait à **remplacer un travail achevé par un travail d'adaptation permanent**. La tentation reviendra à chaque vue graphique ; la réponse est la même à chaque fois.
