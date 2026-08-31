# Gel de la référence d'interface — **LEVÉ**

> **Gel levé le 2026-08-31, par décision humaine.** Le produit passe en finition
> poussée : la maquette n'est plus l'étalon de conformité. Elle redevient une
> intention de conception — consultable, discutable, modifiable.
>
> **Ce qui a été débranché** — la garde d'écriture `PreToolUse`
> (`.claude/hooks/garde-ecriture.sh`, retirée de `.claude/settings.json`), qui
> bloquait toute écriture sous `mockups/`, sous `cadrage/`, et sur
> `schema.prisma` hors tâche de schéma déclarée.
>
> **Ce qui ne prononce plus** — `pnpm ui:diff <vue>` et `pnpm conformite`. Les
> deux restent exécutables et restent utiles comme **relevé** d'écarts contre
> l'intention ; aucun ne rend plus un verdict. `design/references/` n'est plus
> une référence opposable : c'est un instantané daté de ce que les maquettes
> montraient.
>
> **Ce que cela coûte, et qu'il faut savoir.** Le gel existait pour une raison
> précise, énoncée plus bas : sans point fixe, un agent en difficulté sur une
> conformité a une issue — modifier la référence — et le cycle perd son étalon.
> Cette issue est rouverte. Trois défauts que ce dépôt a réellement connus —
> une vue livrée sans une seule règle de style, cinq menus rendus nus, une
> classe posée sans règle en face — n'ont été vus **que** par `ui:diff`. Ni
> `axe`, ni les parcours de bout en bout, ni le typage ne regardent la mise en
> page. Ce filet-là n'est remplacé par rien : il est passé de la boucle à
> l'œil, et la définition de terminé de `CLAUDE.md` le dit désormais ainsi.
>
> **Renommage.** Le produit s'appelle **Rationarium** depuis le 2026-08-31 ; il
> s'appelait Trame. Les 35 maquettes ont été modifiées en conséquence — titre,
> `.side-mark`, `.wordmark-name`, fil d'Ariane, mention de version — première
> écriture sous `mockups/` depuis le gel du 2026-08-16.

---

## 0. Ce que portait le gel (historique)

**Gelé le 2026-08-16**, commit d'amorçage `df14c64`.

Les 35 maquettes de ce dossier sont la **référence exécutable** de l'interface. Elles ne sont plus modifiables : un hook `PreToolUse` refuse toute écriture sous `mockups/`.

Le gel n'est pas une formalité d'archivage. Il crée le **point fixe** de la boucle de vérification visuelle (`cadrage/04 § 7.4`) : sans lui, un agent en difficulté sur une conformité a une issue — modifier la référence — et le cycle perd son étalon.

---

## 1. Ce que porte la référence

| Fait | Valeur |
| --- | --- |
| Vues maquettées | 35, couvrant l'intégralité de l'inventaire de `cadrage/02 § C` |
| Panneaux de revue | 35 sur 35 |
| Axes d'état pilotables | 150 |
| États atteignables programmatiquement | **335** |
| Manifeste dérivé | `design/etats.json` |

Chaque maquette porte un **panneau de revue** hors produit qui pilote ses états par appel de fonction : `setState('loading')`, `setData('empty')`, `setRole('c')`, `setDays(7)`, `toggleTheme()`, `setLang('en')`… C'est ce qui rend la comparaison de rendu mécanique plutôt qu'intentionnelle.

---

## 2. Procédure de dégel *(caduque depuis le 2026-08-31 — conservée pour mémoire)*

Modifier une maquette est une **décision humaine**, jamais un effet de bord d'une session d'agent.

1. Motiver l'écart : quelle exigence `EX-…` ou règle `RG-…` la référence ne satisfait pas.
2. Modifier, en retirant temporairement le verrou.
3. Consigner ici : date, fichier, nature de la modification, motif.
4. **Exécuter le diff retour** (`cadrage/04 § 8.4`) vers `01` et `02`, et porter les mises à jour de spec correspondantes.
5. Regeler : nouvelle empreinte dans le tableau du § 4.

Une modification de maquette non suivie d'un diff retour est une divergence silencieuse — le mode de défaillance que le cycle cherche précisément à empêcher.

---

## 3. Écarts constatés dans la référence

Cinq écarts, à corriger au portage. **Aucun ne remet en cause une décision de conception.** Les trois premiers viennent de `cadrage/03 § 7` ; les deux suivants ont été relevés au montage du socle, le 2026-08-16.

### Écart 1 — Polices chargées depuis un service distant

Les maquettes chargent IBM Plex depuis `fonts.googleapis.com`. Incompatible avec **C1** : en production, l'application afficherait les substituts système.

**Correction au portage** : `@fontsource/ibm-plex-sans`, `-serif`, `-sans-condensed`, `-mono` en 5.3.0, embarqués dans le lot. Les substituts système déclarés dans les maquettes restent le filet de sécurité.

