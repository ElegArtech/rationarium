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

---

## L-40 — Commandes inertes et champs gouvernés déclarés

### Ce que le balayage a trouvé, et qui n'était pas au plan

| Trouvaille | Traitement |
| --- | --- |
| **`RG-ADM-02` n'était tenue que côté client.** `Roles.tsx` désactive « Enregistrer les permissions » sur un rôle système ; `definirPermissions` ne regardait pas `systeme`. Une requête forgée sur `PUT /administration/roles/:id/permissions` **vidait `ADMIN`** — et nul ne pouvait le restaurer, puisque restaurer exige `users:manage_permissions`, qui vit dedans. | **Corrigé dans ce lot.** Le raisonnement était déjà écrit douze lignes plus haut, sur `renommer`. Le discriminant existait aussi : l'alignement du référentiel appelle sans acteur, la route HTTP avec. Deux tests, vérifiés rouges sans le correctif. |
| **Douze commandes inertes, pas deux.** Le plan en annonçait deux ; le balayage exhaustif en trouve douze. Sept sont légitimes (branches conditionnelles, composant `RG-GEN-06`). Cinq portent un motif d'absence, dont **un partiellement faux** : `Fiche.tsx · modifier` dit qu'aucune route n'existe alors que `PATCH /taches/:id` existe — c'est le formulaire complet qui n'est pas porté. | Déclarées et motivées une par une dans `design/inoperants.json`. |
| **`RG-TLT-07` est atteinte par trois routes, pas une.** `POST /teletravail`, `PATCH /planning/teletravail` et `POST /teletravail/generer` passent toutes par l'absence de contrôle. | Ouvert. La correction devra fermer les trois, pas la seule que l'audit nommait. |
| **`profil.tsx` porte le seul inerte du produit sans aucune explication** — ni infobulle ni `aria-description`, alors que `RG-GEN-06` dit « désactivée **avec** explication ». | Ouvert. |
| **Citation fausse** dans `conges.controller.ts` : `POST /conges` cite `EX-CNG-11` (« déléguer son pouvoir de validation ») ; le geste est `EX-CNG-08` (« déclarer pour un collaborateur »). | Ouvert — vague 7-4. |
| **`POST /conges` gouverne `userId` par sa propre voie** (`verifierDeclarationPourAutrui`), antérieure à `champs-gouvernes.ts`. La gouvernance est réelle mais dupliquée. | Ouvert : à résorber dans la déclaration unique. |

### Décision tranchée

L'agent a déclaré **six** identifiants non testables là où le plan en suggérait onze,
et a refusé d'inventer les cinq autres : « chaque identifiant rangé à tort en
`nonTestable` est un test qui ne sera jamais écrit — c'est la seule liste dont
l'inflation est silencieusement nuisible ». Décision retenue. Les cinq restants sont
en dette avec leur note.

### Décision tranchée — L-41

Une plage (`describe("RG-CNG-01 à 07")`) ne cite personne au sens de la règle, mais un
`describe` dédié à une seule règle, si. Les deux lectures ont été mesurées : `it`
seul donnait 130 identifiants couverts, `it` + `describe` en donne 238. La seconde est
retenue — `describe("RG-CNG-20 — le solde compte les ENGAGÉS")` **est** une suite
dédiée à cette règle. L'exclusion ne porte que sur les plages.

## Défaut de coordination de la vague 1, à corriger avant la vague 2

Les trois arbres de travail isolés ont été taillés **cinq commits en retard sur
`main`** : ni les gabarits de contrôle, ni `champs-gouvernes.ts`, ni le renommage n'y
existaient. Fusionner les branches aurait annulé la journée. Les fichiers ont été
repris à la main et réadaptés. Un agent a rebasé de lui-même ; les deux autres ont
travaillé sur une base périmée et l'un a recréé un `package.json` déjà branché.

Par ailleurs `packages/db/src/generated` étant ignoré par git, `pnpm typecheck` échoue
sur tout arbre neuf tant que `prisma generate` n'a pas été rejoué. Les trois agents
s'y sont cognés.

---

## L-47 et L-49 — trois capacités branchées

