# ADR-0003 — React Aria Components plutôt que Radix ou Base UI

- **Statut** : accepté — 2026-08-16
- **Source** : `cadrage/03 § 4, D3`

## Contexte

Trois bibliothèques séparent le comportement du style, ce que `C3` exige — les maquettes portent déjà le design system, on achète le comportement et on apporte le style.

## Décision

**React Aria Components 1.20.0**, stable, sur une ligne 1.x active depuis deux ans.

Elle apporte précisément ce dont ce produit a besoin : navigation clavier **bidimensionnelle sur les grilles**, gestion complète du focus dans les fenêtres, annonces vocales, sélecteurs de dates internationalisés, et une couverture RGAA/WCAG éprouvée.

## Ce qui est désormais interdit

- Introduire une bibliothèque de composants **stylés** : Material, Ant, Chakra, shadcn/ui. Leur adoption reviendrait à jeter le travail de conception pour le refaire dans un autre vocabulaire.
- Écrire un dialogue, un menu, une liste déroulante, un combobox, des onglets ou un sélecteur de dates à la main. Ce sont exactement les composants où l'accessibilité se rate.
- Ajouter un composant hors de l'inventaire fermé de `docs/design/DESIGN.md § 2` sans un nouvel ADR.

## Alternatives écartées

**Radix Primitives** — rachetée par WorkOS, vitesse de publication ralentie, en particulier sur combobox et sélection multiple dont ce produit fait un usage intensif. **Base UI** — techniquement excellente, mais publiée en `1.0.0-rc.0` : on ne fonde pas l'intégralité de l'interface d'un produit institutionnel sur une pré-version.

## Conditions de revanche

Base UI redevient un repli légitime dès sa 1.0 stable, si un composant venait à manquer.
