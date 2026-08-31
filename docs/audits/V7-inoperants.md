# Vague 7 — Les inopérants

**Audit et rattrapage, ouverts le 2026-08-31**, après le premier déploiement réel du
produit sur une instance de recette.

---

## Ce qui a déclenché la vague

Le produit tournait. Trente-cinq vues portées, six vagues closes, `pnpm verif` vert,
285 contrôles de bout en bout et 180 contrôles d'accessibilité au vert. Un utilisateur
a ouvert l'application et a trouvé **quatre défauts en une après-midi**.

- La barre latérale se repliait et ne se dépliait plus — sur les trente-cinq vues.
- Il ne pouvait s'assigner aucune tâche.
- Il ne pouvait modifier aucun compte, y compris le sien.
- Le bouton « + » de la fiche tâche n'agissait pas.

**Aucune boucle ne pouvait voir un seul de ces quatre défauts.** C'est ce constat, et
non leur gravité, qui a ouvert la vague.

---

## La famille

Les quatre défauts n'en formaient qu'un seul, décliné : **des choses qui existent et
ne se rejoignent pas.**

| Forme | Exemple trouvé |
| --- | --- |
| Une route gardée, testée, qu'aucun écran n'appelle | `POST /projets/:id/annuler` — tout l'aval était porté, rien ne pouvait produire l'état |
| Une commande désactivée derrière un motif **périmé** | « Ajouter un assigné n'a pas de point d'entrée » — `PUT /taches/:id/assignes` existait depuis L-33 |
| Une forme de réponse **inventée** par le client | `GET /utilisateurs` rend un tableau ; trois vues lisaient `data.utilisateurs` |
| Un champ manquant dans une **lecture**, dont on a conclu que l'**écriture** n'existait pas | `/auth/me` ne rendait pas `version` ; la vue 35 est restée en lecture seule tout le projet |
| Un appel client vers une route **inexistante** | `POST /imports/competences` — un 404 que seule l'action révèle |

Ce qui les rend coûteux tient en une phrase : **une fonctionnalité absente ne fait
échouer aucun contrôle.** Le typage décrit l'invention, le test nourrit la fiction, la
suite d'accessibilité ne regarde pas la mise en page, et une commande désactivée ne
casse rien.

---

## Ce que la vague a trouvé, et que l'audit initial n'avait pas vu

### Deux défauts de sécurité

**`IT_SUPPORT` pouvait s'attribuer `ADMIN`.** `PATCH /utilisateurs/:id` est gardé par
`users:update` et écrivait `roleId`. Or le catalogue de rôles énonce en toutes lettres,
sur ce rôle : « pas de gestion des rôles — c'est la limite qui sépare le support de
l'administration ». **La limite était écrite et tenue nulle part.** `POST /utilisateurs`
ouvrait la même porte à la création.

Le défaut n'est dans aucune des deux moitiés : la garde faisait exactement ce qu'on lui
demandait, le service écrivait exactement ce qu'on lui passait, et les deux étaient
testés. Il est dans **ce que la première autorise et que la seconde ne requestionne
pas.**

**Un rôle système pouvait être vidé de ses permissions.** `RG-ADM-02` n'était tenue que
côté client : `Roles.tsx` désactivait le bouton, `definirPermissions` ne regardait pas
`systeme`. Une requête forgée sur `PUT /administration/roles/:id/permissions` vidait
`ADMIN` — que **nul ne pouvait restaurer**, puisque restaurer exige
`users:manage_permissions`, qui vit dedans. L'instance se verrouillait définitivement.

Le raisonnement était écrit **douze lignes plus haut dans le même fichier**, sur
`renommer` : « sans cela, un administrateur pourrait vider ADMIN de ses permissions et
se verrouiller définitivement hors de l'administration ». *Le commentaire décrivait
exactement le trou qu'il ne bouchait pas.*

### Deux règles du cadrage appliquées nulle part

