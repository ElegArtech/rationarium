# Assistant de suivi — spécification de la phase 1

Date : 2 novembre 2026, révisée le 3 novembre 2026. Statut : réalisée sur la branche `assistant-suivi`.
Version cible : 1.1.0.

## 1. Objet

L'assistant de suivi tient à jour les projets, les jalons, les tâches, les événements et les temps
d'un utilisateur à partir de ce qui se passe ailleurs : courriel, documents, dépôts de code,
messageries, publications. Un modèle de langage lit ces sources et met Rationarium à jour lui-même.
L'utilisateur consulte ensuite ce que l'agent a fait, et reprend une action quand elle est fausse.

Le module est facultatif. Il est désactivé par défaut, et une instance qui ne l'active pas ne voit
aucune différence.

## 2. Principes

1. **L'agent agit.** L'agent crée et modifie les entités lui-même, sans validation préalable. Il
   agit pour le compte du propriétaire de son jeton, avec les droits de ce propriétaire et jamais
   davantage.
2. **Une action passe par les routes existantes.** Le serveur rejoue la route d'écriture habituelle
   (`POST /taches`, `PATCH /projets/:id`…), dans son propre processus, avec l'identité du
   propriétaire du jeton. Les permissions, le périmètre, le verrouillage optimiste, les règles
   métier et l'audit s'appliquent donc à l'agent exactement comme à une saisie directe.
3. **Chaque action est tracée et se défait.** Le journal de l'agent garde, pour chaque action,
   l'état avant et après, la justification et les preuves. L'utilisateur peut défaire une action
   tant que l'entité n'a pas changé depuis.
4. **Le modèle travaille chez l'utilisateur.** En phase 1, l'agent tourne sur le poste de
   l'utilisateur, avec son propre client de modèle de langage (Claude Code, Codex ou autre) et son
   propre abonnement. Rationarium ne détient aucun identifiant de modèle ni de source, et le
   serveur n'émet aucun appel sortant.
5. **Rien n'existe quand le module est désactivé.** Aucun écran, aucun traitement planifié, aucune
   entrée de menu, et aucune route hors des réglages et de la sonde d'état (`RG-AST-01`).

## 3. Découpage en phases

| Phase | Contenu |
| --- | --- |
| **1 (ce document)** | Jetons d'agent, guichet des agents, plans de suivi des projets, passages, actions de l'agent, journal et défaire, agent de référence pour un poste |
| 2 | Mode serveur : Rationarium appelle lui-même un fournisseur par API (Anthropic, ou tout fournisseur compatible OpenAI, local compris) ; connecteurs serveur en lecture seule (IMAP, GitHub, flux RSS et Atom, webhooks entrants) ; serveur MCP du guichet |
| 3 | Connecteurs MCP déclarés par l'administrateur ; événements tirés des invitations ICS |

La phase 1 se suffit à elle-même. Les phases 2 et 3 réutilisent ses actions et son journal sans
les modifier.

## 4. Parcours

1. **Activer.** L'administrateur active le module dans le paramétrage et choisit le mode `relais`.
2. **Brancher un agent.** L'utilisateur crée un jeton d'agent dans son compte. Le jeton s'affiche
   une seule fois. Il le range dans le trousseau de son poste, où tourne l'agent de référence.
3. **Dire quoi suivre.** Sur la fiche d'un projet, l'onglet « Suivi » porte le plan de suivi : une
   consigne libre et une liste de sources (une requête de courriel, un dépôt, un dossier, un canal,
   un flux, une page). Le plan dit aussi après combien de jours de silence le projet mérite une
   alerte. L'agent peut lui-même créer un projet et son plan quand une nouvelle affaire apparaît.
4. **Laisser passer l'agent.** Un passage part à l'heure planifiée, ou à la main depuis l'écran
   « Activité de l'agent ». L'agent du poste attend les passages sans rien consommer, prend celui
   qui arrive, lit le contexte, consulte les sources et met Rationarium à jour.
