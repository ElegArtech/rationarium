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

---

## RG-TMP-04 — trois branches qui se contredisaient

Ouverte par L-38, fermée ici. C'était le cas le plus enchevêtré des trois :

- la **règle** est au cadrage depuis le début ;
- la **permission** `time_tracking:declare_for_third_party` est au catalogue ;
- **aucun modèle de rôle ne la détenait**, et **aucun code ne l'exigeait**.

Pire : `temps.service.ts` **calculait** `pourAutrui` pour le journal d'audit sans
jamais rien refuser. La trace disait exactement ce que le contrôle aurait dû
empêcher — et un journal qui décrit une situation que rien n'interdit donne
l'impression que la règle est tenue.

### Décisions

| # | Décision | Motivation | Écriture au cadrage |
| --- | --- | --- | --- |
| 1 | « Tiers » désigne **toute personne autre que soi-même**, collègue ou intervenant extérieur. | `RG-TMP-03` écrit « l'acteur d'une saisie (agent **ou** tiers) » : les deux sont des sortes d'acteur. Ne gouverner que `thirdPartyId` aurait laissé ouvert le cas le plus courant — déclarer sur le compte d'un collègue. | **Oui** : `RG-TMP-04` précisée dans `cadrage/01`, avec la date et le lot. |
| 2 | La permission rejoint le bloc `ENCADREMENT` du catalogue de rôles. | Elle existait sans porteur : la règle était donc **inapplicable**, ce qui explique qu'elle n'ait jamais été appliquée. L'encadrement porte déjà `leaves:declare_for_other`, le même geste pour l'autre domaine. | Non — modèle de rôle, pas cadrage. |
| 3 | On garde le nom `declare_for_third_party` plutôt que de l'aligner sur `declare_for_other` des congés. | Harmoniser deux noms d'un catalogue **fermé** est une décision à part entière, pas un effet de bord d'un correctif. Consigné comme incohérence de nommage à arbitrer. | Non. |

Le correctif ne casse rien côté client : `Temps.tsx` ne déclare que pour soi, et
aucune vue n'envoie `thirdPartyId` sur une saisie — vérifié.

Cinq tests, deux vérifiés rouges sans le correctif, dans un fichier neuf
`apps/api/src/temps/temps.int.test.ts`. Le garde-fou de L-40 a lui-même attrapé la
conséquence : l'admission `POST /temps · userId` est devenue orpheline et devait
sortir de `design/inoperants.json`.

**Les trois cas ouverts par L-38 sont désormais tous fermés** : `RG-TMP-04`,
`RG-TLT-07`, et le `chefId`/`sponsorId` de `POST /projets` — ce dernier reste
volontairement admis, nommer un chef à la création étant le geste nominal
(`EX-PRJ-03`).
## L-42 — Modifier et supprimer un événement

`EX-EVT-06`. Les deux commandes du panneau de détail de la vue 18 étaient inertes, et
leur motif était **exact** : `PATCH` et `DELETE /evenements/:id` n'existaient pas. Le
lot crée les deux routes, écrit la règle de portée qui manquait, et les branche.

### Écriture au cadrage : `RG-EVT-07`

> **RG-EVT-07** — Toute modification ou suppression d'un événement appartenant à une
> série **déclare sa portée** : *cette occurrence seulement*, ou *cette occurrence et
> les suivantes*. La portée est obligatoire sur une série et refusée hors série. La
> portée « série » **n'agit jamais sur les occurrences antérieures à celle qui est
> visée** — même borne que `RG-EVT-04` —, et la date, qui distingue les occurrences
> les unes des autres, ne se modifie que sur une occurrence. Supprimer l'occurrence
> porteuse de la récurrence ne supprime pas les autres : la plus ancienne conservée en
> prend la suite.

**Pourquoi elle manquait.** Aucune `RG-EVT` ne disait ce que « modifier » ou
« supprimer » font sur une occurrence d'une série, alors que le brief de la vue 18 en
fait un point d'attention : « la distinction entre modifier une occurrence et modifier
toute la série doit être explicite au moment de l'action, pas découverte après coup »
(`cadrage/02:598`). Le produit ne pouvait pas servir `EX-EVT-06` sans trancher.

**Pourquoi cette formulation.** Elle prolonge `RG-EVT-04` plutôt que d'inventer une
doctrine : l'arrêt de récurrence « supprime les occurrences futures et conserve les
passées ». La borne du passé y est la date que l'utilisateur vise, pas la date du
jour ; « toute la série » emploie exactement la même. Une troisième portée — « la
série entière, passé compris » — a été écartée : c'est précisément ce que `RG-EVT-04`
refuse depuis `EX-EVT-07`, et l'ouvrir ici la contournerait par la porte d'à côté.

### Décisions tranchées

| # | Décision | Motivation |
| --- | --- | --- |
| 1 | La portée est **obligatoire sur une série et refusée hors série** — deux refus (`portee_requise`, `portee_sans_serie`), pas un défaut implicite. | Un défaut côté serveur laisserait un client sauter la question, et l'utilisateur découvrirait l'effet après coup : exactement ce que le brief refuse. La règle est tenue là où elle ne se contourne pas. |
| 2 | Supprimer le parent d'une série **promeut** la plus ancienne occurrence conservée au rang de parent, au lieu de refuser la suppression. | `onDelete: Cascade` sur la relation « Serie » : sans promotion, une ligne détruite emporte toute la série, le passé compris. Refuser aurait rendu la première occurrence d'une série indestructible — une limitation arbitraire pour un défaut technique. Le schéma est gelé ; la parade est applicative et transactionnelle. |
| 3 | La **date ne se propage jamais** à une série (`date_non_propageable`), et le formulaire ne propose pas le champ en portée « série ». | La date est ce qui distingue deux occurrences : la propager les effondrerait en doublons d'un même jour. Ignorer le champ en silence ferait croire à une modification appliquée. |
| 4 | `version` voyage en **paramètre de requête** sur le `DELETE`, en corps sur le `PATCH`. | Un corps sur un `DELETE` est licite mais mal traité par les intermédiaires, et aucune autre route du produit n'en envoie. En requête, `version` est l'exact équivalent d'un `If-Match`. |
| 5 | La suppression **hors série garde sa confirmation**, alors qu'`askScope` de la maquette supprime sur un simple clic. | Ce qui est court-circuité hors série, c'est la **question de portée** — une question à une seule réponse n'en est pas une. La confirmation, elle, reste : c'est le seul geste irréversible du panneau, et la maquette y prend un raccourci de maquette. La fenêtre est la même, sans ses deux options. |
| 6 | Les libellés de confirmation ne reprennent pas ceux des commandes : « Continuer », « Supprimer définitivement ». | La fenêtre de portée ne modifie rien — elle ouvre le formulaire. Et deux commandes de même nom accessible dans un même document sont indistinguables au lecteur d'écran. |
| 7 | `event.update` et `event.delete` sont portés au **journal d'audit**, alors que la liste fermée de `01 § M20` ne nomme pas les événements. | Le module trace déjà `event.create` et `event.recurrence_stop` depuis L-14. Tracer la création sans la suppression serait le pire des deux mondes. **À arbitrer** : soit `01 § M20` accueille les événements, soit le module cesse de tracer — mais pas à moitié. |

