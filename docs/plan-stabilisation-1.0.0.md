# Plan de stabilisation de Rationarium

## Objectif et périmètre

Lever les blocages relevés le 3 octobre 2026 sur le commit `0c9d7e0`, puis produire un candidat `1.0.0` dont le code, les images et les kits ont été vérifiés ensemble. Exécution autonome autorisée par Alexandre. Le résultat attendu est un dossier de livraison reproductible, accompagné d'un verdict fondé sur les contrôles effectivement exécutés.

Le travail couvre les dépendances JavaScript directes et transitives, les images système, le contenu de l'image API, la chaîne GitHub Actions, les références de version, les archives et les essais d'exploitation. Il ne change pas les exigences métier, le schéma de données ou l'interface sans défaut démontré.

Les documents préexistants non suivis restent préservés. Les essais utilisent uniquement des bases, volumes, ports, comptes et secrets dédiés. Les secrets et sauvegardes de test restent dans des dossiers privés ignorés par Git. Les publications existantes restent immuables ; la préparation d'une version ne réétiquette jamais `rc.1`.

## Règles de décision

- Lire les avis et les changements incompatibles avant de choisir une version ; privilégier le correctif dans la branche déjà utilisée.
- Conserver TypeScript 6.0.3 et Node.js 24. Une préversion disponible sous `latest` n'est pas un candidat acceptable.
- Préférer la mise à jour d'une dépendance parente à une surcharge. Toute surcharge doit être ciblée, expliquée et exercée par les tests de son consommateur.
- Conserver un verrouillage unique et une installation `--frozen-lockfile` reproductible.
- Exiger zéro alerte npm non qualifiée, production et développement compris. Aucune exclusion générique par paquet ou par gravité.
- Scanner les images finales, en conservant les alertes sans correctif. Une exception éventuelle décrit l'identifiant, le paquet, les conditions d'exploitation, la justification, la durée et la condition de réexamen ; un correctif disponible applicable se pose.
- Les tests fonctionnels verts ne remplacent ni le scan de sécurité, ni la vérification des images, ni un parcours navigateur sur le serveur réel.
- Un nouveau garde-fou doit aussi refuser un témoin invalide. Une suite vide, un rapport absent ou une base de vulnérabilités indisponible ne vaut jamais succès.
- Exécuter les suites lourdes séquentiellement ; borner les ouvriers navigateur. Ne relancer une suite déjà verte qu'après une modification qui l'affecte ou pour résoudre une incertitude précise.

## Ordre de travail

| Étape | Dépendances | Livrable | Critère de sortie |
| --- | --- | --- | --- |
| S0 État initial | Aucune | Branche dédiée, inventaire et preuves conservées | Base de travail identifiée, fichiers tiers préservés |
| S1 Dépendances | S0 | Manifestes, verrouillage et décision technique | Audit npm propre ou exceptions précisément démontrées |
| S2 Image API | S1 | Installation de production séparée et contrôle du contenu | Démarrage et commandes d'exploitation disponibles, outils de test absents |
| S3 Images système | S2 | Bases corrigées, rapports de scan et inventaires | Aucun risque élevé ou critique non qualifié dans les trois images |
| S4 Garde-fous de livraison | S1 | Scripts testés et workflow de validation/publication | Un tag incohérent ou un contrôle rouge interdit la publication |
| S5 Version et kits | S2, S4 | Références 1.0.0 cohérentes, notes et archives | Archives complètes, sans secrets, empreintes vérifiées |
| S6 Validation complète | S1 à S5 | Tests et recette Docker sur les artefacts finaux | Toutes les épreuves pertinentes réussissent |
| S7 Dossier final | S6 | Bilan, limites et commandes de reproduction | Chaque blocage initial a une preuve de résolution |

## S0 État initial

1. Relever le commit, la branche, les fichiers modifiés/non suivis, les versions d'outils et les conteneurs existants.
2. Travailler sur `codex/stabilisation-1-0-0` sans mélanger les documents externes à la livraison.
3. Conserver l'audit initial comme état historique ; rédiger un bilan distinct après remédiation.
4. Créer un répertoire de preuves local. Relever les versions des analyseurs, leurs empreintes officielles et la date de leur base de vulnérabilités.

