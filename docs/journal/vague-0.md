# Vague 0 — Amorçage — **dossier de revue, clôture non prononcée**

> Ce document est **préparé** pour la revue. La revue et la décision de clore sont humaines. Les rubriques 6 et 7 attendent des réponses qui ne peuvent pas être écrites ici.

Ouverte et instruite le **2026-08-16**. Mode : pair intégral, aucune délégation — c'est le harnais qui rend la délégation possible, il ne pouvait pas être produit par elle.

---

## 1. Couverture

La vague 0 ne porte **aucune** `EX-…` ni `RG-…` : elle ne produit pas de comportement produit. Sa couverture se lit donc en risques levés et en outils démontrés, pas en règles testées.

| Lot | Objet | Sortie | État |
| --- | --- | --- | --- |
| **L-00** | Harnais | `CLAUDE.md`, 4 règles de chemin, 3 hooks, 15 ADR, `socle.css`, `DESIGN.md`, `etats.json`, `dag.md`, 5 sous-agents, 5 skills, gel | à valider |
| **L-01** | Levée des risques | R1, R2, R5 tranchés — ADR-0006, 0013, 0014, 0015 | à valider |

**Risques du socle technique**

| # | Objet | Verdict | Trace |
| --- | --- | --- | --- |
| R1 | TypeScript 7 et l'outillage typé | **Échec** — repli appliqué, TypeScript 6.0.3 | ADR-0014 |
| R2 | Prisma hors ligne | **Concluant sous conditions** — le moteur de schéma reste un binaire, en échec silencieux | ADR-0006 |
| R5 | Densité de la vue Mois | **Levé** — pas de virtualisation ; le risque était mal attribué | ADR-0015 |
| R8 | Dérive du design system | **Outillé** — `stylelint` bloquant, vérifié à l'envers | `stylelint.config.js` |
| R3, R4 | NestJS v12 · Base UI 1.0 | En veille, sans échéance | ADR-0003, 0005 |
| R6, R7 | Chromium en production · `write-excel-file` | Non instruits — relèvent de L-27 et L-24 | — |

---

## 2. Boucles de vérification

Toutes câblées et **vérifiées à l'envers** : on a contrôlé qu'elles refusent ce qu'elles doivent refuser, pas seulement qu'elles passent à vide. Une boucle qui n'a jamais rien refusé n'est pas une boucle.

| Boucle | État | Démonstration |
| --- | --- | --- |
| `pnpm typecheck` | ✅ | 6 espaces de travail, TypeScript 6.0.3 |
| `pnpm lint` | ✅ | ESLint 10.8.1, **règles typées actives** |
| `pnpm stylelint` | ✅ | Refuse une couleur littérale hors `socle.css` — vérifié |
| `pnpm i18n:check` | ✅ | Refuse une clé FR sans pendant EN — vérifié |
| `pnpm test` | ✅ | Aucun test : rien à tester en vague 0 |
| `pnpm test:int` | ✅ | **PostgreSQL 18 réel**, contrainte d'exclusion GiST de `C15` vérifiée |
| `pnpm a11y` | ✅ | 70 contrôles, cliquet posé ; refuse une violation nouvelle — vérifié |
| `pnpm ui:diff` | ✅ | 335 états relevés sur 35 vues |
| `pnpm build` | ✅ | — |
| `pnpm e2e` | ⏳ | Câblée, **non exerçable** : exige l'application (L-05) |
| `pnpm perf` | ⏳ | Câblée, **non exerçable**. `ADR-0015` en change la cible : mesurer la requête, pas la peinture |

**Deux boucles sur onze ne sont pas démontrées.** C'est le principal point à trancher en revue (§ 8).

---

## 3. Conformité visuelle

Aucune vue portée : il n'y a rien à comparer. Ce qui est établi, c'est la **référence** contre laquelle on comparera.

- 35 vues, 150 axes, **335 états** atteignables programmatiquement.
- 35 relevés versionnés dans `design/references/`.
- Écarts attendus documentés (écart 5) pour que la boucle ne produise pas 26 faux positifs au premier portage.

---

## 4. Diff retour

Sept écarts relevés entre le cadrage, les maquettes et la réalité technique. **Deux arbitrés, cinq portés au registre du gel.**

| # | Écart | Décision |
| --- | --- | --- |
| 1 | Polices chargées depuis un service distant | Corrigé au portage — `@fontsource` |
| 2 | Socle graphique recopié 35 fois | Feuille unique ; les copies restent référence de conformité |
| 3 | Vocabulaires divergents du § 4.1 | **Tranché** — 4 priorités, 5 statuts de projet. `cadrage/01` corrigé |
| 4 | Maquettes cumulatives | Carte section → vue → lot établie dans `DESIGN.md § 4` |
| 5 | Divergence de contraste non rétro-propagée | Valeurs conformes retenues ; écart toléré explicitement dans la boucle |
| 6 | Cases à cocher sans nom accessible | Portage corrige — L-21, L-11, L-17 |
| 7 | Ligne de base RGAA : 33 manquements | Cliquet posé ; cible chiffrée pour L-25 |

**Corrections portées dans le cadrage, sur arbitrage humain :**

