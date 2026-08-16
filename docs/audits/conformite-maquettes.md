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

## 2. Contradictions entre sources gelées

Ni `mockups/` ni `cadrage/` ne se modifient par effet de bord d'une session.
Ces écarts se tranchent en amont, par décision humaine tracée.

### 2.1 « Cliquez une tâche » — vue 15

| Source | Texte |
| --- | --- |
| `mockups/15-projet-gantt.html:1549` | « Cliquez **une** tâche pour voir ses dépendances, double-cliquez pour les modifier. » |
| `cadrage/02-briefs-de-conception-par-vue.md:509` | « Cliquez **sur** une tâche pour voir ses dépendances, double-cliquez pour les modifier. » |

Ce n'est pas une coquille isolée : `mockups/09-planning-activite.html:1103`
porte « Cliquez le marqueur pour le faire évoluer », même tournure sans
préposition. C'est un parti pris de rédaction des maquettes.

**Porté** : le texte de la maquette, puisque c'est elle que mesure la boucle et
qu'elle fait loi dans cette campagne. **À arbitrer** : lequel des deux corpus
porte la rédaction contractuelle des textes d'aide.

### 2.2 `.form-card--wide` est inerte dans la maquette elle-même

`mockups/02-inscription.html` déclare `.form-card--wide{ max-width:400px; }`
en ligne 176, puis `.form-card{ width:100%; max-width:380px; }` en ligne 255.
Spécificité égale, la seconde règle est postérieure : **elle gagne**. La
variante large ne fait rien, dans la maquette, depuis toujours — alors qu'elle
est posée sur un élément (`class="form-card form-card--wide"`, ligne 533).

**À arbitrer** : la variante doit-elle valoir 400 px, ou disparaître ? Le
produit ne peut pas le décider — reproduire fidèlement veut dire reproduire
l'inertie, ce qui rend la classe inutile ; « corriger » veut dire changer le
rendu de la maquette gelée.

## 3. Manques au modèle de données

Un champ affiché depuis une valeur inventée côté client serait pire que son
absence. Le schéma ne se modifie pas dans une tâche de fonctionnalité
(`cadrage/04 § 5.3`) : il faut une tâche de schéma dédiée.

| Champ | Où la maquette l'affiche | État |
| --- | --- | --- |
| `siret` | `mockups/24-fiche-tiers.html` | absent de `schema.prisma` |
| `adresse` d'un tiers | `mockups/24-fiche-tiers.html` | présent (`schema.prisma:958`) |
| nature d'un client | maquettes 25–26 | à confirmer |
| budget cumulé | maquettes 24, 30 | `budgetHeures` existe (`schema.prisma:338`) — le **cumul** est à confirmer |

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
