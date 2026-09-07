# Carte de navigation

## Préambule

Cette carte dérive de deux documents, et d'eux seuls, lus intégralement le 2026-09-07 :

- `cadrage/01-cahier-des-charges-fonctionnel.md` — 984 lignes ;
- `cadrage/02-briefs-de-conception-par-vue.md` — 1078 lignes.

Elle n'est pas un relevé de l'implémentation : aucun fichier du produit n'a été ouvert pour l'établir. Elle décrit le **graphe des vues et des chemins qui les relient tel que le cadrage l'exige** — les 35 vues de l'inventaire `§ C` en nœuds, et en arêtes tout geste qui fait passer d'une vue à une autre, ou d'un panneau d'onglets à un autre au sein d'une même vue.

**Ce qui est une arête** — une entrée de la barre latérale, un onglet, l'ouverture d'une fiche depuis une liste, un lien de notification vers l'objet concerné, une redirection imposée, la bascule entre deux modes d'une même famille de vues, le retour au déclencheur après une action.

**Ce qui n'en est pas** — l'ouverture d'une fenêtre modale (création de projet, import CSV, ajout d'agents, refus d'un congé…), l'ouverture d'un panneau de détail latéral au sein de la vue courante, un export ou un téléchargement.

**Convention de source.** Un déclencheur porté par un élément permanent — barre latérale, en-tête, barre d'onglets d'une famille de vues — donne **une** arête par cible, sa source étant l'ensemble des vues qui portent cet élément (`06–35` pour la coquille, `11–15` pour la barre d'onglets d'un projet, `07–09` pour la bascule de planning). Une arête dont la source et la cible portent le même numéro est un onglet ou une bascule interne à la vue.

**Colonne « condition ».** Elle porte la permission, l'état de session ou la donnée exigés. La mention **déduite** signale une arête que le cadrage n'énonce pas mais qu'il rend nécessaire — une fiche qui existe suppose qu'on l'ouvre depuis sa liste, un « retour » suppose un aller.

---

## 1. Les nœuds

35 vues, issues de l'inventaire `02 § C`.

| # | Vue | Zone |
| --- | --- | --- |
| 01 | Connexion | accès |
| 02 | Inscription | accès |
| 03 | Mot de passe oublié | accès |
| 04 | Réinitialisation du mot de passe | accès |
| 05 | Changement de mot de passe imposé | accès |
| 06 | Tableau de bord | pilotage |
| 07 | Planning — Semaine | pilotage |
| 08 | Planning — Mois | pilotage |
| 09 | Planning — Activité | pilotage |
| 10 | Portefeuille de projets | projets |
| 11 | Projet — Vue d'ensemble | projets |
| 12 | Projet — Tâches (kanban) | projets |
| 13 | Projet — Jalons (feuille de route) | projets |
| 14 | Projet — Équipe | projets |
| 15 | Projet — Gantt | projets |
| 16 | Tâches (vue globale) | projets |
| 17 | Fiche tâche | projets |
| 18 | Événements | projets |
| 19 | Congés | ressources humaines |
| 20 | Télétravail | ressources humaines |
| 21 | Temps passé | ressources humaines |
| 22 | Compétences | ressources humaines |
| 23 | Tiers | référentiels |
| 24 | Fiche tiers | référentiels |
| 25 | Clients | référentiels |
| 26 | Fiche client | référentiels |
| 27 | Utilisateurs | référentiels |
| 28 | Suivi individuel | référentiels |
| 29 | Départements & services | référentiels |
| 30 | Rapports & analytics | pilotage |
| 31 | Paramètres | administration |
| 32 | Rôles & permissions | administration |
| 33 | Journal d'audit | administration |
| 34 | Catalogue des tâches prédéfinies | administration |
| 35 | Mon profil | compte |

**Hors coquille applicative** — les cinq vues d'accès **01, 02, 03, 04 et 05**. La vue 01 est décrite « page pleine, sans coquille applicative », la vue 02 reprend « le même gabarit que la connexion », la vue 03 le « gabarit de connexion », et la vue 05 est une « page pleine, **sans navigation** : l'utilisateur ne peut pas s'échapper ». Le `§ B` pose que la coquille est « nécessaire pour toute vue authentifiée » : les trente vues 06 à 35 la portent, les cinq vues d'accès non.

