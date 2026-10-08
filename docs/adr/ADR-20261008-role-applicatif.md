# ADR — Rôle PostgreSQL applicatif sans superutilisateur

Date : 8 octobre 2026. Statut : adoptée pour 1.0.2 ; installation neuve, mise à jour depuis 1.0.1, sauvegarde et restauration validées sur un projet Compose isolé.

## Problème

Jusqu'à 1.0.1, Compose donnait à l'API, à l'amorçage et aux migrations la même connexion : le superutilisateur créé par l'image PostgreSQL (`POSTGRES_UTILISATEUR`). Deux conséquences :

- l'inaltérabilité du journal d'audit (`RG-ADM-01`) était inopérante. La migration `20260816140000_journal_audit_inalterable` révoque `UPDATE`, `DELETE` et `TRUNCATE` sur `audit_log` au rôle `rationarium_app`, mais ce rôle est `NOLOGIN` et rien ne l'employait ; le contrôle d'intégration le vérifiait par `SET ROLE`, sur un rôle qu'aucune connexion réelle ne prenait ;
- toute injection SQL future aurait donné `COPY … TO PROGRAM`, la lecture de fichiers du serveur et la création de rôles.

## Décision

L'API et l'amorçage se connectent sous un rôle de connexion dédié, `rationarium_api` par défaut (`POSTGRES_UTILISATEUR_APPLICATION`) :

- `LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS`, membre du seul rôle `rationarium_app`, dont il hérite les droits `SELECT/INSERT/UPDATE/DELETE` sur `public` et l'ajout seul sur le journal ;
- propriétaire du schéma `pgboss` et de tout ce qu'il contient : pg-boss y crée des partitions par file et y applique ses propres migrations, ce qui exige la propriété ;
- aucun droit de structure sur `public` : `creer_partition_audit` devient `SECURITY DEFINER`, à chemin de recherche figé (`pg_catalog, pg_temp`), objets qualifiés, exécutable par `rationarium_app` seul ; `_prisma_migrations` est en lecture seule pour lui ; les droits par défaut couvrent désormais les séquences en plus des tables.

Le superutilisateur reste celui des migrations, de la sauvegarde, de la restauration et de la migration PostgreSQL. Le service `migrations` enchaîne `prisma migrate deploy` puis `dist/exploitation/provisionner-role.js`, qui crée ou réaligne le rôle à chaque `up`. pg-boss installe son schéma par `CREATE SCHEMA IF NOT EXISTS`, que PostgreSQL refuse à un rôle sans `CREATE` sur la base même si le schéma existe : le provisionnement installe donc la file **sous le rôle applicatif**, et l'application trouve ensuite un schéma installé.

## Le secret, et la mise à jour sans intervention

Trois options ont été comparées :

1. **Variable `.env` engendrée par `configurer.sh`.** Simple pour une installation neuve ; une instance 1.0.1 n'a pas cette variable, et Compose ne sait pas engendrer de valeur : la mise à jour exigerait une étape manuelle.
2. **Secret dérivé du mot de passe du superutilisateur** (HMAC). Aucune persistance, mais l'API devrait recevoir le mot de passe du superutilisateur pour le dériver : le but est perdu.
3. **Secret engendré et persisté par le service `migrations`** dans un volume `identifiants`, lu par l'API et l'amorçage en lecture seule (`PGPASSWORD_FILE`, lu par `deploiement/lancer.mjs`).

L'option 3 est retenue : un seul mécanisme pour l'installation neuve et la mise à jour, aucun secret supplémentaire dans `.env`, et le mot de passe du superutilisateur sort de l'environnement de l'API. Le secret fait 256 bits, est écrit en `0600` par l'utilisateur `node`, et passe à PostgreSQL en paramètre lié (jamais dans le texte d'une requête). Le perdre n'est pas une panne : un nouveau secret est engendré et le rôle réaligné au `up` suivant. Pour la même raison, le volume `identifiants` n'entre pas dans les sauvegardes.

## Restauration

`pg_restore --no-owner` rend tous les objets au superutilisateur, y compris le schéma `pgboss` : l'application ne pourrait plus y créer de file. `restauration.sh` relance donc le service `migrations` après `pg_restore`, ce qui réattribue la file, réaligne le mot de passe et rattrape au passage une sauvegarde antérieure à la version installée. Les droits de `rationarium_app` sont dans la sauvegarde et reviennent avec elle.

## Conséquences

- Mise à jour 1.0.1 → 1.0.2 : remplacer les fichiers du kit, conserver `.env`, `docker compose up -d --wait`. Le volume `identifiants` est créé, le rôle aussi, et `pgboss` change de propriétaire.
- Un exploitant qui choisit `POSTGRES_UTILISATEUR_APPLICATION` égal au propriétaire, ou `rationarium_app`, est refusé au démarrage des migrations.
- Les tests d'intégration se connectent désormais comme Compose : `role-applicatif.int.test.ts` prouve les refus (`UPDATE/DELETE/TRUNCATE` du journal, `COPY … TO PROGRAM`, `pg_read_file`, `CREATE ROLE`, `CREATE DATABASE`, DDL) et le fonctionnement nominal, file comprise, ainsi que la reprise d'une file créée par le superutilisateur ; `amorcage.int.test.ts` amorce et sert l'API sous ce rôle.

## Sources

- [PostgreSQL : `COPY` et `pg_execute_server_program`](https://www.postgresql.org/docs/18/sql-copy.html).
- [PostgreSQL : fonctions `SECURITY DEFINER` et chemin de recherche](https://www.postgresql.org/docs/18/sql-createfunction.html#SQL-CREATEFUNCTION-SECURITY).
- [PostgreSQL : `ALTER DEFAULT PRIVILEGES`](https://www.postgresql.org/docs/18/sql-alterdefaultprivileges.html).
