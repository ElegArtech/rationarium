# Socle technique

**Rationarium — Plateforme de pilotage des projets et des ressources humaines**
Choix de pile, versions et partis pris d'architecture

---

## 0. Nature de ce document

Le cahier des charges fonctionnel (`01`) dit **ce que le produit doit faire** et s'interdit tout choix technique. Les briefs de conception (`02`) et les 35 maquettes disent **à quoi il ressemble et comment il se comporte**. Ce document dit **avec quoi on le construit**, et pourquoi.

Il est subordonné aux deux précédents. Aucune contrainte technique énoncée ici ne justifie de dévier d'une exigence `EX-…`, d'une règle `RG-…` ou d'une décision de conception portée par une maquette. Quand une brique technique s'oppose à la maquette, c'est la brique qu'on change.

**Les versions indiquées ont été vérifiées le 15 août 2026** contre le registre npm et les annonces officielles des éditeurs. Elles sont datées : toute reprise ultérieure de ce document doit les revalider.

> **Revalidées le 16 août 2026**, au montage des espaces de travail : les dix-neuf briques contrôlées correspondaient exactement au registre. Deux corrections ont été portées à ce document à l'issue de la levée des risques R1 et R2 — la ligne TypeScript (§ 3.1 et § 9) et la portée de l'acquis Prisma (§ 4, D6). Elles sont signalées en place.

**Comment le lire.** La section 1 dérive du cadrage les contraintes techniques qui ne se négocient pas. La section 2 énonce le principe de sélection. La section 3 est la pile elle-même, version par version. La section 4 justifie les douze décisions structurantes et nomme les options écartées. La section 5 traite les points d'architecture directement dictés par des règles de gestion. Les sections 6 à 8 rassemblent les risques, les écarts constatés dans les maquettes et ce qui reste à arbitrer.

---

## 1. Ce que le cadrage impose

Ces contraintes ne sont pas des préférences. Chacune élimine des options.

| # | Contrainte | Origine | Ce qu'elle élimine |
| --- | --- | --- | --- |
| C1 | **Réseau fermé, sans Internet sortant** | § 1.4, § 7 Disponibilité | Tout SaaS, tout CDN, toute police distante, tout service d'authentification externe, toute brique qui télécharge un binaire à l'installation ou à l'exécution |
| C2 | **Souveraineté des données** | § 1.4 | Base managée hors SI, télémétrie sortante, traduction ou OCR en ligne |
| C3 | **Une maquette HTML/CSS complète existe déjà** | 35 fichiers `mockups/` | Tout framework CSS utilitaire ou toute bibliothèque de composants stylés : il faudrait réécrire le design system |
| C4 | **Grilles très denses, temps réel de rendu** | Vues 07, 08, 22, 32 ; § 7 Performance | Rendu serveur naïf par page, tableaux non virtualisés, bibliothèques de Gantt ou de planning à DOM imposé |
| C5 | **RGAA : clavier complet, contrastes, grilles annotées** | § 1.4, § 7, § A.7 | Composants maison non testés pour les dialogues, listes déroulantes, onglets, sélecteurs de dates |
| C6 | **Glisser-déposer doublé d'une alternative clavier** | Vue 12 « Attention », `EX-PLN-10`, `EX-TSK-02` | Bibliothèques de DnD sans annonce vocale ni chemin non-pointeur |
| C7 | **Bilingue FR/EN, aucune chaîne figée** | `RG-GEN-08`, § D.7 | Textes en dur, pluriels concaténés, dates formatées à la main |
| C8 | **Thème clair / sombre / automatique** | § 7 Thème, vue 35 | Bibliothèques dont la palette n'est pas pilotable par variables CSS |
| C9 | **Impression soignée du planning et de la grille d'activité** | § 7 Impression, vues 07 et 09 | Rendu en canvas ou en WebGL, virtualisation sans mode « tout imprimer » |
| C10 | **~125 permissions atomiques × périmètre organisationnel** | § 3.2, § 3.3, `RG-SCOPE-01..04` | Autorisation déclarative simpliste ; impose un point de contrôle unique côté serveur |
| C11 | **Journal d'audit inaltérable** | `RG-ADM-01`, § 7 Traçabilité | Table d'audit modifiable par le compte applicatif |
| C12 | **Concurrence détectée, jamais écrasée** | `RG-GEN-07`, `RG-CNG-22`, `RG-CNG-23` | Écriture « dernier arrivé gagne » |
| C13 | **Traitement planifié quotidien, à instance unique** | `RG-NTF-01`, `RG-NTF-02` | Cron applicatif naïf multi-instances |
| C14 | **Réversibilité : tout exportable en formats ouverts** | § 7 Réversibilité, M21 | Formats propriétaires, stockage opaque des pièces jointes |
| C15 | **Chevauchements et unicités métier nombreux** | `RG-CNG-25..27`, `RG-TLT-01`, `RG-ACT-01`, `RG-EVT-01`, `RG-PRJ-06`, `RG-TRS-03` | Contrôles uniquement applicatifs, sans garde-fou en base |

**Volumétrie cible** (§ 7) : 500 utilisateurs · 200 projets actifs · 20 000 tâches · 5 ans d'historique.
**Budgets de performance** (§ 7) : planning d'un service sur une semaine **< 2 s** ; tableau de bord **< 1 s**.

> Ces volumes sont modestes pour une base relationnelle correctement indexée. **La difficulté du produit n'est pas la volumétrie : c'est la densité d'affichage, la finesse du modèle de droits et le nombre de règles métier.** La pile doit être choisie en conséquence — expressivité et rigueur avant capacité brute.

---

## 2. Principe de sélection

> **La maquette décide, la pile s'adapte.**

