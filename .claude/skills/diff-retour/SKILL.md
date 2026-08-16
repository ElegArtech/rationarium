---
description: Compare une vue ou un module implémenté au cadrage et propose les mises à jour de spec. À invoquer après chaque lot.
argument-hint: "[NN|L-xx]"
---

# Diff retour — $0

> **Le point de discipline qui décide si le système tient dans la durée.**

L'implémentation fait toujours émerger ce que les specs n'avaient pas prévu : un filtre nécessaire, un champ manquant, une règle ambiguë en pratique, un état non recensé. Si ces découvertes restent dans le code, `cadrage/01` et `02` divergent **silencieusement** : le code devient la vérité de fait pendant que les specs pourrissent.

## 1. Relever les écarts

Compare l'implémenté au spécifié, dans les deux sens :

- **Ce qui a été implémenté sans être spécifié** — le plus important. Reprends les « questions que j'ai dû trancher » du compte rendu de lot.
- **Ce qui est spécifié et non implémenté** — volontairement ou par omission.
- **Ce qui est spécifié mais s'est révélé impraticable ou ambigu** à l'usage.
- **Ce que la maquette montre et que le texte ne dit pas**, ou l'inverse.

## 2. Proposer, ne pas porter

Pour chaque écart :

```
ÉCART : <description>
SOURCE : <fichier:ligne dans le code>  ↔  <cadrage/01 § …  ou  absence>
PROPOSITION : <la mise à jour de spec exacte, prête à porter>
ENJEU : <ce qui se passe si on ne la porte pas>
```

**Tu ne modifies pas `cadrage/`.** Un hook le refuse, et c'est voulu : le cadrage évolue par décision humaine tracée, jamais par effet de bord d'une session.

## 3. Après arbitrage

Les propositions retenues sont portées par l'humain, ou par toi sur instruction explicite, en un commit `docs(cadrage)` distinct qui dit **quoi**, **pourquoi**, et **sur quelle base**.

## Ce que cette étape coûte

Le coût réel du diff retour — soutenable à chaque lot, ou à regrouper par vague — est le **point ouvert n° 2** du guide. Le pilote démarre en mode « à chaque lot » et mesure. Note le temps passé dans l'entrée de journal de la vague.