### Défauts corrigés au passage

| Défaut | Portée |
| --- | --- |
| **Le client inventait la forme de la réponse.** `api/occupations.ts` déclarait `frequenceSemaines` / `jourSemaine` / `recurrenceJusqua` — les noms du corps de **création** — quand `surPlage` rend les champs Prisma `recurrenceFrequence` / `recurrenceJourSemaine` / `recurrenceFin`. Trois champs toujours `undefined` : la moitié de la détection de série était morte, et un événement **parent** ne se signalait pas comme série. Le jeu d'essai de bout en bout recopiait l'invention et la validait. Deuxième occurrence exacte du couple client/fixture déjà payé sur la vue 27, quatrième de la famille. | Corrigé. Le type porte aussi `version`, sans laquelle aucune écriture n'est composable (`RG-GEN-07`) — c'est ce qui avait fait conclure à tort que `PATCH /auth/me` n'existait pas. |
| **`arreterRecurrence` n'avait aucun contrôle de périmètre.** La route exigeait `events:update` et n'a jamais confronté l'événement au périmètre de l'appelant : écrire sur ce qu'on n'a pas le droit de lire. | Corrigé — même prédicat que la lecture, extrait en `clauseVisibilite` et partagé, pour qu'une lecture et une écriture de la même table ne divergent pas. |
| **« Arrêter la récurrence » était proposé sans `events:update`.** La route l'exige : l'action était proposée puis refusée, contre `RG-GEN-06`. | Corrigé, et vérifié par un parcours de bout en bout en variante « droits minimaux ». |

### Restes ouverts

- **`POST`/`DELETE /evenements/:id/participants` n'ont toujours pas de contrôle de
  périmètre** — hors périmètre de ce lot (un autre les branche), mais le défaut est le
  même que celui d'`arreterRecurrence`, et il subsiste.
- **Le journal d'audit du produit est alimenté à la main par les services**, alors que
  `.claude/rules/api.md` dit « aucun code n'y écrit autrement que par l'intercepteur ».
  Il n'existe aucun intercepteur d'audit dans `apps/api`. Ce lot a suivi la convention
  du code, pas celle de la règle. L'écart est antérieur et général ; il se tranche
  ailleurs.
- **Les paramètres de récurrence ne sont pas modifiables** (`recurrenceFrequence`,
  `recurrenceJourSemaine`, `recurrenceFin`). Les changer régénérerait la série, ce qui
  est un autre geste que « modifier » ; `EX-EVT-06` ne le demande pas explicitement.
  Si le besoin est réel, il veut son exigence.
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

---

## L-44 — Les deux dernières routes appelées dans le vide

`apps/web/src/api/imports.ts` déclarait `importerTaches` et `importerJalons` depuis
des mois, et **le serveur n'exposait ni l'une ni l'autre** : deux 404 que seule
l'action de l'utilisateur révélait. Ni le typage, ni les parcours de bout en bout, ni
aucune boucle ne voit un appel client sans route en face.

C'est le **test de sens inverse** que l'agent de L-39 a ajouté de sa propre initiative
qui les a trouvés — il n'était pas au contrat. Sa liste est désormais **vide**, et un
quatrième appel dans le vide la ferait rougir.

### Décision : extraire plutôt que recopier

L'insertion des jalons et des tâches vivait à l'intérieur de `importerProjet`. Les
deux nouvelles routes auraient pu la recopier ; elle est extraite en trois méthodes
privées (`jalonsExistants`, `insererJalons`, `insererTaches`) que les **trois** points
d'entrée partagent. Deux copies divergeraient au premier ajout de colonne — et faire
diverger deux chemins qui posent la même chose est exactement la famille de défauts
que cette vague rattrape.

Nuance retenue, et testée : un import de **tâches seules** retrouve son jalon **en
base** par `milestoneName`, il n'en crée jamais. Un jalon inconnu laisse la tâche sans
jalon plutôt que d'en inventer un — sinon deux chemins d'import poseraient des jalons
différemment.

Cinq tests, dont le rejeu d'un fichier de jalons (`RG-IMP-04` : ignorés, pas
dupliqués) et la cellule obligatoire vide distinguée de la colonne absente. Le retrait
des deux routes fait rougir le test de sens inverse — vérifié.

---

## L-48 — La fiche tâche affichait sans permettre d'ajouter

| Route | Ce qu'elle débloque |
| --- | --- |
| `POST /documents` | `EX-DOC-01`. La zone de dépôt était **un paragraphe** : ni champ de fichier, ni gestionnaire. On téléchargeait sans pouvoir déposer, et la moitié d'`EX-TSK-17` — « commenter **et** joindre » — n'était pas servie. |
| `PATCH` et `DELETE /documents/commentaires/:id` | `EX-DOC-04`, `RG-DOC-01`. On commentait **sans pouvoir se corriger ni se rétracter**. La maquette 17 pose les deux commandes dans `.cmt-acts`, révélées au survol et seulement pour l'auteur. |

### Décisions

- **La zone de dépôt est un `<label>` qui enveloppe un `<input type="file">`**, et non un `<div>` avec un `onClick`. Le curseur et le focus clavier viennent du champ ; un div cliquable aurait été inatteignable au clavier, et `axe` ne l'aurait pas vu. Le champ est masqué par `position: absolute` et `opacity: 0`, **jamais** par `display: none` — qui le retirerait de l'ordre de tabulation.
- **Le contenu part en base64**, ce que la route exige : cela lui permet de rester une route JSON comme les autres, sans multipart.
- `RG-GEN-06` — sans `documents:create`, la zone **disparaît** au lieu de proposer un geste refusé. Testé.

### Non fait, et pourquoi

`POST /tiers/taches/:taskId/assigner` (`EX-TRS-02`, `RG-TRS-04`) **reste dans
`SANS_CLIENT`**. La brancher demande une liste de tiers rattachés au projet parent —
`RG-TRS-04` : « un tiers ne peut être assigné que s'il est rattaché à la tâche ou à son
projet parent » — et **aucune route ne l'expose**. C'est le même manque que celui que
L-45 a comblé pour les dépendances : le geste unitaire existe, la liste de candidats
non. J'ai retiré le code client que j'avais préparé plutôt que de laisser une fonction
morte ; la route reste déclarée « à brancher », ce qui est vrai.

---

## Vague 7-4 — Traçabilité, domaines libres

**Dette 115 → 62.** Couverture 241/362 → **296/364 (81 %)**.

### Trois citations fausses, et une quatrième trouvée en chemin

