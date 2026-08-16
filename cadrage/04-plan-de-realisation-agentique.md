# Plan de réalisation agentique

**Trame — Plateforme de pilotage des projets et des ressources humaines**
Comment l'application est construite : harnais, découpage, orchestration, vérification

---

## 0. Nature de ce document

Le cahier des charges fonctionnel (`01`) dit **ce que le produit doit faire**. Les briefs de conception (`02`) et les 35 maquettes disent **à quoi il ressemble et comment il se comporte**. Le socle technique (`03`) dit **avec quoi on le construit**. Ce document dit **comment on le construit** : dans quel ordre, sous quelles contraintes de méthode, avec quelles capacités agentiques, et selon quels critères on décide qu'une chose est faite.

Il est subordonné aux trois précédents au même titre que `03` l'est aux deux premiers. Aucune commodité d'exécution ne justifie de dévier d'une exigence `EX-…`, d'une règle `RG-…`, d'une décision portée par une maquette ou d'un choix de pile arrêté en `03`. Quand la méthode d'exécution s'oppose au produit attendu, c'est la méthode qu'on change.

Il applique le **cycle de vie de développement agentique** consigné dans `guide/workflow_agentic.md` (v1, 2026-08-14). Cette note se donne explicitement comme non éprouvée et désigne le présent projet comme son pilote. Le présent document en est donc à la fois l'application et l'instrument de calibrage : la section 12 décrit ce qu'il faut mesurer pour répondre aux six points ouverts de la note.

**Ce qu'il n'est pas.** Ce n'est pas un planning en dates, ni un chiffrage. Il fixe un ordre, des dépendances et des critères de sortie ; le calendrier réel dépend d'arbitrages encore ouverts (§ 13) et de la charge de vérification humaine, qui est le goulot assumé du cycle.

**Comment le lire.** Les sections 1 et 2 posent le cadre de méthode et situent l'existant. Les sections 3 et 4 décrivent l'infrastructure à monter avant la première ligne de code applicatif : le harnais, puis les capacités d'orchestration et leur emploi. Les sections 5 à 8 sont le cœur opératoire : découpage, contrats, exécution, vérification. Les sections 9 à 12 traitent la mémoire, les risques, la traçabilité et l'instrumentation du pilote. Les sections 13 et 14 sont ce qu'il faut trancher et faire pour démarrer.

---

## 1. Ce que le cycle impose

Ces principes sont repris de la note de référence. Ils ne sont pas des préférences d'organisation : chacun élimine des manières de travailler.

| # | Principe | Ce qu'il élimine |
| --- | --- | --- |
| P1 | **La valeur migre aux extrémités** : spécifier en amont, vérifier en aval. Écrire le code n'est plus le goulot | L'idée qu'un gain de vitesse d'écriture est un gain de projet |
| P2 | **Réduction progressive des libertés** : chaque artefact amont ferme l'espace des choix aval | La réponse incantatoire aux dérives d'agent. Une liberté prise est un vide de contrainte, jamais une faute à répéter plus fort |
| P3 | **Séparation divergence / convergence** : l'exploration s'épuise avant l'exécution | L'agent d'exécution qui dessine, arbitre ou invente. Toute décision prise pendant l'exécution est un signal de spec incomplète |
| P4 | **Le repo est la mémoire externe** : specs, ADR et harnais sont la connaissance du système | La documentation comme sous-produit facultatif |
| P5 | **La profondeur de revue est fonction de la criticité, jamais du track record** | La confiance capitalisée entre tâches — mécanisme du *cognitive drift* |
| P6 | **La maîtrise est une variable à défendre**, auditée périodiquement | L'idée qu'on quitte le vibe coding en changeant d'outillage |
| P7 | **Le gate des quatre questions précède tout lancement d'agent** | Le lancement « en surveillant de plus près » |

**Conséquence structurante pour ce projet.** Le régime *assisté* — la génération des maquettes en webapp — est **déjà épuisé** : les 35 vues existent, validées visuellement. Le régime *humain* — l'expression de besoin, les arbitrages — est en grande partie consommé par `01`. Ce qui reste devant nous relève du régime *agentique* sous harnais, avec vérification humaine. C'est précisément la moitié aval du cycle, celle où la note de référence est la plus prescriptive et la moins éprouvée.

---

## 2. Où en est le cadrage — correspondance avec le cycle

### 2.1 Ce que les livrables existants tiennent déjà

La chaîne d'artefacts de la note de référence n'a pas été parcourue sous ses noms propres : elle a été parcourue sous une autre forme, antérieure à la formalisation du cycle. La correspondance est la suivante.

| Artefact du cycle | Équivalent dans ce dépôt | État |
| --- | --- | --- |
| `besoin.md` (humain) | § 1.1 et § 1.2 de `01` | Tenu, sous forme condensée. Non séparé, non daté |
| `ba.md` (alternatives tranchées) | — | **Absent.** L'alternative « ne rien construire » et « utiliser un outil existant » n'est pas documentée comme tranchée |
| `prd.md` (périmètre, non-objectifs, critères de succès) | § 1.3, § 2.1, § 2.2, § 8 de `01` | Tenu. Les non-objectifs existent (§ 2.2) et les partis pris (§ 8) jouent le rôle de barrière anti-libertés |
| `us/US-xxx.md` | — | **Absent sous cette forme.** Les modules `M1…M21` et les vues `01…35` en tiennent lieu comme unités de découpage |
| `ef/EF-xxx.y.md` (vérifiables mécaniquement) | Les 21 tables `EX-…` et les ~150 règles `RG-…` de `01` | Tenu, et mieux qu'attendu : ces identifiants sont stables, atomiques et pour la plupart mécaniquement vérifiables |
| ENF → harnais permanent | § 6 et § 7 de `01`, § 1 de `03` | Énoncées, **pas encore installées dans un harnais** |
| `routes.md` (inventaire des vues et des états) | § C de `02` (35 vues, priorité, densité) + § D (10 points transverses) | Tenu pour les vues. Les états sont dans chaque brief, non consolidés en table |
| `briefs/V-xx.md` | Les 35 briefs de `02` | Tenu, avec préambule commun (§ A) et coquille (§ B) — exactement la parade prescrite contre la dérive stylistique |
| Mockups (assisté) | `mockups/*.html` — 35 fichiers, ~4,8 Mo | Tenu et **validé** |
| Gel dans `/design` | `mockups/` | À **déclarer** : le rapatriement est fait, la déclaration de gel et le verrou d'écriture ne le sont pas (§ 3.4) |
| Diff retour mockup ↔ specs | § 7 de `03` | **Partiel.** Trois écarts relevés, dont un arbitrage fonctionnel non tranché (vocabulaire des priorités) |
| ADR | § 4 de `03` (douze décisions) | Tenu en substance, **pas au format ADR** lisible par l'agent décision par décision |
| `dag.md` (dépendances, vagues) | — | **Absent.** Produit par le § 5 du présent document |
| `taches/T-xxx.md` (contrats + criticité) | — | **Absent.** Gabarit en annexe A, production décrite au § 6 |
| Harnais (`CLAUDE.md`, `DESIGN.md`, boucles de vérification) | — | **Absent.** Objet du § 3 |

### 2.2 Ce qu'il manque, et ce qu'on en fait

Quatre manques sont réels. Trois se comblent, un se constate.

1. **Le harnais n'existe pas.** C'est le manque bloquant : sans lui, chaque session d'agent repart de zéro et comble les vides avec ses priors. Il se monte intégralement en vague 0 (§ 3).
2. **Le DAG et les contrats de tâche n'existent pas.** Ils se produisent — le DAG une fois (§ 5), les contrats par vague (§ 6).
3. **Les ADR ne sont pas au format ADR.** Les douze décisions de `03 § 4` sont converties en douze fichiers `docs/adr/ADR-0001…0012`, chacun portant sa contrainte sous forme prescriptive. La raison n'est pas cosmétique : un ADR est relu par l'agent à chaque session comme une interdiction active, là qu'une section d'un document de 418 lignes ne l'est pas.
4. **La BA n'existe pas et ne sera pas rétro-écrite.** Reconstituer a posteriori un arbitrage qui n'a pas eu lieu produirait une justification, pas une décision. On le constate, on le note en § 12 comme limite du pilote, et on n'invente rien.

