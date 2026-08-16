# Gel de la référence d'interface

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

## 2. Procédure de dégel

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
