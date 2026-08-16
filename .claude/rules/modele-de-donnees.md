---
paths:
  - "packages/db/**/*.ts"
  - "packages/db/prisma/**"
---

# Règles du modèle de données

## Toute évolution du schéma est une tâche à part entière

Le schéma ne se modifie pas au fil d'une tâche de fonctionnalité. Motif : des migrations concurrentes en vague parallèle produisent un modèle de compromis (`cadrage/04 § 5.3`). Tenu par un hook — le marqueur `.claude/TACHE-SCHEMA` déclare une tâche de schéma.

## L'intégrité se garde en base, pas seulement dans le code

`C15` l'impose : les règles de non-chevauchement et d'unicité sont **doublées** en base. L'application émet le message métier rédigé ; la base garantit qu'aucune concurrence ne peut le contourner. C'est la seule façon d'honorer ces règles sans sérialiser les écritures.

| Règle | Garde-fou en base |
| --- | --- |
| `RG-CNG-25..27` — chevauchement de congés | Contrainte d'exclusion `GiST` sur `(user_id WITH =, daterange WITH &&)`, filtrée sur *en attente* et *approuvé* |
| `RG-TLT-01` — un télétravail par jour | Index unique `(user_id, date)` |
| `RG-ACT-01` — unicité d'assignation | Index unique `(user_id, predefined_task_id, date, period)` |
| `RG-EVT-01`, `RG-PRJ-06`, `RG-TRS-03` | Index uniques composites |

## Concurrence

Colonne `version` sur toute entité modifiable (`RG-GEN-07`). Aucune écriture « dernier arrivé gagne ».

## Journal d'audit

Table `audit_log` en **ajout seul**. Le rôle PostgreSQL applicatif détient `INSERT` et `SELECT` ; `UPDATE` et `DELETE` lui sont **révoqués** (`RG-ADM-01`). Partitionnement mensuel, index `BRIN` sur l'horodatage : la rétention se règle par détachement de partition, jamais par purge ligne à ligne.

## Dates métier

Les dates métier n'ont ni heure ni fuseau. Modèle unique : `PlainDate` et `PlainYearMonth` de `temporal-polyfill`. **Les représenter comme des instants est la source d'erreurs la plus courante de ce type d'application** (`cadrage/03 § 4, D10`).

## Requêtes chaudes

Le planning agrégé, les rapports et la matrice de compétences ne passent pas par le constructeur de requêtes : vues SQL et requêtes typées écrites à la main, dans `src/sql/`. Le client typé sert les 95 % d'accès ordinaires ; le SQL sert les 5 % qui portent le budget de performance.

Index déterminants pour le budget de 2 s (`RG-PLN-01`) : `(assignee_id, start_date, end_date)` sur les tâches, `GiST` sur `daterange(start_date, end_date)` pour les congés, `(user_id, date)` sur le télétravail et les assignations.

## Deux suppressions, jamais confondues

- **Désactivation réversible** — `is_active`, ou statut métier (*Annulé* pour un projet).
- **Suppression définitive** — précédée d'un **contrôle de dépendances** côté serveur qui renvoie la liste nommée des blocages, exposé comme point d'entrée à part entière et appelé pour peupler la confirmation avant que l'action ne soit possible (`RG-USR-03`, `RG-PRJ-03`, `RG-TRS-05`).

## Prisma 7

- L'URL de connexion vit dans `prisma.config.ts`, pas dans le bloc `datasource`. Un schéma portant `url = env(…)` est refusé (`P1012`).
- `prisma migrate` exige le binaire de moteur de schéma, embarqué et épinglé. Voir `docs/adr/ADR-0006`.