### Écart 2 — Socle graphique recopié dans chaque fichier

C'était le bon choix pour des maquettes autonomes. Au portage, il devient une feuille unique importée une fois : `apps/web/src/styles/socle.css`. Les 35 copies servent de référence de conformité, **pas de source**.

### Écart 3 — Vocabulaires divergents *(tranché)*

> **Tranché le 2026-08-16.** Priorité à quatre niveaux, statut de projet à cinq valeurs au libellé des maquettes. `cadrage/01 § 4.1` corrigé. Les maquettes sont inchangées : elles portaient déjà le vocabulaire retenu.

### Écart 4 — Les maquettes sont cumulatives, pas indépendantes

Relevé au montage du socle. Chaque fichier embarque les sections CSS de tous les précédents : `01-connexion.html` porte 12 sections, `35-mon-profil.html` en porte 39. Chaque vue en **introduit exactement une** qui lui est propre.

Ce n'est pas un défaut — c'est ce qui a garanti la cohérence stylistique entre les conversations de génération. Mais cela a deux conséquences opératoires :

- **La feuille complète est celle de la dernière vue de chaque lignée** : `35-mon-profil.html` pour les 30 vues authentifiées, `05-mot-de-passe-impose.html` pour les 5 vues d'accès.
- **La carte section → vue → lot** est établie dans `docs/design/DESIGN.md § 4`. Chaque lot sait quelle section CSS est sa source.

### Écart 5 — Divergence de contraste entre les fichiers, non rétro-propagée

**Le plus important des cinq**, parce qu'il touche à une exigence contractuelle et qu'il était invisible à la lecture.

Les 35 maquettes ne portent pas les mêmes valeurs de jetons. Neuf d'entre elles — **01, 06, 07, 09, 14, 19, 22, 28, 30** — portent une correction de contraste qui n'a pas été reportée sur les 26 autres :

| Jeton | Groupe de 9 | Groupe de 26 | Seuil RGAA |
| --- | --- | --- | --- |
| `--placeholder` (clair) | `#6E7583` — **4,63** ✅ | `#8E96A6` — 2,97 ❌ | 4,5 (texte) |
| `--line-strong` (clair) | `#7E8698` — **3,65** ✅ | `#B4BAC5` — 1,95 ❌ | 3,0 (non-texte) |
| `--line-strong` (sombre) | `#6B7486` | `#3D4453` | 3,0 (non-texte) |
| `--leave-pending` (clair) | `#71609E` — **5,43** | `#8B7BB5` — 3,75 | selon usage |

Les neuf fichiers corrigés sont exactement les vues critiques et très denses de `cadrage/02 § C`, plus la connexion : la correction a manifestement été faite là où elle se voyait, sans balayage complet.

**Décision : les valeurs du groupe de 9 font foi**, seules compatibles avec `C5` et `cadrage/01 § 7 Accessibilité`. Elles sont celles de `apps/web/src/styles/socle.css`.

**Conséquence pour la boucle visuelle** : lors d'une comparaison de rendu contre l'une des 26 maquettes non corrigées, un écart sur ces quatre jetons est **attendu et conforme**. La boucle doit le tolérer explicitement, sans quoi elle produira 26 faux positifs. C'est le premier cas concret alimentant la mesure du point ouvert n° 5 (`cadrage/04 § 12`).

### Écart 6 — Cases à cocher sans nom accessible

Relevé au premier passage de la boucle visuelle sur les 335 états, le 2026-08-16.

Trois vues portent des `<input type="checkbox">` nus : sans `aria-label`, sans `label[for]`, non imbriqués dans un `<label>`. Leur sens n'est porté que par un texte adjacent, non associé programmatiquement.

| Vue | Éléments | Ce que c'est |
| --- | --- | --- |
| **06** Tableau de bord | 6 | Cases des to-do personnelles |
| **17** Fiche tâche | 5 | Cases des sous-tâches |
| **34** Tâches prédéfinies | 12 | Cases apparaissant dans certains états seulement |

Une assistance technique annonce « case à cocher, non cochée » sans dire de quoi. C'est un manquement à `C5` et à `cadrage/01 § 7 Accessibilité`, tous deux contractuels.

**Décision : le portage corrige, la maquette reste inchangée.** Motif : la maquette est la référence **visuelle**, pas une référence de balisage ; et `cadrage/03 § 0` pose qu'aucune considération technique ne justifie de dévier d'une exigence. Le portage associe un nom accessible — le libellé de la to-do, celui de la sous-tâche — sans modifier le rendu.

Concerne les lots **L-21** (vue 06), **L-11** (vue 17) et **L-17** (vue 34).

### Écart 7 — Ligne de base RGAA de la référence

