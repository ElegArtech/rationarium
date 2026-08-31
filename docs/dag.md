# DAG — dépendances et vagues

Forme opérationnelle du § 5 de `cadrage/04`. C'est le document qu'on ouvre pour savoir **ce qui peut démarrer maintenant**.

> **Sans DAG, la parallélisation est un pari ; avec, c'est une lecture.**

**État au 2026-08-17** — **les 35 vues sont portées ; elles ne sont pas toutes CONFORMES.** La distinction n'est pas de langue : elle a coûté un projet entier de fausse assurance.

> **Ce que la campagne de conformité a révélé — et qui invalide une partie de ce document.** `pnpm ui:diff` **sortait en zéro sans jamais comparer**. La « conformité de rendu » exigée par la définition de terminé de `CLAUDE.md` a donc été déclarée pour trente-cinq vues sur un contrôle vide, lot après lot. Le comparateur existe désormais (`scripts/ui-conformite.mjs`) et mesure réellement : vocabulaire de classes, classes inertes, textes contractuels, repères ARIA.
>
> À la première mesure honnête : **3 039 écarts**. Les vues 01 à 05 étaient portées sans une ligne de CSS ; la coquille employait un vocabulaire inventé, répété sur les trente-cinq vues — c'était aussi la vraie cause du défaut d'impression de L-27, « corrigé » dans la mauvaise direction.
>
> **Un lot marqué « livré » ci-dessous l'est sur huit boucles, pas sur neuf.** Le repasser en « livré » de plein droit est une décision humaine, pas un effet de bord de cette campagne. L'état par vue se lit par `node scripts/ui-conformite.mjs toutes`, seule source qui ne se raconte rien.
>
> Corollaire mesuré : **une classe manquante à l'écran a désigné treize capacités serveur absentes**, dont le module de congés entièrement inutilisable — rien n'écrivait jamais `leaveBalance`, donc `RG-CNG-20` refusait chaque demande, et une règle qui refuse tout passe tous ses tests de refus. Voir `docs/audits/conformite-maquettes.md`.

Les vagues 3 bis et 4 sont closes ; la vague 5 est ouverte.

Plus aucun lot ne porte la mention « livré (serveur) » : **L-08** (vues 32, 33), **L-09** (vue 31) et **L-17** (vue 34) repassent en **« livré »** tout court avec la clôture de L-37. La mention ne se justifiait que par des vues manquantes ; elles sont portées.

Il ne reste aucune vue à porter, et la vague 5 est close. Reste la **vague 6** de durcissement : audit RGAA, audit de performance, impression et PDF, audit bilingue, déploiement. Vague 1 ouvrable dès la clôture de la vague 0 : l'arbitrage bloquant B1 est rendu, les prérequis T1 à T6 sont levés.

---

## Légende

| Colonne | Sens |
| --- | --- |
| **Criticité** | Fixée par `cadrage/04 § 6.1`. Détermine **mécaniquement** le mode d'exécution et la profondeur de revue |
| **Mode** | *pair* = présence continue, mode plan obligatoire · *délégation* = sous-agent en worktree, plan validé, points de contrôle |
| **État** | à faire · en cours · **livré** (vérifié humainement et clos) |

---

## Vague 0 — Amorçage

Séquentiel, en pair. Aucune délégation : c'est le harnais qui rend la délégation possible.

| Lot | Contenu | Criticité | État |
| --- | --- | --- | --- |
| ~~**L-00**~~ | Harnais, espaces de travail, boucles de vérification, ADR, `DESIGN.md`, `socle.css`, `etats.json`, gel | Haute | **livré** — état corrigé le 2026-08-16 : la ligne était restée à « en cours » alors que ses neuf boucles servent chaque lot depuis L-02 |
| **L-01** | Levée de R1, R2, R5 · prototype jetable de la vue 08 | Haute | **livré** — ADR-0006, 0013, 0014, 0015 |

**Critère de sortie de la vague 0** : la question 3 du gate — *l'agent dispose-t-il des outils pour implémenter, tester et corriger seul ?* — reçoit un **oui démontré, commande par commande**.

---

## Vague 1 — Socle transverse

