# Briefs de conception par vue

**Document compagnon du cahier des charges fonctionnel.**
Chaque section est un brief autonome, conçu pour être copié tel quel dans une conversation de conception d'interface. Une vue = un prompt.

---

## Mode d'emploi

1. **Injecte le § A (contexte commun) une fois** en tête de conversation. Il pose le produit, les acteurs et les conventions communes à toutes les vues.
2. **Ajoute ensuite le brief de la vue** à maquetter.
3. Si tu maquettes plusieurs vues dans la même conversation, le § A n'est à donner qu'une fois.

Le § B (coquille applicative) est nécessaire pour toute vue authentifiée : c'est le cadre dans lequel la vue s'inscrit.

**Conventions de lecture des briefs**

| Rubrique | Contenu |
| --- | --- |
| **Objet** | Ce que la vue permet de faire, en une phrase |
| **Utilisateurs** | Qui l'ouvre, et à quelle fréquence |
| **Structure** | Découpage en zones, de haut en bas |
| **Données** | Ce qui est affiché, champ par champ |
| **Actions** | Ce que l'utilisateur peut déclencher |
| **États** | Vide · Chargement · Erreur · Droits insuffisants · Cas limites |
| **Variantes** | Ce qui change selon le rôle ou le contexte |
| **Attention** | Le piège de conception propre à cette vue |

---

# § A — Contexte commun

> À injecter une fois en tête de conversation.

## Le produit

Application web de **pilotage des projets et des ressources humaines**, destinée à une collectivité territoriale organisée en Directions → Départements → Services.

Son principe directeur : **une seule grille temporelle réconcilie tout ce qui occupe une personne**. Congé, télétravail, tâche de projet, tâche hors projet, permanence récurrente et réunion sont des occupations de même nature du point de vue du planning, et s'affichent dans une vue unique croisant personnes × jours.

## Les acteurs

| Persona | Profil | Attente |
| --- | --- | --- |
| **Camille** | Agent contributeur | Voir ses tâches du jour, déclarer congés et télétravail sans friction, saisir son temps en quelques secondes. N'ouvrira jamais un rapport. |
| **Driss** | Chef de projet | Structurer en jalons, savoir qui est disponible quand, repérer retards et dépendances qui glissent. |
| **Fatou** | Manager de service (12 agents) | Valider les congés en connaissant l'impact sur le service, repérer les surcharges, suivre un agent. |
| **Hugo** | Responsable RH | Paramétrer types de congés et soldes, importer en masse, contrôler. |
| **Inès** | Direction | Se connecte une fois par mois. Veut la santé du portefeuille en une page. |
| **Karim** | Administrateur | Comptes, rôles, calendrier, audit. |

## Vocabulaires imposés

**Statut de projet** — Brouillon · Actif · Suspendu · Terminé · Annulé
**Statut de tâche** — À faire · En cours · En revue · Terminé · Bloqué
**Statut de jalon** — En attente · En cours · Terminé
**Priorité** — Basse · Normale · Haute · Critique
**Statut de congé** — En attente · Approuvé · Refusé · Annulé (+ état transitoire : Annulation demandée)
**Type d'activité (temps)** — Développement · Réunion · Support · Formation · Autre
**Catégorie de compétence** — Technique · Méthodologie · Savoir-être · Métier
**Niveau de compétence** — Débutant · Intermédiaire · Expert · Maître
**Période de journée** — Matin · Après-midi · Journée entière
**Santé de projet** — Bon · Attention · Critique

## Règles d'interface valables partout

1. Toute action destructrice est confirmée en **nommant l'objet** et en énonçant ses conséquences.
2. Toute liste a un **état vide qui explique et propose l'action suivante** — jamais une zone blanche.
3. Une action interdite est **masquée ou désactivée avec explication au survol** — jamais proposée puis refusée.
4. Les messages d'erreur sont en langue naturelle et **actionnables** : ils disent quoi faire.
5. Interface **en français**, entièrement traduisible (prévoir des libellés anglais 30 % plus longs).
6. **Thème clair et sombre** tous deux traités.
7. **Accessibilité RGAA** : navigation clavier complète, contrastes conformes, libellés d'assistance sur les grilles denses.
8. Les vues denses (planning, matrices, Gantt) sont **optimisées pour le poste de travail** ; les vues de consultation et de saisie courante sont utilisables sur mobile.

## Cadrage graphique

Registre **institutionnel contemporain** : crédible en collectivité territoriale, sans tomber dans le template SaaS générique ni dans l'austérité administrative.

- Une **couleur d'accent unique et affirmée**, employée avec parcimonie — la couleur doit rester porteuse de sens (statuts, alertes, catégories), jamais décorative.
- **Hiérarchie par la typographie et l'espacement** avant la couleur.
- Beaucoup de blanc sur les vues de consultation ; densité assumée sur les vues de pilotage.
- Bordures et séparateurs nets plutôt qu'ombres diffuses.

---

# § B — Coquille applicative

> Nécessaire pour toute vue authentifiée. À donner avec le § A.

**Objet** — Le cadre permanent dans lequel s'affiche chaque vue.

**Structure**

