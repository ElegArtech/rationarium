# Vague 7 — journal des décisions et des écritures au cadrage

Le gel de `cadrage/` est levé depuis le 2026-08-31 : les agents de cette vague
peuvent y écrire. Le garde-fou de remplacement est ce fichier. **Toute** décision
tranchée en autonomie et **toute** écriture dans `cadrage/` y figure, avec sa
motivation et le lot qui l'a faite. Une modification non journalisée est un défaut de
vague, pas un détail.

Arbitrage humain à la clôture de la vague.

---

## L-38 — Cloisonnement des champs gouvernés

### Décisions tranchées

| # | Décision | Motivation | Écriture au cadrage |
| --- | --- | --- | --- |
| 1 | `roleId` sur `POST` **et** `PATCH /utilisateurs/:id` exige `users:manage_roles`. | La séparation était **énoncée** dans `packages/contracts/src/roles.ts` — « `IT_SUPPORT` : pas de gestion des rôles, c'est la limite qui sépare le support de l'administration » — et **tenue nulle part**. `IT_SUPPORT` détient `users:update` sans `users:manage_roles` : il pouvait s'attribuer `ADMIN`. Aucune règle du cadrage ne l'interdisait explicitement ; `RG-DROITS-03` (liste blanche stricte) le couvre en esprit. | Aucune pour l'instant. **Proposition** : une `RG-DROITS-04` — « la liste blanche vaut à l'intérieur d'un point d'entrée : un champ dont l'écriture confère un droit est gouverné par la permission de ce droit, pas par celle de la route. » |
| 2 | `chefId` et `sponsorId` sur `PATCH /projets/:id` exigent `projects:manage_members`. | `RG-SCOPE-02` : « un projet est visible par son créateur, son **chef**, son **sponsor** et ses membres. » Les nommer donne donc un accès, exactement comme ajouter un membre — lequel exige `projects:manage_members`. La route était gardée par `projects:update`. | Aucune. La règle existante suffit à motiver le refus. |
| 3 | Le refus est **total**, jamais partiel : aucun champ n'est écrit si l'un d'eux est refusé. | Une écriture partielle laisserait l'appelant croire son geste passé, et obligerait à comparer champ par champ pour savoir ce qui a pris. Le message le dit : « le reste de votre modification n'a pas été enregistré ». | — |
| 4 | La règle est déclarée **une fois**, en données, dans `apps/api/src/commun/champs-gouvernes.ts`. | Dupliquée par service, elle diverge — et le troisième cas s'écrirait sans le quatrième. Le garde-fou de L-40 ira lire cette déclaration. | — |

### Ce que le balayage des 191 routes a trouvé, et qui n'est PAS traité dans ce lot

Le dépôt exige qu'un audit ouvre ses correctifs en tâches à part entière, jamais
appliqués au fil de l'audit (`docs/dag.md`, vague 6). Ces trois-là sont donc ouverts,
pas corrigés ici :

| Trouvaille | Nature | Pourquoi pas dans L-38 |
| --- | --- | --- |
| **`RG-TMP-04` n'est appliquée nulle part.** `apps/api/src/temps/temps.service.ts:118` **calcule** `pourAutrui` pour le journal d'audit et ne refuse rien : la trace dit ce que le contrôle aurait dû empêcher. | Enforcement absent | La permission `time_tracking:declare_for_third_party` **existe au catalogue et aucun rôle ne la détient** — l'appliquer casserait toute saisie pour autrui tant que les modèles de rôles ne sont pas revus. Incohérence à trois branches (règle / permission / rôles) qui demande sa propre décision. |
| **`RG-TLT-07` n'est appliquée nulle part.** `teletravail.basculer(userId, …, acteurId)` reçoit les deux et ne les compare jamais. | Enforcement absent | Même nature : « une permission dédiée, **distincte selon l'action** » demande de décider quelle permission pour quelle action (consulter / saisir / modifier), donc une lecture du catalogue `telework:*`. |
| `POST /projets` accepte `chefId`/`sponsorId` sous `projects:create`. | Motif identique, portée faible | Nommer un chef à la **création** est le geste nominal (`EX-PRJ-03` : « créer un projet : … chef, sponsor »). Le refuser casserait la création pour tout rôle sans `manage_members`. À trancher avec les modèles de rôles sous les yeux. |

### Correction de citation faite au passage

`utilisateurs.int.test.ts` — le bloc « un compte SE MODIFIE » citait `EX-USR-02`
(« Rechercher et filtrer »). C'est `EX-USR-04` (« Modifier un compte, y compris son
rôle et ses rattachements »). Corrigé.

### Preuves

Sept tests nommés, tous **vérifiés rouges sans le correctif** :

- `REFUSE d'écrire roleId sans users:manage_roles`
- `REFUSE aussi de RETIRER un rôle — roleId: null est une écriture gouvernée`
- `REFUSE de CRÉER un compte porteur d'un rôle sans users:manage_roles`
- `laisse passer les autres champs pour le même acteur — le refus est CIBLÉ`
- `ACCEPTE roleId quand l'acteur porte users:manage_roles`
- `REFUSE d'écrire chefId sans projects:manage_members`
- `REFUSE de même sponsorId — les deux donnent la visibilité`

`pnpm verif` vert · `pnpm test:int` : 546 tests, 28 fichiers, verts.
