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

## T-052 — Vues 31 et 32 : quatre routes branchées, deux jugées redondantes

Six routes serveur étaient dans `SANS_CLIENT` avec la raison « à brancher ». Quatre le
sont désormais, deux ne le seront pas.

| Route | Verdict |
| --- | --- |
| `POST /administration/roles` | branchée — `EX-ADM-02`, la fenêtre de création de la vue 32, modèle compris |
| `PATCH /administration/roles/:id` | branchée — `EX-ADM-03`, le renommage, refusé sur un rôle système |
| `POST /parametrage/feries` | branchée — `M19 § Jours fériés`, « Créer […] un jour » |
| `POST /parametrage/vacances` | branchée — `M19 § Vacances scolaires`, « Créer […] une période » |
| `GET /parametrage/trame` | **redondante**, laissée dans `SANS_CLIENT` |
| `GET /parametrage/feries/statistiques` | **redondante ET fausse**, laissée dans `SANS_CLIENT` |

### `GET /parametrage/trame` — la brancher contredirait `RG-PLN-01`

`planning.service.ts` appelle `calendrier.trameDeFond` dans **les deux** agrégats,
`agreger` et `grilleActivite` : `GET /planning` et `GET /planning/activite` embarquent
donc déjà la trame. Et ce n'est pas un hasard d'implémentation — c'est `RG-PLN-01`,
écrite en toutes lettres dans le service : « les demander séparément ferait apparaître
les fériés après coup, sur une grille déjà lue, et un jour férié découvert en second
est un jour qu'on a déjà compté comme ouvré ». La brancher serait rouvrir la porte que
la règle ferme.

Sa seule capacité propre est le filtre `zone`, qu'aucun écran n'offre. Sa reprise se
décidera avec la **zone scolaire de référence** que `cadrage/01 § M19` place dans
l'onglet Planning de la vue 31 et qui n'existe nulle part — ni réglage, ni amorçage.

### `GET /parametrage/feries/statistiques` — les deux comptes divergent

`GET /parametrage/feries` rend déjà un bloc `statistiques` de même forme (total, chômés,
ouvrés, légaux). Les deux calculs ne s'accordent pas :

- `joursFeries(annee)` construit d'abord la liste **projetée et dédoublonnée par date**
  — un récurrent stocké une fois vaut pour toutes les années, une déclaration explicite
  l'emporte sur la projection — puis compte cette liste ;
- `statistiquesFeries(annee)` compte les **lignes stockées** de la requête
  `date ∈ année OR recurrent`.

Dès que deux années sont importées, le 14 juillet 2026 et le 14 juillet 2027 sont deux
lignes récurrentes : `joursFeries(2026)` en voit onze, `statistiquesFeries(2026)` en
compte dix-neuf. C'est exactement le piège maison — « deux lectures d'une même donnée
peuvent se contredire sans qu'aucune boucle ne le voie » —, et il est ici **déjà
constitué**, à ceci près qu'un seul des deux comptes est affiché.

La brancher afficherait le compte faux à côté du juste. Son sort est une **suppression à
instruire**, pas un branchement : c'est la seule des deux redondantes dont le maintien
coûte quelque chose.

### Ce que le branchement a trouvé en chemin

**`RG-GEN-06` — « une action désactivée porte une explication au survol » — n'était
tenue nulle part.** Trois fichiers posent le motif dans un `<Tooltip>` sur un `<Button
isDisabled>` : `Roles.tsx`, `Predefinies.tsx`, `action-protegee.tsx`. Un bouton
nativement `disabled` ne reçoit **ni survol ni focus** : `useTooltipTrigger` n'est jamais
déclenché, l'infobulle ne s'ouvre pas. Le motif était écrit dans la source et
inatteignable à l'écran.

Deuxième moitié du même défaut : **`.tooltip` et `.tip` n'étaient définies dans aucune
feuille**. Sixième membre de la famille « inerte et invisible », après le sélecteur sans
correspondance, la classe sans règle, `ui:diff` qui ne comparait rien et les `MenuItem`
sans `className`. Ni `axe`, ni le typage, ni un parcours ne regardent une classe sans
règle.

Corrigé **pour la vue 32 seulement** — les deux commandes de rôle passent en
`aria-disabled`, qui garde la commande joignable, et `partages.css` porte enfin la règle
`.tooltip`. **`Predefinies.tsx` et `action-protegee.tsx` gardent le défaut** : elles ne
relèvent pas de cette tâche, et `action-protegee` est le composant par lequel passe
*toute* action refusée pour cause de droits. À reprendre.

Deux autres constats, non corrigés :

- **La barre latérale navigue par `<a href>`, pas par des liens de routeur.** Chaque
  changement de vue recharge la page et vide le cache client. Ce n'est pas une
  régression fonctionnelle, mais cela rend **invérifiable** toute invalidation de cache
  entre deux vues : le contrôle qui devait prouver que déclarer un férié rafraîchit le
  planning passe au vert avec *et* sans l'invalidation. La ligne est conservée dans
  `Parametres.tsx` avec ce constat écrit en face.
- **`Holiday` n'a pas de colonne `description`** alors que la maquette 31 pose un champ
  et une colonne de ce nom. Tâche de schéma, pas de fonctionnalité.

### Trois décisions tranchées seul

1. **La zone d'une période de vacances est portée au formulaire**, que la maquette 31
   n'a pas. Le serveur l'exige (`zone: z.string().min(1)`), la liste l'affiche
   (« Zone B · 2026-2027 ») et la trame de fond filtre dessus : la deviner aurait rangé
   la période sous une zone arbitraire. À entériner en `cadrage/02`.
2. **Le type « Jour de pont » de la maquette 31 n'est pas repris.** Le produit ne connaît
   que `legal` — ce que pose l'import, et ce que compte le bloc « Fériés légaux » — et
   `local`, le défaut du serveur pour un jour déclaré à la main. Un troisième code ne
   figure ni au cadrage, ni dans `@rationarium/contracts`, ni au serveur : il remonte en
   question plutôt que de s'inventer.
3. **Un rôle se crée sans modèle**, et le client n'envoie alors aucun `depuisModele` —
   `RG-DROITS-01`, « un modèle est un point de départ, pas une contrainte ». La liste
   porte donc sa propre mention « Aucun modèle : la matrice partira vide ».
