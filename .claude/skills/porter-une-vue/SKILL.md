---
description: Procédure complète de portage d'une vue maquettée en composants React. À invoquer pour toute tâche dont la sortie est une vue.
argument-hint: "[NN]"
---

# Porter la vue $0

## 1. Rassembler la cible

- Brief : `cadrage/02`, section « Vue $0 ». Lis la rubrique **Attention** en premier — elle nomme le piège propre à cette vue.
- Maquette : `mockups/$0-*.html`, **lecture seule**.
- États à couvrir : `design/etats.json`, entrée `"$0"`.
- Source CSS : `docs/design/DESIGN.md § 4` dit quelle section de la maquette est la tienne.
- Règles : `.claude/rules/ui.md`.

## 2. Transposer, ne pas dessiner

Le CSS de ta section devient un module `.module.css`. **Repris, pas réinterprété.** Aucune couleur littérale : les jetons de `socle.css` sont le contrat.

Les composants viennent de l'inventaire fermé (`DESIGN.md § 2`). Un composant manquant n'est pas une invitation à en écrire un : c'est une question à remonter.

## 3. Couvrir tous les états

Chaque entrée de `design/etats.json` pour ta vue. Sans exception, y compris :

- l'état **vide**, qui explique et propose l'action suivante — jamais une zone blanche ;
- l'état **erreur**, avec le texte exact de `cadrage/02` — il est contractuel ;
- les **cas limites** : listes longues, textes longs, droits restreints ;
- les **deux thèmes** ;
- les **deux langues**, en prévoyant l'anglais 30 % plus long.

## 4. Ce qui n'est pas dans la maquette

Tu remontes la question. Tu ne combles pas.

C'est la règle qui fait tout tenir : le texte seul sous-détermine l'interface, et un agent comble naturellement les vides avec ses habitudes. Un vide comblé silencieusement devient une décision produit que personne n'a prise.

## 5. Vérifier

```bash
pnpm verif
pnpm a11y -- $0
pnpm ui:diff $0
```

Montre les sorties. Un critère non démontré n'est pas satisfait.

**Écart attendu** : si la vue $0 ne fait pas partie des neuf maquettes conformes (01, 06, 07, 09, 14, 19, 22, 28, 30), un écart sur `--placeholder`, `--line-strong` et `--leave-pending` est normal et voulu — `socle.css` porte les valeurs RGAA. Voir `mockups/GEL.md`, écart 5.

## 6. Rendre

Compte rendu en trois parties : ce qui est couvert · ce qui ne l'est pas et pourquoi · **les questions que tu as dû trancher**. La troisième est la plus importante : elle alimente le diff retour.