| Route | Vue | Ce qu'elle débloque |
| --- | --- | --- |
| `POST /projets/:id/annuler` | 11, `.proj-acts` | `RG-PRJ-02`. **Tout l'aval était porté** depuis L-32 — le bandeau d'état annulé, le bouton « Restaurer », le refus de modifier un projet annulé — et rien ne pouvait produire l'état. Le premier des trois temps de `RG-GEN-10` manquait : **la suppression définitive était le seul chemin offert**, donc perdre tâches, jalons et équipe pour corriger une erreur de saisie. |
| `DELETE /administration/roles/:id` | 32, `.lv-acts` | `EX-ADM-03`. La vue créait, ouvrait et modifiait ; elle ne supprimait pas. Le bouton est désactivé sur un rôle système, avec son motif au survol (`RG-DROITS-02`, courtoisie côté client — le refus qui compte reste au serveur). |
| `GET /teletravail/statistiques` | 28, `.kpi-grid` de l'onglet Télétravail | `EX-TLT-08`. L'onglet ne rendait qu'une liste de dates ; le brief réclame quatre indicateurs dont « moyenne mensuelle », que `GET /suivi` ne porte pas. Calculés depuis L-16, affichés nulle part. |

Aucune décision de cadrage. Cinq tests, dont deux vérifiés rouges sans le correctif.
Dette de traçabilité : 117 → 115.

---

## RG-TLT-07 — la règle était écrite, tenue nulle part

Ouverte par L-38, élargie par L-40 (« trois routes, pas une »), fermée ici.

`basculer`, `generer` et `statistiques` recevaient `userId` **et** `acteurId` et ne
les comparaient jamais. Les trois routes qui les servent font retomber `userId` sur
l'acteur *par défaut* — ce qui donne l'apparence d'un contrôle là où il n'y en avait
aucun. Tout porteur de `telework:create`, c'est-à-dire **tout agent**, pouvait poser du
télétravail sur le calendrier de n'importe qui, et en générer un mois entier.

### Décision : la granularité de « distincte selon l'action »

`RG-TLT-07` dit « une permission dédiée, **distincte selon l'action** (consulter,
saisir, modifier, supprimer, gérer les règles) ». Le catalogue est fermé
(`cadrage/01 § 3.2`) et ne porte pas une permission « pour autrui » par action.

**Lecture retenue, en deux temps** : la permission de l'action garde la route
(`create`, `generate`, `manage_rules`, `read`), et une seconde autorise à viser
quelqu'un d'autre — `telework:manage_any` pour écrire, `telework:read_team` pour lire.
Les deux vivent dans le bloc `ENCADREMENT` du catalogue de rôles : **aucun modèle de
rôle ne change**, un agent n'agit que sur lui-même, un encadrant sur son équipe.

Écriture au cadrage : aucune. La règle existante se suffit ; c'est son application qui
manquait. *(Si l'arbitrage humain préfère une permission par action, il faudra ouvrir
le catalogue — décision plus lourde, et qui n'était pas nécessaire pour fermer le
trou.)*

### Un défaut trouvé en écrivant le test

`statistiques` rendait **`annee: jours.length`** — le champ nommé « année » portait un
nombre de jours, alors que la requête prend une année en entrée. Personne ne l'avait
vu parce que **personne n'appelait cette route** : aucun écran ne la consommait, donc
aucune assertion ne portait sur sa forme. C'est exactement le défaut qu'une capacité
sans client cache par nature. Corrigé : `annee` porte l'année, `total` le décompte.

### Un défaut du garde-fou lui-même

`scripts/tracabilite-check.mjs` listait les fichiers de test par `git ls-files` : **un
fichier neuf y est invisible tant qu'il n'est pas indexé**. Le contrôle répondait
« aucun test ne cite cette règle » à qui venait de l'écrire, et l'invitait à inscrire
en dette une règle déjà couverte. Il balaie désormais le système de fichiers. Le
plancher d'inventaire mord toujours — vérifié en cassant l'extraction.

Nouveau fichier : `apps/api/src/teletravail/teletravail.int.test.ts`. Le module était
le seul module métier substantiel sans test à son nom.

---

## Vague 4 bis — les trois routes redondantes : décision

**Elles restent, documentées dans `SANS_CLIENT` avec leur raison.** Le plan laissait le
choix entre suppression et documentation.

Motif du choix : supprimer une capacité calculée et testée a un coût, et
`GET /projets/:id/budget` est précisément le point d'entrée naturel pour rafraîchir un
indicateur après une saisie de temps — une vue future le voudra. La raison de leur
existence est désormais écrite là où un lecteur la rencontrera, et le garde-fou de
L-39 refuse toute route qui ne serait ni appelée ni déclarée. Le lot est clos.
