# Audit du passage en version stable

Audit réalisé le 3 octobre 2026 sur `0c9d7e0c6cd51b076125958c0ca78f3d6d8bc038`, comparé à `v1.0.0-rc.1`.

**Avis : publication stable à différer.** Les contrôles fonctionnels et les essais d'exploitation exécutés passent. L'audit des dépendances de production remonte toutefois 36 alertes, dont 20 élevées et 16 modérées, correspondant à 30 avis distincts. Leur qualification et leur correction restent nécessaires avant de recommander la version stable.

Aucune version, image publique ou release GitHub n'a été modifiée. Les dépendances sont restées inchangées afin que ce bilan décrive précisément le code examiné. Les essais Docker utilisent des projets et des volumes dédiés.

## Résultats

Environnement : Node.js 24.20.0, pnpm 11.22.0, Docker 29.1.3, Linux x86-64. Les contrôles rapides et la construction ont été exécutés avec `TURBO_FORCE=true`, sans réutilisation des résultats du cache.

| Contrôle | Résultat |
| --- | --- |
| `pnpm verif` | Vert : typage, ESLint, Stylelint, traductions, contrôles d'inopérance et de traçabilité |
| Tests unitaires | 591 réussis : contrats 51, base 16, interface 329, API 195 |
| `pnpm test:int` | 1 236 réussis : API 1 202, base 34, sur PostgreSQL réel |
| Performance | Les 10 tests de budgets sont inclus dans la suite d'intégration et réussissent |
| Playwright, depuis `apps/web`, avec 4 ouvriers | 772 réussis : 659 parcours et 113 contrôles d'accessibilité, aucun ignoré |
| `pnpm build` | Les 4 espaces de travail construisent |
| Dockerfiles API et interface | Construction réussie depuis le code examiné |
| Kit Compose | Préparation réussie avec les scripts du dépôt |
| Images hors ligne | Export des 3 images, vérification de leurs couches et rechargement Docker réussis |
| Audit des dépendances de production | Rouge : 20 alertes élevées, 16 modérées, aucune critique signalée |
| Audit avec les dépendances de développement | Rouge : 60 alertes, dont 30 élevées, 26 modérées et 4 faibles, pour 50 avis distincts |

Soit **2 599 tests automatisés réussis**, auxquels s'ajoutent les essais de distribution ci-dessous. Ce total n'est pas une mesure de couverture exhaustive des usages.

La traçabilité rapporte 368 identifiants sur 369 cités par des tests nommés ; le reste est déclaré et motivé par le référentiel. Ce contrôle vérifie la présence de citations, pas à lui seul la pertinence de chaque assertion.

### Performance mesurée

Jeu de 500 agents, 200 projets, 20 000 tâches et cinq années d'historique. Médianes de cinq appels après chauffe :

| Lecture | Médiane |
| --- | --- |
| Planning d'un service sur une semaine | 25 ms |
| Planning de l'instance sur un mois | 31 ms |
| Tableau de bord d'un agent | 9 ms |
| Rapports sur un trimestre | 236 ms |
| Matrice des compétences | 15 ms |

Ces mesures portent sur les services et PostgreSQL sur cette machine, pas sur un temps de réponse complet chez un exploitant.

## Distribution et exploitation éprouvées

- Installation de la préversion disponible localement dans un projet Compose isolé, sur base vide ; connexion dans Chromium et changement obligatoire du mot de passe.
- Sauvegarde avant mise à jour, puis remplacement par les images construites depuis le commit examiné. Compte, mot de passe modifié et session conservés.
- Ouverture de 21 pages avec le véritable serveur : tableau de bord, trois plannings, projets, tâches, événements, congés, télétravail, temps, compétences, tiers, clients, utilisateurs, départements, rapports, paramètres, rôles, audit, tâches prédéfinies et profil. Aucune erreur JavaScript ni réponse API en erreur pendant ce parcours administrateur.
- Création d'une to-do dans le navigateur, puis vérification de sa persistance après rechargement.
- Création d'un compte sans rôle par l'API administrateur, connexion dans le navigateur et changement obligatoire du mot de passe. Lectures des projets, des utilisateurs et de l'audit refusées par le serveur avec le statut 403.
- Réinitialisation demandée par HTTP, travail consommé par `pg-boss`, message reçu par un relais SMTP local de test et formulaire accessible depuis le lien reçu. Aucun courriel externe envoyé.
- Sauvegarde du code actuel par `sauvegarde.sh`, altération volontaire d'une to-do et d'un fichier témoin dans le volume de documents, puis restauration par `restauration.sh`. La valeur d'origine et le contenu du fichier sont revenus ; la connexion fonctionne après restauration.
- Deuxième installation sur base vide avec les images actuelles, `MODE_IMAGES=never` et réseau interne Docker isolé. Connexion et premier changement de mot de passe réussis en HTTPS. La sonde HTTPS répond 200 avec vérification de l'autorité locale de Caddy par `curl --cacert`.

Les noms d'images, ports et secrets ont été adaptés uniquement dans les kits temporaires. La mise à jour exercée ne comporte pas de nouvelle migration par rapport à `rc.1`.

## Interface et accessibilité

