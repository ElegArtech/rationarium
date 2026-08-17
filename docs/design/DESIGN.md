# DESIGN.md — le système de design comme contrainte

**Trame.** Ce document transforme la génération d'interface en **assemblage contraint** : l'agent ne dessine pas, il compose.

---

## 0. Règle d'or

> **`mockups/` est la référence. Ce document la décrit, il ne la remplace pas.**

En cas d'écart entre ce document et une maquette, **la maquette gagne** et ce document est corrigé. Les maquettes sont gelées (`mockups/GEL.md`) et en lecture seule.

Trois interdits qui découlent de cette règle, et qui sont tenus mécaniquement, pas par consigne :

| Interdit | Tenu par |
| --- | --- |
| Aucune couleur littérale hors `socle.css` | `stylelint.config.js` — `color-no-hex`, `color-named`, fonctions de couleur |
| Aucune écriture sous `mockups/` | Hook `PreToolUse` (`.claude/settings.json`) |
| Aucun composant hors inventaire | Revue de lot ; toute addition exige un ADR |

---

## 1. Les jetons

Les jetons sont **le contrat de style**. Ils sont repris des maquettes sans réinterprétation, et vivent dans `apps/web/src/styles/socle.css`, importé une fois globalement.

> **Sur la provenance des valeurs.** Les 35 maquettes ne portaient pas toutes les mêmes valeurs : neuf d'entre elles (01, 06, 07, 09, 14, 19, 22, 28, 30) portaient une correction de contraste qui n'avait pas été rétro-propagée aux 26 autres. Ce sont **ces valeurs-là qui font foi**, parce qu'elles seules satisfont `C5`. Détail en `mockups/GEL.md`, écart 5.

### 1.1 Surfaces et texte

| Jeton | Clair | Sombre | Rôle |
| --- | --- | --- | --- |
| `--paper` | `#F1F2F4` | `#0E1014` | Fond de page |
| `--surface` | `#FFFFFF` | `#161922` | Fond de carte, de panneau, de cellule |
| `--surface-2` | `#FAFAFB` | `#1C202A` | Fond secondaire : en-têtes de tableau, zones inertes |
| `--line` | `#D5D8DE` | `#2A2F3B` | Séparateur ordinaire |
| `--line-strong` | `#7E8698` | `#6B7486` | Bordure de contrôle interactif — **contraste 3,65 : seuil non-texte tenu** |
| `--ink` | `#14161C` | `#E7E9EE` | Texte principal |
| `--muted` | `#5B6270` | `#98A0AF` | Texte secondaire |
| `--placeholder` | `#6E7583` | `#8E96A6` | Texte indicatif de champ — **contraste 4,63 : seuil texte tenu** |

### 1.2 Accent

Une couleur d'accent **unique et affirmée**, employée avec parcimonie. `02 § A` est explicite : la couleur reste porteuse de sens, jamais décorative.

| Jeton | Clair | Sombre | Rôle |
| --- | --- | --- | --- |
| `--accent` | `#1B2A9B` | `#8093FF` | Action principale, sélection, focus |
| `--accent-strong` | `#121D75` | `#A3B0FF` | État actif ou survolé de l'accent |
| `--accent-soft` | `#E7EAF8` | `#1A2044` | Fond d'accent, alerte neutre |
| `--on-accent` | `#FFFFFF` | `#0A0F2E` | Texte sur aplat d'accent |
| `--brand-panel` | `#101A6E` | — | Panneau de marque (vues 01 à 05) |

### 1.3 Statuts de tâche — vocabulaire `01 § 4.1`

| Jeton | Valeur | Statut |
| --- | --- | --- |
| `--st-todo` | `#5B6270` | À faire |
| `--st-doing` | `#1B2A9B` | En cours |
| `--st-review` | `#9A5B00` | En revue |
| `--st-done` | `#146B3D` | Terminé |
| `--st-blocked` | `#AF2020` | Bloqué |

**Cinq statuts, cinq jetons.** Le vocabulaire est fermé : toute couleur de statut inventée est un défaut.

### 1.4 Occupations du planning

C'est le vocabulaire visuel de la vue centrale. Six natures d'information doivent cohabiter dans une cellule sans devenir illisibles (`02 § D.1`).