| Lot | Contenu | Modules | Vues | Criticité | Dépend de | Mode |
| --- | --- | --- | --- | --- | --- | --- |
| ~~**L-02**~~ | Modèle de données, migrations, contraintes d'exclusion et unicités, colonne `version`, rôle SQL du journal, partitionnement | tous | — | **Haute** | L-01 | **livré** |
| ~~**L-03**~~ | `packages/contracts` : schémas Zod, 152 permissions, 26 modèles de rôles, vocabulaires § 4.1 | tous | — | **Haute** | L-00 | **livré** |
| ~~**L-04**~~ | Authentification, session, mot de passe, verrouillage, réinitialisation | M1 | 01–05 | **Haute** | L-02, L-03 | **livré** |
| ~~**L-05**~~ | Coquille applicative, navigation par droits, i18n, thème, profil | — | § B, 35 | Moyenne | L-03, L-04 | **livré** |

`L-02 ∥ L-03`, puis `L-04 → L-05`. **Vague close.**

> Deux boucles ont trouvé ce qu'aucune relecture n'aurait vu. Le relevé de la maquette a corrigé trois permissions de navigation trop généreuses ; le contrôle i18n, une fois lui-même corrigé, a signalé trois omissions du § B et de la vue 03. Les deux avaient d'abord produit des faux positifs par mauvaise spécification — 122 clés et 234 éléments — avant de devenir des détecteurs utiles.

---

## Vague 2 — Gouvernance

| Lot | Contenu | Modules | Vues | Criticité | Dépend de | Mode |
| --- | --- | --- | --- | --- | --- | --- |
| ~~**L-06**~~ | Structure organisationnelle **et constructeur de prédicats de périmètre** | M2 | 29 | **Haute** | L-02, L-03 | **livré** |
| ~~**L-07**~~ | Utilisateurs, annuaire, suivi individuel, contrôle de dépendances | M3 | 27, 28 | **Haute** | L-06 | **livré** |
| ~~**L-08**~~ | Rôles, matrice de permissions, journal d'audit inaltérable | M20 | 32, 33 | **Haute** | L-06 | **livré** |
| ~~**L-09**~~ | Paramétrage : affichage, planning, jours fériés, vacances scolaires | M19 | 31 | Moyenne | L-05 | **livré** |

`L-06` d'abord — le périmètre conditionne tout le reste. Puis `L-07 ∥ L-08 ∥ L-09`. **Vague close.**

> Le calendrier (L-09) porte une responsabilité que le reste du produit consomme sans la connaître : **définir ce qu'est un jour ouvré**. Le décompte des congés, la génération des assignations et la trame du planning en dépendent. C'est pourquoi `joursOuvres` et `repartitionParAnnee` vivent ici et non dans le module congés : la notion leur préexiste.

---

## Vague 3 — Objets métier

**La vague parallèle.** Quatre lots simultanés au maximum — limite fixée par la capacité de vérification humaine, pas par celle de l'outil (`cadrage/04 § 8.3`). Chaque lot délégué s'exécute en **worktree isolé**.

| Lot | Contenu | Modules | Vues | Criticité | Dépend de | Mode |
| --- | --- | --- | --- | --- | --- | --- |
| ~~**L-10**~~ | Projets, jalons, épopées, équipe, feuille de route | M4, M5 | 10, 11, 13, 14 | Moyenne | L-07 | **livré** |
| ~~**L-11**~~ | Tâches, sous-tâches, dépendances, RACI, kanban, cascade de dates | M6 | 12, 16, 17 | **Haute** | L-10 | **livré** |
| ~~**L-12**~~ | Tiers et clients | M14 | 23–26 | Basse | L-07 | **livré** |
| ~~**L-13**~~ | Compétences : référentiel, matrice, écarts | M13 | 22 | Basse | L-07 | **livré** |
| ~~**L-14**~~ | Événements et récurrences | M9 | 18 | Moyenne | L-07, L-09 | **livré** |
| ~~**L-15**~~ | Congés : cycle de vie, validation, délégations, soldes, types | M10 | 19 | **Haute** | L-07, L-09 | **livré** |
| ~~**L-16**~~ | Télétravail : déclaration, règles récurrentes, vue équipe | M11 | 20 | Moyenne | L-07 | **livré** |
| ~~**L-17**~~ | Activité récurrente : catalogue, assignations, récurrences | M8 | 34 | Moyenne | L-07, L-09 | **livré** |
| ~~**L-18**~~ | Temps passé : saisie, plafond, rapports, saisie pour tiers | M12 | 21 | Moyenne | L-10, L-11 | **livré** |
| ~~**L-19**~~ | Documents et commentaires, avec traçage des accès | M15 | — | Moyenne | L-10, L-11 | **livré** |