Le tableau de bord et le planning ont été ouverts et regardés en thèmes clair et sombre, aux largeurs 1 024 et 1 600 pixels : huit captures, sans anomalie visuelle relevée. Axe ne rapporte aucune violation WCAG A/AA dans ces huit configurations. La bascule vers l'anglais a également été exercée sur la pile réelle.

Les 113 tests d'accessibilité couvrent plus largement les vues et les interactions clavier prévues par la suite. Une partie des tests navigateur simule l'API. Le parcours Docker complémentaire porte principalement sur une installation neuve : il ne remplace pas une recette de tous les états métier avec des données représentatives. Ce travail n'est pas un audit RGAA humain complet.

## Dépendances à traiter avant la stable

Le [relevé détaillé](references/audit-dependances-2026-10-03.json) conserve les versions, chemins de dépendance et liens vers chaque avis. Les 36 entrées incluent certains avis signalés pour deux branches de `fast-uri`.

| Paquet | Versions installées concernées | Versions corrigeant les avis relevés |
| --- | --- | --- |
| `@nestjs/platform-fastify` | 11.2.1 | 11.2.4 minimum ; l'avis recommande 11.2.5 sur la branche 11 |
| `fastify` | 5.11.3 transitif et 5.12.0 direct | 5.12.5 ou ultérieur |
| `nodemailer` | 9.0.5 | 10.0.6 ou ultérieur |
| `fast-uri` | 3.1.5 et 4.1.2 | 3.1.8 et 4.1.5, selon la branche |
| `js-yaml` | 5.2.1 | 5.4.1 ou ultérieur |
| `ip-address` | 10.5.0 | 10.7.1 ou ultérieur |
| `deepmerge-ts` | 7.1.5 | 8.0.0 ou ultérieur |
| `mysql2` | 3.15.3 | 3.23.1 ou ultérieur |

Ces versions sont des indications issues des avis au jour du relevé ; leur compatibilité avec les dépendances parentes reste à vérifier. Nodemailer et deepmerge-ts impliquent un changement de version majeure. Mettre à jour seulement le Fastify direct laisserait sa seconde copie transitive.

Les avis concernent notamment le [traitement des chemins dans l'adaptateur NestJS](https://github.com/advisories/GHSA-9c5c-9qcx-q35q), les [URL malformées dans Fastify](https://github.com/advisories/GHSA-p68q-wchp-6fh7) et le [coût de traitement des adresses dans Nodemailer](https://github.com/advisories/GHSA-v53p-9fqp-m79j).

**Une version signalée ne démontre pas une exploitation dans Rationarium.** Les permissions passent ici par des gardes NestJS ; Caddy précède l'API ; certains paquets signalés appartiennent à l'outillage Prisma et PostgreSQL est la base utilisée. Il reste à qualifier les chemins réellement atteignables. Ces observations ne constituent pas une dérogation de sécurité.

### Outillage présent dans l'image API

Le Dockerfile copie l'ensemble de `node_modules` dans l'image d'exécution. La présence de Vitest 4.1.10, de son module mocker, d'Undici 8.10.0 et de `@grpc/grpc-js` 1.14.4 a été vérifiée dans l'image construite. L'audit complet du verrouillage, développement inclus, remonte 60 alertes, dont 30 élevées ; il inclut les 36 précédentes, qui ne doivent donc pas être additionnées. Ce relevé figure également dans le fichier JSON.

Il faut réduire le contenu livré à ce qui sert effectivement au serveur, aux migrations et à l'exploitation, puis auditer cet ensemble. La présence d'un outil dans l'image ne signifie pas qu'il soit chargé ou exposé à une requête.

## Conditions restantes pour publier

1. Corriger les dépendances concernées, réduire l'outillage livré dans l'image API ou documenter précisément les alertes non applicables, puis relancer l'audit sur le verrouillage final et le contenu livré. Éviter les surcharges de versions majeures sans vérification de compatibilité.
2. Rejouer les contrôles sur ce nouvel ensemble, reconstruire les images et rééprouver les migrations, l'amorçage et l'envoi SMTP.
3. Compléter l'analyse de sécurité des images système : cet audit a interrogé le registre npm, sans scanner les paquets Debian/Alpine embarqués.
4. Préparer le numéro `1.0.0`, les références du kit et de la documentation, les notes de version et les sommes de contrôle des archives finales. Le paquet destiné à GitHub devra provenir des mêmes images que celles validées.
5. Publier uniquement après décision sur ces éléments. Le workflow actuel construit et pousse les images sur un tag `v*`, sans exécuter les suites de validation ni vérifier la concordance du tag et de `package.json` : ajouter ces garde-fous est recommandé.

## Preuves locales

Les journaux, le relevé npm complet, les résultats du parcours réel et les captures sont conservés dans `.local/audit-stable-2026-10-03/`, dossier ignoré par Git. Les sauvegardes et kits temporaires privés sont sous `/tmp/rationarium-stable-audit/`. Ils contiennent des secrets de test et ne doivent pas être publiés.

Les trois documents déjà non suivis au début de l'audit ont été conservés. Les captures générées par les suites ont été déplacées dans le dossier local de preuves.

Les deux projets Compose d'essai, leurs volumes et le relais SMTP de test ont été supprimés après vérification. Les images locales restent disponibles sous `rationarium-stable-audit/api:0c9d7e0` et `rationarium-stable-audit/web:0c9d7e0`.