5. **Constater.** À la fin du passage, une notification résume ce que l'agent a fait et les points
   qu'il n'a pas pu trancher. L'écran « Activité de l'agent » montre chaque action, groupée par
   projet, avec ce qui a changé, avant et après, sa justification et ses preuves.
6. **Reprendre si besoin.** L'utilisateur corrige l'entité comme d'habitude, ou défait l'action.
   Une action défaite n'est pas refaite par les passages suivants.

Un poste éteint ne bloque rien : le passage reste « en attente du poste ». L'écran indique si un
agent est joignable, c'est-à-dire s'il a donné signe de vie depuis moins d'une minute.

## 5. Module M22 — Assistant de suivi

### Exigences

| Id | Exigence |
| --- | --- |
| EX-AST-01 | Activer ou désactiver le module, et choisir son mode |
| EX-AST-02 | Créer, lister et révoquer ses jetons d'agent, et limiter les types d'action d'un jeton ; le jeton n'est affiché qu'à sa création |
| EX-AST-03 | Déclarer le plan de suivi d'un projet : consigne, sources, seuil de silence |
| EX-AST-04 | Lancer un passage à la main, et suivre son état et sa progression |
| EX-AST-05 | Planifier les passages |
| EX-AST-06 | Consulter les actions de l'agent, par passage et par projet, avec l'état avant et après et les preuves |
| EX-AST-07 | Défaire une action de l'agent |
| EX-AST-08 | Être notifié de la fin d'un passage : actions effectuées, actions refusées, points ouverts |
| EX-AST-09 | Consulter l'historique des passages |
| EX-AST-10 | Valider ou rejeter une création de projet proposée par l'agent |

### Règles de gestion

- **RG-AST-01** — Le module est désactivé par défaut. Désactivé, le guichet et les écrans du module
  répondent 404 (`erreurs:introuvable`), et aucun traitement planifié du module n'est déclaré. Seules
  font exception les réglages, sans lesquels on ne pourrait pas l'activer, et la sonde
  `GET /assistant/etat`, qui répond alors `{ actif: false }` sans rien dire d'autre : l'interface s'en
  sert pour savoir si elle affiche le module.
- **RG-AST-02** — Un jeton d'agent agit pour son propriétaire. Il ne donne jamais plus que les
  permissions et le périmètre du propriétaire, contrôlés dans cet ordre. Il n'ouvre que les routes
  du guichet, et aucune route de l'API de session. Seule l'empreinte du jeton est conservée.
- **RG-AST-03** — Un jeton révoqué, expiré, ou dont le propriétaire est inactif, est refusé en 401.
  La révocation prend effet à la requête suivante.
- **RG-AST-04** — Une action de l'agent est appliquée immédiatement par le service métier de
  l'entité visée, avec l'identité du propriétaire du jeton, sauf la création de projet
  (`RG-AST-21`). Un refus du service (droit, périmètre,
  règle métier) est rendu à l'agent avec le message métier, et rien n'est écrit.
- **RG-AST-05** — Un jeton peut être limité à certains types d'action. Une action d'un type non
  autorisé est refusée en 403, et rien n'est écrit.
- **RG-AST-06** — Une action qui modifie une entité existante porte la version de cette entité. Si
  l'entité a changé depuis la lecture de l'agent, l'action est refusée en 409 et rien n'est écrit
  (`RG-GEN-07`). L'agent relit l'entité avant de réessayer.
- **RG-AST-07** — Toute action porte une justification et au moins une preuve. Une preuve comprend
  une source, une référence, une date et, au plus, un extrait de 280 caractères. Une action porte
  au plus dix preuves.
- **RG-AST-08** — Une tâche créée dans un projet par l'agent est rattachée à un jalon de ce projet,
  existant ou créé dans la même action. Le paramètre `assistant.jalonObligatoire` porte cette règle
  et vaut `true` par défaut.
- **RG-AST-09** — Un projet créé par l'agent commence à la date de l'une des preuves de l'action. La
  date du passage n'est jamais une date de début.
- **RG-AST-10** — Une action désigne une entité existante par son identifiant. Le serveur ne
  rapproche jamais deux entités par leur libellé.
