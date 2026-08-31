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