| Jeton | Valeur | Occupation |
| --- | --- | --- |
| `--leave` | `#6A4BA6` | Congé validé |
| `--leave-pending` | `#71609E` | Congé **en attente** — distinct du validé (`EX-PLN-13`) |
| `--telework` | `#0C6E86` | Télétravail |
| `--office` | `#5B6270` | Bureau déclaré |
| `--event` | `#B8420B` | Événement |
| `--activity` | `#0F6E5C` | Permanence (tâche prédéfinie) |

### 1.5 Contraste inversé, retours d'état, trames

| Jeton | Rôle |
| --- | --- |
| `--ob-todo`, `--ob-doing`, `--ob-review`, `--ob-done`, `--ob-blocked`, `--ob-leave`, `--ob-telework`, `--ob-activity`, `--ob-event` | Pastilles sur surface de marque : contraste inversé, à employer **uniquement** sur `--brand-panel` |
| `--danger-soft`, `--success-soft`, `--warn-soft` | Fonds d'alerte |
| `--trame-ferie` `rgba(20,22,28,.055)` | Trame de fond des jours fériés — **ne masque jamais le contenu** (`EX-PLN-14`) |
| `--trame-vacances` `rgba(27,42,155,.05)` | Trame de fond des vacances scolaires |

### 1.6 Encres constantes — jetons ajoutés au portage

Six jetons qui **n'existaient pas dans les maquettes**, ajoutés au socle parce que le portage ne pouvait pas s'en passer sans écrire des couleurs littérales.

Les maquettes emploient `#fff`, `#000` et cinq `rgba(…)` dans leurs sections de vue. Aucun jeton existant ne convenait : `--on-accent` bascule au sombre, or ces couleurs sont posées sur des aplats qui **restent sombres dans les deux thèmes** — un aplat de statut, une ombre, un voile de fenêtre modale.

| Jeton | Valeur | Emploi |
| --- | --- | --- |
| `--on-status` | `#FFFFFF` | Texte sur un aplat de statut : pastille de compteur, étiquette sur `--st-blocked` |
| `--ombre-douce` | `rgba(0,0,0,.04)` | Ombre de survol, séparation légère |
| `--ombre-portee` | `rgba(0,0,0,.35)` | Ombre de fenêtre et de panneau |
| `--voile-fenetre` | `rgba(8,10,16,.45)` | Voile derrière une fenêtre modale |
| `--trame-leave-douce` | `rgba(106,75,166,.30)` | Trame de congé validé, en fond de cellule |
| `--trame-leave-pending-douce` | `rgba(120,110,150,.16)` | Trame de congé en attente |

**Ce sont des ajouts, pas des réinterprétations** : les valeurs sont exactement celles des maquettes. Ils ne basculent pas avec le thème, et c'est délibéré.

La règle qui a produit cet ajout mérite d'être retenue : quand une couleur nécessaire n'existe pas dans les jetons, **on s'arrête et on tranche** — soit c'est un jeton manquant à ajouter et à documenter ici, soit c'est une réinterprétation qu'il ne faut pas faire. `stylelint` force cet arrêt ; sans lui, la couleur littérale serait passée sans que personne ne la voie.

### 1.7 Rythme et typographie

| Jeton | Valeur | Note |
| --- | --- | --- |
| `--r` | `3px` | Rayon standard : **net, jamais arrondi mou**. Le registre est institutionnel, pas SaaS générique |
| `--font-ui` | IBM Plex Sans | Interface |
| `--font-display` | IBM Plex Serif | Titres et signature de marque |
| `--font-cond` | IBM Plex Sans Condensed | Grilles denses : planning, matrices, Gantt |
| `--font-mono` | IBM Plex Mono | Identifiants, horodatages, valeurs techniques |

**Les polices sont auto-hébergées** via `@fontsource`, jamais chargées depuis un service distant. Les maquettes les chargent en ligne : c'est l'écart 1 du gel, à corriger au portage (`C1`).

---

## 2. Inventaire fermé des composants

**Fermé** signifie : tout composant hors de cette liste exige un ADR avant d'exister. C'est la parade au risque A1 — l'agent qui invente de l'interface là où la maquette est muette.