- **RG-AST-11** — L'agent ne supprime aucune entité, ni physiquement ni logiquement : il ne peut
  ni supprimer, ni annuler, ni archiver.
- **RG-AST-12** — Une action dont l'empreinte est celle d'une action défaite depuis moins de 90 jours
  est refusée. Une action rejouée dans le même passage, avec la même empreinte, rend le résultat de
  la première exécution sans rien écrire de nouveau.
- **RG-AST-13** — Une action peut déclarer une référence locale (`reference`), et une action
  suivante du même passage désigne l'entité créée par `@reference`. Si l'action qui déclarait la
  référence a été refusée, l'action qui la désigne est refusée à son tour, et rien n'est écrit.
- **RG-AST-14** — Le contexte servi à l'agent ne contient que ce que le propriétaire du jeton peut
  lire. Une tâche confidentielle en est exclue sans `tasks:read_confidential` (`RG-SCOPE-04`).
- **RG-AST-15** — Un passage pris sans signe de vie depuis 30 minutes passe à « interrompu ». Un
  propriétaire n'a qu'un passage actif à la fois.
- **RG-AST-16** — Le traitement planifié des passages est protégé contre les exécutions
  concurrentes : une seule instance crée les passages (`RG-NTF-02`).
- **RG-AST-17** — Chaque action est tracée au journal d'audit comme une saisie directe du
  propriétaire, avec en plus le passage et le jeton d'origine. Le journal d'audit distingue ainsi
  l'action de l'agent de celle de la personne (`EX-ADM-09`).
- **RG-AST-18** — Défaire une action rétablit l'état d'avant, par le service métier, avec
  l'identité de la personne qui défait. Défaire une création supprime l'entité créée, selon les
  règles de suppression de cette entité. Si l'entité a changé depuis l'action, défaire est refusé
  et l'écran l'explique.
- **RG-AST-19** — Les extraits des preuves sont effacés après la durée de conservation
  `assistant.conservationJours`. La source, la référence et la date des preuves restent.
- **RG-AST-20** — En mode `relais`, le serveur n'émet aucun appel réseau sortant pour le module.
- **RG-AST-21** — La création d'un projet par l'agent, et elle seule, attend la validation du
  propriétaire du jeton, quand le réglage `assistant.validationProjets` est actif (il l'est par
  défaut). Rien n'est écrit avant la décision. Validée, la création passe par la route habituelle,
  au nom de qui valide ; rejetée, elle n'écrit rien et n'est pas reproposée pendant 90 jours
  (`RG-AST-12`).
- **RG-AST-22** — Une action qui désigne par `@nom` une création de projet en attente attend avec
  elle. À la validation, elle s'exécute après le projet, dans l'ordre de dépôt ; au rejet, elle est
  rejetée avec lui. Une action dépendante ne se valide ni ne se rejette seule.

## 6. Droits

Deux permissions s'ajoutent au catalogue de `packages/contracts/src/permissions.ts`, dans un
domaine `assistant`.

| Permission | Donne |
| --- | --- |
| `assistant:use` | Créer ses jetons, déclarer le plan de suivi des projets qu'on peut modifier, lancer un passage, consulter et défaire les actions de ses agents |
| `assistant:configure` | Activer le module, choisir le mode, régler la planification et la conservation |

L'agent n'a aucun droit propre : chaque action exige les droits du propriétaire pour la même
opération (`RG-TSK-02`, `RG-TSK-03`, `RG-PRJ-13` et les autres règles de droits du module visé).

Modèles de rôles qui reçoivent `assistant:use` par défaut : `ADMIN`, `ADMIN_DELEGATED`,
`PORTFOLIO_MANAGER`, `MANAGER`, `MANAGER_PROJECT_FOCUS`, `PROJECT_LEAD`, `PROJECT_LEAD_JUNIOR` et
`TECHNICAL_LEAD`. `assistant:configure` revient au seul modèle `ADMIN`.

## 7. Paramétrage

