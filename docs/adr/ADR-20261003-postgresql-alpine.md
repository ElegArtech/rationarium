# ADR — PostgreSQL sans exceptions de sécurité système

Date : 3 octobre 2026. Statut : adoptée ; migration et retour locaux validés, contrôle distant associé au commit.

## Problème et comparaison

L'image PostgreSQL 18.6 Bookworm, même après mise à jour APT, conserve 487 occurrences (118 HIGH/CRITICAL, 54 avis distincts). La non-utilisation des fonctions visées ne corrige pas ces composants. La décision de conservation de Bookworm de l'ADR de stabilisation est remplacée par la présente décision.

Les scans comparatifs portent sur les images officielles 18.6 : Trixie conserve 69 occurrences système HIGH/CRITICAL et 22 dans gosu avant mise à jour ; Alpine 3.24 conserve seulement un avis système MEDIUM et les 22 HIGH/CRITICAL de gosu. Le premier prototype Alpine mis à jour avec su-exec présentait zéro avis au scan, mais ce résultat était insuffisant : libxml2 2.13.9 restait embarquée, antérieure aux correctifs 2.15.4 de plusieurs avis récents absents du catalogue Alpine. Ce prototype est rejeté.

## Décision

Conserver PostgreSQL 18.6, reconstruire ses sources officielles avec le SHA-256 publié par l’image officielle, puis livrer ses binaires sur Alpine 3.24 épinglé par digest. Garder ICU, TLS, LDAP, GSSAPI, libcurl, liburing, LZ4, Zstd et les extensions SQL du produit. Désactiver XML/XSLT et LLVM, qui introduisait aussi libxml2, ainsi que les langages optionnels Perl/Python/Tcl non utilisés par le produit. La recherche dans le schéma et les requêtes du dépôt ne trouve aucun usage des fonctions XML/XSLT. La compilation emploie Perl, mais cet outil et les dépendances de construction ne passent pas dans l’étape finale. Le démarrage officiel est copié depuis son image épinglée ; remplacer son unique appel gosu par su-exec 0.3-r0. Supprimer effectivement le binaire gosu. su-exec est le petit outil C de changement d'identité fourni par Alpine, sous licence MIT ; il exécute directement le processus et conserve la transmission des signaux. La construction vérifie l'unicité du point de remplacement et l'identité postgres. Pas de nouveau service, ni de dépendance applicative.

Le scan de l'image base exige désormais **zéro avis de toute gravité**, sans exception. L'inventaire APK est conservé ; les métadonnées des paquets ne sont pas retirées pour dissimuler des alertes. Une évolution de paquet ou de la base d'avis peut faire échouer une construction, qui doit alors être corrigée. Un contrôle complémentaire exige l'absence physique de XML/XSLT/LLVM et des paquets retirés, les options de compilation attendues, ainsi que les versions corrigées d'OpenSSL, LDAP, ncurses, libuuid et zlib. Il refuse effectivement le prototype dont le scan seul était nul. Les dix budgets de performance sont rejoués sur l'image livrée, pour couvrir notamment le retrait de LLVM/JIT.

## Données et compatibilité

musl et glibc n'ont pas les mêmes règles de collation. Aucun volume Debian n'est démarré directement sous Alpine. Le point d'entrée refuse les anciens répertoires PostgreSQL ; les nouvelles bases utilisent un répertoire distinct. La migration prend un dump logique, restaure les rôles et la base dans un **volume neuf**, recrée donc les index avec les bibliothèques de la cible, vérifie les données puis démarre les migrations applicatives. La base reprend la locale par défaut de l'image Alpine ; les valeurs et contraintes sont conservées, l'ordre de tri SQL peut évoluer. Les parcours FR/EN et des témoins accentués sont exercés.

L'ancien volume et les images sources restent disponibles. Aucun volume n'est supprimé par la migration. Les services applicatifs sont arrêtés pendant la capture et la bascule. Un échec laisse les services arrêtés et les preuves disponibles. Le retour arrière est explicite : il remet les images sources et le volume source ; les écritures réalisées après la bascule ne s'y retrouveraient pas. Il se teste avant réouverture aux utilisateurs.

## Sources

- [Images officielles PostgreSQL](https://github.com/docker-library/official-images/blob/master/library/postgres).
- [PostgreSQL : sauvegarde logique](https://www.postgresql.org/docs/18/backup-dump.html).
- [PostgreSQL : changements de version de collation](https://www.postgresql.org/docs/18/sql-altercollation.html).
- [su-exec : fonctionnement et licence](https://github.com/ncopa/su-exec).

## Sources complémentaires de correction

- [Libxml2 2.15.4, correctifs du 4 septembre](https://download.gnome.org/sources/libxml2/2.15/libxml2-2.15.4.news) : la série 2.13 embarquée par le prototype n'est pas une preuve de correction ; la bibliothèque est retirée de la livraison.
- [OpenSSL 3.5.9](https://openssl-library.org/news/vulnerabilities-3.5/) : CVE-2026-84782 corrigée en 3.5.9 ; version minimale contrôlée.
- [Correctifs Alpine util-linux](https://secdb.alpinelinux.org/v3.24/main.json) : 2.42.3-r0 puis r1 corrigent les cinq avis conservés dans libuuid.
- [OpenLDAP CVE-2023-2953 et commits amont](https://security-tracker.debian.org/tracker/CVE-2023-2953) : la livraison utilise 2.6.15.
- [ncurses, journal amont](https://invisible-island.net/ncurses/NEWS.html) : correctif du 13 décembre 2025, version livrée 6.6 de mai 2026.