Le comportement et l'accessibilité s'achètent (React Aria Components, `03 § 4, D3`) ; le style est apporté par le socle.

| Composant | Source | Emploi |
| --- | --- | --- |
| Dialogue, dialogue modal | `react-aria-components` | Confirmations, fenêtres de création, imports |
| Menu, menu déroulant | `react-aria-components` | Menus d'action, menu utilisateur, menu « Créer » |
| Onglets | `react-aria-components` | Fiche projet, suivi individuel, paramètres, rapports |
| Liste déroulante, combobox, sélection multiple | `react-aria-components` | Assignés, services, projets, périmètres, dépendances |
| Sélecteur de dates, plage de dates | `react-aria-components` + `@internationalized/date` | Congés, tâches, événements, filtres de période |
| Infobulle | `react-aria-components` | Explication des actions désactivées (`RG-GEN-06`) |
| Table | `react-aria-components` + `@tanstack/react-table` | Listes, journal d'audit, matrices |
| Case à cocher, groupe de cases, bouton radio, interrupteur | `react-aria-components` | Filtres, couches d'affichage, matrice de permissions |
| Champ texte, zone de texte, champ numérique | `react-aria-components` | Formulaires |
| Barre de progression | `react-aria-components` | Progression de projet, de tâche, de jalon |
| Virtualisation | `@tanstack/react-virtual` | Vue Mois, matrice de compétences, journal d'audit |
| Glisser-déposer | `@atlaskit/pragmatic-drag-and-drop` | Planning, kanban — **toujours doublé d'une action explicite au clavier** (`C6`) |
| Graphiques, Gantt, grilles de planning | **Aucune bibliothèque** | HTML, CSS et SVG pilotés par les jetons, portés des maquettes (`03 § 4, D12`) |

**Ce que l'inventaire exclut, définitivement** : toute bibliothèque de composants stylés (Material, Ant, Chakra, shadcn/ui), tout framework CSS utilitaire, toute bibliothèque de graphiques ou de Gantt. Motif en `03 § 2` : leur adoption reviendrait à jeter le travail de conception pour le refaire dans un autre vocabulaire.

---

## 3. Règles de layout

1. **Hiérarchie par la typographie et l'espacement avant la couleur.** La couleur porte le sens (statut, alerte, catégorie) ; elle ne hiérarchise pas.
2. **Bordures et séparateurs nets plutôt qu'ombres diffuses.**
3. **Densité assumée sur les vues de pilotage, blanc généreux sur les vues de consultation.** Les deux régimes coexistent et ne se mélangent pas dans une même vue.
4. **Les vues denses sont optimisées pour le poste de travail** ; les vues de consultation et de saisie courante restent utilisables sur mobile (`02 § A.8`).
5. **Sur les grilles** : colonne de gauche figée au défilement horizontal, ligne d'en-tête figée au défilement vertical.
6. **Prévoir l'anglais 30 % plus long** que le français (`02 § D.7`). Aucune largeur calée sur un libellé français.
7. **Les deux thèmes sont traités partout**, y compris sur les codes couleur porteurs de sens (`02 § D.8`).
8. **La vue active occupe toute la largeur disponible, avec la même gouttière des deux côtés.** `.page` ne porte **aucun** `max-width`. Les maquettes en portent un — `1360px`, sans centrage — et c'est un écart assumé du portage, décidé le 2026-08-17 : au-delà de 1602 px de fenêtre le contenu s'arrêtait avant le bord que la barre du haut atteint, soit 318 px perdus sur un écran de 1920 et 958 sur un 2560. Le retrait de gouttière à gauche est voulu et se lit comme une marge ; le même vide à droite se lit comme un manque. Ce vide ne réservait rien : les panneaux de détail des vues 07, 08, 18 et 33 sont des `position:fixed; right:0` qui **survolent** le contenu. Ni un plafond non centré — il recrée le défaut — ni un plafond centré — il double la gouttière gauche et fait flotter la page — ne sont acceptables : c'est la gouttière qui borne, pas la largeur.

---

## 4. Carte des sources CSS

