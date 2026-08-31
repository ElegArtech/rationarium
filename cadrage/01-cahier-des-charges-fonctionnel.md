# Cahier des charges fonctionnel

**Plateforme de pilotage des projets et des ressources humaines**
Spécification fonctionnelle de référence — création d'un produit nouveau

---

## 0. Nature de ce document

Ce cahier des charges décrit **ce que le produit doit faire**, indépendamment de toute technologie.
Il constitue la référence fonctionnelle unique du projet : périmètre, acteurs, objets métier, exigences et règles de gestion. Toute demande ultérieure s'apprécie par rapport à lui.

Il ne contient volontairement **aucun choix technique** : pas de framework, pas de schéma de base, pas d'architecture. Ces décisions seront prises après validation du présent document.

**Comment le lire.** Les sections 1 à 4 posent le cadre (contexte, périmètre, acteurs, vocabulaire) et se lisent en continu. La section 5 détaille les exigences module par module et sert de base au chiffrage comme à la recette : chaque exigence `EX-…` est une capacité attendue, chaque règle `RG-…` une contrainte à respecter et à vérifier. Les sections 6 à 9 rassemblent ce qui s'applique à l'ensemble du produit et ce qui reste ouvert.

> **Statut.** Document soumis à validation. Les points listés en section 9 doivent être arbitrés par la maîtrise d'ouvrage avant lancement des travaux de conception.

---

## 1. Contexte et objectifs

### 1.1 Le besoin

Une collectivité territoriale (ou toute organisation structurée en directions / départements / services) doit piloter simultanément :

- un **portefeuille de projets** avec jalons, tâches, dépendances et budget en heures ;
- les **ressources humaines** qui les portent : disponibilité, congés, télétravail, compétences ;
- l'**activité récurrente** qui ne relève d'aucun projet (permanences, astreintes, réunions, tâches transverses) ;
- le **temps réellement passé**, pour objectiver la charge.

Ces quatre dimensions sont aujourd'hui gérées dans des outils séparés — ou pas gérées du tout. Personne ne peut répondre, à une date donnée, à la question : **« qui est disponible, sur quoi, et pour combien de temps ? »**

### 1.2 Le principe directeur

> **Une seule grille temporelle réconcilie tout ce qui occupe une personne.**

Congé, télétravail, tâche projet, tâche hors projet, permanence récurrente et événement sont des occupations de même nature du point de vue du planning. Le produit les affiche dans une vue unique, croisant **personnes × jours**.

C'est la fonction centrale du produit. Tout le reste l'alimente ou l'exploite.

### 1.3 Objectifs mesurables

| Objectif | Indicateur |
| --- | --- |
| Vision unifiée de la disponibilité | Le planning affiche, pour un service donné, l'occupation de chaque agent sur une semaine en une seule vue |
| Fluidifier le circuit des congés | Une demande atteint son validateur sans intervention manuelle ; le solde est contrôlé à la saisie |
| Objectiver la charge | Le temps déclaré est rapprochable des estimations projet |
| Piloter le portefeuille | Santé de chaque projet, jalons tenus, retards, calculés automatiquement |
| Gouvernance des accès | Les droits sont paramétrables sans intervention technique |

### 1.4 Contraintes structurantes

- **Fonctionnement en réseau fermé.** Le produit doit être exploitable sans accès Internet sortant. Aucune fonctionnalité essentielle ne dépend d'un service tiers en ligne.
- **Bilingue français / anglais**, français par défaut. Toute chaîne visible est traduisible.
- **Souveraineté des données.** Les données restent dans le système d'information de l'organisation.
- **Accessibilité.** Conformité RGAA visée : navigation clavier complète, contrastes, libellés d'assistance sur les vues denses.

---

## 2. Périmètre fonctionnel

### 2.1 Modules

| # | Module | Rôle |
| --- | --- | --- |
| M1 | Authentification & compte | Accès, session, mot de passe, profil |
| M2 | Structure organisationnelle | Directions, départements, services |
| M3 | Utilisateurs & annuaire | Comptes, rattachements, cycle de vie |
| M4 | Projets | Portefeuille, fiche projet, équipe, budget |
| M5 | Jalons & épopées | Structuration du projet, feuille de route |
| M6 | Tâches | Travail unitaire, dépendances, RACI, sous-tâches |
| M7 | Planning unifié | Vue personnes × jours, semaine / mois / activité |
| M8 | Activité récurrente | Tâches prédéfinies, assignations, récurrences |
| M9 | Événements | Réunions, interventions, récurrences, participants |
| M10 | Congés | Demande, validation, soldes, délégations, types |
| M11 | Télétravail | Déclaration, jours fixes, vue équipe |
| M12 | Temps passé | Déclaration, rapports, contrôle de cohérence |
| M13 | Compétences | Référentiel, niveaux, matrice, écarts |
| M14 | Tiers & clients | Prestataires, partenaires, bénéficiaires |
| M15 | Documents & commentaires | Pièces jointes et fil de discussion |
| M16 | Tableau de bord | Vue personnelle, to-do, tâches du jour |
| M17 | Rapports & analytics | KPI, santé projet, charge, Gantt portefeuille |
| M18 | Notifications | Alertes in-app et courriel |
| M19 | Paramétrage | Calendrier, affichage, planning |
| M20 | Administration | Rôles, permissions, journal d'audit |
| M21 | Imports & exports | CSV, ICS, PDF, Excel |

### 2.2 Hors périmètre

Paie et gestion administrative du personnel · comptabilité et facturation · gestion documentaire électronique (GED) complète · messagerie interne · gestion de parc matériel · signature électronique.

---

## 3. Acteurs

### 3.1 Personas

**Camille — agent contributeur**
Travaille sur deux ou trois projets, participe à des permanences. Attend du produit : voir ses tâches du jour, déclarer congés et télétravail sans friction, saisir son temps en quelques secondes. *N'ouvrira jamais un rapport.*

**Driss — chef de projet**
Porte un projet transverse impliquant quatre services. Attend : structurer en jalons, savoir qui est disponible quand, repérer les tâches en retard et les dépendances qui glissent.

**Fatou — manager de service**
Encadre douze agents. Attend : valider les congés en connaissant l'impact sur le service, voir le taux de présence, repérer les surcharges, suivre un agent individuellement.

**Hugo — responsable RH**
Suit les congés et le télétravail à l'échelle de l'organisation. Attend : paramétrer les types de congés et les soldes, importer en masse, contrôler.

**Inès — direction**
Ne se connecte qu'une fois par mois. Attend : la santé du portefeuille en une page, les jalons à risque, la charge par service.

**Karim — administrateur**
Attend : gérer comptes et rôles, paramétrer le calendrier, auditer les actions sensibles.

### 3.2 Modèle de droits

Le produit repose sur un **catalogue de permissions atomiques** (≈ 125 permissions) regroupées en **modèles de rôles** prêts à l'emploi, eux-mêmes personnalisables.

**Nomenclature.** Une permission s'écrit `domaine:action`. Exemples : `projects:create`, `leaves:approve`, `telework:read_team`.

**Familles d'actions**

| Suffixe | Portée |
| --- | --- |
| `:read` / `:create` / `:update` / `:delete` | Opérations de base sur son propre périmètre |
| `:readAll` | Lecture au-delà de son périmètre |
| `:manage_any` | Modification d'objets dont on n'est pas propriétaire |
| `:read_team` | Lecture restreinte à son équipe / service |
| Permissions nommées | `leaves:approve`, `leaves:self_approve`, `users:manage_roles`, `skills:manage_matrix`, `tasks:assign_any_user`, `time_tracking:declare_for_third_party`… |

**Domaines couverts.** audit · clients · comments · departments · directions · documents · epics · events · holidays · leaves · milestones · planning · predefined_tasks · projects · reports · school_vacations · services · settings · skills · tasks · telework · third_parties · time_tracking · users.

**Modèles de rôles fournis (26)**