`RG-ADM-09` → `EX-ADM-09`, `EX-CLI-02` → `EX-TRS-04` (aucun domaine `CLI` n'existe),
`RG-ACT-08` → `EX-ACT-04`. Plus une quatrième, que l'agent a trouvée seul :
`suivi.int.test.ts` citait `EX-USR-07` (« réinitialiser le mot de passe ») sur **huit
contrôles de la fiche de suivi individuel**, qui est `EX-USR-10`. **La citation comptait
double** : elle déclarait couvert ce que rien n'exerçait, et laissait en dette ce que
ces huit contrôles prouvaient.

### La décision de l'agent, retenue

Un identifiant dont **le test existe mais dont le code manque** : dette ou couverture ?
Il a retenu la lettre de `CLAUDE.md` — couverture — mais avec trois garde-fous : un
contrôle en `it.fails()`, « DÉFAUT CONSIGNÉ » dans le titre, et un commentaire nommant
le correctif. **Le jour où quelqu'un corrige, le contrôle passe au rouge et force la
reprise du marqueur.**

Ce mécanisme a fonctionné **dans la même journée** : son `it.fails` sur `RG-TMP-04` est
passé au rouge à la fusion, parce que le correctif était arrivé entre-temps. Repris en
test ordinaire. Idem pour `EX-PRJ-08`, dont le défaut — **deux `aria-current="page"`
dans la même barre d'onglets**, un lecteur d'écran annonçant deux « page courante » — a
été corrigé plutôt que porté : `activeProps` neutralise la classe du routeur, pas son
`aria-current`, et `/projets/$id` reste active par préfixe sur `/projets/$id/jalons`.
`axe` ne le voit pas ; seul un contrôle qui **compte** l'attribut l'attrape.

### Douze défauts trouvés, non corrigés, consignés

Les plus lourds, tous dans `design/tracabilite.json` avec un champ `defaut` :

- **`RG-PRJ-11`** — « bloqué si des données rattachées l'empêchent » : le code d'erreur
  `remplacement_impossible` existe, complet, avec son message rédigé, et **n'est jamais
  levé**. Selon la forme de la saisie de temps, l'import échoue sur une **erreur
  PostgreSQL brute 23514** (l'utilisateur reçoit un code de contrainte, contre
  `RG-GEN-03`) ou **détache les heures en silence**. Deux chemins mènent au même
  effacement, un seul le refuse.
- **`EX-JAL-07`** — les épopées n'existent qu'en base : modèle, colonne et compteur,
  mais **aucun service, aucun contrôleur, aucune route**. Le compteur de la fiche projet
  ne peut jamais dépasser zéro.
- **`EX-PRJ-04`** — la bibliothèque d'icônes est définie (11 catégories, 50 icônes,
  tracés compris) et **employée nulle part hors de son fichier de définition**.
- **`EX-ORG-03`, `EX-JAL-01`** — le verbe du milieu, encore : pas de suppression de
  service, pas de modification de jalon. Quatrième et cinquième occurrences de la
  famille.
- **`EX-PRJ-13`** — aucun point d'entrée pour l'historique des instantanés.
- **`EX-ORG-05`** — le filtre par département laisse le bloc « départements sans
  direction » entièrement non filtré.
- **`Milestone.statut` est une colonne morte** — écrite par personne, lue par personne,
  recalculée à chaque lecture. Sans conséquence aujourd'hui, mais c'est le décor exact
  du piège « deux lectures d'une même donnée peuvent se contredire ».

### Ce qu'il a refusé de faire, et qui compte

- **Ne citer un identifiant que si TOUS ses verbes tiennent.** `EX-JAL-01` et
  `EX-CMP-09` restent en dette alors qu'il aurait pu les déclarer couverts sur leur
  moitié verte.
- **Ne pas écrire de test de course sur `RG-NTF-02`** : « il serait intermittent dans
  les deux sens, donc pire que pas de test ». Il a prouvé le verrou d'instance unique et
  laissé le versant concurrent ouvert, en proposant la vraie parade — **une contrainte
  d'unicité en base** sur `(userId, type, lien, jour)`.
- **Ne pas toucher à `nonTestable`** : toujours six entrées.

---

## RG-GEN-02 — le piège était écrit, le test ne l'était pas

`RG-GEN-02` était rangée en `nonTestable` comme **quantificateur universel** — et à
juste titre pour sa lettre : un test nommé prouverait le retour d'**une** action, pas
la règle. Mais l'agent de L-41 avait aussi nommé ce qui **est** testable derrière :
l'invariant structurel, c'est-à-dire que le fournisseur de messages est monté.

Et c'est précisément le contrôle qui manquait. `CLAUDE.md` consigne le piège depuis des
mois : « un fournisseur React non monté ne casse rien — il se tait. `FournisseurMessages`
est resté **six lots** hors de l'arbre : `useMessages` ne lève pas hors contexte, donc
aucune confirmation d'action ne s'affichait, et aucune boucle ne s'en apercevait. **Tout
composant à défaillance silencieuse veut un test qui affirme sa présence.** »

Le piège était écrit ; le test qu'il réclame n'existait pas. C'est la même forme que le
commentaire de `renommer` qui décrivait le trou qu'il ne bouchait pas — **savoir n'est
pas tenir**.

Deux contrôles, vérifiés rouges en démontant le fournisseur : les deux régions
d'annonce (`polite` pour ce qui attend, `assertive` pour ce qui n'attend pas), et leur
présence **sur les vues d'accès aussi** — la page de connexion vit hors de la coquille,
et un test sur la seule page d'accueil aurait laissé les cinq vues d'accès sans retour
d'action.

`RG-GEN-02` sort de `nonTestable` : cinq entrées restantes, toutes motivées.

---

## RG-GEN-05 — le second quantificateur, tenu par un dispositif

`RG-GEN-05` — « **toute** vue de données dispose d'un état de chargement explicite » —
était en `nonTestable` pour la même raison que `RG-GEN-02` : un test nommé prouverait
le chargement d'**une** vue, pas la règle.

L'agent de L-41 avait nommé le remède sans l'écrire : « automatable seulement comme
**suite balayante**, sur le modèle de `maquettes.a11y.spec.ts` qui affirme couvrir les
35 vues — et sous la contrainte du piège “un contrôle sans fichier de contrôle passe au
vert” : la suite doit **affirmer son inventaire**. Ce n'est pas un test, c'est un
dispositif. » `apps/web/e2e/chargement.e2e.spec.ts` est ce dispositif.

**Le montage est générique, et c'est ce qui le rend honnête.** Toute réponse d'API est
retenue indéfiniment, sauf la session — sans elle la coquille ne rend rien. Il ne
connaît **aucune fixture** : rien ne peut le faire passer par accident. La session porte
toutes les permissions de lecture, sinon une vue masquée par courtoisie (`RG-GEN-06`)
ne montrerait pas son chargement et le balayage conclurait à tort.

**Les 29 vues de données annoncent leur chargement**, du premier coup. Six sont exclues,
chacune avec sa raison écrite — les cinq vues d'accès, qui sont des formulaires purs, et
la vue 35, dont tout vient de la session déjà chargée. Le contrôle refuse une exclusion
dont la raison fait moins de vingt caractères : il a d'ailleurs commencé par refuser la
mienne.

L'inventaire est **dérivé** de `design/routes.json`, jamais tenu à la main — c'est la
correction qu'avait déjà reçue la suite d'accessibilité après L-25, pour le même motif.
Amputer l'inventaire fait rougir le contrôle : vérifié.

`nonTestable` tombe de six à **quatre** entrées : `RG-ORG-05` (doctrine à co-citer),
`RG-USR-07` (moitié non mesurable), `RG-TSK-13` (restatement de `RG-SCOPE-04`),
`RG-PRM-05` (écart de spécification à trancher).
## L-46 — Trois capacités de congés qu'aucun écran n'atteignait, et un bug actif

### Le bug actif : deux boutons qui ne pouvaient pas fonctionner

