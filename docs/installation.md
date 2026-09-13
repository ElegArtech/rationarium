# Installation

## Prérequis

Un hôte Linux x86-64 avec Docker Engine et Docker Compose v2.24 ou ultérieur, Bash, curl, tar et
les outils GNU usuels, dont `sha256sum`. Docker doit être démarré et accessible à votre compte.
L’assistant ne modifie ni les paquets système ni les droits de votre compte.

Le parcours en ligne nécessite l’accès à GitHub, GitHub Container Registry et Docker Hub pour
les téléchargements. Le serveur n’a pas besoin d’accéder à npm ni d’installer Node.js.
Pour un serveur isolé, utiliser le [paquet hors ligne](hors-ligne.md).

## Installation guidée

```sh
curl -fL https://github.com/ElegArtech/rationarium/releases/download/v1.0.0-rc.1/installer-rationarium.sh -o installer-rationarium.sh && bash installer-rationarium.sh
```

Le script télécharge le kit de cette version, vérifie son empreinte SHA-256, puis l’extrait dans
un nouveau dossier `rationarium/`. Il demande l’adresse publique, l’identifiant, le courriel et
le mot de passe temporaire du premier administrateur. Les secrets PostgreSQL et de session sont
générés localement. Le mot de passe saisi n’est pas affiché.

Le script refuse d’écraser une installation existante. Un autre dossier peut être donné :
`bash installer-rationarium.sh /chemin/vers/rationarium`.

