# ADR-0005 — NestJS plutôt que Fastify seul

- **Statut** : accepté — 2026-08-16
- **Source** : `cadrage/03 § 4, D5`

## Contexte

Le produit compte 21 modules, environ 125 permissions atomiques, un périmètre organisationnel à croiser avec **chaque** lecture, un journal d'audit à alimenter sur une trentaine d'actions, et plus de 150 règles de gestion.

**Les préoccupations transverses dominent le code métier.** C'est le fait structurant : ce n'est pas un produit dont la difficulté est le métier de chaque point d'entrée, c'est un produit dont la difficulté est ce qui s'applique à tous.

## Décision

**NestJS 11.2.1 sur adaptateur Fastify.** Une garde de permission, une garde de périmètre, un intercepteur d'audit et un intercepteur de concurrence optimiste : déclarés une fois, appliqués par décorateur.

L'adaptateur Fastify élimine le surcoût d'Express sans rien coûter en structure.

## Ce qui est désormais interdit

- Écrire un contrôle de permission ou de périmètre **dans un contrôleur ou un service**. Ces contrôles passent par les gardes, sans exception. Un contrôle recopié est un contrôle qui divergera.
- Alimenter le journal d'audit ailleurs que dans l'intercepteur dédié.
- Employer les API CommonJS. Le code est écrit en modules ES dès le départ, pour que la migration vers NestJS v12 — annoncée au troisième trimestre 2026 — reste mécanique.

## Alternatives écartées

**Fastify seul** — défendable à une ou deux personnes, mais impose de réinventer le point de contrôle des droits, précisément là où ce produit ne doit pas improviser. **Django/DRF** — le module d'administration ne sert à rien ici, et la seconde langue coûte le partage des schémas de validation. **.NET, Spring** — surdimensionnés pour la volumétrie visée.
