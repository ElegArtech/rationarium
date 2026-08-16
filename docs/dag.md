# DAG — dépendances et vagues

Forme opérationnelle du § 5 de `cadrage/04`. C'est le document qu'on ouvre pour savoir **ce qui peut démarrer maintenant**.

> **Sans DAG, la parallélisation est un pari ; avec, c'est une lecture.**

**État au 2026-08-16** — vagues 0 à 3 closes côté serveur (L-00 à L-19), surface HTTP (L-30), socle client (L-31) et vues projet (L-32) livrés. **10 des 35 vues sont portées.** Reste : L-33 à L-37 pour les 19 vues métier restantes, puis les vagues 4 à 6. Vague 1 ouvrable dès la clôture de la vague 0 : l'arbitrage bloquant B1 est rendu, les prérequis T1 à T6 sont levés.

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
| **L-00** | Harnais, espaces de travail, boucles de vérification, ADR, `DESIGN.md`, `socle.css`, `etats.json`, gel | Haute | en cours |
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
| ~~**L-06**~~ | Structure organisationnelle **et constructeur de prédicats de périmètre** | M2 | 29 | **Haute** | L-02, L-03 | **livré** (serveur) |
| ~~**L-07**~~ | Utilisateurs, annuaire, suivi individuel, contrôle de dépendances | M3 | 27, 28 | **Haute** | L-06 | **livré** (serveur) |
| ~~**L-08**~~ | Rôles, matrice de permissions, journal d'audit inaltérable | M20 | 32, 33 | **Haute** | L-06 | **livré** (serveur) |
| ~~**L-09**~~ | Paramétrage : affichage, planning, jours fériés, vacances scolaires | M19 | 31 | Moyenne | L-05 | **livré** (serveur) |

`L-06` d'abord — le périmètre conditionne tout le reste. Puis `L-07 ∥ L-08 ∥ L-09`. **Vague close.**

> Le calendrier (L-09) porte une responsabilité que le reste du produit consomme sans la connaître : **définir ce qu'est un jour ouvré**. Le décompte des congés, la génération des assignations et la trame du planning en dépendent. C'est pourquoi `joursOuvres` et `repartitionParAnnee` vivent ici et non dans le module congés : la notion leur préexiste.

---

## Vague 3 — Objets métier

**La vague parallèle.** Quatre lots simultanés au maximum — limite fixée par la capacité de vérification humaine, pas par celle de l'outil (`cadrage/04 § 8.3`). Chaque lot délégué s'exécute en **worktree isolé**.

| Lot | Contenu | Modules | Vues | Criticité | Dépend de | Mode |
| --- | --- | --- | --- | --- | --- | --- |
| ~~**L-10**~~ | Projets, jalons, épopées, équipe, feuille de route | M4, M5 | 10, 11, 13, 14 | Moyenne | L-07 | **livré** (serveur) |
| ~~**L-11**~~ | Tâches, sous-tâches, dépendances, RACI, kanban, cascade de dates | M6 | 12, 16, 17 | **Haute** | L-10 | **livré** (serveur) |
| ~~**L-12**~~ | Tiers et clients | M14 | 23–26 | Basse | L-07 | **livré** (serveur) |
| ~~**L-13**~~ | Compétences : référentiel, matrice, écarts | M13 | 22 | Basse | L-07 | **livré** (serveur) |
| ~~**L-14**~~ | Événements et récurrences | M9 | 18 | Moyenne | L-07, L-09 | **livré** (serveur) |
| ~~**L-15**~~ | Congés : cycle de vie, validation, délégations, soldes, types | M10 | 19 | **Haute** | L-07, L-09 | **livré** (serveur) |
| ~~**L-16**~~ | Télétravail : déclaration, règles récurrentes, vue équipe | M11 | 20 | Moyenne | L-07 | **livré** (serveur) |
| ~~**L-17**~~ | Activité récurrente : catalogue, assignations, récurrences | M8 | 34 | Moyenne | L-07, L-09 | **livré** (serveur) |
| ~~**L-18**~~ | Temps passé : saisie, plafond, rapports, saisie pour tiers | M12 | 21 | Moyenne | L-10, L-11 | **livré** (serveur) |
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
| **L-33** | Tâches : kanban, vue globale, fiche tâche | 12, 16, 17 | L-11 | **Haute** | délégation |
| **L-34** | Occupations : événements, congés, télétravail, temps passé | 18, 19, 20, 21 | L-14, L-15, L-16, L-18 | **Haute** | délégation |
| **L-35** | Compétences, tiers et clients | 22, 23, 24, 25, 26 | L-13, L-12 | Basse | délégation |
| **L-36** | Utilisateurs, suivi individuel, structure organisationnelle | 27, 28, 29 | L-07, L-06 | Moyenne | délégation |
| **L-37** | Administration : paramètres, rôles, journal d'audit, tâches prédéfinies | 31, 32, 33, 34 | L-09, L-08, L-17 | Moyenne | délégation |

