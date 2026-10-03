# Bilan de stabilisation de Rationarium 1.0.0

3 octobre 2026. Branche : `codex/stabilisation-1-0-0`. Base des preuves locales : `db7ad5717364f82013a0b503c0502f5ee58446dc`, complétée par le découpage des tests Gantt et les corrections CI portant ce bilan. Aucun code métier n’a changé après cette base.

## Verdict

La candidate 1.0.0 passe tous les contrôles locaux prévus, y compris l'installation depuis son archive hors ligne et la mise à jour depuis la version publique 1.0.0-rc.1. Le résultat distant se consulte dans le workflow de la branche lié ci-dessous ; les preuves détaillées ici sont les essais locaux. La version publique n'a pas été changée : aucun tag stable, aucune image publique remplacée, aucune installation d'exploitation modifiée.

Les blocages liés aux dépendances npm de production, au contenu de l'image API, à la cohérence des versions et à l'absence de garde-fous de publication ont été traités. Les vulnérabilités système résiduelles sont qualifiées dans le contexte d'exploitation livré ; elles restent présentes et visibles dans les rapports. Cette distinction fait partie du verdict.

## Résolution des blocages

| Blocage initial | Traitement | Preuve |
| --- | --- | --- |
| Dépendances npm de production vulnérables | NestJS, Fastify, Nodemailer et transitives actualisés ; quatre surcharges ciblées | Audit de 318 dépendances : zéro avis |
| Outillage vulnérable embarqué dans l'API | Installation séparée du graphe de production ; Prisma CLI conservé explicitement ; gestionnaires de paquets retirés | 261 entrées de dépendances ; absence de Vitest, Playwright, Vite, ESLint, Stylelint et braces ; moteur Prisma et hachage natif fonctionnent hors réseau |
| Image API volumineuse | Graphe d'exécution séparé, tests et outils de développement exclus | 822 Mo contre 2,61 Go selon `docker image ls`, soit environ 68 % de réduction |
| Images système sans examen documenté | Node 24.21 sur Alpine, Caddy 2.11.6, PostgreSQL 18.6 Bookworm mis à jour ; bases épinglées par digest | Rapports Trivy 0.75.0 et inventaires complets ; identifiants dans `synthese-preuves.json` |
| Tag pouvant publier sans validation | Deux travaux CI séparés ; validation obligatoire avant images et publication ; publication limitée aux nouveaux tags | Workflow GitHub, contrôle des références de version et tests négatifs |
| Validation dépendante du poste local | Construction de l'API avant intégration ; installation explicite de LibreOffice Calc et unzip en CI | Le premier essai GitHub a exposé ces deux prérequis, ensuite corrigés |
| Archives non éprouvées comme unité de livraison | Export des mêmes images scannées, contrôle des couches et empreintes, chargement puis installation depuis l'archive | Recette `--kit` complète, téléchargement interdit, réseau interne fermé |
| Régression possible pendant une mise à jour | Installation réelle de rc.1, compte et données témoins, sauvegarde, migration vers la candidate | Compte, to-do et document conservés ; recette complète après mise à jour |

## Contrôles locaux exécutés

- Installation `pnpm --frozen-lockfile` réussie.
- `TURBO_FORCE=true pnpm verif` : typage, lint, styles, i18n, contrôles d'inopérance et de traçabilité, **591 tests unitaires**, **9 tests des garde-fous** et cohérence de livraison.
- Intégration PostgreSQL : **1 236 tests** (1 202 API, 34 base), dont 10 budgets de performance.
- Construction : quatre espaces de travail réussis.
- Playwright : première passe complète de **772 tests**, puis **50 tests RM-11** après correction du découpage ; zéro échec local. Deux grands tests ont été remplacés par 32 cas indépendants, ce qui porte la suite à **802 cas** (689 fonctionnels, 113 accessibilité), sans retrait de contrôle.
- Témoins négatifs supplémentaires : image exécutée sous root refusée, image contenant un faux paquet Stylelint refusée, contrôle d'archive sans argument refusé.
- Syntaxe de tous les scripts shell et du workflow YAML vérifiée ; `git diff --check` réussi.

La suite courante représente **2 638 cas automatisés**. Les preuves locales comprennent une passe complète avant le découpage et le rejeu ciblé de tous les tests modifiés ; les essais Docker complémentaires ne sont pas ajoutés à ce compte.

## Recettes sur le serveur réel

Trois recettes complètes réussies : installation neuve, installation depuis l'archive hors ligne, mise à jour depuis rc.1.

Pour chacune : migrations et amorçage, connexion, changement obligatoire du mot de passe, écriture d'une to-do et relecture, 21 routes sans erreur JavaScript ni réponse API inattendue, bascule FR/EN, SMTP via pg-boss jusqu'au formulaire de réinitialisation, compte sans rôle avec trois lectures et une écriture refusées en 403, sauvegarde, corruption volontaire d'une donnée et d'un document, restauration et reconnexion.

HTTPS a été vérifié avec le certificat racine de l'autorité locale via curl ; le parcours navigateur complémentaire vérifie aussi le cookie Secure, HttpOnly et SameSite=Lax. L'exception de certificat du navigateur sert à sa confiance locale ; le contrôle curl, lui, vérifie la chaîne avec l'autorité explicite.