### 2.3 La contrainte anti cycle en V

La note de référence interdit de dérouler la chaîne complète avant la première ligne de code, et fixe deux exceptions faites **globalement, une fois** : le harnais, et l'inventaire des routes. Les deux sont ici en position d'être faits globalement — l'inventaire l'est déjà (§ C de `02`), le harnais l'est en vague 0. Tout le reste se déroule **par tranche verticale**, une vague à la fois, avec vérification humaine à chaque fin de vague.

Une troisième chose est faite globalement dans ce projet, et il faut la nommer parce qu'elle s'écarte du modèle : **le modèle de données** (lot L-02, § 5). Le motif est en § 5.3.

---

## 3. Le harnais permanent

> Le harnais est tout ce qui contraint l'agent sans figurer dans la tâche.

C'est le poste d'investissement le plus rentable du cycle et le préalable absolu à toute délégation : la question 3 du gate — *l'agent dispose-t-il des outils pour implémenter, tester et corriger en autonomie ?* — audite le harnais, et une réponse négative interdit le lancement.

### 3.1 Arborescence cible du dépôt

```
/CLAUDE.md                   — contrat permanent de l'agent (< 200 lignes)
/.claude/
  rules/                     — règles à portée de chemin (chargées à la lecture des fichiers visés)
    modele-de-donnees.md     — paths: packages/db/**
    api.md                   — paths: apps/api/**
    ui.md                    — paths: apps/web/src/**/*.tsx
    css.md                   — paths: **/*.css
    i18n.md                  — paths: **/locales/**
    tests.md                 — paths: **/*.test.ts, **/*.spec.ts
  agents/                    — définitions de sous-agents (§ 4.3)
  skills/                    — procédures répétables (§ 4.4)
  workflows/                 — scripts d'orchestration sauvegardés (§ 4.2)
  settings.json              — hooks, permissions, variables d'environnement
/docs/
  adr/                       — ADR-0001…, une décision par fichier
  design/DESIGN.md           — jetons, inventaire fermé de composants, règles de layout
  dag.md                     — table lots · dépendances · vagues (§ 5)
  taches/                    — T-xxx.md, contrats de tâche (§ 6)
  journal/                   — journal de bord du pilote, une entrée par vague (§ 12)
/cadrage/                    — 01, 02, 03, 04 — inchangés, source de vérité fonctionnelle
/mockups/                    — référence gelée, en lecture seule (§ 3.4)
/design/etats.json           — manifeste des états maquettés (§ 3.5)
/apps/, /packages/           — le produit (arborescence détaillée en L-00)
```

### 3.2 `CLAUDE.md` — le contrat permanent

Contenu prescrit, tenu sous 200 lignes pour préserver l'adhérence :

- **Ce qu'est le produit**, en cinq lignes, et où sont les sources de vérité : `cadrage/01` pour le fonctionnel, `cadrage/02` + `mockups/` pour l'interface, `cadrage/03` pour la pile, `docs/dag.md` pour l'ordre.
- **Les commandes** : installer, construire, typer, linter, tester, tester en intégration, tester de bout en bout, contrôler l'accessibilité, mesurer les budgets de performance. Une ligne chacune, exactes, vérifiées.
- **Les interdits structurels**, énoncés comme interdits et non comme recommandations : ne jamais modifier `mockups/` ; ne jamais introduire une couleur littérale hors `socle.css` ; ne jamais écrire de chaîne visible en dur ; ne jamais contrôler un droit côté client seul ; ne jamais ajouter une dépendance sans ADR ; ne jamais modifier le schéma de base hors d'une tâche dédiée ; ne jamais toucher `cadrage/` sans arbitrage humain explicite.
- **Les pièges connus**, enrichis à chaque capitalisation (§ 9). Vide au départ, et c'est normal.
- **La convention de commit** (§ 11).

Ce que `CLAUDE.md` ne contient pas : les règles de gestion. Elles sont dans `01`, référencées par identifiant dans les contrats de tâche. Une `RG-…` recopiée dans le harnais est une seconde vérité.

### 3.3 `DESIGN.md` et le contrat de style

`docs/design/DESIGN.md` transforme la génération d'interface en **assemblage contraint** : l'agent ne dessine plus, il compose. Il est produit par extraction mécanique des maquettes, pas par rédaction :

- **Jetons** — les ~40 variables CSS relevées à l'identique dans les 35 fichiers : surfaces et texte (`--paper`, `--surface`, `--surface-2`, `--line`, `--line-strong`, `--ink`, `--muted`, `--placeholder`), accent (`--accent`, `--accent-strong`, `--accent-soft`, `--on-accent`, `--brand-panel`), statuts de tâche (`--st-todo`, `--st-doing`, `--st-review`, `--st-done`, `--st-blocked`), présence et absences (`--leave`, `--leave-pending`, `--telework`, `--office`, `--event`, `--activity`), contours associés (`--ob-*`), retours d'état (`--danger-soft`, `--success-soft`, `--warn-soft`), trames (`--trame-ferie`, `--trame-vacances`), typographie (`--font-ui`, `--font-display`, `--font-cond`, `--font-mono`), rayon (`--r`).
- **Inventaire fermé des composants** autorisés, avec la correspondance vers React Aria Components. Fermé signifie : tout composant hors liste exige un ADR.
- **Règles de layout** : grille, densité, points de rupture, règles d'impression.
- **La règle d'or** : `mockups/` est la référence ; `DESIGN.md` la décrit, ne la remplace pas. En cas d'écart entre les deux, la maquette gagne et `DESIGN.md` est corrigé.

### 3.4 Le gel de la référence

Les maquettes sont déjà rapatriées et versionnées : le gel consiste à le déclarer et à le verrouiller.

1. `mockups/GEL.md` — date de gel, liste des 35 fichiers avec empreinte, et report intégral des **trois écarts** relevés en `03 § 7` : polices chargées depuis un service distant (à corriger au portage, `C1`), socle graphique recopié 35 fois (référence de conformité, pas source), vocabulaire des priorités divergent (**arbitrage fonctionnel bloquant**, § 13).
2. **Verrou d'écriture** : un hook `PreToolUse` sur `Edit|Write` refuse toute écriture dont le chemin est sous `mockups/`, avec un message explicite renvoyant vers la procédure de dégel. Le verrou n'est pas une précaution de style : sans lui, un agent en difficulté sur une conformité visuelle a une issue — modifier la référence — et le cycle perd son point fixe.
3. **Procédure de dégel** : une modification de maquette est une décision humaine, tracée dans `GEL.md`, suivie d'un diff retour vers `01` et `02` (§ 8.4).

**Correspondance de vocabulaire.** La note de référence appelle `/design` le dossier des mockups gelés. Ici il s'appelle `mockups/`, parce que `03` le désigne ainsi et qu'un renommage introduirait une divergence avec trois documents validés. `design/` est réservé aux artefacts dérivés (§ 3.5).

### 3.5 Le manifeste des états — `design/etats.json`

C'est la pièce que le cycle ne prévoyait pas et que ce projet permet.

Les 35 maquettes portent chacune un **panneau de revue** hors produit, qui pilote les états par appel de fonction : `setState('loading')`, `setData('empty')`, `setRole('c')`, `setDays(7)`, `setTT(false)`, `setLang('en')`, `toggleTheme()`, `setMode('replace')`, `setVol(12)`… Les noms sont propres à chaque vue. Cela signifie que **chaque état spécifié est atteignable programmatiquement dans la référence**, ce qui est la condition pour que la comparaison de rendu devienne un critère d'acceptation mécanique et non une intention.

En vague 0, un balayage produit `design/etats.json` : pour chacune des 35 vues, la liste des états maquettés avec le pilote qui les atteint, le libellé attendu et la ou les `EX-…`/`RG-…` concernées. Exemple de forme :