**Ordre lisible** : `L-10` puis `L-11` ; `L-12`, `L-13`, `L-14`, `L-15`, `L-16`, `L-17` sont mutuellement indépendants ; `L-18` et `L-19` ferment la vague. **Vague close.**

**Étanchéité** : deux lots d'une même vague ne modifient jamais les mêmes fichiers. Le schéma de base est hors de portée — tenu par un hook.

~~**B2 doit être rendu avant L-15**~~ — **tranché** : circuit à un seul niveau, lecture par défaut de `RG-CNG-08` (manager du service, à défaut responsable du département, à défaut permission globale). Décision consignée, réversible.

---

## Vague 3 bis — Portage des vues métier

**Pourquoi cette vague existe.** Les vagues 2 et 3 ont livré leurs **modules serveur** : règles de gestion, permissions, périmètre, audit, tests d'intégration sur PostgreSQL réel. Elles n'ont pas livré leurs **vues**. Le DAG initial les portait dans le même lot ; l'exécution les a séparées de fait, et la définition de terminé de `CLAUDE.md` interdit d'appeler « livré » un lot dont les vues ne sont pas portées.

Le choix est donc de **nommer la séparation plutôt que de la subir**. Les lots ci-dessous portent les 23 vues restantes de la vague 3 ; chacun cite le lot serveur qu'il achève, pour que la chaîne `EX-… → vue → lot → commit` reste vraie dans les deux sens. Les lots serveur portent désormais la mention « livré (serveur) ».

**Ordre de portage** : par numéro de maquette. Les feuilles de style des maquettes sont **cumulatives** — porter dans le désordre oblige à relire la lignée entière à chaque vue.

| Lot | Contenu | Vues | Achève | Criticité | Mode |
| --- | --- | --- | --- | --- | --- |
| ~~**L-30**~~ | **Surface HTTP** : modules, contrôleurs, garde globale, validation, erreurs traduisibles | — | tous les lots serveur | **Haute** | **livré** |
| ~~**L-31**~~ | Socle applicatif client : routeur, fournisseurs, session, gardes de route, états transverses | — | L-05 | **Haute** | **livré** |
| ~~**L-32**~~ | Projets : portefeuille, vue d'ensemble, jalons, équipe | 10, 11, 13, 14 | L-10 | Moyenne | **livré** |
| ~~**L-33**~~ | Tâches : kanban, vue globale, fiche tâche | 12, 16, 17 | L-11 | **Haute** | **livré** |
| ~~**L-34**~~ | Occupations : événements, congés, télétravail, temps passé | 18, 19, 20, 21 | L-14, L-15, L-16, L-18 | **Haute** | **livré** |
| ~~**L-35**~~ | Compétences, tiers et clients | 22, 23, 24, 25, 26 | L-13, L-12 | Basse | **livré** |
| ~~**L-36**~~ | Utilisateurs, suivi individuel, structure organisationnelle | 27, 28, 29 | L-07, L-06 | Moyenne | **livré** |
| ~~**L-37**~~ | Administration : paramètres, rôles, journal d'audit, tâches prédéfinies | 31, 32, 33, 34 | L-09, L-08, L-17 | Moyenne | **livré** |

`L-30` d'abord, puis `L-31` — sans points d'entrée HTTP ni routeur, aucune vue ne peut être portée. Puis `L-32 → L-37` dans l'ordre des maquettes. **Vague close.**