`GET /conges?aValider=true` filtre sur `statut: { in: ["pending",
"cancellation_requested"] }`. `LigneDemande` (branche `avecValidation`) posait
« Approuver » et « Refuser » **inconditionnellement** sur ce que la route rend :
sur une demande d'annulation, les deux appelaient `POST /conges/:id/approuver`,
que `RG-CNG-02` refuse en `statut_incompatible`. Le validateur voyait donc deux
commandes mortes, et rien ne le disait avant le clic — ce que `RG-GEN-06`
interdit exactement.

Rien ne pouvait le voir : le jeu d'essai de bout en bout ne portait **aucune**
demande au statut `cancellation_requested`, donc la branche n'avait rien à quoi
se heurter. C'est le même motif que le couple client/fixture des vues 14 et 27 —
un jeu d'essai qui ne contient pas le cas ne peut pas révéler le défaut qui le
concerne. Le jeu en porte désormais une (`DEMANDE_ANNULATION`).

### Décisions tranchées

| # | Décision | Motivation |
| --- | --- | --- |
| 1 | Les deux commandes d'une annulation s'appellent **« Accepter l'annulation »** et **« Refuser l'annulation »**. | Ni `cadrage/02` ni la maquette ne fournissent ces libellés : la maquette ne rend l'onglet « À valider » que pour `pending`, et le brief n'énumère que « Approuver · Refuser ». Le vocabulaire retenu est celui du **cycle de vie** que le brief dessine — « accepter ─▶ Annulé », « refuser ─▶ Approuvé ». « Refuser » tout court aurait laissé croire que c'est le congé qui tombe, alors que `RG-CNG-01` le **rend à l'état approuvé** ; le message de retour le dit en toutes lettres. |
| 2 | Une ligne d'annulation, sur l'onglet « À valider », **dit son statut** sur sa ligne secondaire. | Cet onglet n'a pas de colonne de statut (quatre colonnes : demandeur, demande, jours, décision). Sans cette mention, le seul indice qu'une ligne est une annulation serait le libellé de ses boutons — c'est-à-dire qu'il faudrait déchiffrer l'action pour comprendre l'objet. |
| 3 | Le bouton de retrait d'un type reste **« Désactiver »** dans tous les cas, la confirmation portant la vérité de ce qui va se produire. | C'est le vocabulaire de la maquette (`ms-toggle`), et `DELETE /conges/types/:id` ne dit pas d'avance laquelle des deux issues il prendra — le compte d'utilisations affiché peut avoir vieilli. La fenêtre de confirmation, elle, annonce la suppression ou la désactivation **avec son chiffre**, et le message de retour relit la **réponse du serveur**, jamais la prévision faite à l'écran. |
| 4 | Le nom accessible du bouton porte le type : « Désactiver Congés annuels ». | Sept boutons nommés « Désactiver » dans une liste ne disent pas lequel on désactive, et c'est au clavier que la question se pose. Le libellé visible reste « Désactiver » — le nom accessible le contient, donc `label-in-name` est tenu. |
| 5 | Le décompte du pied de fenêtre prend la place de la mention « champs obligatoires » dès qu'une plage est saisie. | C'est l'emplacement `#r-days` de la maquette, dans le `modal-foot` : le chiffre qu'on relit juste avant de valider est à côté du bouton qui valide. Les astérisques des champs obligatoires restent posés sur les libellés. |
| 6 | Le tag `.cb-tag` (`#cb-state`) continue de dire « À cheval sur deux années » et **ne prononce pas de verdict de solde**. | La maquette y met « Solde suffisant / insuffisant », mais le rendre honnête exigerait le solde de **chaque** année couverte ; la fenêtre n'en tient qu'un, celui de son année. `RG-CNG-21` est tenue au serveur, au dépôt, avec son message chiffré. Un verdict client calculé sur le mauvais solde serait pire que pas de verdict. Le tag est désormais piloté par la répartition **serveur**, plus par une découpe de chaîne. |

### Défauts constatés au serveur, non corrigés (lecture seule)

1. **Aucune route ne réactive un type de congé.** Le contrat de tâche et la
   maquette demandent un bouton « Désactiver » / « Réactiver ». `DELETE
   /conges/types/:id` ne sait que désactiver ou supprimer ; il n'existe ni
   `PATCH /conges/types/:id`, ni `POST /conges/types`. Le référentiel des types
   est donc **en aller simple** : une fois inactif, un type ne revient pas, et
   `cadrage/02` promet pourtant « Actions : Nouveau type, Modifier, Désactiver,
   Réactiver ». Conséquence portée par cette vue : la commande n'est proposée
   que sur un type **actif** (`RG-GEN-06`) — la proposer sur un type inactif
   supprimerait pour de bon un type inutilisé, ce qui est l'inverse du geste
   demandé. **Trois routes manquent au module M10.**

2. **La fenêtre de demande montre le solde de l'année courante pour TOUTES les
   années couvertes.** Défaut antérieur à ce lot, non corrigé ici : `GET
   /conges/soldes?annee=` ne rend qu'une année, et `GET /conges/solde` — la
   route par type et par année — est hors périmètre (autre lot). Une demande à
   cheval du 28/12 au 03/01 affiche donc « Attribués 2027 » avec les chiffres de
   2026. `RG-CNG-19` exige que **chaque année soit contrôlée contre son propre
   solde** : le contrôle est juste au serveur, l'**affichage** ne l'est pas.
   Depuis ce lot, la ligne « Cette demande » de chaque année porte au moins le
   bon nombre de jours ouvrés, celui du serveur. À reprendre avec les soldes.

3. **`traiterAnnulation` n'exige aucune version** (`RG-GEN-07`). Deux
   validateurs sur la même demande d'annulation : le second écrase la décision
   du premier sans que rien ne le signale. Même profil que `PUT
   /taches/:id/assignes`, relevé en L-45.

### Ce que le décompte serveur remplace

`FenetreDemande` déduisait les années d'une découpe de chaîne —
`Number(dateDebut.slice(0, 4))` — et n'annonçait **aucun** nombre de jours. Elle
ne pouvait voir ni les week-ends, ni les jours fériés, ni les jours chômés du
paramétrage, ni les demi-journées : trois des quatre termes de `RG-CNG-16` et
`RG-CNG-17`. `GET /parametrage/jours-ouvres` les porte tous, et c'est **le même
calcul** que celui qui décidera du dépôt (`CalendrierService.repartitionParAnnee`).
Deux calculs auraient divergé, et c'est l'écran qui aurait eu tort au moment le
plus coûteux : après coup, sur un refus.

---

## EX-EVT-08 — le cloisonnement des participants

L-42 avait signalé, sans le corriger, que **les routes de participants n'ont aucun
contrôle de périmètre** — il l'avait corrigé sur `arreterRecurrence`, qui portait le
même défaut. Fermé ici.

Ce que l'absence rendait possible, et c'est le seul cas qui compte : **le prédicat de
visibilité d'un événement est « je suis participant »**. On pouvait donc s'inviter
soi-même à une réunion qu'on n'a pas le droit de voir — et l'y voir ensuite.
L'invitation était le moyen d'obtenir la visibilité qu'on n'avait pas.

Trois tests, deux vérifiés rouges sans le correctif.

