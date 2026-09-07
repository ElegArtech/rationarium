# Tâches correctives de la recette par persona

Ouvertes le 2026-09-07, à l'issue de la première passe : **143 parcours joués en
français et en anglais, 286 exécutions, 106 verts, 180 rouges, 90 parcours rouges.**

Chaque tâche porte les parcours qui l'ont trouvée, les `EX-…` et `RG-…` qu'elle met
en défaut, et le fichier où le défaut vit. La trace de chaque parcours en échec est
au dossier de preuves, sous `recette/preuves/<parcours>/<persona>/<langue>/`.

## Ce qui se corrige, et ce qui se rapporte

Les rouges se répartissent en deux natures, et la distinction commande la suite.

**Un défaut** est du code écrit qui fait autre chose que ce que la règle dit. Il se
corrige, et le parcours se rejoue. C'est le § 1 ci-dessous.

**Une absence** est une capacité que le cahier des charges exige et que personne n'a
construite. Elle ne se « corrige » pas : elle se construit, et construire n'est pas
l'objet d'une recette. Elle est **rapportée comme non livrée**, avec ses `EX-…` et
ses `RG-…`. C'est le § 2.

Cette ligne de partage est la seule appliquée. Elle ne tient pas compte de la
difficulté, et aucun rouge n'est excusé : ceux du § 2 sont des parcours **non
livrés**, pas des parcours tolérés.

---

# § 1 — Tâches correctives dispatchées

| Tâche | Objet | Parcours | Périmètre de fichiers |
| --- | --- | --- | --- |
| C-01 | Le premier jeu d'illustration vivait dans les sources livrées | (préparation) | `apps/web/src/locales/*/acces.json`, `auth.json`, `projets.json` |
| C-02 | Le périmètre d'un manager est global | P-79, P-83, P-84 | `apps/api/src/commun/perimetre.service.ts`, `packages/contracts/src/roles.ts` |
| C-03 | L'import écrit le mot de passe en clair dans le haché | P-98 | `apps/api/src/imports/imports.service.ts` |
| C-04 | La garde des imports ignore le type importé | P-96, P-97, P-98, P-99 | `apps/api/src/imports/imports.controller.ts` |
| C-05 | Trois écritures rendent 500 au lieu d'un refus | P-27, P-136 | `apps/api/src/conges/conges.controller.ts`, `organisation/*`, `activite/*` |
| C-06 | Une tâche sans assigné est invisible à son créateur | P-17 | `apps/api/src/commun/perimetre.service.ts` |
| C-07 | Un refus prononcé côté client seul n'est pas audité | P-91 | `apps/web/src/**` (garde de route), `apps/api/src/commun/permissions.garde.ts` |
| C-08 | Le refus chiffré perd ses chiffres en route | P-26, P-34, P-75 | `apps/web/src/api/erreurs.ts` |
| C-09 | Des commandes sont offertes à qui n'y a pas droit | P-24, P-32, P-40, P-81 | `apps/web/src/vues/taches/Fiche.tsx`, `occupations/Teletravail.tsx`, `occupations/Conges.tsx`, `planning/Semaine.tsx`, `administration/Parametres.tsx` |
| C-10 | Des vues demandent au serveur ce qu'il leur refusera | P-17, P-41, P-82 | `apps/web/src/vues/referentiels/Utilisateurs.tsx`, `taches/*`, `referentiels/Departements.tsx` |
| C-11 | Des ancres brutes rechargent l'application entière | P-18, P-74, P-82 | `apps/web/src/coquille/Notifications.tsx`, `vues/planning/Planning.tsx`, `vues/referentiels/Utilisateurs.tsx`, `routes/*` |
| C-12 | La vue 22 est morte pour qui n'administre pas la matrice | P-105, P-106, P-107, P-108 | `apps/web/src/vues/referentiels/Competences.tsx` |
| C-13 | Le changement de mot de passe imposé révoque sa propre session | P-07 | `apps/api/src/auth/auth.service.ts` |
| C-14 | Une session expirée laisse la vue à l'écran | P-12 | `apps/web/src/api/*`, `apps/web/src/coquille/*` |
| C-15 | « Détacher » rattache, et l'audit dit le contraire | P-142 | `apps/web/src/vues/referentiels/*`, `apps/web/src/api/referentiels.ts` |
| C-16 | La notification n'ouvre pas là où elle promet, et ne se marque pas lue | P-18, P-74 | `apps/web/src/coquille/Notifications.tsx`, `apps/api/src/notifications/*` |
| C-17 | Un congé masque tout le reste de la cellule de planning | P-39 | `apps/web/src/vues/planning/Semaine.tsx` |
| C-18 | Quatre listes de tâches ne mènent pas à la fiche | P-15, P-47, P-139, P-48 | `apps/web/src/vues/tableau/*`, `projets/OngletJalons.tsx`, `referentiels/*`, `taches/Fiche.tsx` |
| C-19 | L'arrêt d'une récurrence supprime le passé qu'il promet d'épargner | P-66 | `apps/api/src/evenements/*` |
| C-20 | Désactiver une tâche prédéfinie efface son passé de la grille | P-89, P-135 | `apps/api/src/activite/*` |
| C-21 | Le tableau de bord affirme « aucune heure déclarée » sans vérifier | P-35 | `apps/api/src/tableau/tableau.service.ts`, `apps/web/src/api/tableau.ts` |
| C-22 | La suppression d'un compte ne nomme pas le compte | P-123 | `apps/web/src/vues/referentiels/Utilisateurs.tsx` |
| C-23 | Le motif de refus n'est ni exigé, ni affiché | P-76 | `apps/web/src/vues/occupations/Conges.tsx` |
| C-24 | Un document téléchargé rend du JSON | P-53 | `apps/api/src/documents/*`, `apps/web/src/**` |
| C-25 | Les filtres de la vue 30 ne filtrent qu'un panneau | P-113, P-115 | `apps/web/src/vues/rapports/*`, `apps/api/src/rapports/*` |
| C-26 | Des messages du serveur restent français en session anglaise | P-14, P-97, P-98, P-123 | `apps/api/src/**` (clés), `apps/web/src/locales/*` |
| C-27 | Le retour au portefeuille perd le filtre appliqué | P-42 | `apps/web/src/vues/projets/Portefeuille.tsx` |
| C-28 | Deux gestes destructeurs s'exécutent sans confirmation | P-70, P-131 | `apps/web/src/vues/projets/*`, `administration/Parametres.tsx` |