**Les zones et la barre latérale.** Les groupes de la barre latérale (`§ B`) sont *Pilotage* · *Projets* · *Ressources humaines* · *Référentiels* · *Administration*. Les zones du tableau ci-dessus les reprennent, et y ajoutent *accès* (les cinq vues hors coquille) et *compte* (la vue 35, atteinte par le menu utilisateur de l'en-tête et non par la barre latérale). Sept vues n'ont pas d'entrée de menu à elles et se rattachent à la zone de leur vue mère : 08 et 09 (modes du Planning), 11 à 15 (onglets d'un projet), 17 (fiche d'une tâche), 24 et 26 (fiches d'un tiers et d'un client), 28 (suivi individuel d'un utilisateur).

---

## 2. Les arêtes

### 2.1 Entrées hors application

| Id | Source | Cible | Déclencheur | Condition |
| --- | --- | --- | --- | --- |
| A-01 | ∅ | 01 | Arrivée par URL sur une vue authentifiée sans session | session absente — la coquille est « nécessaire pour toute vue authentifiée » (`§ B`) ; **déduite** |
| A-02 | ∅ | 02 | Arrivée par URL directe | cité : vue 02, état *Fonction désactivée* — « page atteinte par URL directe, avec retour vers la connexion » |
| A-03 | ∅ | 04 | Lien reçu par courriel | `EX-AUTH-06` — « Définir un nouveau mot de passe depuis un lien reçu » ; jeton valide (`RG-AUTH-04`) |
| A-04 | ∅ | 06–35 | Arrivée par URL sur une vue authentifiée | session valide, mot de passe non à changer, permission de la vue ; **déduite** |

### 2.2 Vues d'accès et redirections imposées

| Id | Source | Cible | Déclencheur | Condition |
| --- | --- | --- | --- | --- |
| A-05 | 01 | 03 | Lien « Mot de passe oublié ? » | — |
| A-06 | 01 | 02 | Lien « Pas encore de compte ? S'inscrire » | inscription autonome activée — sinon le lien « **disparaît entièrement** » (vue 01, *Variantes* ; `RG-AUTH-03`) |
| A-07 | 01 | 06 | Bouton « Se connecter » | identifiants valides, compte actif (`RG-AUTH-05`), compte non verrouillé (`RG-AUTH-01`) ; cité : vue 01, état *Succès* — « confirmation brève puis redirection vers le tableau de bord » |
| A-08 | 01 | 05 | Bouton « Se connecter » | mot de passe initial à changer — `EX-AUTH-07` ; la vue 05 contraint « avant tout accès » |
| A-09 | 02 | 01 | Lien « Déjà un compte ? Se connecter » | — |
| A-10 | 02 | 01 | Retour depuis l'état *Fonction désactivée* | inscription autonome désactivée ; cité : « avec retour vers la connexion » |
| A-11 | 03 | 01 | « Lien de retour » | — |
| A-12 | 04 | 01 | Succès de la réinitialisation | cité : vue 04, état *Succès* — « confirmation puis redirection vers la connexion » |
| A-13 | 04 | 03 | « Bouton pour en redemander un » | jeton expiré (vue 04, état *Jeton expiré*) |
| A-14 | 05 | 06 | Succès du changement de mot de passe | **déduite** — la vue 05 est un verrou « avant tout accès », rien n'en nomme la sortie |
| A-15 | 06–35 | 05 | Redirection imposée à chaque tentative d'accès | `motDePasseAChanger` — `EX-AUTH-07` ; « l'utilisateur ne peut pas s'échapper » (vue 05) ; **déduite** quant au geste |
| A-16 | 06–35 | 01 | Entrée « Déconnexion » du menu utilisateur (`§ B`) | `EX-AUTH-03` — la session est invalidée |
| A-17 | 06–35 | 01 | Expiration ou invalidation de la session | **déduite** — `EX-AUTH-02` pose la persistance de session, le cadrage ne nomme pas le geste de sortie |

### 2.3 Barre latérale de la coquille