## S1 Corriger les dépendances

1. Regrouper les avis par paquet et chemin réel. Distinguer les copies directes, transitives et celles embarquées uniquement par l'outillage.
2. Aligner NestJS sur une version corrigée de la branche 11 et éliminer les deux versions vulnérables de Fastify.
3. Mettre à jour Nodemailer ; examiner le changement majeur et vérifier les appels réellement utilisés, la connexion au relais, l'envoi et le traitement de la file.
4. Mettre à jour Vitest dans la branche 4, sans changement simultané de moteur TypeScript.
5. Corriger les dépendances transitives identifiées : `fast-uri`, `js-yaml`, `ip-address`, `deepmerge-ts`, `mysql2`, et celles du second audit incluant l'outillage.
6. Vérifier particulièrement les dépendances épinglées par Prisma. Ne pas changer le datamodèle ; régénérer le client si sa version évolue.
7. Enregistrer dans une décision technique les surcharges nécessaires et les risques de compatibilité. Ajouter un test ciblé seulement quand une rupture plausible n'est pas couverte.
8. Rejouer l'installation figée puis les deux audits npm. Conserver les sorties JSON et vérifier les comptes réels de paquets examinés.

## S2 Réduire l'image API

1. Séparer l'installation de construction de l'installation d'exécution. Le graphe livré doit provenir du verrouillage, avec les dépendances nécessaires à l'API, aux contrats et à la base.
2. Garder explicitement Prisma CLI et son moteur local si les migrations continuent de l'utiliser. Vérifier les dépendances utilisées par l'export, l'amorçage et la restauration.
3. Préserver les chemins utilisés par Compose et les scripts d'exploitation, ou les modifier ensemble avec un test de raccord.
4. Conserver OpenSSL compatible, certificats racines, utilisateur non privilégié, volume de documents inscriptible et propagation des signaux.
5. Écarter les sources et tests, fixtures, jeux de démonstration, outils navigateur, linters et dépendances exclusivement de développement.
6. Ajouter un contrôle exécutable qui affirme les fichiers et modules attendus, interdit les outils connus inutiles et refuse une image incomplète.
7. Comparer la taille finale à la référence de 2,61 Go ; la taille est un indicateur, le critère reste la complétude du graphe d'exécution.

## S3 Examiner les images système

1. Utiliser un analyseur épinglé, obtenu depuis sa distribution officielle et vérifié par empreinte.
2. Actualiser les images Node.js, Caddy et PostgreSQL dans des branches compatibles. Maintenir PostgreSQL 18 et son emplacement de volume.
3. Scanner les images API et interface reconstruites ainsi que PostgreSQL effectivement référencé dans Compose. Conserver les rapports complets, sans masquer les avis sans correctif.
4. Mettre à jour les paquets ou changer de variante officielle si cela retire un risque sans fragiliser l'exécution ; éviter les suppressions manuelles de fichiers appartenant aux paquets système.
5. Produire un inventaire des composants et conserver les identifiants des images examinées.
6. Si un avis persiste, vérifier sa source éditeur et documenter son applicabilité. Ne pas transformer une absence de correctif en absence de risque.

## S4 Sécuriser la chaîne de livraison

1. Introduire un contrôle commun de version : racine, espaces de travail, tag demandé, Compose, exemple d'environnement et documentation d'installation.
2. Tester le contrôle avec une version divergente, un tag incorrect et une préversion si une livraison stable est demandée.
3. Exécuter dans la CI l'installation figée, Prisma, la vérification rapide, l'intégration réelle, la construction et les parcours navigateur.
4. Séparer la validation sans droit d'écriture de la publication avec droit limité au registre. La publication dépend de la réussite des validations.
5. Construire, examiner et publier les mêmes images ; ne pas valider une image puis en reconstruire une autre silencieusement.
6. Empêcher qu'un lancement manuel remplace une version publique existante par le contenu arbitraire d'une branche.
7. Faire échouer la chaîne si un scan ne peut pas être exécuté ou si le rapport attendu manque. Conserver les rapports comme preuves.
8. Épingler les actions et outils employés, limiter leur portée et prévoir un délai maximal pour les travaux.

## S5 Préparer les artefacts de version