Chaque maquette introduit **exactement une** section CSS, qui devient le module CSS du composant correspondant. Le socle (sections 1 à 6 et la passe d'accessibilité) est global ; tout le reste est local.

| Section de maquette | Introduite par | Destination |
| --- | --- | --- |
| 1 TOKENS · 2 BASE · 3 TYPOGRAPHIE · 4 FORMULAIRES · 5 BOUTONS · 6 ALERTES · ACCESSIBILITÉ | vue 01 | **`styles/socle.css`** — global |
| 7 GABARIT DE LA VUE CONNEXION · 8 GRILLE MINIATURE · 8 bis PORTEFEUILLE MINIATURE · 10 RESPONSIVE | vue 01 | L-04 — gabarit des vues 01 à 05 |
| 7 COQUILLE APPLICATIVE · 8 GABARIT DE PAGE · 9 VOCABULAIRE DES OCCUPATIONS | vue 06 | L-05 — coquille |
| 11 PLANNING GRILLE · 12 VUE MOIS · 13 VUE ACTIVITÉ · feuille d'impression | vues 07, 08, 09 | L-20 → `vues/planning/semaine.css`, `mois.css`, `activite.css` |
| *extraites de 11–13* : `.filters` · `.f-input` · `.pl-toolbar` · `.scrim-modal` · `.modal*` · `.toasts` · `.pill` · `.agent-av` · `.calc-tag` | — | **`composants/partages.css`** — transverse (L-32) |
| 14 PORTEFEUILLE · 15 FICHE PROJET · 17 FEUILLE DE ROUTE · 18 ÉQUIPE | vues 10, 11, 13, 14 | L-10 |
| 16 KANBAN · fenêtre d'import · 20 TÂCHES VUE GLOBALE · 21 FICHE TÂCHE | vues 12, 16, 17 | L-11 |
| 19 GANTT · 34 RAPPORTS & ANALYTICS | vues 15, 30 | L-22 → `vues/rapports/gantt.css`, `rapports.css` |
| 22 ÉVÉNEMENTS | vue 18 | L-14 |
| 23 CONGÉS | vue 19 | L-15 |
| 24 TÉLÉTRAVAIL | vue 20 | L-16 |
| 25 TEMPS PASSÉ | vue 21 | L-18 |
| 26 COMPÉTENCES | vue 22 | L-13 |
| 27 TIERS · 28 FICHE TIERS · 29 CLIENTS · 30 FICHE CLIENT | vues 23 à 26 | L-12 |
| 31 UTILISATEURS · 32 SUIVI INDIVIDUEL | vues 27, 28 | L-07 |
| 33 STRUCTURE ORGANISATIONNELLE | vue 29 | L-06 |
| 35 PARAMÈTRES | vue 31 | L-09 → portée en L-37, `vues/administration/parametres.css` |
| 36 RÔLES & PERMISSIONS · 37 JOURNAL D'AUDIT | vues 32, 33 | L-08 → portées en L-37, `roles.css` et `audit.css` |
| 38 TÂCHES PRÉDÉFINIES | vue 34 | L-17 → portée en L-37, `predefinies.css` |
| 39 MON PROFIL | vue 35 | L-05 |

> **Correction du 2026-08-16, au portage de L-32.** Les sections 11 à 13 introduisent des règles qui n'ont rien de planificatoire : la fenêtre modale, la file de messages, la barre de filtres, la pastille de vocabulaire, l'avatar d'agent, le marqueur de valeur calculée. Elles apparaissent d'abord dans le planning parce que c'est la première vue de la lignée qui en avait besoin, **pas parce qu'elles lui appartiennent**. Les laisser dans L-20 obligerait les vues 10 à 14 à les redéfinir, donc à les faire diverger. Elles vivent désormais dans `composants/partages.css`, reprises verbatim.
>
> Deuxième écart, même origine : `.field-hint` appartient à la section 4 (FORMULAIRES), donc au socle, et avait été **omis** au portage de L-00. La vue 13 l'emploie pour dire ce que devient un jalon sans date. Ajouté à `socle.css`.
>
> **Troisième écart, confirmé trois fois — l'opacité comme moyen d'atténuer.** Les maquettes atténuent par `opacity` : `.7` sur une valeur absente (vues 10 et 16), `.45` et `.4` sur les numéros de week-end et de débord (vue 20). Dans tous les cas le contraste tombe sous le seuil AA. Sur la vue 20 s'ajoute une collision de sélecteurs de même poids : quand aujourd'hui tombe un week-end — deux jours sur sept — la règle du jour courant et celle du week-end se disputent la couleur, et la dernière écrite gagne. **L'opacité ne sert jamais à atténuer du texte dans le produit** : on emploie un jeton, ou on laisse le fond porter la distinction. Détail ci-dessous.
>
> **Troisième écart, relevé au portage de L-33 — le contraste des absences.** Les maquettes marquent une valeur absente par `opacity: .7` sur `--muted`. L'opacité fait tomber le contraste sous le seuil AA, et `axe` le refuse sur la vue portée. Le jeton `--placeholder` existe pour exactement cet usage et porte la valeur conforme. Les vues 10 et 16 emploient donc `color: var(--placeholder)` là où la maquette pose une opacité. **La maquette reste la référence de forme ; le socle est la référence de contraste.** Même famille que l'écart 5 de `mockups/GEL.md`.

> **Quatrième écart, relevé au portage de L-37 — l'opacité, encore, sur une ligne inactive.** Les sections 36 et 38 atténuent les lignes désactivées par `opacity: .55`. Une tâche prédéfinie inactive reste au catalogue (`RG-ACT-05`) précisément pour être relue : la rendre illisible contredit la règle qui la conserve. Le fond porte la distinction — `background: var(--surface-2)` — et le texte garde son contraste. Quatrième occurrence de la même famille : la règle est désormais générale, **l'opacité ne dilue jamais du texte**.

> **Cinquième écart, relevé au portage de L-20 — l'impression et les couleurs littérales.** La feuille d'impression de la vue 09 posait `#fff` et `#000` en littéral. Ce sont bien des constantes — le papier reste blanc dans les deux thèmes —, mais elles passent désormais par `--papier` et `--encre`, ajoutés au bloc des encres constantes du socle. Aucune couleur littérale ne subsiste hors `socle.css`.
>
> **Sixième écart, même famille que le troisième — l'en-tête de week-end du mois.** La section 12 atténue `.mo-head.is-off` par `opacity: .65`, ce qui fait tomber le contraste sous AA. La distinction est déjà portée par le fond de toute la colonne : l'en-tête garde `--muted`, conforme. S'y ajoutait la collision déjà rencontrée sur la vue 20 — quand aujourd'hui tombe un samedi, la règle du jour courant et celle du week-end ont le même poids. L'ordre d'écriture est ici **délibéré** : l'accent passe après, donc il gagne.

> **Septième écart, relevé au portage de L-22 — le libellé posé sur une barre de Gantt.** La section 19 pose `.g-bar-lab` en `--ink` directement sur la barre, dont la couleur varie avec le statut **et** avec le taux de remplissage. Le contraste y tombe sous AA sur plusieurs statuts. Le libellé porte donc son propre fond de surface — le même dispositif que l'étiquette « AUJ. » de la même section, qui, elle, l'avait déjà. La maquette se contredisait ; on suit celle de ses deux règles qui satisfait `C5`.

> **Huitième écart, relevé au portage de L-27 — les feuilles d'impression visaient des classes inexistantes.** Les maquettes nomment `.side` et `.main` ; la coquille portée au L-05 les a nommées `.sidebar` et `.contenu`. Les blocs `@media print` recopiés depuis les maquettes visaient donc le vide : la barre latérale s'imprimait. Rien ne pouvait le voir — un sélecteur qui ne correspond à rien ne produit ni erreur ni avertissement. C'est l'émulation du média d'impression (`emulateMedia`) qui l'a montrée, et c'est la raison d'être de `impression.e2e.spec.ts` : sans elle, on vérifie que le CSS existe, pas qu'il s'applique.
>
> Par ailleurs, la maquette 07 ne porte **aucune** feuille d'impression propre — seulement le bloc du socle. La mise en page imprimable du planning exigée par `cadrage/01 § 7` est donc construite par analogie avec celle de la vue 09, et `.print-head` remonte au socle, où trois vues l'emploient.

**Ce qui ne se porte jamais** : la section « PANNEAU DE REVUE », explicitement marquée *hors produit* dans les maquettes. C'est l'outil qui pilote les états pour la vérification (`design/etats.json`), pas une partie de l'application.