> **Ce que L-30 a révélé.** Les vagues 2 et 3 avaient livré vingt services métier et un seul contrôleur : celui de l'authentification. Les règles étaient écrites, testées sur PostgreSQL réel — et **injoignables**. Le trou ne se voyait dans aucune boucle, parce qu'aucune boucle ne demandait « ces règles sont-elles atteignables ? ». Deux contrôles le ferment désormais : `surface-http.test.ts` refuse une route sans permission déclarée, `surface-http.int.test.ts` prouve que la déclaration produit bien un refus.

**Ce qui reste hors de cette vague** : les vues 06 (L-21), 07/08/09 (L-20), 15 et 30 (L-22) restent dans leurs vagues d'origine, parce qu'elles dépendent de modules serveur non encore écrits.

> **Ce que L-37 a révélé.** `joursFeries(annee)` ne listait que les lignes stockées sur l'année demandée, alors que `joursChomes` **projette** les fériés récurrents sur chaque année. Une année jamais importée s'affichait donc vide en vue 31, pendant que le décompte des congés y voyait bien ses fériés : deux lectures du même calendrier qui se contredisaient, et c'est le paramétrage qui avait tort. La projection est désormais commune aux deux, avec son test de non-régression. **Une contradiction entre deux lectures d'une même donnée ne se voit dans aucune boucle qui n'interroge qu'une des deux.**

---

## Vague 4 — La vue centrale

| Lot | Contenu | Modules | Vues | Criticité | Dépend de | Mode |
| --- | --- | --- | --- | --- | --- | --- |
| ~~**L-20**~~ | **Planning unifié** : point d'entrée agrégé, Semaine, Mois, Activité, glisser-déposer et alternative clavier, légende filtrante, ICS | M7 | 07, 08, 09 | **Haute** | L-11, L-14, L-15, L-16, L-17, L-30 | **livré** |

Aucun parallélisme. **Vague close.**

> **Ce que L-20 a révélé.** `FournisseurMessages` avait été écrit au L-31 et **jamais monté**. `useMessages` ne lève pas hors fournisseur — il se tait, délibérément, pour qu'une confirmation perdue ne fasse pas tomber la vue qui l'émettait. Résultat : depuis six lots, **aucune notification d'action n'apparaissait nulle part**, et six boucles vertes ne l'avaient pas vu. Aucun contrôle de bout en bout n'affirmait la présence d'un message ; ils vérifiaient tous l'effet, jamais l'accusé de réception. **Un composant qui échoue en silence par conception doit être tenu par un test, pas par une relecture.**

**Le risque de ce lot a changé de nature.** Le prototype de la vague 0 (`ADR-0015`) établit que la vue Mois n'est pas un problème de rendu : 500 ressources × 31 jours se peignent en 52 ms, et en 297 ms sur matériel bridé six fois. L'effort de conception va donc au **point d'entrée agrégé** de `RG-PLN-01` et à ses index, pas à la couche de présentation — et le contrôle de `pnpm perf` doit porter sur la requête, non sur la peinture.

---

## Vague 5 — Exploitation

| Lot | Contenu | Modules | Vues | Criticité | Dépend de | Mode |
| --- | --- | --- | --- | --- | --- | --- |
| ~~**L-21**~~ | Tableau de bord | M16 | 06 | Moyenne | L-11, L-18, L-20 | **livré** |
| ~~**L-22**~~ | Rapports, analytics, Gantt de projet et de portefeuille, instantanés | M17 | 15, 30 | Moyenne | L-10, L-11, L-18 | **livré** |
| ~~**L-23**~~ | Notifications, courriel, traitements planifiés à instance unique | M18 | — | **Haute** | L-15, L-11 | **livré** |
| ~~**L-24**~~ | Imports et exports : six formats CSV, ICS, Excel, PDF | M21 | — | **Haute** | L-07, L-10, L-11, L-15, L-13 | **livré** |

`L-21 ∥ L-22 ∥ L-24`, `L-23` en pair. **B3 doit être rendu avant l'ouverture** : quels modules dans la première livraison. **Vague close.**

