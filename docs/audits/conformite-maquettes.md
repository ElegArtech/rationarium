# Conformité de rendu — ce que la mesure a fait remonter

Registre des découvertes faites en portant les vues à zéro écart contre les
maquettes gelées. **Rien ici n'est tranché.** Ces points modifient l'amont
(`cadrage/04 § 8.4`) ou exigent une tâche dédiée ; ils sont consignés pour
qu'ils cessent de ne vivre que dans une conversation.

## 1. La mesure n'existait pas

`pnpm ui:diff` sortait en zéro sans jamais comparer. La « conformité de rendu »
a donc été déclarée pour 35 vues sur un contrôle vide, pendant tout le projet.

Corrigé : `scripts/ui-conformite.mjs` compare réellement, `ui-diff` lui délègue,
et `apps/web/e2e/conformite.e2e.spec.ts` tient le contrôle du contrôle — aucune
vue n'échappe à la boucle sans que ce soit écrit, la phrase qui masquait le
défaut ne peut pas réapparaître, et l'exclusion d'inertie ne peut pas devenir
une liste d'exceptions nommées.

**Ce qu'il en reste pour l'amont** : la définition de terminé de `CLAUDE.md`
exigeait « conformité de rendu » sans dire contre quoi ni comment. Une exigence
dont le contrôle n'existe pas est une exigence qui se déclare tenue.

## 2. Écarts entre sources gelées

Ni `mockups/` ni `cadrage/` ne se modifient par effet de bord d'une session.
Mais **tout écart mesurable n'est pas une décision** : un contrôle qui compare
les textes à la lettre voit une préposition, ce qui n'en fait pas un sujet.
Confondre « mesurable » et « arbitrable » remplit le bureau de qui décide et
noie ce qui compte vraiment.

Ne remonte donc ici comme **décision** que ce qui change le produit. Le reste
est tranché, et consigné pour mémoire.

### 2.1 « Cliquez une tâche » — vue 15 · **tranché, pour mémoire**

| Source | Texte |
| --- | --- |
| `mockups/15-projet-gantt.html:1549` | « Cliquez **une** tâche pour voir ses dépendances, double-cliquez pour les modifier. » |
| `cadrage/02-briefs-de-conception-par-vue.md:509` | « Cliquez **sur** une tâche pour voir ses dépendances, double-cliquez pour les modifier. » |

Ce n'est pas une coquille isolée : `mockups/09-planning-activite.html:1103`
porte « Cliquez le marqueur pour le faire évoluer », même tournure sans
préposition. C'est un parti pris de rédaction des maquettes.

**Tranché** : le texte de la maquette. Elle fait loi, c'est elle que mesure la
boucle, et une préposition ne change ni la structure, ni le sens, ni le
comportement. Aucune décision n'est demandée.

Ce qui vaudrait d'être noté un jour, sans urgence : lequel des deux corpus
porte la rédaction contractuelle des textes d'aide. À traiter lors d'une
relecture d'ensemble, pas à l'unité.

### 2.2 `.form-card--wide` est inerte dans la maquette elle-même · **tranché, pour mémoire**

`mockups/02-inscription.html` déclare `.form-card--wide{ max-width:400px; }`
en ligne 176, puis `.form-card{ width:100%; max-width:380px; }` en ligne 255.
Spécificité égale, la seconde règle est postérieure : **elle gagne**. La
variante large ne fait rien, dans la maquette, depuis toujours — alors qu'elle
est posée sur un élément (`class="form-card form-card--wide"`, ligne 533).

**Tranché** : l'inertie est reproduite. La règle est annulée dans la maquette
elle-même, donc la porter ou non ne change **aucun pixel** — le rendu est
identique dans les deux cas. Aucune décision n'est demandée.

À signaler seulement si la maquette est un jour dégelée : la variante large ne
fait rien depuis l'origine, et son auteur voulait probablement 400 px.

### 2.3 « Tâche supprimée » — vue 17 · **DÉCISION ATTENDUE**

C'est le seul écart de conformité qui reste, et il ne se ferme par aucune
correction de code. Les deux sources gelées se contredisent :

