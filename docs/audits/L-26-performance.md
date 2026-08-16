# L-26 — Audit de performance

**Budget** : `cadrage/01 § 7` — le planning d'un service sur une semaine s'affiche
en moins de **2 s**, le tableau de bord en moins de **1 s**.
**Volumétrie cible** : 500 utilisateurs · 200 projets actifs · 20 000 tâches ·
5 ans d'historique.

## Où la mesure porte, et pourquoi

`ADR-0015` a déplacé la cible avant même que ce lot n'existe. Le prototype
jetable de la vague 0 a montré que la vue Mois — le « point dur » désigné par
`R5` — **n'est pas un problème de rendu** : 52 ms pour 500 ressources sur
31 jours, 297 ms sur matériel bridé six fois.

> Conséquence, écrite dans l'ADR : *« le contrôle de performance de `pnpm perf`
> doit porter sur la requête, non sur la peinture. »*

`pnpm perf` exécutait jusqu'ici un projet Playwright **sans aucun fichier de
contrôle** — il passait au vert en ne mesurant rien. Il exécute désormais une
suite sur PostgreSQL réel, à la volumétrie cible. Le projet Playwright `perf`
est retiré : le garder aurait laissé croire à une mesure là où il n'y en a pas.

## Le jeu de données de volumétrie

Il **n'existait pas**, alors que la définition de terminé d'une tâche de schéma
l'exige (`cadrage/04 § 5.3`). Tous les contrôles d'intégration tournaient sur
quelques dizaines de lignes — c'est-à-dire sur une base où **aucun plan
d'exécution ne ressemble à celui de production**.

`packages/db/src/volumetrie.ts` le construit : **déterministe, sans aléa**, écrit
par lots de 2 000. Un jeu qui change d'un lancement à l'autre rendrait les
mesures incomparables — on ne saurait plus si un écart vient du code ou du
tirage. Peuplement complet en ~13 s.

Ce qu'il contient au-delà des comptes bruts, et pourquoi :

| Choix | Motif |
| --- | --- |
| Chaque agent dans **deux services** | C'est le cas qui fait apparaître une personne dans deux groupes du planning |
| Deux assignés sur **une tâche sur cinq** | `RG-TSK-11` : le multi-assigné est nominal, il doit peser dans les jointures |
| Tâches étalées sur **5 ans** | Une base dont tout tombe dans la même semaine ne mesure aucun index de date |
| 60 instantanés par projet | `RG-RPT-03` : sans historique, la tendance ne mesure rien |
| Un rôle chargé du **catalogue entier** | Sans lui, la mesure de la matrice de permissions n'avait rien à mesurer |

## Résultats

Médiane de cinq exécutions après chauffe. La médiane et non la moyenne : une
pause de ramasse-miettes déplace une moyenne et laisse une médiane tranquille.

| Mesure | Médiane | Seuil bloquant | Marge |
| --- | --- | --- | --- |
| Planning · un service · une semaine | **6 ms** | 1 600 ms | ×267 |
| Planning · instance entière · un mois | **17 ms** | 3 200 ms | ×188 |
| Tableau de bord · un agent | **6 ms** | 800 ms | ×133 |
| Rapports · vue d'ensemble · un trimestre | **117 ms** | 2 000 ms | ×17 |
| Matrice de compétences · 500 × 60 | **13 ms** | 1 600 ms | ×123 |
| Matrice de permissions · un rôle | **1 ms** | 1 600 ms | ×1600 |

**Sur les seuils.** Le cadrage donne des budgets de bout en bout ; ceux retenus
ici allouent **80 % à la requête**, le reste couvrant le transport en réseau
fermé et un rendu qu'`ADR-0015` mesure à quelques dizaines de millisecondes.
C'est un choix, il est écrit, et il est conservateur : si la requête seule
dépasse ce seuil, le budget de bout en bout est perdu.

Les seuils sont **bloquants**. Une mesure qui avertit sans bloquer se contourne
par l'habitude en trois semaines.

## Les plans d'exécution

`EXPLAIN (ANALYZE, BUFFERS)` sur les trois requêtes chaudes nommées par
`.claude/rules/modele-de-donnees.md` :

| Requête | Plan | Temps |
| --- | --- | --- |
| Tâches de la semaine | `Bitmap Index Scan on tasks_dateFin_idx` puis jointure par hachage | 1,8 ms |
| Congés de la période | Balayage filtré sur 10 000 lignes | 0,9 ms |
| Télétravail de la période | `Index Scan` sur `(date)` | 0,3 ms |

Le contrôle affirme **ce qui compte** — l'index de date sert, plutôt qu'un
balayage complet des 20 000 tâches — et non la forme du plan. Affirmer une
stratégie de jointure consacrerait un comportement observé au lieu d'une
exigence, et casserait au premier `ANALYZE` qui change d'avis.

## Ce que l'audit ne dit pas

- **Une seule session à la fois.** Rien ici ne mesure la contention : cinquante
  plannings simultanés sur un pool de connexions borné se comporteraient
  autrement. C'est un essai de charge, pas un audit de budget, et il demande
  une cible de déploiement — donc `B5`, donc L-29.
- **Machine de développement, conteneur local.** Le disque et la mémoire ne sont
  pas ceux d'un serveur de la collectivité.
- **La marge est telle que la conclusion tient malgré ces réserves.** Un facteur
  cent absorbe une machine deux fois plus lente et une charge dix fois plus
  élevée. C'est la seule raison pour laquelle ces limites n'invalident pas le
  résultat — et elle disparaîtrait si la marge tombait à deux.