> **Ce que L-24 a révélé — un contrôle dont le verdict dépendait de l'ordre des déclarations.** `i18n-check` prenait le **premier** `useTranslation` du fichier comme espace de noms de tous les `t(...)`. Un fichier liant deux espaces — `taches` et `imports` — voyait ses clés attribuées au mauvais, et déplacer une fonction changeait le verdict. Le contrôle attribue désormais chaque appel à **sa** liaison, et n'accepte que les noms réellement liés — sans ce second filtre, `trim(` et `test(` passaient pour des appels de traduction. **Un contrôle qui change d'avis quand on déplace une fonction ne contrôle rien** : c'est la troisième fois que cette leçon se paie, après le contrôle d'accessibilité et le comptage des tests de bout en bout.
>
> Second point : `analyser` déduisait les colonnes du **premier enregistrement**. Un fichier valide mais sans donnée — l'export d'un projet vide — n'en a aucun, et toutes les colonnes étaient déclarées manquantes. Les en-têtes se lisent sur la première ligne du fichier, pas sur ses données.

> **Ce que L-23 a révélé — un démarrage qui réussit puis échoue ailleurs.** `pg-boss` 12 a `createSchema: false` par défaut : `start()` migre mais refuse de créer le schéma. Le démarrage réussissait, et la **première file** échouait sur « schema "pgboss" does not exist » — dans un `onModuleInit`, donc en faisant tomber le serveur entier. C'est le contrôle d'intégration de la surface HTTP qui l'a vu, pas les tests du module : ceux-ci n'assemblent pas l'application. Deux corrections, pas une : le drapeau, et un `try` autour de l'abonnement — **`RG-NTF-04` vaut aussi un cran plus haut**, une file en panne ne doit pas empêcher le serveur de servir.
>
> **Ce que L-22 a laissé ouvert — deux questions, pas deux décisions silencieuses.**
>
> `EX-RPT-03` demande « PDF, Excel ou JSON ». Deux des trois posent une question que le cadrage ne tranche pas. **Excel** : un vrai classeur `.xlsx` exige une bibliothèque, donc un ADR au titre de `C1` et d'`ADR-0013` ; le lot rend du **CSV**, qu'Excel ouvre, et l'interface le nomme « CSV (tableur) » plutôt que « Excel ». **PDF** : le produit possède déjà des feuilles d'impression et L-27 porte le sujet ; générer ici un second chemin ferait diverger deux mises en page du même contenu, donc l'export PDF passe par l'impression du navigateur. Les deux points remontent comme **questions**, et l'interface ne promet que ce qu'elle livre.
>
> **Ce que L-21 a révélé.** Deux choses, de natures opposées.
>
> D'abord un **trou de nomenclature** : les to-do de `RG-DSH-01` sont « strictement privées », et les vingt-quatre domaines de permissions de `cadrage/01 § 3.2` n'en comportent aucun pour elles. Inventer un domaine hors catalogue aurait été pire que le trou. Un marqueur `@Personnel()` déclare désormais l'intention — session exigée, aucune permission —, et `surface-http.test.ts` en énumère la liste, comme il le fait des routes publiques. Le contrôle réel reste le `userId` de la session, et un test le prouve en tentant de modifier la to-do d'autrui.
>
> Ensuite un **faux échec récurrent** : `reuseExistingServer` valait `!CI`, et un aperçu resté vivant servait un lot périmé. La suite tombait sur du code qui n'existait plus. Reconstruire coûte quelques secondes ; chercher au mauvais endroit coûte une demi-heure.

---

## Vague 6 — Durcissement

**Ce sont des audits, pas la première prise en compte.** Accessibilité, bilingue, deux thèmes et états vides sont dans la définition de terminé de **chaque** lot depuis la vague 1. Cette vague balaie et constate.

| Lot | Contenu | Vues | Criticité | Mode |
| --- | --- | --- | --- | --- |
| ~~**L-25**~~ | Audit RGAA sur les 35 vues, deux thèmes, clavier complet | toutes | **Haute** | **livré** |
| ~~**L-26**~~ | Audit de performance : budgets tenus à la volumétrie cible, seuils bloquants | 06, 07, 08, 22, 30, 32 | **Haute** | **livré** |
| ~~**L-27**~~ | Impression et export PDF : planning, grille d'activité, rapports | 07, 09, 30 | Moyenne | **livré** |
| ~~**L-28**~~ | Bilingue complet, formats de date et d'heure, exhaustivité | toutes | Moyenne | **livré** |
| ~~**L-29**~~ | Déploiement, sauvegarde, restauration éprouvée, réversibilité | — | **Haute** | **livré** |

