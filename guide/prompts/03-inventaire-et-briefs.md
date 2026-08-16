# Étape 3 — Inventaire des vues et briefs de conception

**Régime : agentique.** L'artefact pivot : celui qui franchit la frontière entre le monde du texte et le monde du rendu.

**Entrée** : livrable 01.
**Sortie** : livrable **02** + `inventaire-etats.json`.
**Critère de sortie** : préambule commun strictement identique en tête de chaque brief · états exhaustifs · contraintes de l'environnement cible.

> **C'est l'étape qui décide de tout ce qui suit.** Vérifiable sur le pilote : les briefs ont produit 35 maquettes, donc 335 états atteignables programmatiquement, donc l'intégralité du critère d'acceptation d'interface de l'exécution. Un brief faible ne produit pas une maquette faible — il produit **une absence de critère**, et l'agent d'exécution comble alors les vides avec ses priors.

> **Deux corrections du pilote sont portées ici.** M7 : les états étaient spécifiés en prose et dispersés dans 35 sections, il a fallu les consolider après coup pour en faire un critère. Et surtout : **le panneau de revue, qui a été l'invention la plus rentable du pilote, n'était pas prescrit — il en est sorti par chance.** Il devient ici une exigence.

---

## Le prompt

````markdown
Tu produis les briefs de conception d'interface à partir du cahier des charges ci-joint.

Chaque brief sera copié tel quel dans une conversation de génération de maquette. **Une
vue = un prompt.** Écris-les en pensant à cet usage : autonomes, denses, sans renvoi.

# Ce que tu produis, dans l'ordre

## § A — Contexte commun

À injecter **une fois** en tête de conversation. Il contient :

- Le produit en cinq lignes, avec son principe directeur.
- Les personas, avec leur attente **et ce qu'ils ne feront jamais**.
- **Les vocabulaires imposés**, recopiés à l'identique depuis le § 4.1 du cahier des
  charges. Recopiés, pas reformulés : la moindre variante ici produit une divergence
  qu'on découvrira des mois plus tard, au moment d'écrire une énumération en base.
- Les règles d'interface valables partout : confirmation des actions destructrices, états
  vides qui expliquent et proposent une sortie, actions interdites masquées ou désactivées
  avec explication, messages actionnables, langues, thèmes, accessibilité, densité.
- Le cadrage graphique : registre, couleur d'accent, hiérarchie, densité, bordures.

## § B — Coquille applicative

Le cadre permanent : navigation, en-tête, zone de contenu. Ses états. **Ses variantes selon
les droits** — une barre latérale doit rester lisible à 8 entrées comme à 20, et il faut
prévoir le cas où un groupe entier disparaît.

## § C — Inventaire des vues

Table `# | vue | priorité | densité`. Exhaustive.

**C'est ici que se révèlent les vues implicites** que les exigences ne mentionnent jamais :
paramètres, profil, écrans d'erreur globaux, onboarding, états de première utilisation.
Cherche-les activement : parcours chaque module du cahier des charges et demande-toi
« où l'utilisateur fait-il ça, et comment y arrive-t-il ? »

Termine par : *« si tu ne maquettes que cinq vues, prends les N, N, N, N et N »* — celles
qui portent l'essentiel de la difficulté de conception.

## § D — Points de conception transverses

Ce qui traverse toutes les vues, avec l'enjeu de chacun. C'est le mémo qu'on relit avant
chaque session de génération.

## Un brief par vue

Rubriques fixes, dans cet ordre :

| Rubrique | Contenu |
| --- | --- |
| **Objet** | Ce que l'utilisateur accomplit ici, en une phrase |
| **Utilisateurs** | Qui l'ouvre, à quelle fréquence |
| **Structure** | Découpage en zones, de haut en bas, avec la navigation entrante et sortante |
| **Données** | Ce qui est affiché, champ par champ |
| **Actions** | Ce que l'utilisateur peut déclencher, et ce qui se passe ensuite |
| **États** | Vide · chargement · erreur · nominal · droits insuffisants · cas limites |
| **Variantes** | Ce qui change selon le rôle ou le contexte |
| **Attention** | **Le piège de conception propre à cette vue** |

### Sur la rubrique « Attention »

Une à trois phrases qui nomment la difficulté réelle. Pas un rappel général — la chose
précise qui rendra cette vue ratée si on n'y prend pas garde.

> *« Une cellule peut contenir six informations de natures différentes, sur une grille de
> 20 lignes × 5 colonnes, sans devenir illisible. La réponse passe par la hiérarchie
> visuelle et les couches activables, pas par l'entassement. »*

C'est la rubrique la plus dense en valeur du brief. Si tu n'as rien à y mettre, relis la
vue : soit tu n'as pas compris sa difficulté, soit c'est une vue triviale et il faut le dire.

### Sur les états — la rubrique où tout se joue

**Les libertés de l'agent se prennent d'abord sur les états**, parce que personne ne les
spécifie spontanément. L'exhaustivité coûte ici moins cher qu'à tout autre moment du cycle.

Pour chaque état : **le texte exact affiché**, et **la sortie proposée**. Un état vide sans
texte rédigé sera inventé ; un état vide sans sortie est un cul-de-sac.

