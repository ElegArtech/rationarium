# DAG — dépendances et vagues

Forme opérationnelle du § 5 de `cadrage/04`. C'est le document qu'on ouvre pour savoir **ce qui peut démarrer maintenant**.

> **Sans DAG, la parallélisation est un pari ; avec, c'est une lecture.**

**État au 2026-08-16** — vague 0 en cours. Vague 1 ouvrable dès la clôture de la vague 0 : l'arbitrage bloquant B1 est rendu, les prérequis T1 à T6 sont levés.

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
| **L-02** | Modèle de données, migrations, contraintes d'exclusion et unicités, colonne `version`, rôle SQL du journal, partitionnement | tous | — | **Haute** | L-01 | pair |
| **L-03** | `packages/contracts` : schémas Zod, 125 permissions, 26 modèles de rôles, vocabulaires § 4.1 | tous | — | **Haute** | L-00 | pair |
| **L-04** | Authentification, session, mot de passe, verrouillage, réinitialisation | M1 | 01–05 | **Haute** | L-02, L-03 | pair |
| **L-05** | Coquille applicative, navigation par droits, i18n, thème, profil | — | § B, 35 | Moyenne | L-03, L-04 | délégation |

`L-02 ∥ L-03`, puis `L-04 → L-05`.

---

## Vague 2 — Gouvernance

| Lot | Contenu | Modules | Vues | Criticité | Dépend de | Mode |
| --- | --- | --- | --- | --- | --- | --- |
| **L-06** | Structure organisationnelle **et constructeur de prédicats de périmètre** | M2 | 29 | **Haute** | L-02, L-03 | pair |
| **L-07** | Utilisateurs, annuaire, suivi individuel, contrôle de dépendances | M3 | 27, 28 | **Haute** | L-06 | pair |
| **L-08** | Rôles, matrice de permissions, journal d'audit inaltérable | M20 | 32, 33 | **Haute** | L-06 | pair |
| **L-09** | Paramétrage : affichage, planning, jours fériés, vacances scolaires | M19 | 31 | Moyenne | L-05 | délégation |

`L-06` d'abord — le périmètre conditionne tout le reste. Puis `L-07 ∥ L-08 ∥ L-09`.

---

## Vague 3 — Objets métier

**La vague parallèle.** Quatre lots simultanés au maximum — limite fixée par la capacité de vérification humaine, pas par celle de l'outil (`cadrage/04 § 8.3`). Chaque lot délégué s'exécute en **worktree isolé**.

| Lot | Contenu | Modules | Vues | Criticité | Dépend de | Mode |
| --- | --- | --- | --- | --- | --- | --- |
| **L-10** | Projets, jalons, épopées, équipe, feuille de route | M4, M5 | 10, 11, 13, 14 | Moyenne | L-07 | délégation |
| **L-11** | Tâches, sous-tâches, dépendances, RACI, kanban, cascade de dates | M6 | 12, 16, 17 | **Haute** | L-10 | pair |
| **L-12** | Tiers et clients | M14 | 23–26 | Basse | L-07 | délégation large |
| **L-13** | Compétences : référentiel, matrice, écarts | M13 | 22 | Basse | L-07 | délégation large |
| **L-14** | Événements et récurrences | M9 | 18 | Moyenne | L-07, L-09 | délégation |
| **L-15** | Congés : cycle de vie, validation, délégations, soldes, types | M10 | 19 | **Haute** | L-07, L-09 | pair |
| **L-16** | Télétravail : déclaration, règles récurrentes, vue équipe | M11 | 20 | Moyenne | L-07 | délégation |
| **L-17** | Activité récurrente : catalogue, assignations, récurrences | M8 | 34 | Moyenne | L-07, L-09 | délégation |
| **L-18** | Temps passé : saisie, plafond, rapports, saisie pour tiers | M12 | 21 | Moyenne | L-10, L-11 | délégation |
| **L-19** | Documents et commentaires, avec traçage des accès | M15 | — | Moyenne | L-10, L-11 | délégation |

**Ordre lisible** : `L-10` puis `L-11` ; `L-12`, `L-13`, `L-14`, `L-15`, `L-16`, `L-17` sont mutuellement indépendants ; `L-18` et `L-19` ferment la vague.

**Étanchéité** : deux lots d'une même vague ne modifient jamais les mêmes fichiers. Le schéma de base est hors de portée — tenu par un hook.

**B2 doit être rendu avant L-15** : circuit de validation des congés à un ou deux niveaux.

---

## Vague 4 — La vue centrale

| Lot | Contenu | Modules | Vues | Criticité | Dépend de | Mode |
| --- | --- | --- | --- | --- | --- | --- |
| **L-20** | **Planning unifié** : point d'entrée agrégé, Semaine, Mois, Activité, glisser-déposer et alternative clavier, légende filtrante, ICS | M7 | 07, 08, 09 | **Haute** | L-11, L-14, L-15, L-16, L-17 | pair |

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
| **B2** | Circuit de validation des congés : un ou deux niveaux | avant **L-15** |
| **B3** | Priorité de mise en service : quels modules en v1 | avant la **vague 5** |
| **B4** | Périmètre mobile : quelles actions sur téléphone | avant **L-25** |
| **B5** | Cible de déploiement : machine unique ou orchestrateur | avant **L-29** |