Un audit **balaie exhaustivement**, jamais par échantillon, et ses correctifs sont ouverts comme tâches à part entière — jamais appliqués au fil de l'audit.

> **Ce que L-29 a trouvé** — rapport en `docs/audits/L-29-exploitation.md`. Cinq défauts, dont trois qui ne se seraient vus qu'en production. **Une instance neuve était installable et inutilisable** : base migrée donc vide, aucun rôle, aucun compte, et aucun moyen d'en sortir — la création de compte autonome est désactivée et l'initialisation du référentiel exige une session qui exige un rôle qui n'existe pas encore. Elle démarrait, répondait, passait sa sonde de disponibilité, et personne ne pouvait y entrer. Aucune boucle ne pouvait le voir : **elles fabriquent toutes leurs propres données**, donc aucune ne travaille sur la base que reçoit l'exploitant. **Aucun courriel n'aurait jamais été envoyé** : NestJS initialise les fournisseurs d'un module *en parallèle*, l'abonnement à la file partait donc sur un schéma `pg-boss` pas encore créé, échouait, et l'échec était avalé par le `try/catch` écrit pour tenir `RG-NTF-04`. Les courriels étaient mis en file et jamais consommés — aucune erreur après le démarrage, une file qui grossit. Le défaut datait de L-23 et avait traversé six lots de boucles vertes, parce qu'aucun test ne démarrait l'application *puis* ne regardait si l'abonnement avait eu lieu. **Le datamodèle mentait sur sept points** : les index trigrammes, l'index BRIN du journal et le défaut `gen_random_uuid()` étaient posés en SQL et absents du schéma — la prochaine `migrate dev` les aurait repris en `DROP`, annulant la moitié de L-26 dans une migration portant sur autre chose. S'y ajoutent, trouvés en exécutant ce qui n'avait été qu'écrit : un volume PostgreSQL 18 au mauvais chemin, qui empêchait la pile de démarrer, et deux règles de cache inertes en façade. **B5 n'est pas tranchée** : le lot livre l'hypothèse par défaut du cadrage — machine unique, Compose, Caddy — et nomme ce que la répartition ajouterait, sans prétendre l'avoir mesurée.
>
> **Ce que L-28 a trouvé** — rapport en `docs/audits/L-28-bilingue.md`. **Le paramétrage d'affichage n'était appliqué nulle part.** La vue 31 offrait cinq formats de date, trois d'heure, un premier jour de semaine et des jours visibles : tous enregistrés, relus, affichés, **contrôlés par des tests verts** — et sans effet. `RG-GEN-09` et `RG-PLN-03` n'étaient pas tenues. **Un test qui vérifie qu'un réglage s'enregistre ne dit rien de ce qui compte : qu'il change quelque chose.** S'y ajoutaient neuf règles de pluriel françaises restées dans le catalogue anglais — « 0 user » au lieu de « 0 users » — et six endroits affichant l'heure sans passer par le formateur.
>
> **Ce que L-27 a trouvé** — rapport en `docs/audits/L-27-impression.md`. **Les feuilles d'impression visaient des classes inexistantes** : les maquettes nomment `.side` et `.main`, la coquille portée les a nommées `.sidebar` et `.contenu`. La barre latérale s'imprimait sur chaque feuille, et **rien ne pouvait le voir** — un sélecteur CSS sans correspondance ne produit ni erreur, ni avertissement, ni test rouge. Il est simplement inerte. Le défaut vivait dans la vue 09 depuis le L-37, consigné comme livré. S'y ajoutaient deux absences : le bloc d'impression du socle n'avait jamais été porté, et le planning n'avait aucune mise en page imprimable alors que `cadrage/01 § 7` l'exige. La question du PDF laissée ouverte au L-22 est refermée : le navigateur le produit, et un second chemin de mise en page ferait diverger deux rendus du même contenu.
>
> **Ce que L-26 a trouvé** — rapport en `docs/audits/L-26-performance.md`. Deux trous, et les mesures. **`pnpm perf` exécutait un projet Playwright sans aucun fichier de contrôle** : il passait au vert en ne mesurant rien. **Le jeu de données de volumétrie n'existait pas**, alors que la définition de terminé d'une tâche de schéma l'exige — tous les contrôles tournaient sur quelques dizaines de lignes, c'est-à-dire sur une base où aucun plan d'exécution ne ressemble à celui de production. Les deux sont comblés ; les budgets tiennent avec **deux ordres de grandeur de marge** (planning d'un service sur une semaine : 6 ms pour 1 600 ms de seuil). Le projet Playwright `perf` est retiré : le garder aurait laissé croire à une mesure là où il n'y en avait pas.
>
> **Ce que L-25 a trouvé** — rapport complet en `docs/audits/L-25-rgaa.md`. Quatre défauts, **tous invisibles à `axe`** : la vue 05 n'avait jamais été balayée (la liste des vues était tenue à la main) ; le lien d'évitement était stylé dans le socle et jamais rendu ; la fenêtre modale ne prenait pas le focus à l'ouverture — donc Échap ne la fermait pas et le clavier repartait en tête de document ; le titre de page ne distinguait pas les vues. La couverture est désormais **dérivée de l'inventaire gelé** et vérifiée par un test : ajouter une vue sans l'auditer fait échouer la suite. **Un audit qui repose sur une liste tenue à la main audite la liste, pas le produit.**