`L-30` d'abord, puis `L-31` — sans points d'entrée HTTP ni routeur, aucune vue ne peut être portée. Puis `L-32 → L-37` dans l'ordre des maquettes.

> **Ce que L-30 a révélé.** Les vagues 2 et 3 avaient livré vingt services métier et un seul contrôleur : celui de l'authentification. Les règles étaient écrites, testées sur PostgreSQL réel — et **injoignables**. Le trou ne se voyait dans aucune boucle, parce qu'aucune boucle ne demandait « ces règles sont-elles atteignables ? ». Deux contrôles le ferment désormais : `surface-http.test.ts` refuse une route sans permission déclarée, `surface-http.int.test.ts` prouve que la déclaration produit bien un refus.

**Ce qui reste hors de cette vague** : les vues 06 (L-21), 07/08/09 (L-20), 15 et 30 (L-22) restent dans leurs vagues d'origine, parce qu'elles dépendent de modules serveur non encore écrits.

---

## Vague 4 — La vue centrale

| Lot | Contenu | Modules | Vues | Criticité | Dépend de | Mode |
| --- | --- | --- | --- | --- | --- | --- |
| **L-20** | **Planning unifié** : point d'entrée agrégé, Semaine, Mois, Activité, glisser-déposer et alternative clavier, légende filtrante, ICS | M7 | 07, 08, 09 | **Haute** | L-11, L-14, L-15, L-16, L-17, L-30 | pair |

Aucun parallélisme.

**Le risque de ce lot a changé de nature.** Le prototype de la vague 0 (`ADR-0015`) établit que la vue Mois n'est pas un problème de rendu : 500 ressources × 31 jours se peignent en 52 ms, et en 297 ms sur matériel bridé six fois. L'effort de conception va donc au **point d'entrée agrégé** de `RG-PLN-01` et à ses index, pas à la couche de présentation — et le contrôle de `pnpm perf` doit porter sur la requête, non sur la peinture.

---

## Vague 5 — Exploitation

| Lot | Contenu | Modules | Vues | Criticité | Dépend de | Mode |
| --- | --- | --- | --- | --- | --- | --- |
| **L-21** | Tableau de bord | M16 | 06 | Moyenne | L-11, L-18, L-20 | délégation |
| **L-22** | Rapports, analytics, Gantt de projet et de portefeuille, instantanés | M17 | 15, 30 | Moyenne | L-10, L-11, L-18 | délégation |
| **L-23** | Notifications, courriel, traitements planifiés à instance unique | M18 | — | **Haute** | L-15, L-11 | pair |
| **L-24** | Imports et exports : six formats CSV, ICS, Excel, PDF | M21 | — | **Haute** | L-07, L-10, L-11, L-15, L-13 | pair |

`L-21 ∥ L-22 ∥ L-24`, `L-23` en pair. **B3 doit être rendu avant l'ouverture** : quels modules dans la première livraison.

---

## Vague 6 — Durcissement

**Ce sont des audits, pas la première prise en compte.** Accessibilité, bilingue, deux thèmes et états vides sont dans la définition de terminé de **chaque** lot depuis la vague 1. Cette vague balaie et constate.

| Lot | Contenu | Vues | Criticité | Mode |
| --- | --- | --- | --- | --- |
| **L-25** | Audit RGAA sur les 35 vues, deux thèmes, clavier complet | toutes | **Haute** | délégation large |
| **L-26** | Audit de performance : budgets tenus à la volumétrie cible, seuils bloquants | 06, 07, 08, 22, 30, 32 | **Haute** | pair |
| **L-27** | Impression et export PDF : planning, grille d'activité, rapports | 07, 09, 30 | Moyenne | délégation |
| **L-28** | Bilingue complet, formats de date et d'heure, exhaustivité | toutes | Moyenne | délégation large |
| **L-29** | Déploiement, sauvegarde, restauration éprouvée, réversibilité | — | **Haute** | pair |

Un audit **balaie exhaustivement**, jamais par échantillon, et ses correctifs sont ouverts comme tâches à part entière — jamais appliqués au fil de l'audit.

**B4 avant L-25** (périmètre mobile) · **B5 avant L-29** (cible de déploiement).

---

## Arbitrages restants et leur échéance

| # | Arbitrage | Échéance |
| --- | --- | --- |
| ~~B1~~ | ~~Vocabulaires du § 4.1~~ | **rendu le 2026-08-16** |
| ~~B2~~ | ~~Circuit de validation des congés~~ | **tranché en autonomie le 2026-08-16** : un seul niveau, lecture par défaut de RG-CNG-08 |
| **B3** | Priorité de mise en service : quels modules en v1 | avant la **vague 5** |
| **B4** | Périmètre mobile : quelles actions sur téléphone | avant **L-25** |
| **B5** | Cible de déploiement : machine unique ou orchestrateur | avant **L-29** |
