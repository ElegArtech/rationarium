# Installation sans accès à Internet

Docker Engine, Docker Compose v2.24 ou ultérieur, Bash, tar et `sha256sum` doivent déjà être
installés sur le serveur Linux x86-64. Les autres composants sont livrés dans les images.

## Télécharger le paquet complet

Depuis la [préversion v1.0.0-rc.1](https://github.com/ElegArtech/rationarium/releases/tag/v1.0.0-rc.1),
télécharger le paquet `rationarium-1.0.0-rc.1-linux-amd64.tar.gz` et son fichier `.sha256`.

```sh
sha256sum --check rationarium-1.0.0-rc.1-linux-amd64.tar.gz.sha256
tar -xzf rationarium-1.0.0-rc.1-linux-amd64.tar.gz
```

Le dossier contient les trois images — PostgreSQL, serveur et interface —, Compose, les scripts,
les guides et les notices de licence. Les archives « Source code » de GitHub contiennent les sources
seules ; elles ne remplacent pas le paquet hors ligne.

## Transférer et installer

Transférer le dossier entier sur le serveur cible. Depuis ce dossier :

```sh
bash charger-images.sh
bash configurer.sh
```

Le chargement vérifie les empreintes avant d’exécuter `docker image load`. L’assistant crée `.env`
et démarre l’installation. Une configuration manuelle est également possible : copier `.env.example`
en `.env`, le remplir, puis lancer `docker compose up -d --wait`.

Le paquet fixe `MODE_IMAGES=never` : une image manquante provoque une erreur locale, sans tentative
de téléchargement. `RESEAU_INTERNE=true` interdit les connexions sortantes du serveur et de la base.
Le frontal conserve un réseau d’accès pour publier les ports HTTP et HTTPS.

Pour HTTPS, utiliser un certificat fourni ou l’autorité locale de Caddy. La certification publique
automatique nécessite Internet. Le [guide d’installation](installation.md#https) décrit les trois modes.

Si un relais SMTP interne doit être joint, adapter le réseau Docker aux routes autorisées par votre
organisation. Le réseau Docker `internal` interdit aussi les connexions sortantes vers ce relais.

## Préparer un paquet personnalisé

Sur une machine connectée avec Docker, Compose et Python 3, depuis les sources de la version voulue :

```sh
bash deploiement/preparer-hors-ligne.sh
```

Le script récupère les images publiées et produit `dist/rationarium-1.0.0-rc.1/`. Il ne copie aucun
secret ni donnée de l’instance locale. `IMAGES.txt` indique les archives, références et architecture des images.
La préparation utilise une image Skopeo épinglée, téléchargée depuis `quay.io`, pour copier toutes les
couches depuis les registres. Chaque couche est vérifiée avant de produire le paquet. Python et
Skopeo servent uniquement à cette préparation ; ils ne sont pas requis sur le serveur cible.

Pour construire vos propres images avant l’export :

```sh
bash deploiement/preparer-hors-ligne.sh --construire
```

Les images construites localement sont exportées par Docker, puis vérifiées. Si le magasin
containerd de Docker produit un export incomplet, la préparation s’arrête ; utiliser un magasin
Docker classique ou publier les images dans un registre et suivre le parcours précédent.

Un dossier de sortie neuf peut être ajouté en dernier argument. Prévoir l’espace pour les images
Docker et leur archive, qui coexistent pendant la préparation. Si la machine connectée utilise un
proxy, configurer Docker et les constructions selon la politique de l’organisation ; les identifiants
de proxy ne doivent pas être intégrés dans l’image.

## Mettre à jour

Transférer le nouveau paquet, charger ses images, puis conserver `.env`, les certificats et
`NOM_PROJET` de l’installation existante. Reporter la nouvelle version dans `VERSION_RATIONARIUM`.
Suivre la [procédure de mise à jour](exploitation.md#mise-à-jour) en omettant la commande `pull`.
Les migrations et l’amorçage fonctionnent depuis les paquets embarqués.