**Le câblage client reste à faire, et la raison est écrite dans `SANS_CLIENT`** : le
tiroir de la vue 18 montre un **compte** de participants, pas leur liste, et l'ajout
demande un sélecteur d'agents que la maquette n'a pas dessiné. C'est le même manque que
pour l'assignation de tiers — le geste unitaire existe, ce qu'il faut lui donner à
choisir n'est pas rendu.

Note de cloisonnement, non tranchée : le module lève `hors_perimetre` plutôt
qu'`introuvable`, ce qui **confirme l'existence** de l'événement à qui n'a pas le droit
de le voir. C'est la convention du module, cohérente partout ; la changer est une
décision à part.

---

## RG-CNG-19 — l'écran mentait sur le solde d'une année sur deux

Signalé par l'agent de L-46, qui ne possédait pas le fichier. Corrigé ici.

Le bloc de contrôle de solde **bouclait sur les années couvertes en rendant à chaque
tour le MÊME objet** — celui de l'année en cours. Une demande du 28 décembre au
3 janvier affichait « Année 2027 » avec les chiffres de 2026 : trois lignes sur quatre
fausses, **sous un intitulé qui affirmait le contraire**.

Deux choses rendaient l'erreur difficile à voir. Le **décompte de jours**, lui, était
juste — le serveur le rend par année — donc la moitié du bloc disait vrai. Et l'erreur
penchait **du côté rassurant** : l'année suivante paraissait toujours avoir le solde
plein de l'année courante, jamais l'inverse. Le contrôle serveur (`RG-CNG-21`) n'a
jamais été trompé ; c'est l'écran qui mentait.

Le correctif interroge un solde **par année couverte** (`useQueries`), avec repli sur
l'existant tant que la réponse n'est pas là.

### Un piège rencontré en écrivant le test, et c'est le même que d'habitude