Les 35 maquettes ne sont pas des illustrations : ce sont des prototypes fonctionnels. Elles portent un socle graphique canonique — un jeu de variables CSS recopié à l'identique dans chaque vue — et une logique de rendu déjà écrite (rendu de la grille de planning, construction de la légende filtrante, filtres par couche, bascule de thème, bascule de langue, piège de focus, retour au déclencheur à la fermeture d'une fenêtre).

Trois conséquences directes :

1. **Le CSS des maquettes est repris tel quel**, pas réinterprété. Les jetons (`--accent`, `--st-doing`, `--leave-pending`, `--trame-ferie`, `--font-cond`…) deviennent le contrat de style de l'application. *(Amendé le 2026-08-31, au dégel des maquettes : le contrat de style est désormais porté par `apps/web/src/styles/socle.css` et `docs/design/DESIGN.md`, dont les maquettes sont l'origine et non plus l'arbitre. Le reste du point — l'exclusion de Tailwind et des bibliothèques de composants stylés — tient inchangé, et pour la même raison.)* Cela exclut Tailwind et toute bibliothèque de composants stylés (Material, Ant, Chakra, shadcn/ui) : leur adoption reviendrait à jeter le travail de conception pour le refaire dans un autre vocabulaire.
2. **Les composants interactifs sont pris « sans habillage »** (*headless*) : on achète le comportement et l'accessibilité, on apporte le style.
3. **Les briques dont le rendu n'est pas pilotable sont écartées** : bibliothèques de graphiques à DOM imposé, composants de Gantt, planificateurs clés en main.

Le second critère de sélection, à égalité, est **C1 — le réseau fermé**. Toute brique doit s'installer, se construire et s'exécuter sans accès sortant. Cela a évincé plusieurs candidats par ailleurs pertinents.

---

## 3. La pile

Versions vérifiées le **15 août 2026**.

### 3.1 Socle d'exécution