1. **Barre latérale de navigation**, repliable en icônes seules.
   Groupes : *Pilotage* (Tableau de bord, Planning, Rapports) · *Projets* (Projets, Tâches, Événements) · *Ressources humaines* (Congés, Télétravail, Temps passé, Compétences) · *Référentiels* (Utilisateurs, Départements, Tiers, Clients) · *Administration* (Rôles, Journal d'audit, Tâches prédéfinies, Paramètres).
2. **En-tête** : fil d'Ariane · recherche globale · sélecteur de langue (FR/EN) · bascule de thème · cloche de notifications avec pastille de non-lues · menu utilisateur (avatar, nom, rôle → Mon profil, Déconnexion).
3. **Zone de contenu**.

**Données** — Identité et avatar de l'utilisateur, son rôle, nombre de notifications non lues.

**Actions** — Naviguer · replier la barre latérale · ouvrir le panneau de notifications · changer de langue · changer de thème · se déconnecter.

**États**
- *Notifications vides* : « Aucune notification ».
- *Panneau de notifications* : liste horodatée, non-lues distinguées, action « Tout marquer comme lu », clic sur une notification → navigation vers l'objet concerné.
- *Mobile* : barre latérale en tiroir, en-tête condensé.

**Variantes par rôle** — **Les entrées de menu auxquelles l'utilisateur n'a pas droit ne sont pas affichées.** Camille (contributeur) ne voit ni Administration, ni Rapports, ni Utilisateurs — sa barre latérale tient en 8 entrées. Karim (admin) les voit toutes.

**Attention** — La barre latérale doit rester lisible à 8 entrées comme à 20. Prévoir le cas où un groupe entier disparaît.

**Types de notification à représenter** — Nouvelle tâche assignée · Demande de congé à valider · Décision sur votre demande de congé · Tâche à échéance proche · Tâche en retard · Ajout à un projet.

---

# § C — Inventaire des vues

| # | Vue | Priorité | Densité |
| --- | --- | --- | --- |
| 01 | Connexion | Haute | Faible |
| 02 | Inscription | Basse | Faible |
| 03 | Mot de passe oublié | Basse | Faible |
| 04 | Réinitialisation du mot de passe | Basse | Faible |
| 05 | Changement de mot de passe imposé | Moyenne | Faible |
| 06 | Tableau de bord | **Critique** | Moyenne |
| 07 | Planning — Semaine | **Critique** | **Très forte** |
| 08 | Planning — Mois | **Critique** | **Très forte** |
| 09 | Planning — Activité | Haute | Forte |
| 10 | Portefeuille de projets | Haute | Moyenne |
| 11 | Projet — Vue d'ensemble | Haute | Moyenne |
| 12 | Projet — Tâches (kanban) | Haute | Forte |
| 13 | Projet — Jalons (feuille de route) | Haute | Moyenne |
| 14 | Projet — Équipe | Moyenne | Faible |
| 15 | Projet — Gantt | Moyenne | Forte |
| 16 | Tâches (vue globale) | Haute | Forte |
| 17 | Fiche tâche | Haute | Moyenne |
| 18 | Événements | Moyenne | Moyenne |
| 19 | Congés | **Critique** | Forte |
| 20 | Télétravail | Haute | Moyenne |
| 21 | Temps passé | Haute | Moyenne |
| 22 | Compétences | Moyenne | **Très forte** |
| 23 | Tiers | Basse | Faible |
| 24 | Fiche tiers | Basse | Faible |
| 25 | Clients | Basse | Faible |
| 26 | Fiche client | Basse | Faible |
| 27 | Utilisateurs | Haute | Moyenne |
| 28 | Suivi individuel | Haute | Forte |
| 29 | Départements & services | Moyenne | Moyenne |
| 30 | Rapports & analytics | Haute | Forte |
| 31 | Paramètres | Moyenne | Moyenne |
| 32 | Rôles & permissions | Moyenne | **Très forte** |
| 33 | Journal d'audit | Basse | Moyenne |
| 34 | Catalogue des tâches prédéfinies | Moyenne | Moyenne |
| 35 | Mon profil | Moyenne | Faible |

> **Si tu ne maquettes que cinq vues, prends les 06, 07, 12, 19 et 30.** Elles portent l'essentiel de la difficulté de conception.

---

# Vue 01 — Connexion

**Objet** — Entrer dans l'application.

**Utilisateurs** — Tous, chaque matin.

**Structure** — Page pleine, sans coquille applicative. Deux zones : identité du produit (nom, signature, visuel) et formulaire.

**Données** — Champ « Identifiant ou email » · Champ « Mot de passe » (avec bascule d'affichage) · Lien « Mot de passe oublié ? » · Bouton « Se connecter » · Lien secondaire « Pas encore de compte ? S'inscrire ».

**Actions** — Se connecter · aller vers la réinitialisation · aller vers l'inscription · changer la langue.

**États**
- *Soumission* : bouton en cours, champs verrouillés, libellé « Connexion… ».
- *Identifiants invalides* : « Identifiant ou mot de passe incorrect » en rouge, **les champs restent remplis**.
- *Compte verrouillé* : « Trop de tentatives de connexion. Réessayez plus tard. »
- *Champ vide* : « L'identifiant est requis » / « Le mot de passe est requis ».
- *Succès* : confirmation brève puis redirection vers le tableau de bord.

**Variantes** — Quand l'inscription autonome est désactivée, le lien « S'inscrire » **disparaît entièrement**. Prévoir les deux versions.

**Attention** — Le message d'échec ne doit jamais laisser deviner si l'identifiant existe. Un seul message pour les deux cas.

---

# Vue 02 — Inscription

**Objet** — Créer son compte quand l'organisation l'autorise.

**Structure** — Même gabarit que la connexion.

**Données** — Prénom · Nom · Adresse email · Identifiant · Mot de passe · Confirmation du mot de passe · Bouton « S'inscrire » · Lien « Déjà un compte ? Se connecter ».

**Actions** — S'inscrire · retourner à la connexion.

**États**
- *Politique de mot de passe* : indicateur en direct des règles (8 caractères, une majuscule, un chiffre, un caractère spécial), chaque critère validé au fil de la frappe.
- *Mots de passe différents* : « Les mots de passe ne correspondent pas ».
- *Email déjà pris* : « Cet email est déjà utilisé ».
- *Identifiant déjà pris* : « Ce login est déjà utilisé ».
- *Domaine non autorisé* : « Les inscriptions sont réservées aux adresses des domaines autorisés ».
- *Fonction désactivée* : « La création de compte autonome est désactivée » — page atteinte par URL directe, avec retour vers la connexion.

**Attention** — Six messages d'erreur distincts à loger sans que le formulaire ne saute.

---

# Vue 03 — Mot de passe oublié

**Objet** — Demander un lien de réinitialisation.

**Structure** — Gabarit de connexion, très épuré.

**Données** — Champ email · Bouton « Envoyer le lien » · Lien de retour.

**États**
- *Envoyé* : message de confirmation **volontairement neutre** — il ne révèle pas si l'adresse existe.
- *Fonction non disponible* : « Contactez votre administrateur pour réinitialiser votre mot de passe. »

**Attention** — La confirmation est identique que l'adresse existe ou non.

---

# Vue 04 — Réinitialisation du mot de passe

**Objet** — Définir un nouveau mot de passe depuis un lien reçu.

**Données** — Nouveau mot de passe · Confirmation · Indicateur de politique en direct · Bouton « Réinitialiser ».

**États**
- *Jeton expiré* : « Ce token de réinitialisation a expiré », avec bouton pour en redemander un.
- *Jeton déjà utilisé* : « Ce token de réinitialisation a déjà été utilisé ».
- *Jeton invalide* : « Token de réinitialisation invalide ».
- *Succès* : confirmation puis redirection vers la connexion.

**Attention** — Les trois cas d'échec de jeton sont **des messages distincts**, chacun avec sa sortie.

---

# Vue 05 — Changement de mot de passe imposé

**Objet** — Contraindre un utilisateur à changer son mot de passe initial avant tout accès.

**Structure** — Page pleine, **sans navigation** : l'utilisateur ne peut pas s'échapper.

**Données** — Message expliquant pourquoi · Mot de passe actuel · Nouveau · Confirmation · Indicateur de politique.

**États** — *Ancien mot de passe incorrect* : « Ancien mot de passe incorrect ».

**Attention** — Aucune issue latérale, et l'utilisateur doit comprendre pourquoi il est bloqué là.

---

# Vue 06 — Tableau de bord

**Objet** — Page d'accueil personnelle : ce qui concerne l'utilisateur aujourd'hui.

**Utilisateurs** — Tous, plusieurs fois par jour. C'est la vue la plus consultée du produit.

**Structure**

1. **Accueil nominatif** — « Bonjour {Prénom} » + « Voici un aperçu de votre activité ».
2. **Quatre indicateurs** — Projets actifs (« sur {n} projets ») · Tâches en cours (« sur {n} tâches ») · Tâches terminées (« {n} % complétées ») · Tâches en retard (« Échéance dépassée »).
3. **Mon planning** — extrait du planning personnel de la période.
4. **Mes tâches** — sélecteur : *À venir* / *Non déclarées*.
5. **Ma To-Do** — liste privée.
6. **Mes projets**.

**Données**

- *Mes tâches à venir* : titre, projet (ou « Sans projet »), dates de début et fin, estimation, marqueur « En retard », sélecteur de statut en ligne, **champ de saisie rapide d'heures** (une frappe, unité « h »).
- *Mes tâches non déclarées* : tâches terminées sans temps déclaré, avec case « Valider sans déclaration ».
- *Ma To-Do* : libellé, case à cocher, complétées regroupées à part avec leur compte.

**Actions** — Changer le statut d'une tâche · saisir des heures sur une tâche · valider une tâche sans déclaration · ajouter / éditer (double-clic) / supprimer une to-do · naviguer vers un projet ou une tâche.

**États**
- *Aucune tâche* : « Aucune tâche assignée ».
- *Aucune to-do* : « Aucune to-do pour le moment » + indice « Double-cliquer pour éditer ».
- *Limite de to-do atteinte* : « Limite de {n} to-dos atteinte », champ de saisie désactivé.
- *Aucun projet* : « Aucun projet assigné ».
- *Aucune tâche non déclarée* : « Aucune tâche en attente de validation ».
- *Saisie rapide* : indication si du temps a déjà été déclaré sur la tâche, tous contributeurs confondus.

**Variantes** — Pour Camille (contributeur), c'est la seule page qu'elle ouvre : elle doit être **complète en un écran, sans défilement**. Pour Inès (direction), les indicateurs personnels ont peu de sens — prévoir que la vue reste digne quand tous les compteurs sont à zéro.

**Attention** — Concilier deux natures : consultation (indicateurs, planning) et **saisie rapide** (statut, heures, to-do). La saisie doit se faire sans quitter la page ni ouvrir de fenêtre.

---

# Vue 07 — Planning, vue Semaine

> **La vue centrale du produit.** C'est celle qui justifie son existence. Si une seule vue doit être exemplaire, c'est celle-ci.

**Objet** — Répondre d'un coup d'œil à : *qui est disponible, quand, et sur quoi ?*

**Utilisateurs** — Fatou (manager) quotidiennement, Driss (chef de projet) plusieurs fois par semaine.

**Structure**

1. **Barre d'outils** — Titre « Planning des Ressources » · bascule *Semaine / Mois / Activité* · navigation ‹ › + « Aujourd'hui » · libellé « Semaine du {début} au {fin} » · bouton « Créer » (menu : Tâche / Événement).
2. **Barre de filtres** — Services (multi-sélection, « Tous » / « Aucun » / « {n} services ») · Département · bouton « Mon périmètre » · Ressource · **Affichage** : cases Disponibilités, Activités, Tâches projets, Tâches hors projets, Événements.
3. **Grille** — Colonne de gauche « Ressource », puis une colonne par jour visible.
4. **Ligne de synthèse** — « Hors présentiel » : par jour, `{n}/{total} ({pourcentage} %)`.
5. **Légende filtrante** — sections dépliables : Statuts de tâches · Type de tâche · Présence · Absences · Événements. Chaque entrée agit comme un filtre. Bouton « Tout afficher ».

**Données**

Les ressources sont **groupées par service**, chaque groupe repliable individuellement, avec en-tête « {Service} · {n} personnes » et actions « Replier tous les services » / « Déplier tous les services ». Un groupe replié affiche « (replié) » et le nombre de tâches agrégées.

Contenu possible d'une cellule jour × personne, cumulable :

| Élément | Représentation |
| --- | --- |
| Tâche de projet | Pastille colorée par statut, titre tronqué, icône de projet |
| Tâche hors projet | **Visuellement distincte** de la tâche projet |
| Congé validé | Aplat, couleur et icône du type de congé |
| Congé en attente | **Distinct du congé validé** — mention « En attente » |
| Télétravail | Marqueur « Télétravail » |
| Bureau déclaré | Marqueur « Bureau » |
| Événement | Marqueur distinct ; « Intervention ext. » (abrégé « EXT ») si externe |
| Permanence | Issue du catalogue de tâches prédéfinies, couleur et icône propres |
| Demi-journée | « Matin » / « Après-midi » — la cellule se scinde |
| Journée entière | Occupe toute la cellule |

**Trame de fond** — jours fériés et vacances scolaires en fond de colonne, sans masquer le contenu. Le jour courant est marqué.

**Actions**
- Basculer le télétravail d'un agent **directement dans la cellule**.
- Déplacer une tâche par glisser-déposer : changement de date (autre colonne) ou d'assigné (autre ligne).
- Cliquer une tâche ou un événement → panneau de détail latéral (description, statut, priorité, estimation, horaires, progression ; pour un événement : type, projet, participants, récurrence, action « Arrêter la récurrence »).
- Créer une tâche ou un événement depuis la barre d'outils, ou depuis une cellule vide.
- Exporter en ICS, importer un ICS.

**États**
- *Aucune ressource* : « Aucune ressource à afficher » — souvent dû aux filtres ; le proposer explicitement.
- *Chargement* : « Chargement du planning… », squelette de grille conservant la structure.
- *Télétravail en lecture seule* : « Lecture seule — permission requise ».
- *Tâche multi-assignée déplacée en date* : « Tâche multi-assignée : changement de date impossible. Modifiez les dates via le détail de la tâche. »
- *Tâche multi-assignée, changement d'assigné* : « Tâche multi-assignée : seul l'assigné a été modifié. La date reste inchangée pour tous les assignés. »
- *Agent déjà assigné* : « Cet utilisateur est déjà assigné à cette tâche. »
- *Modification enregistrée mais rafraîchissement échoué* : « Modification enregistrée, mais l'affichage n'a pas pu être actualisé — données possiblement périmées. »

**Variantes** — Sans droit de gestion globale, la grille est restreinte au périmètre de l'utilisateur (son département ∪ les départements de ses services ; toute sa direction s'il en est responsable). Les permanences n'apparaissent que si l'utilisateur a le droit de les consulter.

**Attention** — **C'est le problème de conception principal du produit.** Une cellule peut contenir six informations de natures différentes, sur une grille de 20 lignes × 5 colonnes, sans devenir illisible. La réponse doit passer par la hiérarchie visuelle et les couches activables, pas par l'entassement. Le repli par service et les filtres d'affichage sont les soupapes : ils doivent être immédiatement accessibles, pas enfouis.

Les jours visibles sont paramétrables : prévoir 5 colonnes (semaine ouvrée) **et** 7 colonnes.

---

# Vue 08 — Planning, vue Mois

**Objet** — Même grille, sur un mois entier.

**Structure** — Identique à la vue Semaine, avec ~22 colonnes au lieu de 5.

**Attention** — **C'est la vue la plus contrainte du produit.** Les cellules deviennent étroites : il faut une représentation dégradée mais toujours lisible. Pistes à explorer : réduire à des pastilles de couleur sans texte, agréger par type d'occupation, faire du survol le vecteur du détail. La colonne « Ressource » reste figée au défilement horizontal, et la ligne d'en-tête des jours au défilement vertical.

La ligne de synthèse « Hors présentiel » prend ici toute sa valeur : elle donne la tendance du mois d'un seul regard.

---

# Vue 09 — Planning, vue Activité

**Objet** — Piloter l'activité récurrente : permanences, astreintes, accueil.

**Structure** — Grille **inversée** : jours en lignes, tâches prédéfinies en colonnes. Libellé d'assistance : « Grille d'activité — jours en lignes, tâches en colonnes ».

**Données** — Colonne « Jour ». Chaque cellule liste les agents affectés (avatar + nom), avec « +{n} » au-delà d'un seuil. Cellule vide : « — ».

**Actions**
- « Ajouter » dans une cellule → fenêtre « Ajouter des agents », sous-titre « {Nom de la tâche} · {date} ».
- Changer le statut de réalisation d'une assignation.
- « Imprimer ».

**Fenêtre d'ajout d'agents** — Liste des agents, chacun avec sa **raison d'inéligibilité** le cas échéant : « déjà assigné » · « en congé · {type} » · « en télétravail ». Compteur « {n} agent(s) sélectionné(s) ». Bouton « Ajouter ({n}) ».

**États**
- *Aucune tâche active* : « Aucune tâche prédéfinie active ».
- *Aucun agent éligible* : « Tous les agents sont déjà assignés, en congé ou en télétravail ce jour. »
- *Succès* : « {n} assignation(s) créée(s) ».

**Attention** — L'inversion des axes par rapport aux vues Semaine et Mois est délibérée mais désorientante. La transition entre les trois modes doit être explicite.

Cette vue est **imprimée et affichée en salle de service** : la version imprimée doit être soignée, en noir et blanc lisible.

---

# Vue 10 — Portefeuille de projets

**Objet** — Parcourir et filtrer l'ensemble des projets.

**Structure** — En-tête (titre, compteur « {n} projet(s) » ou « {n} projet(s) sur {total} » si filtré, bouton « Créer un projet ») · Barre de filtres (recherche par nom ou description, statut, priorité) · Grille de cartes.

**Données par carte** — Icône du projet · Nom · Description (ou « Aucune description ») · Pastille de statut · Pastille de priorité · Dates début et fin · Budget en heures · Chef de projet (avatar) · Barre de progression.

**Actions** — Créer · ouvrir · filtrer · rechercher.

**Fenêtre de création** — Nom\* · Description · Statut · Priorité · Date de début\* · Date de fin\* · Responsable du projet\* · Sponsor · Département · Budget en heures · **Sélecteur d'icône**.

**Sélecteur d'icône** — Bibliothèque avec recherche (« Rechercher une icône… ») et catégories : Gestion · Numérique · Finances · RH · Territoire · Social · Culture & Éducation · Sécurité · Environnement · Juridique · Symboles. États : « Aucune icône », « Aucune icône trouvée ».

**États**
- *Aucun projet* : « Aucun projet trouvé » — distinguer « aucun projet n'existe » (proposer d'en créer un) de « aucun ne correspond au filtre » (proposer de réinitialiser).
- *Champs obligatoires manquants* : « Veuillez remplir tous les champs obligatoires ».

