# ADR-0009 — Contrat partagé en Zod, ni GraphQL ni tRPC

- **Statut** : accepté — 2026-08-16
- **Source** : `cadrage/03 § 4, D9`

## Contexte

Le client et le serveur doivent s'accorder sur : les formes de données, le catalogue des ~125 permissions, les 26 modèles de rôles, et les vocabulaires de `cadrage/01 § 4.1`. Une double définition diverge nécessairement.

## Décision

**`packages/contracts` porte les schémas Zod et les types dérivés.** Le serveur les consomme via `nestjs-zod` pour valider ses entrées ; le client les consomme pour ses formulaires et ses types de réponse.

**Une seule définition, deux usages, aucune génération de code à orchestrer.**

L'OpenAPI reste engendré par `@nestjs/swagger`, mais **à titre documentaire et pour la réversibilité** — jamais comme source de types.

## Ce qui est désormais interdit

- Définir une énumération de vocabulaire ailleurs que dans `@rationarium/contracts`. Tenu par une règle ESLint (`no-restricted-syntax` sur `TSEnumDeclaration`).
- Redéclarer un type de réponse côté client. Il se dérive du schéma.
- Traiter l'OpenAPI engendré comme une source : il est une sortie, pas une entrée.

## Alternatives écartées

**GraphQL** — le sur-chargement qu'il résout est déjà traité par le point d'entrée agrégé du planning (`RG-PLN-01`), et il apporterait sa propre complexité d'autorisation, incompatible avec 125 permissions croisées d'un périmètre. **tRPC** — élégant, mais il enferme le contrat dans TypeScript, ce qui s'oppose à l'exigence de réversibilité (`cadrage/01 § 7`) et à toute intégration tierce ultérieure.
