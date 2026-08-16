---
paths:
  - "**/*.test.ts"
  - "**/*.test.tsx"
  - "**/*.spec.ts"
  - "apps/web/e2e/**"
---

# Règles des tests

## Un test n'est pas une preuve

Il sera lu **comme du code suspect**, pas comme une garantie (`cadrage/04 § 8.1`). Un agent sait écrire un test qui valide son propre bug. Trois questions à chaque test, à se poser en l'écrivant :

1. Que se passe-t-il si j'inverse l'assertion ? Si le test passe encore, il ne teste rien.
2. Le cas nominal est-il le seul testé ? Les cas limites portent la valeur.
3. Le test consacre-t-il le comportement **observé** ou le comportement **spécifié** ?

La troisième est la plus dangereuse : un test écrit après coup depuis la sortie du code fige le bug.

## Nommage — la traçabilité passe par là

Un test qui couvre une règle la **cite dans son nom** :

```ts
it("RG-CNG-21 — refuse la demande et chiffre le manque quand le solde est insuffisant", …)
it("RG-TSK-04 — refuse une dépendance circulaire", …)
```

C'est ce qui rend la couverture des `EX-…`/`RG-…` mesurable autrement qu'à l'œil, et ce qui permet de vérifier un lot contre son contrat.

## Ce qui doit être testé en priorité

Par ordre, et non par commodité :

1. Les règles de gestion, une par une, cas nominal **et** cas de refus.
2. Le cloisonnement : permission absente → refus ; hors périmètre → invisible, pas seulement interdit.
3. La concurrence : deux écritures simultanées sur la même entité versionnée.
4. Les cas limites nommés par `cadrage/02` : listes longues, textes longs, droits restreints, données absentes.

## Intégration

Les tests d'intégration s'exécutent sur un **PostgreSQL réel** via Testcontainers, jamais sur un simulacre. Motif : l'essentiel de l'intégrité de ce produit est garanti par des contraintes de base — contraintes d'exclusion, index uniques, droits SQL. Un simulacre ne les exécute pas, donc ne les teste pas.

Exige Docker. Voir `CLAUDE.md`, piège sur la propriété des fichiers montés.

## Bout en bout et accessibilité

- Les parcours de bout en bout couvrent les flux, pas les champs.
- `@axe-core/playwright` sur chaque vue, dans les **deux thèmes**. Une violation est un échec, pas un avertissement.
- La conformité de rendu contre la maquette gelée passe par `pnpm ui:diff <vue>`, état par état depuis `design/etats.json`.