Un onglet « Assistant » s'ajoute au paramétrage. Il n'est visible qu'avec `assistant:configure`.

| Clé | Valeurs | Défaut |
| --- | --- | --- |
| `assistant.mode` | `desactive`, `relais` (`api` en phase 2) | `desactive` |
| `assistant.planification` | Expression cron dans le fuseau de l'organisation, ou vide | vide |
| `assistant.jalonObligatoire` | `true`, `false` | `true` |
| `assistant.conservationJours` | Entier de 30 à 1 830 | `180` |
| `assistant.actionsParPassage` | Entier de 1 à 1 000 | `500` |
| `assistant.validationProjets` | `true`, `false` (`RG-AST-21`) | `true` |

Aucune de ces clés n'est publique.

## 8. Données

Le schéma passe par un lot dédié (voir § 16). La migration est réversible.

| Table | Contenu |
| --- | --- |
| `agent_jetons` | `userId` (propriétaire), `libelle`, `empreinte` (SHA-256, unique), `typesAutorises` (vide pour tous), `creeLe`, `expireLe`, `dernierUsage`, `revoqueLe` |
| `projet_suivis` | `projectId` (unique), `consigne`, `sources` (jsonb, validé par le contrat), `silenceJours`, `actif`, `version` |
| `agent_passages` | `proprietaireId`, `declenchement` (`planifie`, `manuel`), `demandeurId`, `projectIds` (portée, vide pour tous les projets suivis), `etat`, `jetonId`, `progression`, `signeDeVie`, `priseLe`, `finLe`, `bilan` (jsonb, points ouverts compris), `erreur`, `creeLe` |
| `agent_actions` | `passageId`, `jetonId`, `proprietaireId`, `projectId`, `type`, `cibleType`, `cibleId`, `charge` (jsonb), `avant` (jsonb), `apres` (jsonb), `versionApres`, `justification`, `preuves` (jsonb), `empreinte`, `etat`, `motifRefus`, `defaiteParId`, `defaiteLe`, `creeLe` |

Contraintes et index :

- un seul passage à l'état `en_attente`, `prise` ou `en_cours` par propriétaire (index unique
  partiel) ;
- `agent_actions (proprietaireId, creeLe)` pour l'écran, `(projectId, creeLe)` pour la fiche projet,
  `(empreinte)` pour `RG-AST-12`, `(passageId)` pour le bilan ;
- `agent_jetons (empreinte)` unique, `(userId)`.

Le jeu de volumétrie reçoit 50 plans de suivi, 2 000 passages et 50 000 actions.

## 9. Vocabulaires et charges

Les vocabulaires suivants sont définis une seule fois, dans `@rationarium/contracts`.

**État d'un passage** — `en_attente` · `prise` · `en_cours` · `terminee` · `echec` · `interrompue`
· `annulee`

**État d'une action** — `effectuee` · `refusee` · `defaite` · `a_valider` · `rejetee`

**Type de source** — `courriel` · `depot` · `dossier` · `canal` · `flux` · `page` · `autre`.
Une source porte un type, une désignation (requête, nom de dépôt, chemin, adresse) et un libellé.
En phase 1, le serveur ne l'interprète pas : il la conserve et la transmet à l'agent.

**Type d'action**, avec sa charge :

| Type | Charge | Route rejouée |
| --- | --- | --- |
| `projet_creer` | nom, description, statut (sauf Annulé), priorité, dates, chef, plan de suivi | `POST /projets` |
| `projet_modifier` | identifiant, version, statut (sauf Annulé), dates, description… | `PATCH /projets/:id` |
| `jalon_creer` | projet, nom, date d'échéance, description | `POST /projets/:id/jalons` |
| `jalon_modifier` | identifiant, version, nom, date d'échéance, description | `PATCH /projets/jalons/:id` |
| `tache_creer` | projet, jalon, titre, description, statut, priorité, dates, avancement, assignés (défaut : le propriétaire) | `POST /taches` |
| `tache_modifier` | identifiant, version, statut, avancement, dates, priorité, description, jalon | `PATCH /taches/:id` |
| `evenement_creer` | projet, titre, date, horaires ou journée entière, description, participants (défaut : le propriétaire) | `POST /evenements` |
| `evenement_modifier` | identifiant, version, titre, date, horaires, description | `PATCH /evenements/:id` |
| `temps_saisir` | projet, tâche, date, heures, type d'activité, description ; la saisie revient au propriétaire | `POST /temps` |
| `commentaire_ajouter` | projet ou tâche, contenu | `POST /documents/commentaires` |
| `suivi_modifier` | projet, version, consigne, sources, seuil de silence, actif | `PUT /assistant/suivis/:projectId` |