| Famille | Modèles |
| --- | --- |
| Administration | `ADMIN`, `ADMIN_DELEGATED` |
| Management | `PORTFOLIO_MANAGER`, `MANAGER`, `MANAGER_PROJECT_FOCUS`, `MANAGER_HR_FOCUS` |
| Conduite de projet | `PROJECT_LEAD`, `PROJECT_LEAD_JUNIOR`, `TECHNICAL_LEAD` |
| Contribution | `PROJECT_CONTRIBUTOR`, `PROJECT_CONTRIBUTOR_LIGHT`, `FUNCTIONAL_REFERENT` |
| RH | `HR_OFFICER`, `HR_OFFICER_LIGHT` |
| Transverse | `THIRD_PARTY_MANAGER`, `CONTROLLER`, `BUDGET_ANALYST`, `DATA_ANALYST` |
| Informatique | `IT_SUPPORT`, `IT_INFRASTRUCTURE` |
| Observation | `OBSERVER_FULL`, `OBSERVER_PROJECTS_ONLY`, `OBSERVER_HR_ONLY` |
| Restreints | `BASIC_USER`, `EXTERNAL_PRESTATAIRE`, `STAGIAIRE_ALTERNANT` |

> **RG-DROITS-01.** Un modèle de rôle est un point de départ, pas une contrainte : un administrateur peut composer un rôle sur mesure en cochant les permissions dans une matrice.
> **RG-DROITS-02.** Les rôles système ne sont ni supprimables ni renommables.
> **RG-DROITS-03.** Toute permission absente est refusée par défaut (liste blanche).

### 3.3 Périmètre organisationnel

Au-delà des permissions, un **périmètre** limite ce qu'un utilisateur voit.

> **RG-SCOPE-01.** Le périmètre par défaut d'un utilisateur est : son département de rattachement ∪ les départements de ses services. S'il est responsable d'une direction, le périmètre s'étend à toute la direction.
> **RG-SCOPE-02.** Un projet est visible par : son créateur, son chef de projet, son sponsor, et ses membres. Les détenteurs de `projects:manage_any` voient tout.
> **RG-SCOPE-03.** Les détenteurs d'une permission de gestion globale (`tasks:manage_any`, `users:manage`) conservent la vue complète de l'instance.
> **RG-SCOPE-04.** Une tâche marquée **confidentielle** n'est pas lisible du seul fait d'y être assigné : elle exige une permission explicite.

---

## 4. Dictionnaire des objets métier

| Objet | Définition | Attributs porteurs de sens |
| --- | --- | --- |
| **Direction** | Plus haut niveau hiérarchique | Nom, description, responsable |
| **Département** | Division rattachée à une direction | Nom, description, responsable, direction |
| **Service** | Équipe rattachée à un département | Nom, description, manager, département |
| **Utilisateur** | Agent disposant d'un compte | Identité, email, identifiant, rôle, département, services, avatar, actif/inactif, dernière connexion |
| **Projet** | Effort structuré et daté | Nom, description, statut, priorité, dates, budget heures, icône, chef de projet, sponsor, créateur, archivage |
| **Épopée** | Regroupement thématique de tâches | Nom, description, projet |
| **Jalon** | Échéance vérifiable | Nom, description, date d'échéance, statut, projet |
| **Tâche** | Unité de travail | Titre, description, statut, priorité, dates, horaires, estimation, avancement, projet *(optionnel)*, jalon, épopée, assignés, intervention extérieure, confidentialité |
| **Sous-tâche** | Point de contrôle ordonné | Libellé, fait/non fait, ordre |
| **Dépendance** | Contrainte entre deux tâches | Tâche, tâche prérequise |
| **RACI** | Responsabilité sur une tâche | Utilisateur, rôle (Responsable / Autorité / Consulté / Informé) |
| **Congé** | Absence déclarée | Agent, type, dates, demi-journée, jours ouvrés, statut, validateur, motif |
| **Type de congé** | Paramètre RH | Code, nom, couleur, icône, rémunéré, validation requise, limite annuelle, actif, système |
| **Solde de congé** | Droits annuels | Agent *(ou défaut global)*, type, année, jours attribués |
| **Délégation de validation** | Transfert temporaire | Délégant, délégué, période, active |
| **Télétravail** | Journée déclarée | Agent, date, télétravail oui/non, exception |
| **Règle de télétravail** | Jour fixe récurrent | Agent, jour de semaine, période de validité |
| **Tâche prédéfinie** | Activité récurrente hors projet | Nom, couleur, icône, durée par défaut, horaires, télétravail autorisé, poids (1–5), actif |
| **Assignation prédéfinie** | Occurrence datée | Tâche, agent, date, période, statut de réalisation |
| **Événement** | Rendez-vous | Titre, date, horaires, journée entière, projet, participants, intervention extérieure, récurrence |
| **Saisie de temps** | Temps déclaré | Agent *ou tiers*, date, heures, type d'activité, projet, tâche, description |
| **Compétence** | Savoir-faire du référentiel | Nom, catégorie, description, effectif requis |
| **Compétence détenue** | Niveau d'un agent | Agent, compétence, niveau |
| **Tiers** | Intervenant externe | Type, organisation, contact, notes, actif |
| **Client** | Bénéficiaire d'un projet | Identité, coordonnées, projets rattachés |
| **Document** | Pièce jointe | Nom, fichier, objet rattaché, auteur |
| **Commentaire** | Message contextuel | Contenu, objet rattaché, auteur |
| **To-do personnelle** | Pense-bête privé | Libellé, fait/non fait |
| **Jour férié** | Jour non ouvré | Date, libellé, type, ouvré ou non, récurrent |
| **Vacances scolaires** | Période de référence | Libellé, dates, zone, année scolaire, source |
| **Notification** | Alerte utilisateur | Type, contenu, lue/non lue, destinataire |
| **Entrée d'audit** | Trace d'action sensible | Horodatage, action, type d'entité, entité, acteur |

### 4.1 Vocabulaires

**Statut de projet** — Brouillon · Actif · Suspendu · Terminé · Annulé
**Statut de tâche** — À faire · En cours · En revue · Terminé · Bloqué
**Statut de jalon** — En attente · En cours · Terminé
**Priorité** — Basse · Normale · Haute · Critique
**Statut de congé** — En attente · Approuvé · Refusé · Annulé *(+ état intermédiaire : annulation demandée)*
**Demi-journée** — Matin · Après-midi
**Type d'activité (temps)** — Développement · Réunion · Support · Formation · Autre
**Catégorie de compétence** — Technique · Méthodologie · Savoir-être · Métier
**Niveau de compétence** — Débutant · Intermédiaire · Expert · Maître
**Type de tiers** — Personne physique · Personne morale
**Période de journée** — Matin · Après-midi · Journée entière
**Durée de tâche prédéfinie** — Demi-journée · Journée entière · Créneau horaire

---

## 5. Spécifications par module

Chaque exigence est identifiée `EX-<MODULE>-<n>`, chaque règle de gestion `RG-<MODULE>-<n>`.

---

### M1 — Authentification et compte

#### Exigences

| Id | Exigence |
| --- | --- |
| EX-AUTH-01 | Se connecter par identifiant **ou** adresse email, et mot de passe |
| EX-AUTH-02 | Rester connecté entre deux sessions de navigateur |
| EX-AUTH-03 | Se déconnecter, invalidant la session |
| EX-AUTH-04 | Créer un compte en autonomie *(activable/désactivable)* |
| EX-AUTH-05 | Demander une réinitialisation de mot de passe |
| EX-AUTH-06 | Définir un nouveau mot de passe depuis un lien reçu |
| EX-AUTH-07 | Être contraint de changer son mot de passe à la première connexion |
| EX-AUTH-08 | Changer son mot de passe depuis son profil |
| EX-AUTH-09 | Consulter et modifier son profil : identité, avatar, langue, thème |
| EX-AUTH-10 | Consulter la date de sa dernière connexion |

#### Règles de gestion

- **RG-AUTH-01** — Après un nombre paramétrable de tentatives infructueuses, le compte est temporairement verrouillé. Message : *« Trop de tentatives de connexion. Réessayez plus tard. »*
- **RG-AUTH-02** — Le message d'échec ne distingue jamais « identifiant inconnu » de « mot de passe erroné ».
- **RG-AUTH-03** — L'inscription autonome peut être désactivée globalement, et peut être restreinte à une liste de domaines de messagerie autorisés.
- **RG-AUTH-04** — Un jeton de réinitialisation est à usage unique et expire. Les deux cas produisent des messages distincts.
- **RG-AUTH-05** — Un utilisateur inactif ne peut pas se connecter.
- **RG-AUTH-06** — Le mot de passe respecte une politique minimale : 8 caractères, une majuscule, un chiffre, un caractère spécial.
- **RG-AUTH-07** — Le changement de mot de passe par l'intéressé exige le mot de passe actuel.
- **RG-AUTH-08** — L'identifiant de connexion n'est jamais modifiable après création.
- **RG-AUTH-09** — L'avatar est soit un fichier téléversé (jpg, png, webp), soit un visuel prédéfini, soit rien.
- **RG-AUTH-10** — Connexions réussies, échecs et verrouillages sont tracés dans le journal d'audit.