---

# § 2 — Rapporté comme non livré

Ce que le cahier des charges exige et que le produit n'a pas. Chaque ligne est un
parcours **non livré**, avec ses exigences et ses règles.

| Parcours | Ce qui manque | Exigences et règles |
| --- | --- | --- |
| P-05, P-06 | La vue 04 ne vérifie l'état du jeton qu'à la soumission : il n'existe aucun point d'entrée de vérification. Et le lien de réinitialisation n'est envoyé nulle part — `POST /auth/forgot-password` jette le jeton en clair, aucun courriel n'est mis en file. | `EX-AUTH-05`, `EX-AUTH-06`, `RG-AUTH-04` |
| P-13 | La vue 35 n'a que deux onglets sur trois, et aucun contrôle d'avatar. | `EX-AUTH-09`, `RG-AUTH-09` |
| P-31 | Les jours fixes de télétravail ne sont offerts à aucun contributeur : la commande est gardée par `telework:manage_rules`, absente de son modèle de rôle. | `EX-TLT-04`, `EX-TLT-05`, `EX-TLT-06`, `RG-TLT-03`, `RG-TLT-04`, `RG-TLT-05` |
| P-43 | Un projet ne naît ni avec son chef, ni avec son sponsor, ni avec son département, et rien ne permet de les poser ensuite. | `EX-PRJ-03`, `EX-PRJ-04`, `RG-PRJ-01` |
| P-52 | Les quatre rôles RACI ne sont attribuables nulle part : le panneau ne porte que des retraits. | `EX-TSK-12`, `RG-TSK-12` |
| P-58, P-60 | L'import d'un projet ne périme pas la fiche, et la ligne saine d'un fichier partiellement fautif n'est pas importée. | `RG-IMP-04`, `RG-IMP-05` |
| P-61 | Créer depuis le planning n'existe pas : le « + » d'une cellule et le menu « Créer » sont des liens sans contexte. | `EX-PLN-11` |
| P-63, P-65 | Inviter un service entier est accepté par le serveur et offert par aucun écran. | `EX-TSK-06`, `EX-EVT-04` |
| P-64 | L'export ICS n'est ouvert à personne d'utile, l'import ICS n'a aucun client. | `EX-PLN-15` |
| P-69, P-70 | Un projet archivé ne se retrouve par aucun filtre ; la suppression définitive n'est offerte à aucun chef de projet. | `EX-PRJ-06`, `RG-PRJ-03`, `RG-PRJ-05` |
| P-71 | Un chef de projet ne peut pas rattacher le bénéficiaire de son propre projet. | `EX-PRJ-10`, `RG-PRJ-10` |
| P-78, P-80 | Déclarer un congé pour un collaborateur n'a aucune porte d'entrée ; un manager ne peut pas gérer ses délégations. | `EX-CNG-08`, `EX-CNG-11`, `EX-CNG-12`, `RG-CNG-12`, `RG-CNG-14` |
| P-85, P-104 | Aucune statistique de télétravail par agent n'est rendue nulle part. | `EX-TLT-08` |
| P-88 | La période d'une assignation d'activité n'est affichée nulle part, et l'ajout impose la journée entière. | `EX-ACT-02`, `RG-ACT-01` |
| P-90 | La vue 21 n'a ni filtre par utilisateur, ni déclaration pour un tiers. | `EX-TMP-02`, `EX-TMP-08`, `RG-TMP-04`, `RG-TMP-05` |
| P-92, P-93 | Le référentiel des types de congés est en lecture seule : ni création, ni modification. | `EX-CNG-13`, `RG-CNG-30` |
| P-100, P-101 | Les jours fériés et les vacances scolaires sont en lecture seule : ni import d'année, ni saisie. | `EX-PRM-04`, `EX-PRM-05`, `RG-PRM-03` |
| P-112 | La graduation partielle du Gantt portefeuille est tronquée aux échelles Jour et Semaine. | `EX-RPT-13` |
| P-113 | L'export Excel de la vue 30 n'existe pas. | `EX-RPT-03` |
| P-116, P-117 | Le catalogue de rôles donne à la direction l'écriture sur le portefeuille et la validation des congés. **Contradiction amont** : le § 3.1 la décrit en lecture, le § 3.2 lui donne d'écrire. | `RG-DROITS-03`, `EX-PRJ-08`, `RG-CNG-09` |
| P-119 à P-125 | La carte de navigation nomme l'action « Voir le suivi individuel » ; le produit la nomme « Suivi ». **Divergence de spécification** : l'écart est au libellé, pas au geste. | `EX-USR-10`, arête `A-80` |
| P-124 | Le mot de passe réinitialisé n'est communiqué à personne : ni affiché, ni envoyé. Le compte devient inaccessible. | `EX-USR-07`, `RG-AUTH-06` |
| P-128 | `EX-ADM-06` — l'initialisation du référentiel des rôles n'est exposée par aucune route ni aucune commande. | `EX-ADM-06` |
| P-134 | L'icône d'une tâche prédéfinie n'est saisissable nulle part. | `EX-ACT-01` |
| P-137 | Le rattachement d'un département à une direction ne se change nulle part, si bien que la fenêtre de refus qui le motive est inatteignable. | `EX-ORG-02`, `RG-ORG-01` |
| P-105 à P-108 | Le référentiel des compétences est ouvert en lecture au responsable RH, mais aucun de ses gestes de gestion ne lui est ouvert. **Contradiction amont** entre la persona et le catalogue de rôles. | `EX-CMP-01` à `EX-CMP-10` |
