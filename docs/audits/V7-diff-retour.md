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

## L-45 — Les tâches candidates, et la pose d'un ensemble de dépendances

### Ce que le lot ferme

`EX-TSK-10` était en dette de test et le bouton « Modifier les dépendances » de la
vue 17 était **inerte, avec un motif exact** : le serveur posait et retirait un lien
(`POST`/`DELETE /taches/:id/dependances`) mais n'exposait pas la liste des tâches
candidates. Deux points d'entrée la comblent — `GET /taches/:id/dependances/candidats`
et `PUT /taches/:id/dependances` — et `GET /taches/:id/incoherences`, qui existait
sans client, alimente désormais l'avertissement de conflit dans la fenêtre.

### Ce que la mise en œuvre a trouvé, et qui n'était pas au plan

| Trouvaille | Traitement |
| --- | --- |
| **Une pose d'ensemble naïve DÉTRUIT les dépendances hors périmètre.** `candidatsDependance` ne propose pas un prérequis que le lecteur ne peut pas nommer, et `dependances()` ne le nomme pas non plus : l'utilisateur ne peut donc pas le renvoyer dans sa sélection. Un `PUT` qui remplace en gros le supprimerait au premier enregistrement — une écriture destructrice sur une donnée que l'auteur du geste n'a jamais vue, et dont rien ne l'avertirait. | **Corrigé dans ce lot.** La sélection ne fait autorité que sur ce qu'elle a pu montrer : les liens invisibles sont conservés tels quels. Test dédié, vérifié rouge sans le correctif. |
| **`PUT :id/assignes` n'exige pas de version, et c'est un écart de `RG-GEN-07`.** La pose d'ensemble des dépendances a le même profil : deux fenêtres ouvertes en même temps, la seconde écrase la première sans que personne ne le sache. | `PUT :id/dependances` exige la version lue et la double dans la clause `where` de la mise à jour, donc en base. **Reste ouvert** : `PUT :id/assignes` et `PUT :id/sous-taches/ordre` gardent l'écart. À traiter à part — le corriger ici aurait mêlé deux sujets. |
| **`cadrage/02:566` et `messages-metier.ts` ne disent pas la même chose du cycle.** Le brief donne « Cette dépendance créerait une dépendance circulaire » ; le catalogue serveur dit « Cette dépendance créerait un cycle : la tâche finirait par dépendre d'elle-même. » | Le bandeau de la fenêtre porte le texte du brief, qui est contractuel pour cet état de vue. **Reste ouvert** : les deux formulations doivent être réconciliées au cadrage, pas maintenues en parallèle. |
| **Le jeu d'essai de bout en bout de la vue 17 ne rendait pas `lisible`.** `TachesService.dependances` le rend TOUJOURS ; la fixture décrivait donc une forme que le serveur n'a jamais produite. Aucune boucle ne pouvait le voir tant qu'aucune vue ne filtrait sur ce champ — la fenêtre de sélection le fait, et trouvait `undefined`. | Corrigé. **Deuxième occurrence** dans ce même fichier du couple client/fixture qui se valide lui-même, après `GET /utilisateurs`. |
| **Le compte de requêtes est le seul contrôle qui voie le piège du lot.** Un filtrage par candidat (`fermeraitUnCycle` en boucle) est fonctionnellement JUSTE : tous les tests de règle passent au vert. Seule la lenteur diffère, et elle grandit avec le projet. | Un test compare le nombre de lectures de `taskDependency` à cinq puis à trente candidats et exige l'ÉGALITÉ. Mesuré : 21 requêtes des deux côtés avec la fermeture unique, 21 contre 46 avec le filtrage par candidat. |

### Décision tranchée

**Un candidat hors périmètre est EXCLU, pas masqué** — et c'est l'inverse de la règle
que `dependances()` applique douze lignes plus haut. Là-bas l'entrée demeure sans son
titre, parce que la retirer fausserait le compte annoncé (« Dépend de (2) » avec une
seule ligne). Ici on dresse une liste de choix : une case à cocher qu'on ne peut pas
nommer n'est pas un cloisonnement, c'est une case sans objet. Les deux règles sont
écrites l'une en face de l'autre dans le service, avec la raison de leur divergence —
sans quoi le prochain lecteur recopiera `masquer()` de bonne foi.