| Brique | Version | Rôle |
| --- | --- | --- |
| **Node.js** | **24 LTS** (Active LTS jusqu'en octobre 2026, puis maintenance) | Exécution serveur et outillage |
| **TypeScript** | **6.0.3** | Typage de bout en bout |
| **pnpm** | **11.22.0** | Gestionnaire de paquets, dépôt en espaces de travail |
| **Turborepo** | **2.10.10** | Orchestration des tâches du dépôt |
| **PostgreSQL** | **18.6** | Base de données unique |
| **Docker Compose** | — | Déploiement sur site, une machine |
| **Caddy** | 2.x | Terminaison TLS, service des fichiers statiques, en-têtes de sécurité |

**Node 24 plutôt que 26.** Node 26 est sorti mais reste en ligne *Current* : il ne passe en Active LTS qu'en octobre 2026. Démarrer sur 24 et basculer sur 26 dès sa promotion est la trajectoire sûre — d'autant que Node 26 est le dernier à suivre l'ancien modèle de publication, le nouveau (une majeure par an en avril, promotion LTS en octobre, toutes les versions devenant LTS) prenant effet avec Node 27.

**TypeScript 6 et non 7 — réserve levée, repli appliqué.** La version 7, compilateur natif écrit en Go, est stable depuis le 8 juillet 2026 et apporte des gains de vérification de type d'un ordre de grandeur. La réserve portée au risque **R1** était que l'API programmatique n'est stabilisée qu'en 7.1, ce qui affecte les outils qui l'utilisent — au premier rang desquels `typescript-eslint`.

> **Vérifié le 16 août 2026 : la réserve est fondée, et plus lourde que prévu.** `typescript-eslint` 8.67.0 ne se dégrade pas sur TypeScript 7, il **lève une erreur fatale au chargement** — pour toutes ses règles, pas seulement les règles typées. Trois montages de cohabitation TS 6 / TS 7 ont été essayés sans succès. Le repli annoncé est donc appliqué : **TypeScript 6.0.3**, avec les règles typées actives. `tsc` 7.0.2 fonctionnait parfaitement : le blocage vient de l'outillage tiers, pas du compilateur. Bascule prévue dès que TypeScript 7.1 et une version compatible de `typescript-eslint` seront publiées. Voir `docs/adr/ADR-0014`.

**PostgreSQL 18 et pas 19.** La 19 est en bêta, sortie attendue en septembre/octobre 2026. La 18 apporte le nouveau sous-système d'entrées/sorties asynchrones et une couverture d'index élargie ; c'est la base d'une mise en production en 2027.

### 3.2 Frontend

| Brique | Version | Rôle |
| --- | --- | --- |
| **React** | **19.2.8** | Bibliothèque de vues |
| **Vite** | **8.2.1** | Construction et serveur de développement (Rolldown, bundler Rust unifié) |
| **@vitejs/plugin-react** | 6.0.5 | Intégration React |
| **TanStack Router** | **1.170.29** | Routage typé, chargeurs de données par route |
| **TanStack Query** | **5.101.4** | Cache serveur, invalidations, états de chargement et d'erreur |
| **React Aria Components** | **1.20.0** | Composants sans habillage : dialogue, menu, onglets, liste déroulante, combobox, sélecteur de dates, infobulle, table |
| **@internationalized/date** | 3.12.3 | Modèle de date des composants React Aria |
| **TanStack Table** | **9.1.2** | Tables sans habillage : tri, filtres, pagination |
| **TanStack Virtual** | **3.14.9** | Virtualisation de la vue Mois, de la matrice de compétences et du journal d'audit |
| **Pragmatic drag and drop** | **3.0.0** | Glisser-déposer du planning et du kanban |
| **i18next** | **26.3.6** | Internationalisation, format ICU |
| **react-i18next** | **17.0.11** | Liaison React |
| **Zod** | **4.4.3** | Schémas partagés client / serveur |
| **temporal-polyfill** | **1.0.4** | Arithmétique calendaire (jours ouvrés, récurrences, demi-journées) |
| **@fontsource/ibm-plex-\*** | 5.3.0 | IBM Plex Sans, Serif, Sans Condensed et Mono **auto-hébergés** |
| **Lightning CSS** | 1.33.0 *(intégré à Vite)* | Imbrication, préfixes, minification |
| **Stylelint** | 17.14.1 | Discipline du CSS, garde-fou sur les jetons |

**CSS : aucun framework.** Le socle graphique des maquettes devient `styles/socle.css` (jetons, base, typographie, formulaires, boutons, alertes) importé globalement, et chaque composant porte son propre module CSS (`.module.css`, natif dans Vite) pour le reste. Pas de Sass : l'imbrication native et les variables CSS suffisent, et Lightning CSS s'en charge à la compilation.

**Polices auto-hébergées.** Voir § 7 : les maquettes chargent IBM Plex depuis `fonts.googleapis.com`, ce qui contrevient à **C1**. `@fontsource` embarque les fichiers `woff2` dans le lot de construction.

**Graphiques : aucune bibliothèque.** Les huit modules d'analyse de la vue 30 et les barres de progression de la vue 11 sont déjà écrits en SVG piloté par les jetons dans les maquettes. Ils sont portés en composants React. Si de la mise à l'échelle ou de l'interpolation devient nécessaire, `d3-scale` (4.0.2) et `d3-shape` (3.2.0) fournissent les calculs sans imposer de DOM. Recharts, ECharts, Chart.js et consorts sont écartés : ils apportent leur propre palette, leur propre typographie et leur propre gestion du thème sombre, tous trois à combattre.

**Gantt : aucune bibliothèque.** Les vues 15 et 30 sont construites sur une grille CSS et des flèches SVG, comme dans les maquettes. Les composants de Gantt du marché (dhtmlxGantt, Frappe, Syncfusion, Bryntum) imposent un DOM, un thème et souvent une licence : incompatible avec **C3** et, pour les commerciaux, avec **C2**.

### 3.3 Backend

| Brique | Version | Rôle |
| --- | --- | --- |
| **NestJS** | **11.2.1** | Structure applicative, injection de dépendances, gardes et intercepteurs |
| **@nestjs/platform-fastify** | 11.2.1 | Adaptateur HTTP |
| **Fastify** | **5.12.0** | Serveur HTTP |
| **nestjs-zod** | 5.5.0 | Validation d'entrée à partir des schémas Zod partagés |
| **@nestjs/swagger** | 11.4.6 | OpenAPI de documentation, engendré depuis les schémas |
| **Prisma ORM** | **7.9.1** | Schéma, migrations, client typé |
| **pg-boss** | **12.27.0** | File de travaux et planification, adossée à PostgreSQL |
| **@node-rs/argon2** | 2.1.0 | Hachage des mots de passe (Argon2id) |
| **Nodemailer** | 9.0.5 | Courriel sortant (relais SMTP interne) |
| **Pino** | 10.3.1 | Journalisation structurée |
| **@fastify/helmet** | 13.1.0 | En-têtes de sécurité |
| **@fastify/cookie** | 11.1.2 | Cookie de session |
| **@fastify/multipart** | 10.1.1 | Téléversement de documents et d'avatars |
| **@fastify/rate-limit** | 11.2.0 | Limitation d'essais (`RG-AUTH-01`) |

**Prisma 7 et non Prisma 6.** La version 7 abandonne le moteur Rust au profit d'un client entièrement TypeScript. Sous **C1**, l'acquis est réel : le **moteur de requêtes** ne s'installe plus comme binaire par plateforme.

> **Vérifié le 16 août 2026, sur réseau fermé : concluant, mais la portée de l'acquis était surestimée.** Le **moteur de schéma**, lui, reste un binaire de 22 Mo spécifique à la plateforme, téléchargé en post-installation et nécessaire à toute commande `migrate`. Il est téléchargé en `failSilent` : **une installation hors ligne paraît réussir et casse à la première migration.** `generate`, `migrate deploy` et `migrate dev` fonctionnent bien sans accès sortant, à deux conditions — OpenSSL 3 présent dans l'image, sans quoi Prisma se trompe de plateforme et va chercher le binaire en ligne ; et moteur embarqué puis épinglé par `PRISMA_SCHEMA_ENGINE_BINARY`. Conséquence de méthode : le contrôle d'intégration continue doit porter sur le **comportement** — engendrer, migrer — jamais sur le seul succès de l'installation. Voir `docs/adr/ADR-0006` et `ADR-0013`.
>
> Autre point relevé, sans rapport avec le réseau : en Prisma 7, l'URL de connexion ne vit plus dans le bloc `datasource` du schéma mais dans un `prisma.config.ts`, et le client la reçoit par un adaptateur de pilote. Un schéma portant `url = env(…)` est refusé (`P1012`). L'adaptateur est une dépendance à arrêter en L-02.

**Requêtes chaudes en SQL.** Le planning agrégé, les rapports et la matrice de compétences ne passent pas par le constructeur de requêtes : ce sont des vues SQL et des requêtes typées, écrites à la main, exécutées via Prisma. On garde le client typé pour les 95 % d'accès ordinaires et le SQL pour les 5 % qui portent le budget de performance.

### 3.4 Imports, exports, documents

| Besoin | Brique | Version | Note |
| --- | --- | --- | --- |
| Lecture CSV | **csv-parse** | 7.0.2 | Diffusion en flux, détection du séparateur `,` / `;` (`RG-IMP-01`) |
| Écriture CSV | **csv-stringify** | 6.8.3 | Modèles téléchargeables (`RG-IMP-02`) |
| Export Excel | **write-excel-file** | 4.1.1 | Écriture seule, maintenu ; **ExcelJS est écarté** (dernière publication en octobre 2023) |
| Export ICS | **ical-generator** | 11.1.0 | `EX-PLN-15` |
| Import ICS | **node-ical** | 0.27.1 | `EX-PLN-15`, avec prévisualisation |
| Export PDF | **Playwright** *(Chromium embarqué)* | 1.62.1 | Impression des vues via la feuille `@media print` déjà écrite |
| Stockage des pièces jointes | Volume de fichiers + table `documents` | — | Chemin adressé par empreinte, jamais par nom d'origine |

**PDF par Chromium et non par une bibliothèque de composition.** Les maquettes portent déjà des règles `@media print` — c'est le rendu attendu. Imprimer la page réelle avec le navigateur donne un PDF fidèle au produit, là où `pdfmake` ou `@react-pdf/renderer` imposeraient de redécrire chaque rapport dans un second langage de mise en page, avec une seconde source de vérité à maintenir. Contrepartie assumée : Chromium pèse environ 150 Mo dans l'image de production. Playwright étant par ailleurs l'outil de tests de bout en bout, la dépendance est mutualisée.

### 3.5 Qualité

| Brique | Version | Rôle |
| --- | --- | --- |
| **Vitest** | **4.1.10** | Tests unitaires et d'intégration |
| **Testcontainers** | 12.1.0 | PostgreSQL réel pour les tests d'intégration |
| **Playwright** | **1.62.1** | Tests de bout en bout, captures de référence, impression |
| **@axe-core/playwright** | 4.13.0 | Contrôle d'accessibilité automatisé sur chaque vue |
| **Storybook** | 10.5.8 | Catalogue de composants, **support des états vides et des variantes de droits** |
| **ESLint** | 10.8.1 | Règles de code |
| **typescript-eslint** | 8.67.0 | Règles typées *(exige TypeScript ≤ 6.0.x — ADR-0014)* |
| **oxlint** | 1.78.0 | Passe rapide en pré-validation *(optionnel)* |

**Storybook n'est pas un luxe ici.** Le § D des briefs recense une quarantaine d'états vides distincts, chacun avec son texte et sa sortie, et exige que chaque vue soit crédible « en version minimale comme en version administrateur ». Ces états ne sont pas atteignables en naviguant dans l'application : il faut un banc où les instancier. Les maquettes l'avaient d'ailleurs anticipé, avec leur panneau de revue permettant de basculer entre *normal*, *chargement*, *aucune donnée* et *données périmées*.

---

## 4. Les douze décisions structurantes

### D1 — Application monopage, pas de rendu serveur

**Retenu :** React + Vite, servi en fichiers statiques, dialoguant avec une API REST.

Le produit est un outil interne authentifié, ouvert plusieurs heures par jour, sans enjeu de référencement ni de première peinture sur réseau lent. Ses vues les plus lourdes — planning, kanban, Gantt, matrices — sont des grilles interactives à état riche : filtres par couche, repli par service, glisser-déposer, panneaux latéraux. C'est exactement ce que le rendu serveur sert le moins bien.

**Écartés :** Next.js, Remix / React Router en mode framework, TanStack Start, Nuxt. Ils apportent un serveur de rendu supplémentaire à exploiter en réseau fermé, pour un bénéfice nul sur ce profil d'usage. **HTMX et le rendu serveur classique** : séduisants pour les 20 vues simples, intenables sur les vues 07, 08, 15, 22 et 32.

### D2 — React plutôt que Vue ou Svelte

Aucune des trois n'est disqualifiée par le cadrage. React l'emporte sur un critère unique mais décisif : **l'écosystème de composants accessibles sans habillage**. React Aria Components (Adobe) n'a pas d'équivalent en maturité d'accessibilité dans les autres écosystèmes, et **C5** en fait une exigence contractuelle, pas un confort. S'y ajoutent TanStack Table, Virtual et Query, disponibles partout mais dont React est la cible de référence.

### D3 — React Aria Components plutôt que Radix ou Base UI

Les trois séparent le comportement du style, ce que **C3** exige. Le départage :

- **Radix Primitives** (`radix-ui` 1.6.7) : rachetée par WorkOS, sa vitesse de publication a ralenti, en particulier sur les composants complexes — combobox et sélection multiple, dont ce produit fait un usage intensif (assignés, services, projets, périmètres, dépendances).
- **Base UI** (`@base-ui-components/react`) : issue des auteurs de Radix, Floating UI et MUI, techniquement excellente et pourvue d'un fournisseur de politique de sécurité de contenu — mais **la version publiée est `1.0.0-rc.0`**, une candidate de publication. Fonder l'intégralité de l'interface d'un produit institutionnel sur une pré-version est un risque que rien n'oblige à prendre.
- **React Aria Components 1.20.0** : stable, publiée le 31 juillet 2026, sur une ligne 1.x active depuis deux ans. Elle apporte en outre ce dont ce produit a précisément besoin : navigation clavier bidimensionnelle sur les grilles, gestion complète du focus dans les fenêtres, annonces vocales, sélecteurs de dates internationalisés, et une couverture RGAA/WCAG éprouvée.

Base UI est le repli naturel dès sa version 1.0 stable, si un composant venait à manquer.

### D4 — Glisser-déposer : Pragmatic drag and drop

**Retenu :** `@atlaskit/pragmatic-drag-and-drop` **3.0.0** (publié le 14 août 2026).

Trois raisons. **La performance** : il s'appuie sur l'API native du navigateur, ne monte aucun observateur permanent et n'impose aucun conteneur — sur la grille de la vue 08 (une vingtaine de lignes × vingt-deux colonnes), les solutions à capteurs synthétiques dégradent visiblement. **L'indépendance au DOM** : il se greffe sur la grille CSS existante sans la contraindre, condition posée par **C3**. **La maintenance** : publication d'hier, contre décembre 2024 pour `@dnd-kit/core` 6.3.1.

**Sur C6.** Pragmatic drag and drop ne fournit pas de déplacement au clavier prêt à l'emploi. Ce n'est pas un défaut ici : le brief de la vue 12 demande que le glisser-déposer soit **doublé** d'une alternative clavier — c'est-à-dire une action explicite (« Déplacer vers… », « Réassigner à… ») accessible depuis le menu de la carte, et non un mode de traînée simulée au clavier. Cette alternative explicite est meilleure du point de vue RGAA : elle est découvrable, annonçable et testable. Elle est donc à construire, quelle que soit la bibliothèque retenue.

**Écarté :** `@dnd-kit/react` 0.5.0, la nouvelle ligne de dnd-kit, encore en `0.x`.

### D5 — NestJS plutôt que Fastify seul

Le produit compte 21 modules, environ 125 permissions atomiques, un périmètre organisationnel à croiser avec chaque lecture, un journal d'audit à alimenter sur une trentaine d'actions, et plus de 150 règles de gestion. **Les préoccupations transverses dominent le code métier.** C'est le terrain d'élection de NestJS : une garde de permission, une garde de périmètre, un intercepteur d'audit et un intercepteur de concurrence optimiste, déclarés une fois et appliqués par décorateur.

L'adaptateur Fastify élimine le surcoût d'Express sans rien coûter en structure.

**Réserve.** NestJS v12 est annoncé pour le troisième trimestre 2026, avec un passage complet aux modules ES, la validation par Standard Schema, et un remplacement de l'outillage (Vitest à la place de Jest, oxlint à la place d'ESLint, Rspack à la place de Webpack). Démarrer aujourd'hui sur la 11.2.1 en écrivant du code compatible modules ES rend cette migration mécanique. Elle est à budgéter, pas à redouter.

