# Rapport de recette par persona

**2026-09-07.** Cent soixante et onze parcours, joués en français et en anglais, contre
une pile réelle — PostgreSQL, serveur applicatif, lot construit servi derrière un relais
`/api`, sous la politique de sécurité de contenu du déploiement. Deux passes.

|  | Parcours | Exécutions | Verts | Rouges | Parcours rouges |
| --- | --- | --- | --- | --- | --- |
| Première passe | 143 | 286 | 106 | 180 | **90 / 143** |
| Seconde passe | 171 | 342 | 213 | 129 | **67 / 171** |

Trente-sept parcours sont passés du rouge au vert. Cinquante-trois sont restés rouges.
Un seul a changé de couleur dans l'autre sens, et pour une raison qui n'est pas une
régression du produit — elle est expliquée au § 2.

---

## Ce que cette étape a ajouté à ce qui existait

Les huit boucles du produit le vérifient **vue par vue et état par état**. Aucune ne
poursuit un objectif d'un écran à l'autre. Et aucune — c'est le point — ne parlait à un
serveur réel : les vingt-trois suites de `apps/web/e2e` interceptent `/api` et servent
leurs propres jeux d'essai. C'est légitime pour un contrôle de routage ; ça ne l'est pas
pour une recette, dont l'objet est justement le raccord entre les deux moitiés.

Trois artefacts manquaient et ont été posés :

- **`design/carte-de-navigation.md`** — 35 nœuds, 101 arêtes. Elle n'existait pas. Dérivée
  en contexte neuf des seuls `cadrage/01` et `cadrage/02`.
- **`recette/jeu2.mjs`** — le **second jeu d'illustration**, sans une valeur commune avec
  `packages/db/src/maquette.ts`, et six comptes de persona avec leur rôle système.
- **`recette/09-parcours.json`** — les parcours, dérivés **à l'aveugle** : le sous-agent
  qui les a écrits n'a vu ni le produit, ni le code, ni le prompt de l'étape.

Les deux capacités que l'étape suppose — **ouvrir le produit sous une persona** et **le
remettre à zéro entre deux parcours** — sont établies **hors produit**, dans
`recette/harnais/`. La connexion passe par le formulaire réel ; il n'existe aucune porte
dérobée dans les sources livrées.

---

## 1. Les parcours joués

| Persona | Parcours | Exécutions | Verts | Rouges | Parcours verts |
| --- | --- | --- | --- | --- | --- |
| Camille | 46 | 92 | 69 | 23 | 33 / 46 |
| Driss | 39 | 78 | 42 | 36 | 21 / 39 |
| Fatou | 22 | 44 | 24 | 20 | 12 / 22 |
| Hugo | 22 | 44 | 32 | 12 | 16 / 22 |
| Inès | 12 | 24 | 11 | 13 | 5 / 12 |
| Karim | 30 | 60 | 35 | 25 | 17 / 30 |
| **Total** | **171** | **342** | **213** | **129** | **104 / 171** |


Chaque exécution porte sa trace au dossier de preuves —
`recette/preuves/<parcours>/<persona>/<langue>/` : `verdict.json` (versionné),
`incidents.json`, les captures d'étape, la trace Playwright et la vidéo.
**Un vert sans trace n'est pas un vert** : le relevé en compte 342 sur 342.

Le détail parcours par parcours suit, à la fin de ce rapport.

---

## 2. Les parcours restés rouges — **non livrés**

Cinquante-trois parcours dérivés du cahier des charges et treize parcours issus de
l'exploration sont **rapportés comme non livrés**. Le budget de deux passes est épuisé ;
le repli appliqué est celui que l'étape prescrit — rapporter la partie en défaut, jamais
la déclarer livrée avec un écart.

Ils se rangent en cinq familles, et **la famille commande la suite** : trois d'entre
elles ne se corrigent pas au clavier, elles se tranchent au cadrage.

### 2.1 Ce qui n'a jamais été construit (28 parcours)

Le cahier des charges l'exige, le produit ne le porte pas. Ce n'est pas un défaut : c'est
de la portée non réalisée.

