# ADR-0002 — React plutôt que Vue ou Svelte

- **Statut** : accepté — 2026-08-16
- **Source** : `cadrage/03 § 4, D2`

## Contexte

Aucune des trois bibliothèques n'est disqualifiée par le cadrage. Le départage se fait sur un critère unique mais décisif.

## Décision

**React 19.2.8**, pour **l'écosystème de composants accessibles sans habillage**.

`C5` fait de l'accessibilité une exigence contractuelle, pas un confort : navigation clavier complète, contrastes, libellés d'assistance sur les grilles denses. React Aria Components (Adobe) n'a pas d'équivalent en maturité d'accessibilité dans les autres écosystèmes. S'y ajoutent TanStack Table, Virtual et Query, disponibles partout mais dont React est la cible de référence.

## Ce qui est désormais interdit

- Introduire une seconde bibliothèque de vues, sous quelque forme que ce soit — y compris un composant isolé « juste pour cette vue ».
- Employer un composant accessible maison là où React Aria en fournit un. Le comportement et l'accessibilité s'achètent ; seul le style est apporté.

## Alternatives écartées

**Vue**, **Svelte** — techniquement recevables, écartées sur le seul critère de l'écosystème accessible.