**Écartés :** **Fastify seul** — défendable pour une équipe d'une ou deux personnes, mais impose de réinventer le point de contrôle des droits, qui est précisément l'endroit où ce produit ne doit pas improviser. **Django / DRF** — le module d'administration ne sert à rien ici (tout référentiel est piloté par des vues maquettées) et la seconde langue coûte le partage des schémas de validation. **.NET, Spring** — surdimensionnés pour la volumétrie visée.

### D6 — Prisma plutôt que Drizzle ou TypeORM

**Prisma 7.9.1.** Migrations mûres et déterministes — indispensables pour un modèle de quarante tables environ qui vivra cinq ans ; client sans moteur natif depuis la 7, donc installable hors ligne ; schéma déclaratif lisible, qui fait office de documentation du modèle.

**Écartés :** **Drizzle ORM** — excellente approche, mais la ligne stable est encore en `0.45.2` et la `1.0` en bêta ; on ne fonde pas la persistance d'un produit institutionnel sur un `0.x` en cours de refonte. **TypeORM 1.1.0** — historique de migrations problématique. **Kysely 0.29.5** — remarquable constructeur de requêtes, mais ne gère pas les migrations de schéma ; envisageable en complément si le SQL manuel devait s'étendre.

### D7 — PostgreSQL seul, sans Redis ni moteur de recherche

