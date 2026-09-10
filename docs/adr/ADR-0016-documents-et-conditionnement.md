# ADR-0016 — Magasin de documents et conditionnement

Date : 10 septembre 2026. Décision prise dans RM-08, autonomie explicitement déléguée.

## Constat

Le serveur écrit les contenus dans un répertoire local, mais Compose ne lui montait aucun volume persistant. La sauvegarde ne conservait que PostgreSQL et les rôles. Le second jeu de recette annonçait des pièces qui n’avaient aucun octet. Enfin l’export public de @rationarium/db chargeait les jeux de mesure et l’image copiait les sources et les contrôles compilés.

## Décision

Le magasin de C14 est le volume Docker `documents`, monté sur `/var/lib/rationarium/documents` et accessible par le compte node. Les noms de fichiers sont des empreintes ; les noms métier restent des métadonnées. Cette décision n’ajoute aucune dépendance.

Sauvegarde : arrêter les écritures applicatives, exporter base et rôles, archiver le volume, vérifier sa lecture et écrire les SHA-256 des trois pièces, puis redémarrer les services qui fonctionnaient auparavant. Restauration : refuser un ensemble incomplet ou altéré avant de détruire la base ; restaurer base et volume associés, puis démarrer le produit. Les archives antérieures dépourvues de magasin ne sont pas présentées comme restaurations complètes : elles nécessitent une procédure de récupération séparée.

Le paquet de base expose les jeux uniquement dans le sous-chemin de développement `@rationarium/db/mesure`. Le conditionnement de production omet ces modules, leurs CLI et les contrôles compilés ; il ne copie que les distributions nécessaires, les migrations, la configuration Prisma et les dépendances. La recette et la configuration des agents sont exclues du contexte Docker.

Le harnais sème des PDF/ODT/ODS réels avec taille et SHA calculés. Chaque exécutant restaure une copie privée du magasin en même temps que sa base, API arrêtée ; aucune langue n’hérite d’un contenu de la précédente.

## Vérification et limites

Les tests d’isolation corrompent et ajoutent des contenus puis vérifient le reset. Le contrôle de l’image et le cycle sauvegarde/restauration sur pile réelle restent requis pour prononcer la livraison RM-08. La copie hors machine reste du ressort de l’exploitation (cadrage/03 §8.3).