---

### M2 — Structure organisationnelle

Trois niveaux : **Direction → Département → Service**.

| Id | Exigence |
| --- | --- |
| EX-ORG-01 | Créer, modifier, supprimer une direction ; lui désigner un responsable |
| EX-ORG-02 | Créer, modifier, supprimer un département ; le rattacher à une direction ; lui désigner un responsable |
| EX-ORG-03 | Créer, modifier, supprimer un service ; le rattacher à un département ; lui désigner un manager |
| EX-ORG-04 | Consulter l'organisation sous forme d'arborescence dépliable |
| EX-ORG-05 | Filtrer la vue par département |
| EX-ORG-06 | Consulter les statistiques d'un département ou d'un service (effectif, services rattachés) |

- **RG-ORG-01** — Une direction ne peut être supprimée tant que des départements y sont rattachés ; l'utilisateur est invité à les détacher au préalable.
- **RG-ORG-02** — Supprimer un département supprime les services qu'il contient ; l'utilisateur en est averti explicitement.
- **RG-ORG-03** — Un département peut exister hors direction ; un service ne peut exister hors département.
- **RG-ORG-04** — Un utilisateur appartient à **un** département et à **zéro ou plusieurs** services.
- **RG-ORG-05** — Le manager d'un service et le responsable d'un département sont les validateurs naturels de leur périmètre.

---

### M3 — Utilisateurs et annuaire

| Id | Exigence |
| --- | --- |
| EX-USR-01 | Lister les utilisateurs : identité, email/identifiant, rôle, département/services, statut |
| EX-USR-02 | Rechercher et filtrer par département, service, rôle, statut |
| EX-USR-03 | Créer un compte : identité, email, identifiant, mot de passe initial, rôle, département, services |
| EX-USR-04 | Modifier un compte, y compris son rôle et ses rattachements |
| EX-USR-05 | Désactiver un compte (suppression douce, réversible) |
| EX-USR-06 | Supprimer définitivement un compte après contrôle de dépendances |
| EX-USR-07 | Réinitialiser le mot de passe d'un utilisateur |
| EX-USR-08 | Importer des utilisateurs en masse depuis un fichier CSV, avec prévisualisation |
| EX-USR-09 | Consulter la présence du jour (qui est là, en congé, en télétravail) |
| EX-USR-10 | Accéder à la **fiche de suivi individuel** d'un agent |

**Fiche de suivi individuel** — six onglets sur une période choisie (semaine / mois / trimestre / année / tout) :

1. **Vue d'ensemble** — informations, statistiques clés (tâches actives et terminées, solde de congés, jours de télétravail, heures saisies, projets actifs), activité récente
2. **Tâches** — tâches assignées avec filtres (toutes / actives / terminées / bloquées)
3. **Congés** — historique et solde (total, utilisés, disponibles, en attente)
4. **Télétravail** — cumuls mois et année, moyenne mensuelle, calendrier
5. **Temps** — total, répartition par projet et par type d'activité, détail
6. **Compétences** — compétences détenues et niveaux

- **RG-USR-01** — Email et identifiant sont uniques ; les collisions produisent des messages distincts.
- **RG-USR-02** — Nul ne peut se désactiver ni se supprimer soi-même. Les actions correspondantes sont désactivées avec une explication au survol.
- **RG-USR-03** — La suppression définitive est précédée d'un contrôle de dépendances. Si des éléments actifs subsistent, elle est refusée et la liste des blocages est affichée.
- **RG-USR-04** — La suppression définitive est irréversible et efface l'historique associé ; elle exige une confirmation explicite.
- **RG-USR-05** — Un administrateur ne peut pas réinitialiser son propre mot de passe via l'outil d'administration ; il passe par le changement de mot de passe personnel.
- **RG-USR-06** — L'import CSV présente un aperçu avant exécution, puis un compte rendu : créés / ignorés (déjà existants) / en erreur, avec le détail ligne à ligne.
- **RG-USR-07** — Un modèle de fichier CSV est téléchargeable et documente les colonnes attendues.
- **RG-USR-08** — Les services sélectionnables dépendent du département choisi.

---

### M4 — Projets

| Id | Exigence |
| --- | --- |
| EX-PRJ-01 | Consulter le portefeuille en cartes, avec compteur et compteur filtré |
| EX-PRJ-02 | Rechercher par nom ou description ; filtrer par statut et priorité |
| EX-PRJ-03 | Créer un projet : nom, description, statut, priorité, dates, chef de projet, sponsor, département, budget heures, icône |
| EX-PRJ-04 | Choisir une icône dans une bibliothèque thématique avec recherche |
| EX-PRJ-05 | Modifier un projet |
| EX-PRJ-06 | Archiver / désarchiver un projet |
| EX-PRJ-07 | Supprimer un projet (annulation logique, puis suppression définitive) |
| EX-PRJ-08 | Consulter la fiche projet en cinq onglets |
| EX-PRJ-09 | Gérer l'équipe : ajouter un membre avec un rôle projet et un taux d'allocation |
| EX-PRJ-10 | Rattacher des clients et des tiers au projet |
| EX-PRJ-11 | Importer jalons et tâches depuis un CSV unique |
| EX-PRJ-12 | Exporter le contenu du projet |
| EX-PRJ-13 | Consulter l'historique des instantanés d'avancement |

**Bibliothèque d'icônes** — catégories : Gestion · Numérique · Finances · RH · Territoire · Social · Culture & Éducation · Sécurité · Environnement · Juridique · Symboles.

**Rôles dans l'équipe projet** — Sponsor · Chef de projet · Responsable technique · Architecte · Tech Lead · Développeur (senior / confirmé / junior) · DevOps · QA Lead · Testeur · UX/UI Designer · Product Owner · Scrum Master · Analyste métier · Membre · Observateur.

**Onglets de la fiche projet**

| Onglet | Contenu |
| --- | --- |
| Vue d'ensemble | Indicateurs (progression, tâches, budget consommé / restant, effectif), informations, feuille de route |
| Tâches | Tableau kanban avec recherche, création, import CSV |
| Jalons | Feuille de route chronologique, tâches groupées par jalon |
| Équipe | Membres, rôles, allocation |
| Gantt | Diagramme temporel des tâches et dépendances |

- **RG-PRJ-01** — La date de fin est postérieure ou égale à la date de début.
- **RG-PRJ-02** — La suppression d'un projet est d'abord logique : le projet passe au statut **Annulé** et reste restaurable.
- **RG-PRJ-03** — La suppression définitive est refusée si des données historiques y sont rattachées (temps déclaré notamment) ; l'archivage est proposé à la place.
- **RG-PRJ-04** — Un projet annulé doit être restauré avant toute modification.
- **RG-PRJ-05** — Un projet déjà archivé ne peut pas l'être une seconde fois ; un projet non archivé ne peut pas être désarchivé.
- **RG-PRJ-06** — Un utilisateur ne peut être membre du même projet deux fois.
- **RG-PRJ-07** — La progression du projet est calculée à partir de l'avancement de ses tâches ; elle n'est pas saisie.
- **RG-PRJ-08** — Le budget consommé est calculé à partir du temps déclaré sur le projet et ses tâches.
- **RG-PRJ-09** — Un instantané d'avancement est capturé périodiquement pour alimenter les courbes de tendance.
- **RG-PRJ-10** — Seuls les clients actifs sont rattachables ; un client introuvable ou inactif produit une erreur nommant les entrées fautives.
- **RG-PRJ-11** — L'import projet accepte deux modes : **Ajouter** (conserve l'existant) et **Remplacer** (supprime jalons, tâches et sous-tâches avant import, en tout-ou-rien). Le mode Remplacer exige une confirmation affichant les volumes concernés, et est bloqué si des données rattachées l'empêchent.

---

### M5 — Jalons et épopées

