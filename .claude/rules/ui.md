---
paths:
  - "apps/web/src/**/*.tsx"
  - "apps/web/src/**/*.ts"
---

# Règles de l'interface

## L'agent ne dessine pas, il transpose

La maquette gelée est la cible. Ce qui n'y figure pas ne s'invente pas : cela remonte en question. Un état non prévu par `design/etats.json` est un manque de spec à combler **avant** de coder, pas un blanc à remplir au jugé.

## Composants

Inventaire **fermé**, dans `docs/design/DESIGN.md § 2`. Le comportement et l'accessibilité viennent de `react-aria-components` ; le style vient du socle. Tout composant hors inventaire exige un ADR.

Aucune bibliothèque de graphiques, de Gantt ni de planning : ces vues existent déjà en HTML, CSS et SVG dans les maquettes et se portent en composants (`cadrage/03 § 4, D12`).

## Style

- Aucune couleur littérale : uniquement des jetons de `socle.css`. Tenu par `stylelint`.
- Le CSS propre à une vue va dans un module `.module.css`, jamais dans le socle. La carte section → vue → lot est en `DESIGN.md § 4`.
- `--r` vaut `3px` : net, jamais arrondi mou. Le registre est institutionnel.

## Droits, dans l'interface

Le client masque ou désactive **par courtoisie** (`RG-GEN-06`) : une action interdite n'est jamais proposée puis refusée. Une action désactivée porte une explication au survol.

Ce n'est **pas** un contrôle. Le contrôle est au serveur. Chaque vue doit rester crédible en variante « droits minimaux » comme en variante « administrateur » (`cadrage/02 § D.3`).

## États obligatoires

Toute vue de données traite : **vide · chargement · erreur · nominal · cas limites**. L'état vide explique et propose l'action suivante — jamais une zone blanche (`RG-GEN-04`). Les textes exacts sont dans `cadrage/02` et contractuels.

## Bilingue

Aucune chaîne visible en dur (`RG-GEN-08`). Tout passe par i18next, en français **et** en anglais. Prévoir des libellés anglais **30 % plus longs** : aucune largeur calée sur le français (`cadrage/02 § D.7`).

Dates et heures suivent le paramétrage global (`RG-GEN-09`), jamais un formatage manuel.

## Accessibilité — exigence contractuelle, pas confort

- Navigation clavier complète, y compris sur les grilles denses.
- Piège de focus dans les fenêtres, retour au déclencheur à la fermeture.
- Libellés d'assistance sur les grilles.
- **Le glisser-déposer est toujours doublé d'une action explicite au clavier** — « Déplacer vers… », « Réassigner à… » — accessible depuis le menu de l'élément. Ce n'est pas une traînée simulée : une action explicite est découvrable, annonçable et testable (`C6`, `cadrage/03 § 4, D4`).
- Les deux thèmes sont traités partout, y compris sur les codes couleur porteurs de sens.