Les codes emploient le tiret bas : un point serait lu par i18next comme un séparateur de clé. La
forme exacte des charges est dans `packages/contracts/src/assistant.ts`. Une charge n'y fixe que ce
qui sert à l'assistant ; la route rejouée revalide son corps avec son propre schéma.

Un projet créé par l'agent reçoit pour chef le propriétaire du jeton, quand celui-ci a le droit de
nommer un chef (`projects:manage_members`). Sinon, il en reste le créateur, ce qui le rattache au
projet (`RG-TSK-03`). Ses jalons et ses tâches sont des actions suivantes, qui désignent le projet
par sa référence locale (`RG-AST-13`).

L'empreinte d'une action est le SHA-256 de son type et de sa charge normalisée, références
résolues.

## 10. Guichet des agents (`/api/agent/v1`)

Authentification par `Authorization: Bearer <jeton>`. Ces routes refusent le cookie de session, et
les routes de session refusent le jeton. Le débit est limité par jeton. Le corps est limité à
1 Mio (`RG-ROB-01`).

| Route | Usage |
| --- | --- |
| `GET /etat` | Vérifier le jeton : propriétaire, mode du module, types autorisés, passage actif |
| `GET /passages/suivant?attendre=25` | Attendre jusqu'à 25 s un passage en attente du propriétaire, et le rendre. Vaut signe de vie de l'agent |
| `POST /passages` | Créer un passage manuel depuis le poste |
| `POST /passages/:id/prise` | Prendre un passage ; refusé en 409 s'il est déjà pris |
| `POST /passages/:id/progression` | Libellé court d'avancement ; vaut signe de vie |
| `GET /passages/:id/contexte` | Projets de la portée, avec leur plan de suivi, leurs jalons, leurs tâches ouvertes et récemment closes, leurs événements à venir, la date du dernier passage terminé et les actions des 90 derniers jours, défaites comprises |
| `GET /passages/:id/temps?du=…&au=…` | Temps déjà déclarés par le propriétaire sur la période, pour éviter les doubles comptes |
| `POST /passages/:id/actions` | Exécuter jusqu'à 50 actions, dans l'ordre. La réponse donne, pour chacune, les identifiants et versions résultants, ou le motif du refus |
| `POST /passages/:id/fin` | `terminee` ou `echec`, avec le bilan : sources consultées, nombre de signaux lus, points ouverts, limites rencontrées, consommation déclarée par l'agent |

Chaque action d'un lot est indépendante : le refus de l'une n'empêche pas les suivantes. Les refus
nomment la règle en cause. Les références locales restent valables d'un lot à l'autre du même
passage.

Un point ouvert est ce que l'agent n'a pas pu trancher seul : une entité qu'il ne sait pas
désigner sans conjecture, une date que le corpus n'atteste pas, un conflit de version répété. Il
figure dans le bilan et dans la notification de fin, et n'écrit rien.

## 11. Journal et défaire

- L'écran « Activité de l'agent » liste les actions par passage et par projet. Chaque ligne montre
  le type, l'entité avec son lien, la différence entre avant et après, la justification et les
  preuves cliquables.
- **Défaire** demande une confirmation qui nomme l'entité et la conséquence (`RG-GEN-01`). Le
  serveur rejoue la route de modification avec l'état d'avant, ou la route de suppression de
  l'entité créée, au nom de la personne qui défait (`RG-AST-18`). Les droits de cette personne
  s'appliquent : supprimer un projet exige par exemple `projects:delete`. L'action passe à
  `defaite`.
