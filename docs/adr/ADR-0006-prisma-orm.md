# ADR-0006 — Prisma comme ORM, et ce que Prisma 7 exige réellement hors ligne

- **Statut** : accepté — 2026-08-16
- **Source** : `cadrage/03 § 4, D6` et `§ 6, R2`
- **Vérifié le** : 2026-08-16, lot L-01, en conditions de réseau fermé

## Contexte

Le socle technique retient Prisma 7.9.1 contre Drizzle (`0.x` en refonte) et TypeORM (historique de migrations problématique), pour trois raisons : migrations mûres et déterministes sur un modèle d'une quarantaine de tables destiné à vivre cinq ans, schéma déclaratif tenant lieu de documentation, et — argument décisif sous `C1` — l'abandon du moteur Rust au profit d'un client entièrement TypeScript.

Le risque R2 demandait de vérifier dès la première semaine qu'aucune étape de Prisma ne sollicite le réseau.

## Décision

**Prisma 7.9.1 est retenu.** La vérification de R2 est concluante, mais elle corrige la portée de l'affirmation de `03 § 4, D6` et impose trois contraintes permanentes.

### Ce que la vérification a établi

Un réseau Docker `--internal` — base joignable, Internet injoignable — reproduit fidèlement `C1`. Sur ce réseau :

| Commande | Résultat |
| --- | --- |
| `prisma generate` | ✅ fonctionne hors ligne |
| `prisma migrate deploy` | ✅ fonctionne hors ligne |
| `prisma migrate dev` | ✅ fonctionne hors ligne (table créée, migration écrite) |

**Mais uniquement sous conditions.** Sans elles, l'échec est celui-ci :

```
Error: request to https://binaries.prisma.sh/.../schema-engine.gz.sha256 failed,
reason: getaddrinfo EAI_AGAIN binaries.prisma.sh
```

### Correction apportée à `03 § 4, D6`

L'affirmation « plus de binaire de moteur à télécharger à l'installation ni à embarquer par plateforme » est **vraie du moteur de requêtes, fausse du moteur de schéma**. Le client Prisma 7 est bien en TypeScript pur — c'est l'acquis, et il est réel. Mais `@prisma/engines@7.9.1` télécharge en post-installation un binaire `schema-engine-<plateforme>` de **22 Mo**, spécifique à la plateforme, nécessaire à toute commande `migrate`.

Aggravant : ce téléchargement s'effectue avec `failSilent: true` et `.catch()`. **Une installation hors ligne paraît réussir et casse plus tard**, au moment de migrer. C'est le mode de défaillance le plus coûteux : silencieux à l'installation, bloquant en production.

## Conséquences

Trois contraintes permanentes, opposables à toute image et à toute chaîne d'intégration :

1. **L'image doit embarquer OpenSSL 3.** Sans lui, Prisma ne détecte pas la plateforme, se rabat sur `debian-openssl-1.1.x`, ignore le binaire embarqué et tente de télécharger celui qui correspond. `node:24-bookworm-slim` échoue pour cette raison ; `node:24-bookworm` convient.
2. **Le binaire de moteur de schéma est embarqué et épinglé**, via `PRISMA_SCHEMA_ENGINE_BINARY` pointant sur le fichier livré dans l'image. On ne compte jamais sur la détection automatique.
3. **L'installation hors ligne est contrôlée en intégration continue**, sur réseau `--internal`, et le contrôle porte sur `generate` **et** `migrate deploy` — pas sur le seul succès de `pnpm install`, qui ne prouve rien.

Autre conséquence, sans rapport avec le réseau : **en Prisma 7, l'URL de connexion ne vit plus dans le bloc `datasource` du schéma.** Elle est déclarée dans `prisma.config.ts` pour les commandes de migration, et fournie au client par un adaptateur de pilote. Le schéma qui porte `url = env("DATABASE_URL")` est refusé avec l'erreur `P1012`. Cela ajoute une dépendance d'adaptateur non listée en `03 § 9`.

> **Arrêtée au lot L-04, le 2026-08-16 : `@prisma/adapter-pg` 7.9.1**, aligné sur la version du client. Le constructeur `PrismaClient` **exige** désormais un adaptateur : `datasourceUrl` n'existe plus et son emploi lève une `PrismaClientConstructorValidationError`. Une fabrique `creerClient(url)` est exposée par `@trame/db` pour que le reste du dépôt n'ait pas à connaître ce détail.

## Alternatives écartées

- **Se fier au repli suggéré par R2** — « engendrer le client à la construction et le figer dans l'image » — est insuffisant : cela couvre `generate`, pas `migrate`. La conséquence n° 2 le complète.
- **Renoncer aux migrations Prisma** au profit de SQL manuel : perdrait le déterminisme des migrations, qui est la première raison du choix de Prisma.