| Parcours | Ce qui manque | Exigences et règles |
| --- | --- | --- |
| P-13, P-14 | La vue 35 n'a que deux onglets sur trois ; aucun contrôle d'avatar ; le refus de politique de mot de passe n'énonce pas la règle | `EX-AUTH-08`, `EX-AUTH-09`, `RG-AUTH-06`, `RG-AUTH-09` |
| P-43 | Un projet ne naît ni avec son chef, ni avec son sponsor, ni avec son département — et rien ne permet de les poser ensuite, alors que `POST /projets` les accepte | `EX-PRJ-03`, `EX-PRJ-04`, `RG-PRJ-01` |
| P-52 | Les quatre rôles RACI ne sont attribuables nulle part : `attribuerRaci` et `POST /taches/:id/raci` existent, aucun client ne les appelle | `EX-TSK-14`, `RG-TSK-10` |
| P-63, P-65 | Inviter un service entier est accepté par le serveur et offert par aucun écran ; la fenêtre de création d'événement n'a ni description ni marque d'intervention extérieure | `EX-TSK-06`, `EX-EVT-03`, `EX-EVT-04` |
| P-64 | L'export ICS n'est ouvert à personne d'utile, l'import ICS n'a aucun client | `EX-PLN-15` |
| P-69, P-70 | Un projet archivé ne se retrouve par aucun filtre ; la suppression définitive n'est offerte à aucun chef de projet | `EX-PRJ-06`, `RG-PRJ-03`, `RG-PRJ-05` |
| P-71 | Un chef de projet ne peut pas rattacher le bénéficiaire de son propre projet | `EX-PRJ-10`, `RG-PRJ-10` |
| P-78, P-80 | Déclarer un congé pour un collaborateur n'a aucune porte d'entrée ; un manager ne peut pas gérer ses délégations | `EX-CNG-08`, `EX-CNG-11`, `EX-CNG-12`, `RG-CNG-12`, `RG-CNG-14` |
| P-85 | Aucune statistique de télétravail par agent dans la vue 20 | `EX-TLT-08` |
| P-88 | La période d'une assignation d'activité n'est affichée nulle part, et l'ajout impose la journée entière ; la réalisation n'est actionnable par personne | `EX-ACT-02`, `EX-ACT-06`, `RG-ACT-01` |
| P-90 | La vue 21 n'a ni filtre par utilisateur, ni déclaration pour un tiers | `EX-TMP-02`, `EX-TMP-08`, `RG-TMP-04`, `RG-TMP-05` |
| P-100, P-101 | Les jours fériés et les vacances scolaires sont en lecture seule : ni import d'année, ni saisie | `EX-PRM-01`, `EX-PRM-02`, `RG-PRM-01` à `RG-PRM-04` |
| P-112 | La graduation partielle du Gantt portefeuille est tronquée aux échelles Jour et Semaine | `EX-RPT-13` |
| P-113 | L'export **Excel** de la vue 30 n'existe pas — l'interface propose CSV | `EX-RPT-03` |
| P-124 | Le mot de passe réinitialisé est **tiré dans le navigateur** et communiqué à personne : le compte devient inaccessible | `EX-USR-07`, `RG-AUTH-06`, `RG-AUTH-10` |
| P-128 | `EX-ADM-06` — l'initialisation du référentiel des rôles n'est exposée par aucune route ni aucune commande, alors que l'état vide de la vue 32 invite à l'emprunter | `EX-ADM-06` |
| P-134 | L'icône d'une tâche prédéfinie n'est saisissable nulle part | `EX-ACT-01` |
| P-137 | Le rattachement d'un département ne se change nulle part, si bien que la fenêtre de refus qui le motive est inatteignable | `EX-ORG-02`, `RG-ORG-01` |
| P-139 | La fiche tiers ne mène à aucune fiche de tâche | `EX-TRS-03`, `RG-TRS-04` |
| P-144 | La **recherche globale** de l'en-tête est un champ inerte, offert sur les trente-cinq vues | `EX-TSK-01` |
| P-147 | La vue 16 perd ses filtres au retour arrière et n'a pas d'adresse — la vue 10 a reçu cette correction, pas elle | `RG-GEN-04` |
| P-158, P-159 | La vue équipe du télétravail ne connaît pas l'état « en congé » ; l'onglet « À valider » ne nomme pas le service du demandeur et ne donne à lire aucune absence concomitante | `EX-USR-09`, `EX-CNG-05`, `RG-TLT-02` |
| P-170 | Le détail du journal d'audit rend des identifiants nus : Karim voit qu'un rôle a changé, jamais lequel | `EX-ADM-03` |
| P-171 | Les 26 rôles système n'ont qu'un nom, français : sous session anglaise, quatre écrans les rendent en français | `RG-GEN-08` |

### 2.2 Le catalogue de rôles contredit les personas (11 parcours)

**Ces onze parcours ne sont pas des défauts de code.** `cadrage/01 § 3.1` décrit une
persona, `§ 3.2` lui attribue un modèle de rôle, et les deux ne disent pas la même chose.
Aucune correction d'écran ne peut les réconcilier : **l'arbitrage est au cadrage.**

| Parcours | La contradiction | Exigences |
| --- | --- | --- |
| P-31 | Camille **subit** des règles de télétravail marquées « ↻ Récurrent » qu'elle ne peut ni lire ni modifier : `telework:manage_rules` n'est pas dans `PROJECT_CONTRIBUTOR`, alors que `EX-TLT-04/05/06` s'adressent à elle | `EX-TLT-04`, `EX-TLT-05`, `EX-TLT-06`, `RG-TLT-03/04/05` |
| P-105 à P-108 | Le cahier confie à Hugo le référentiel des compétences ; `HR_OFFICER` n'a que `skills:read` et `skills:read_team`. **Un seul écart de catalogue, quatre parcours rouges.** | `EX-CMP-01` à `EX-CMP-10`, `RG-CMP-01` à `RG-CMP-06` |
| P-116, P-117, P-165 | Le § 3.1 décrit Inès en lecture ; `PORTFOLIO_MANAGER` porte `projects:create/update/archive/manage_any` et hérite de `leaves:approve`. Elle crée, archive et annule des projets — le serveur accepte un `PATCH` forgé — et valide des congés | `RG-DROITS-03`, `EX-PRJ-01`, `EX-PRJ-08`, `RG-CNG-09` |
| P-72 | La barre latérale de Driss porte « Utilisateurs », et `/parametres` lui sert la vue 31 entière : `settings:read` et `users:read` sont dans le socle | `RG-DROITS-03` |
| P-53, P-83 | Deux parcours demandent à leur persona de lire le journal d'audit ou un suivi hors périmètre, que son rôle interdit — le refus est prononcé, mais l'observable exige la lecture | `EX-DOC-04`, `RG-SCOPE-01` |

### 2.3 Le cadrage ne dit pas ce que le parcours exige (7 parcours)

Le parcours cite un texte ou un état que le cadrage énonce et que le produit ne porte
pas sous cette forme. **La divergence est de spécification, pas de rendu.**

| Parcours | L'écart | Trace |
| --- | --- | --- |
| P-119 à P-123 | La carte de navigation et `cadrage/02 § vue 27` nomment l'action « Voir le suivi individuel » ; le produit la nomme « Suivi » / « Track ». **Cinq parcours rougis par un seul libellé**, dont trois dont toutes les clauses fonctionnelles passent | arête `A-80` |
| P-84 | Le bandeau d'alerte de la vue 30 doit porter « Consultez la page Tâches pour plus de détails. » — la phrase n'existe dans aucun catalogue | `cadrage/02 § vue 30` |
| P-41 | La vue 29 refusée doit dire « 🔒 Accès restreint » ; le produit dit « Permission requise ». Et le parcours **se contredit** : ses `textes` réclament « Départements » alors que son observable exige que la barre latérale ne le porte pas | `EX-ORG-04` |

### 2.4 Le parcours est devenu injouable (3 parcours)

| Parcours | Pourquoi | Repli |
| --- | --- | --- |
| P-49 | L'observable exige une tâche prérequise **supprimée** et affichée « Tâche supprimée » ; `RG-TSK-07` interdit de supprimer une tâche dont d'autres dépendent. L'état n'est atteignable par aucun geste | Rapporté non livré ; la contradiction remonte au cadrage |
| P-164 | Le parcours exige une fenêtre « 30 jours » ; le défaut qu'il visait a été corrigé **par renommage** — les libellés sont désormais « Semaine / Mois / Trimestre / Année en cours », ce que `EX-RPT-01` demande. Le parcours vise un libellé qui n'existe plus | Rapporté non livré ; à réécrire en amont |
| P-26 | Ses `textes` réclament le libellé « Soldes », onglet réservé à `leaves:manage_balances` que sa persona ne détient pas. **La liste de textes est incompatible avec les droits de la persona** ; le fond du parcours, lui, passe — le refus est chiffré dans les deux langues | Rapporté non livré ; à corriger côté parcours |

