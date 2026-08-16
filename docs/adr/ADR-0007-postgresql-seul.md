# ADR-0007 — PostgreSQL seul : ni Redis, ni moteur de recherche

- **Statut** : accepté — 2026-08-16
- **Source** : `cadrage/03 § 4, D7`

## Contexte

Sous `C1` et pour une exploitation sur site, **chaque service supplémentaire est une pièce à installer, sauvegarder, superviser et redémarrer** — par une équipe qui n'est pas celle qui a construit le produit.

La volumétrie cible est modeste : 500 utilisateurs, 200 projets actifs, 20 000 tâches, 5 ans d'historique. La difficulté du produit n'est pas la capacité brute.

## Décision

**Une seule dépendance de données : PostgreSQL 18.6.**

| Besoin | Réponse |
| --- | --- |
| File de travaux et planification | `pg-boss`, adossé à PostgreSQL via `SKIP LOCKED`. Fournit nativement les travaux périodiques et le verrou d'instance unique qu'exige `RG-NTF-02` |
| Sessions | Table PostgreSQL — `EX-AUTH-03` exige l'invalidation |
| Recherche globale | Recherche plein texte native avec `pg_trgm` |
| Cache | Cache mémoire du processus, pour les référentiels stables (permissions, types de congés, jours fériés), invalidé à l'écriture |

## Ce qui est désormais interdit

- Introduire Redis, Memcached, BullMQ, Elasticsearch, OpenSearch, MeiliSearch, ou tout autre magasin de données.
- Introduire un cache partagé entre instances. Si la répartition l'exige un jour, c'est une décision d'architecture à part entière, pas un ajout de dépendance.
- Écrire un ordonnanceur applicatif maison. `RG-NTF-02` exige un verrou d'instance unique ; `pg-boss` le fournit par `singletonKey`.

## Alternatives écartées

**Redis + BullMQ** — un service de plus à exploiter, pour un débit visé (quelques centaines de notifications par jour) deux ordres de grandeur sous le plafond de `pg-boss`. **Elasticsearch, MeiliSearch** — machinerie sans objet sur 20 000 tâches et 200 projets.