N'oublie jamais : la liste filtrée qui ne renvoie rien — différente de la liste vide, et
elle doit proposer de retirer les filtres · l'échec après un succès partiel, quand
l'écriture a abouti mais que le rafraîchissement a échoué · les permissions insuffisantes
sur une partie seulement de la vue.

### Sur les données d'exemple

Fournis un jeu **réaliste** dans le brief : noms plausibles, volumes plausibles, cas
limites présents. Jamais laissé à l'invention. Une maquette peuplée de « Lorem ipsum » et
de trois lignes ne révèle aucun des problèmes de densité qu'elle est censée révéler.

# Deux exigences que tu dois porter dans CHAQUE brief

## 1. L'environnement cible

Le brief borne la génération à **l'intersection** de ce qui existe dans l'outil de maquette
*et* dans la pile finale du projet. Sans cette borne, on valide des maquettes
intransposables — et on découvre au portage qu'il faut tout refaire.

Énonce : le format attendu, les bibliothèques autorisées, les interdits.

## 2. Le panneau de revue — exigence non négociable

**Chaque maquette embarque un panneau hors produit qui pilote ses états par appel de
fonction.**

C'est la clause la plus rentable de tout ce document, et voici pourquoi. Sans elle, les
états spécifiés existent en prose et se vérifient à l'œil, une fois, par la personne qui a
généré la maquette. Avec elle, **chaque état devient atteignable programmatiquement** —
donc capturable, donc comparable, donc opposable à l'implémentation des mois plus tard.
C'est ce qui transforme la maquette de illustration en **référence exécutable**.

Le brief doit exiger :

- un panneau visuellement distinct, marqué **hors produit**, exclu du rendu final ;
- **une fonction globale nommée par axe d'état** : `setState('loading')`, `setData('empty')`,
  `setRole('...')`, `setDays(n)` — nommées, pas anonymes, pour être appelables de l'extérieur ;
- un bouton par valeur, groupé par axe, avec une légende ;
- les axes universels : **thème clair/sombre** et **langue**.

Chaque axe du panneau doit correspondre à un état de la rubrique **États**. Un état
spécifié sans pilote est un état qu'on ne pourra pas vérifier.

# Ton

Télégraphique et dense. Ces briefs sont des prompts, pas de la prose. Les listes battent
les paragraphes. Chaque brief doit tenir en une page ou deux — au-delà, la vue est trop
grosse et doit être découpée.
````

---

## Sortie complémentaire — `inventaire-etats.json`

**Correction de M7.** Sur le pilote, les états étaient spécifiés en prose dans 35 sections ; il a fallu les extraire après coup pour en faire un critère d'acceptation. Le prompt produit désormais l'inventaire directement.

Demander, dans la même conversation :

````markdown
Produis maintenant `inventaire-etats.json` : pour chaque vue, la liste de ses états, avec
le pilote qui l'atteint, le texte attendu, et les EX-…/RG-… concernées.

{
  "07": {
    "titre": "Planning, vue Semaine",
    "axes": [
      { "axe": "État", "options": [
        { "pilote": "setState('normal')",  "libelle": "Nominal",     "attendu": "grille peuplée, ligne de synthèse visible" },
        { "pilote": "setState('loading')", "libelle": "Chargement",  "attendu": "« Chargement du planning… », squelette conservant la structure" },
        { "pilote": "setState('none')",    "libelle": "Aucune ressource", "attendu": "« Aucune ressource à afficher » + mention des filtres", "regles": ["RG-PLN-02"] }
      ]},
      { "axe": "Thème",  "options": [{ "pilote": "toggleTheme()", "libelle": "Sombre" }] },
      { "axe": "Langue", "options": [{ "pilote": "setLang('en')", "libelle": "English" }] }
    ]
  }
}

Ce fichier est le contrat entre les briefs et la vérification. Il doit couvrir tous les
états de toutes les rubriques « États ».
````

---

## Contrôles de sortie

- [ ] **Le § A est strictement identique** en tête de chaque brief, ou injecté une fois avec renvoi explicite. Test : diff des préambules, il doit être vide.
- [ ] **Les vocabulaires du § A sont identiques à ceux du § 4.1 du livrable 01.** Test : diff caractère à caractère. *C'est ce contrôle qui aurait évité M2 sur le pilote — deux vocabulaires divergents découverts juste avant la première migration.*
- [ ] **Chaque vue de l'inventaire a son brief**, et réciproquement.
- [ ] **Chaque brief a une rubrique « Attention » non vide.**
- [ ] **Chaque état a son texte exact et sa sortie.**
- [ ] **Chaque brief exige le panneau de revue**, avec la liste de ses axes.
- [ ] **`inventaire-etats.json` couvre tous les états de toutes les rubriques « États ».** Test : compter les états en prose, compter les entrées du JSON, comparer.
- [ ] **Couverture des exigences** : chaque `EX-…` du livrable 01 qui suppose une interface est rattachée à au moins une vue. Une exigence orpheline est soit une vue manquante, soit une exigence sans interface — et il faut savoir laquelle.