| Id | Exigence |
| --- | --- |
| EX-JAL-01 | Créer, modifier, supprimer un jalon : nom, description, date d'échéance |
| EX-JAL-02 | Marquer un jalon comme atteint |
| EX-JAL-03 | Consulter la feuille de route chronologique |
| EX-JAL-04 | Consulter les indicateurs de jalons : total, terminés, en cours, nombre de tâches |
| EX-JAL-05 | Déplier / replier les tâches d'un jalon et modifier leur statut depuis la feuille de route |
| EX-JAL-06 | Importer et exporter les jalons en CSV |
| EX-JAL-07 | Créer, modifier, supprimer une épopée |

- **RG-JAL-01** — Le statut d'un jalon est **calculé automatiquement** à partir de l'avancement de ses tâches ; il n'est pas saisi. L'interface l'explique.
- **RG-JAL-02** — Un jalon appartient à un et un seul projet.
- **RG-JAL-03** — Une tâche ne peut être rattachée qu'à un jalon ou une épopée **du même projet**.
- **RG-JAL-04** — Une tâche hors projet ne peut être rattachée ni à un jalon ni à une épopée.
- **RG-JAL-05** — La suppression d'un jalon détache ses tâches sans les supprimer.

---

### M6 — Tâches

#### Exigences

| Id | Exigence |
| --- | --- |
| EX-TSK-01 | Consulter les tâches en liste et en tableau kanban à cinq colonnes |
| EX-TSK-02 | Déplacer une tâche entre colonnes par glisser-déposer |
| EX-TSK-03 | Filtrer par projet, priorité, retard, et isoler les tâches hors projet |
| EX-TSK-04 | Créer une tâche : titre, description, projet *(facultatif)*, assignés, statut, priorité, dates, horaires, estimation, jalon, intervention extérieure |
| EX-TSK-05 | Assigner plusieurs personnes à une tâche |
| EX-TSK-06 | Inviter des services entiers |
| EX-TSK-07 | Modifier une tâche depuis sa fiche détaillée |
| EX-TSK-08 | Renseigner un pourcentage d'avancement |
| EX-TSK-09 | Gérer des sous-tâches ordonnables, avec réordonnancement |
| EX-TSK-10 | Déclarer des dépendances entre tâches |
| EX-TSK-11 | Visualiser ce dont une tâche dépend et ce qu'elle bloque |
| EX-TSK-12 | Être alerté des incohérences de dates induites par les dépendances |
| EX-TSK-13 | Décaler en cascade les tâches dépendantes |
| EX-TSK-14 | Attribuer des rôles RACI |
| EX-TSK-15 | Rattacher ou détacher une tâche d'un projet a posteriori |
| EX-TSK-16 | Assigner un tiers externe à une tâche |
| EX-TSK-17 | Commenter et joindre des documents |
| EX-TSK-18 | Importer et exporter les tâches d'un projet en CSV |
| EX-TSK-19 | Lister les tâches orphelines |
| EX-TSK-20 | Lister ses tâches terminées sans temps déclaré |

#### Règles de gestion

- **RG-TSK-01** — Une tâche **peut ne pas avoir de projet**. C'est un cas nominal, pas une anomalie : réunions, travail transverse, sollicitations ponctuelles. Ces tâches sont dites *indépendantes* ou *hors projet* et apparaissent dans le planning au même titre que les autres.
- **RG-TSK-02** — Créer une tâche dans un projet et créer une tâche hors projet sont deux droits distincts. Sans aucun des deux, la création est refusée.
- **RG-TSK-03** — Créer une tâche dans un projet exige d'en être membre, sauf permission de gestion globale.
- **RG-TSK-04** — Une dépendance circulaire est refusée.
- **RG-TSK-05** — Une dépendance en doublon est refusée.
- **RG-TSK-06** — Deux tâches liées par une dépendance appartiennent au même projet.
- **RG-TSK-07** — Une tâche dont d'autres dépendent ne peut pas être supprimée ; la liste des dépendantes est affichée.
- **RG-TSK-08** — La date de fin est postérieure ou égale à la date de début.
- **RG-TSK-09** — Lorsqu'un déplacement de date crée une incohérence, l'utilisateur se voit proposer de décaler en cascade les tâches dépendantes, avec leur nombre. Le décalage en cascade touchant d'autres tâches du projet exige d'en être membre ou de détenir la gestion globale.
- **RG-TSK-10** — Un même utilisateur ne peut porter deux fois le même rôle RACI sur une tâche.
- **RG-TSK-11** — Dans le planning, une tâche **multi-assignée** ne peut pas voir sa date modifiée par glisser-déposer : le message l'indique et renvoie vers la fiche détaillée. Le glisser-déposer d'une tâche multi-assignée ne change que l'assigné.
- **RG-TSK-12** — Une tâche est *en retard* si sa date de fin est dépassée et son statut n'est pas *Terminé*.
- **RG-TSK-13** — Une tâche **confidentielle** n'est pas lisible du seul fait d'y être assigné.
- **RG-TSK-14** — Sans permission élargie, un utilisateur ne peut supprimer que les tâches qui lui sont assignées.
- **RG-TSK-15** — Les assignés proposés sont en priorité les membres du projet ; si le projet n'a pas de membre, tous les utilisateurs sont proposés, et l'interface l'explique.
- **RG-TSK-16** — Les colonnes *À faire* et *Terminé* du kanban ne peuvent pas être masquées.

---

### M7 — Planning unifié

**C'est la vue centrale du produit.** Une grille **ressources en lignes × jours en colonnes**, regroupée par service.

#### Exigences

| Id | Exigence |
| --- | --- |
| EX-PLN-01 | Basculer entre trois vues : **Semaine**, **Mois**, **Activité** |
| EX-PLN-02 | Naviguer d'une période à l'autre et revenir à aujourd'hui |
| EX-PLN-03 | Voir dans une même cellule : tâches projet, tâches hors projet, congés, télétravail, événements, permanences |
| EX-PLN-04 | Grouper les ressources par service, avec repli / dépliage individuel et global |
| EX-PLN-05 | Filtrer par service, par département, par ressource, ou se restreindre à son périmètre |
| EX-PLN-06 | Choisir les couches affichées : disponibilités, activités, tâches projet, tâches hors projet, événements |
| EX-PLN-07 | Consulter une légende filtrante par section |
| EX-PLN-08 | Voir la synthèse quotidienne « hors présentiel » : effectif absent sur effectif total, et pourcentage |
| EX-PLN-09 | Basculer le télétravail d'un agent directement depuis la cellule |
| EX-PLN-10 | Déplacer une tâche par glisser-déposer pour en changer la date ou l'assigné |
| EX-PLN-11 | Créer une tâche ou un événement directement depuis le planning |
| EX-PLN-12 | Ouvrir le détail d'une tâche ou d'un événement en cliquant dessus |
| EX-PLN-13 | Distinguer visuellement congé validé et congé en attente |
| EX-PLN-14 | Voir jours fériés et vacances scolaires en trame de fond |
| EX-PLN-15 | Exporter le planning au format ICS et importer un calendrier ICS |

**Sections de légende** — Statuts de tâches · Type de tâche (projet / hors projet) · Présence (bureau, télétravail) · Absences (congé validé, congé en attente) · Événements (dont intervention extérieure).

**Vue Activité** — grille **jours en lignes × tâches prédéfinies en colonnes**, dédiée au pilotage de l'activité récurrente. Chaque cellule liste les agents affectés, avec ajout direct. Vue imprimable.

#### Règles de gestion

- **RG-PLN-01** — Le planning agrège en une seule sollicitation toutes les données nécessaires à la période affichée.
- **RG-PLN-02** — Sans permission de gestion globale, le planning est restreint au périmètre organisationnel de l'utilisateur (RG-SCOPE-01).
- **RG-PLN-03** — Les jours visibles (par exemple, masquer le week-end) sont paramétrables globalement ; au moins un jour doit rester sélectionné.
- **RG-PLN-04** — Le basculement du télétravail depuis le planning exige la permission correspondante ; à défaut, la cellule est en lecture seule et l'indique.
- **RG-PLN-05** — Si une modification aboutit mais que le rafraîchissement échoue, l'utilisateur est averti que l'affichage peut être périmé.
- **RG-PLN-06** — L'assignation d'un agent déjà affecté est refusée avec un message explicite.
- **RG-PLN-07** — Les permanences ne sont visibles que si l'utilisateur a le droit de consulter les tâches prédéfinies.
- **RG-PLN-08** — L'ajout d'agents sur une permanence exclut ceux qui sont déjà assignés, en congé, ou en télétravail lorsque la tâche l'interdit ; la raison est affichée pour chacun.

---

### M8 — Activité récurrente (tâches prédéfinies)