### 2.5 Ce qui reste un défaut de code (18 parcours)

| Parcours | Le défaut | Exigences |
| --- | --- | --- |
| P-07 | Le changement de mot de passe imposé réussit (200, drapeau levé en base) puis **rebondit sur la vue 05** : `surSucces` navigue sans attendre l'invalidation de la session, et le garde de route relit une session périmée | `EX-AUTH-07`, `RG-AUTH-06`, `RG-GEN-02` |
| P-18, P-19, P-20, P-166 | Les notifications sont composées dans la langue **du compte**, jamais dans celle de la session : sous interface anglaise, le panneau rend six libellés français que `libelles.ts` sait pourtant traduire | `RG-GEN-08`, `EX-NTF-01`, `RG-NTF-01` |
| P-19 | Aucune notification « Tâche en retard » n'atteint son destinataire hors du traitement planifié de 7 h : le littéral est inatteignable dans une session | `EX-NTF-03`, `RG-NTF-01` |
| P-40 | L'explication de lecture seule d'une cellule d'autrui vit dans un `title` sur un `<span>` sans `tabindex` : la souris la donne, le clavier jamais | `RG-GEN-06`, `EX-PLN-09` |
| P-44 | Le refus des dates inversées n'est prononcé qu'après l'aller-retour : `422` en console, message juste, rien de créé — mais la fenêtre de modification, elle, refuse sans requête | `RG-GEN-03` |
| P-53 | Les documents du **second jeu d'illustration** n'ont aucun octet en magasin : `jeu2.mjs` écrit une empreinte sans appeler `ecrireContenu`. Le téléchargement est sain — vérifié sur une pièce déposée à l'instant — mais intestable sur les pièces semées | `EX-DOC-02`, `RG-DOC-02` |
| P-58 | Un import ne périme pas la fiche du projet — il faut recharger pour lire le nouveau compte — et `progress` manque au « Format attendu » alors que le serveur l'accepte | `RG-PRJ-11`, `RG-IMP-01` |
| P-62 | Le message rendu au dépôt d'une tâche multi-assignée ne renvoie pas vers la fiche : le catalogue porte la phrase, c'est l'autre variante qui s'affiche | `RG-TSK-11`, `EX-PLN-10` |
| P-66 | L'arrêt d'une récurrence est proposé — et désormais **exécuté** — depuis une occurrence qui n'est pas l'événement porteur. La correction a rendu le geste opérant au lieu de le retirer | `RG-EVT-03` |
| P-82, P-83 | Le refus d'un suivi hors périmètre est générique ; le message nommé n'existe dans aucun catalogue | `RG-GEN-03`, `RG-GEN-06` |
| P-135 | Une tâche prédéfinie **désactivée** conserve ses sept commandes « Ajouter des agents » : la fenêtre s'ouvre avec les trente agents, et l'écriture n'est refusée qu'au serveur, par un `409` | `RG-ACT-05`, `RG-GEN-06` |
| P-137 | Le motif de refus de la suppression d'une direction peuplée est porté par un `title` sur un `<span>` dans un `<button disabled>` : ni survol, ni focus, donc jamais lu | `RG-GEN-06` |
| P-148 | Sous session anglaise, le surtitre du tableau de bord rend « LUNDI 7 SEPTEMBRE 2026 », le calendrier de télétravail « Septembre 2026 », et les en-têtes de journée « THU SEPTEMBRE » | `RG-GEN-08`, `RG-GEN-09` |
| P-150, P-151 | La feuille de route affiche « TÂCHES 9 · toutes rattachées » au-dessus d'un bloc « Tâches sans jalon » qui en compte 1 ; et le même projet vaut 42 % en vue 11, 46 % en vue 30 — la seconde compte la tâche confidentielle que la première cache | `RG-JAL-05`, `RG-SCOPE-04`, `RG-PRJ-07` |
| P-155, P-64 | Le mode « Activité » est offert à qui n'a pas `predefined_tasks:read` : le clic rend « Permission requise » et un `403` en console à chaque visite | `RG-GEN-06` |

---

## 3. Les tâches correctives

Le détail est dans `recette/09-taches-correctives.md`. En résumé : **soixante défauts
corrigés**, en deux vagues de correcteurs à périmètres de fichiers disjoints, puis une
passe de raccords. Aucun correcteur n'a pu construire le lot ni jouer un parcours : la
preuve d'une correction est la **seconde passe**, pas le test que son auteur écrit.

Les quatre plus graves, tous invisibles à toutes les boucles existantes :

1. **Le périmètre d'un manager était global.** `PERMISSIONS_GESTION_GLOBALE` listait les
   six `manage_any` du catalogue — or `manage_any` dit « des objets dont je ne suis pas
   propriétaire », c'est `readAll` qui dit « au-delà de mon périmètre ». Sept modèles de
   rôles avaient la vue d'instance sans qu'aucune règle ne la leur donne : un manager
   déclarait un congé pour n'importe qui, lisait le suivi individuel de n'importe qui, et
   voyait les rapports de toute la collectivité.
2. **Treize points d'entrée de tâches** adressés par identifiant n'appliquaient aucun
   périmètre. `confidentielle` étant modifiable, une requête forgée pouvait **démasquer**
   une tâche secrète. Un audit à l'œil en avait trouvé un.
3. **L'import écrivait le mot de passe du CSV en clair** dans la colonne du haché — le
   fichier devenait la table des secrets, et aucun compte créé ne pouvait se connecter.
4. **Onze vues prononçaient leur refus avant tout appel**, si bien que le serveur — seul
   endroit du produit qui trace un refus — ne l'apprenait jamais. Le test qui l'affirmait
   s'appelait « et ce refus est lui-même tracé ».

**Vingt-sept contrôles de bout en bout étaient rouges après les corrections**, et huit
d'entre eux étaient des **faux témoins** : ils passaient avec comme sans le comportement
qu'ils prétendaient garantir. Ils visent désormais leur sujet.