Relevé le 2026-08-16 par `pnpm a11y` : axe-core sur les 35 vues, dans les deux thèmes, panneau de revue exclu. **70 contrôles, 28 en échec, 33 manquements graves ou critiques.**

| Manquement | Gravité | Vues concernées | Ce que c'est |
| --- | --- | --- | --- |
| `color-contrast` | serious | 10, 16, 17, 19, 20, 22, 34 | Contraste insuffisant. Partiellement lié à l'écart 5, **mais pas seulement** : 19 et 22 appartiennent au groupe conforme et échouent quand même, l'une en sombre, l'autre en clair |
| `select-name` | **critical** | 13, 14, 16, 17 | Liste déroulante sans nom accessible |
| `aria-hidden-focus` | serious | 07, 08, 18, 33 | Élément focalisable à l'intérieur d'un `aria-hidden`. Un piège de navigation clavier : le focus disparaît dans une zone que l'assistance technique ne restitue pas |
| `label` | **critical** | 06, 17 | Champ de formulaire sans libellé |
| `scrollable-region-focusable` | serious | 15 | **Zone défilante inatteignable au clavier.** Sur le Gantt, cela signifie qu'une partie du contenu n'est pas consultable sans souris |

Deux observations valent d'être relevées.

**`label` sur 06 et 17 confirme l'écart 6, trouvé indépendamment** par un autre moyen. Deux contrôles distincts qui convergent sur le même défaut, c'est le meilleur signal qu'on puisse obtenir sur sa réalité.

**`scrollable-region-focusable` sur la vue 15 est le plus grave**, alors qu'il n'est pas classé critique : une zone défilante sans accès clavier rend du contenu littéralement inatteignable, ce qui va au-delà d'une gêne d'annonce.

**Décision : le portage corrige, la maquette reste inchangée**, pour le même motif que l'écart 6.

**Mécanisme retenu — le cliquet.** `design/a11y-baseline.json` recense ces 33 manquements. Le contrôle `pnpm a11y` **tolère le connu et refuse le nouveau**, et cette liste ne doit que décroître. Sans cliquet, le contrôle resterait rouge en permanence — et un contrôle en permanence rouge n'est plus lu, il devient du décor. Le lot **L-25** a désormais une cible chiffrée plutôt qu'une intention.

---

## 4. Empreintes au gel

`sha256`, tronqué à 16 caractères.

| Fichier | Empreinte |
| --- | --- |
| `01-connexion.html` | `e9202295d770ccc3` |
| `02-inscription.html` | `9dd90a3b4aa8f7fc` |
| `03-mot-de-passe-oublie.html` | `ae537d6847075de6` |
| `04-reinitialisation.html` | `877c1e77c6fa6b27` |
| `05-mot-de-passe-impose.html` | `ba19764b8088a492` |
| `06-tableau-de-bord.html` | `6fd30aba0cf44cdf` |
| `07-planning-semaine.html` | `067ac59d5d442300` |
| `08-planning-mois.html` | `4baca763e619d875` |
| `09-planning-activite.html` | `079e82561b371937` |
| `10-portefeuille-projets.html` | `f79e1c98435b8707` |
| `11-projet-vue-ensemble.html` | `58e6b04fa7a020d5` |
| `12-projet-taches-kanban.html` | `7724c7defe79794f` |
| `13-projet-jalons.html` | `ad2ead79f088bb98` |
| `14-projet-equipe.html` | `115d0e8733b3cd55` |
| `15-projet-gantt.html` | `c26d8f5840b75671` |
| `16-taches-globales.html` | `130c9dbdbf205f6b` |
| `17-fiche-tache.html` | `4038a5cf418d080b` |
| `18-evenements.html` | `70dd40b2df5339c4` |
| `19-conges.html` | `cc41dfd233084b19` |
| `20-teletravail.html` | `8c96dd73d4673e8b` |
| `21-temps-passe.html` | `5eab5eadce07cede` |
| `22-competences.html` | `ee6a0154eac9e702` |
| `23-tiers.html` | `d8f8505f2c78c096` |
| `24-fiche-tiers.html` | `41920e0022b4f117` |
| `25-clients.html` | `ff5a813bc14d5c13` |
| `26-fiche-client.html` | `ff3d1548fc73f6fe` |
| `27-utilisateurs.html` | `78d917a5011fa5cd` |
| `28-suivi-individuel.html` | `3552a5ba662f6d05` |
| `29-departements-services.html` | `003196be99d63e75` |
| `30-rapports-analytics.html` | `3274dd2d03f6bc46` |
| `31-parametres.html` | `362b752d4422422d` |
| `32-roles-permissions.html` | `1227f40fdfc4150a` |
| `33-journal-audit.html` | `4159cf4de164703d` |
| `34-taches-predefinies.html` | `b20b2fdb92d74433` |
| `35-mon-profil.html` | `d10a55cd2f214036` |

---

*Toute modification de ce dossier passe par la procédure du § 2.*
