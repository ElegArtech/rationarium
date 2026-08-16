# ADR-0011 — i18next avec format ICU

- **Statut** : accepté — 2026-08-16
- **Source** : `cadrage/03 § 4, D11`

## Contexte

`RG-GEN-08` interdit toute chaîne figée. Le produit affiche en permanence des pluriels chiffrés — « {n} jour(s) », « {n} tâche(s) sur {total} » — et des dates dans cinq formats paramétrables (vue 31). `cadrage/02 § D.7` prévient que l'anglais est 30 % plus long.

## Décision

**`i18next` 26.3.6 + `react-i18next` 17.0.11, avec le module ICU** pour les pluriels et les formats. Catalogues JSON versionnés, clés par module, **chargés depuis le lot de construction** et non depuis un service distant (`C1`).

## Ce qui est désormais interdit

- Écrire une chaîne visible en dur. Contrôlé par `pnpm i18n:check` et signalé à l'écriture par un hook.
- **Concaténer pour former un pluriel ou une phrase.** « {n} » + « jour(s) » est une faute de traduction, pas un raccourci : les langues n'ont pas toutes deux formes plurielles ni le même ordre. Le pluriel passe par ICU.
- Formater une date ou une heure à la main. Les formats suivent le paramétrage global (`RG-GEN-09`).
- Caler une largeur de composant sur un libellé français.
- Charger un catalogue depuis un service distant.

## Alternatives écartées

**Lingui** — bundles plus petits et garanties à la compilation, mais ses macros exigent un greffon Babel ou SWC dont la version SWC est officiellement expérimentale. Sous Vite 8 et Rolldown, c'est un risque d'outillage inutile.