**Deux régressions de la vague corrective** ont été trouvées et fermées avant la seconde
passe : le sélecteur de mode du planning marquait deux segments courants (`Link` apparie
par préfixe, `/planning` étant préfixe de `/planning/mois`), et un `403` sur
`/parametrage` bouclait — **sept cent quarante-sept appels en deux secondes et demie** —
parce qu'une requête en échec est relancée au montage de tout nouvel observateur et que
la coquille démonte l'`Outlet` tant qu'elle est en attente. Pour qui n'a pas
`settings:read`, l'application ne finissait jamais de charger.

**Une seule régression a survécu à la seconde passe** : `P-20`. Elle n'est pas un défaut
nouveau — la première passe tenait les titres de notification pour intraduisibles par
construction et les jugeait donc en français ; la correction a créé le catalogue anglais
que le produit n'applique pas encore. Le rouge est le progrès rendu visible.

---

## 4. Les artefacts amendés

| Artefact | Avant | Après | Motif |
| --- | --- | --- | --- |
| `design/carte-de-navigation.md` | inexistant | 278 lignes, 35 nœuds, 101 arêtes | L'étape la suppose ; l'étape 3 ne l'a pas produite. Dérivée en contexte neuf des seuls `cadrage/01` et `cadrage/02`. |
| `recette/09-parcours.json` | v1, 143 parcours | v2, 171 parcours | § 7 — vingt-huit parcours issus de la vague d'exploration, dédoublonnés. |
| `recette/jeu2.mjs` | v1 | v2 | Cinq défauts **du jeu** : congés sans répartition annuelle (donc aucun solde ne bougeait), notifications sans lien, deux codes d'action étrangers au serveur, un férié non récurrent semé sur deux années, aucun type de congé système. |
| `apps/web/src/locales/{fr,en}/acces.json`, `auth.json`, `projets.json` | — | — | Le catalogue **livré** portait les identités du premier jeu d'illustration. Donnée ou libellé, on ne pouvait plus le dire à l'écran — et c'est la question que la recette pose. |
| `scripts/inoperant-check.mjs` | — | suit les imports frères | Un schéma extrait dans un fichier voisin rendait le contrôle aveugle à un champ sensible, sans que rien ne le dise. |
| `apps/api/src/commun/surface-http.test.ts` | — | suit les constantes de chemin | Trois appels comptés « illisibles » le jour où leur littéral a été extrait en constante partagée. |

Ces deux derniers amendements relèvent de la même doctrine, déjà consignée : **un
contrôle qui cesse de voir doit le dire, jamais s'apaiser.**

---

## 5. Les manques de couverture

Les quatre règles du § 2 ont été vérifiées **avant toute exécution**, par
`node recette/harnais/couverture.mjs`. Aucune seconde passe de dérivation n'a été
nécessaire.

| Règle | Résultat |
| --- | --- |
| Chaque persona du § 3.1 a au moins un parcours | **6 / 6** |
| Chaque persona a son parcours négatif | **6 / 6** — 24 parcours négatifs |
| Chaque `EX-…` à incidence d'interface est couverte | **183 / 184** |
| Chaque arête de la carte est empruntée | **100 / 101** |

Les deux manques, consignés avec leur motif par le dérivateur lui-même :

- **`A-43`** — le fil d'Ariane de l'en-tête vers « la vue parente ». Le cadrage énonce
  l'élément mais **ne définit la vue parente d'aucune vue** : aucun parcours ne peut
  nommer sa destination, donc aucun verdict mécanique ne peut trancher. Chemin non
  spécifié, pas chemin mort.
- **`EX-NTF-04`** — « recevoir les notifications critiques par courriel ». Le fait
  observable est un message dans une boîte aux lettres, hors des trente-cinq vues. Se
  recette hors interface.

---

## 6. La vague d'exploration — les limites

Six explorateurs, un par persona, une heure de travail chacun, sans parcours. **Cette
vague n'a bloqué aucun lot** : son verdict n'est pas mécanique. Trente-six trouvailles,
dont vingt-huit se sont formulées en parcours et sont devenues bloquantes — elles ont
été jouées à la seconde passe, quinze vertes et treize rouges.

Huit ne se formulent pas en parcours, et sont consignées ici comme limites. Elles ont un
trait commun : **elles demandent toutes une décision que le cadrage n'a pas prise.**

1. **La recherche globale n'a pas de destination spécifiée.** Trois explorateurs l'ont
   relevée indépendamment. Le champ est offert sur les trente-cinq vues, il accepte la
   frappe, et rien ne se produit. `cadrage/02 § B` l'énonce, `cadrage/03` en choisit même
   la technologie — mais rien ne dit **ce qu'elle indexe**, ni **comment le périmètre s'y
   applique** (une recherche globale est le contournement le plus naturel de
   `RG-SCOPE-02/04`), ni **ce qu'elle rend**. Le parcours a fini par être écrit avec
   l'issue la plus faible qui soit observable — « un résultat, ou un message » — et il
   est rouge. **La retirer est une réponse aussi légitime que l'implémenter**, et moins
   coûteuse qu'un champ qui ment sur trente-cinq écrans.
2. **« La charge par service »**, troisième attente de la persona direction
   (`cadrage/01 § 3.1`), n'existe nulle part et **n'est reprise par aucune `EX-…`** : le
   brief de conception a tronqué l'attente à « la santé du portefeuille en une page ».
   `EX-RPT-05` dit « par collaborateur ». Pour une direction, vingt noms ne remplacent pas
   six services. Se formulera en parcours dès que le cadrage aura dit ce qu'est une charge
   de service — nombre de tâches, heures déclarées, ou écart au budget.
3. **La couche « Activités » du planning s'appelle « Recurring » en anglais**, et pilote
   les **permanences**. Un anglophone qui la décoche pour masquer ses réunions récurrentes
   efface le tableau des astreintes. La règle de verdict juge l'anglais à l'équivalent
   **du catalogue** : ici c'est le catalogue qui est faux, donc tout parcours mécanique le
   confirmerait conforme. **La recette ne peut pas voir une traduction fausse, seulement
   une traduction manquante.**