Pour partir du [kit téléchargé](https://github.com/ElegArtech/rationarium/releases/download/v1.0.0-rc.1/rationarium-1.0.0-rc.1-compose.tar.gz) :

```sh
tar -xzf rationarium-1.0.0-rc.1-compose.tar.gz
cd rationarium-1.0.0-rc.1-compose
bash configurer.sh
```

Si un port est déjà occupé, choisir une autre adresse publique ou préciser le port secondaire
avant de lancer l’assistant, par exemple `RATIONARIUM_PORT_HTTPS=9443 bash configurer.sh`.

Les fichiers `.sha256` de la release permettent aussi de vérifier les archives téléchargées
manuellement avec `sha256sum --check`.

## Configuration manuelle

Depuis le dossier du kit :

```sh
cp .env.example .env
# Remplir .env, puis :
docker compose up -d --wait
```

Le fichier `.env` utilise le format Docker Compose. Ne pas l’exécuter avec `source` et ne pas le
versionner. Les mots de passe restent des champs séparés ; l’image encode les composants de l’URL
de connexion à PostgreSQL.

| Variable | Fonction |
| --- | --- |
| `POSTGRES_MOTDEPASSE` | Secret PostgreSQL, sans valeur par défaut |
| `COOKIE_SECRET` | Secret de session, sans valeur par défaut |
| `RATIONARIUM_HOTE` | Adresse écoutée par Caddy, sans le port publié sur l’hôte |
| `RATIONARIUM_URL_PUBLIQUE` | Origine exacte vue par le navigateur, avec le port éventuel ; utilisée dans les liens par courriel |
| `RATIONARIUM_ADMIN_LOGIN` | Identifiant du premier administrateur |
| `RATIONARIUM_ADMIN_EMAIL` | Courriel du premier administrateur |
| `RATIONARIUM_ADMIN_MOTDEPASSE` | Mot de passe temporaire ; vide pour en générer un dans les journaux d’amorçage |
| `NOM_PROJET` | Nom de l’installation et préfixe de ses volumes ; à conserver lors des mises à jour |

Générer deux secrets distincts, par exemple avec `openssl rand -hex 32`. Les valeurs d’exemple
ouvrent `http://localhost:8080`. Pour accéder au site depuis un autre poste, configurer HTTPS.
Les cookies de session de production requièrent HTTPS ; l’accès HTTP local sert à l’évaluation.

`MODE_IMAGES=missing` récupère les images absentes. `MODE_IMAGES=never` interdit tout téléchargement.
Les images Rationarium sont publiques ; aucun `docker login` n’est nécessaire.

## Premier démarrage

Compose attend PostgreSQL, applique les migrations, puis amorce le référentiel des rôles et le
premier compte. Le serveur et l’interface ne démarrent qu’après le succès de ces étapes.
Les services `migrations` et `amorcage` terminés avec le code 0 sont dans leur état normal.

Ouvrir l’adresse du site, se connecter et changer le mot de passe temporaire. La politique de
l’application demande au moins huit caractères, une majuscule, un chiffre et un caractère spécial.
Suivre ensuite [les premiers pas](utilisation.md).

Si aucun mot de passe n’a été fourni, le consulter avec `docker compose logs amorcage`.
Après le premier accès, retirer les variables `RATIONARIUM_ADMIN_*` de `.env`. Les redémarrages
conservent les utilisateurs et leurs mots de passe. Le référentiel des rôles système est synchronisé ;
les rôles personnalisés restent conservés.

## HTTPS

Seuls les ports du frontal web sont publiés. L’API et PostgreSQL restent accessibles sur le réseau
Docker. Les trois modes ci-dessous utilisent les mêmes images.

### Certificat public automatique

```dotenv
RATIONARIUM_HOTE=https://planning.example.org
RATIONARIUM_URL_PUBLIQUE=https://planning.example.org
RATIONARIUM_PORT_HTTP=80
RATIONARIUM_PORT_HTTPS=443
DIRECTIVE_TLS=
COURRIEL_ACME=administration@example.org
```

Le DNS doit pointer vers le serveur. Les ports de validation doivent être accessibles et Caddy
doit pouvoir joindre l’autorité de certification.

### Certificat fourni

Déposer `site.crt` et `site.key` dans `certificats/`, protéger la clé privée sur l’hôte et définir :

```dotenv
RATIONARIUM_HOTE=https://planning.example.org
RATIONARIUM_URL_PUBLIQUE=https://planning.example.org
RATIONARIUM_PORT_HTTP=80
RATIONARIUM_PORT_HTTPS=443
DIRECTIVE_TLS='tls /etc/rationarium/certificats/site.crt /etc/rationarium/certificats/site.key'
```

Les navigateurs doivent faire confiance à l’autorité qui a émis le certificat. Ce mode ne requiert
aucune connexion à une autorité externe.

### Autorité locale de Caddy

Avec une adresse HTTPS, définir `DIRECTIVE_TLS='tls internal'`. Caddy émet les certificats
localement. Récupérer son certificat d’autorité après démarrage :

```sh
docker compose cp web:/data/caddy/pki/authorities/local/root.crt ./autorite-rationarium.crt
```

Distribuer ce certificat aux postes via le mécanisme de confiance de l’organisation. Le volume
`caddy` conserve cette autorité et fait partie des sauvegardes.

Pour un port HTTPS non standard, conserver l’adresse Caddy sans port et renseigner l’origine exacte :
`RATIONARIUM_PORT_HTTPS=8443`, `RATIONARIUM_URL_PUBLIQUE=https://planning.example.org:8443`.

## Courriels

Configurer `SMTP_HOTE`, `SMTP_PORT`, `SMTP_UTILISATEUR`, `SMTP_MOTDEPASSE` et `SMTP_EXPEDITEUR`
pour utiliser le relais de l’organisation. `SMTP_TLS=true` active TLS dès l’ouverture de la connexion,
notamment sur le port 465. Avec `false`, la bibliothèque peut négocier STARTTLS si le relais le propose.

Sans relais, les courriels sont écrits dans les journaux privés du serveur et ne sont pas livrés.
Les notifications dans l’application fonctionnent ; les liens de réinitialisation ne peuvent pas
être reçus par courriel. Vérifier un envoi après configuration du relais.

## Construire depuis les sources

Ce parcours nécessite Git et un accès aux registres Docker et npm ainsi qu’au téléchargement des
moteurs Prisma pendant la construction.

```sh
git clone https://github.com/ElegArtech/rationarium.git
cd rationarium/deploiement
cp .env.example .env
# Remplir .env, puis :
docker compose -f compose.yaml -f compose.construction.yaml build api web
docker compose up -d --wait
```

L’image du serveur contient OpenSSL 3, le moteur de schéma Prisma et les paquets nécessaires aux
migrations. Aucun téléchargement de moteur n’est requis au démarrage. Le [guide d’architecture](architecture.md)
décrit le développement local.
