# Contribuer à Rationarium

Merci de votre intérêt. Ce guide dit comment préparer un poste, ce qu'on attend d'une
contribution, et comment la proposer.

Les failles de sécurité ne se signalent pas ici : voir [SECURITY.md](SECURITY.md).

## Avant de commencer

- Pour un défaut, ouvrez une issue avec le modèle « Défaut ».
- Pour une fonctionnalité ou une règle nouvelle, ouvrez d'abord une issue « Demande » :
  on se met d'accord sur la règle avant d'écrire le code.

## Préparer un poste

La mise en place complète est décrite dans [l'architecture](docs/architecture.md#développement-local) :
Node.js 24, pnpm 11.22.0 et Docker, puis une base PostgreSQL de développement avec
`deploiement/compose.dev.yaml`.

## Vérifications

| Commande | Rôle |
| --- | --- |
| `pnpm verif` | Typage, ESLint, Stylelint, traductions, contrôles de permissions et de traçabilité, tests unitaires. Doit être vert avant toute demande de fusion. |
| `pnpm test:int` | Tests d'intégration sur PostgreSQL réel (Testcontainers, exige Docker). Obligatoire dès qu'un module serveur change : `verif` ne le lance pas. |
| `pnpm e2e`, `pnpm a11y` | Parcours de bout en bout et accessibilité. À lancer **depuis `apps/web`**. |
| `pnpm build` | Construction de tous les espaces de travail. |

## Conventions

- **Le code est en français** : noms de variables, de fonctions, commentaires et messages de
  commit. C'est un choix assumé du projet. Les contributions en anglais sont lues avec plaisir
  dans les issues ; le code fusionné reste en français.
- **Règles de gestion.** Le comportement attendu est décrit dans la
  [référence fonctionnelle](docs/reference-fonctionnelle.md), par identifiants `EX-…`
  (exigences) et `RG-…` (règles). Une règle modifiée ou ajoutée l'est d'abord dans ce document ;
  chaque règle a au moins un test dont le titre la cite.
- **Références internes.** Des commentaires et des tests renvoient à `cadrage/…`,
  `.claude/rules/…` ou `recette/…` : ce sont les documents de conception et de recette internes
  du projet, qui ne sont pas publiés dans ce dépôt. Le contenu qui fait foi pour une contribution
  est public : les exigences `EX-…` et les règles `RG-…`, avec les sections du cadrage qu'elles
  citent (§ 3.2, § 4.1, modules `M…`), sont décrites dans la
  [référence fonctionnelle](docs/reference-fonctionnelle.md), et les conventions dans ce guide.
- **Droits.** Tout contrôle de droit se fait au serveur : permission, puis périmètre. Le client
  masque ou désactive une action par courtoisie, jamais par sécurité.
- **Concurrence.** Une écriture porte la version lue : un conflit se détecte, il ne s'écrase pas.
- **Interface.** Aucune chaîne visible en dur : tout passe par i18next, en français et en anglais.
  Aucune couleur littérale hors `apps/web/src/styles/socle.css` : on emploie un jeton.
  On réutilise les classes du socle plutôt que d'en inventer.
- **Schéma de base.** Une modification de `packages/db/prisma/schema.prisma` est une contribution
  à part, avec sa migration réversible.
- **Dépendances.** Une dépendance nouvelle se justifie dans la demande de fusion.

## Commits et demandes de fusion

Format des commits :

```
<type>(<portée>): <objet> [EX-…][RG-…]
```

Exemple : `fix(conges): seul le validateur désigné décide d'une demande [RG-CNG-34]`.

Une demande de fusion décrit le problème, la règle concernée, et la façon dont le changement a
été vérifié. Remplissez le modèle proposé.

## Code de conduite

La participation au projet suit le [code de conduite](CODE_OF_CONDUCT.md).