```json
{
  "07": {
    "fichier": "mockups/07-planning-semaine.html",
    "etats": [
      { "id": "nominal",  "pilote": "setState('normal')",  "attendu": "grille peuplée, ligne de synthèse visible" },
      { "id": "chargement","pilote": "setState('loading')", "attendu": "« Chargement du planning… », squelette de grille" },
      { "id": "vide",     "pilote": "setState('none')",    "attendu": "« Aucune ressource à afficher » + mention des filtres" },
      { "id": "perime",   "pilote": "setState('stale')",   "attendu": "avertissement RG-PLN-05" }
    ],
    "axes": [
      { "id": "jours",   "pilotes": ["setDays(5)", "setDays(7)"] },
      { "id": "droits",  "pilotes": ["setTT(true)", "setTT(false)", "setAct(true)", "setAct(false)"] },
      { "id": "theme",   "pilotes": ["toggleTheme()"] },
      { "id": "langue",  "pilotes": ["setLang('fr')", "setLang('en')"] }
    ]
  }
}
```

Ce fichier devient l'entrée de la boucle visuelle (§ 7.4), la liste de contrôle du portage d'une vue, et la matrice de couverture des ~40 états vides recensés en `02 § D.2`. Il est produit une fois, corrigé à la main, puis figé au même titre que les maquettes.

### 3.6 Les boucles de vérification rapides

> La qualité de la délégation est proportionnelle à la vitesse de ces boucles.

Elles sont installées en vague 0, avant tout code applicatif, et sont exécutables par l'agent seul, sans attendre l'humain :

| Commande | Ce qu'elle garantit | Budget |
| --- | --- | --- |
| `pnpm typecheck` | Typage de bout en bout (TS 7, repli 6.x — R1 de `03`) | < 20 s |
| `pnpm lint` | Règles de code (ESLint + oxlint en pré-passe) | < 15 s |
| `pnpm stylelint` | **Aucune couleur littérale hors `socle.css`** — garde-fou du design system (R8 de `03`) | < 5 s |
| `pnpm i18n:check` | Aucune clé manquante, aucune clé orpheline, aucune chaîne en dur (`RG-GEN-08`) | < 5 s |
| `pnpm test` | Unitaires (Vitest) | < 60 s |
| `pnpm test:int` | Intégration sur PostgreSQL réel (Testcontainers) | < 5 min |
| `pnpm e2e` | Bout en bout (Playwright) | variable |
| `pnpm a11y` | `@axe-core/playwright` sur chaque vue, deux thèmes | variable |
| `pnpm ui:diff <vue>` | Comparaison de rendu implémentation ↔ maquette, état par état (§ 7.4) | variable |
| `pnpm perf` | Budgets `< 2 s` planning / `< 1 s` tableau de bord sur jeu de données à la volumétrie cible, **seuil bloquant** | variable |

Une boucle qui n'existe pas est une boucle que l'humain devra faire. Une boucle lente est une boucle que l'agent contournera.

---

## 4. L'outillage agentique : quelle capacité pour quel usage

Le cycle prescrit deux modes d'exécution — **pair** et **délégation** — et fait dépendre le choix de la criticité inscrite au contrat. Cette section établit la correspondance entre ces deux modes et les capacités réellement disponibles, ainsi que les réserves d'emploi de chacune.

### 4.1 Table d'emploi

| Capacité | Ce qu'elle apporte | Emploi dans ce projet | Réserve |
| --- | --- | --- | --- |
| **Mode plan** | Exploration en lecture seule, plan soumis à validation avant écriture | **Obligatoire** sur toute tâche de criticité haute. C'est la matérialisation des questions 1 et 2 du gate | Un plan validé n'est pas un contrat de tâche : il ne le remplace pas |
| **Sous-agents** (`.claude/agents/*.md`) | Contexte isolé, jeu d'outils restreint, modèle et effort choisis, `isolation: worktree` | Le véhicule normal de la **délégation** : un lot de criticité moyenne ou basse par sous-agent | Un sous-agent ne rapporte qu'un résultat : ce qu'il n'écrit pas dans le dépôt est perdu |
| **Worktrees** (`isolation: worktree`) | Copie git isolée par agent ; l'isolation bloque aussi les commandes shell qui viseraient la copie principale | **Indispensable** en vague 3, où plusieurs lots s'exécutent en parallèle | Coût d'installation par agent ; exige un dépôt git (§ 13.2) |
| **Workflows dynamiques** (`/workflows`) | Un script JavaScript tient le plan : boucles, fan-out, vérification adverse ; résultats intermédiaires hors contexte ; rejouable et relisible | Les balayages mécaniques et répétitifs : extraction des jetons, production de `design/etats.json`, audit des 125 permissions, contrôle i18n sur 35 vues, revue croisée de fin de vague | **Aucune entrée utilisateur en cours d'exécution.** Un besoin d'arbitrage en milieu de course impose de découper en plusieurs workflows |
| **`/batch`** | Décompose un changement en 5 à 30 unités indépendantes, chacune dans son worktree, chacune ouvrant une PR | Les sweeps transverses tardifs : passage i18n, mise en conformité d'accessibilité, migration de version | Génère autant de revues qu'il génère de PR : à réserver au mécanique vérifiable |
| **Équipes d'agents** (expérimental, `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS`) | Coéquipiers en sessions séparées, liste de tâches partagée, messagerie directe | **Usage restreint et justifié** : investigation à hypothèses concurrentes (R5, densité de la vue Mois), revue croisée à plusieurs angles | Expérimental ; **pas d'isolation en worktree** — donc jamais pour de l'implémentation parallèle sur des fichiers partagés ; coût en jetons élevé ; reprise de session non garantie |
| **Sessions d'arrière-plan** (`/background`, `claude agents`) | Travaux longs détachés, chacun dans son worktree, avec vue d'ensemble | Les tâches de longue haleine sans interaction : jeu de données volumétrique, campagne de mesure de performance | Ce qui tourne sans surveillance longtemps produit du travail à jeter en cas de mauvaise direction |
| **`/goal`** | Condition d'arrêt évaluée après chaque tour par un modèle rapide | « Boucler jusqu'au vert » sur un critère mécanique : `pnpm typecheck` et `pnpm test` passent | L'évaluateur ne lit que la conversation : la condition doit être démontrable par ce que l'agent affiche. Ne remplace jamais la vérification humaine |
| **Hooks** (`.claude/settings.json`) | Contrôle déterministe aux points de cycle de vie, indépendant du jugement du modèle | Les garde-fous mécaniques du § 4.5 | Un hook `PostToolUse` ne peut rien annuler : l'action a eu lieu |
| **Skills** (`.claude/skills/*/SKILL.md`) | Procédures répétables chargées à la demande, invocables par `/nom` | Les procédures du § 4.4 : ouvrir un lot, porter une vue, vérifier une vue, clore une vague | Une skill est une instruction, pas une garantie : ce qui doit être garanti passe par un hook |
| **Règles à portée de chemin** (`.claude/rules/*.md`) | Contraintes chargées seulement quand l'agent touche les fichiers visés | Les ENF par domaine, sans peser sur le contexte des autres tâches | Rechargées à la lecture d'un fichier correspondant, pas à chaque tour |
| **Points de restauration** (`/rewind`) | Retour arrière code et conversation | Filet sur les tâches exploratoires | Ne remplace pas les commits atomiques fréquents, qui restent la mécanique commune |
| **Revue outillée** (`/code-review`, `/security-review`) | Passe de revue à profondeur réglable ; contrôle de sécurité du diff | Systématique en fin de lot ; `/security-review` obligatoire sur les lots de criticité haute | Une revue outillée n'est pas la vérification humaine : elle la précède |
| **Routines / tâches planifiées** | Exécution récurrente hors session | Contrôles nocturnes : budgets de performance, accessibilité, clés i18n, dérive de dépendances | Périmètre à surveiller : un contrôle nocturne qui échoue sans lecteur est du bruit |
| **Mémoire automatique** | Notes accumulées par l'agent, par dépôt | Commodité de session | **Machine-locale, non versionnée, non partagée.** Elle ne remplace en aucun cas `CLAUDE.md`, les ADR et `DESIGN.md`, qui restent la mémoire de plein exercice (P4) |
| **MCP** | Connexion à des outils externes | **Aucun besoin identifié.** Le produit est en réseau fermé et le dépôt est intégralement lisible en texte brut | Toute connexion sortante ajoutée doit être justifiée par un ADR et confrontée à `C1`/`C2` |