Permanences, astreintes, accueil, gardes : activités qui reviennent, ne relèvent d'aucun projet, et doivent être réparties équitablement.

| Id | Exigence |
| --- | --- |
| EX-ACT-01 | Créer un catalogue de tâches prédéfinies : nom, description, couleur, icône, durée par défaut, horaires, télétravail autorisé, poids, actif |
| EX-ACT-02 | Assigner un agent à une tâche prédéfinie sur une date et une période |
| EX-ACT-03 | Assigner en masse |
| EX-ACT-04 | Définir des règles de récurrence |
| EX-ACT-05 | Générer les assignations à partir des règles sur une plage donnée |
| EX-ACT-06 | Déclarer le statut de réalisation d'une assignation |
| EX-ACT-07 | Consulter la grille d'activité et l'imprimer |

**Types de récurrence** — Hebdomadaire (avec fréquence : toutes les N semaines) · Mensuelle à date fixe · Mensuelle ordinale (1er, 2e, 3e, 4e, dernier <jour> du mois).

**Poids** — de 1 (très légère) à 5 (très lourde), destiné à l'équilibrage de charge.

- **RG-ACT-01** — Une assignation est unique pour un quadruplet agent × tâche × date × période.
- **RG-ACT-02** — Une tâche de durée *Créneau horaire* exige une heure de début et une heure de fin.
- **RG-ACT-03** — Assigner un agent en télétravail à une tâche qui ne l'autorise pas est refusé, en nommant les agents incompatibles.
- **RG-ACT-04** — Pour une récurrence mensuelle à date fixe, si le jour n'existe pas dans le mois (le 31 février), l'assignation est ramenée au dernier jour du mois.
- **RG-ACT-05** — Une tâche prédéfinie inactive n'est plus assignable, mais les assignations passées sont conservées.
- **RG-ACT-06** — La génération rend compte du nombre d'assignations créées et ignorées.

---

### M9 — Événements

| Id | Exigence |
| --- | --- |
| EX-EVT-01 | Consulter les événements en liste et en calendrier |
| EX-EVT-02 | Filtrer par projet |
| EX-EVT-03 | Créer un événement : titre, description, date, journée entière ou horaires, projet, participants, intervention extérieure |
| EX-EVT-04 | Inviter des services entiers |
| EX-EVT-05 | Créer un événement récurrent : toutes les N semaines, jour de la semaine, date de fin |
| EX-EVT-06 | Modifier, supprimer un événement |
| EX-EVT-07 | Arrêter une récurrence et supprimer les occurrences futures |
| EX-EVT-08 | Ajouter et retirer des participants |
| EX-EVT-09 | Consulter les événements d'un agent, ou d'une plage de dates |

- **RG-EVT-01** — Un même utilisateur ne peut être participant deux fois.
- **RG-EVT-02** — La date de fin de récurrence ne peut dépasser un horizon maximal paramétré (exprimé en années).
- **RG-EVT-03** — Seul un événement parent d'une série peut voir sa récurrence arrêtée.
- **RG-EVT-04** — L'arrêt de récurrence supprime les occurrences futures et conserve les passées ; l'action est confirmée.
- **RG-EVT-05** — Les paramètres de début et de fin sont obligatoires pour interroger une plage.
- **RG-EVT-06** — Un événement marqué *intervention extérieure* est signalé distinctement dans le planning.
- **RG-EVT-07** — Toute modification ou suppression d'un événement appartenant à une série **déclare sa portée** : *cette occurrence seulement*, ou *cette occurrence et les suivantes*. La portée est obligatoire sur une série et refusée hors série. La portée « série » **n'agit jamais sur les occurrences antérieures à celle qui est visée** — même borne que `RG-EVT-04` —, et la date, qui distingue les occurrences les unes des autres, ne se modifie que sur une occurrence. Supprimer l'occurrence porteuse de la récurrence ne supprime pas les autres : la plus ancienne conservée en prend la suite.

---

### M10 — Congés

Le module le plus riche en règles.

#### Exigences

| Id | Exigence |
| --- | --- |
| EX-CNG-01 | Consulter ses demandes, celles à valider, et toutes les demandes (selon droits) |
| EX-CNG-02 | Créer une demande : type, dates, demi-journée, motif |
| EX-CNG-03 | Modifier une demande en attente |
| EX-CNG-04 | Supprimer une demande |
| EX-CNG-05 | Approuver ou refuser une demande, avec motif de refus |
| EX-CNG-06 | Demander l'annulation d'un congé approuvé |
| EX-CNG-07 | Accepter ou refuser une demande d'annulation |
| EX-CNG-08 | Déclarer un congé pour un collaborateur |
| EX-CNG-09 | Consulter son solde par type et par année |
| EX-CNG-10 | Définir des soldes par agent, ou un solde par défaut global |
| EX-CNG-11 | Déléguer temporairement son pouvoir de validation |
| EX-CNG-12 | Consulter les délégations données et reçues, et les désactiver |
| EX-CNG-13 | Gérer le référentiel des types de congés |
| EX-CNG-14 | Importer des congés en masse depuis un CSV |
| EX-CNG-15 | Consulter les congés de ses subordonnés |

**Référentiel des types de congés** — code, nom, description, icône, couleur, rémunéré ou non, validation requise ou approbation automatique, limite annuelle (ou illimité), ordre d'affichage, actif/inactif, système ou non. Nombre d'utilisations affiché.

#### Règles de gestion — cycle de vie

- **RG-CNG-01** — États : **En attente** → *(Approuvé | Refusé)* ; **Approuvé** → **Annulation demandée** → *(Annulé | retour Approuvé)*.
- **RG-CNG-02** — Seules les demandes *en attente* peuvent être approuvées, refusées ou modifiées.
- **RG-CNG-03** — Seules les demandes *en attente* ou *refusées* peuvent être supprimées.
- **RG-CNG-04** — Un congé approuvé ne peut pas être annulé directement par son titulaire : il passe par une **demande d'annulation** soumise à validation.
- **RG-CNG-05** — Seules les demandes *approuvées* peuvent faire l'objet d'une demande d'annulation.
- **RG-CNG-06** — Seules les demandes *approuvées* ou *en annulation demandée* peuvent être annulées.
- **RG-CNG-07** — On ne demande l'annulation que de ses propres congés.

#### Règles de gestion — validation

- **RG-CNG-08** — Le validateur est déterminé à la création : le manager du service, à défaut le responsable du département, à défaut un détenteur de la permission de gestion globale.
- **RG-CNG-09** — Nul n'approuve ni ne refuse sa propre demande, sauf permission explicite d'auto-validation ; le cas est alors tracé comme tel.
- **RG-CNG-10** — Une délégation active substitue le délégué au délégant. La recherche de délégation est **cantonnée au département du demandeur** : un délégué désigné par le manager du département B ne peut jamais devenir validateur pour un agent du département A.
- **RG-CNG-11** — L'utilisateur délégué doit être actif.
- **RG-CNG-12** — Seul le délégant, ou un administrateur, peut désactiver une délégation.
- **RG-CNG-13** — Un type de congé sans validation requise est approuvé automatiquement ; l'interface l'indique dès la sélection du type.
- **RG-CNG-14** — Un congé déclaré par un manager pour un collaborateur est directement approuvé : le manager est validateur de fait, et l'action est tracée à son nom.
- **RG-CNG-15** — Déclarer pour autrui exige la permission dédiée **et** que le collaborateur relève de ses services. Un collaborateur inactif ou hors périmètre est refusé.

#### Règles de gestion — décompte et soldes

- **RG-CNG-16** — Le nombre de jours est calculé en **jours ouvrés** : week-ends exclus, jours fériés non ouvrés exclus.
- **RG-CNG-17** — Une demi-journée peut être précisée en début et en fin de période ; le décompte en tient compte au demi-jour près.
- **RG-CNG-18** — La demi-journée simple ne s'applique qu'à un congé d'une seule journée.
- **RG-CNG-19** — Une demande à cheval sur deux années civiles est **répartie par année**, et chaque année est contrôlée contre son propre solde.
- **RG-CNG-20** — Le solde disponible est : jours attribués − jours consommés (approuvés) − jours engagés (en attente).
- **RG-CNG-21** — Un solde insuffisant bloque la demande, avec un message chiffré : jours demandés, jours disponibles, jours manquants, pour l'année concernée.
- **RG-CNG-22** — Le contrôle de solde est rejoué au moment de l'approbation. Si le solde est devenu insuffisant entre-temps, l'approbation est refusée.
- **RG-CNG-23** — Si l'allocation a été modifiée pendant le traitement, l'opération est refusée et l'utilisateur invité à recommencer, plutôt que d'écrire contre une réalité différente.
- **RG-CNG-24** — Un solde peut être défini par agent, ou globalement par défaut pour tous.

