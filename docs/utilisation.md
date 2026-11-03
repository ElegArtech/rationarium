# Premiers pas

## Ouvrir une instance neuve

Se connecter avec le compte créé pendant l’installation, puis changer son mot de passe temporaire.
L’administrateur commence par définir la structure organisationnelle et créer les utilisateurs.
Une nouvelle instance ne contient aucun agent ni projet de démonstration.

Les droits dépendent du rôle du compte et de son périmètre : une action disponible pour
l’administrateur peut être absente ou désactivée pour un autre utilisateur.

## Structurer l’organisation

Créer les directions, leurs départements et leurs services, puis rattacher les utilisateurs à
leur unité. Les rôles système fournissent un point de départ ; les rôles personnalisés permettent
d’adapter les permissions. Le référentiel des compétences complète l’annuaire.

Configurer les horaires, les jours travaillés, les congés et les paramètres d’affichage avant de
commencer à planifier. Les périodes de vacances scolaires livrées sont consultables sans connexion
Internet ; leur étendue dépend des données embarquées dans cette version.

## Organiser les projets et les tâches

Créer un projet, définir son équipe, puis ajouter ses tâches et ses jalons. Les tâches portent leurs
responsables, leur état, leurs dates et leur avancement. Les vues en liste, Kanban et feuille de route
permettent de suivre le même travail sous plusieurs angles.

Une tâche terminée est à 100 %. Une tâche à 100 % n’est pas automatiquement terminée : la clôture
reste une action explicite. Les pièces jointes et les commentaires conservent le contexte du travail.

## Utiliser le planning

Le planning rapproche les tâches, les événements, les absences, le télétravail et les activités
récurrentes. Changer de période ou de vue permet de lire les disponibilités à différentes échelles.
Les informations visibles suivent le périmètre du compte connecté.

Les demandes de congé suivent le circuit de validation et les droits du rôle. La saisie du temps
alimente les suivis individuels, les projets et les rapports.

## Retrouver et partager les informations

Utiliser la recherche, les filtres et les vues de projet pour retrouver une tâche ou un intervenant.
Les notifications sont disponibles dans l’application. Les courriels nécessitent un relais configuré
par l’administrateur du serveur.

Pour les imports CSV, utiliser les modèles proposés par l’application, vérifier l’aperçu et les
messages par ligne avant de valider. Les exports CSV sont destinés aux tableurs ; l’export intégral
JSONL est décrit dans le [guide d’exploitation](exploitation.md#export-intégral-des-données).

## Faire tenir le suivi par un agent

L’assistant de suivi est facultatif. Un administrateur l’active dans Paramétrage › Assistant. Un
agent tourne alors sur le poste d’un utilisateur, avec son propre client de modèle de langage et son
propre abonnement, par exemple Claude Code ou Codex. Il lit les sources déclarées et met à jour les
projets, les jalons, les tâches, les événements et les temps, sans validation préalable.

1. Dans Mon compte › Agents, créer un jeton. Il ne s’affiche qu’une fois : le ranger aussitôt
   dans le trousseau du poste.
2. Sur la fiche d’un projet, l’onglet Suivi dit ce que l’agent doit surveiller : une consigne, des
   sources et un seuil de silence.
3. Installer l’agent de référence sur le poste, comme l’explique `outils/agent/README.md`.
4. Lancer un passage depuis Activité de l’agent, ou laisser la planification le faire.

L’agent agit avec les droits du propriétaire du jeton, et jamais davantage. Il ne supprime rien.
L’écran Activité de l’agent montre chaque action, avec l’état avant et après, sa justification et
ses preuves. Une action fausse se corrige comme une saisie ordinaire, ou se défait d’un clic tant
que l’élément n’a pas changé depuis. Une action défaite n’est pas refaite par les passages suivants.
Ce que l’agent n’a pas pu trancher seul apparaît dans les points ouverts de son passage.

## Langue et présentation

L’interface est disponible en français et en anglais, avec un thème clair et un thème sombre.
Les réglages du profil permettent d’adapter la présentation. Les vues qui proposent l’impression
utilisent la présentation prévue pour le papier.
