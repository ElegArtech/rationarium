# Bilan de remédiation PostgreSQL

3 octobre 2026. Complément au bilan de stabilisation 1.0.0. Les images et archives Bookworm de la première campagne sont remplacées par cette candidate ; elles restent seulement des preuves historiques.

## Correction effective

| Mesure | Avant | Après |
| --- | --- | --- |
| Distribution | Debian Bookworm 12.15 | Alpine 3.24.2 |
| PostgreSQL | 18.6 | 18.6 |
| Changement d'identité | gosu, Go 1.24.6 | su-exec 0.3-r0, C |
| Avis système et binaires, toutes gravités | 487 occurrences | **0** |
| HIGH/CRITICAL | 118 occurrences, 54 avis distincts | **0** |
| Exceptions PostgreSQL | 118 | **0**, interdites par le contrôle |

La matrice des [54 avis traités](remediation-postgresql-avis.md) donne le traitement par avis. La [preuve structurée](references/remediation-postgresql.json) conserve l'identifiant de l'image, la date du scan et les versions des paquets. Les inventaires de paquets restent présents dans les images et les rapports. L'ancienne image est effectivement refusée par le nouveau contrôle ; les tests injectent également des avis de chaque gravité avec une exception pour vérifier leur refus.

PostgreSQL 18.6 est reconstruit depuis son archive officielle vérifiée, sans XML/XSLT/LLVM ni langages optionnels inutilisés. L’image finale Alpine ne contient ni libxml2 ni gosu ; le démarrage officiel emploie su-exec. La licence de ce dernier est embarquée. Aucun avis PostgreSQL n'est masqué ou reporté à une date d'expiration.

## Le scan nul du prototype ne suffisait pas

Le premier prototype Alpine présentait zéro avis Trivy, mais libxml2 2.13.9 restait antérieure aux correctifs 2.15.4. La base d’avis Alpine ne recensait pas ces avis récents. Ce prototype est rejeté, malgré ses recettes fonctionnelles réussies. La solution finale retire réellement cette bibliothèque et LLVM, qui la réintroduisait. Le contrôle matériel refuse effectivement ce prototype ; il exige aussi les versions corrigées d’OpenSSL, LDAP, ncurses, libuuid et zlib. La matrice donne le traitement exact, au-delà du changement de distribution.

Les **10 budgets de performance** passent sur l’image reconstruite, à la volumétrie cible (500 utilisateurs, 200 projets, 20 000 tâches, cinq ans d’historique). La CI rejoue cette mesure sur les images qu’elle livre. L’image passe de 640 Mo pour Bookworm à 139 Mo pour cette construction locale.

## Migration et retour

Le changement de libc exige une restauration logique. Le script livré conserve l'ancien volume et les images sources, prend une sauvegarde complète et restaure dans un volume neuf. Le nouveau point d'entrée refuse les répertoires de données Debian, y compris un ancien emplacement personnalisé. La recette teste aussi le redémarrage d'une base Alpine contenant les fichiers PG_VERSION internes de PostgreSQL.

Les empreintes des 66 tables et des 19 rôles sont comparées avant/après, avant les migrations applicatives. Un témoin indexé porte des caractères accentués et japonais. Un rôle de connexion conserve son mot de passe et son droit SELECT, vérifiés par une connexion TCP authentifiée. Le retour réel à rc.1 est exercé puis la candidate est redémarrée sur son nouveau volume. L'ordre de tri SQL peut changer ; les valeurs et les contraintes sont conservées et les index recréés.

Un essai a révélé une protection au démarrage trop large, qui confondait les fichiers internes de la base Alpine avec un ancien stockage. Ce défaut a été corrigé ; les témoins positifs/négatifs du point d'entrée sont désormais intégrés au contrôle des images. Les essais interrompus ne constituent pas une preuve de succès.

## Résultats locaux

- Scan des trois images : API 0 avis, PostgreSQL 0 avis, web 1 UNKNOWN.
- Vérification rapide complète (`TURBO_FORCE=true pnpm verif`) réussie, dont 591 tests unitaires et 10 tests des garde-fous.
- Recette finale `migration-sans-xml` réussie : migration, comparaison des tables et rôles, retour rc.1, retour candidate, 21 routes FR/EN, droits serveur, SMTP, sauvegarde/corruption/restauration et HTTPS.
- Témoins du point d'entrée : ancien stockage standard/personnalisé refusé, stockage Alpine accepté avec ses fichiers internes ; ancienne image Bookworm refusée par le scan strict.

- Installation locale de l'archive hors ligne réussie, y compris restauration et HTTPS.
- Résolution réelle de la configuration Compose testée : NOM_PROJET, option `-p` et volume explicite de migration. Le nom du volume par défaut suit le projet effectif, pour éviter le partage involontaire entre installations.

## Livraison et preuves

Les recettes du premier prototype sont historiques ; celles suffixées `sans-xml` et la CI finale concernent la reconstruction corrigée. Les recettes et rapports locaux sont sous `.local/remediation-postgresql/`. Ils restent privés : configurations, mots de passe de test, sessions et sauvegardes ne sont pas joints aux artefacts publics. Les archives et rapports de scan de la CI sont publiés comme artefacts de validation, sans publication de version stable.

Le workflow impose maintenant, après les scans et l'installation de l'archive, une migration rc.1 avec retour arrière réel. Le résultat distant associé au commit est celui des [checks de la PR nº 1](https://github.com/ElegArtech/rationarium/pull/1/checks), et ne se déduit pas du présent document.

## Limites hors de ce traitement

L'avis braces de l'outillage de développement et l'avis UNKNOWN OpenPGP de l'image web restent consignés. Le présent travail corrige les alertes PostgreSQL. Un scan nul signifie l'absence d'avis détectés dans les composants examinés à sa date, pas une garantie d'absence de défaut inconnu.

Procédure d'exploitation : [migration PostgreSQL](migration-postgresql.md). Décision et sources : [ADR PostgreSQL Alpine](adr/ADR-20261003-postgresql-alpine.md).