#### Règles de gestion — cohérence et référentiel

- **RG-CNG-25** — Une demande chevauchant un congé déjà approuvé du même agent est refusée.
- **RG-CNG-26** — Une demande chevauchant une autre demande existante est refusée.
- **RG-CNG-27** — Une modification créant un chevauchement est refusée.
- **RG-CNG-28** — La date de fin est postérieure ou égale à la date de début.
- **RG-CNG-29** — Un type de congé désactivé n'est plus sélectionnable ; les congés existants le conservent.
- **RG-CNG-30** — Un type système n'est pas supprimable ; seuls son nom, sa description, son icône, sa couleur et son exigence de validation sont modifiables.
- **RG-CNG-31** — Un type utilisé par des congés est **désactivé** plutôt que supprimé ; l'utilisateur est averti du nombre de congés concernés.
- **RG-CNG-32** — L'import CSV ignore doublons et chevauchements, et rend compte : importés / ignorés / en erreur. **Ignoré** ne couvre que ces deux cas : tout autre refus — agent inconnu ou hors périmètre, type inconnu ou désactivé, dates incohérentes — est **en erreur**, avec son numéro de ligne. Le contrôle de solde (`RG-CNG-21`) s'applique à l'import comme au dépôt : une ligne au-delà du disponible est en erreur, avec le message chiffré de la règle.
- **RG-CNG-33** — Un congé importé est un état constaté, pas une demande : il est **directement approuvé**, l'importateur pour validateur de fait, par application de `RG-CNG-14` — l'import est par nature une déclaration pour autrui. **Exception : la ligne qui désigne l'importateur lui-même** suit le régime ordinaire du dépôt, donc `RG-CNG-13` et `RG-CNG-09`. Sans cette exception, l'import offrirait une auto-approbation que la route de validation refuse.

---

### M11 — Télétravail

| Id | Exigence |
| --- | --- |
| EX-TLT-01 | Consulter son planning mensuel de télétravail |
| EX-TLT-02 | Basculer un jour entre télétravail et non déclaré d'un clic |
| EX-TLT-03 | Consulter le cumul de jours planifiés |
| EX-TLT-04 | Configurer des jours fixes récurrents : jour de la semaine, date de début, date de fin facultative, actif |
| EX-TLT-05 | Prévisualiser une règle en langage naturel |
| EX-TLT-06 | Générer les plannings à partir des règles sur une plage |
| EX-TLT-07 | Consulter le télétravail de l'équipe à une date |
| EX-TLT-08 | Consulter le télétravail et les statistiques d'un agent |

- **RG-TLT-01** — Un seul enregistrement de télétravail par agent et par date.
- **RG-TLT-02** — Trois états par jour : télétravail · bureau (déclaré) · non déclaré. Le week-end est distingué.
- **RG-TLT-03** — Une règle récurrente est unique pour un couple jour de semaine × date de début.
- **RG-TLT-04** — Un jour issu d'une règle est signalé comme récurrent ; il peut être modifié ponctuellement, ce qui crée une exception.
- **RG-TLT-05** — La génération rend compte du nombre de jours créés et ignorés.
- **RG-TLT-06** — Une plage interrogée ne peut excéder 366 jours.
- **RG-TLT-07** — Agir sur le télétravail d'autrui exige une permission dédiée, distincte selon l'action (consulter, saisir, modifier, supprimer, gérer les règles).

---

### M12 — Temps passé

| Id | Exigence |
| --- | --- |
| EX-TMP-01 | Consulter ses saisies avec cumul (nombre d'entrées, total d'heures) |
| EX-TMP-02 | Filtrer par projet et par plage de dates |
| EX-TMP-03 | Saisir du temps : date, durée, type d'activité, projet, tâche, description |
| EX-TMP-04 | Supprimer une saisie |
| EX-TMP-05 | Saisir rapidement depuis le tableau de bord, au niveau de la tâche |
| EX-TMP-06 | Consulter les tâches terminées sans temps déclaré, et les valider sans déclaration |
| EX-TMP-07 | Consulter un rapport par agent, par projet, ou personnel |
| EX-TMP-08 | Déclarer du temps pour un tiers externe |