**`RG-TLT-07`** — « agir sur le télétravail d'autrui exige une permission dédiée ».
`basculer`, `generer` et `statistiques` recevaient `userId` **et** `acteurId` et ne les
comparaient jamais. Les trois routes qui les servent font retomber `userId` sur
l'acteur *par défaut*, ce qui donne l'**apparence** d'un contrôle. Tout agent pouvait
poser du télétravail sur le calendrier de n'importe qui, et en générer un mois entier.

**`RG-TMP-04`** — « déclarer pour un tiers exige une permission dédiée ». Trois branches
se contredisaient : la règle au cadrage, la permission au catalogue, **aucun rôle ne la
détenant et aucun code ne l'exigeant**. Pire, le service **calculait** `pourAutrui` pour
le journal d'audit sans rien refuser — la trace disait exactement ce que le contrôle
aurait dû empêcher.

### Un champ qui mentait parce que personne ne le lisait

`GET /teletravail/statistiques` rendait `annee: jours.length` — le champ nommé « année »
portait un **décompte**, alors que la requête prend une année en entrée. Aucun écran
n'appelait la route, donc aucune assertion ne portait sur sa forme. C'est ce qu'une
capacité sans client cache par nature : elle est testée sur ce qu'elle calcule, jamais
sur ce qu'elle promet.

---

## La sous-mesure, et sa leçon

| Mesuré à l'œil | Mesuré par un contrôle |
| --- | --- |
| 13 routes sans appel client | **41** |
| 2 commandes définitivement inertes | **12** |
| 3 points d'entrée manquants | **5** |
| 121 règles sans test | 123, dont 3 citées sous un identifiant inexistant |

L'écart n'est pas une erreur d'audit : c'est la nature du défaut. **On ne trouve à la
main que ce qu'on soupçonne déjà.** Corollaire, à retenir pour le prochain audit de
cette famille : le premier chiffre sert à décider d'instrumenter, jamais à dimensionner
le travail.

---

## Les garde-fous posés

Sans eux, la vague nettoie l'existant et la famille repousse.

| Contrôle | Ce qu'il refuse | Où |
| --- | --- | --- |
| **Aucune route sans client** | Une route ni appelée ni **énumérée avec sa raison** | `surface-http.test.ts` |
| **Aucun appel dans le vide** | Un chemin client sans route en face — le sens inverse | idem |
| **Aucune commande inerte non déclarée** | Un `isDisabled` constant absent de `design/inoperants.json` | `pnpm inoperant:check` |
| **Aucun champ sensible non gouverné** | Un champ conférant un droit, hors de `champs-gouvernes.ts` | idem |
| **Aucune règle sans test** | Un identifiant du cadrage ni cité, ni en dette, ni motivé | `pnpm tracabilite:check` |

Les trois sont branchés dans `pnpm verif`, et **chacun a été validé en lui donnant ce
qu'il doit refuser** — le dépôt avait déjà payé quatre fois un contrôle qui passait au
vert en ne mesurant rien.

Chacun **affirme son inventaire** : s'il ne trouve pas au moins N routes, N fichiers, N
identifiants, il échoue en le disant plutôt que de conclure sur un corpus vide.

---

## Ce que les agents ont apporté au-delà de leur contrat

Trois trouvailles majeures ne figuraient à aucun contrat de tâche.

- L'agent de **L-39** a ajouté le **test de sens inverse** de sa propre initiative. Il a
  trouvé trois appels clients vers des routes inexistantes — dont deux que l'audit
  n'avait pas vus.
- L'agent de **L-40** a trouvé **douze** commandes inertes là où son contrat en
  annonçait deux, a corrigé **deux défauts de son propre analyseur** avant de croire ses
  résultats, et a découvert le second défaut de sécurité.
- L'agent de **L-41** a **mesuré les deux lectures possibles** de « un test nommé »
  (130 contre 238 identifiants couverts) avant de trancher, et a **refusé** de déclarer
  onze règles « non testables » comme son contrat le suggérait : « chaque identifiant
  rangé à tort là est un test qui ne sera jamais écrit — c'est la seule liste dont
  l'inflation est silencieusement nuisible ».