Source commune : **06–35**. Déclencheur : l'entrée de menu nommée. Condition commune : « **Les entrées de menu auxquelles l'utilisateur n'a pas droit ne sont pas affichées** » (`§ B`, *Variantes* ; `RG-GEN-06`).

| Id | Source | Cible | Déclencheur | Condition |
| --- | --- | --- | --- | --- |
| A-18 | 06–35 | 06 | *Pilotage* › « Tableau de bord » | — |
| A-19 | 06–35 | 07 | *Pilotage* › « Planning » | mode *Semaine* à l'arrivée : **déduit**, le cadrage ne dit pas quel mode ouvre l'entrée de menu |
| A-20 | 06–35 | 30 | *Pilotage* › « Rapports » | permission `reports` |
| A-21 | 06–35 | 10 | *Projets* › « Projets » | permission `projects:read` ; périmètre `RG-SCOPE-02` |
| A-22 | 06–35 | 16 | *Projets* › « Tâches » | permission `tasks:read` |
| A-23 | 06–35 | 18 | *Projets* › « Événements » | permission `events:read` |
| A-24 | 06–35 | 19 | *Ressources humaines* › « Congés » | permission `leaves:read` |
| A-25 | 06–35 | 20 | *Ressources humaines* › « Télétravail » | permission `telework` |
| A-26 | 06–35 | 21 | *Ressources humaines* › « Temps passé » | permission `time_tracking` |
| A-27 | 06–35 | 22 | *Ressources humaines* › « Compétences » | permission `skills` |
| A-28 | 06–35 | 27 | *Référentiels* › « Utilisateurs » | permission `users:read` |
| A-29 | 06–35 | 29 | *Référentiels* › « Départements » | permission `departments` / `services` ; sinon « 🔒 Accès restreint » (vue 29) |
| A-30 | 06–35 | 23 | *Référentiels* › « Tiers » | permission `third_parties` |
| A-31 | 06–35 | 25 | *Référentiels* › « Clients » | permission `clients` |
| A-32 | 06–35 | 32 | *Administration* › « Rôles » | `users:manage_roles` / `users:manage_permissions` |
| A-33 | 06–35 | 33 | *Administration* › « Journal d'audit » | permission `audit` dédiée — « l'accès refusé est lui-même tracé » (`RG-ADM-03`) |
| A-34 | 06–35 | 34 | *Administration* › « Tâches prédéfinies » | permission `predefined_tasks` (`RG-PLN-07`) |
| A-35 | 06–35 | 31 | *Administration* › « Paramètres » | permission `settings` |

### 2.4 En-tête de la coquille

| Id | Source | Cible | Déclencheur | Condition |
| --- | --- | --- | --- | --- |
| A-36 | 06–35 | 35 | Menu utilisateur › « Mon profil » (`§ B`) | session valide |
| A-37 | 06–35 | 17 | Notification « Nouvelle tâche assignée » — « clic sur une notification → navigation vers l'objet concerné » (`§ B`) | notification présente ; type de `M18` |
| A-38 | 06–35 | 17 | Notification « Tâche à échéance proche » | émise par le traitement planifié quotidien (`RG-NTF-01`) |
| A-39 | 06–35 | 17 | Notification « Tâche en retard » | `RG-TSK-12` |
| A-40 | 06–35 | 19 | Notification « Demande de congé à valider » | l'utilisateur est validateur (`RG-CNG-08`) ; onglet *À valider* à l'arrivée : **déduit** |
| A-41 | 06–35 | 19 | Notification « Décision sur votre demande de congé » | pas de notification sur un congé auto-approuvé (`RG-NTF-03`) ; onglet *Mes demandes* : **déduit** |
| A-42 | 06–35 | 11 | Notification « Ajout à un projet » | — |
| A-43 | 06–35 | vue parente | Fil d'Ariane (`§ B`) | **déduite** — le fil d'Ariane est énoncé, ses cibles ne le sont pas |

### 2.5 Pilotage