| Source | Ce qu'elle dit |
| --- | --- |
| `cadrage/02:566` | *Tâche prérequise supprimée* : « Tâche supprimée » (l'entrée reste visible) |
| `cadrage/01:413` (`RG-TSK-07`) | Une tâche **dont d'autres dépendent** ne peut pas être supprimée |
| `schema.prisma`, `TaskDependency.prerequis` | `onDelete: Restrict` — la base le garantit |

La première décrit un état ; les deux autres garantissent qu'il ne peut pas
se produire. **La donnée est interdite par construction.**

Ce qui a été fait, et qui est acquis : l'entrée d'un prérequis **non lisible**
— confidentiel ou hors périmètre — garde sa ligne, atténuée, sans titre.
`is-gone` a donc désormais un déclencheur réel et éprouvé, alors que la classe
était inerte. Le trou de cloisonnement trouvé en chemin est fermé (§ 4).

Ce qui reste ouvert, et pourquoi il ne se tranche pas ici :

1. **Écrire « Tâche supprimée » sur une tâche seulement invisible serait
   faux**, et laisserait croire qu'un travail a été détruit. Un message se
   rédige et il est actionnable (`RG-GEN-03`) ; celui-là serait mensonger.
2. **La boucle mesure sous le compte ADMINISTRATEUR.** Rien ne lui est
   masqué : l'état existe dans le produit, il ne se produit pas sous ses yeux.
   `cadrage/02 § D.3` exige pourtant que chaque vue soit crédible en « droits
   minimaux » **et** en « administrateur » — la boucle ne couvre que la
   seconde variante, sur les trente-cinq vues.

Trois issues possibles, toutes des décisions :

- **retirer l'état du cadrage**, puisque le modèle l'interdit ;
- **prévoir une suppression logique des tâches**, ce qui change `RG-TSK-07` ;
- **mesurer certaines vues en droits minimaux**, ce qui comblerait la variante
  manquante de `§ D.3` — au prix d'écarts attendus sur tout ce que `RG-GEN-06`
  masque légitimement à un lecteur restreint. La passe restreinte n'aurait
  donc pas le même critère que la passe administrateur.

## 3. Manques au modèle de données

Un champ affiché depuis une valeur inventée côté client serait pire que son
absence. Le schéma ne se modifie pas dans une tâche de fonctionnalité
(`cadrage/04 § 5.3`) : il faut une tâche de schéma dédiée.

| Champ | Où la maquette l'affiche | État |
| --- | --- | --- |
| `siret` | `mockups/24-fiche-tiers.html` | **absent**, et non bloquant : le comparateur le classe en contenu de démonstration |
| `adresse` d'un tiers | `mockups/24-fiche-tiers.html` | **ajouté** — tâche de schéma du 2026-08-17 |
| rôle d'un rattachement | `mockups/24-fiche-tiers.html` | **ajouté** sur `ProjectThirdParty`, pas sur le tiers : le rôle varie d'un projet à l'autre |
| nature d'un client | maquettes 25–26 | **ajouté** — `Client.nature`, avec son vocabulaire au contrat |
| auteur d'une saisie | `mockups/21-temps-passe.html` | **ajouté** — `TimeEntry.creeParId` |
| budget cumulé | maquettes 24, 30 | `budgetHeures` existe (`schema.prisma:338`) — le **cumul** reste à confirmer |

## 4. Ce que la mesure a trouvé et qui n'était pas du rendu

Le motif s'est répété assez pour valoir règle : **une classe manquante sur
l'écran a désigné treize capacités serveur absentes**, pas des défauts de
style.

Les deux plus graves, toutes deux vertes sur toutes leurs boucles :

- **Le module de congés était inutilisable.** Rien n'écrivait jamais
  `leaveBalance`, donc `RG-CNG-20` refusait chaque demande. Une règle qui
  refuse tout est une règle qui passe tous ses tests de refus.
- **« Générer les assignations » n'avait jamais rien à générer.**

Deux modules — activité, tiers — n'avaient **aucun** test d'intégration.

**Ce qu'il en reste pour l'amont** : la chaîne `EX-…` → vue → lot → tâche →
commit était vraie dans le sens descendant. Elle ne l'était pas dans l'autre :
rien ne vérifiait qu'une capacité déclarée était **atteignable depuis une vue**.

## 5. Le jeu de données de démonstration

`peuplerMaquette()` a vécu plusieurs lots **exporté et jamais appelé**. Il ne
s'appliquait qu'à la main, donc pas deux fois de la même façon, et la boucle de
conformité mesurait un état que personne ne pouvait recréer.

Corrigé : commande `db:maquette`, idempotente.

Il lui manquait quatre états que les maquettes dessinent — aucune tâche
« Bloqué » ni « En revue », aucune priorité « Basse » ni « Critique » sur le
projet que mesurent les vues 11, 13 et 15, et aucun projet annulé, donc
`is-cancelled` sans source et le filtre « Annulés » du portefeuille toujours
vide.

**La leçon, pour toute campagne de conformité** : un état que la maquette
dessine mais qu'aucune donnée ne porte rend la classe inerte et le libellé
absent. La vue paraît incomplète alors que c'est le jeu de données qui l'est —
et l'agent qui « corrige » la vue invente du balisage.
