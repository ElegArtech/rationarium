# ADR-0004 — Pragmatic drag and drop, et l'alternative clavier obligatoire

- **Statut** : accepté — 2026-08-16
- **Source** : `cadrage/03 § 4, D4` ; `C6`, `EX-PLN-10`, `EX-TSK-02`

## Contexte

Le glisser-déposer sert le planning (changement de date ou d'assigné) et le kanban (changement de statut). Sur la grille de la vue 08 — une vingtaine de lignes sur vingt-deux colonnes — les solutions à capteurs synthétiques se dégradent visiblement.

## Décision

**`@atlaskit/pragmatic-drag-and-drop` 3.0.0.** Il s'appuie sur l'API native du navigateur, ne monte aucun observateur permanent, n'impose aucun conteneur — donc se greffe sur la grille CSS existante sans la contraindre, condition posée par `C3`.

## Ce qui est désormais interdit

- **Livrer un glisser-déposer sans son alternative clavier.** C'est la contrainte portante de cet ADR. `C6` et le brief de la vue 12 exigent que le glisser-déposer soit **doublé** d'une action explicite — « Déplacer vers… », « Réassigner à… » — accessible depuis le menu de l'élément.
- Implémenter cette alternative comme une **traînée simulée au clavier**. Une action explicite est meilleure du point de vue RGAA : elle est découvrable, annonçable et testable. Une traînée simulée n'est aucune des trois.
- Contraindre le DOM de la grille pour les besoins de la bibliothèque.

## Alternatives écartées

**`@dnd-kit/core`** — dernière publication en décembre 2024. **`@dnd-kit/react`** — encore en `0.x`.