**Une seule dépendance de données.** Sous **C1** et pour une exploitation sur site, chaque service supplémentaire est une pièce à installer, sauvegarder, superviser et redémarrer.

- **File et planification** → `pg-boss` 12.27.0, adossé à PostgreSQL via `SKIP LOCKED`. Il fournit nativement les travaux périodiques et le verrou d'instance unique qu'exige **`RG-NTF-02`**, sans Redis. Le débit visé (quelques centaines de notifications par jour) est deux ordres de grandeur sous son plafond.
- **Sessions** → table PostgreSQL, pas de magasin en mémoire (**`EX-AUTH-03`** exige l'invalidation).
- **Recherche globale** → recherche plein texte native avec `pg_trgm`. Sur 20 000 tâches et 200 projets, Elasticsearch ou OpenSearch seraient une machinerie sans objet.
- **Cache** → cache mémoire du processus applicatif pour les référentiels stables (permissions, types de congés, jours fériés), invalidé à l'écriture.

**Écartés :** Redis, BullMQ, Elasticsearch, MeiliSearch.

### D8 — Sessions opaques en base, pas de JWT

**`EX-AUTH-02`** demande de rester connecté entre deux sessions de navigateur, **`EX-AUTH-03`** d'invalider la session à la déconnexion, **`RG-AUTH-05`** d'interdire l'accès à un compte désactivé, **`RG-USR-04`** d'effacer l'historique à la suppression définitive. Un jeton auto-porté ne sait rien révoquer sans une liste de révocation — c'est-à-dire sans la table qu'il prétendait éviter.

**Retenu :** identifiant de session aléatoire dans un cookie `HttpOnly` / `SameSite=Lax` / `Secure`, session en base avec dernière activité et date d'expiration, jeton anti-CSRF à double soumission. Mots de passe en **Argon2id** (`@node-rs/argon2` 2.1.0).

**Sur Better Auth (1.6.29).** Bibliothèque de qualité, mais le cadrage impose une politique de mot de passe, un verrouillage après tentatives, un changement imposé à la première connexion, des jetons de réinitialisation à usage unique avec trois messages d'échec distincts et un traçage systématique dans le journal d'audit — soit un comportement entièrement spécifique. L'écrire à la main représente quelques centaines de lignes, entièrement testables et auditables. Le raccordement à un annuaire d'entreprise reste ouvert (§ 9.5 du cahier des charges) : prévoir une couture d'adaptation pour LDAP / Active Directory, sans l'implémenter tant que l'arbitrage n'est pas rendu.

### D9 — Contrat partagé en Zod, pas de GraphQL ni de tRPC

Un espace de travail `packages/contracts` porte les schémas Zod, les types dérivés, le catalogue de permissions et les vocabulaires du § 4.1. Le serveur les consomme via `nestjs-zod` pour valider ses entrées ; le client les consomme pour ses formulaires et ses types de réponse. **Une seule définition, deux usages, aucune génération de code à orchestrer.**

L'OpenAPI reste engendré (`@nestjs/swagger`) mais à titre documentaire et pour la réversibilité, pas comme source de types.

**Écarté :** **GraphQL** — le sur-chargement que l'on cherche à éviter est déjà résolu par le point d'entrée agrégé du planning (**`RG-PLN-01`**), et il apporterait sa propre complexité d'autorisation, incompatible avec un modèle de droits à 125 permissions croisées d'un périmètre. **tRPC** — élégant, mais il enferme le contrat dans TypeScript, ce qui s'oppose à l'exigence de réversibilité et à toute intégration tierce ultérieure.

### D10 — Temporal pour l'arithmétique calendaire

Le produit calcule des jours ouvrés en excluant week-ends et fériés chômés (**`RG-CNG-16`**), des demi-journées en début et fin de période (**`RG-CNG-17`**), des répartitions par année civile (**`RG-CNG-19`**), des récurrences mensuelles ordinales (« le 3ᵉ mardi »), et un repli au dernier jour du mois quand la date n'existe pas (**`RG-ACT-04`**). Ce sont exactement les opérations que `Date` rend fausses ou pénibles.

**Retenu :** `temporal-polyfill` **1.0.4**, passé en version 1.0 stable, avec les types `PlainDate` et `PlainYearMonth` comme modèle unique côté serveur — les dates métier n'ont pas d'heure ni de fuseau, et les représenter comme des instants est la source d'erreurs la plus courante de ce type d'application. `@internationalized/date` reste utilisé côté client là où React Aria l'exige ; les deux dialoguent en chaînes ISO.

**Écartés :** Luxon 3.7.2 et date-fns 4.4.0 — corrects, mais Temporal est désormais stable et sera natif, ce qui rend le polyfill retirable à terme.

### D11 — i18next avec format ICU

**`RG-GEN-08`** interdit toute chaîne figée ; le § D.7 prévient que l'anglais est 30 % plus long. Le produit affiche par ailleurs des pluriels chiffrés en permanence (« {n} jour(s) », « {n} tâche(s) sur {total} ») et des dates dans cinq formats paramétrables (**vue 31**).

**Retenu :** `i18next` 26.3.6 + `react-i18next` 17.0.11, avec le module ICU pour les pluriels et les formats. Catalogues JSON versionnés, clés par module, **chargés depuis le lot de construction et non depuis un service distant** (C1). Contrôle en intégration continue : aucune clé manquante, aucune clé orpheline.

**Écarté :** Lingui — bundles plus petits et garanties à la compilation, mais ses macros exigent un greffon Babel ou SWC dont la version SWC est officiellement expérimentale ; sous Vite 8 et Rolldown, c'est un risque d'outillage inutile.

### D12 — Aucune bibliothèque de graphiques, de Gantt ni de planning

Décision déjà argumentée en § 3.2, rappelée ici parce qu'elle est celle qui surprendra le plus.

Les huit modules d'analyse, les trois vues de planning, les deux Gantt et les deux matrices **existent déjà en HTML, CSS et SVG dans les maquettes**, dans le vocabulaire graphique du produit, avec leurs états vides rédigés, leurs deux thèmes traités et leurs feuilles d'impression. Introduire une bibliothèque reviendrait à remplacer un travail achevé par un travail d'adaptation permanent — et, dans le cas des composants de planning commerciaux, à introduire une dépendance sous licence dans un système d'information souverain.

Le portage en composants React est du travail mécanique, pas de la conception.

---

## 5. Architecture dictée par les règles

Sept points où une règle de gestion impose une décision technique précise.

### 5.1 Le point d'entrée agrégé du planning — `RG-PLN-01`

> *« Le planning agrège en une seule sollicitation toutes les données nécessaires à la période affichée. »*

Un point d'entrée unique, `GET /planning`, paramétré par période, périmètre et couches. Il exécute, dans une transaction en lecture seule, un jeu de requêtes indexées — tâches, congés, télétravail, événements, assignations prédéfinies, fériés, vacances scolaires — et renvoie une charge unique, indexée par ressource et par jour, prête à peindre.

**Tenue du budget de 2 s.** Sur 500 utilisateurs et cinq ans d'historique, la vue Mois d'un département est de l'ordre de quelques milliers de lignes. Les index déterminants : `(assignee_id, start_date, end_date)` sur les tâches, `GiST` sur `daterange(start_date, end_date)` pour les congés, `(user_id, date)` sur le télétravail et les assignations. Contrôle en intégration continue sur un jeu de données à la volumétrie cible, avec seuil bloquant.

### 5.2 Les chevauchements gardés par la base — `RG-CNG-25..27`, `RG-TLT-01`, `RG-ACT-01`

Les règles d'unicité et de non-chevauchement sont **doublées en base** :

- congés : contrainte d'exclusion `GiST` sur `(user_id WITH =, daterange WITH &&)` filtrée sur les statuts *en attente* et *approuvé* ;
- télétravail : index unique `(user_id, date)` ;
- assignations prédéfinies : index unique `(user_id, predefined_task_id, date, period)` ;
- participants, membres de projet, rattachements de tiers, rôles RACI : index uniques composites.

L'application émet le message métier rédigé ; la base garantit qu'aucune concurrence ne peut le contourner. C'est la seule façon d'honorer ces règles sans sérialiser les écritures.

### 5.3 Le contrôle de concurrence — `RG-GEN-07`, `RG-CNG-22`, `RG-CNG-23`

Colonne `version` sur les entités modifiables. Toute mise à jour porte la version lue ; un écart lève l'erreur métier rédigée dans le brief de la vue 19 : *« La demande de congé a été modifiée pendant le traitement. Veuillez réessayer. »* Un intercepteur NestJS traduit le conflit en réponse HTTP `409` et le client, via TanStack Query, réinvalide et réaffiche.

Le cas particulier de **`RG-CNG-22`** — le solde recontrôlé au moment de l'approbation — s'exécute dans une transaction en niveau `REPEATABLE READ` avec verrou sur la ligne d'allocation.

### 5.4 Permissions et périmètre — `RG-DROITS-03`, `RG-SCOPE-01..04`

Deux mécanismes distincts, appliqués dans cet ordre, **jamais côté client** :

1. **La permission** — décorateur `@RequirePermission('leaves:approve')`, garde qui vérifie l'ensemble résolu des permissions de la session. Liste blanche stricte : toute permission absente est refusée (**`RG-DROITS-03`**).
2. **Le périmètre** — un constructeur de prédicats produit, à partir de l'utilisateur, l'ensemble des départements et des utilisateurs visibles, injecté dans chaque requête de lecture. Les détenteurs d'une permission de gestion globale court-circuitent le prédicat (**`RG-SCOPE-03`**). Les tâches confidentielles sont exclues sauf permission explicite (**`RG-SCOPE-04`**).

Côté interface, le client reçoit son ensemble de permissions à l'ouverture de session et s'en sert **uniquement** pour masquer ou désactiver ce qui ne doit pas être proposé (**`RG-GEN-06`**, § D.3). Ce n'est pas un contrôle, c'est une courtoisie ; le contrôle est au serveur.

Le catalogue des 125 permissions et les 26 modèles de rôles vivent dans `packages/contracts` : une seule liste, partagée par la garde du serveur, la matrice de la vue 32 et les tests.

### 5.5 Le journal d'audit inaltérable — `RG-ADM-01`, § 7 Traçabilité

Table `audit_log` en ajout seul. **Le rôle PostgreSQL de l'application ne détient que le droit `INSERT` et `SELECT` dessus** — `UPDATE` et `DELETE` lui sont révoqués. Aucune interface n'y écrit autrement que par l'intercepteur d'audit. Partitionnement mensuel et index `BRIN` sur l'horodatage : la rétention (§ 9.7, à arbitrer) se réglera par détachement de partition, sans purge ligne à ligne.

L'accès refusé au journal est lui-même tracé (**`RG-ADM-03`**), ce qui impose que l'intercepteur d'audit s'exécute **après** la garde de permission et sur son échec.

### 5.6 Les traitements planifiés — `RG-NTF-01`, `RG-NTF-02`, `RG-NTF-04`

`pg-boss` porte les travaux périodiques : alertes d'échéance quotidiennes à heure fixe dans le fuseau de l'organisation, génération d'assignations, capture des instantanés d'avancement (**`RG-PRJ-09`**). Le verrou d'instance unique est natif (`singletonKey`), ce qui satisfait **`RG-NTF-02`** même si l'application est déployée en plusieurs exemplaires.

**`RG-NTF-04`** — l'indisponibilité du service de messagerie ne doit jamais empêcher l'action métier d'aboutir : l'envoi de courriel est **toujours** une tâche de file, jamais un appel synchrone dans la transaction métier. Échecs réessayés avec temporisation croissante, puis mis en file d'échec, jamais propagés à l'utilisateur.

### 5.7 Suppression logique et suppression définitive — `RG-GEN-10`, § D.4

Deux mécanismes distincts, jamais confondus, comme l'exige le § D.4 :

- **désactivation réversible** — colonne `is_active` ou statut métier (*Annulé* pour un projet, **`RG-PRJ-02`**) ;
- **suppression définitive** — précédée d'un **contrôle de dépendances** exécuté côté serveur, qui renvoie la liste nommée des blocages (**`RG-USR-03`**, **`RG-PRJ-03`**, **`RG-TRS-05`**). Ce contrôle est un point d'entrée à part entière (`GET /users/:id/deletion-impact`), appelé pour peupler la fenêtre de confirmation avant que l'action ne soit possible.

---

## 6. Risques et points à valider dès la première semaine

| # | Risque | Vérification | Repli |
| --- | --- | --- | --- |
| ~~R1~~ | **Levé le 2026-08-16 — repli appliqué.** `typescript-eslint` lève une erreur fatale sur TS 7.0 ; cohabitation impraticable | Projet témoin monté : `tsc`, règles typées ESLint, `vite build` | **TypeScript 6.0.3 retenu.** Voir ADR-0014 |
| ~~R2~~ | **Levé le 2026-08-16 — concluant sous conditions.** Le moteur de schéma reste un binaire téléchargé, en échec silencieux | Vérifié sur réseau Docker `--internal` : `generate`, `migrate deploy`, `migrate dev` | **OpenSSL 3 dans l'image + moteur embarqué et épinglé.** Voir ADR-0006 |
| R3 | **NestJS v12 au troisième trimestre 2026** — passage aux modules ES | Écrire dès le départ en modules ES ; surveiller la publication | Rester en 11.x, maintenue |
| R4 | **Base UI en `1.0.0-rc.0`** — écarté aujourd'hui, à réévaluer | Suivre la sortie de la 1.0 stable | Aucun : React Aria couvre le besoin |
| R5 | **Densité de la vue Mois** (22 colonnes × N lignes) — le point dur du produit | Prototyper la vue 08 **en premier**, à la volumétrie cible, avant tout autre écran | Virtualisation par TanStack Virtual ; repli des services par défaut |
| R6 | **Chromium dans l'image de production** — poids et surface d'attaque | Image de production distincte pour le service d'export ; conteneur sans réseau sortant | `pdfmake` 0.3.11, au prix d'une seconde source de mise en page |
| R7 | **`write-excel-file` moins répandu qu'ExcelJS** | Valider les besoins réels de mise en forme des exports de rapports | `xlsx-kit` 0.8.0, ou export CSV et XLSX minimal |
| R8 | **Dérive du design system** — le CSS repris finit réinterprété | Stylelint interdisant les couleurs littérales hors `socle.css` ; captures de référence Playwright sur les deux thèmes | — |

---

## 7. Écarts constatés dans les maquettes

Quatre points relevés en confrontant les 35 fichiers aux deux documents de cadrage, à corriger au portage. Aucun ne remet en cause une décision de conception.

1. **Les polices sont chargées depuis `fonts.googleapis.com`.** C'est incompatible avec le fonctionnement en réseau fermé (**C1**) : en production, l'application afficherait les substituts système. Correction : `@fontsource/ibm-plex-sans`, `-serif`, `-sans-condensed` et `-mono` en 5.3.0, embarqués dans le lot. Les substituts système déclarés dans les maquettes restent le filet de sécurité.

2. **Le socle graphique est recopié à l'identique dans chaque fichier**, ce qui était le bon choix pour des maquettes autonomes. Au portage, il devient une feuille unique importée une fois ; les 35 copies servent de référence de conformité, pas de source.

3. **Le vocabulaire des priorités divergeait entre les deux documents de cadrage** : le cahier des charges (§ 4.1) énumérait six niveaux — Basse · Normale · Moyenne · Haute · Urgente · Critique — là où les briefs (§ A) et les maquettes n'en retiennent que quatre — Basse · Normale · Haute · Critique (codes `low`, `normal`, `high`, `critical`). Le parti pris n° 4 du cahier des charges exige un vocabulaire unique par notion, et le parti pris n° 5 proscrit les statuts redondants — « Urgente » et « Critique » désignaient le même degré.

   > **Tranché le 16 août 2026 : quatre niveaux.** `01 § 4.1` corrigé en conséquence ; les maquettes et les briefs sont inchangés. L'énumération en base est `low · normal · high · critical`.

4. **Le vocabulaire des statuts de projet divergeait de la même manière** : le cahier des charges (§ 4.1) énumérait six valeurs, dont « Suspendu » **et** « En pause » — deux libellés pour un même état, à nouveau contraires au parti pris n° 5 — là où les briefs (§ A) et les maquettes n'en retiennent que cinq. « En pause » n'apparaît dans aucun des 35 fichiers.

   > **Tranché le 16 août 2026 : cinq valeurs, au libellé des maquettes.** `01 § 4.1` corrigé en conséquence. L'énumération en base est `draft · active · paused · done · cancelled`, « paused » s'affichant « Suspendu ».

---

## 8. Ce qui reste à arbitrer

Ces points relèvent de la maîtrise d'ouvrage ou de l'exploitation, et conditionnent des choix techniques encore ouverts.

1. **Annuaire d'entreprise** (§ 9.5 du cahier des charges) — un raccordement LDAP / Active Directory change le module d'authentification et le cycle de vie des comptes. La couture d'adaptation est prévue ; l'implémentation attend la décision.
2. **Cible de déploiement** — machine unique en Docker Compose, ou orchestrateur existant de la collectivité ? Cela détermine s'il faut prévoir plusieurs instances applicatives, et donc si les sessions et les verrous doivent supporter la répartition (ils le supportent, mais cela se teste).
3. **Politique de sauvegarde et de restauration** — fréquence, rétention, épreuve de restauration. Conditionne la stratégie de stockage des pièces jointes (volume de fichiers sauvegardé avec la base, ou magasin objet compatible S3 de type MinIO).
4. **Rétention du journal d'audit** (§ 9.7) — fixe le découpage des partitions et la procédure de purge.
5. **Périmètre mobile** (§ 9.6) — les grilles denses sont explicitement réservées au poste de travail ; la liste précise des actions à rendre réalisables sur téléphone conditionne l'effort de mise en page adaptative.
6. **Priorité de mise en service** (§ 9.8) — quels modules dans la première livraison. Recommandation technique : **M1, M2, M3, M20 puis M7** — le socle d'accès, la structure organisationnelle et le planning. Le planning est à la fois la fonction centrale du produit et son plus grand risque de conception ; il doit être affronté tôt, pas gardé pour la fin.

---

## 9. Récapitulatif des versions

Vérifié le **15 août 2026**. À revalider avant tout démarrage ultérieur.

| Domaine | Brique | Version |
| --- | --- | --- |
| Exécution | Node.js | 24 LTS |
| | TypeScript | 6.0.3 |
| | pnpm | 11.22.0 |
| | Turborepo | 2.10.10 |
| | PostgreSQL | 18.6 |
| Frontend | React | 19.2.8 |
| | Vite | 8.2.1 |
| | TanStack Router | 1.170.29 |
| | TanStack Query | 5.101.4 |
| | TanStack Table | 9.1.2 |
| | TanStack Virtual | 3.14.9 |
| | React Aria Components | 1.20.0 |
| | Pragmatic drag and drop | 3.0.0 |
| | i18next / react-i18next | 26.3.6 / 17.0.11 |
| | temporal-polyfill | 1.0.4 |
| | Fontsource IBM Plex | 5.3.0 |
| Backend | NestJS | 11.2.1 |
| | Fastify | 5.12.0 |
| | Prisma ORM | 7.9.1 |
| | pg-boss | 12.27.0 |
| | Zod / nestjs-zod | 4.4.3 / 5.5.0 |
| | @node-rs/argon2 | 2.1.0 |
| | Nodemailer | 9.0.5 |
| | Pino | 10.3.1 |
| Échanges | csv-parse / csv-stringify | 7.0.2 / 6.8.3 |
| | write-excel-file | 4.1.1 |
| | ical-generator / node-ical | 11.1.0 / 0.27.1 |
| Qualité | Vitest | 4.1.10 |
| | Playwright | 1.62.1 |
| | @axe-core/playwright | 4.13.0 |
| | Storybook | 10.5.8 |
| | Testcontainers | 12.1.0 |
| | ESLint / typescript-eslint | 10.8.1 / 8.67.0 |
| | Stylelint | 17.14.1 |

---

*Fin du socle technique.*