| Id | Source | Cible | Déclencheur | Condition |
| --- | --- | --- | --- | --- |
| A-44 | 07–09 | 07 | Bascule « Semaine » de la barre d'outils (vue 07) | `EX-PLN-01` ; parti pris 8-9 — « une vue unique à trois modes, pas trois écrans distincts » |
| A-45 | 07–09 | 08 | Bascule « Mois » | `EX-PLN-01` |
| A-46 | 07–09 | 09 | Bascule « Activité » | `EX-PLN-01` ; permanences visibles seulement avec le droit de consulter les tâches prédéfinies (`RG-PLN-07`) |
| A-47 | 06 | 11 | « Mes projets » — « naviguer vers un projet ou une tâche » (vue 06, *Actions*) | au moins un projet ; sinon « Aucun projet assigné » |
| A-48 | 06 | 17 | « Mes tâches » — même action | au moins une tâche ; sinon « Aucune tâche assignée » |
| A-49 | 30 | 16 | Bandeau d'alerte — « Consultez la page **Tâches** pour plus de détails. » | au moins une tâche en retard (`EX-RPT-12`) |
| A-50 | 30 | 30 | Onglet « Vue d'ensemble » | — |
| A-51 | 30 | 30 | Onglet « Analytics avancés » | — |
| A-52 | 30 | 30 | Onglet « Gantt Portfolio » | — |

### 2.6 Projets et tâches

| Id | Source | Cible | Déclencheur | Condition |
| --- | --- | --- | --- | --- |
| A-53 | 10 | 11 | Ouvrir une carte de projet — « **Actions** — Créer · **ouvrir** · filtrer · rechercher » (vue 10) | `RG-SCOPE-02` : créateur, chef de projet, sponsor, membre, ou `projects:manage_any` |
| A-54 | 11 | 10 | « ← Retour aux projets » (vue 11, en-tête de projet) | retour au déclencheur |
| A-55 | 11–15 | 11 | Onglet « Vue d'ensemble » (vue 11, *Structure* § 2) | — |
| A-56 | 11–15 | 12 | Onglet « Tâches ({n}) » | — |
| A-57 | 11–15 | 13 | Onglet « Jalons ({n}) » | — |
| A-58 | 11–15 | 14 | Onglet « Équipe ({n}) » | — |
| A-59 | 11–15 | 15 | Onglet « Gantt » | — |
| A-60 | 12 | 17 | « ouvrir une tâche » (vue 12, *Actions*) | tâche non confidentielle sans permission explicite (`RG-TSK-13`, `RG-SCOPE-04`) |
| A-61 | 13 | 17 | Ouvrir une tâche dépliée sous son jalon | **déduite** — `EX-JAL-05` ouvre le dépliage et la modification en ligne du statut, sans nommer l'ouverture de la fiche |
| A-62 | 16 | 17 | Ouvrir une tâche | **déduite** de la vue 16 — « Données — **comme la vue 12**, plus la colonne Projet », dont les *Actions* portent « ouvrir une tâche » |
| A-63 | 16 | 16 | Bascule « Liste » (vue 16, en-tête) | `EX-TSK-01` |
| A-64 | 16 | 16 | Bascule « Kanban » | `EX-TSK-01` ; colonnes *À faire* et *Terminé* jamais masquables (`RG-TSK-16`) |
| A-65 | 17 | 17 | Lien « Voir les détails » sur une dépendance (vue 17, *Dépendances*) | la tâche prérequise existe encore — sinon « Tâche supprimée », entrée non ouvrable |
| A-66 | 17 | 12 ou 16 | « Retour » de l'en-tête (vue 17, *Structure* § 1) | retour au déclencheur ; le cadrage ne nomme pas la cible |
| A-67 | 17 | 11 | Champ « Projet » de la colonne latérale | **déduite** ; nulle pour une tâche hors projet (`RG-TSK-01`) |
| A-68 | 18 | 18 | Bascule « Liste » (vue 18, en-tête) | `EX-EVT-01` |
| A-69 | 18 | 18 | Bascule « Calendrier » | `EX-EVT-01` |

### 2.7 Ressources humaines