### 4.2 Correspondance criticité → mode → capacité

C'est la règle d'affectation. Elle est inscrite au contrat de tâche et **ne se renégocie pas en cours d'exécution**.

| Criticité | Mode (cycle) | Capacités autorisées | Interdits |
| --- | --- | --- | --- |
| **Haute** | Pair | Mode plan obligatoire ; exécution dans la session principale, en présence ; sous-agents en **lecture seule** pour l'exploration ; `/security-review` en sortie | Aucun sous-agent en écriture. Aucun workflow d'implémentation. Aucune session d'arrière-plan |
| **Moyenne** | Délégation supervisée | Un sous-agent en worktree, plan proposé et validé avant écriture, points de contrôle intermédiaires inscrits au contrat | Pas de parallélisme interne au lot |
| **Basse** | Délégation large | Sous-agents en parallèle, workflow, `/batch` ; revue par échantillon adossée aux boucles vertes | — |

### 4.3 Sous-agents à définir

Cinq définitions suffisent, et il faut s'y tenir : un catalogue de sous-agents qui enfle devient un second système de rôles à maintenir.

| Nom | Rôle | Outils | Note |
| --- | --- | --- | --- |
| `porteur-de-vue` | Porte une vue maquettée en composants React conformes au contrat de style | Lecture, écriture, shell, navigateur | `isolation: worktree`. Reçoit `design/etats.json` et le brief de la vue |
| `porteur-de-module` | Implémente un module serveur : schémas, points d'entrée, règles de gestion, tests | Lecture, écriture, shell | `isolation: worktree`. Reçoit les `EX-…`/`RG-…` du module |
| `verificateur` | Vérifie une tâche contre son contrat, sans droit d'écriture sur le produit | Lecture, shell | **Lecture seule sur le code.** Rend un verdict motivé, ne corrige pas |
| `explorateur-de-specs` | Répond à une question de conformité en citant `01`, `02` et les maquettes | Lecture, recherche | Ne propose pas d'interprétation : cite, ou déclare le point non spécifié |
| `redacteur-de-contrats` | Produit les contrats de tâche d'une vague à partir du DAG, de `01` et de `02` | Lecture, écriture limitée à `docs/taches/` | Produit un brouillon ; la criticité et le gate restent humains |

Le `verificateur` est privé du droit d'écriture par construction, et non par consigne. La note de référence prévient qu'un agent sait écrire des tests qui valident son propre bug ; séparer mécaniquement celui qui produit de celui qui juge est la seule parade structurelle.

### 4.4 Skills à écrire

| Skill | Ce qu'elle fait |
| --- | --- |
| `/ouvrir-un-lot <L-xx>` | Relit le DAG, vérifie que les dépendances sont livrées, produit les contrats de tâche du lot, présente le gate à remplir |
| `/porter-une-vue <NN>` | Procédure complète de portage d'une vue : brief, maquette, états attendus, contrat de style, boucle visuelle, liste de contrôle de sortie |
| `/verifier-une-vue <NN>` | Lance la boucle visuelle et le contrôle d'accessibilité sur tous les états déclarés dans `design/etats.json`, rend un tableau de conformité |
| `/clore-une-vague <n>` | Assemble le dossier de revue de vague : diffs, couverture des `EX-…`/`RG-…`, résultats des boucles, écarts, propositions de capitalisation |
| `/diff-retour <NN>` | Compare une vue implémentée à `01` et `02`, propose les mises à jour de specs correspondantes (§ 8.4) |

### 4.5 Hooks à installer

Les hooks sont la seule couche qui s'applique quoi que décide le modèle. Ils portent donc ce qui ne doit jamais dépendre d'un jugement.

| Événement | Garde-fou |
| --- | --- |
| `PreToolUse` sur `Edit\|Write` | Refuser toute écriture sous `mockups/`. Refuser toute écriture sous `cadrage/` (le cadrage se modifie par décision humaine, pas par effet de bord) |
| `PreToolUse` sur `Edit\|Write` | Refuser une écriture dans `packages/db/schema.prisma` si la tâche courante n'est pas une tâche de schéma (§ 5.3) |
| `PostToolUse` sur `Edit\|Write` | Formater, puis exécuter `stylelint` sur les fichiers CSS touchés et `i18n:check` si un fichier de vue est touché |
| `Stop` (hook de type *prompt*) | Demander au modèle si tous les critères d'acceptation du contrat de tâche courant sont **démontrés** — pas seulement traités. Un `ok: false` renvoie l'agent au travail avec le motif |
| `SubagentStop` | Consigner dans `docs/journal/` le lot, la tâche, la durée et le verdict du sous-agent (instrumentation, § 12) |
| `SessionStart` | Rappeler la vague en cours et le lot ouvert, lus depuis `docs/dag.md` |

---

## 5. Le découpage : lots, DAG, vagues

### 5.1 Principe de découpe

L'unité de déroulement est le **lot** (`L-xx`) : une tranche verticale livrant un comportement complet de bout en bout — modèle, règles, points d'entrée, vue, états, tests. Un lot regroupe un ou plusieurs modules `M…` de `01` et une ou plusieurs vues de `02`. Un lot se décompose en **tâches** (`T-xxx`), qui sont les paquets remis aux agents (§ 6).

Trois règles de découpe :

1. **Un lot se vérifie**. S'il n'existe pas de démonstration mécanique qu'un lot est livré, il est mal découpé.
2. **Un lot est étanche dans sa vague**. Deux lots de la même vague ne modifient jamais les mêmes fichiers. C'est ce qui rend la parallélisation lisible plutôt que pariée.
3. **Les exigences transverses sont dans la définition de terminé de chaque lot**, pas reportées en fin de projet : accessibilité, bilingue, deux thèmes, états vides, droits, impression le cas échéant. La vague 6 est un **audit** de ces exigences, jamais leur première prise en compte.

### 5.2 Table des lots