4. **Le nom de l'organisation n'est paramétrable nulle part.** La page que tous les agents
   voient chaque matin porte une collectivité fictive en dur. Deux issues possibles — un
   réglage d'identité, ou un panneau qui n'affirme aucune organisation — et aucune n'est
   arbitrable ici.
5. **La rémanence des filtres n'est énoncée par aucune `EX-…` ni `RG-…`.** Le cadrage doit
   d'abord dire si un filtre de vue est un état de session ou un état d'adresse. Un
   parcours écrit avant cette décision invente l'exigence.
6. **Le format des dates sous interface anglaise.** `RG-GEN-09` dit que les formats suivent
   le paramétrage global ; le produit est bilingue. Les deux lectures possibles sont
   écrites dans `apps/web/src/formats.ts`, et le code fige la première **en le disant**.
   Les nombres, eux, ont été tranchés : ils suivent la session, parce qu'un séparateur
   décimal qui change d'une vue à l'autre dans la même session n'est défendable par aucune
   lecture.
7. **La frontière entre « courtoisie sur un panneau » et « lecture qui garde la vue »**
   n'est écrite nulle part, et c'est elle qui a produit le défaut `RG-ADM-03` : onze vues
   court-circuitaient leur appel, quatre panneaux le font légitimement.
8. **Le week-end et les jours fériés dans la présence du jour.** `RG-TLT-02` pose trois
   états et ne distingue le week-end que pour le **calendrier de la vue 20**. L'énumération
   des états de présence n'existe que dans le code — trois fichiers la répètent.

---

## 7. Les défauts candidats au journal des défauts

Sept familles, chacune avec le prompt du cycle qui devrait la porter.

| Famille | Ce que la recette a mesuré | Prompt à amender |
| --- | --- | --- |
| **Une boucle qui ne parle à personne** | Vingt-trois suites de bout en bout interceptaient `/api` et servaient leurs propres jeux d'essai. Le produit n'avait **jamais** été joué contre son propre serveur. Deuxième occurrence de « une forme de réponse inventée côté client se fait valider par son propre jeu d'essai », cette fois à l'échelle d'une suite entière. | `05-socle-technique` — le harnais de bout en bout doit dire lequel de ses contrôles parle au serveur réel, et pourquoi les autres ne le font pas. |
| **Le second jeu d'illustration n'existait pas** | Le cycle prescrit d'éprouver chaque état avec un second jeu ; le dépôt n'en avait qu'un, et le catalogue **livré** en portait les identités. On ne pouvait pas distinguer une donnée d'un libellé à l'écran. | `04-generation-maquettes` — le second jeu se produit avec le premier, et le premier ne descend jamais dans les catalogues de traduction. |
| **La carte de navigation manquait** | Artefact supposé par l'étape 9, jamais produit par l'étape 3. Sans elle, aucune arête n'est vérifiable, et l'atteignabilité d'une vue se démontre à l'œil. | `03-inventaire-et-briefs` — la carte est une sortie, pas une annexe. |
| **Le catalogue de rôles n'est confronté à rien** | Onze parcours rouges par contradiction entre `§ 3.1` et `§ 3.2` du même document. Aucun contrôle ne compare une persona à son modèle de rôle : la description d'un modèle est une affirmation que rien ne vérifie. | `02-cahier-des-charges` — chaque persona nomme les exigences qu'elle porte, et le modèle de rôle qui les lui donne. |
| **Une correction fait ce qu'on lui demande, pas ce qu'on veut** | Retirer `enabled: peut(…)` pour que le serveur trace le refus a laissé un `403` en console à chaque visite et une commande offerte qui 403. Rendre l'arrêt de récurrence opérant depuis une occurrence enfant a levé la contradiction d'écran **et** enfreint la règle. | `06-plan-de-realisation` — une tâche corrective nomme ce qu'elle ne doit pas casser. |
| **Un contrôle qui cesse de voir ne le dit pas** | Un schéma extrait dans un fichier voisin a rendu `inoperant:check` aveugle à un champ sensible ; un littéral extrait en constante a fait compter trois appels clients « illisibles ». Dans les deux cas le contrôle est **passé au vert en mesurant moins**. Quatrième occurrence de la famille. | `07-controles-de-coherence` — tout contrôle affirme la taille de ce qu'il a mesuré, et échoue si elle diminue. |
| **Le budget de deux passes ne dit pas ce qu'on fait des parcours faux** | Trois parcours sont devenus injouables — l'un exige un état qu'une règle interdit, l'autre un libellé corrigé entre-temps, le troisième un texte que sa persona n'a pas le droit de voir. Les amender aurait été interdit ; les rapporter non livrés fait porter au produit un défaut du parcours. | Le prompt de cette étape — un parcours **contradictoire avec le cadrage** n'est pas un parcours que le produit échoue ; c'est une troisième issue, à nommer. |

---

## 8. Ce qui a été corrigé après la seconde passe, et n'a donc pas de preuve

Le budget de deux passes est épuisé. Quatre défauts relevés **par la seconde passe** ont
néanmoins été corrigés, parce qu'ils sont des effets de la vague corrective elle-même :
le produit était moins bon qu'avant sur ces points, ou la correction s'était arrêtée à
mi-chemin.

Ils sont tenus par des contrôles écrits et par les suites existantes — `pnpm verif`, les
527 contrôles de bout en bout, les 183 contrôles d'accessibilité. **Ils n'ont pas été
rejoués en parcours** : `P-18`, `P-19`, `P-20`, `P-64`, `P-116`, `P-155`, `P-165` et
`P-166` restent donc rapportés **non livrés** au § 2, quoi qu'en dise le code.

*C'est la lecture stricte, et c'est la bonne : une correction dont le parcours n'a pas
été rejoué n'a pas de preuve.*

---

## 9. Un contrôle de sortie qui n'est pas tenu, et il faut le dire

L'étape exige que **les valeurs distinctives des deux jeux et le mécanisme de recette
n'apparaissent pas dans les sources livrées**. Relevé :

| Objet | Verdict |
| --- | --- |
| Le mécanisme de recette (`ouvrirSous`, `remettreAZero`, la base modèle, le mot de passe des comptes de persona) | **absent** de `apps/**/src` et de `packages/**/src` |
| Les valeurs du **second** jeu (Valmorin, Léa Vasseur, Solène Pichon…) | **absentes** des sources livrées |
| Les valeurs du **premier** jeu (Ville de Roqueville, Camille Durand, « Refonte du portail citoyen ») | **présentes dans `packages/db/src/maquette.ts`**, qui est compilé dans `@rationarium/db` |