Le tableau de bord et le planning ont été ouverts et regardés dans les deux thèmes, à 1 600 et 1 024 pixels : huit captures inspectées, sans vue nue ni débordement manifeste. Les huit états ont également été analysés avec axe, sans violation. Cette observation porte sur une installation neuve ; elle ne constitue pas une revue visuelle exhaustive des états métier ou une certification RGAA.

Un premier essai de recette a échoué sur une hypothèse incorrecte de la commande `docker compose port` ; le contrôle examine désormais les liaisons réelles du conteneur. Une exécution de migration a été interrompue par une modification de son script pendant son exécution ; elle a été rejouée intégralement avec le script figé. Les verdicts retenus sont ceux de `recette-neuve-validee`, `recette-archive` et `recette-migration-validee`, tous sortis en code 0.

## Sécurité résiduelle

| Périmètre | Résultat brut |
| --- | --- |
| npm production | 0 avis sur 318 dépendances |
| npm complet | 1 avis braces, 4 chemins de développement qualifiés, sur 712 dépendances |
| Image API | 0 alerte |
| Image web | 1 avis UNKNOWN, GO-2026-5932, sur le module contenant OpenPGP |
| Image PostgreSQL | 487 occurrences : 16 CRITICAL, 102 HIGH, 209 MEDIUM, 155 LOW, 5 UNKNOWN ; 196 avis distincts toutes gravités |

Les 118 occurrences HIGH/CRITICAL PostgreSQL correspondent à 54 avis distincts. Les qualifications sont nominatives et liées aux versions, pas à des exclusions globales. Elles reposent sur des fonctions non utilisées par les services livrés : notamment gosu sans traitement HTTP/TLS/XML, absence de systemd-homed/plperl/MiniZip, aucune authentification LDAP ni traitement XML SQL, pas de montage privilégié ou de console SQL utilisateur. Les conditions matérielles pertinentes ont été contrôlées dans l'image et l'instance réelle.

**Ces composants ne sont pas corrigés par la qualification.** Les hypothèses doivent être conservées et réexaminées si les usages changent. Les exceptions expirent le **3 novembre 2026** ; la CI les refusera ensuite. Les alertes de gravité inférieure restent recensées. Voir `docs/securite-livraison.md`, l'ADR et `deploiement/securite-exceptions.json` pour les sources et limites.

## Artefacts locaux

Dans `.local/stabilisation-1.0.0/livraison/` :

| Fichier | Taille | SHA-256 |
| --- | --- | --- |
| `rationarium-1.0.0-compose.tar.gz` | 88 121 octets | `21de1b44f390a70fe05c7343e56b5c5e8c734d72d47e263fa1e198917470b3ef` |
| `rationarium-1.0.0-linux-amd64.tar.gz` | 364 152 887 octets | `c3c44f1d9ea718d931aff8bae6955e4d7a1ec723b9de0993242e85f1aa5e878e` |

S'y ajoutent l'installateur, les manifestes SHA-256 et l'inventaire de chaque archive. Les trois archives d'images ont été contrôlées couche par couche, rechargées et utilisées pour la recette. Aucun `.env` privé, sauvegarde ou `node_modules` du poste n'est inclus dans les kits.

Les images locales examinées sont identifiées dans `images-final/images.txt` et `synthese-preuves.json`. Les tailles de `docker image ls` sont des tailles d'occupation affichées par Docker, distinctes des tailles compressées des archives.

## Validation GitHub

[Workflow de la branche](https://github.com/ElegArtech/rationarium/actions/workflows/images.yml?query=branch%3Acodex%2Fstabilisation-1-0-0).

La CI exécute la vérification rapide, l'intégration sur base réelle, la construction, les 802 cas navigateur, puis la construction des trois images, leurs scans et la recette depuis l'archive. Elle interdit la publication depuis une branche ou un lancement manuel ; un tag neuf doit franchir toutes ces étapes. Les exécutions historiques échouées ou annulées ne sont pas des preuves de succès.

Le premier passage a révélé l'absence de construction préalable de l'API et de LibreOffice Calc : corrigé. Un passage suivant a validé le code et l'intégration, puis réussi 770 tests navigateur sur 772 ; les deux autres ont dépassé 30 secondes car chacun regroupait seize analyses axe et captures. Ils sont désormais 32 cas indépendants, avec le même délai par cas et toutes les assertions conservées. Les mesures de graduation portent également sur chaque largeur. Ubuntu 24.04 est explicite et l'action d'archivage utilise Node 24, avec une révision épinglée.

Le lien du workflow donne le résultat distant effectif associé à chaque commit. Sur la branche, l’étape de push au registre est ignorée par condition : son exécution ne fait pas partie des preuves. Les rapports bruts et archives sont joints à l'exécution réussie ; aucune publication stable n'est déclarée par le simple numéro des manifestes.

## Préservation et nettoyage

Seuls les projets Compose créés pour la campagne ont été supprimés, avec leurs volumes et leurs relais SMTP. Le conteneur de recette préexistant et les trois documents de travail préexistants non suivis ont été préservés. Les images et les preuves restent disponibles.

Les dossiers de recette contiennent des secrets temporaires, sessions et sauvegardes de test : ils restent dans `.local`, ignoré par Git. Seuls les kits de livraison, leurs empreintes et les rapports de scan sont destinés à accompagner une publication.