Cette dernière décision est la plus importante de la vague. Elle a été retenue.

---

## Le bilan

| Mesure | À l'ouverture | À la clôture |
| --- | --- | --- |
| Routes sans appel client | 41 | **10**, toutes énumérées avec leur raison |
| Appels client vers une route inexistante | 3 | **0** |
| Commandes inertes | 12 | **8**, toutes déclarées et motivées |
| Règles citées par un test | 239 / 364 | **360 / 364 (99 %)** |
| Citations pointant un identifiant inexistant | 4 | **0** |
| Règles déclarées « non testables » | 6 | **5**, chacune motivée |
| Contrôles d'intégration | 546 | **989** |
| Contrôles de bout en bout | 285 | **473** |

**Six défauts de sécurité ou de cloisonnement**, aucun prévu au plan :

1. `IT_SUPPORT` pouvait s'attribuer `ADMIN` par `roleId`.
2. Un rôle système pouvait être vidé de ses permissions — instance verrouillée à jamais.
3. Tout agent pouvait poser du télétravail sur le calendrier de n'importe qui.
4. Tout agent pouvait déclarer du temps pour un collègue ou un prestataire.
5. On pouvait s'inviter à un événement qu'on n'a pas le droit de voir — l'invitation
   était le moyen d'obtenir la visibilité qui manquait.
6. Tout compte authentifié pouvait énumérer l'annuaire complet par les détenteurs d'une
   compétence.

Plus une **perte de données silencieuse** : l'import en mode Remplacer détachait les
heures déclarées sans rien dire, ou échouait sur un code de contrainte PostgreSQL.

## Ce que la seconde passe a fermé

Les six points laissés ouverts à la clôture initiale l'ont tous été, et la
famille a rendu davantage en se refermant qu'en s'ouvrant.

| Laissé ouvert | Ce qu'il en est |
| --- | --- |
| Deux `PUT` sans contrôle de version | Fermés. `:id/assignes` et `:id/sous-taches/ordre` exigent la version lue, doublée en base. |
| Participants d'événement sans périmètre | Fermé, **et branché** : le tiroir de la vue 18 n'affichait qu'un compte. |
| `POST /projets` et `chefId`/`sponsorId` | Aligné sur `PATCH`. Un seul modèle de rôle était concerné (`PORTFOLIO_MANAGER`), et il ne pouvait déjà pas corriger un chef existant. |
| `§ M21` muet sur code contre libellé | Écrit au cadrage, et tenu : un statut traduit dans un CSV faisait tomber l'import entier sur une erreur PostgreSQL. |
| Deux formulations du refus de cycle | Le brief s'aligne sur le produit : « créerait une dépendance circulaire » renomme le refus, il ne dit pas ce qui se passerait. |
| Dette de traçabilité | **Zéro.** 360 identifiants sur 364 cités par un test nommé ; les quatre autres inscrits comme non testables avec leur raison. |

### Ce que la seconde passe a trouvé en plus, et qui ne figurait nulle part

**Cinq lectures par identifiant ne contrôlaient aucun périmètre.** La fiche
d'un projet, son budget, son équipe, sa feuille de route — puis, en balayant,
le suivi individuel d'un agent et les documents. Tout porteur de
`projects:read` obtenait n'importe quel projet de l'instance en devinant son
identifiant ; tout porteur de `users:read_individual_tracking` obtenait les
congés, le télétravail et le temps de n'importe qui ; tout porteur de
`documents:read` téléchargeait la pièce jointe de n'importe quelle tâche
confidentielle.

Dans les cinq cas, **la liste filtrait bien et l'adresse directe non.** C'est
ce qui rend cette famille coûteuse : un audit qui regarde la liste conclut que
le cloisonnement tient. Le premier des cinq a été signalé par un agent qui
n'en avait pas la charge — sa route neuve était bornée, ses quatre voisines ne
l'étaient pas, et il l'a dit plutôt que de s'arrêter à son contrat.

