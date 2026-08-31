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

## L-43 — Exécuter les imports de compétences et de congés

`POST /imports/competences` était appelé par la vue 22 et n'existait pas : un 404 que
seule l'action de l'utilisateur révélait. `POST /imports/conges` n'existait ni au
serveur ni au client, alors que `EX-CNG-14` l'exige et que la maquette 19 porte le
bouton (`#btn-import`). Les deux aperçus, eux, fonctionnaient depuis L-24 : seule
l'**écriture** manquait.

### Décisions tranchées

| # | Décision | Motivation | Écriture au cadrage |
| --- | --- | --- | --- |
| 1 | **La colonne `category` des compétences porte le CODE du vocabulaire** (`technical`, `methodology`, `soft_skill`, `business`). Le modèle a été corrigé — il proposait `Technique`. Les libellés FR/EN restent **acceptés en lecture**. | Les deux bouts se contredisaient : `modele()` enseignait le libellé, `exporterCompetences()` écrivait le code. **Un export n'était donc pas réimportable**, ce que le commentaire de `exporterTaches` promet pourtant pour tout le module. Le code est la seule valeur stable — indépendante de la langue de l'agent et de la casse de son tableur —, et c'est celle que la base stocke. Tolérant en entrée parce qu'une personne qui remplit un tableau à la main écrit « Savoir-être » ; strict en sortie parce que c'est la sortie qui doit se réimporter. | Aucune. `cadrage/01 § M21` ne donne pas de format à cette colonne — il ne le donne pour aucune. **Question ouverte** : faut-il que `§ M21` énonce « les colonnes d'énumération portent le code de `§ 4.1` » ? La règle vaudrait aussi pour `status` et `priority` des tâches, qui font déjà ainsi sans que rien ne le dise. |
| 2 | **Un congé importé est directement approuvé**, l'importateur pour validateur — sauf la ligne qui désigne l'importateur lui-même, qui suit le régime ordinaire du dépôt. | `RG-CNG-14` : un congé déclaré pour un collaborateur est directement approuvé. Un import est par nature une déclaration pour autrui — ce qu'on importe est un état constaté, pas une intention ; deux cents demandes en attente noieraient le validateur. **L'exception est le point délicat** : approuver la ligne de l'importateur ferait de l'import un contournement de `RG-CNG-09`, qui interdit d'approuver sa propre demande sans permission explicite. Une route d'import ne doit pas offrir ce qu'une route de validation refuse. | **Oui — `RG-CNG-33` ajoutée.** La règle n'existait pas ; le comportement se serait sinon déduit d'une lecture de code. |
| 3 | **Le solde est contrôlé, pas contourné.** Une ligne au-delà du disponible part en **erreur**, avec le message chiffré de `RG-CNG-21`. | `RG-CNG-21` ne prévoit aucune dispense pour l'import, et `RG-CNG-32` n'énumère que deux cas d'ignoré : doublon et chevauchement. Passer outre écrirait des soldes négatifs que plus rien ne signale, et le compte rendu annoncerait « 200 importés » sur un référentiel devenu faux. | **Oui — `RG-CNG-32` précisée** : « ignoré » ne couvre que doublon et chevauchement ; tout autre refus est en erreur, contrôle de solde compris. |
| 4 | **L'import de congés délègue à `CongesService.deposer`**, ligne à ligne, plutôt que de réécrire la création. | Décompte en jours ouvrés, demi-journée, répartition par année, contrôle de solde, refus de chevauchement, détermination du validateur : tout y est déjà, avec ses tests. Une seconde version divergerait au premier amendement — le dépôt a déjà payé « deux lectures d'une même donnée finissent par se contredire sans qu'aucune boucle ne le voie ». Effet de bord assumé : `ImportsModule` importe désormais `CongesModule`. | — |
| 5 | **Le périmètre s'applique ligne à ligne** à l'import de congés : un agent hors périmètre est refusé, en erreur. | Permission **puis** périmètre, `cadrage/03 § 5.4`. Sans ce refus, `leaves:import` deviendrait une écriture globale déguisée : un manager de service poserait des congés sur toute l'instance avec un fichier de deux colonnes. Aucun périmètre en revanche sur l'import de compétences — une compétence n'appartient à aucun département ; c'est une propriété du référentiel, énoncée dans le service pour qu'elle ne passe pas pour un oubli. | Aucune. `RG-SCOPE-01` et `RG-SCOPE-03` suffisent. |
| 6 | `leaveTypeName` accepte le **nom** puis, à défaut, le **code** du type. | La colonne s'appelle « name », donc le nom d'abord. Mais un fichier venu d'un autre outil RH porte plus souvent « CA » que « Congés annuels », et refuser ce fichier n'apprend rien à personne. | Aucune. |
| 7 | `halfDay` est refusé sur une période de plusieurs jours. | Le CSV n'a qu'une colonne là où le modèle en porte deux (début et fin) : un fichier plat ne peut pas exprimer « matin le premier jour, après-midi le dernier ». C'est exactement le cas que `RG-CNG-18` réserve au congé d'une seule journée. | Aucune. |

### Écritures dans `cadrage/`

- `01 § M10` — **`RG-CNG-32` précisée** : le périmètre du mot « ignoré », et
  l'application du contrôle de solde à l'import.
- `01 § M10` — **`RG-CNG-33` ajoutée** : approbation directe d'un congé importé, et
  son exception pour la ligne de l'importateur.

### Le piège que ce lot a payé, et qui mérite d'être consigné

**Une tolérance en lecture rend aveugle le test qui la surplombe.** Les deux contrôles
du format `category` — « le modèle s'importe » et « l'export se réimporte » — sont
restés **verts** sous les deux mutations qu'ils existaient pour attraper : puisque
l'import accepte aussi le libellé français, un export en « Technique » se réimportait
tout aussi bien. Les tests prouvaient l'aller-retour, pas l'arbitrage. Ils épinglent
désormais la **forme écrite** (`expect(csv).toContain(";technical;")`), en plus de
l'aller-retour. Rien d'autre ne pouvait le voir : c'est la validation par la négative,
et elle seule, qui l'a montré.

Second incident, méthodologique : `open(chemin, "w")` **tronque avant** de lever. Un
script de restauration dont la source manquait a vidé `imports.service.ts` — fichier
reconstruit depuis git et les scripts de correctif. Toute restauration lit sa
référence **avant** d'ouvrir la cible.

### Ce qui reste ouvert

- `POST /imports/projet/:id/taches` et `/jalons` restent des 404 appelés par les vues
  12 et 13. C'est L-44, en parallèle.
- La question 1 ci-dessus : `cadrage/01 § M21` ne dit pour aucune colonne
  d'énumération si elle porte le code ou le libellé. Trois imports le font déjà par
  convention tacite.
- `RG-CNG-15` et `RG-CNG-29` sortent de la dette de traçabilité par des tests qui les
  exercent **sur le chemin de l'import**. La déclaration pour autrui de `EX-CNG-08` et
  la non-sélectionnabilité d'un type désactivé dans l'interface restent, elles, sans
  test dédié.
