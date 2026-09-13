# Rationarium

**Le planning partagé des projets, des équipes et des disponibilités.**

Rationarium réunit les projets, les tâches, les congés, le télétravail et les événements dans
une application web auto-hébergée. Une même grille permet de suivre ce qui occupe chaque personne
et de rapprocher la charge des projets des disponibilités de l’équipe.

## Fonctionnalités

- Organisation en directions, départements et services ; annuaire et référentiel des compétences.
- Projets, équipes, tâches, jalons, tableaux Kanban et feuilles de route.
- Planning unifié, activités récurrentes, événements, congés et télétravail.
- Saisie du temps, tableaux de bord et rapports.
- Pièces jointes, commentaires, notifications et journal des actions.
- Rôles et permissions, périmètres organisationnels, imports CSV et exports en formats ouverts.
- Interface en français et en anglais, thèmes clair et sombre.

Une instance neuve contient le référentiel des rôles et le premier administrateur. Elle ne contient
aucun projet, agent ou planning de démonstration. L’organisation et les utilisateurs se créent depuis
l’application.

## Installer

Prérequis : **Docker Engine et Docker Compose v2.24 ou ultérieur**, accessibles à votre compte.
Les images fournies ciblent **Linux x86-64**. Node.js et PostgreSQL sont embarqués dans les images.

[![Télécharger Rationarium](docs/telecharger.svg)](https://github.com/ElegArtech/rationarium/releases/download/v1.0.0-rc.1/rationarium-1.0.0-rc.1-compose.tar.gz)

Le kit contient Compose, la configuration, l’assistant et les outils d’exploitation.
Docker télécharge les images publiées, sans compilation sur le serveur ni compte GitHub.

**Installation guidée en une commande :**

```sh
curl -fL https://github.com/ElegArtech/rationarium/releases/download/v1.0.0-rc.1/installer-rationarium.sh -o installer-rationarium.sh && bash installer-rationarium.sh
```

L’assistant demande l’adresse du site et le premier compte administrateur, génère les secrets
techniques et démarre les services. Le premier accès impose de changer le mot de passe temporaire.
L’installation occupe un nouveau dossier `rationarium/`.

Pour configurer le kit manuellement : extraire l’archive, copier `.env.example` en `.env`, renseigner
les variables, puis exécuter `docker compose up -d --wait`.

- **[Installation](docs/installation.md)** : configuration, HTTPS, messagerie et construction depuis les sources.
- **[Installation hors ligne](docs/hors-ligne.md)** : [paquet complet avec les images](https://github.com/ElegArtech/rationarium/releases/download/v1.0.0-rc.1/rationarium-1.0.0-rc.1-linux-amd64.tar.gz) pour un serveur sans Internet.
- **[Utilisation](docs/utilisation.md)** : premiers pas et organisation du travail.
- **[Exploitation](docs/exploitation.md)** : sauvegardes, restauration, mises à jour et diagnostic.
- **[Architecture](docs/architecture.md)** : composants, données et développement local.

## État de la version

`1.0.0-rc.1` est une préversion de la première version stable. Elle permet d’évaluer l’installation
et les usages avant une mise en production. Le déploiement fourni vise une machine unique.

Les ressources de l’interface sont servies localement. Un relais SMTP est nécessaire pour recevoir
les messages par courriel, notamment les liens de réinitialisation de mot de passe. Les notifications
dans l’application restent disponibles sans SMTP.

## Auteur et licence

Rationarium est un projet d’[Alexandre Bergé — ElegArtech](https://github.com/ElegArtech).
Le code est distribué sous [licence MIT](LICENSE). Les dépendances et ressources tierces
conservent leurs [licences respectives](THIRD_PARTY_NOTICES.md).