| Lot | Contenu | Modules | Vues | Criticité | Dépend de | Vague |
| --- | --- | --- | --- | --- | --- | --- |
| **L-00** | Harnais, arborescence, espaces de travail, boucles de vérification, ADR, `DESIGN.md`, `etats.json`, gel | — | — | Haute | — | 0 |
| **L-01** | Levée des risques R1, R2, R5 : projet témoin TS 7 ; Prisma hors ligne ; **prototype jetable de la vue 08** à la volumétrie cible | — | 08 (jetable) | Haute | L-00 | 0 |
| **L-02** | Modèle de données complet, migrations, contraintes d'exclusion et unicités, colonne `version`, rôle SQL du journal d'audit, partitionnement | tous | — | **Haute** | L-01 | 1 |
| **L-03** | `packages/contracts` : schémas Zod, catalogue des 125 permissions, 26 modèles de rôles, vocabulaires § 4.1 | tous | — | **Haute** | L-00 | 1 |
| **L-04** | Authentification, session, mot de passe, verrouillage, réinitialisation | M1 | 01–05 | **Haute** | L-02, L-03 | 1 |
| **L-05** | Coquille applicative, navigation par droits, i18n, thème, profil | — | § B, 35 | Moyenne | L-03, L-04 | 1 |
| **L-06** | Structure organisationnelle **et constructeur de prédicats de périmètre** | M2 | 29 | **Haute** | L-02, L-03 | 2 |
| **L-07** | Utilisateurs, annuaire, suivi individuel, cycle de vie, contrôle de dépendances | M3 | 27, 28 | **Haute** | L-06 | 2 |
| **L-08** | Rôles, matrice de permissions, journal d'audit inaltérable | M20 | 32, 33 | **Haute** | L-06 | 2 |
| **L-09** | Paramétrage : affichage, planning, jours fériés, vacances scolaires | M19 | 31 | Moyenne | L-05 | 2 |
| **L-10** | Projets, jalons, épopées, équipe, feuille de route | M4, M5 | 10, 11, 13, 14 | Moyenne | L-07 | 3 |
| **L-11** | Tâches, sous-tâches, dépendances, RACI, kanban, cascade de dates | M6 | 12, 16, 17 | **Haute** | L-10 | 3 |
| **L-12** | Tiers et clients | M14 | 23–26 | Basse | L-07 | 3 |
| **L-13** | Compétences : référentiel, matrice, écarts | M13 | 22 | Basse | L-07 | 3 |
| **L-14** | Événements et récurrences | M9 | 18 | Moyenne | L-07, L-09 | 3 |
| **L-15** | Congés : cycle de vie, validation, délégations, soldes, référentiel de types | M10 | 19 | **Haute** | L-07, L-09 | 3 |
| **L-16** | Télétravail : déclaration, règles récurrentes, vue équipe | M11 | 20 | Moyenne | L-07 | 3 |
| **L-17** | Activité récurrente : catalogue, assignations, récurrences | M8 | 34 | Moyenne | L-07, L-09 | 3 |
| **L-18** | Temps passé : saisie, plafond, rapports, saisie pour tiers | M12 | 21 | Moyenne | L-10, L-11 | 3 |
| **L-19** | Documents et commentaires, avec traçage des accès | M15 | — | Moyenne | L-10, L-11 | 3 |
| **L-20** | **Planning unifié** : point d'entrée agrégé, vues Semaine, Mois, Activité, glisser-déposer et son alternative clavier, légende filtrante, ICS | M7 | 07, 08, 09 | **Haute** | L-11, L-14, L-15, L-16, L-17 | 4 |
| **L-21** | Tableau de bord | M16 | 06 | Moyenne | L-11, L-18, L-20 | 5 |
| **L-22** | Rapports, analytics, Gantt de projet et de portefeuille, instantanés | M17 | 15, 30 | Moyenne | L-10, L-11, L-18 | 5 |
| **L-23** | Notifications, courriel, traitements planifiés à instance unique | M18 | — | **Haute** | L-15, L-11 | 5 |
| **L-24** | Imports et exports : six formats CSV, ICS, Excel, PDF, prévisualisation et compte rendu | M21 | — | **Haute** | L-07, L-10, L-11, L-15, L-13 | 5 |
| **L-25** | Audit d'accessibilité RGAA sur les 35 vues, deux thèmes, clavier complet | — | toutes | **Haute** | vagues 1–5 | 6 |
| **L-26** | Audit de performance : budgets tenus à la volumétrie cible, seuils bloquants | — | 06, 07, 08, 22, 30, 32 | **Haute** | vagues 1–5 | 6 |
| **L-27** | Impression et export PDF : planning, grille d'activité, rapports | — | 07, 09, 30 | Moyenne | L-20, L-22 | 6 |
| **L-28** | Bilingue complet, formats de date et d'heure, contrôle d'exhaustivité | — | toutes | Moyenne | vagues 1–5 | 6 |
| **L-29** | Déploiement, sauvegarde, restauration éprouvée, réversibilité, exports complets | — | — | **Haute** | tout | 6 |

### 5.3 Vagues et parallélisation

| Vague | Lots | Parallélisme | Régime dominant |
| --- | --- | --- | --- |
| **0 — Amorçage** | L-00, L-01 | Aucun. Séquentiel, en pair | Humain + pair |
| **1 — Socle transverse** | L-02, L-03 puis L-04, L-05 | L-02 ∥ L-03, puis L-04 → L-05 | Pair |
| **2 — Gouvernance** | L-06, L-07, L-08, L-09 | L-06 puis L-07 ∥ L-08 ∥ L-09 | Pair (L-06, L-07, L-08), délégation (L-09) |
| **3 — Objets métier** | L-10 → L-11 ; L-12, L-13, L-14, L-15, L-16, L-17 ; puis L-18, L-19 | **Fort.** Jusqu'à quatre lots simultanés en worktrees | Délégation supervisée, sauf L-11 et L-15 en pair |
| **4 — Vue centrale** | L-20 | Aucun | Pair |
| **5 — Exploitation** | L-21, L-22, L-23, L-24 | L-21 ∥ L-22 ∥ L-24, L-23 en pair | Mixte |
| **6 — Durcissement** | L-25, L-26, L-27, L-28, L-29 | L-25 ∥ L-28 (balayages), L-26, L-27, L-29 séquentiels | Mixte |

**Trois points de méthode à assumer.**

1. **Le modèle de données est produit globalement, en L-02.** C'est un écart au découpage vertical strict, et il est délibéré : quarante tables environ, les règles de non-chevauchement et d'unicité que `C15` impose de doubler en base, un journal d'audit dont les droits SQL sont particuliers. Faire émerger ce schéma lot par lot dans des worktrees parallèles produirait des migrations concurrentes et un modèle de compromis. **Contrepartie inscrite dans le harnais** : toute évolution ultérieure du schéma passe par une tâche de schéma dédiée, jamais dans une tâche de fonctionnalité — garanti par un hook (§ 4.5), pas par une consigne.
2. **La vue 08 est prototypée en vague 0, et le prototype est jeté.** `03 § R5` l'impose : c'est le point dur du produit (22 colonnes × N lignes, densité, virtualisation, colonne et en-tête figés). Le prototyper avant tout le reste transforme un risque d'architecture en information. Le jeter évite qu'un brouillon de levée de risque devienne le socle de la vue centrale.
3. **Le planning arrive tard alors que c'est la fonction centrale.** C'est une conséquence de ses dépendances : il agrège tâches, congés, télétravail, événements, permanences et fériés. On ne le contourne pas, on le compense — par le prototype jetable de la vague 0, qui lève le risque de conception cinq vagues avant que le lot ne s'ouvre.

---

## 6. Criticité, contrat de tâche et gate

### 6.1 Grille de criticité pour ce projet

La note de référence pose « haute par défaut » pour tout ce qui touche à l'intégrité et à la sécurité. Pour ce produit, la liste est la suivante — elle est fermée, et toute addition se fait par ADR :

**Criticité haute, sans discussion**
Authentification, session, mot de passe · Catalogue de permissions et garde de permission · Constructeur de prédicats de périmètre organisationnel · Journal d'audit et ses droits SQL · Modèle de données et toute migration · Contrôle de solde et concurrence sur les congés (`RG-CNG-20` à `RG-CNG-23`) · Contrôle de concurrence optimiste (`RG-GEN-07`) · Suppression définitive et contrôle de dépendances · Import en mode Remplacer (`RG-PRJ-11`, `RG-IMP-06`) · Point d'entrée agrégé du planning et son budget de performance · Traitements planifiés et verrou d'instance unique · Déploiement, sauvegarde, restauration.

**Criticité moyenne**
Tout comportement métier régi par des `RG-…` sans enjeu d'intégrité ni de cloisonnement · Toute vue de densité forte ou très forte.

**Criticité basse**
Référentiels simples, vues de consultation de densité faible, exports en lecture seule.

**Règle de non-transfert.** La confiance acquise sur un type de tâche ne s'étend pas à un autre type. Un lot de criticité basse réussi ne rend pas le suivant plus sûr, et une série de succès en vague 3 ne modifie en rien la profondeur de revue en vague 4.

### 6.2 Le contrat de tâche

C'est le paquet autosuffisant remis à l'agent. Gabarit en **annexe A**. Il porte, sans exception :

- les `EX-…` et `RG-…` couvertes, citées par identifiant — jamais recopiées en paraphrase ;
- la ou les vues de référence, avec le chemin exact de la maquette et les états attendus lus dans `design/etats.json` ;
- les **critères d'acceptation exécutables** : une commande, un résultat attendu ;
- la criticité, et le mode d'exécution qui en découle mécaniquement ;
- les pointeurs vers le harnais : sections de `CLAUDE.md`, règles de chemin concernées, ADR applicables ;
- les points de contrôle intermédiaires, si le mode est la délégation ;
- ce qui est **hors périmètre de la tâche** — la contrainte qui empêche le bonus non demandé.

### 6.3 Le gate

Avant tout lancement d'agent, quatre questions, quatre réponses positives requises :

```
- [ ] 1. L'objectif est explicite et sans ambiguïté
- [ ] 2. Les contraintes et les critères d'acceptation sont formalisés et exécutables
- [ ] 3. L'agent dispose des outils pour implémenter, tester et corriger seul
- [ ] 4. Je suis en mesure d'expliquer, d'évaluer et de valider le résultat
```

Une case vide renvoie en amont : à la spec pour 1, au contrat pour 2, au harnais pour 3, à une session de relecture sans production pour 4. **Elle ne se contourne pas par une surveillance renforcée.** Le passage du gate est daté et consigné dans le contrat.