1. Passer les manifestes et valeurs par défaut de la distribution à `1.0.0` après correction, avant la validation finale.
2. Mettre à jour les guides d'installation et hors ligne, les références de téléchargement et les scripts concernés. Préserver les références historiques de l'audit initial.
3. Rédiger des notes de version factuelles : changements depuis `rc.1`, absence ou présence de migration, procédure de mise à jour, compatibilité et limites connues.
4. Produire le kit Compose et le paquet Linux x86-64 hors ligne depuis les images validées, avec identification du contenu et empreintes SHA-256.
5. Vérifier les membres des archives, les couches de chaque image, le rechargement Docker et l'absence de secrets ou de sauvegardes.
6. Préparer les fichiers nécessaires à une publication ; rendre explicite toute différence entre artefact local validé et version publique.

## S6 Valider le candidat final

### Boucles de code

1. Installation figée et génération Prisma.
2. Contrôles de livraison et tests négatifs de ces contrôles.
3. `TURBO_FORCE=true pnpm verif`.
4. `pnpm test:int` sur PostgreSQL réel ; vérifier les comptes et les codes de sortie. Les tests de budget sont inclus et doivent effectivement s'exécuter.
5. `TURBO_FORCE=true pnpm build`.
6. Playwright depuis `apps/web`, avec ouvriers bornés : parcours et accessibilité. Vérifier qu'aucun test requis n'est ignoré.
7. Audits npm et scans des images finales ; aucune modification ultérieure de dépendance ou d'image sans revalidation correspondante.

### Recette de distribution

1. Construire un projet Compose temporaire avec ports et volumes propres, en utilisant les fichiers du kit.
2. Installer sur base vide ; vérifier migrations, amorçage, sondes puis connexion réelle et changement obligatoire du mot de passe.
3. Vérifier HTTPS avec l'autorité locale, les cookies de session, le chargement autonome des ressources et l'absence de dépendance réseau externe du serveur en mode fermé.
4. Ouvrir les pages principales avec le véritable serveur ; relever erreurs JavaScript et réponses API inattendues. Réaliser au moins une écriture et contrôler son effet après rechargement.
5. Exercer un compte sans droits, avec refus serveur des lectures et écritures protégées ; vérifier qu'une session valide ne suffit pas.
6. Vérifier l'envoi de réinitialisation par la file vers un relais SMTP de test, puis l'utilisation du lien. Ne contacter aucun destinataire externe.
7. Installer `rc.1` sur une seconde base dédiée, créer des données témoins, sauvegarder puis mettre à jour vers le candidat. Vérifier compte, données et usage après redémarrage.
8. Sauvegarder le candidat, altérer volontairement une donnée et une pièce témoin, restaurer et vérifier leur retour, la connexion et les sondes.
9. Charger les images exportées et démarrer avec interdiction de téléchargement. Les tests doivent porter sur ce qui est réellement livré.
10. Regarder les vues touchées ou exposées au changement d'environnement dans les deux thèmes et à deux largeurs. Les contrôles automatiques ne valent pas certification RGAA complète.
11. Nettoyer seulement les conteneurs, réseaux et volumes créés pour cette campagne ; conserver les preuves privées utiles.

## S7 Rendre le verdict

Le bilan final associera chaque blocage de l'audit à sa correction et à sa preuve. Il distinguera les contrôles locaux, les contrôles CI réellement exécutés et ceux seulement préparés. Il donnera les comptes de tests, les résultats d'audit, la taille et l'identité des images, les archives produites, les limitations restantes et la procédure exacte de livraison.

Un échec déclenche une correction et la reprise des contrôles affectés. Une contrainte externe insoluble est documentée comme telle, sans déclarer le candidat stable par défaut. La publication publique n'est pas simulée par un simple changement de numéro dans le dépôt.

## Suivi d'exécution

- S0 : branche dédiée créée ; état initial conservé.
- S1 à S6 : corrections, images, archives et recettes locales réalisées.
- S7 : [bilan et preuves](bilan-stabilisation-1.0.0.md) rédigés. Le résultat distant effectif est celui du workflow lié dans le bilan ; aucun résultat CI n’est déduit des seuls contrôles locaux.