**Variantes** — Un utilisateur ne voit que les projets dont il est créateur, chef de projet, sponsor ou membre — sauf droit de gestion globale.

**Attention** — L'icône de projet est un repère d'identification fort, réutilisé dans le planning, les tâches et le Gantt. Le sélecteur mérite plus de soin qu'un champ de formulaire ordinaire.

---

# Vue 11 — Projet, onglet Vue d'ensemble

**Objet** — L'état du projet en une page.

**Structure**

1. **En-tête de projet** — Retour « ← Retour aux projets » · Icône · Nom · Statut · Priorité · Actions (Modifier, Supprimer).
2. **Onglets** — Vue d'ensemble · Tâches ({n}) · Jalons ({n}) · Équipe ({n}) · Gantt.
3. **Quatre indicateurs** — Progression · Tâches (« {n} en cours, {n} bloquées ») · Budget (« sur {total} h, {n} h restantes ») · Équipe (« {n} épopées, {n} jalons »).
4. **Informations du projet** — Date de début · Date de fin · Budget heures · Créé le · Créé par. Valeurs absentes : « Non renseigné ».
5. **Feuille de route** — aperçu des jalons.
6. **Historique des instantanés** (`EX-PRJ-13`) — liste chronologique décroissante des relevés d'avancement : date du relevé, progression, tâches terminées sur total, heures consommées. Un relevé est capturé automatiquement chaque nuit (`RG-PRJ-09`) ; l'action « Capturer un instantané » de l'en-tête fige l'avancement du jour sans attendre.

**Sélecteur d'icône** — La fenêtre « Modifier » est celle de la vue 10, sélecteur d'icône compris : l'icône se change après la création, elle ne se choisit pas une fois pour toutes.

**Fenêtre de suppression** — Titre « Supprimer le projet » · « Êtes-vous sûr de vouloir supprimer définitivement le projet "{nom}" ? » · Encart d'avertissement : « Cette action est irréversible. Le projet et toutes ses données (tâches, jalons, membres) seront supprimés définitivement. » · Bouton « Supprimer définitivement ».

**États**
- *Projet annulé* : bandeau « Ce projet est annulé. Utilisez le point de restauration dédié pour le réactiver. » — toute modification bloquée.
- *Projet archivé* : bandeau, avec action « Désarchiver ».
- *Suppression définitive impossible* : « Impossible de supprimer définitivement ce projet : des données historiques y sont rattachées. Archivez-le plutôt. »
- *Aucun instantané* : « Aucun instantané pour ce projet » — avec sa sortie : le relevé nocturne remplira la liste, et l'action d'en-tête n'attend pas la nuit.

**Attention** — Trois états d'existence coexistent (actif, annulé, archivé) et doivent être visuellement immédiats. La progression et le budget consommé sont **calculés**, jamais saisis : ne pas suggérer qu'ils sont modifiables.

**Arbitrage — où vit l'historique des instantanés.** Le cadrage était muet ; deux hôtes se défendaient. L'onglet Gantt (vue 15) répond à « **quand** » : il place des tâches dans le temps et n'a aucune commande de capture. La vue d'ensemble répond à « **où en est-on** », porte déjà l'action « Capturer un instantané » et l'indicateur « Dernier instantané » — qui n'en montrait qu'un seul point. L'historique est donc rendu ici, **sous la commande qui le produit** : capturer et voir la ligne apparaître est ce qui prouve que le produit écrit ce qu'il dit écrire. Décidé à l'implémentation, vague 7-5.

---

# Vue 12 — Projet, onglet Tâches (kanban)

**Objet** — Piloter les tâches du projet.

**Structure** — Barre d'outils (« Tableau des tâches », recherche, « + Nouvelle tâche », « Importer CSV », « Import projet (jalons + tâches) ») · Tableau kanban à cinq colonnes : **À faire · En cours · En revue · Terminé · Bloqué**.

