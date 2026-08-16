# ADR-0001 — Application monopage, sans rendu serveur

- **Statut** : accepté — 2026-08-16
- **Source** : `cadrage/03 § 4, D1`

## Contexte

Le produit est un outil interne authentifié, ouvert plusieurs heures par jour, sans enjeu de référencement ni de première peinture sur réseau lent. Ses vues les plus lourdes — planning, kanban, Gantt, matrices — sont des grilles interactives à état riche : filtres par couche, repli par service, glisser-déposer, panneaux latéraux.

C'est exactement le profil que le rendu serveur sert le moins bien.

## Décision

**React servi en fichiers statiques, dialoguant avec une API REST.** Un seul artefact à déployer côté client, aucun serveur de rendu à exploiter en réseau fermé.

## Ce qui est désormais interdit

- Introduire un framework à rendu serveur : Next.js, Remix, React Router en mode framework, TanStack Start, Nuxt. Ils ajoutent un serveur à exploiter sous `C1` pour un bénéfice nul sur ce profil d'usage.
- Introduire du rendu serveur partiel « juste pour les vues simples ». Vingt vues simples ne justifient pas une seconde architecture ; les vues 07, 08, 15, 22 et 32 la rendraient de toute façon intenable.
- Faire dépendre une fonctionnalité du HTML engendré côté serveur.

## Alternatives écartées

**HTMX et le rendu serveur classique** — séduisants pour les vingt vues simples, intenables sur les grilles denses à état riche. **Les frameworks pleine pile** — coût d'exploitation supplémentaire en réseau fermé, sans contrepartie ici.