- **RG-TMP-01** — Une saisie référence au minimum une tâche ou un projet.
- **RG-TMP-02** — Le total d'heures déclarées sur une même journée ne peut dépasser un plafond ; le dépassement est refusé avec le total constaté et le plafond.
- **RG-TMP-03** — L'acteur d'une saisie (agent ou tiers) n'est pas modifiable après création ; il faut supprimer et recréer.
- **RG-TMP-04** — Déclarer pour un tiers exige une permission dédiée. *(Précisé le 2026-08-31, lot vague 7 : « tiers » désigne **toute personne autre que soi-même**, collègue ou intervenant extérieur — `RG-TMP-03` traite déjà les deux comme des sortes d'acteur. La permission est `time_tracking:declare_for_third_party`.)*
- **RG-TMP-05** — Filtrer sur un autre utilisateur exige une permission dédiée.
- **RG-TMP-06** — Une tâche terminée peut être close **sans déclaration** ; cette validation est enregistrée pour distinguer « oublié » de « rien à déclarer ».
- **RG-TMP-07** — La saisie rapide indique si du temps a déjà été déclaré sur la tâche, tous contributeurs confondus.

---

### M13 — Compétences

Trois vues : **Par utilisateur** · **Référentiel** · **Matrice**.

| Id | Exigence |
| --- | --- |
| EX-CMP-01 | Gérer le référentiel : nom, catégorie, description, effectif requis |
| EX-CMP-02 | Assigner des compétences à un agent avec un niveau |
| EX-CMP-03 | Modifier un niveau, retirer une compétence |
| EX-CMP-04 | Consulter la matrice collaborateurs × compétences |
| EX-CMP-05 | Modifier un niveau directement depuis une cellule de la matrice |
| EX-CMP-06 | Consulter la couverture moyenne et les écarts de compétence |
| EX-CMP-07 | Rechercher, filtrer par catégorie et par niveau, trier par nom, couverture ou compétence |
| EX-CMP-08 | Exporter la matrice en CSV |
| EX-CMP-09 | Importer le référentiel depuis un CSV |
| EX-CMP-10 | Rechercher les agents détenant une compétence donnée |

- **RG-CMP-01** — Chaque compétence porte un **effectif requis** : le nombre de personnes devant la maîtriser pour assurer la couverture.
- **RG-CMP-02** — Un **écart de compétence** existe lorsque l'effectif détenteur est inférieur à l'effectif requis. La matrice le signale et chiffre le manque.
- **RG-CMP-03** — La couverture est dite complète ou partielle, avec affichage du ratio détenteurs / requis.
- **RG-CMP-04** — Une compétence assignée à des agents ne peut pas être supprimée.
- **RG-CMP-05** — Les noms de compétences sont uniques.
- **RG-CMP-06** — Un agent détient une compétence à un seul niveau.

---

### M14 — Tiers et clients

**Tiers** — intervenants externes (prestataires, partenaires, consultants), personne physique ou morale.
**Clients** — bénéficiaires ou commanditaires d'un projet.

| Id | Exigence |
| --- | --- |
| EX-TRS-01 | Gérer les tiers : type, organisation, contact, notes, actif |
| EX-TRS-02 | Rattacher un tiers à un projet, l'assigner à une tâche |
| EX-TRS-03 | Consulter la fiche d'un tiers et ses rattachements |
| EX-TRS-04 | Gérer les clients |
| EX-TRS-05 | Rattacher des clients à un projet, consulter les projets d'un client |
| EX-TRS-06 | Consulter l'impact d'une suppression avant de la confirmer |

- **RG-TRS-01** — Un tiers de type *personne morale* ne porte pas de contact nommé.
- **RG-TRS-02** — Un tiers archivé n'est plus assignable.
- **RG-TRS-03** — Un tiers ne peut être rattaché deux fois au même projet, ni assigné deux fois à la même tâche.
- **RG-TRS-04** — Un tiers ne peut être assigné à une tâche que s'il est rattaché à la tâche ou à son projet parent.
- **RG-TRS-05** — La suppression d'un tiers ou d'un client est précédée d'un bilan d'impact.

---

### M15 — Documents et commentaires

| Id | Exigence |
| --- | --- |
| EX-DOC-01 | Joindre un document à un projet ou à une tâche |
| EX-DOC-02 | Consulter, télécharger, renommer, supprimer un document |
| EX-DOC-03 | Commenter un projet ou une tâche |
| EX-DOC-04 | Modifier et supprimer ses propres commentaires |

- **RG-DOC-01** — Un utilisateur modifie et supprime ses propres contributions ; agir sur celles d'autrui exige une permission dédiée.
- **RG-DOC-02** — Création, lecture, téléchargement, modification et suppression de documents sont tracés dans le journal d'audit.

---

### M16 — Tableau de bord

Page d'accueil personnelle, adaptée au rôle.

| Id | Exigence |
| --- | --- |
| EX-DSH-01 | Accueil nominatif |
| EX-DSH-02 | Quatre indicateurs : projets actifs, tâches en cours, tâches terminées (avec pourcentage), tâches en retard |
| EX-DSH-03 | Consulter son planning personnel de la période |
| EX-DSH-04 | Gérer une liste de to-do personnelles |
| EX-DSH-05 | Consulter ses tâches à venir, changer leur statut, saisir du temps en une frappe |
| EX-DSH-06 | Consulter ses tâches terminées non déclarées et les clore sans déclaration |
| EX-DSH-07 | Consulter ses projets |

- **RG-DSH-01** — Les to-do sont strictement privées et plafonnées à un nombre paramétré ; l'atteinte de la limite est signalée.
- **RG-DSH-02** — Une to-do se modifie par double-clic.
- **RG-DSH-03** — Les to-do complétées sont regroupées à part, avec leur compte.
- **RG-DSH-04** — Une tâche en retard est signalée par un marqueur visuel.

---

### M17 — Rapports et analytics

Trois onglets : **Vue d'ensemble** · **Analytics avancés** · **Gantt portefeuille**.

| Id | Exigence |
| --- | --- |
| EX-RPT-01 | Choisir une période : semaine, mois, trimestre, année |
| EX-RPT-02 | Filtrer par projet et par responsable |
| EX-RPT-03 | Exporter en PDF, Excel ou JSON |
| EX-RPT-04 | Consulter la progression des projets |
| EX-RPT-05 | Consulter la répartition de charge par collaborateur et les surcharges |
| EX-RPT-06 | Consulter la santé des projets |
| EX-RPT-07 | Consulter la tendance de progression |
| EX-RPT-08 | Consulter la complétion des jalons |
| EX-RPT-09 | Consulter la répartition des tâches par priorité et par statut |
| EX-RPT-10 | Consulter l'activité récente sur 30 jours |
| EX-RPT-11 | Consulter le Gantt portefeuille |
| EX-RPT-12 | Être alerté du nombre de tâches en retard |

**Santé de projet** — trois niveaux : **Bon** · **Attention** · **Critique**, calculés à partir des tâches restantes, des tâches en retard et des jalons à venir.

**RAG du Gantt portefeuille** — On track · À risque · En retard · À venir · Terminé.

**Tris du Gantt portefeuille** — nom, progression, date de fin, priorité, santé, service, chef de projet.

**Activité récente** — tâches terminées, créées, passées en retard, et **ratio de complétion** (terminées / créées) interprété : *« le backlog grossit »* ou *« le backlog se résorbe »*.

- **RG-RPT-01** — Les indicateurs respectent le périmètre de l'utilisateur : on ne voit d'agrégat que sur ce qu'on a le droit de voir.
- **RG-RPT-02** — Au-delà de dix projets, l'affichage graphique est limité pour rester lisible, et le troncage est signalé.
- **RG-RPT-03** — La tendance de progression s'appuie sur les instantanés historiques. Tant que l'historique est court, l'interface l'indique plutôt que d'afficher une courbe trompeuse.
- **RG-RPT-04** — Une stagnation de progression est détectée et signalée.
- **RG-RPT-05** — Une surcharge est détectée par écart à la moyenne de l'équipe.
- **RG-RPT-06** — Chaque graphique dispose d'un état vide explicite plutôt que d'une zone blanche.

---

### M18 — Notifications

| Type | Déclencheur |
| --- | --- |
| Nouvelle tâche assignée | Assignation d'une tâche |
| Demande de congé à valider | Soumission d'une demande |
| Décision sur votre demande de congé | Approbation ou refus |
| Tâche à échéance proche | Approche de la date de fin |
| Tâche en retard | Dépassement de la date de fin |
| Ajout à un projet | Ajout comme membre |

| Id | Exigence |
| --- | --- |
| EX-NTF-01 | Consulter ses notifications, avec compteur de non-lues |
| EX-NTF-02 | Marquer une notification comme lue |
| EX-NTF-03 | Tout marquer comme lu |
| EX-NTF-04 | Recevoir les notifications critiques par courriel |

- **RG-NTF-01** — Les alertes d'échéance sont émises par un traitement planifié quotidien, à heure fixe, dans le fuseau de l'organisation.
- **RG-NTF-02** — Le traitement planifié est protégé contre les exécutions concurrentes : une seule instance envoie.
- **RG-NTF-03** — Un congé auto-approuvé ne déclenche pas de notification de validation.
- **RG-NTF-04** — L'indisponibilité du service de messagerie n'empêche jamais l'action métier d'aboutir.

---

### M19 — Paramétrage

Quatre onglets : **Affichage** · **Planning** · **Jours fériés** · **Vacances scolaires**.

**Affichage**
Format de date (5 formats, avec exemple en direct) · Format d'heure (24h, 24h avec secondes, 12h) · Langue et région · Premier jour de la semaine.

**Planning**
Jours visibles dans les vues semaine et mois · Zone scolaire de référence · Jours particuliers.

**Jours fériés**
Créer, modifier, supprimer un jour · Importer les jours fériés français d'une année · Marquer un jour férié comme **ouvré** ou **chômé** · Déclarer un jour récurrent d'année en année · Statistiques : total, chômés, ouvrés, fériés légaux.

**Vacances scolaires**
Créer, modifier, supprimer une période · Importer depuis le calendrier officiel pour une année et une zone · Statistiques : total, importées, manuelles · Distinction visuelle entre périodes importées et saisies manuellement.

| Id | Exigence |
| --- | --- |
| EX-PRM-01 | Modifier un paramètre et être averti des modifications non enregistrées |
| EX-PRM-02 | Réinitialiser un paramètre, ou l'ensemble, aux valeurs par défaut, après confirmation |
| EX-PRM-03 | Consulter les paramètres publics sans être authentifié |

- **RG-PRM-01** — Un jour férié marqué *ouvré* compte comme jour travaillé dans le décompte des congés.
- **RG-PRM-02** — Un jour férié récurrent se reconduit automatiquement chaque année.
- **RG-PRM-03** — L'import des jours fériés rend compte : créés / déjà existants.
- **RG-PRM-04** — Les dates de vacances scolaires sont cohérentes : fin postérieure au début.
- **RG-PRM-05** — Quitter la page avec des modifications non enregistrées déclenche un avertissement.

---

### M20 — Administration

#### Gestion des rôles

| Id | Exigence |
| --- | --- |
| EX-ADM-01 | Lister les rôles : nom, code, nombre de permissions, système ou non |
| EX-ADM-02 | Créer un rôle, éventuellement à partir d'un modèle |
| EX-ADM-03 | Modifier un rôle, supprimer un rôle non système |
| EX-ADM-04 | Configurer les permissions dans une **matrice modules × actions** |
| EX-ADM-05 | Tout sélectionner pour un module |
| EX-ADM-06 | Initialiser le référentiel de permissions et de rôles |

#### Journal d'audit

Consultation en lecture seule des actions sensibles : **qui a fait quoi, quand, sur quoi**.

| Id | Exigence |
| --- | --- |
| EX-ADM-07 | Consulter le journal, paginé et horodaté |
| EX-ADM-08 | Filtrer par type d'entité, entité, acteur, action, plage de dates |
| EX-ADM-09 | Distinguer une action système d'une action humaine |

**Actions tracées** — connexions (succès, échec, verrouillage, déconnexion) · accès refusé · congés (création, modification, approbation, refus, annulation, demande d'annulation, suppression, ajustement de solde) · délégations (création, désactivation) · documents (création, lecture, téléchargement, modification, suppression) · clients (création, modification, suppression, rattachement, détachement) · projets · changement de département · export de données · changement de statut d'assignation.

- **RG-ADM-01** — Le journal est en lecture seule. Aucune interface ne permet de le modifier.
- **RG-ADM-02** — Les rôles système ne sont ni supprimables ni modifiables dans leur structure.
- **RG-ADM-03** — La consultation du journal exige une permission dédiée ; l'accès refusé est lui-même tracé.

---

### M21 — Imports et exports

#### Imports CSV

| Objet | Colonnes |
| --- | --- |
| Utilisateurs | email\*, login\*, password\*, firstName\*, lastName\*, role, departmentName, serviceNames |
| Tâches d'un projet | title\*, description, status, priority, assigneeEmail, milestoneName, estimatedHours, startDate, endDate |
| Jalons d'un projet | name\*, description, dueDate\* |
| Projet complet | rowType\* (MILESTONE ou TASK), name, dueDate, title, description, status, priority, assigneeEmail, milestoneName, estimatedHours, startDate, endDate, subtasks |
| Congés | userEmail\*, leaveTypeName\*, startDate\*, endDate\*, halfDay, comment |
| Compétences | name\*, category\*, description, requiredCount |

\* champ obligatoire

**Les colonnes d'énumération portent le CODE, pas le libellé.** `role` désigne
un code de rôle (`AGENT`, `ADMIN`…), `status` et `priority` les codes du
vocabulaire de `§ 4.1` (`todo`, `doing`, `done`… · `low`, `normal`, `high`,
`critical`), `rowType` vaut `MILESTONE` ou `TASK`. Les colonnes en `…Name` et
`…Email`, elles, désignent bien un libellé ou une adresse : ce sont des
références à des objets existants, pas des énumérations. *(Précision portée le
2026-08-31 : la convention était tacite dans trois imports, et une valeur
traduite faisait tomber la transaction sur une erreur technique au lieu d'une
ligne en erreur.)*

- **RG-IMP-01** — Virgule et point-virgule sont acceptés comme séparateurs.
- **RG-IMP-02** — Un modèle de fichier est téléchargeable pour chaque type d'import.
- **RG-IMP-03** — Tout import passe par une **prévisualisation** avant exécution.
- **RG-IMP-04** — Le compte rendu distingue systématiquement : importés / ignorés (doublons) / en erreur, avec le détail des erreurs.
- **RG-IMP-05** — Dans l'import projet complet, l'ordre des lignes est indifférent : les jalons sont créés avant les tâches. Une tâche peut référencer un jalon existant ou une ligne du même fichier.
- **RG-IMP-06** — Le mode Remplacer est tout-ou-rien : une seule ligne en erreur annule l'ensemble et ne supprime rien.

#### Exports

Planning au format **ICS** (et import ICS avec prévisualisation) · Tâches et jalons d'un projet en CSV · Matrice de compétences en CSV · Rapports en PDF, Excel et JSON.

---

## 6. Règles transverses

| Id | Règle |
| --- | --- |
| RG-GEN-01 | Toute action destructrice est confirmée, en nommant l'objet et en énonçant les conséquences |
| RG-GEN-02 | Toute action produit un retour immédiat : succès nommé, ou erreur explicite et actionnable |
| RG-GEN-03 | Les messages d'erreur métier sont rédigés en langue naturelle, jamais en code technique |
| RG-GEN-04 | Toute liste dispose d'un état vide qui explique et propose l'action suivante |
| RG-GEN-05 | Toute vue de données dispose d'un état de chargement explicite |
| RG-GEN-06 | Une action interdite est masquée ou désactivée avec explication — jamais proposée puis refusée |
| RG-GEN-07 | Les conflits d'édition concurrente sont détectés et refusés plutôt qu'écrasés silencieusement |
| RG-GEN-08 | Toute chaîne visible est traduisible ; aucune n'est figée dans le code |
| RG-GEN-09 | Les formats de date et d'heure suivent le paramétrage global |
| RG-GEN-10 | Les suppressions sensibles sont d'abord logiques, la suppression définitive étant une action distincte et contrôlée |

---

## 7. Exigences non fonctionnelles

| Domaine | Exigence |
| --- | --- |
| **Disponibilité** | Fonctionnement complet sans accès Internet sortant |
| **Performance** | Le planning d'un service sur une semaine s'affiche en moins de 2 s ; le tableau de bord en moins de 1 s |
| **Volumétrie cible** | 500 utilisateurs · 200 projets actifs · 20 000 tâches · 5 ans d'historique |
| **Accessibilité** | RGAA : navigation clavier complète, contrastes conformes, libellés d'assistance sur les grilles denses |
| **Responsive** | Consultation et actions courantes utilisables sur tablette et mobile ; les grilles denses restent optimisées pour le poste de travail |
| **Traçabilité** | Les actions sensibles sont tracées de manière inaltérable |
| **Confidentialité** | Cloisonnement par périmètre organisationnel ; tâches confidentielles |
| **Réversibilité** | Toutes les données sont exportables dans des formats ouverts |
| **Thème** | Clair, sombre et automatique |
| **Impression** | Le planning et la grille d'activité disposent d'une mise en page imprimable |

---

## 8. Partis pris de conception

Les orientations suivantes structurent l'ensemble du produit. Elles priment sur toute interprétation locale d'une exigence, et sont soumises à validation au même titre que le reste du document.

| # | Parti pris | Justification |
| --- | --- | --- |
| 1 | **Un seul système de droits** : permissions atomiques regroupées en modèles de rôles, sans catégorie de rôle privilégiée en dehors de ce mécanisme | Deux mécanismes concurrents rendent les droits impossibles à auditer et à faire évoluer sans intervention technique |
| 2 | **Le travail hors projet est un objet de premier rang**, nommé et assumé dans l'interface | Une part significative de l'activité ne relève d'aucun projet ; la traiter comme un cas dégradé fausse le planning et la mesure de charge |
| 3 | **Toute limite fonctionnelle est un paramètre d'administration**, jamais une valeur figée (plafond de to-do, plafond d'heures journalier, horizon de récurrence…) | L'organisation doit pouvoir ajuster ses seuils sans livraison logicielle |
| 4 | **Un vocabulaire unique par notion**, défini une seule fois et utilisé partout (§ 4.1) | Des échelles de priorité ou de statut divergentes selon les écrans rendent les filtres et les rapports incomparables |
| 5 | **Pas de statuts redondants** : chaque état d'un objet a une signification distincte et une seule | Deux libellés pour un même état produisent des données non exploitables |
| 6 | **Les référentiels sont paramétrables, pas énumérés** : types de congés, compétences, jours fériés, tâches prédéfinies | Ces listes varient d'une organisation à l'autre et dans le temps |
| 7 | **Un rattachement organisationnel unique et explicite** par objet, sans duplication de la notion de département | Un rattachement dupliqué diverge nécessairement et casse le cloisonnement par périmètre |
| 8 | **Assignation multiple seule**, avec notion facultative de porteur | Un champ d'assigné principal coexistant avec une liste d'assignés crée deux vérités sur la même question |
| 9 | **Le planning est une vue unique à trois modes** (Semaine, Mois, Activité), pas trois écrans distincts | La grille temporelle est le point d'entrée du produit ; la fragmenter en disperse la valeur |
| 10 | **Densité maîtrisée sur les vues riches** : hiérarchie visuelle explicite, couches activables, états vides soignés | Le planning et les rapports concentrent beaucoup d'information ; leur lisibilité conditionne l'adoption |

---

## 9. Ce qui reste à arbitrer

1. **Volumétrie réelle** — nombre d'agents, de projets, de services concernés
2. **Circuit de validation des congés** — le circuit à un seul niveau (manager, ou son délégué) suffit-il, ou faut-il un double niveau ?
3. **Plafond d'heures journalier** — valeur retenue pour le contrôle de saisie
4. **Politique de mots de passe** — durée de validité, historique
5. **Annuaire d'entreprise** — le produit doit-il se raccorder à un annuaire existant, ou rester autonome ?
6. **Périmètre mobile** — quelles actions doivent être réalisables depuis un téléphone ?
7. **Rétention** — durée de conservation du journal d'audit et de l'historique
8. **Priorité de mise en service** — quels modules dans la première livraison ?

---

*Fin du cahier des charges fonctionnel.*
