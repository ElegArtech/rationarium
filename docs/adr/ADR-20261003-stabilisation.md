# ADR — dépendances et images de la candidate 1.0.0

Date : 3 octobre 2026. Statut : mise en œuvre, validation de livraison en cours.

## Décision

Mettre à jour NestJS 11.2.7, Fastify 5.12.5, Nodemailer 10.0.13 et Vitest 4.1.11, puis résoudre les transitives compatibles dans le verrou. Garder TypeScript 6.0.3 et Prisma 7.9.1. Node 24.21.0 satisfait le minimum Node 20 de Nodemailer 10 ; l'envoi réel au relais SMTP fait partie de la recette.

Quatre surcharges ciblent les parents et versions exacts : Fastify sous NestJS, js-yaml 5.4.2 sous Swagger, deepmerge-ts 8.0.2 sous Prisma config et mysql2 3.24.5 sous Prisma CLI. Elles corrigent des avis sans imposer une migration majeure du framework. La génération Prisma, les migrations réelles, les suites HTTP et l'installation Docker vérifient leur compatibilité. Toute montée du parent impose de réexaminer ces surcharges.

Prisma CLI devient une dépendance de production de `@rationarium/db` : la livraison exécute `migrate deploy` sur le serveur fermé. Le moteur est embarqué et son chemin déclaré. TypeScript reste dans le graphe de production comme pair optionnel de Prisma ; les outils de tests, style et développement sont exclus et contrôlés.

## Images

L'API utilise Node 24 sur Alpine 3.24, avec OpenSSL et le moteur Prisma musl. Une étape séparée installe seulement le graphe de production API ; les gestionnaires de paquets sont retirés de l'image finale. Le frontal utilise Caddy 2.11.6, dernière image Docker disponible vérifiée pendant cette préparation. Les bases sont épinglées par digest.

PostgreSQL conserve 18.6 et Debian Bookworm : remplacer glibc ou passer à musl change les collations des bases existantes. Une image `rationarium-base`, mise à jour par APT, accompagne désormais API et web. Le volume reste `/var/lib/postgresql` ; les sauvegardes et le passage depuis rc.1 sont exercés séparément. Les paquets APT peuvent évoluer : chaque construction est donc suivie d'un scan, et les images scannées sont celles exportées et publiées.

## Alertes résiduelles

Le contrôle de production npm exige zéro avis. Le graphe de développement conserve l'avis braces utilisé par Stylelint : les motifs sont ceux du dépôt, pas une entrée métier, et braces est interdit dans l'image API. Aucune version corrigée n'était publiée lors du contrôle.

Les avis système PostgreSQL ne disparaissent pas du rapport. Le fichier `deploiement/securite-exceptions.json` qualifie des couples avis/paquet/version/contexte exacts et impose une expiration au 3 novembre 2026. Une qualification décrit une condition d'exploitation ; elle n'est ni un correctif ni la preuve générale d'absence de vulnérabilité. Le rapport brut reste dans les preuves de livraison. Les hypothèses non démontrées doivent rester des réserves au verdict stable.

Les vérifications automatiques contrôlent notamment l'absence de systemd-homed, plperl et MiniZip, l'architecture 64 bits, l'absence de port PostgreSQL publié et de privilèges supplémentaires. L'exploitation doit conserver ces conditions ; une évolution LDAP, XML SQL, extension, montage ou privilège exige une nouvelle analyse.

## Sources

- [Nodemailer 10](https://github.com/nodemailer/nodemailer/releases/tag/v10.0.0).
- [Avis braces](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm).
- [Politique de sécurité gosu](https://github.com/tianon/gosu/blob/master/SECURITY.md).
- Les autres sources primaires figurent dans chaque exception nominative.

## Prérequis des tests en environnement neuf

Le premier passage GitHub a révélé deux prérequis auparavant fournis par le poste local : le binaire API construit utilisé par les tests d’amorçage, et LibreOffice Calc utilisé pour ouvrir réellement les exports XLSX. `test:int` dépend désormais de son propre `build` dans Turborepo ; la CI installe LibreOffice Calc et unzip comme outils de vérification, sans les ajouter aux images du produit.