---

## 7. La boucle d'exécution

### 7.1 Ouverture de vague

1. Vérifier que la vague précédente est **close** : tous ses lots vérifiés, sa capitalisation intégrée, son entrée de journal écrite.
2. Vérifier que les arbitrages dont dépend la vague sont rendus (§ 13).
3. Produire les contrats de tâche de la vague (`/ouvrir-un-lot`), les relire, fixer les criticités.
4. Passer le gate lot par lot.

### 7.2 Ouverture de lot

1. Branche dédiée, nommée `lot/L-xx-<intitulé>`.
2. Selon la criticité : session en pair, ou sous-agent en worktree isolé.
3. Sur criticité haute : mode plan d'abord, plan validé avant toute écriture.
4. Commits atomiques fréquents, portant la trace (§ 11) — ce sont les points de restauration réels.

### 7.3 Boucle de tâche

```
contrat → plan (si haute) → implémentation → boucles rapides vertes
        → boucle visuelle verte (si la tâche porte une vue)
        → revue outillée → vérification humaine → intégration
```

Une boucle rouge se corrige par l'agent, seul, sans remonter. Une **question** remonte immédiatement : toute décision que l'agent serait tenté de prendre est un signal de spec incomplète (P3), et la réponse n'est pas de choisir mais de compléter la spec, avec trace.

### 7.4 La boucle visuelle — le critère d'acceptation d'interface

C'est le mécanisme qui donne à l'interface un critère mécanique, et c'est aussi le point où la note de référence est la plus incertaine (son point ouvert n° 5 : tolérances, faux positifs). La réponse retenue est **à deux étages**, parce qu'un seuil de comparaison au pixel entre une maquette autonome et une application réelle produirait un flot de faux positifs — polices, lissage, données d'exemple, largeurs de scrollbar.

**Étage 1 — conformité structurelle, mécanique et bloquante.** Pour chaque état déclaré dans `design/etats.json`, l'agent pilote la maquette et l'implémentation dans le même état, et compare ce qui est comparable sans ambiguïté :

- présence des textes attendus, à la lettre — les libellés d'états vides et les messages d'erreur de `01` et `02` sont contractuels ;
- présence des repères d'accessibilité : rôles, libellés d'assistance, ordre de tabulation, piège de focus dans les fenêtres, retour au déclencheur à la fermeture ;
- **aucune couleur hors jetons** dans les styles calculés ;
- aucun débordement horizontal ; colonnes et en-têtes figés effectivement figés ;
- `@axe-core/playwright` sans violation, dans les deux thèmes ;
- rendu d'impression produit pour les vues 07, 09 et 30.

**Étage 2 — conformité visuelle, jugée puis validée.** Captures côte à côte maquette / implémentation, état par état ; un agent rend un verdict motivé sur les écarts de hiérarchie visuelle, de densité et d'espacement ; l'humain tranche à la revue de vague. Le verdict de l'agent n'est pas bloquant : il oriente le regard humain.

**Étage 3 — non-régression, au pixel.** Une fois une vue validée, sa propre capture devient sa référence de non-régression. La comparaison stricte s'applique alors implémentation ↔ implémentation, où elle a un sens, et non implémentation ↔ maquette, où elle n'en a pas.

Le taux de faux positifs de l'étage 1 et le taux d'écarts réels rattrapés à l'étage 2 sont mesurés (§ 12) : c'est la réponse attendue du pilote au point ouvert n° 5.

### 7.5 Clôture de lot

Un lot est clos quand, et seulement quand :

- toutes les `EX-…` et `RG-…` de son contrat sont couvertes par un test nommé qui les cite ;
- toutes les boucles rapides sont vertes ;
- tous les états de `design/etats.json` pour ses vues sont vérifiés aux étages 1 et 2 ;
- la revue outillée est passée, et `/security-review` en plus si la criticité est haute ;
- la vérification humaine (§ 8) est faite, à la profondeur prescrite ;
- le diff retour est instruit (§ 8.4) ;
- les apprentissages sont remontés dans le harnais (§ 9).

---

## 8. La vérification

> Le nouveau goulot du cycle, assumé comme tel.

### 8.1 Ordre de revue, strict

1. **La conformité à la spec.** Les `EX-…` et `RG-…` du contrat sont-elles satisfaites, telles qu'écrites ? C'est la seule question de cette étape ; le code n'y est pas encore ouvert.
2. **L'honnêteté des tests.** Les tests se lisent comme du code suspect, pas comme des preuves. Trois questions à chacun : que se passe-t-il si j'inverse l'assertion ? le cas nominal est-il le seul testé ? le test consacre-t-il le comportement observé plutôt que le comportement spécifié ?
3. **Le diff.** En dernier, et seulement en dernier.

### 8.2 Profondeur par criticité

| Criticité | Profondeur |
| --- | --- |
| **Haute** | Diff intégral relu ligne à ligne. Tests relus un par un. Règles de gestion rejouées à la main sur l'application. `/security-review`. Aucune exception, quel que soit l'historique récent |
| **Moyenne** | Diff relu intégralement mais sans rejeu manuel systématique. Tests relus par sondage orienté sur les cas limites |
| **Basse** | Revue par échantillon adossée aux boucles vertes et à la revue outillée |

### 8.3 Charge et rythme

La vérification humaine est le facteur limitant du cycle, pas la production. Deux conséquences pratiques :

- **On ne lance pas plus de travail agentique qu'on ne peut en vérifier.** Quatre lots en parallèle en vague 3 est un maximum lié à cette capacité, pas à celle de l'outil.
- **Une vague ne se clôt pas sur un accord de principe.** Elle se clôt sur une revue faite, datée, avec son entrée de journal. Une vague close par lassitude est une dette de compréhension contractée sans être nommée.

### 8.4 Le diff retour

L'implémentation fait émerger ce que la spec n'avait pas prévu — un champ manquant, un état non couvert, une règle ambiguë en pratique. Si ces découvertes restent dans le code, `01` et `02` pourrissent pendant que le code devient la vérité de fait.

**Après chaque lot** : `/diff-retour` compare la vue et le module implémentés à `01` et `02`, et propose les mises à jour de spec. Arbitrage humain, systématique. Toute modification de `cadrage/` est une décision humaine explicite, tracée, jamais un effet de bord d'une session (garanti par hook, § 4.5).

Le coût réel de cette étape — soutenable à chaque lot, ou à regrouper par vague — est le point ouvert n° 2 de la note de référence. Le pilote démarre en mode « à chaque lot » et mesure (§ 12).

---

## 9. Capitalisation et mémoire

Chaque session produit trois natures d'apprentissage, qui ont trois destinations distinctes :

| Nature | Destination | Exemple |
| --- | --- | --- |
| Erreur récurrente de l'agent, piège d'environnement, convention implicite | `CLAUDE.md` § pièges, ou une règle de chemin | « Les jetons `--ob-*` sont des contours, pas des fonds : ne pas les substituer » |
| Décision d'architecture, interdiction, choix tranché | Un ADR | « Aucune bibliothèque de graphiques — ADR-0012 » |
| Motif d'interface, variante de composant, règle de densité | `DESIGN.md` | « La cellule scindée matin/après-midi conserve la hauteur de ligne » |

**La boucle est fermée quand les échecs de l'agent améliorent la documentation du dépôt.** Un même piège rencontré deux fois sans avoir été consigné est un défaut de capitalisation, pas un défaut d'agent.

**Sur la mémoire automatique.** Elle est utile en séance et ne fait pas partie de la mémoire de plein exercice : elle est locale à la machine, non versionnée, non partagée, et invisible aux sous-agents. Ce qui doit survivre à la machine va dans le dépôt. La règle est simple et sans exception : **si ce n'est pas commité, ce n'est pas capitalisé.**

**Question de clôture de session**, à poser sans complaisance : *est-ce que je comprends encore ce système ?* Une réponse hésitante déclenche une session de relecture sans production. C'est un travail du projet, pas une pause dans le projet.

---

## 10. Gouvernance des risques

### 10.1 Auto-audit — signaux d'érosion