| Id | Source | Cible | Déclencheur | Condition |
| --- | --- | --- | --- | --- |
| A-70 | 19 | 19 | Onglet « Mes demandes » | onglet vu par tous — « Camille ne voit que "Mes demandes" » (vue 19, *Variantes*) |
| A-71 | 19 | 19 | Onglet « À valider » | `leaves:approve` — validateur ou délégué (`RG-CNG-08`, `RG-CNG-10`) |
| A-72 | 19 | 19 | Onglet « Toutes les demandes » | `leaves:readAll` |
| A-73 | 19 | 19 | Onglet « Délégations » | `EX-CNG-11`, `EX-CNG-12` — deux listes, données et reçues, dans un seul onglet |
| A-74 | 19 | 19 | Onglet « Types de congés » | permission de gestion du référentiel (`EX-CNG-13`) |
| A-75 | 19 | 19 | Onglet « Soldes » | `leaves:manage_balances` (`EX-CNG-10`, `RG-CNG-24`) |
| A-76 | 20 | 20 | Bascule vers la variante « vue équipe » | `EX-TLT-07` ; `telework:read_team` (`RG-TLT-07`) |
| A-77 | 22 | 22 | Vue « Par utilisateur » | `EX-CMP-02` |
| A-78 | 22 | 22 | Vue « Référentiel » | `EX-CMP-01` |
| A-79 | 22 | 22 | Vue « Matrice » | `EX-CMP-04` ; `skills:manage_matrix` pour la modification en cellule |

### 2.8 Référentiels

| Id | Source | Cible | Déclencheur | Condition |
| --- | --- | --- | --- | --- |
| A-80 | 27 | 28 | Action par ligne « Voir le suivi individuel » (vue 27) | `EX-USR-10` ; sinon « Accès restreint — Vous n'avez pas les permissions nécessaires pour accéder au suivi individuel. » |
| A-81 | 28 | 27 | « Retour aux utilisateurs » (vue 28, en-tête) | retour au déclencheur |
| A-82 | 28 | 28 | Onglet « Vue d'ensemble » | `EX-USR-10` |
| A-83 | 28 | 28 | Onglet « Tâches » | — |
| A-84 | 28 | 28 | Onglet « Congés » | — |
| A-85 | 28 | 28 | Onglet « Télétravail » | — |
| A-86 | 28 | 28 | Onglet « Temps » | — |
| A-87 | 28 | 28 | Onglet « Compétences » | — |
| A-88 | 23 | 24 | Ouvrir une fiche tiers depuis la colonne « Actions » du tableau | **déduite** — la vue 24 existe et porte un retour ; la vue 23 ne nomme pas le geste d'ouverture |
| A-89 | 24 | 23 | « retour » de l'en-tête (vue 24, *Structure*) | retour au déclencheur |
| A-90 | 24 | 11 | Section « Projets rattachés » | **déduite** ; sinon « Aucun projet rattaché » |
| A-91 | 24 | 17 | Section « Tâches assignées » | **déduite** ; sinon « Aucune tâche assignée » |
| A-92 | 25 | 26 | Ouvrir une fiche client depuis la colonne « actions » du tableau | **déduite** — même situation que A-88 |
| A-93 | 26 | 25 | Retour de l'en-tête | **déduite** — la vue 26 pose un « En-tête » sans en nommer le retour |
| A-94 | 26 | 11 | Section « Projets rattachés (cartes ou tableau) » | **déduite** ; `EX-TRS-05` — « consulter les projets d'un client » |

### 2.9 Administration et compte

| Id | Source | Cible | Déclencheur | Condition |
| --- | --- | --- | --- | --- |
| A-95 | 31 | 31 | Onglet « Affichage » | — |
| A-96 | 31 | 31 | Onglet « Planning » | — |
| A-97 | 31 | 31 | Onglet « Jours fériés » | — |
| A-98 | 31 | 31 | Onglet « Vacances scolaires » | — |
| A-99 | 35 | 35 | Onglet « Informations personnelles » | — |
| A-100 | 35 | 35 | Onglet « Sécurité » | — |
| A-101 | 35 | 35 | Onglet « Préférences » | — |

**Condition portée sur toutes les arêtes sortantes de la vue 31.** `RG-PRM-05` : « Quitter la page avec des modifications non enregistrées déclenche un avertissement. Cela vaut pour **la navigation interne** comme pour la fermeture de l'onglet. » Toute arête dont la source est 31 — barre latérale, en-tête, onglets — est donc conditionnée par cet avertissement lorsque des modifications sont en attente. Le bandeau permanent « Vous avez des modifications non enregistrées. » ne tient pas cette condition : « le bandeau dit qu'il y a quelque chose à enregistrer, il n'empêche pas de le perdre ».