- `cadrage/01 § 4.1` — vocabulaires (commit `c3aeac1`)
- `cadrage/03 § 3.1`, `§ 3.5`, `§ 4 D6`, `§ 6`, `§ 9` — TypeScript et Prisma (commit `206acf3`)

**Coût mesuré du diff retour** — point ouvert n° 2 du guide : les sept écarts ont été relevés **par les outils eux-mêmes** au cours du montage, pas par une passe dédiée. Coût marginal quasi nul à ce stade. Ce résultat n'est pas généralisable : la vague 0 n'implémente aucun comportement, donc n'ouvre aucun écart de comportement.

---

## 5. Capitalisation

| Destination | Ajouts |
| --- | --- |
| `CLAUDE.md` § pièges | 7 pièges, **tous rencontrés réellement** : propriété des fichiers montés en conteneur, Prisma hors ligne, URL de connexion Prisma 7, TypeScript bloqué en 6.0.3, maquettes cumulatives, 26 maquettes non conformes, réglages déplacés de pnpm 11 |
| ADR | 15, dont 4 consignant une vérification en conditions réelles |
| `DESIGN.md` | Jetons avec contraste, inventaire fermé, carte des sources CSS |
| Règles de chemin | `api.md`, `ui.md`, `modele-de-donnees.md`, `tests.md` |

---

## 6. Auto-audit — **à remplir en revue**

Cinq signaux d'érosion (`cadrage/04 § 10.1`). Deux cochés ou plus : redescendre d'un cran d'autonomie.

- [ ] Je ne relis plus vraiment les diffs de criticité haute.
- [ ] Je ne saurais pas réexpliquer tel module sans le rouvrir.
- [ ] La profondeur de revue a baissé « parce que ça marchait ».
- [ ] `01` et `02` n'ont pas bougé depuis plusieurs vagues alors que le code, si.
- [ ] J'accepte des propositions sans savoir dire pourquoi elles sont justes.

**Mesure honnête** — temps nécessaire pour localiser, **sans agent**, où se ferait une modification donnée. Module tiré au sort : `packages/db`. Question type : *où changerait-on la contrainte de non-chevauchement des congés ?*

Temps constaté : ______

> Cette mesure n'a pas de valeur de référence en vague 0 : le dépôt est petit et ne contient aucun code métier. Elle est prise **maintenant pour établir le point zéro**, et sa dérive en vagues 3 et 4 sera l'indicateur réel.

---

## 7. Instrumentation du pilote

| Point ouvert du guide | Mesure de la vague 0 |
| --- | --- |
| 1. Granularité des contrats de tâche | **Sans objet** — la vague 0 n'a produit aucun contrat. Première mesure en vague 1 |
| 2. Coût du diff retour | Marginal : les écarts sont sortis des outils, pas d'une passe dédiée. Non généralisable (§ 4) |
| 3. Seuils de criticité | Vague entièrement en criticité haute. Aucun incident. Grille non éprouvée |
| 4. Dérive du design system | `stylelint` : 0 violation. Écart 5 attrapé au montage, avant tout portage |
| 5. **Fiabilité de la boucle visuelle** | **234 faux positifs sur 32 vues**, puis 0 après correction. Voir ci-dessous |
| 6. Charge de vérification humaine | À renseigner en revue : ______ |

### Le résultat le plus instructif de la vague

Le contrôle de nom accessible, première version, a signalé **234 éléments sur 32 vues. Tous faux** : il déduisait le nom de `textContent`, `aria-label` et `title`, en ignorant `label[for]` et l'imbrication dans un `<label>`. Le calcul refait selon les sources prévues par la norme est tombé à 23 signalements, tous réels — et confirmés indépendamment par axe-core.

**Ce que cela apprend, et qui dépasse le cas** : un contrôle mécanique mal spécifié ne produit pas du bruit neutre. Il produit de la **fausse confiance dans les deux sens** — ici une alerte massive sur du code sain ; demain, symétriquement, un silence sur du code fautif.

C'est exactement le mode de défaillance que le cycle attribue aux tests écrits par un agent, et il vient de se manifester sur un outil de vérification. Conséquence retenue : **un contrôle mécanique doit être vérifié à l'envers** — on lui soumet ce qu'il doit refuser — avant d'être cru. Les onze boucles l'ont été.

---

## 8. Ce qui reste à trancher pour clore

1. **Deux boucles non démontrées** — `e2e` et `perf` exigent l'application. Le critère de sortie de la vague 0 est la question 3 du gate : *l'agent dispose-t-il des outils pour implémenter, tester et corriger seul ?* Neuf boucles sur onze le démontrent ; les deux manquantes ne servent aucun lot de la vague 1. **Proposition : clore en les inscrivant comme critère de sortie de L-05**, premier lot qui produira une application à exercer.
2. **Question 4 du gate**, pour L-02 et L-03 : *suis-je en mesure d'expliquer, d'évaluer et de valider le résultat ?* Elle n'appartient qu'à vous, et une réponse hésitante déclenche une session de relecture sans production.
3. **Auto-audit** (§ 6) et **charge de vérification** (§ 7).

---

*Dossier préparé le 2026-08-16. Clôture non prononcée.*
