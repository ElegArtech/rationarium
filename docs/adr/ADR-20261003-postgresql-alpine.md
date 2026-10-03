# ADR — PostgreSQL sans exceptions de sécurité système

Date : 3 octobre 2026. Statut : adoptée ; migration et retour locaux validés, contrôle distant associé au commit.

## Problème et comparaison

L'image PostgreSQL 18.6 Bookworm, même après mise à jour APT, conserve 487 occurrences (118 HIGH/CRITICAL, 54 avis distincts). La non-utilisation des fonctions visées ne corrige pas ces composants. La décision de conservation de Bookworm de l'ADR de stabilisation est remplacée par la présente décision.

Les scans comparatifs portent sur les images officielles 18.6 : Trixie conserve 69 occurrences système HIGH/CRITICAL et 22 dans gosu avant mise à jour ; Alpine 3.24 conserve seulement un avis système MEDIUM et les 22 HIGH/CRITICAL de gosu. Le prototype Alpine mis à jour avec su-exec présente zéro avis, toutes gravités confondues.

## Décision

Conserver PostgreSQL 18.6, employer son image officielle Alpine 3.24 épinglée par digest, appliquer les mises à jour APK et remplacer l'unique appel gosu du démarrage officiel par su-exec 0.3-r0. Supprimer effectivement le binaire gosu. su-exec est le petit outil C de changement d'identité fourni par Alpine, sous licence MIT ; il exécute directement le processus et conserve la transmission des signaux. La construction vérifie l'unicité du point de remplacement et l'identité postgres. Pas de nouveau service, ni de dépendance applicative (C1, ADR-0013).

Le scan de l'image base exige désormais **zéro avis de toute gravité**, sans exception. L'inventaire APK est conservé ; les métadonnées des paquets ne sont pas retirées pour dissimuler des alertes. Une évolution de paquet ou de la base d'avis peut faire échouer une construction, qui doit alors être corrigée.

## Données et compatibilité

musl et glibc n'ont pas les mêmes règles de collation. Aucun volume Debian n'est démarré directement sous Alpine. Le point d'entrée refuse les anciens répertoires PostgreSQL ; les nouvelles bases utilisent un répertoire distinct. La migration prend un dump logique, restaure les rôles et la base dans un **volume neuf**, recrée donc les index avec les bibliothèques de la cible, vérifie les données puis démarre les migrations applicatives. La base reprend la locale par défaut de l'image Alpine ; les valeurs et contraintes sont conservées, l'ordre de tri SQL peut évoluer. Les parcours FR/EN et des témoins accentués sont exercés.

L'ancien volume et les images sources restent disponibles. Aucun volume n'est supprimé par la migration. Les services applicatifs sont arrêtés pendant la capture et la bascule. Un échec laisse les services arrêtés et les preuves disponibles. Le retour arrière est explicite : il remet les images sources et le volume source ; les écritures réalisées après la bascule ne s'y retrouveraient pas. Il se teste avant réouverture aux utilisateurs.

## Sources

- [Images officielles PostgreSQL](https://github.com/docker-library/official-images/blob/master/library/postgres).
- [PostgreSQL : sauvegarde logique](https://www.postgresql.org/docs/18/backup-dump.html).
- [PostgreSQL : changements de version de collation](https://www.postgresql.org/docs/18/sql-altercollation.html).
- [su-exec : fonctionnement et licence](https://github.com/ncopa/su-exec).