**Total : 35 nœuds, 101 arêtes**, dont 20 marquées *déduites*.

---

## 3. Entrées et sorties

### Par où l'on entre

1. **La connexion (vue 01)** — « Tous, chaque matin ». C'est l'entrée nominale : `A-07` mène au tableau de bord, `A-08` au changement de mot de passe imposé quand le compte le réclame.
2. **Une URL d'une vue authentifiée, sans session** — `A-01`, renvoyée sur la connexion.
3. **Une URL d'une vue authentifiée, avec session** — `A-04`, servie directement ; c'est le chemin d'un signet ou d'un lien partagé.
4. **Le lien de réinitialisation reçu par courriel** — `A-03`, seul chemin vers la vue 04 (`EX-AUTH-06`). Le jeton est à usage unique et expire (`RG-AUTH-04`).
5. **L'URL directe de l'inscription** — `A-02`, y compris quand la fonction est désactivée, cas que la vue 02 traite explicitement.

### Par où l'on sort

1. **La déconnexion** — `A-16`, menu utilisateur de l'en-tête, `EX-AUTH-03` : la session est invalidée et l'on retombe sur la vue 01.
2. **L'expiration de session** — `A-17`, sortie subie.
3. **La fermeture de l'onglet du navigateur** — nommée par `RG-PRM-05` comme cas d'avertissement au même titre que la navigation interne.
4. **Les exports, qui sortent des données et non l'utilisateur** — ICS du planning (`EX-PLN-15`), CSV de tâches, de jalons et de la matrice de compétences, PDF / Excel / JSON des rapports (`EX-RPT-03`), documents joints (`EX-DOC-02`), modèles de fichiers d'import (`RG-IMP-02`). Ce sont des sorties de données ; elles ne changent pas de vue.
5. **L'impression** — vue 07 et vue 09, « imprimée et affichée en salle de service ». La vue reste affichée ; la sortie est physique.

Le produit n'a **aucun lien sortant vers un service tiers** : `1.4` pose le fonctionnement en réseau fermé, « aucune fonctionnalité essentielle ne dépend d'un service tiers en ligne ».

---

## 4. Points d'attention

Aucune des 35 vues n'est orpheline. Mais trois ne le doivent qu'à des arêtes déduites, et onze navigations sont décrites sans que leur origine ou leur cible soit nommée.

### 4.1 Vues atteignables par arête déduite seulement

- **Vue 05 — Changement de mot de passe imposé.** `EX-AUTH-07` exige la contrainte, la vue affirme qu'« aucune issue latérale » n'existe, mais **ni l'entrée ni la sortie ne sont énoncées** : ni le geste qui y mène depuis la connexion (`A-08`), ni ce qui se passe après un changement réussi (`A-14`). Deux arêtes déduites pour une vue dont tout l'objet est d'être un passage obligé.
- **Vue 24 — Fiche tiers.** Elle porte un retour vers la vue 23, donc un aller existe ; la vue 23 ne le nomme pas (`A-88`).
- **Vue 26 — Fiche client.** Ni l'aller depuis la vue 25 (`A-92`), ni le retour (`A-93`) ne sont nommés : la vue 26 pose « En-tête » sans dire ce qu'il contient.

### 4.2 Navigations décrites sans origine ni cible