**Données par carte** — Titre · Priorité · Avatars des assignés (« {n} assignés » au-delà d'un seuil) · Estimation « {n} h estimées » · Barre de progression · Marqueur « En retard » · Jalon de rattachement · Marqueur « Tâche indépendante » si hors projet.

**Actions** — Glisser-déposer entre colonnes · ouvrir une tâche · créer · rechercher · importer.

**Fenêtre d'import projet** — Deux modes présentés côte à côte :
- **Ajouter** — « Conserve les jalons et tâches existants, ajoute le contenu du fichier. »
- **Remplacer** — « Supprime les jalons, tâches et sous-tâches existants puis importe le contenu du fichier (tout ou rien). »

Le mode Remplacer déclenche une **confirmation dédiée** : « Action irréversible : le contenu actuel du projet sera supprimé puis remplacé par le contenu du fichier. En cas d'erreur sur une ligne, rien n'est supprimé. » avec les volumes : « {n} jalon(s), {n} tâche(s) et {n} sous-tâche(s) seront supprimés. » Si le remplacement est impossible : « Remplacement impossible — Des données rattachées au projet empêchent le remplacement : » suivi de la liste.

Tout import passe par une **prévisualisation** avant exécution, puis un compte rendu : importés / ignorés (doublons) / en erreur, avec le détail des erreurs.

**États**
- *Colonne vide* : « Aucune tâche ».
- *Déplacement réussi* : « Statut mis à jour ».
- *Déplacement échoué* : « Erreur lors de la mise à jour du statut », **carte remise à sa place d'origine**.

**Attention** — Les colonnes *À faire* et *Terminé* ne peuvent jamais être masquées. Le glisser-déposer doit être doublé d'une alternative clavier accessible.

---

# Vue 13 — Projet, onglet Jalons (feuille de route)

**Objet** — Voir la trajectoire du projet dans le temps.

**Structure** — En-tête « Feuille de route » + « Vue chronologique des jalons et des tâches du projet » · Actions (+ Nouveau jalon, + Nouvelle tâche, Importer CSV) · Quatre indicateurs (Jalons · Terminés · En cours · Tâches) · Chronologie verticale.

**Données par jalon** — Nom · Date d'échéance (ou « Aucune date ») · Statut · « {n} tâche(s) » · Barre de progression · Bouton « Afficher » / « Masquer » les tâches. Chaque tâche affiche titre, statut modifiable en ligne, assignés, estimation.

**Fenêtre de jalon** — Nom\* · Description · Date d'échéance · **Encart explicatif** : « Statut calculé automatiquement — Le statut du jalon est déterminé en fonction de l'avancement de ses tâches. »

**États**
- *Aucun jalon* : « Aucun jalon défini » + « Créez votre premier jalon pour structurer votre projet » + bouton « + Créer un jalon ».
- *Jalon sans tâche* : « Aucune tâche dans ce jalon ».
- *Nom manquant* : « Le nom du jalon est requis ».

**Attention** — Le statut du jalon est **calculé, jamais saisi**. C'est contre-intuitif : l'encart explicatif doit être visible, pas relégué en aide contextuelle.

---

# Vue 14 — Projet, onglet Équipe

**Objet** — Gérer qui travaille sur le projet et à quelle hauteur.

**Structure** — En-tête « Membres de l'équipe » + « + Ajouter un membre » · Liste des membres.

**Données par membre** — Avatar · Nom · Rôle projet · « Allocation : {n} % » · Action « Retirer du projet ».

**Rôles projet** — Sponsor · Chef de projet · Responsable technique · Architecte · Tech Lead · Développeur Senior · Développeur · Développeur Junior · DevOps · QA Lead · Testeur · UX/UI Designer · Product Owner · Scrum Master · Analyste métier · Membre · Observateur.

**Actions** — Ajouter (Utilisateur\*, Rôle dans le projet, Allocation %) · modifier · retirer.

**États**
- *Aucun membre* : « Aucun membre ».
- *Retrait* : « Voulez-vous vraiment retirer {nom} de l'équipe ? »
- *Doublon* : « Cet utilisateur est déjà membre du projet ».
- *Aucun utilisateur choisi* : « Veuillez sélectionner un utilisateur ».

**Attention** — Cette vue accueille aussi les **tiers externes** et les **clients** rattachés au projet, qui ne sont pas des utilisateurs. Prévoir leur distinction visuelle : un prestataire n'est pas un agent.

---

# Vue 15 — Projet, onglet Gantt

**Objet** — Voir les tâches dans le temps et leurs dépendances.

**Structure** — Sélecteur d'échelle (Jour / Semaine / Mois) · Colonne des tâches à gauche · Zone temporelle à droite · Indice : « Cliquez sur une tâche pour voir ses dépendances, double-cliquez pour les modifier. »

**Données** — Barre par tâche, colorée par statut, avec avancement · Flèches de dépendance · Marqueurs de jalons · Ligne « Aujourd'hui » · Regroupement par jalon.

**Actions** — Changer d'échelle · sélectionner une tâche (met en évidence ses dépendances) · double-cliquer (ouvre la modification des dépendances) · déplacer une barre.

**États**
- *Aucune tâche datée* : « Aucune tâche avec des dates » + « Ajoutez des dates de début et de fin aux tâches pour les voir dans le Gantt ».
- *Conflit de dates* : bandeau « Attention : incohérences de dates détectées », avec « Voir {n} autre(s) conflit(s) » / « Réduire ».
- *Décalage en cascade* : « Décaler aussi {n} tâche(s) dépendante(s) ? »

**Attention** — Les flèches de dépendance deviennent illisibles au-delà d'une vingtaine de tâches. Prévoir de ne les afficher qu'à la sélection.

---

# Vue 16 — Tâches (vue globale)

**Objet** — Toutes les tâches, tous projets confondus, y compris hors projet.

**Structure** — En-tête (titre, « {n} tâche(s) », « Créer une tâche ») · Filtres (Projet, Priorité, « Tâches sans projet », « En retard ») · Bascule Liste / Kanban.

**Données** — Comme la vue 12, plus la colonne Projet. Une tâche hors projet porte le marqueur « Tâche indépendante ».

**Fenêtre de création** — Titre\* · Description · **Projet** (avec option « Aucun projet (tâche indépendante) » et l'indice « Laissez vide pour une tâche hors projet (réunion, transverse…) ») · Assignés · **Services** (« Inviter des services entiers ») · Statut · Priorité · Dates · Horaires de début et de fin · Estimation · Jalon · « Intervention extérieure ».

**États**
- *Aucune tâche* : « Aucune tâche ».
- *Assignés selon le projet* : si le projet a des membres, indice « Membres du projet » ; sinon « Aucun membre dans ce projet — tous les utilisateurs sont affichés ».
- *Jalon* : « Sélectionnez d'abord un projet » tant qu'aucun projet n'est choisi.
- *Titre manquant* : « Le titre est obligatoire ».

**Attention** — **La tâche hors projet est un cas nominal**, pas une anomalie : réunions, travail transverse, sollicitations ponctuelles. Elle doit être nommée et assumée dans l'interface, jamais présentée comme une donnée incomplète — ni comme un champ « projet » resté vide.

---

# Vue 17 — Fiche tâche

**Objet** — Tout sur une tâche, et tout ce qu'on peut y faire.

**Structure**

1. **En-tête** — Retour · Titre (éditable en place) · Statut · Priorité · Actions (Modifier, Supprimer).
2. **Colonne principale** — Description · Sous-tâches · Dépendances · Commentaires · Documents.
3. **Colonne latérale** — Projet · Jalon · Épopée · Assignés · RACI · Dates · Horaires · Estimation · Progression · Créée le · Mise à jour · Tiers assignés.

**Sous-tâches** — Liste ordonnable par glisser-déposer, case à cocher, ajout en ligne, suppression.

**Dépendances** — Deux listes : « Dépend de ({n}) » et « Bloque ({n}) ». Chaque entrée : titre, statut, date de fin (« Fin : »), lien « Voir les détails ». Modification via « Modifier les dépendances » → sélecteur multiple avec recherche, indice « Sélectionnez les tâches qui doivent être terminées avant celle-ci », compteur « {n} dépendance(s) sélectionnée(s) » et, le cas échéant, « dont {n} conflit(s) de dates ».

**RACI** — Quatre rôles attribuables : Responsable · Autorité · Consulté · Informé.

**Progression** — Curseur 0–100 %.

**États**
- *Aucune description* : « Aucune description ».
- *Aucune dépendance* : « Aucune dépendance ».
- *Aucune tâche dépendante* : « Aucune tâche dépendante ».
- *Tâche prérequise supprimée* : « Tâche supprimée » (l'entrée reste visible).
- *Conflit de dates* : bandeau « Attention : incohérences de dates détectées ».
- *Dépendance circulaire* : « Cette dépendance créerait un cycle : la tâche finirait par dépendre d'elle-même ». *(Formulation arrêtée le 2026-08-31. La précédente — « créerait une dépendance circulaire » — se contentait de renommer le refus ; `RG-GEN-03` veut un message qui dit ce qui se passerait. Le produit portait déjà celle-ci ; c'est le brief qui était en retard.)*
- *Suppression bloquée* : « Impossible de supprimer une tâche dont d'autres tâches dépendent ».
- *Décalage en cascade* : « Décaler aussi {n} tâche(s) dépendante(s) ? »
- *Aucune tâche disponible* : « Aucune tâche disponible » / « Aucune tâche trouvée ».

**Attention** — C'est la vue la plus dense en objets liés : sous-tâches, dépendances dans les deux sens, RACI, commentaires, documents, tiers. Sans hiérarchie forte, elle devient un formulaire interminable. Ce qui compte au quotidien — statut, assignés, avancement — doit être atteignable sans défilement.

---

# Vue 18 — Événements

**Objet** — Réunions, interventions et rendez-vous, récurrents ou non.

**Structure** — En-tête (titre, « {n} événement(s) », « Créer un événement ») · Filtre par projet · Bascule **Liste / Calendrier**.

**Données** — Titre · Date · Horaires ou « Toute la journée » · Projet · « {n} participant(s) » · Marqueur « Intervention ext. ».

**Fenêtre de création** — Titre\* · Description · Date\* · Case « Toute la journée » (masque les horaires) · Heure de début / de fin · Projet · Participants · **Services** (« Inviter des services entiers ») · « Intervention extérieure » · **Case « Événement récurrent »** dépliant : « Toutes les X semaines », « Jour de la semaine » (avec option « Automatique (même jour que la date) »), « Date de fin (optionnelle) ».

**Panneau de détail** — Description · Date · Horaires · Type · Projet · Participants · **Récurrence** : « Fait partie d'une série récurrente », « Toutes les {n} semaine(s) », « Le {jour} », « Jusqu'au {date} », bouton « Arrêter la récurrence ».

**États**
- *Aucun événement* : « Aucun événement trouvé ».
- *Vue calendrier* : « Vue calendrier simplifiée — Affichage des événements par date ».
- *Arrêt de récurrence* : « Arrêter la récurrence et supprimer les occurrences futures ? » → « Arrêt en cours… » → « Récurrence arrêtée ».
- *Participant en double* : « Cet utilisateur est déjà participant ».
- *Horizon dépassé* : « La date de fin de récurrence ne peut pas dépasser {n} ans après la date de l'événement ».

**Attention** — La distinction entre modifier **une occurrence** et modifier **toute la série** doit être explicite au moment de l'action, pas découverte après coup.

---

# Vue 19 — Congés

> Le module le plus riche en règles du produit. Trois publics très différents cohabitent dans une seule vue.

**Objet** — Demander, valider et administrer les congés.

**Utilisateurs** — Camille (demande, 4 fois par an) · Fatou (valide, chaque semaine) · Hugo (administre, en continu).

**Structure** — En-tête « Gestion des congés » · **Onglets** : Mes demandes · À valider · Toutes les demandes · Délégations (données et reçues, deux listes dans un même onglet) · Types de congés · **Soldes** · Actions (Nouvelle demande, Importer CSV).

> **Arbitrage du 2026-08-31 — le sixième onglet est « Soldes ».** Cette énumération fermait la liste sans lui pendant que la ligne « Variantes » ci-dessous disait « Hugo voit tout, plus les types **et les soldes** ». La contradiction a laissé `PUT /conges/soldes` sans écran pendant tout le projet : la capacité existait, gardée et testée, et **rien ne l'appelait** — donc, sur une instance neuve, aucun solde attribué, et `RG-CNG-20` refusant toute demande. C'est la ligne « Variantes » qui l'emporte, parce qu'elle est la seule des deux à décrire ce que voit un détenteur de `leaves:manage_balances`, quand l'énumération décrivait ce que voit un agent ordinaire. Le compte de six est conservé : les deux listes de délégations tiennent dans un seul onglet, comme la vue les rend.

**Onglet Mes demandes** — Liste : type (icône + couleur), période « Du {date} Au {date} », « {n} jour(s) », statut, validateur assigné, motif. Actions : Modifier, Supprimer, Demander l'annulation.

**Onglet À valider** — Bandeau « {n} demande(s) en attente de validation ». Par demande : demandeur (avatar, service), type, dates, jours, motif. Actions : **Approuver** · **Refuser**.

**Onglet Toutes les demandes** — Filtre « Tous les utilisateurs », mêmes données, vue de contrôle.

**Onglet Délégations** — Deux listes : données et reçues. Par délégation : délégué, période « De … à … », état Active / Inactive, action « Désactiver ». Création : « Déléguer à », « Sélectionner un utilisateur », période, avec l'explication : « Durant cette période, l'utilisateur sélectionné pourra valider les demandes de congé à votre place. »

**Onglet Soldes** — Réservé aux détenteurs de `leaves:manage_balances` (`EX-CNG-10`, `RG-CNG-24`). Choix du **bénéficiaire** — « Défaut global (tous les agents) » en première position, puis un agent — et de l'**année**. Un champ par type de congé actif, avec le nombre de jours attribués et, sous lui, **d'où vient le chiffre** : allocation propre à l'agent, héritage du défaut global, ou aucune allocation. Les deux ne se corrigent pas au même endroit, et corriger le mauvais des deux ne change rien de visible pour l'agent concerné : la provenance se dit donc avant la correction, pas après. Chaque type s'enregistre seul, avec **sa** version (`RG-CNG-23`). *Aucun type actif* : « Aucun type de congé actif » + « Il n'y a rien à attribuer tant que le référentiel des types est vide. Créez-en un dans l'onglet Types de congés. »

**Onglet Types de congés** — Tableau : Code · Nom · Description · Icône · Couleur · Options (Rémunéré / Non rémunéré) · Validation (Requise / Auto) · Limite/an (ou « Illimité ») · Utilisations (« {n} congé(s) ») · Statut (Actif / Inactif / Système). Actions : Nouveau type, Modifier, Désactiver, Réactiver. Case « Afficher les inactifs ».

**Fenêtre de demande** — Type de congé (avec l'indice « Ce type est approuvé automatiquement » quand c'est le cas) · Date de début · Date de fin · **Demi-journée (optionnel)** : Journée complète / Matin / Après-midi · Motif · Avertissement : « Votre demande sera soumise à validation par votre responsable. »

**Fenêtre de refus** — « Refuser la demande » · « Motif du refus (optionnel) » · « Expliquez la raison du refus… » · Bouton « Confirmer le refus ».

**États**
- *Aucune demande* : « Aucune demande de congé » + « Créer ma première demande ».
- *Rien à valider* : « Aucune demande en attente de validation ».
- *Aucune délégation* : « Aucune délégation donnée » / « Aucune délégation reçue ».
- *Solde insuffisant* : « Solde insuffisant pour {type} en {année} : {n} jours demandés, {n} jours disponibles, il manque {n} jours. »
- *Solde devenu insuffisant à l'approbation* : « Solde devenu insuffisant pour approuver cette demande en {année} : … »
- *Chevauchement* : « Cette demande chevauche un congé déjà approuvé pour cet utilisateur » / « Cette demande chevauche une demande de congé existante » / « Cette modification créerait un chevauchement avec une autre demande ».
- *Auto-validation interdite* : « Vous n'êtes pas autorisé à valider cette demande ».
- *Annulation directe interdite* : « Vous ne pouvez pas annuler directement un congé approuvé. Utilisez la demande d'annulation. »
- *Modification concurrente* : « La demande de congé a été modifiée pendant le traitement. Veuillez réessayer. » — `RG-GEN-07` porte sur **toutes** les écritures de la vue : approuver, refuser, demander et traiter une annulation, modifier, supprimer. La version lue voyage avec chacune. Sur une modification, c'est le seul garde-fou : le contrôle de statut ne voit pas passer deux corrections concurrentes d'une même demande restée en attente.
- *Allocation concurrente* : « Le solde a changé depuis votre lecture. Rechargez la demande avant de valider. »
- *Type système* : « Type système : seuls le nom, la description, l'icône, la couleur et la validation requise peuvent être modifiés. »
- *Suppression d'un type utilisé* : « Ce type est utilisé par {n} congé(s). Il sera désactivé au lieu d'être supprimé. Continuer ? »

**Cycle de vie à représenter**

```
En attente ──approuver──▶ Approuvé ──demander l'annulation──▶ Annulation demandée
     │                                                              │
     └────refuser───▶ Refusé                          accepter ─────┴───▶ Annulé
                                                      refuser ──────────▶ Approuvé
```

**Zone de solde** — Toujours visible pendant la saisie : par type et par année, Total · Utilisés · En attente · Disponible. **Une demande à cheval sur deux années civiles se répartit par année**, chacune contrôlée contre son propre solde : la fenêtre de demande doit le montrer.

**Variantes** — Camille ne voit que « Mes demandes ». Fatou voit en plus « À valider » et ses délégations. Hugo voit tout, plus les types et les soldes.

**Attention** — Trois publics, un seul écran. Les onglets doivent apparaître **selon les droits** : Camille en voit un, Fatou trois, Hugo en voit six — le sixième étant « Soldes », que seul `leaves:manage_balances` ouvre. Un onglet qui disparaît en cours de session doit **recaler l'onglet actif** sur un onglet existant : sans cela, la vue ne rend plus aucun panneau, et rien ne le signale. Le solde disponible est l'information la plus attendue au moment de la demande : il ne doit pas être à chercher.

---

# Vue 20 — Télétravail

**Objet** — Déclarer ses jours de télétravail et configurer ses jours fixes.

**Structure** — En-tête « Mon planning télétravail » + « {n} jour(s) de télétravail planifié(s) » · Navigation mensuelle (‹ Mois précédent / Mois suivant ›) · **Calendrier mensuel** · Encart « Comment ça marche ? » · Légende · Bouton « Configurer jours fixes ».

**Encart explicatif** — « Cliquez sur un jour pour basculer entre télétravail et non déclaré. Les jours en bleu sont vos jours de télétravail. Vous pouvez modifier vos choix à tout moment. »

**Légende** — Télétravail · Bureau (déclaré) · Non déclaré · Week-end · Télétravail récurrent.

**Fenêtre « Jours fixes de télétravail »** — Liste des règles, chacune avec sa **prévisualisation en langage naturel** : « Tous les {jours} à partir du {date} » ou « Tous les {jours} du {date} au {date} ». Champs : Jour de la semaine · Date de début · Date de fin (optionnel) · Case « Règle active ». Actions : Ajouter une règle, Modifier, Supprimer, et **« Générer les plannings »** sur une plage choisie.

**États**
- *Aucune règle* : « Aucun jour fixe configuré ».
- *Génération* : « Plannings générés : {n} créé(s), {n} ignoré(s) ».
- *Jour issu d'une règle* : marqueur « Récurrent ».
- *Doublon de règle* : « Une règle récurrente existe déjà pour ce jour et cette date de début ».
- *Plage trop longue* : « La plage de dates ne peut pas dépasser 366 jours ».
- *Suppression* : « Supprimer cette règle récurrente ? »

**Variantes** — Un manager peut consulter le télétravail d'un agent ou de l'équipe à une date donnée : prévoir la variante « vue équipe ».

**Attention** — Trois états par jour (télétravail / bureau déclaré / non déclaré) plus le week-end plus « issu d'une règle » : cinq apparences à distinguer sur une même case de calendrier.

---

# Vue 21 — Temps passé

**Objet** — Déclarer et consulter le temps.

**Structure** — En-tête « Temps passé » + « {n} entrée(s) — {n} h au total » + « Saisir du temps » · Filtres (Projet, Date de début, Date de fin, « Réinitialiser les filtres ») · Liste des saisies.

**Données par saisie** — Date · Durée · Type d'activité · Projet · Tâche · Description · « Créé le » · Action Supprimer.

**Fenêtre de saisie** — Date · Durée en heures (« Ex : 2.5 ») · Type d'activité · Projet (optionnel, « Aucun projet ») · Tâche (optionnel, « Aucune tâche », dépendante du projet) · Description (« Décrivez votre activité… »).

**États**
- *Aucune entrée* : « Aucune entrée de temps » + « Saisir votre première entrée ».
- *Plafond journalier dépassé* : « Le total d'heures déclarées pour cette journée ({n} h) dépasse la limite de {n} h ».
- *Ni tâche ni projet* : « Une tâche ou un projet doit être spécifié ».
- *Suppression* : « Êtes-vous sûr de vouloir supprimer cette entrée ? »

**Variantes** — Avec le droit correspondant, on peut déclarer pour un **tiers externe** : le sélecteur d'acteur apparaît. Note : l'acteur d'une saisie n'est pas modifiable après création.

**Attention** — La saisie de temps est une corvée quotidienne. Elle doit être la plus rapide possible — d'où la saisie rapide depuis le tableau de bord (vue 06), qui est le chemin principal. Cette vue-ci est le chemin de consultation et de correction.

---

# Vue 22 — Compétences

**Objet** — Cartographier les savoir-faire et repérer les manques.

**Structure** — En-tête « Gestion des Compétences » + « Gérez les compétences des utilisateurs » · **Trois vues** : Par utilisateur · Référentiel · **Matrice** · Actions (Nouvelle compétence, Importer CSV).

**Vue Par utilisateur** — Liste des agents, chacun avec « {n} compétence(s) » et ses compétences (nom + niveau). Actions : « Ajouter des compétences », modifier un niveau, retirer. État vide : « Aucune compétence assignée » + « Ajouter des compétences ».

**Vue Référentiel** — Tableau : Nom · Catégorie · Description · **Ressources requises** · Actions. État vide : « Aucune compétence trouvée ».

**Vue Matrice** — La vue la plus dense du produit.

- **Grille** collaborateurs (lignes) × compétences (colonnes). Chaque cellule porte le niveau (Deb / Int / Exp / Maî) ou une action « Ajouter {compétence} ».
- **Indicateurs** : Couverture moyenne · Skill Gaps (« {n} compétences à renforcer »).
- **Bandeau d'alerte** : « Compétences à renforcer (couverture incomplète) », listant les compétences concernées avec « + {n} autres ».
- **Contrôles** : recherche (« Rechercher un collaborateur… ») · « Toutes catégories » · « Tous niveaux » · tri (par nom, par couverture, par compétence) · « Export CSV » · légende.
- **Pied** : « {n} collaborateur(s) — {n} compétence(s) ».
- Indice : « Cliquer sur une cellule pour modifier ».

**Données de couverture** — Par compétence : « Couverture complète ({actuel}/{requis}) » ou « Couverture partielle ({actuel}/{requis}) » ou « Skill gap — {n} ressource(s) manquante(s) ».

**États**
- *Aucune donnée* : « Aucune donnée de compétences disponible ».
- *Toutes assignées* : « Toutes les compétences sont déjà assignées ».
- *Suppression bloquée* : « Impossible de supprimer une compétence qui est assignée à des utilisateurs ».
- *Doublon* : « Une compétence avec ce nom existe déjà ».
- *Export* : « Export CSV téléchargé ».

**Attention** — La matrice peut atteindre 50 lignes × 40 colonnes. En-têtes figés sur les deux axes, cellules compactes mais cliquables (cible tactile minimale), et **la couverture insuffisante doit sauter aux yeux** : c'est l'information qu'on vient chercher.

---

# Vue 23 — Tiers

**Objet** — Répertorier les intervenants externes.

**Structure** — En-tête (titre, compteur, « Nouveau tiers ») · Filtres (type, actif/archivé, recherche) · Tableau.

**Données** — Type (Personne physique / Personne morale) · Organisation · Contact (prénom, nom, email) · Notes · Statut · Actions.

**États**
- *Personne morale* : les champs de contact nommé sont **masqués** — « LEGAL_ENTITY third parties cannot have a named contact ».
- *Tiers archivé* : signalé, non assignable.
- *Suppression* : bilan d'impact préalable (projets et tâches concernés) avant confirmation.

---

# Vue 24 — Fiche tiers

**Objet** — Consulter un tiers et ses rattachements.

**Structure** — En-tête (retour, organisation, type, statut, actions) · Informations · **Projets rattachés** · **Tâches assignées** · Temps déclaré pour ce tiers.

**États** — *Aucun rattachement* : « Aucun projet rattaché » / « Aucune tâche assignée ».

---

# Vue 25 — Clients

**Objet** — Répertorier les bénéficiaires et commanditaires.

**Structure** — En-tête (titre, compteur, « Nouveau client ») · Recherche · Tableau (identité, coordonnées, nombre de projets, statut, actions).

**États** — *Suppression* : bilan d'impact préalable listant les projets rattachés.

---

# Vue 26 — Fiche client

**Objet** — Consulter un client et son portefeuille.

**Structure** — En-tête · Informations · Projets rattachés (cartes ou tableau) · Actions (rattacher / détacher un projet).

**États** — *Aucun projet* : état vide proposant d'en rattacher un.

---

# Vue 27 — Utilisateurs

**Objet** — Administrer les comptes.

**Structure** — En-tête (titre, « {n} utilisateurs », « Créer un utilisateur », « Importer CSV ») · Filtres (département, service, rôle, statut, recherche) · Tableau.

**Colonnes** — Utilisateur (avatar + nom) · Email / Login · Rôle · Département / Services · Statut · Actions.

**Actions par ligne** — Modifier · **Désactiver (soft delete)** · **Supprimer définitivement** · Réinitialiser le mot de passe · Voir le suivi individuel.

**Fenêtre de création** — Prénom · Nom · Email · Login · Mot de passe · Rôle · Département · **Services** (dépendants du département).

**Fenêtre de suppression définitive** — Séquence en trois temps :
1. « Vérification des dépendances… »
2a. *Si bloqué* : « Impossible de supprimer cet utilisateur — Des dépendances actives empêchent la suppression : » + liste + « Veuillez d'abord réassigner ou terminer ces éléments. »
2b. *Si possible* : « Attention : cette action est irréversible. Toutes les données associées à cet utilisateur (historique, commentaires, entrées de temps, etc.) seront définitivement supprimées. » + « Supprimer définitivement ».

**Fenêtre d'import CSV** — Format documenté colonne par colonne (email, login, password, firstName, lastName, role, departmentName, serviceNames) · « Télécharger le template CSV » · Sélection du fichier · **Aperçu** (« {n} utilisateur(s) détecté(s) », tableau des premières lignes, « … et {n} autre(s) ») · **Résultat** (créés / ignorés / erreurs, avec détails).

**États**
- *Soi-même* : les actions Désactiver et Supprimer sont **désactivées**, avec au survol « Vous ne pouvez pas vous désactiver vous-même » / « Vous ne pouvez pas vous supprimer vous-même ».
- *Email pris* : « Cet email est déjà utilisé ». *Login pris* : « Ce login est déjà utilisé ».
- *Aucun rôle institutionnel* : « Aucun rôle institutionnel n'existe encore. » + « Créer un rôle institutionnel ».
- *Modification* : le login est en lecture seule — « Le login ne peut pas être modifié ». Le mot de passe : « Laisser vide pour ne pas changer ».
- *Services* : « Sélectionnez d'abord un département » / « Aucun service disponible ».

**Attention** — Deux suppressions coexistent (désactivation réversible et suppression définitive irréversible). Elles doivent être **impossibles à confondre** : libellés, couleurs et parcours distincts.

---

# Vue 28 — Suivi individuel

**Objet** — Tout ce qui concerne un agent, sur une période.

**Utilisateurs** — Fatou (entretien annuel, suivi de charge), Hugo (contrôle RH).

**Structure** — En-tête (retour « Retour aux utilisateurs », sélecteur de collaborateur avec recherche par nom, sélecteur de **Période** : Cette semaine / Ce mois / Ce trimestre / Cette année / Tout) · **Six onglets**.

| Onglet | Contenu |
| --- | --- |
| **Vue d'ensemble** | *Informations* : rôle, département, services, email, membre depuis, statut. *Statistiques* : tâches actives, tâches terminées, solde congés, jours télétravail, heures saisies, projets actifs. *Activité récente*. |
| **Tâches** | Tableau : statut, priorité, projet (ou « Hors projet »), progression, échéance. Filtres : Toutes / Actives / Terminées / Bloquées. |
| **Congés** | Historique (type, dates, jours, statut) + **Solde** : Total, Utilisés, Disponible, En attente. |
| **Télétravail** | Ce mois · Cette année · Total jours · Moyenne mensuelle · Calendrier. |
| **Temps** | Total heures · Répartition par projet · Répartition par activité · Détail (date, projet, activité, heures, description). |
| **Compétences** | Compétence, catégorie, niveau. |

**États** — Chaque onglet a son état vide : « Aucune tâche assignée » · « Aucun congé enregistré » · « Aucun jour de télétravail enregistré » · « Aucune saisie de temps » · « Aucune compétence enregistrée » · « Aucune activité récente ».
*Droits insuffisants* : « Accès restreint — Vous n'avez pas les permissions nécessaires pour accéder au suivi individuel. »
*Introuvable* : « Utilisateur non trouvé ».

**Attention** — Le sélecteur de période s'applique aux six onglets simultanément. Son effet doit être évident, et la période active rappelée dans chaque onglet.

---

# Vue 29 — Départements & services

**Objet** — Structurer l'organisation sur trois niveaux.

**Structure** — En-tête « Départements & Services » + compteurs + boutons (Nouveau département, Nouveau service, Nouvelle direction) · Encart « Organisation hiérarchique » · Filtre « Filtrer par département » · **Arborescence dépliable**.

**Encart explicatif** — « Les départements représentent les grandes divisions de l'entreprise. Chaque département peut contenir plusieurs services. Les managers peuvent être assignés aux départements et services pour gérer leurs équipes. »

**Données** — Par direction : nom, description, « {n} département(s) », « Responsable : {nom} ». Par département : nom, description, « {n} service(s) », « {n} membre(s) », « Manager : {nom} », « Créé le ». Par service : nom, description, manager, effectif.

**Actions** — Créer, modifier, supprimer à chaque niveau · Ajouter un service à un département · Déplier / replier.

**États**
- *Aucun département* : « Aucun département créé » + « Créer votre premier département ».
- *Département sans service* : « Aucun service dans ce département » + « Ajouter un service ».
- *Aucune direction* : « Aucune direction ».
- *Sans responsable* : « Aucun responsable désigné ».
- *Suppression de département* : « Êtes-vous sûr de vouloir supprimer ce département ? Tous les services associés seront également supprimés. »
- *Suppression de direction* : « Supprimer cette direction ? Les départements rattachés doivent d'abord être détachés. »
- *Droits insuffisants* : « 🔒 Accès restreint — Cette page est réservée aux administrateurs et responsables ».

**Attention** — Trois niveaux hiérarchiques avec des règles de suppression **différentes** : la direction refuse tant qu'elle a des départements, le département emporte ses services. Cette asymétrie doit être annoncée avant l'action, pas découverte au message d'erreur.

---

# Vue 30 — Rapports & analytics

**Objet** — Piloter le portefeuille.

**Utilisateurs** — Inès (direction, mensuel), Fatou (manager, hebdomadaire).

**Structure** — En-tête « Rapports & Analytics » · **Trois onglets** : Vue d'ensemble · Analytics avancés · Gantt Portfolio · Barre de contrôle (période : Cette semaine / Ce mois / Ce trimestre / Cette année ; filtre projets ; filtre par responsable(s) ; « Actualiser » ; « Exporter » → PDF / Excel / JSON).

**Bandeau d'alerte** — « Attention requise — {n} tâche(s) en retard nécessitent votre attention. Consultez la page Tâches pour plus de détails. »

**Modules d'analyse**

| Module | Contenu |
| --- | --- |
| **Progression des projets** | Barres par projet + « Voir tous les projets » |
| **Répartition de charge** | Par collaborateur, nombre de tâches, ligne de moyenne, marqueur « Surcharge détectée » |
| **Santé des projets** | Tableau : Projet · % complétion · Jalons · Tâches actives · **Santé** (Bon / Attention / Critique). Détails : tâches restantes, tâches en retard, jalons à venir, date de fin, chef de projet |
| **Tendance de progression** | Courbe, moyenne globale et par projet, marqueur « Stagnation détectée » |
| **Complétion des jalons** | « {n} jalons atteints à temps sur {n} échus », répartition À temps / En retard / À venir |
| **Répartition par priorité** | Critique · Haute · Normale · Basse, sur « {n} tâches actives » |
| **Répartition par statut** | À faire · En cours · En révision · Bloquée · Terminé |
| **Activité récente (30 j)** | Terminées · Créées · Passées en retard · **Ratio de complétion**, interprété : « Le backlog grossit » / « Le backlog se résorbe » |

**Gantt Portfolio** — « Vue d'ensemble des Projets ». Colonne « Projets », zone temporelle, ligne « Aujourd'hui », « Tout déplier » / « Tout replier ».
*Statut RAG* : On track · À risque · En retard · À venir · Terminé.
*Tris* : Nom A→Z / Z→A · Progression ↑↓ · Fin la plus proche / lointaine · Priorité (critique d'abord / basse d'abord) · Santé (pire / meilleure d'abord) · Par service · Par chef de projet. Entrées sans valeur : « Non assigné ».
*Survol* : Progression · Début · Fin · Chef de projet · Service · Santé.

**États**
- *Aucune donnée* : « Aucune donnée disponible pour cette période. »
- *États vides spécifiques* : « Aucune tâche active à afficher » · « Aucun projet à afficher » · « Aucune complétion sur la période » · « Aucun jalon défini » · « Aucun projet actif à afficher ».
- *Troncage* : « Affichage limité aux 10 premiers projets pour lisibilité ».
- *Historique insuffisant* : « Historique en cours de construction — les données seront plus pertinentes après quelques semaines de collecte. »
- *Export PDF* : « Génération du PDF en cours… »
- *Erreur* : « Impossible de charger les données analytiques. »

**Attention** — Inès ouvre cette page une fois par mois et doit **comprendre en trente secondes**. Hiérarchiser sans pitié : la santé du portefeuille et les alertes d'abord, le détail ensuite. Chaque graphique a un état vide rédigé — jamais de zone blanche. Le troncage à dix projets est **annoncé**, jamais silencieux.

---

# Vue 31 — Paramètres

**Objet** — Configuration globale de l'application.

**Structure** — En-tête « Paramètres » + « Configuration globale de l'application » + boutons Réinitialiser / Enregistrer · **Quatre onglets** : Affichage · Planning · Jours fériés · Vacances scolaires.

**Onglet Affichage**
- *Format de date* — 5 options avec **exemple en direct** : JJ/MM/AAAA (31/12/2025) · MM/JJ/AAAA · AAAA-MM-JJ · J Mois AAAA (31 décembre 2025) · Jour J Mois AAAA (mercredi 31 décembre 2025).
- *Format d'heure* — 24 h (14:30) · 24 h avec secondes (14:30:45) · 12 h (02:30 PM).
- *Langue / Région* — Français (France) · English (US), avec l'indice « Affecte le format des noms de mois et jours de la semaine ».
- *Premier jour de la semaine* — Lundi · Dimanche.

**Onglet Planning**
- *Jours visibles* — cases pour les 7 jours, indice « Sélectionnez les jours à afficher dans les vues semaine et mois », avertissement « Au moins un jour doit rester sélectionné. »
- *Zone scolaire* — « Zone utilisée pour l'import depuis le calendrier officiel ».

**Onglet Jours fériés**
- Statistiques : Total jours fériés · Jours chômés · Jours ouvrés · Fériés légaux.
- Actions : « Importer fériés FR {année} » · « Ajouter un jour ».
- Tableau : Date · Libellé · Type · **Jour ouvré** (bascule) · Description · Actions.
- Fenêtre : Date · Nom · Type · Description · Case « Jour ouvré » avec l'indice « Si activé, ce jour compte comme un jour travaillé » · Case « Récurrent » avec « Se répète automatiquement chaque année ».
- États : « Aucun jour férié déclaré pour {année} » · « Import terminé : {n} créé(s), {n} déjà existant(s) ».

**Onglet Vacances scolaires**
- Statistiques : Total · Importées · Manuelles.
- Actions : « Importer {année} » · « Ajouter ».
- Tableau : Période · Début · Fin · **Source** · Actions.
- Fenêtre : Nom (« Ex : Vacances de Printemps ») · Date de début · Date de fin · Année scolaire (indice « Année scolaire {n}-{n+1} »).
- États : « Aucune vacance scolaire pour l'année {année} » · « {n} périodes importées, {n} ignorées » · « La date de fin doit être postérieure à la date de début ».

**États transverses** — Bandeau persistant « Vous avez des modifications non enregistrées. » · Réinitialisation : « Êtes-vous sûr de vouloir réinitialiser tous les paramètres à leurs valeurs par défaut ? »

**Attention** — Un jour férié marqué **ouvré** compte comme travaillé dans le décompte des congés. Cette conséquence doit être explicite au moment du réglage : c'est un paramètre à effet de bord lointain.

---

# Vue 32 — Rôles & permissions

**Objet** — Gouverner les accès sans intervention technique.

**Utilisateurs** — Karim (administrateur), rarement mais avec des conséquences lourdes.

**Structure** — En-tête « Gestion des rôles » + « Configurer les rôles et permissions » + « Créer un rôle » · Tableau des rôles · **Matrice des permissions**.

**Tableau des rôles** — Nom · Code · Permissions (nombre) · **Système** (badge). Actions : Modifier · Supprimer · Fermer.

**Matrice des permissions** — Grille **modules (lignes) × actions (colonnes)**, cases à cocher, avec « Tout sélectionner » par ligne, et « Sauvegarder les permissions ».

*Modules* — Projets · Tâches · Événements · Congés · Télétravail · Compétences · Suivi du temps · Utilisateurs · Départements · Services · Documents · Commentaires · Paramètres · Analytiques · Jours fériés · Épopées · Jalons.

*Actions* — Créer · Lire · Modifier · Supprimer · Approuver · Gérer les membres · Gérer les délégations · Gérer la matrice · Gérer les rôles · Importer · Exporter · Voir l'équipe · Voir les rapports · Créer dans un projet · Créer hors projet.

**Modèles de rôles** — La création propose de partir d'un des 26 modèles fournis : ADMIN · ADMIN_DELEGATED · PORTFOLIO_MANAGER · MANAGER · MANAGER_PROJECT_FOCUS · MANAGER_HR_FOCUS · PROJECT_LEAD · PROJECT_LEAD_JUNIOR · TECHNICAL_LEAD · PROJECT_CONTRIBUTOR · PROJECT_CONTRIBUTOR_LIGHT · FUNCTIONAL_REFERENT · HR_OFFICER · HR_OFFICER_LIGHT · THIRD_PARTY_MANAGER · CONTROLLER · BUDGET_ANALYST · DATA_ANALYST · IT_SUPPORT · IT_INFRASTRUCTURE · OBSERVER_FULL · OBSERVER_PROJECTS_ONLY · OBSERVER_HR_ONLY · BASIC_USER · EXTERNAL_PRESTATAIRE · STAGIAIRE_ALTERNANT.

**États**
- *Aucun rôle* : « Aucun rôle configuré » + « Initialiser les permissions ».
- *Rôle système* : badge « Système », suppression désactivée — « Les rôles système ne peuvent pas être supprimés ».
- *Suppression* : « Êtes-vous sûr de vouloir supprimer ce rôle ? »
- *Initialisation* : « {n} permissions et {n} rôles initialisés ».

**Attention** — La matrice complète compte environ 125 permissions. Une grille brute de 17 modules × 15 actions est illisible et dangereuse : beaucoup de croisements n'ont pas de sens (on n'« approuve » pas un département). Il faut **masquer les croisements invalides** plutôt que les afficher désactivés, et donner une lecture de haut niveau — nombre de permissions par module, écart au modèle de départ — avant le détail case à case.

Cocher une permission a des conséquences invisibles depuis cette page. Prévoir un moyen de comprendre l'impact avant d'enregistrer.

---

# Vue 33 — Journal d'audit

**Objet** — Consulter qui a fait quoi, quand, sur quoi. **Lecture seule stricte.**

**Structure** — En-tête « Journal d'audit » + « Consultation en lecture seule des événements tracés (qui a fait quoi). » · Filtres · Tableau · Pagination.

**Filtres** — Type d'entité · Id d'entité · Id d'acteur · Action (« ex. PROJECT_DELETED ») · Du · Au · Boutons « Filtrer » et « Réinitialiser ».

**Colonnes** — Date · Action · Type · Entité · Acteur.

**Pagination** — « {n} événement(s) » · « Page {n} / {n} » · Précédent · Suivant.

**Actions tracées à représenter** — LOGIN_SUCCESS · LOGIN_FAILURE · ACCOUNT_LOCKED · LOGOUT · ACCESS_DENIED · LEAVE_CREATED · LEAVE_APPROVED · LEAVE_REJECTED · LEAVE_CANCELLED · LEAVE_CANCELLATION_REQUESTED · LEAVE_BALANCE_ADJUSTED · DELEGATION_CREATED · DELEGATION_DEACTIVATED · DOCUMENT_CREATED · DOCUMENT_READ · DOCUMENT_DOWNLOADED · DOCUMENT_DELETED · CLIENT_CREATED · CLIENT_ASSIGNED_TO_PROJECT · PROJECT_DELETED · DEPARTMENT_CHANGED · DATA_EXPORTED · ASSIGNMENT_STATUS_CHANGED.

**États**
- *Aucun événement* : « Aucun événement ».
- *Acteur système* : affiché « Système » et non un utilisateur.
- *Droits insuffisants* : « Accès refusé ».
- *Erreur* : « Impossible de charger le journal d'audit. »

**Attention** — Aucune action de modification ni de suppression ne doit exister sur cette vue, même désactivée. L'absence totale d'affordance d'écriture fait partie de la garantie.

---

# Vue 34 — Catalogue des tâches prédéfinies

**Objet** — Définir les activités récurrentes et leurs règles de répétition.

**Structure** — En-tête (titre, « Nouvelle tâche prédéfinie ») · Liste du catalogue · Section des règles de récurrence.

**Données par tâche** — Icône · Couleur · Nom · Description · Durée par défaut (Demi-journée / Journée entière / Créneau horaire) · Horaires si créneau · « Télétravail autorisé » · **Poids** · Actif / Inactif.

**Poids** — Curseur 1 à 5, avec libellés : 1 Très légère · 2 Légère · 3 Normale · 4 Lourde · 5 Très lourde. Indice : « Pondération de la charge (1 = très légère, 5 = très lourde) ».

**Règles de récurrence**
- *Type* : Hebdomadaire · Mensuelle à date fixe · Mensuelle ordinale.
- *Hebdomadaire* : jour de la semaine + « Fréquence » (indice « 1 = chaque semaine, 2 = toutes les 2 semaines, etc. »).
- *Mensuelle à date fixe* : « Jour du mois », avec l'indice « Si le jour n'existe pas (ex : 31 février), l'assignation est clampée au dernier jour du mois ».
- *Mensuelle ordinale* : « Occurrence dans le mois » (1er · 2e · 3e · 4e · Dernier) + jour de la semaine.
- Action « Générer les assignations » sur une plage.

**États**
- *Créneau horaire sans horaires* : « startTime et endTime sont requis quand defaultDuration est TIME_SLOT ».
- *Doublon d'assignation* : « Une assignation existe déjà pour cet utilisateur, cette tâche, cette date et cette période ».
- *Télétravail incompatible* : « La tâche "{nom}" n'est pas réalisable en télétravail. Agents incompatibles : {liste} ».

**Attention** — Les trois types de récurrence ont des champs différents. Le formulaire doit se reconfigurer proprement au changement de type, et **la prévisualisation en langage naturel de la règle** est indispensable : « Le 3e mardi de chaque mois, à partir du 1er septembre ».

---

# Vue 35 — Mon profil

**Objet** — Gérer ses informations et ses préférences.

**Structure** — En-tête « Mon profil » + « Gérez vos informations personnelles et vos préférences » · **Trois onglets** : Informations personnelles · Sécurité · Préférences.

**Onglet Informations personnelles** — Avatar (téléverser un fichier jpg/png/webp, choisir un visuel prédéfini, ou supprimer) · Prénom · Nom · Email · Login (lecture seule) · Département (lecture seule) · Services (lecture seule) · Membre depuis.

**Onglet Sécurité** — *Mot de passe* : « Modifiez votre mot de passe pour sécuriser votre compte » + « Changer le mot de passe ». *Historique de connexion* : « Dernière connexion : {date} ».
Fenêtre : Mot de passe actuel\* · Nouveau\* · Confirmer\* · Indice « Au moins 8 caractères ».

**Onglet Préférences** — *Langue* : Français / English. *Thème* : Clair / Sombre / Automatique. Bouton « Enregistrer les préférences ».

**États**
- *Format d'avatar refusé* : « Format non supporté. Utilisez jpg, png ou webp. »
- *Mots de passe différents* : « Les mots de passe ne correspondent pas ».
- *Trop court* : « Le mot de passe doit contenir au moins 8 caractères ».
- *Ancien incorrect* : « Ancien mot de passe incorrect ».

**Attention** — Le sélecteur de thème doit prévisualiser en direct. C'est aussi le meilleur endroit pour vérifier que les deux thèmes sont réellement traités.

---

# § D — Points de conception transverses

À garder en tête sur l'ensemble des vues.

| # | Point | Enjeu |
| --- | --- | --- |
| 1 | **Densité du planning** | Six natures d'information dans une cellule de grille. Le problème central du produit. |
| 2 | **États vides** | Une quarantaine d'états vides distincts sont spécifiés, chacun avec son texte et son action de sortie. |
| 3 | **Actions selon les droits** | Menus, onglets et boutons apparaissent ou disparaissent. Chaque vue doit être crédible en version « minimale » comme en version « administrateur ». |
| 4 | **Deux niveaux de suppression** | Désactivation réversible et suppression définitive coexistent sur les utilisateurs et les projets. Elles ne doivent jamais se confondre. |
| 5 | **Champs calculés** | Progression de projet, statut de jalon, budget consommé, jours ouvrés de congé : calculés, jamais saisis. L'interface ne doit pas suggérer qu'ils sont modifiables. |
| 6 | **Prévisualisation avant import** | Six types d'import, tous avec un aperçu et un compte rendu tripartite (importés / ignorés / erreurs). Un gabarit commun est à concevoir. |
| 7 | **Bilingue** | Prévoir des libellés anglais 30 % plus longs que le français. |
| 8 | **Clair et sombre** | Les deux thèmes traités partout, y compris sur les codes couleur porteurs de sens. |
| 9 | **Impression** | Le planning (vue 07) et la grille d'activité (vue 09) sont imprimés et affichés en salle. |
| 10 | **Confirmations** | Toute action destructrice nomme l'objet et énonce ses conséquences chiffrées. |

---

*Fin des briefs de conception.*