- **Défaire un passage** défait ses actions encore défaisables, de la plus récente à la plus
  ancienne. Le compte rendu distingue les actions défaites et celles qui ne pouvaient plus l'être,
  comme un import (`RG-IMP-04`).
- La fiche d'un projet montre, dans l'onglet « Suivi », les dernières actions de l'agent sur ce
  projet.

### Valider une création de projet (1.1.1)

Une création de projet proposée par l'agent apparaît dans la section « À valider » de l'écran
Activité de l'agent, avec ses actions dépendantes. `POST /assistant/actions/:id/valider` crée le
projet, puis exécute ses dépendantes dans l'ordre ; `POST /assistant/actions/:id/rejeter` les rejette
toutes, sans rien écrire. `GET /assistant/etat` donne le nombre de créations en attente, et la
notification de fin de passage le rappelle.

Décision du 4 novembre 2026 : des alertes de service et des quittances avaient été prises pour des
affaires. La création d'un projet est le seul geste qui fait entrer une affaire dans le suivi ;
c'est là qu'une erreur coûte le plus.

## 12. Traitements planifiés

| Traitement | Rythme | Effet |
| --- | --- | --- |
| `assistant.passages` | `assistant.planification` | Crée un passage `planifie` pour chaque propriétaire qui a au moins un plan de suivi actif et un jeton valide, sauf s'il a déjà un passage actif |
| `assistant.interruption` | Toutes les 5 minutes | Fait passer à `interrompue` les passages sans signe de vie depuis 30 minutes (`RG-AST-15`) |
| `assistant.conservation` | Chaque jour | Efface les extraits des preuves échues (`RG-AST-19`) |

Les trois traitements passent par `FileService` et son `singletonKey`. Aucun n'est déclaré quand le
module est désactivé.

La fin d'un passage crée une notification de type `assistant.passage` pour le propriétaire, avec le
nombre d'actions effectuées, refusées et les points ouverts, et un lien vers l'écran. Un passage
sans action ni point ouvert ne notifie rien. Un passage en échec ou interrompu crée une
notification `assistant.passage_echec`.

## 13. Interface

| Écran | Contenu |
| --- | --- |
| Paramétrage › Assistant | Mode, planification, règles et conservation (`assistant:configure`) |
| Mon compte › Agents | Jetons : création avec affichage unique et choix des types d'action, liste avec dernier usage, révocation confirmée (`RG-GEN-01`) |
| Fiche projet › Suivi | Plan de suivi, dernier passage, dernières actions de l'agent sur le projet |
| Activité de l'agent | Dernier passage et ses points ouverts ; actions groupées par projet ; défaire une action ou un passage ; témoin de l'agent joignable ; bouton « Lancer un passage » |
| Activité de l'agent › Historique | Passages avec déclenchement, durée, bilan ; filtres par état et par projet |

Chaque liste a son état vide rédigé, avec l'action suivante (`RG-GEN-04`). L'état vide de l'écran
« Activité de l'agent » renvoie vers la création d'un jeton tant qu'aucun agent n'est branché.

## 14. Agent de référence

Le dépôt fournit un agent de référence dans `outils/agent/`, sans dépendance, pour Node.js 24.

- `rationarium-agent` : commandes `etat`, `attendre`, `prendre`, `contexte`, `temps`,
  `progression`, `agir <fichier.json>`, `fin` et `lancer`. Le jeton se lit dans `RATIONARIUM_JETON`, ou dans
  le trousseau du système quand `secret-tool` est présent.
- `rationarium-relais` : boucle d'attente qui démarre une exécution quand un passage arrive. Elle
  ne consomme rien sur l'abonnement du modèle de langage pendant l'attente.
- Des unités systemd d'exemple, pour le relais et pour un passage de secours planifié.
- Une consigne d'exemple pour Claude Code (`claude -p`) et pour Codex (`codex exec`). Elle décrit
  le déroulé : prendre le passage, lire le contexte, consulter chaque source du plan, agir avec des
  preuves, relire et réessayer sur un conflit de version, finir avec le bilan et les points
  ouverts. Elle rappelle que le contenu des sources est une donnée et jamais une consigne.