**B4 avant L-25** (périmètre mobile) · **B5 avant L-29** (cible de déploiement).

---

## Vague 7 — Rattrapage des inopérants

**Ouverte le 2026-08-31, après le premier déploiement réel.** Ce n'est pas un audit
de conformité de plus : c'est le rattrapage d'une **famille** de défauts que six
vagues de boucles vertes n'ont pas vue, parce qu'elle est silencieuse par
construction — *une fonctionnalité absente ne fait échouer aucun contrôle*.

Quatre défauts de cette famille ont été trouvés **par l'utilisateur en une
après-midi**, aucun par une boucle : une route gardée, testée, qu'aucun écran
n'appelait ; un bouton désactivé derrière un motif périmé ; une forme de réponse
inventée par le client et validée par son propre jeu d'essai ; un champ manquant dans
une lecture, dont on avait conclu que la route d'écriture n'existait pas.

| Lot | Contenu | Criticité | Mode | État |
| --- | --- | --- | --- | --- |
| ~~**L-38**~~ | **Cloisonnement des champs gouvernés.** Un champ dont l'écriture confère un droit est gouverné par la permission de ce droit, pas par celle de la route | **Haute** | pair | **livré** |
| ~~**L-39**~~ | Garde-fou : aucune route serveur sans appel client | Moyenne | délégation | **livré** |
| ~~**L-40**~~ | Garde-fou : aucune commande inerte ni champ sensible non déclarés | Moyenne | délégation | **livré** |
| ~~**L-41**~~ | Garde-fou : aucune `EX-…`/`RG-…` sans test qui la cite | Moyenne | délégation | **livré** |
| ~~**L-42**~~ | `PATCH` et `DELETE /evenements/:id`, avec la portée sur une série | Moyenne | délégation | **livré** |
| ~~**L-43**~~ | Exécution des imports de compétences et de congés | Moyenne | délégation | **livré** |
| ~~**L-45**~~ | Tâches candidates aux dépendances, et pose d'un ensemble | Moyenne | délégation | **livré** |
| ~~**L-47**~~ | Annulation logique d'un projet — le premier des trois temps de `RG-GEN-10` | Moyenne | pair | **livré** |
| ~~**L-49**~~ | Suppression de rôle, statistiques de télétravail | Basse | pair | **livré** |
| ~~**L-44**~~ | Les deux routes d'import que le client appelait dans le vide | Moyenne | pair | **livré** |
| ~~**L-46**~~ | Annulation de congé, référentiel des types, jours ouvrés | Moyenne | délégation | **livré** |
| ~~**L-48**~~ | Documents et commentaires de la fiche tâche | Moyenne | pair | **livré** |
| ~~**7-3 bis**~~ | Paramétrage, rôles, compétences, présence, instantané | Moyenne | délégation | **livré** |
| ~~**7-4**~~ | Dette de traçabilité — 364 identifiants, 123 en dette à l'ouverture | Basse | délégation | **livré** |
| ~~**7-5**~~ | Clôture : rapport, capitalisation, déploiement | — | pair | **livré** |

