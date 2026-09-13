# Déploiement

L’installation standard utilise les images publiées. Depuis ce dossier :

```sh
bash configurer.sh
```

Pour configurer manuellement, copier `.env.example` en `.env`, renseigner les variables et lancer
`docker compose up -d --wait`.

Voir les guides d’[installation](../docs/installation.md), d’[installation hors ligne](../docs/hors-ligne.md)
et d’[exploitation](../docs/exploitation.md). Le [README du projet](../README.md) fournit le bouton
de téléchargement et la commande d’installation guidée.
