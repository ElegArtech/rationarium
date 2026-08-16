# ADR-0010 — Temporal pour l'arithmétique calendaire

- **Statut** : accepté — 2026-08-16
- **Source** : `cadrage/03 § 4, D10`

## Contexte

Le produit calcule : des jours ouvrés en excluant week-ends et fériés chômés (`RG-CNG-16`), des demi-journées en début et fin de période (`RG-CNG-17`), des répartitions par année civile pour une demande à cheval (`RG-CNG-19`), des récurrences mensuelles ordinales (« le 3ᵉ mardi »), et un repli au dernier jour du mois quand la date n'existe pas (`RG-ACT-04`).

Ce sont exactement les opérations que `Date` rend fausses ou pénibles.

## Décision

**`temporal-polyfill` 1.0.4**, avec `PlainDate` et `PlainYearMonth` comme **modèle unique côté serveur**.

## Ce qui est désormais interdit

- **Représenter une date métier comme un instant.** C'est la source d'erreurs la plus courante de ce type d'application : un congé n'a ni heure ni fuseau, et le représenter comme un `Date` produit des décalages d'un jour selon le fuseau du lecteur.
- Employer `Date` pour de l'arithmétique calendaire.
- Introduire Luxon, date-fns, Moment ou dayjs.
- Faire circuler autre chose que des chaînes ISO entre le client et le serveur. `@internationalized/date` reste employé côté client là où React Aria l'exige ; les deux modèles dialoguent en ISO.

## Conditions de revanche

Temporal deviendra natif. Le polyfill est alors retirable sans changement de code : c'est une des raisons du choix.
