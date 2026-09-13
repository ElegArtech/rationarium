# Architecture et développement

Rationarium est une application web auto-hébergée pour le pilotage des projets et des ressources.
Le déploiement fourni utilise une machine et trois services permanents.

```text
Navigateur → Caddy et interface React → API NestJS / Fastify → PostgreSQL
                                       ├─ pièces jointes : volume documents
                                       └─ courriels : relais SMTP facultatif
```

## Composants

| Dossier | Contenu |
| --- | --- |
| `apps/web` | React, Vite, routeur TanStack, React Query, composants React Aria et traductions i18next |
| `apps/api` | API NestJS sur Fastify, permissions, sessions et traitements métier |
| `packages/contracts` | Schémas Zod, permissions, rôles et vocabulaires partagés |
| `packages/db` | Schéma Prisma, migrations PostgreSQL, exports et jeux d’essai |
| `deploiement` | Compose, Dockerfiles, installation, sauvegarde et restauration |
| `scripts` | Vérifications et normalisation des données du calendrier |
| `tests/references` | Inventaires utilisés par les tests et les vérifications |

Les pièces jointes sont stockées dans un volume distinct de la base. Les sessions et les travaux
périodiques sont persistés dans PostgreSQL. `pg-boss` gère les files et les traitements sans service
supplémentaire. Aucun cache Redis ni moteur de recherche externe n’est requis.

Les contrôles d’accès sont effectués côté serveur, selon la permission et le périmètre. Le client
utilise les mêmes informations pour présenter les actions disponibles. Les mises à jour concurrentes
sont détectées par les versions des entités.

La [référence fonctionnelle](reference-fonctionnelle.md) détaille les droits et les règles métier.
Les identifiants EX et RG présents dans les tests renvoient à cette référence.

## Développement local

Prérequis : Node.js 24.19 ou ultérieur dans la branche 24, pnpm 11.22.0 et Docker.
L’installation des dépendances et la génération Prisma nécessitent une connexion Internet.

```sh
pnpm install --frozen-lockfile
docker compose -f deploiement/compose.dev.yaml up -d
export DATABASE_URL='postgresql://rationarium:rationarium@localhost:55432/rationarium'
pnpm --filter @rationarium/db exec prisma generate
pnpm --filter @rationarium/db exec prisma migrate deploy
pnpm build
pnpm --filter @rationarium/api amorcer
```

Le compte de base ci-dessus appartient uniquement à la composition locale de développement.
Ne pas réutiliser ce secret dans un déploiement. L’amorçage crée le premier administrateur et affiche
son mot de passe temporaire lorsqu’aucun n’a été fourni.

Dans deux terminaux, en conservant `DATABASE_URL` pour le serveur :

```sh
COOKIE_SECRET=developpement-local pnpm --filter @rationarium/api dev
pnpm --filter @rationarium/web dev
```

Vite sert habituellement `http://localhost:5173` et relaie `/api` vers le serveur sur le port 3000.
Un jeu d’essai peut être chargé dans une base dédiée avec les commandes du paquet `@rationarium/db`.
Les installations normales n’en chargent aucun.

## Vérifications

```sh
pnpm verif
pnpm test:int
pnpm build
```

`verif` exécute le typage, ESLint, Stylelint, les vérifications de traduction, les contrôles de
permissions et de traçabilité, puis les tests unitaires. `test:int` utilise PostgreSQL réel via
Testcontainers et exige Docker. Les tests de performance utilisent une base dédiée.

Depuis `apps/web`, `pnpm e2e` et `pnpm a11y` vérifient les parcours et l’accessibilité de l’interface.
Une partie de ces suites simule les réponses API. Pour vérifier la distribution, compléter ces tests
par une installation Docker sur base vide, une connexion dans le navigateur et une restauration.

## Images et publication

L’image `rationarium-api` contient les commandes de migration, d’amorçage et d’export ainsi que
le serveur. Le moteur Prisma est embarqué à un chemin fixe avec OpenSSL 3. Le lanceur encode les
champs PostgreSQL pour éviter qu’un caractère spécial dans un mot de passe modifie l’URL.

L’image `rationarium-web` contient les fichiers construits et Caddy. Les polices et les ressources
sont servies localement. Le fichier Compose d’installation référence uniquement des images ; les
instructions de construction sont dans `compose.construction.yaml`.

Le workflow GitHub Actions publie les deux images lors d’un tag de version. Les scripts
`deploiement/preparer-compose.sh` et `deploiement/preparer-hors-ligne.sh` produisent les kits.
Le paquet hors ligne exporte les mêmes images que celles du registre public.