> **Ce que la vague 7 a trouvé, et que le plan ne prévoyait pas.** Deux défauts de
> sécurité. **`IT_SUPPORT` pouvait s'attribuer `ADMIN`** : `PATCH /utilisateurs/:id`
> est gardé par `users:update` et écrivait `roleId`, alors que le catalogue de rôles
> énonce en toutes lettres « pas de gestion des rôles — c'est la limite qui sépare le
> support de l'administration ». La limite était écrite et tenue nulle part. **Un rôle
> système pouvait être vidé de ses permissions** : `RG-ADM-02` n'était tenue que côté
> client, et une requête forgée sur `PUT /administration/roles/:id/permissions` vidait
> `ADMIN` — que nul ne pouvait restaurer, puisque restaurer exige
> `users:manage_permissions`, qui vit dedans. Le raisonnement était pourtant écrit
> douze lignes plus haut dans le même fichier, sur `renommer` : **le commentaire
> décrivait exactement le trou qu'il ne bouchait pas.**
>
> S'y ajoute **`RG-TLT-07`, énoncée au cadrage et appliquée nulle part** sur trois
> routes : tout agent pouvait poser du télétravail sur le calendrier de n'importe
> qui. Et un champ nommé `annee` qui portait un nombre de jours — invisible parce que
> **personne n'appelait la route**, donc aucune assertion ne portait sur sa forme.
>
> Le compte des inopérants a doublé à chaque mesure plus fine : 13 routes sans client
> à l'audit initial, **41** au croisement mécanique de L-39 ; 2 commandes inertes
> annoncées, **12** au balayage de L-40. *Une famille de défauts silencieux se mesure
> toujours en dessous de sa taille réelle tant qu'on ne l'instrumente pas.*
>
> **Clos le 2026-08-31.** 45 commits. Routes sans appel client : 41 → **18**, toutes
> énumérées avec leur raison. Commandes inertes : 12 → **9**, toutes déclarées.
> Traçabilité : 239/364 → **304/364 (84 %)**, zéro citation orpheline, quatre règles
> déclarées non testables au lieu de six. Suites : **758** contrôles d'intégration,
> **399** de bout en bout, **180** d'accessibilité. Rapport en
> `docs/audits/V7-inoperants.md`, journal des décisions en `docs/audits/V7-diff-retour.md`.
>
> **Six défauts de sécurité ou de cloisonnement**, aucun prévu au plan : élévation de
> privilèges par `roleId`, vidage d'un rôle système, télétravail d'autrui, temps
> d'autrui, invitation à un événement invisible, énumération de l'annuaire par les
> détenteurs d'une compétence. Plus une perte de données silencieuse à l'import en mode
> Remplacer.

---

## Arbitrages restants et leur échéance

| # | Arbitrage | Échéance |
| --- | --- | --- |
| ~~B1~~ | ~~Vocabulaires du § 4.1~~ | **rendu le 2026-08-16** |
| ~~B2~~ | ~~Circuit de validation des congés~~ | **tranché en autonomie le 2026-08-16** : un seul niveau, lecture par défaut de RG-CNG-08 |
| **B3** | Priorité de mise en service : quels modules en v1 | avant la **vague 5** |
| **B4** | Périmètre mobile : quelles actions sur téléphone | avant **L-25** |
| **B5** | Cible de déploiement : machine unique ou orchestrateur | **encore ouverte.** L-29 a livré l'hypothèse machine unique de `cadrage/03 § 3.1`, éprouvée de bout en bout, et a énuméré ce que la répartition demanderait d'éprouver (`deploiement/README.md § 6`). L'arbitrage reste dû avant toute mise en service répartie |