**Trois règles étaient tenues par un commentaire.** `RG-PLN-05` promettait un
avertissement quand le rafraîchissement échoue : `refetchQueries` résout sa
promesse même quand les requêtes tombent, donc le `catch` n'était jamais
atteint. `RG-CNG-08` énumérait trois échelons de validateur et s'arrêtait au
deuxième — une demande sans manager ni responsable de département n'apparaissait
**chez personne** tout en retenant du solde. `RG-CNG-23` ne comparait les
versions que si l'appelant en fournissait une.

**Deux fonctionnalités entières manquaient** : les épopées (table, permissions,
quatre modèles de rôles, champ `epicId` d'une tâche — et aucun service, donc
`epicId` ne pouvait jamais valoir autre chose que `null`) et la modification
d'un jalon.

**Deux jeux de données se bloquaient eux-mêmes.** Le compte connecté du jeu de
maquette gardait `motDePasseAChanger`, donc toute mesure de rendu relevait la
vue 05 sur les trente-cinq vues. Et `STAGIAIRE_ALTERNANT`, dont la description
dit « pas de création de tâche hors projet », ne pouvait créer aucune tâche
nulle part : `SOCLE` porte `tasks:create_standalone` et non `tasks:create`.

### La leçon de la seconde passe

La première a mesuré la famille et posé des contrôles ; la seconde a rattrapé
ce qu'ils désignaient. **Aucun des défauts ci-dessus n'a été trouvé par un
contrôle** : ils l'ont été en écrivant, une règle du cadrage à la main, le test
qui manquait. Le contrôle dit où chercher ; il ne cherche pas.

Corollaire pour la prochaine fois : la dette de traçabilité n'est pas une liste
de tests à écrire, c'est une liste d'**endroits où le produit n'a jamais été
confronté à sa spécification**. Sur cinquante-six entrées, quatorze ont révélé
un défaut.

### Ce qui reste ouvert

- **`ActionProtegee` porte une branche inatteignable sur l'onglet Soldes** : la
  commande est gardée par la permission qui affiche déjà l'onglet. `RG-GEN-06` y
  est tenue par le masquage, pas par l'infobulle. À trancher : second gardien,
  ou onglet suffisant.
- **Aucune lecture du défaut global de solde seul** — on interroge le solde de
  l'utilisateur connecté et on ne lit que son champ `global`. Correct, indirect.
- **`btn-danger` s'applique par accident** dans deux vues qui n'importent pas la
  feuille qui la définit : le lot CSS est unique. À reprendre le jour où le
  découpage CSS arrive.
- **L'import CSV des tâches ne porte pas les horaires** — hors contrat de `§ M21`,
  donc ce n'est pas un défaut, mais l'asymétrie mérite d'être vue.

---

## Sur l'exécution en vagues d'agents

Deux défauts de coordination, à corriger avant la prochaine vague.

**Les arbres de travail isolés sont taillés sur le commit d'ouverture de session, pas
sur `main`.** Fusionner les branches de la vague 1 aurait annulé la journée entière.
Un agent a rebasé de lui-même et l'a signalé ; les deux autres ont travaillé sur une
base périmée, dont l'un a recréé un fichier déjà présent. Les briefs suivants ont porté
`git rebase main` en premier geste, et le problème a disparu.

**`packages/db/src/generated` est ignoré par git**, donc `pnpm typecheck` échoue sur
tout arbre neuf tant que `prisma generate` n'a pas été rejoué. Les cinq premiers agents
s'y sont cognés.

**Le cache Turborepo est partagé entre arbres de travail** : un agent a vu `pnpm verif`
rejouer un résultat produit dans l'arbre d'un autre. Le verdict peut décrire un arbre
qui n'est pas le sien.

**Le scratchpad est partagé** : deux agents ont perdu des fichiers de sauvegarde qu'ils
y avaient déposés sous le même nom.