À vérifier en fin de chaque vague. **Deux signaux ou plus : redescendre d'un cran d'autonomie** — repasser en pair sur les lots en cours — le temps de reconstruire la maîtrise.

- Je ne relis plus vraiment les diffs de criticité haute.
- Je ne saurais pas réexpliquer tel module sans le rouvrir.
- La profondeur de revue a baissé « parce que ça marchait ».
- `01` et `02` n'ont pas bougé depuis plusieurs vagues alors que le code, si.
- J'accepte des propositions d'agent sans savoir dire pourquoi elles sont justes.

**Indicateur honnête de la dette de compréhension** : le temps qu'il me faut pour localiser où se ferait une modification donnée, sans agent. À mesurer une fois par vague sur un module tiré au sort.

### 10.2 Risques propres à l'exécution agentique

| # | Risque | Parade |
| --- | --- | --- |
| A1 | **L'agent invente de l'interface** là où la maquette est muette | Le brief et `design/etats.json` bornent ; ce qui manque remonte en question, jamais en invention. Un état non prévu est un manque de spec à combler avant de coder |
| A2 | **Des tests qui valident le bug** | Séparation mécanique production / vérification (`verificateur` en lecture seule) et lecture des tests comme code suspect (§ 8.1) |
| A3 | **Dérive silencieuse des specs** | Diff retour systématique (§ 8.4) et interdiction d'écriture sur `cadrage/` par hook |
| A4 | **Conflits entre agents parallèles** | Isolation en worktree, étanchéité des lots dans une vague (§ 5.1), schéma de base hors des tâches de fonctionnalité |
| A5 | **Dérive du design system** | `stylelint` bloquant sur les couleurs littérales, contrat de style fermé, boucle visuelle étage 1 |
| A6 | **Coût en jetons non maîtrisé** | Le parallélisme est borné par la capacité de vérification (§ 8.3), pas par celle de l'outil. Les capacités les plus coûteuses (équipes d'agents) ont un emploi restreint et justifié (§ 4.1) |
| A7 | **Dépendance à une capacité expérimentale** | Aucune étape du plan ne dépend d'une capacité expérimentale. Les équipes d'agents sont un confort d'investigation ; tout ce plan s'exécute sans elles |
| A8 | **Travail d'arrière-plan long parti dans la mauvaise direction** | Points de contrôle inscrits au contrat pour tout ce qui est délégué ; pas de session non surveillée sur de la criticité haute |
| A9 | **Réintroduction d'une dépendance réseau** (`C1`) | Interdiction d'ajout de dépendance sans ADR ; contrôle de construction hors ligne en intégration continue |

### 10.3 Les risques techniques de `03`

Les huit risques `R1` à `R8` de `03 § 6` restent en vigueur et sont **portés par des lots nommés** : R1 et R2 par L-01, R5 par L-01 puis L-20, R6 par L-27, R7 par L-24, R8 par L-00 et la boucle visuelle, R3 et R4 par une veille consignée dans `docs/journal/`.

---

## 11. Traçabilité

Chaîne d'identifiants de bout en bout, permettant de reconstituer pourquoi une ligne de code est ce qu'elle est :

```
01 § M7 → EX-PLN-10 / RG-TSK-11 → vue 07 (02) → mockups/07-planning-semaine.html (gel du <date>)
        → L-20 → T-204 → branche lot/L-20-planning → commits → PR
```

**Convention de commit**, portant la trace et vérifiée par hook :

```
<type>(L-xx/vue-NN): <objet> [EX-PLN-10][RG-TSK-11]
```

Exemples : `feat(L-15/vue-19): contrôle du solde au dépôt de la demande [EX-CNG-02][RG-CNG-20][RG-CNG-21]` · `fix(L-20/vue-07): la tâche multi-assignée ne change que d'assigné [RG-TSK-11]`.

La chaîne doit rester vraie **dans les deux sens** : le diff retour (§ 8.4) garantit que toute découverte aval remonte modifier l'amont, avec trace. Chaque élément du système doit pouvoir dire d'où il vient.

---

## 12. Instrumentation du pilote

Ce projet est le premier essai du cycle. Un pilote qui ne mesure rien ne valide rien. `docs/journal/` reçoit une entrée par vague, alimentée pour partie automatiquement par les hooks `SubagentStop` et `TaskCompleted`.

| Point ouvert de la note de référence | Ce qu'on mesure | Où |
| --- | --- | --- |
| 1. Granularité réelle des contrats de tâche | Par tâche : fichiers touchés, lignes, durée, jetons, nombre d'allers-retours avant vert | Automatique |
| 2. Coût du diff retour | Par lot : temps passé, nombre de mises à jour de spec proposées, nombre retenues | Manuel |
| 3. Seuils de criticité | Par incident : criticité inscrite au contrat, gravité constatée. La grille § 6.1 est-elle bien calibrée ? | Manuel |
| 4. Tenue du préambule commun | **Sans objet pour ce pilote** : les maquettes préexistent au cycle. Remplacé par : dérive du design system à l'implémentation, mesurée en violations `stylelint` et en écarts d'étage 2 | Mixte |
| 5. Fiabilité de la boucle visuelle | Taux de faux positifs de l'étage 1 ; nombre d'écarts réels rattrapés à l'étage 2 ; nombre rattrapés seulement par l'œil humain en revue de vague | Mixte |
| 6. Charge de vérification humaine par vague | Heures de vérification par vague, rapportées au volume produit. Le goulot est-il tenable ? | Manuel |

**Limite du pilote, à consigner d'emblée.** La moitié amont du cycle — expression de besoin humaine, business analysis, maïeutique, briefs, génération assistée des maquettes — a été parcourue **avant** la formalisation du cycle, sous une autre forme. Ce pilote éprouve donc la moitié aval : DAG, contrats, gate, exécution sous harnais, vérification, capitalisation. La moitié amont reste à éprouver sur un projet ultérieur, et le résultat de ce pilote ne peut pas en tenir lieu.

---

## 13. Prérequis et arbitrages avant lancement

### 13.1 Arbitrages fonctionnels bloquants

| # | Arbitrage | Bloque | Origine |
| --- | --- | --- | --- |
| ~~**B1**~~ | ~~**Vocabulaires divergents du § 4.1**~~ — priorité (six niveaux ou quatre), statut de projet (« Suspendu » et « En pause ») | ~~L-02, L-03~~ | **Tranché le 2026-08-16** : quatre priorités, cinq statuts de projet au libellé des maquettes. `01 § 4.1` corrigé, écarts consignés en `03 § 7.3` et `§ 7.4` |
| **B2** | **Circuit de validation des congés** : un niveau (manager ou délégué) ou deux ? | L-15 | `01 § 9.2` |
| **B3** | **Priorité de mise en service** : quels modules dans la première livraison ? | La composition des vagues 5 et 6 | `01 § 9.8` ; recommandation de `03 § 8.6` : M1, M2, M3, M20 puis M7 |
| **B4** | **Périmètre mobile** : quelles actions réalisables sur téléphone ? | L-25 et la définition de terminé « responsive » de chaque lot | `01 § 9.6` |
| **B5** | **Cible de déploiement** : machine unique ou orchestrateur existant ? | L-29, et le caractère testable de la répartition des sessions et des verrous | `03 § 8.2` |

**B1 était le seul arbitrage qui interdisait d'ouvrir la vague 1 ; il est rendu.** Les autres peuvent l'être pendant la vague 0 : B2 avant l'ouverture de L-15, B3 avant la composition des vagues 5 et 6, B4 avant que la définition de terminé « responsive » ne soit figée, B5 avant L-29.

**Sur la méthode d'arbitrage.** B1 illustre le régime attendu pour les suivants : l'écart est constaté par confrontation des sources, l'asymétrie des coûts est chiffrée, la décision est humaine, et la correction est portée **dans le document amont** — jamais absorbée en aval par une conversion silencieuse à l'implémentation. Une divergence de vocabulaire réglée dans le code plutôt que dans `01` est une divergence qui reviendra à chaque lot.

### 13.2 Arbitrages à valeur par défaut

