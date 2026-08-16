# ADR-0015 — Densité de la vue Mois : pas de virtualisation

- **Statut** : accepté — 2026-08-16
- **Source** : `cadrage/03 § 6, R5` — *« le point dur du produit »*
- **Vérifié le** : 2026-08-16, lot L-01, prototype jetable

## Contexte

`R5` désignait la vue Mois comme le principal risque de conception du produit : une grille de 22 à 31 colonnes sur N lignes, chaque cellule pouvant porter six natures d'information. La consigne était de la prototyper **en premier**, à la volumétrie cible, avant tout autre écran. Le repli envisagé : virtualisation par TanStack Virtual, et repli des services par défaut.

## Méthode

Plutôt que de reconstruire une grille approchante — qui n'aurait mesuré que sa propre approximation —, la mesure a porté sur **la maquette elle-même** : son DOM et son CSS sont ceux du produit. Les ressources ont été multipliées par clonage de profils et de cellules, puis le rendu a été rejoué.

Prototype jetable : rien n'est entré dans le dépôt.

## Ce que la mesure établit

Grille de 31 colonnes, rendu complet, Chromium :

| Ressources | Cellules | Nœuds DOM | Rendu | Défilement (30 images) |
| --- | --- | --- | --- | --- |
| 12 | 372 | 1 276 | 2 ms | 485 ms |
| 40 | 1 240 | 3 016 | 6 ms | 486 ms |
| 100 | 3 100 | 6 726 | 11 ms | 489 ms |
| 250 | 7 750 | 16 004 | 29 ms | 481 ms |
| **500** | **15 500** | **31 483** | **52 ms** | **493 ms** |

Le coût du rendu croît **linéairement** et reste modeste. Le défilement est **plat** — 16 ms par image, soit le budget de trame plein, quelle que soit la taille.

Sous bridage CPU, pour simuler un poste de travail modeste, à 500 ressources :

| Bridage | Un rendu complet |
| --- | --- |
| ×1 | 46 ms |
| ×4 | 199 ms |
| ×6 | **297 ms** |

## Décision

**Pas de virtualisation sur la vue Mois.** Le rendu direct du DOM tient à la volumétrie de l'instance entière, y compris sur matériel bridé six fois.

TanStack Virtual reste dans la pile pour la **matrice de compétences** et le **journal d'audit**, où la volumétrie n'est pas bornée par l'effectif.

## Ce qui est désormais interdit

- Introduire une virtualisation sur la vue Mois « par précaution ». Elle complique le glisser-déposer, l'impression, la colonne figée et la navigation clavier bidimensionnelle — quatre exigences dures — contre un gain nul et mesuré comme tel.
- Justifier une optimisation d'affichage sur cette vue sans **remesurer**. La mesure est reproductible ; l'intuition ne l'est pas.

## Le vrai enseignement : le risque était mal attribué

`R5` supposait un problème de **rendu**. La mesure dit que ce n'en est pas un.

Le budget de `cadrage/01 § 7` — planning d'un service sur une semaine en moins de deux secondes — sera dépensé **côté serveur**, dans l'agrégation qu'exige `RG-PLN-01` : tâches, congés, télétravail, événements, assignations, fériés et vacances scolaires réunis en une seule sollicitation, filtrés par le prédicat de périmètre.

**Conséquence pour L-20** : l'effort de conception va au point d'entrée agrégé et à ses index, pas à la couche de présentation. Et le contrôle de performance de `pnpm perf` doit porter sur la requête, non sur la peinture.

## Limites de la mesure, à ne pas oublier

- Chromium sans interface, sur une machine de développement. Le bridage ×6 approche un poste modeste, il ne le remplace pas.
- Rendu complet à chaque fois. Un rendu incrémental sur interaction serait moins coûteux ; la mesure est donc **pessimiste**, ce qui est le bon sens de l'erreur.
- 500 ressources, c'est l'instance entière. Une vue de département en compte quelques dizaines : le cas nominal est deux ordres de grandeur sous le cas mesuré.
- La mémoire relevée est restée plate à 10 Mo sur tous les paliers, ce qui est trop régulier pour être fiable : `performance.memory` est grossier. Ce chiffre n'est pas retenu comme résultat.
