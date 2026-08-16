# ADR-0014 — TypeScript 6.0.3 plutôt que 7.0.2

- **Statut** : accepté — 2026-08-16. **Réversible, et destiné à l'être** (voir « Conditions de revanche »)
- **Source** : `cadrage/03 § 3.1` et `§ 6, R1`
- **Vérifié le** : 2026-08-16, lot L-01

## Contexte

Le socle technique retenait **TypeScript 7.0.2**, compilateur natif écrit en Go, stable depuis le 8 juillet 2026, pour des gains de vérification de type d'un ordre de grandeur. Il assortissait ce choix d'une réserve explicite, le risque R1 : *« l'API programmatique n'est stabilisée qu'en 7.1, ce qui affecte les outils qui l'utilisent — au premier rang desquels `typescript-eslint` »*. Repli annoncé : *« TypeScript 6.x, sans autre conséquence que la vitesse de compilation »*.

## Ce que la vérification a établi

`typescript-eslint@8.67.0` déclare `typescript: >=4.8.4 <6.1.0`. TypeScript 7.0.2 est hors plage, et le dépassement n'est pas toléré : **l'outil lève une erreur fatale au chargement**.

```
Error: typescript-eslint does not support TS 7.0.
```

Trois points importants, tous vérifiés en conditions réelles :

1. **Le refus n'est pas limité aux règles typées.** Il porte sur le chargement du greffon lui-même. Les règles non typées sont tout aussi indisponibles. La réserve de `03 § 3.5` — « compatibilité TS 7 à valider » — était donc plus grave que sa formulation ne le laissait entendre : ce n'est pas une dégradation, c'est une indisponibilité totale.
2. **La cohabitation n'est pas praticable aujourd'hui.** Trois montages ont été essayés et ont échoué : surcharge pnpm ciblée (`typescript-eslint>typescript`), qui ne prend pas parce que `typescript` est une dépendance *pair* résolue depuis le paquet importateur ; paquet de lint isolé sur TS 6, où le greffon continue de résoudre l'instance TS 7 par sa propre chaîne de pairs ; configuration séparée, sans effet pour la même raison.
3. **`tsc` 7.0.2 fonctionne parfaitement.** Le problème est entièrement du côté de l'outillage tiers, pas du compilateur.

## Décision

**TypeScript 6.0.3 dans tout le dépôt**, conformément au repli déjà prévu par `03 § 6, R1`.

Ce n'est pas une décision nouvelle : c'est l'application d'un repli que le socle avait anticipé et autorisé. `cadrage/03 § 3.1` et `§ 9` sont à corriger en conséquence.

### Pourquoi le repli plutôt que « TS 7 sans typescript-eslint »

L'alternative — garder TS 7 et se contenter d'`oxlint`, qui a son propre analyseur et ne dépend pas de l'API TypeScript — est défendable. Elle est écartée pour une raison propre à ce projet :

**Les règles typées sont un filet de sécurité sur du code écrit par agent.** Promesse non attendue, `any` non sûr, comparaison toujours vraie, membre non existant : ce sont exactement les défauts qu'une relecture humaine laisse passer et qu'une règle typée attrape mécaniquement. Le risque A2 de `cadrage/04 § 10.2` — du code et des tests qui *paraissent* justes — est le risque de fond de ce mode de production. On ne renonce pas à un contrôle mécanique contre un gain de vitesse de compilation non encore mesuré.

Mesure du jour, sur le dépôt vide : `pnpm typecheck` complet en **0,35 s**. Le gain de TS 7 n'a rien à mordre pour l'instant. Il en aura sur quarante tables et vingt et un modules — d'où les conditions de revanche ci-dessous.

## Conséquences

- `typescript: 6.0.3` dans les cinq manifestes ; `tsc`, `vitest`, `vite` et `eslint` alignés dessus.
- Les règles typées de `typescript-eslint` sont **actives** : c'est l'acquis de ce repli.
- `oxlint` reste en passe rapide de pré-validation, comme prévu par `03 § 3.5`.
- Correction à porter dans `cadrage/03 § 3.1` et `§ 9` : la ligne TypeScript passe de 7.0.2 à 6.0.3, avec renvoi à la présente ADR.

## Conditions de revanche

La bascule vers TypeScript 7 se fait dès que **les deux** conditions sont réunies :

1. TypeScript **7.1** publié, avec l'API programmatique stabilisée.
2. `typescript-eslint` publiant une version qui déclare la compatibilité — le suivi est ouvert à l'adresse `github.com/typescript-eslint/typescript-eslint/issues/10940`.

La bascule est alors une montée de version et une exécution des boucles, pas une migration. Elle est à réévaluer à chaque revue de vague : c'est le premier point de veille du journal de bord.