Ces points sont ouverts mais, par application du parti pris n° 3 de `01` — *toute limite fonctionnelle est un paramètre d'administration* —, ils n'exigent qu'une **valeur par défaut** à l'installation, modifiable sans livraison : plafond d'heures journalier (`01 § 9.3`), politique de mot de passe au-delà du minimum de `RG-AUTH-06` (`01 § 9.4`), horizon de récurrence (`RG-EVT-02`), plafond de to-do (`RG-DSH-01`), rétention du journal d'audit (`01 § 9.7`). Le raccordement à un annuaire d'entreprise (`01 § 9.5`) reste hors périmètre de la première version, avec la couture d'adaptation prévue par `03 § 4, D8`.

### 13.3 Prérequis techniques

| # | Prérequis | État constaté | Note |
| --- | --- | --- | --- |
| T1 | **Dépôt git initialisé** | **Levé** le 2026-08-16 (`df14c64`, branche `main`) | Bloquant absolu : sans git, ni worktrees, ni branches, ni points de restauration, ni traçabilité, ni revue de diff. Le gel des maquettes date de cette validation |
| T2 | Node 24 LTS | Présent (24.19.0) | Conforme à `03 § 3.1` |
| T3 | pnpm 11 | **Levé** le 2026-08-16 — 11.22.0 via corepack | Version épinglée par `03 § 9` |
| T4 | Docker / Docker Compose | **Levé** le 2026-08-16 — Docker 29.1.3, Compose 2.40.3, démon actif | Nécessaire aux tests d'intégration (Testcontainers) et à la cible de déploiement |
| T5 | PostgreSQL 18 accessible | Fourni par conteneur, à vérifier au câblage de `test:int` | Aucune installation système : la base de développement est jetable et reproductible |
| T6 | Navigateurs Playwright | À installer | Téléchargement au premier usage |

**Sur la chaîne d'approvisionnement.** `C1` — réseau fermé — s'applique à l'**exécution** du produit, pas à sa construction : le poste de développement télécharge des paquets et des navigateurs. La conséquence à traiter en L-00 et à consigner en ADR : construire l'image de production **sans accès sortant**, à partir d'un lot de dépendances figé, et le vérifier en intégration continue (c'est le contenu du risque R2 de `03`).

---

## 14. Séquence d'amorçage

Ce que fait la première session de la vague 0, dans l'ordre. Rien de ce qui suit ne se délègue : c'est le harnais qui rend la délégation possible.

1. **`git init`**, première validation portant le cadrage existant tel quel. Le gel des maquettes date de cette validation.
2. **Espaces de travail** : `pnpm`, Turborepo, `apps/web`, `apps/api`, `packages/contracts`, `packages/db`, aux versions de `03 § 9`. Aucun code applicatif.
3. **Boucles de vérification** (§ 3.6), toutes câblées et vertes sur un projet vide. Une boucle qui n'est pas verte au démarrage ne le sera jamais.
4. **`CLAUDE.md`**, `.claude/rules/`, `.claude/settings.json` avec les hooks du § 4.5.
5. **Douze ADR** dérivés de `03 § 4`, un fichier par décision, rédigés comme des contraintes actives.
6. **`socle.css`** extrait des maquettes sans réinterprétation, et **`DESIGN.md`** produit par relevé (§ 3.3).
7. **`design/etats.json`** produit par balayage des 35 panneaux de revue, puis relu à la main (§ 3.5).
8. **`mockups/GEL.md`** et activation du verrou d'écriture.
9. **`docs/dag.md`** : la table du § 5.2, sous sa forme opérationnelle.
10. **Sous-agents et skills** des § 4.3 et 4.4.
11. **L-01** : projet témoin TS 7 (R1), construction hors ligne de Prisma (R2), **prototype jetable de la vue 08** à la volumétrie cible (R5). Sortie : trois ADR de confirmation ou de repli, et un prototype supprimé.
12. **Revue de vague 0** : gate des quatre questions passé sur L-02 et L-03, arbitrage B1 rendu, première entrée de `docs/journal/`.

À l'issue de la vague 0, la question 3 du gate — *l'agent dispose-t-il des outils pour implémenter, tester et corriger seul ?* — doit pouvoir recevoir un oui démontré, commande par commande. Tant qu'elle ne le peut pas, la vague 1 ne s'ouvre pas.

---

## 15. Annexes

### A. Gabarit — contrat de tâche

```markdown
# Tâche T-xxx — <titre>

- **Lot** : L-xx — **Vague** : n
- **Exigences** : EX-…, EX-… — **Règles** : RG-…, RG-…
- **Vue(s) de référence** : mockups/NN-….html (gel du <date>)
- **États attendus** : <liste tirée de design/etats.json>
- **Criticité** : basse | moyenne | haute → **Mode** : délégation large | délégation supervisée | pair

## Critères d'acceptation exécutables
- [ ] `pnpm test -- <motif>` → tous verts, un test nommé par RG-… couverte
- [ ] `pnpm ui:diff NN` → étage 1 sans écart
- [ ] `pnpm a11y -- NN` → aucune violation, thèmes clair et sombre
- [ ] `pnpm i18n:check` → aucune clé manquante ni orpheline
- [ ] <critère propre à la tâche>

## Pointeurs harnais
CLAUDE.md § … · .claude/rules/….md · ADR-…. · DESIGN.md § …

## Hors périmètre de cette tâche
<ce que la tâche ne doit pas produire, même si l'occasion se présente>

## Gate
- [ ] 1. Objectif explicite et sans ambiguïté
- [ ] 2. Contraintes et critères formalisés et exécutables
- [ ] 3. Outils disponibles pour implémenter, tester, corriger seul
- [ ] 4. Capacité à expliquer, évaluer et valider le résultat
→ 4/4 requis. Passé le <date>.

## Points de contrôle (si délégation)
<étapes de validation intermédiaire>
```

### B. Définition de terminé — par nature de tâche

**Tâche de vue.** Tous les états de `design/etats.json` implémentés · boucle visuelle étages 1 et 2 · accessibilité sans violation dans les deux thèmes · aucune chaîne en dur · aucune couleur littérale · variante « droits minimaux » et variante « administrateur » toutes deux crédibles (`02 § D.3`) · état vide rédigé avec sa sortie · rendu d'impression si la vue est concernée.

**Tâche de module serveur.** Une `EX-…`/`RG-…` = un test nommé qui la cite · règles d'intégrité doublées en base quand `C15` l'exige · contrôle de permission **et** de périmètre sur chaque lecture et chaque écriture · traçage au journal d'audit pour les actions listées en `01 § M20` · schéma OpenAPI engendré · aucune écriture « dernier arrivé gagne ».

**Tâche de schéma.** Migration réversible · contraintes d'exclusion et unicités posées · index déterminants créés et justifiés · jeu de données de volumétrie mis à jour · mesure de performance rejouée.

**Tâche d'audit (vague 6).** Balayage exhaustif, pas par échantillon · rapport listant les écarts avec leur lot d'origine · correctifs ouverts comme tâches à part entière, jamais appliqués au fil de l'audit.

### C. Gate — liste de contrôle de lancement

```markdown
- [ ] 1. Objectif explicite et sans ambiguïté
- [ ] 2. Contraintes techniques et critères d'acceptation formalisés
- [ ] 3. Outils disponibles pour implémenter, tester et corriger en autonomie
- [ ] 4. Capacité à expliquer, évaluer et valider la solution finale
→ 4/4 requis. Toute case vide renvoie en amont : spec (1), contrat (2), harnais (3), compréhension (4).
```

### D. Entrée de journal de vague

```markdown
# Vague n — <intitulé> — clôturée le <date>

## Lots livrés
| Lot | Tâches | Criticité | Mode | Durée | Allers-retours avant vert |

## Vérification
- Profondeur appliquée par lot, et écarts éventuels à la règle
- Heures de vérification humaine

## Diff retour
- Mises à jour de spec proposées / retenues / refusées, avec motif

## Boucle visuelle
- Faux positifs étage 1 · écarts réels étage 2 · écarts vus seulement à l'œil

## Capitalisation
- Ajouts à CLAUDE.md / ADR / DESIGN.md

## Auto-audit
- Signaux d'érosion cochés : n/5 → décision
- Temps de localisation à froid, module tiré au sort : … min
```

---

*Fin du plan de réalisation agentique.*