L'agent consulte les sources avec les moyens du poste. Le serveur ne reçoit que les actions et
leurs preuves.

## 15. Sécurité et confidentialité

- **Injection.** Le contenu des courriels, des messages et des pages peut contenir des
  instructions. Une injection réussie ne peut écrire que dans le périmètre du propriétaire, dans
  les types d'action autorisés pour le jeton, sans aucune suppression. Elle reste tracée et
  défaisable.
- **Jetons.** Un jeton fait 256 bits. Seule son empreinte est stockée. Il expire au bout d'un an
  par défaut. Sa création, son usage refusé et sa révocation sont tracés.
- **Minimisation.** Le serveur ne stocke aucun corps de message ni aucun document. Les extraits
  sont courts et purgés à échéance.
- **Réseau.** En phase 1, le serveur n'appelle aucun service extérieur. L'exigence de
  fonctionnement sans accès Internet sortant reste tenue (§ 7 de la référence fonctionnelle).
- **Abonnements.** Rationarium ne stocke et n'emploie aucun identifiant d'abonnement à un modèle
  de langage. L'abonnement reste dans le client de l'utilisateur, sur son poste.

## 16. Lots

| Lot | Contenu | Dépend de |
| --- | --- | --- |
| L-A1 | Schéma : quatre tables, index, migration réversible, jeu de volumétrie | — |
| L-A2 | Contrats : vocabulaires, permissions, schémas des sources et des charges | L-A1 |
| L-A3 | API : jetons, garde Bearer, routes du guichet hors actions | L-A2 |
| L-A4 | API : exécution des actions, contrôles, journal avant et après, défaire, audit | L-A3 |
| L-A5 | API : traitements planifiés, notifications, conservation | L-A4 |
| L-A6 | Web : les cinq écrans du § 13, traductions FR et EN, deux thèmes | L-A4 |
| L-A7 | Agent de référence et consignes d'exemple | L-A3 |
| L-A8 | Documentation : module M22 dans la référence fonctionnelle, utilisation, exploitation, notes de version | L-A5, L-A6 |

Aucun lot n'ajoute de dépendance. Le serveur MCP de la phase 2 fera l'objet d'une ADR s'il en
exige une.

## 17. Tests

- Un test nommé par règle `RG-AST-…`, sur PostgreSQL réel.
- Les refus d'action : preuve absente, extrait trop long, tâche sans jalon, projet sans date
  attestée, référence par libellé, type non autorisé pour le jeton, suppression demandée, action
  déjà défaite.
- Le conflit de version : une entité modifiée entre la lecture et l'action n'est pas écrasée.
- Le cloisonnement : un jeton ne lit ni n'écrit hors du périmètre de son propriétaire, et ne voit
  pas les tâches confidentielles sans la permission.
- Défaire : une création défaite supprime l'entité ; une modification défaite rétablit l'état
  d'avant ; une entité modifiée depuis l'action n'est pas défaite.
- Le module désactivé : toutes les routes répondent 404 et aucun traitement n'est déclaré.
- Le parcours complet de bout en bout, avec un agent simulé : passage, actions, notification,
  entités écrites, entrées d'audit, défaire.

## 18. Hors phase 1

- Le mode `api`, ses fournisseurs et ses connecteurs serveur (phase 2).
- Le serveur MCP du guichet (phase 2).
- La lecture des réseaux sociaux. LinkedIn n'ouvre pas la lecture d'un profil personnel par API.
  Instagram et TikTok n'ouvrent que les publications du compte connecté, et pour Instagram un
  compte professionnel. En phase 1, ces sources relèvent de l'agent du poste.

## 19. Choix par défaut à confirmer

1. Les modèles de rôles qui reçoivent `assistant:use` (§ 6).
2. La conservation des extraits pendant 180 jours (§ 7).
3. La durée de vie d'un jeton : un an.