Ce dernier point est antérieur à cette étape : `maquette.ts` est le jeu que la boucle de
conformité de rendu mesure, et il a été posé là pour cette raison. Il n'en reste pas
moins qu'**un jeu d'illustration voyage dans un paquet livré**, et c'est exactement le
brouillage que la règle vise. Deux issues, toutes deux hors du mandat de cette recette :
le sortir dans un paquet de développement, ou déclarer explicitement que
`@rationarium/db` embarque ses jeux de mesure.

Ce qui **a** été corrigé au titre de cette règle : le catalogue de traduction livré
portait les identités du premier jeu dans le panneau des vues d'accès et dans trois
exemples de saisie. Donnée ou libellé, on ne pouvait plus le dire à l'écran — et c'est la
question que la recette pose.

---

## Annexe — le détail parcours par parcours

| Parcours | Persona | Type | fr | en | Trace |
| --- | --- | --- | --- | --- | --- |
| P-01 | Camille | nominal | vert | vert | `recette/preuves/P-01/Camille/` |
| P-02 | Camille | limite | vert | vert | `recette/preuves/P-02/Camille/` |
| P-03 | Camille | negatif | vert | vert | `recette/preuves/P-03/Camille/` |
| P-04 | Camille | nominal | vert | vert | `recette/preuves/P-04/Camille/` |
| P-05 | Camille | nominal | vert | vert | `recette/preuves/P-05/Camille/` |
| P-06 | Camille | limite | vert | vert | `recette/preuves/P-06/Camille/` |
| P-07 | Camille | nominal | **rouge** | **rouge** | `recette/preuves/P-07/Camille/` |
| P-08 | Camille | nominal | vert | vert | `recette/preuves/P-08/Camille/` |
| P-09 | Camille | negatif | vert | vert | `recette/preuves/P-09/Camille/` |
| P-10 | Camille | nominal | vert | vert | `recette/preuves/P-10/Camille/` |
| P-11 | Camille | nominal | vert | vert | `recette/preuves/P-11/Camille/` |
| P-12 | Camille | limite | vert | vert | `recette/preuves/P-12/Camille/` |
| P-13 | Camille | nominal | **rouge** | **rouge** | `recette/preuves/P-13/Camille/` |
| P-14 | Camille | limite | **rouge** | **rouge** | `recette/preuves/P-14/Camille/` |
| P-15 | Camille | nominal | vert | vert | `recette/preuves/P-15/Camille/` |
| P-16 | Camille | limite | vert | vert | `recette/preuves/P-16/Camille/` |
| P-17 | Camille | nominal | vert | vert | `recette/preuves/P-17/Camille/` |
| P-18 | Camille | nominal | vert | **rouge** | `recette/preuves/P-18/Camille/` |
| P-19 | Camille | nominal | **rouge** | **rouge** | `recette/preuves/P-19/Camille/` |
| P-20 | Camille | nominal | vert | **rouge** | `recette/preuves/P-20/Camille/` |
| P-21 | Camille | nominal | vert | vert | `recette/preuves/P-21/Camille/` |
| P-22 | Camille | negatif | vert | vert | `recette/preuves/P-22/Camille/` |
| P-23 | Camille | negatif | vert | vert | `recette/preuves/P-23/Camille/` |
| P-24 | Camille | negatif | vert | vert | `recette/preuves/P-24/Camille/` |
| P-25 | Camille | nominal | vert | vert | `recette/preuves/P-25/Camille/` |
| P-26 | Camille | limite | **rouge** | **rouge** | `recette/preuves/P-26/Camille/` |
| P-27 | Camille | limite | vert | vert | `recette/preuves/P-27/Camille/` |
| P-28 | Camille | nominal | vert | vert | `recette/preuves/P-28/Camille/` |
| P-29 | Camille | negatif | vert | vert | `recette/preuves/P-29/Camille/` |
| P-30 | Camille | nominal | vert | vert | `recette/preuves/P-30/Camille/` |
| P-31 | Camille | nominal | **rouge** | **rouge** | `recette/preuves/P-31/Camille/` |
| P-32 | Camille | negatif | vert | vert | `recette/preuves/P-32/Camille/` |
| P-33 | Camille | nominal | vert | vert | `recette/preuves/P-33/Camille/` |
| P-34 | Camille | limite | vert | vert | `recette/preuves/P-34/Camille/` |
| P-35 | Camille | nominal | vert | vert | `recette/preuves/P-35/Camille/` |
| P-36 | Camille | nominal | vert | vert | `recette/preuves/P-36/Camille/` |
| P-37 | Camille | limite | vert | vert | `recette/preuves/P-37/Camille/` |
| P-38 | Camille | negatif | vert | vert | `recette/preuves/P-38/Camille/` |
| P-39 | Camille | nominal | vert | vert | `recette/preuves/P-39/Camille/` |
| P-40 | Camille | negatif | **rouge** | **rouge** | `recette/preuves/P-40/Camille/` |
| P-41 | Camille | negatif | **rouge** | **rouge** | `recette/preuves/P-41/Camille/` |
| P-42 | Driss | nominal | vert | vert | `recette/preuves/P-42/Driss/` |
| P-43 | Driss | nominal | **rouge** | **rouge** | `recette/preuves/P-43/Driss/` |
| P-44 | Driss | limite | **rouge** | **rouge** | `recette/preuves/P-44/Driss/` |
| P-45 | Driss | nominal | vert | vert | `recette/preuves/P-45/Driss/` |
| P-46 | Driss | limite | vert | vert | `recette/preuves/P-46/Driss/` |
| P-47 | Driss | nominal | vert | vert | `recette/preuves/P-47/Driss/` |
| P-48 | Driss | nominal | vert | vert | `recette/preuves/P-48/Driss/` |
| P-49 | Driss | nominal | **rouge** | **rouge** | `recette/preuves/P-49/Driss/` |
| P-50 | Driss | limite | vert | vert | `recette/preuves/P-50/Driss/` |
| P-51 | Driss | limite | vert | vert | `recette/preuves/P-51/Driss/` |
| P-52 | Driss | nominal | **rouge** | **rouge** | `recette/preuves/P-52/Driss/` |
| P-53 | Driss | nominal | **rouge** | **rouge** | `recette/preuves/P-53/Driss/` |
| P-54 | Driss | nominal | vert | vert | `recette/preuves/P-54/Driss/` |
| P-55 | Driss | limite | vert | vert | `recette/preuves/P-55/Driss/` |
| P-56 | Driss | nominal | vert | vert | `recette/preuves/P-56/Driss/` |
| P-57 | Driss | nominal | vert | vert | `recette/preuves/P-57/Driss/` |
| P-58 | Driss | nominal | **rouge** | **rouge** | `recette/preuves/P-58/Driss/` |
| P-59 | Driss | limite | vert | vert | `recette/preuves/P-59/Driss/` |
| P-60 | Driss | limite | vert | vert | `recette/preuves/P-60/Driss/` |
| P-61 | Driss | nominal | vert | vert | `recette/preuves/P-61/Driss/` |
| P-62 | Driss | limite | **rouge** | **rouge** | `recette/preuves/P-62/Driss/` |
| P-63 | Driss | limite | **rouge** | **rouge** | `recette/preuves/P-63/Driss/` |
| P-64 | Driss | nominal | **rouge** | **rouge** | `recette/preuves/P-64/Driss/` |
| P-65 | Driss | nominal | **rouge** | **rouge** | `recette/preuves/P-65/Driss/` |
| P-66 | Driss | limite | **rouge** | **rouge** | `recette/preuves/P-66/Driss/` |
| P-67 | Driss | nominal | vert | vert | `recette/preuves/P-67/Driss/` |
| P-68 | Driss | limite | vert | vert | `recette/preuves/P-68/Driss/` |
| P-69 | Driss | nominal | **rouge** | **rouge** | `recette/preuves/P-69/Driss/` |
| P-70 | Driss | limite | **rouge** | **rouge** | `recette/preuves/P-70/Driss/` |
| P-71 | Driss | nominal | **rouge** | **rouge** | `recette/preuves/P-71/Driss/` |
| P-72 | Driss | negatif | **rouge** | **rouge** | `recette/preuves/P-72/Driss/` |
| P-73 | Driss | negatif | vert | vert | `recette/preuves/P-73/Driss/` |
| P-74 | Fatou | nominal | vert | vert | `recette/preuves/P-74/Fatou/` |
| P-75 | Fatou | limite | vert | vert | `recette/preuves/P-75/Fatou/` |
| P-76 | Fatou | nominal | vert | vert | `recette/preuves/P-76/Fatou/` |
| P-77 | Fatou | nominal | vert | vert | `recette/preuves/P-77/Fatou/` |
| P-78 | Fatou | nominal | **rouge** | **rouge** | `recette/preuves/P-78/Fatou/` |
| P-79 | Fatou | negatif | vert | vert | `recette/preuves/P-79/Fatou/` |
| P-80 | Fatou | nominal | **rouge** | **rouge** | `recette/preuves/P-80/Fatou/` |
| P-81 | Fatou | negatif | vert | vert | `recette/preuves/P-81/Fatou/` |
| P-82 | Fatou | nominal | **rouge** | **rouge** | `recette/preuves/P-82/Fatou/` |
| P-83 | Fatou | negatif | **rouge** | **rouge** | `recette/preuves/P-83/Fatou/` |
| P-84 | Fatou | nominal | **rouge** | **rouge** | `recette/preuves/P-84/Fatou/` |
| P-85 | Fatou | nominal | **rouge** | **rouge** | `recette/preuves/P-85/Fatou/` |
| P-86 | Fatou | limite | vert | vert | `recette/preuves/P-86/Fatou/` |
| P-87 | Fatou | nominal | vert | vert | `recette/preuves/P-87/Fatou/` |
| P-88 | Fatou | nominal | **rouge** | **rouge** | `recette/preuves/P-88/Fatou/` |
| P-89 | Fatou | limite | vert | vert | `recette/preuves/P-89/Fatou/` |
| P-90 | Fatou | nominal | **rouge** | **rouge** | `recette/preuves/P-90/Fatou/` |
| P-91 | Fatou | negatif | vert | vert | `recette/preuves/P-91/Fatou/` |
| P-92 | Hugo | nominal | vert | vert | `recette/preuves/P-92/Hugo/` |
| P-93 | Hugo | limite | vert | vert | `recette/preuves/P-93/Hugo/` |
| P-94 | Hugo | nominal | vert | vert | `recette/preuves/P-94/Hugo/` |
| P-95 | Hugo | nominal | vert | vert | `recette/preuves/P-95/Hugo/` |
| P-96 | Hugo | nominal | vert | vert | `recette/preuves/P-96/Hugo/` |
| P-97 | Hugo | limite | vert | vert | `recette/preuves/P-97/Hugo/` |
| P-98 | Hugo | nominal | vert | vert | `recette/preuves/P-98/Hugo/` |
| P-99 | Hugo | limite | vert | vert | `recette/preuves/P-99/Hugo/` |
| P-100 | Hugo | nominal | **rouge** | **rouge** | `recette/preuves/P-100/Hugo/` |
| P-101 | Hugo | nominal | **rouge** | **rouge** | `recette/preuves/P-101/Hugo/` |
| P-102 | Hugo | limite | vert | vert | `recette/preuves/P-102/Hugo/` |
| P-103 | Hugo | nominal | vert | vert | `recette/preuves/P-103/Hugo/` |
| P-104 | Hugo | nominal | vert | vert | `recette/preuves/P-104/Hugo/` |
| P-105 | Hugo | nominal | **rouge** | **rouge** | `recette/preuves/P-105/Hugo/` |
| P-106 | Hugo | nominal | **rouge** | **rouge** | `recette/preuves/P-106/Hugo/` |
| P-107 | Hugo | nominal | **rouge** | **rouge** | `recette/preuves/P-107/Hugo/` |
| P-108 | Hugo | limite | **rouge** | **rouge** | `recette/preuves/P-108/Hugo/` |
| P-109 | Hugo | negatif | vert | vert | `recette/preuves/P-109/Hugo/` |
| P-110 | Inès | nominal | vert | vert | `recette/preuves/P-110/Inès/` |
| P-111 | Inès | nominal | vert | vert | `recette/preuves/P-111/Inès/` |
| P-112 | Inès | nominal | **rouge** | **rouge** | `recette/preuves/P-112/Inès/` |
| P-113 | Inès | nominal | **rouge** | **rouge** | `recette/preuves/P-113/Inès/` |
| P-114 | Inès | nominal | vert | vert | `recette/preuves/P-114/Inès/` |
| P-115 | Inès | limite | vert | vert | `recette/preuves/P-115/Inès/` |
| P-116 | Inès | negatif | **rouge** | **rouge** | `recette/preuves/P-116/Inès/` |
| P-117 | Inès | negatif | **rouge** | **rouge** | `recette/preuves/P-117/Inès/` |
| P-118 | Karim | nominal | vert | vert | `recette/preuves/P-118/Karim/` |
| P-119 | Karim | limite | **rouge** | **rouge** | `recette/preuves/P-119/Karim/` |
| P-120 | Karim | nominal | **rouge** | **rouge** | `recette/preuves/P-120/Karim/` |
| P-121 | Karim | nominal | **rouge** | **rouge** | `recette/preuves/P-121/Karim/` |
| P-122 | Karim | negatif | **rouge** | **rouge** | `recette/preuves/P-122/Karim/` |
| P-123 | Karim | limite | **rouge** | **rouge** | `recette/preuves/P-123/Karim/` |
| P-124 | Karim | nominal | **rouge** | **rouge** | `recette/preuves/P-124/Karim/` |
| P-125 | Karim | negatif | vert | vert | `recette/preuves/P-125/Karim/` |
| P-126 | Karim | nominal | vert | vert | `recette/preuves/P-126/Karim/` |
| P-127 | Karim | negatif | vert | vert | `recette/preuves/P-127/Karim/` |
| P-128 | Karim | nominal | **rouge** | **rouge** | `recette/preuves/P-128/Karim/` |
| P-129 | Karim | nominal | vert | vert | `recette/preuves/P-129/Karim/` |
| P-130 | Karim | negatif | vert | vert | `recette/preuves/P-130/Karim/` |
| P-131 | Karim | nominal | vert | vert | `recette/preuves/P-131/Karim/` |
| P-132 | Karim | limite | vert | vert | `recette/preuves/P-132/Karim/` |
| P-133 | Karim | nominal | vert | vert | `recette/preuves/P-133/Karim/` |
| P-134 | Karim | nominal | **rouge** | **rouge** | `recette/preuves/P-134/Karim/` |
| P-135 | Karim | limite | **rouge** | **rouge** | `recette/preuves/P-135/Karim/` |
| P-136 | Karim | nominal | vert | vert | `recette/preuves/P-136/Karim/` |
| P-137 | Karim | limite | **rouge** | **rouge** | `recette/preuves/P-137/Karim/` |
| P-138 | Karim | nominal | vert | vert | `recette/preuves/P-138/Karim/` |
| P-139 | Karim | nominal | **rouge** | **rouge** | `recette/preuves/P-139/Karim/` |
| P-140 | Karim | nominal | vert | vert | `recette/preuves/P-140/Karim/` |
| P-141 | Karim | nominal | vert | vert | `recette/preuves/P-141/Karim/` |
| P-142 | Karim | nominal | vert | vert | `recette/preuves/P-142/Karim/` |
| P-143 | Karim | limite | vert | vert | `recette/preuves/P-143/Karim/` |
| P-144 | Camille | nominal | **rouge** | **rouge** | `recette/preuves/P-144/Camille/` |
| P-145 | Camille | nominal | vert | vert | `recette/preuves/P-145/Camille/` |
| P-146 | Camille | nominal | vert | vert | `recette/preuves/P-146/Camille/` |
| P-147 | Camille | nominal | **rouge** | **rouge** | `recette/preuves/P-147/Camille/` |
| P-148 | Camille | nominal | vert | **rouge** | `recette/preuves/P-148/Camille/` |
| P-149 | Driss | negatif | vert | vert | `recette/preuves/P-149/Driss/` |
| P-150 | Driss | nominal | **rouge** | **rouge** | `recette/preuves/P-150/Driss/` |
| P-151 | Driss | nominal | **rouge** | **rouge** | `recette/preuves/P-151/Driss/` |
| P-152 | Driss | nominal | vert | vert | `recette/preuves/P-152/Driss/` |
| P-153 | Driss | limite | vert | vert | `recette/preuves/P-153/Driss/` |
| P-154 | Driss | nominal | vert | vert | `recette/preuves/P-154/Driss/` |
| P-155 | Driss | nominal | **rouge** | **rouge** | `recette/preuves/P-155/Driss/` |
| P-156 | Fatou | nominal | vert | vert | `recette/preuves/P-156/Fatou/` |
| P-157 | Fatou | nominal | vert | vert | `recette/preuves/P-157/Fatou/` |
| P-158 | Fatou | nominal | **rouge** | **rouge** | `recette/preuves/P-158/Fatou/` |
| P-159 | Fatou | nominal | **rouge** | **rouge** | `recette/preuves/P-159/Fatou/` |
| P-160 | Hugo | limite | vert | vert | `recette/preuves/P-160/Hugo/` |
| P-161 | Hugo | nominal | vert | vert | `recette/preuves/P-161/Hugo/` |
| P-162 | Hugo | nominal | vert | vert | `recette/preuves/P-162/Hugo/` |
| P-163 | Hugo | nominal | vert | vert | `recette/preuves/P-163/Hugo/` |
| P-164 | Inès | limite | **rouge** | **rouge** | `recette/preuves/P-164/Inès/` |
| P-165 | Inès | nominal | **rouge** | **rouge** | `recette/preuves/P-165/Inès/` |
| P-166 | Inès | nominal | vert | **rouge** | `recette/preuves/P-166/Inès/` |
| P-167 | Inès | nominal | vert | vert | `recette/preuves/P-167/Inès/` |
| P-168 | Karim | nominal | vert | vert | `recette/preuves/P-168/Karim/` |
| P-169 | Karim | nominal | vert | vert | `recette/preuves/P-169/Karim/` |
| P-170 | Karim | nominal | **rouge** | **rouge** | `recette/preuves/P-170/Karim/` |
| P-171 | Karim | nominal | vert | **rouge** | `recette/preuves/P-171/Karim/` |