Ma première assertion portait sur le **bloc** (« l'année 2027 contient 25,0 ») et
**passait avec ET sans le correctif** : `25,0` figure déjà comme *attribués* dans les
deux années. Le test ne mesurait rien. Il vise désormais la **ligne** — « Disponible »,
« Déjà utilisés » — et tombe sans le correctif : `Expected "0,0", Received "12,0"`.

*Un test qu'on n'a pas vu échouer ne prouve pas ce qu'on croit.* C'est le critère
d'acceptation de toute cette vague, et il vient de se justifier une fois de plus sur mon
propre travail.

---

## RG-PRJ-11 — le refus existait, rédigé, et n'était jamais levé

Le plus grave des douze défauts consignés par la vague 7-4, et le seul qui **perde des
données**. Fermé ici.

`EchecImport.remplacement_impossible` existait **complet** — code, statut 409, clé
i18n, message rédigé — et n'était levé par **aucune ligne du dépôt**. Ce qui se passait
à la place dépendait de la forme de la saisie de temps :

- rattachée à la **tâche seule** : `task.deleteMany` déclenchait le `ON DELETE SET
  NULL`, la ligne perdait tâche *et* projet, et la contrainte
  `time_entries_rattachement_requis` la refusait. L'import échouait sur une **erreur
  PostgreSQL brute 23514** — un code de contrainte là où `RG-GEN-03` exige un message
  actionnable ;
- rattachée à la tâche **et** au projet : la contrainte restait satisfaite par le
  projet, donc **rien ne bloquait** et les heures étaient **détachées en silence**.
  C'était le cas le plus dangereux : le premier échouait au moins bruyamment.

Deux chemins menaient au même effacement, un seul le refusait, et mal.

### Décisions

1. **Le contrôle est AVANT toute écriture**, comme `RG-IMP-06` l'impose déjà pour les
   erreurs de fichier. Découvrir l'empêchement après la suppression serait exactement
   ce que la règle interdit.
2. **Le message est chiffré et porte une issue** (`RG-GEN-03`). Il disait « des données
   rattachées au projet empêchent le remplacement », ce qui laisse chercher lesquelles ;
   il dit maintenant que du temps a été déclaré, combien, et les deux chemins qui
   restent — importer en mode Ajouter, ou supprimer ces saisies.
3. **Le refus est ciblé** : sans temps déclaré, le remplacement passe. Un refus trop
   large aurait rendu le mode inutilisable, ce qui est une autre façon de ne pas tenir
   la règle. Testé dans les deux sens.

Les deux marqueurs `it.fails` de la vague 7-4 sont repris en tests ordinaires, et
vérifiés rouges sans le correctif.

---

## EX-ORG-03 — le verbe du milieu, quatrième occurrence

Le référentiel des services se créait et se modifiait ; il ne se supprimait pas. Ni
`supprimerService`, ni `DELETE /organisation/services/:id`.

C'est la **quatrième occurrence de la même famille** dans ce dépôt, après `EX-PRJ-05`
(modifier un projet), `EX-USR-04` (modifier un compte) et `EX-EVT-06` (modifier un
événement) — toutes trois trouvées et fermées dans cette même vague. Une exigence qui
énumère « créer, modifier, supprimer » se livre régulièrement sans son verbe du milieu,
et rien ne le signale : les deux autres verbes marchent, la vue paraît complète.

L'impact est rendu **avant** la suppression, comme pour un département : la vue 29
montre le compte de ce qui sera détaché avant de demander confirmation. Un service
supprimé **détache** ses agents, il n'en supprime aucun — testé.

Les deux routes sont déclarées dans `SANS_CLIENT` avec leur raison : la vue 29 porte le
geste pour un département, pas encore pour un service.

**Les trois marqueurs de défaut de la vague 7-4 sont désormais tous repris** : la suite
d'intégration ne porte plus aucun `expected fail`.
## T-051 — Trois verbes du document branchés, deux routes déclarées redondantes

Cinq routes étaient inscrites « à brancher » dans `SANS_CLIENT`. **Trois ont été
branchées, deux ne l'ont pas été** — et le refus est le résultat le plus utile du lot.

### Les trois branchées, vue 17

`GET`, `PATCH` et `DELETE /documents/:id` servent désormais le panneau Documents de la
fiche tâche. `EX-DOC-02` en énumère quatre verbes ; seul « télécharger » était servi.

**Le nom du document est la commande de consultation.** La rangée `.doc` a quatre
colonnes ; ajouter un bouton « Consulter » en aurait fait une cinquième alors que
l'objet à ouvrir est précisément celui qu'on nomme.

### La décision qui a demandé un arbitrage : pourquoi une fenêtre, pas un « × »

La maquette 17 pose un `×` (`.sub-del`) sur chaque rangée de document. Il n'a pas été
repris tel quel, pour une raison de règle et non de goût.

`RG-DOC-01` — « un utilisateur modifie et supprime ses propres contributions ; agir sur
celles d'autrui exige une permission dédiée. » Le motif est appliqué aux commentaires
depuis L-48 : `c.auteur.id === session.id` décide de l'affichage de `.cmt-acts`.
**Ce motif est intransposable aux documents en l'état** : `GET /taches/:id` rend
`documents[].auteur` comme `{ prenom, nom }`, **sans identifiant**. À l'affichage de la
liste, aucun écran ne peut donc savoir de qui est une pièce jointe.

`GET /documents/:id` le donne — et c'est de toute façon le verbe « consulter » de
`EX-DOC-02`, tracé distinctement du téléchargement par `RG-DOC-02`. L'ordre retenu est
donc celui de la règle : **on consulte, ce qui laisse une trace, et c'est la
consultation qui dit ce qu'on a le droit de faire ensuite.** Renommage et suppression
vivent dans cette fenêtre.

Corollaire mesuré, et testé : la consultation **ne part pas au chargement de la fiche**.
Tracer une lecture que personne n'a demandée, sur chaque document, à chaque affichage,
remplirait le journal d'audit de faux. Le contrôle `EX-DOC-02 — consulter` affirme zéro
appel avant le clic ; il passe au rouge si un préchargement est introduit.

### `GET /documents/commentaires/fil` — redondante, laissée dans `SANS_CLIENT`

Le contrat demandait de l'évaluer avant de la brancher. Elle l'est.

`GET /taches/:id` embarque déjà le fil de la tâche, **auteur et identifiant compris** —
c'est ce que `Commentaires` lit pour appliquer `RG-DOC-01`. La route sert aussi le fil
d'un **projet**, mais aucun brief de vue projet (11 à 15) ne prévoit de fil de projet :
le seul écran du produit qui affiche des commentaires est la fiche tâche. La brancher
aurait ajouté un second chemin vers une donnée déjà servie, au prix d'un aller-retour
réseau par ouverture de fiche.

Elle passe donc de la section 3 (« à brancher ») à la section 2 (« redondantes ») de
`SANS_CLIENT`, avec sa raison écrite — même traitement que les trois de la vague 4 bis.

### `POST /taches/:id/deplacer` — redondante ET inadaptée au kanban

Le contrat l'attribuait au « kanban de la vue 12 » au titre de `EX-TSK-02` et
`RG-TSK-11`. **La lecture du code contredit les deux.**

1. Elle appelle `TachesService.deplacerDepuisPlanning`, **le même service** que
   `PATCH /planning/taches/deplacer`, que `apps/web/src/api/planning.ts` appelle déjà
   depuis L-46. Deux routes, un comportement, à la place du `taskId` près.
2. Elle déplace une **date** ou un **assigné**. Elle ne touche jamais au statut. Or les
   colonnes du kanban **sont** des statuts — brief de la vue 12 : « À faire · En cours ·
   En revue · Terminé · Bloqué », et « Déplacement réussi : *Statut mis à jour* ». Le
   kanban écrit donc par `PATCH /taches/:id`, ce qu'il fait depuis L-33.

La brancher au kanban aurait été un doublon **et** un changement de sémantique. Elle
reste dans `SANS_CLIENT`, reclassée « redondante ».

`RG-TSK-11` est déjà couverte trois fois côté planning (`taches.int.test.ts`,
`planning.int.test.ts`, `planning.e2e.spec.ts`). Le lot y ajoute **l'assertion
inverse** : au kanban, une tâche multi-assignée change de statut sans restriction. La
règle dit « dans le planning… sa **date** » ; étendre le verrou au statut aurait rendu
indéplaçable toute tâche à deux assignés, et rien ne l'aurait vu.

### Deux défauts serveur constatés, non corrigés — le serveur était en lecture seule

| Défaut | Où | Conséquence |
| --- | --- | --- |
| `PATCH /documents/:id` **n'applique pas `RG-DOC-01`.** `DocumentsService.supprimer` confronte `auteurId` à l'acteur et exige `documents:manage_any` à défaut ; `renommer` ne fait aucun de ces deux contrôles. Quiconque détient `documents:update` peut renommer la pièce d'autrui. | `apps/api/src/documents/documents.service.ts`, `renommer` | Le client masque par courtoisie ; **le serveur ne refuserait pas.** C'est exactement la configuration que `CLAUDE.md` nomme « ne jamais contrôler un droit côté client seul ». À corriger dans une tâche serveur. |
| `PATCH /documents/:id` **n'accepte pas de version** et incrémente la sienne sans la confronter à celle qu'on a lue. | même fichier, `renommer` — et le contrôleur, dont le schéma ne porte que `nom` | Écart à `RG-GEN-07` : deux renommages concurrents, le dernier gagne, en silence. `Document.version` existe pourtant au schéma. |

Ni l'un ni l'autre n'est testable côté client : ce sont des refus qui doivent naître au
serveur. Ils ne sont donc **pas** inscrits en dette de traçabilité — `RG-DOC-01` et
`RG-GEN-07` sont cités par des tests ailleurs —, mais ils sont deux tâches à ouvrir.

### Écriture au cadrage

Aucune. Les briefs des vues 12 et 17 décrivent ce qui a été porté ; la seule tension
relevée — le `×` de la maquette 17 contre `RG-DOC-01` — se résout au profit de la règle
sans qu'aucun texte de `cadrage/02` ait à changer, la maquette n'étant plus opposable
depuis le dégel du 2026-08-31.

---

## RG-DOC-01 sur le renommage — la moitié qui manquait

Trouvé par l'agent de T-051 **en lisant les deux méthodes l'une après l'autre**, pendant
qu'il branchait la vue : `supprimer` appliquait `RG-DOC-01`, `renommer` ne l'appliquait
pas. Quiconque détenait `documents:update` renommait la pièce d'autrui — et comme le
client venait précisément de se mettre à masquer les commandes par courtoisie, on
tombait dans la configuration exacte de l'interdit du dépôt : **« ne jamais contrôler un
droit côté client seul »**.

La règle est écrite au singulier — « un utilisateur modifie **et** supprime ses propres
contributions » — et une seule de ses deux moitiés était tenue. C'est la même forme que
`EX-PRJ-07` (annulation logique **puis** suppression) et que `EX-AUTH-09` (consulter
**et** modifier) : *une exigence à deux verbes se livre régulièrement avec un seul, et
le verbe présent fait croire l'autre présent.*

`RG-GEN-07` manquait de même : `version` était **incrémentée sans jamais être
confrontée**, c'est-à-dire un « dernier arrivé gagne » muni d'un compteur.

### Décision

`version` est **facultative** sur `PATCH /documents/:id`. Le client de cette vague ne la
porte pas encore, et l'exiger d'emblée casserait le renommage à l'instant même où on
vient de le brancher. Quand elle est fournie, elle est confrontée. Son passage à
obligatoire est une tâche de vue, ouverte ici.

Trois tests, deux vérifiés rouges sans le correctif.

---

## EX-TRS-02 — le dernier « geste sans liste de candidats »

`POST /tiers/taches/:taskId/assigner` existait depuis L-12 et **rien ne l'appelait**. La
fiche tâche affichait les tiers assignés sans jamais offrir d'en assigner un, et la
maquette 24 portait le bouton sur le panneau **voisin** — « Projets rattachés » — et pas
sur celui-ci. *L'asymétrie était la trace du geste manquant.*

La cause est la même que pour les dépendances de tâche, comblée par L-45 : **le geste
unitaire existait, ce qu'il faut lui donner à choisir n'était rendu nulle part.** Un
geste sans liste de candidats n'est pas un geste — c'est la troisième fois que ce dépôt
paie ce motif, après les dépendances et les assignés.

`GET /tiers/taches/:taskId/candidats` applique **en amont** les trois refus que
l'écriture applique en aval : archivé (`RG-TRS-02`), non rattaché au projet parent
(`RG-TRS-04`), déjà assigné (`RG-TRS-03`). Sans cela l'écran proposerait ce que le
serveur refuse.

**Une nuance testée, et qui aurait divergé sans elle** : hors projet, `RG-TRS-04` n'a
pas de prise — « rattaché à la tâche ou à son **projet parent** » n'a rien à interroger.
`assignerALaTache` laisse alors passer, et la liste dit la même chose. Deux lectures
divergentes de la même règle rendraient l'écran incohérent avec son propre serveur, ce
qui est précisément le défaut que cette vague rattrape.

Sept tests, dont trois d'intégration sur les refus et un sur le cas hors projet.
## T-053 — Vues 22, 06 et 11 : quatre routes qu'aucun écran ne visait

Quatre capacités serveur vivaient dans `SANS_CLIENT` : gardées, testées en intégration,
et hors d'atteinte depuis un écran. Elles en sortent toutes les quatre. Ce que le
branchement a appris compte davantage que le branchement.

### Ce que les routes promettaient, et ce qu'elles rendent

**`GET /competences/export` ne sert pas un fichier.** Malgré son nom et sa permission
`skills:export`, elle rend un JSON `{ csv }` : ni `Content-Type: text/csv`, ni
`Content-Disposition`, contrairement aux trois exports d'`ImportsController` juste à
côté. Le lien `<a href download>` que le contrat de tâche proposait comme modèle aurait
téléchargé `{"csv":"Agent;Cartographie SIG;…"}` — un fichier qu'aucun tableur n'ouvre.
La vue la demande donc en `fetch` et fabrique le téléchargement.

**`POST /projets/:id/instantane` rend `heuresConsommees` en CHAÎNE.** La colonne est un
`Decimal`, et un `Decimal` Prisma porte un `toJSON` qui rend du texte — comme
`budgetHeures` de la fiche projet, que le client typait déjà correctement. Le type
client le dit ; le jeu d'essai aussi.

**`GET /competences/:id/detenteurs` ne rend ni identifiant de ligne, ni nom de
compétence, ni total** — la clé de `user_skills` est composite et le service renvoie les
lignes telles quelles. Et son `niveauMinimum` est un **plancher** : demander « Expert »
rend les experts *et* les maîtres. Un libellé « Niveau : Expert » aurait décrit une
réponse que la route ne rend pas ; la fenêtre écrit « Au moins Expert ».

### Le défaut le plus lourd : `GET /competences/:id/detenteurs` n'a AUCUN périmètre

`CompetencesController.detenteurs` ne prend pas `@Demande()`, et
`CompetencesService.detenteurs` ne pose pas `filtreParAgent`. Elle est pourtant gardée
par `skills:read` — qui est **dans `SOCLE`**, donc détenue par tous les rôles du
catalogue. N'importe quel compte authentifié peut ainsi énumérer, compétence par
compétence, l'identité (`id`, `prenom`, `nom`) et le niveau de **tous les agents actifs
de l'organisation**, département d'appartenance ignoré.

Ce n'est pas une omission isolée : ses deux voisines immédiates du même service,
`matrice()` et `exporterMatrice()`, reçoivent et appliquent le périmètre. La route est
la seule des trois à ne pas le faire, et c'est la seule qui rend des **noms** sans
agrégation.

Le correctif tient en deux lignes, et il est **serveur** — donc hors de ce lot :

```ts
// competences.controller.ts
detenteurs(@Demande() d: ContexteDemande, @Param("id") id: string, …) {
  return this.competences.detenteurs(d.perimetre, id, minimum);
}
// competences.service.ts — la table porte un `userId`, donc `filtreParAgent`.
where: { AND: [this.perimetres.filtreParAgent(perimetre), { skillId, niveau: { in: acceptes }, user: { actif: true } }] }
```

**L'écran a été branché malgré tout**, la commande gardée sur `skills:read` comme la
route — `RG-GEN-06` demande au client de refléter le serveur, pas de le durcir, et
durcir le client n'aurait rien fermé : la requête forgée passe de toute façon. Le durcir
aurait seulement caché la fuite à la revue.

### « Détenteurs » veut dire trois choses différentes au serveur

Troisième occurrence du piège « deux lectures d'une même donnée peuvent se contredire ».
Pour une même compétence :

| Méthode | Ce qu'elle compte | Périmètre | Comptes désactivés |
| --- | --- | --- | --- |
| `referentiel()` | toutes les lignes de `user_skills` | non | **inclus** |
| `detenteurs()` | les lignes des comptes actifs | **non** | exclus |
| `matrice()` | les niveaux des agents du périmètre | oui | exclus |

Les trois sont justes séparément et donnent trois nombres. La fenêtre des détenteurs ne
réaffiche donc **aucun ratio** : recopier le « Partielle 1/3 » du référentiel au-dessus
d'une liste de trois noms aurait mis une contradiction à l'écran sans qu'aucune moitié
soit fausse. La couverture est dite là où elle est calculée. Un contrôle fige ce choix,
pour qu'une bonne intention ne le défasse pas.

### Le bouton « Export CSV » de la vue 22 exportait le référentiel

`EX-CMP-08` dit « Exporter **la matrice** en CSV ». Le bouton, posé par la maquette dans
la barre de filtres **de la matrice**, pointait `/imports/export/competences` — le
catalogue des compétences, sans un seul agent. Les deux exports existent et n'exportent
pas la même chose ; ils portent désormais deux noms distincts, « Export CSV » (la
matrice, avec l'état de retour que le brief nomme mot pour mot) et « Exporter le
référentiel » (le catalogue, contrepartie réimportable d'`EX-CMP-09`).

Aucun contrôle ne pouvait le voir : le bouton s'affichait, le lien répondait 200, et un
CSV arrivait. C'est la famille des défauts qui survivent aux boucles vertes — non pas
« ça ne marche pas », mais « ça marche, et ce n'est pas ce qui était demandé ».

### `EX-USR-09` et `EX-PRJ-13` n'ont aucun brief

Ni la vue 06, ni la vue 27, ni la vue 11 ne portent ces exigences dans `cadrage/02`, et
aucune des trois maquettes n'a de bloc, de classe ou de bouton correspondant. Deux
décisions ont donc été prises à l'exécution — donc deux manques de spec.

**`EX-USR-09` va sur la vue 06.** Trois raisons. *(1)* « du jour » : la vue 06 est la
seule dont l'axe est aujourd'hui — son brief l'écrit, « ce qui concerne l'utilisateur
aujourd'hui », et son surtitre porte la date ; la vue 27 administre des comptes, où la
notion de journée n'existe nulle part. *(2)* Le destinataire : `cadrage/01 § 2` donne le
besoin à Fatou, manager de service — « voir le taux de présence » —, qui détient
`users:read` par `ENCADREMENT`. *(3)* La contrainte du brief tient : « pour Camille, la
vue doit être complète en un écran, sans défilement », et Camille, contributrice, n'a
pas `users:read` — le bloc n'apparaît pas pour elle. Il apparaît exactement pour qui l'a
demandé.

**Le bloc n'est pas fondu dans `/tableau-de-bord`**, contrairement à tout le reste de la
vue : la charge unique devrait alors rendre un champ vide pour la majorité des comptes,
ou changer de forme selon l'appelant. Le serveur étant en lecture seule sur ce lot, la
question reste ouverte pour le jour où `/tableau-de-bord` pourra apprendre à la servir.

**La vue 27 reste le bon hôte d'un annuaire de présence complet et filtrable.** Le bloc
de la vue 06 répond à « qui est là ce matin », pas à « donne-moi la liste ».

### Le piège du lot, payé d'avance

`GET /utilisateurs/presence` accepte `jour` en option et retombe sinon sur `new Date()`
— un instant, avec son heure. Or elle compare cet instant à `telework.date` par
**égalité stricte** et à `leave.dateFin` par `>=`, deux colonnes `date` stockées à
minuit. **Appelée sans `jour`, elle ne trouve jamais personne en télétravail et manque
tout congé qui s'achève aujourd'hui** : elle répond « tout le monde est présent », à
toute heure sauf minuit pile. Le test d'intégration existant ne pouvait pas le voir — il
appelle le service avec un `Date` à minuit, jamais le contrôleur sans paramètre.

Le client transmet donc toujours la date nue `AAAA-MM-JJ`, et un contrôle nommé le
vérifie sur la requête sortante, horloge figée. Le serveur, lui, garde son défaut : sa
valeur par défaut devrait être normalisée à minuit.

### Ce qui reste ouvert

- **`EX-PRJ-13` reste en dette, et son `defaut` est mis à jour.** La capture est
  branchée et couverte ; **consulter l'historique** n'a toujours ni méthode de service
  ni route — `fiche()` ne rend que `dernierInstantane`. L'identifiant n'est cité par
  aucun titre de test : on ne cite pas une exigence dont un verbe manque, comme la
  vague 7-4 l'avait décidé pour `EX-JAL-01` et `EX-CMP-09`. À ajouter, tâche serveur :
  `GET /projets/:id/instantanes`, gardée `reports:read`, bornée au périmètre.
- **`RG-PRJ-09` — la capture périodique n'existe pas.** La règle veut un relevé
  périodique, `cadrage/03 § 5.4` le confie à `pg-boss`, et aucun travail de fond ne
  l'exécute. Le bouton de la vue 11 est aujourd'hui **le seul producteur d'instantanés
  du produit** : sans lui, `dernierInstantane` et la courbe de tendance de la vue 30
  restent vides à jamais. La règle est pourtant déclarée couverte par un test
  d'intégration qui exerce la capture, pas sa périodicité.
- **`POST /projets/:id/instantane` est une écriture gardée par une permission de
  lecture** (`reports:read`) et **ne trace rien au journal d'audit**, là où
  `supprimerJalon`, son voisin immédiat, appelle `audit.tracer`. À arbitrer :
  `01 § M20` ne liste pas la capture d'instantané, mais une écriture sur `reports:read`
  mérite au moins un commentaire qui l'assume.
- **Trois commentaires d'exigence faux dans le serveur**, trouvés en chemin et non
  corrigés (serveur en lecture seule) : `competences.controller.ts` annonce `EX-CMP-05`
  sur `detenteurs` (c'est `EX-CMP-10` ; `EX-CMP-05` est « modifier un niveau depuis une
  cellule ») ; `utilisateurs.controller.ts` annonce `EX-USR-06` sur `presence` (c'est
  `EX-USR-09`) et `EX-USR-07` sur `suivi` (c'est `EX-USR-10` — la même faute que la
  vague 7-4 avait déjà corrigée dans `suivi.int.test.ts`, restée dans le contrôleur) ;
  `projets.controller.ts` annonce `EX-PRJ-14`, qui n'existe pas au cadrage. Quatre
  citations fausses, dont aucune n'est vue par `tracabilite-check.mjs` : il ne lit que
  les **titres de test**, jamais les commentaires du code de production.
- **Les contrôles de la capture d'instantané décrivent la vue 11 et vivent dans
  `tableau.e2e.spec.ts`.** `projets.e2e.spec.ts` était travaillé par un autre lot au
  même moment, et deux lots dans le même fichier se perdent l'un l'autre. À la fusion,
  ce bloc et ses deux jeux d'essai (`SESSION_INSTANTANE`, `INSTANTANE_PRIS`) rejoignent
  `projets.e2e.spec.ts` et `fixtures/projets.ts`.
- **`/imports/export/competences` ne serait plus détectable comme orpheline** si un jour
  la vue 22 cessait de l'appeler : `surface-http.test.ts` compte un littéral `/api/…`
  trouvé n'importe où dans `apps/web/src`, et la constante `adresseExportCompetences`
  vit dans `api/imports.ts` indépendamment de son usage. Le contrôle mesure la présence
  d'une chaîne, pas celle d'un appel.

---

## RG-SCOPE-01 sur les détenteurs d'une compétence — une fuite d'annuaire

Trouvé par l'agent de T-053 **en comparant les trois méthodes du même service l'une à
l'autre**, pendant qu'il branchait la vue 22.

`GET /competences/:id/detenteurs` n'appliquait **aucun périmètre** : ni `@Demande()` au
contrôleur, ni filtre au service — il ne le recevait même pas en argument. Or
`skills:read` appartient au **socle**, donc à tout compte authentifié : la route
énumérait `id`, prénom, nom et niveau de **tous les agents actifs de l'instance**,
département ignoré.

Ses deux voisines immédiates du même fichier, `matrice()` et `exporterMatrice()`,
l'appliquent toutes les deux. **C'est cet écart entre voisines qui l'a rendu visible** —
pas une boucle, pas un test : une lecture comparée.

L'agent a branché la vue **quand même**, en la gardant sur `skills:read` comme la route,
et l'a signalé plutôt que de durcir le client : « durcir le client aurait caché la fuite
sans la fermer ». C'est le bon réflexe, et c'est l'interdit du dépôt appliqué à
l'envers — un client plus strict que son serveur donne l'illusion d'un contrôle.

Deux tests, dont un vérifié rouge sans le filtre.

### Ce que le même agent a trouvé et qui reste ouvert

- **`POST /projets/:id/instantane` est une ÉCRITURE gardée par `reports:read`**, et elle
  ne trace rien au journal d'audit.
- **`RG-PRJ-09` n'est pas tenue** : aucun travail planifié ne capture d'instantané
  périodiquement. Ce bouton est aujourd'hui le **seul producteur d'instantanés du
  produit**.
- **`GET /competences/export` ne sert pas un fichier** mais un JSON `{ csv }`, sans
  `Content-Type` ni `Content-Disposition`, contrairement aux trois exports voisins
  d'`ImportsController`. Un `<a download>` aurait téléchargé `{"csv":"…"}`.
- **« Détenteurs » désigne trois nombres différents** selon la méthode qui le calcule :
  `referentiel()` compte tout, désactivés inclus et sans périmètre ; `detenteurs()`
  exclut les désactivés ; `matrice()` applique le périmètre. Décor exact du piège « deux
  lectures d'une même donnée peuvent se contredire ».
- **Quatre citations d'exigence fausses dans des commentaires serveur**, qu'aucun
  contrôle ne voit puisque `tracabilite-check.mjs` ne lit que les titres de test.