- **La recherche globale de l'en-tête** (`§ B`) est listée parmi les données de la coquille et parmi rien d'autre : le cadrage ne dit ni ce qu'elle cherche, ni vers quelles vues elle mène, ni si elle est filtrée par périmètre. Aucune arête n'a pu être posée.
- **Le fil d'Ariane de l'en-tête** (`§ B`) est énoncé comme élément permanent ; ses cibles ne le sont nulle part. `A-43` le pose comme arête générique vers « la vue parente », ce que le cadrage ne définit pour aucune vue.
- **« Mon planning » du tableau de bord** (vue 06, *Structure* § 3) — « extrait du planning personnel de la période ». Le cadrage ne dit pas si cet extrait mène à la vue 07. Les *Actions* de la vue 06 énumèrent « naviguer vers un projet ou une tâche » et s'arrêtent là.
- **« Voir tous les projets » du module *Progression des projets*** (vue 30). Le libellé peut désigner un dépliage du module — c'est ce que suggère la commande « Tout afficher » de `RG-RPT-02` — ou une navigation vers la vue 10. Aucune arête n'a été posée.
- **Le tableau *Santé des projets*** (vue 30) nomme chaque projet, son chef de projet et sa date de fin, sans dire si une ligne s'ouvre. Idem pour le détail des jalons en retard de `RG-RPT-07`, qui les nomme « un à un, avec leur projet ».
- **Le Gantt portefeuille** (vue 30, onglet Gantt Portfolio) affiche une barre par projet avec survol détaillé, sans dire si la barre ouvre le projet.
- **Le panneau de détail latéral du planning** (vues 07 et 08). `EX-PLN-12` — « ouvrir le détail d'une tâche ou d'un événement en cliquant dessus » — est résolu par un panneau latéral, donc sans changement de vue. Le cadrage ne dit pas si l'on peut atteindre la **fiche complète** (vue 17) depuis ce panneau, alors que `RG-TSK-11` y renvoie explicitement l'utilisateur : « Modifiez les dates via le détail de la tâche. » **Le message nomme une destination qu'aucun chemin ne dessert.**
- **Le Gantt d'un projet** (vue 15) n'offre aucun accès à la fiche tâche : le clic sélectionne, le double-clic « ouvre la modification des dépendances ». Seule vue de tâches du produit qui ne mène pas à la vue 17.
- **`EX-CMP-10` — « Rechercher les agents détenant une compétence donnée »** ne dit pas où le résultat mène. La matrice (vue 22) porte des noms d'agents sans dire si une ligne ouvre le suivi individuel (vue 28).
- **La vue 29 — Départements & services** n'a aucune arête sortante. Elle affiche des effectifs (« {n} membre(s) »), des managers et des responsables nommés, sans qu'aucune de ces mentions ne soit dite ouvrable.
- **Le catalogue des tâches prédéfinies (vue 34)** alimente la vue Activité (vue 09) et n'y renvoie pas ; réciproquement, la vue 09 ne mène pas au catalogue depuis lequel se corrige une tâche. `RG-PLN-07` lie pourtant les deux droits.
- **Le courriel de notification** (`EX-NTF-04`, « Recevoir les notifications critiques par courriel ») : le cadrage ne dit pas s'il porte un lien vers l'objet concerné, là où le panneau in-app le fait explicitement (`§ B`). Si ce lien existe, il ajoute six arêtes d'entrée depuis ∅, jumelles de `A-37` à `A-42`.
- **Vue 21 — Temps passé** affiche une tâche et un projet par saisie, sans dire s'ils s'ouvrent. Même silence sur la colonne « Projet » de la vue 16 et sur le « temps déclaré pour ce tiers » de la vue 24.

### 4.3 Une cible d'arête que le cadrage laisse indéterminée

- **`A-66` — le « Retour » de la fiche tâche.** La vue 17 pose « Retour » dans son en-tête sans nommer la destination. Or la vue 17 s'atteint par au moins cinq chemins (`A-37` à `A-39` depuis les notifications, `A-48` depuis le tableau de bord, `A-60` depuis le kanban d'un projet, `A-62` depuis la vue globale, `A-91` depuis une fiche tiers) : « retourner » n'a de sens qu'au regard du déclencheur, et le cadrage ne dit pas lequel.
- **`A-19` — l'entrée « Planning » de la barre latérale.** Le `§ B` nomme une seule entrée pour trois vues (07, 08, 09). Laquelle s'ouvre n'est écrite nulle part ; la vue 07 est dite « la vue centrale du produit », ce qui la désigne sans la nommer.
- **`A-40` et `A-41` — les notifications de congé.** Elles mènent à la vue 19, qui a six onglets ; le cadrage dit « navigation vers l'objet concerné » sans dire quel onglet ouvre une demande à valider par opposition à une décision reçue. La vue 19 avertit par ailleurs qu'« un onglet qui disparaît en cours de session doit **recaler l'onglet actif** sur un onglet existant » — l'arrivée par notification sur un onglet auquel on n'a plus droit relève du même cas, et n'est pas traitée.
