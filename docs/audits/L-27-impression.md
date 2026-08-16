# L-27 — Impression et export PDF

**Périmètre** : le planning semaine (vue 07), la grille d'activité (vue 09), les
rapports (vue 30). `cadrage/01 § 7` — *« le planning et la grille d'activité
disposent d'une mise en page imprimable »* — et `EX-RPT-03`, qui demande un
export PDF des rapports.

## Le PDF passe par l'impression, et c'est une décision

`EX-RPT-03` demande « PDF, Excel ou JSON ». La question a été laissée ouverte au
L-22 ; elle se referme ici.

**Le produit n'engendre pas de PDF côté serveur.** Il imprime, et le navigateur
produit le PDF. Deux motifs, et le second est le plus fort :

1. Une bibliothèque de génération PDF demanderait un ADR au titre de `C1` et
   d'`ADR-0013`, pour un résultat que le navigateur donne déjà.
2. Surtout : **un second chemin de mise en page ferait diverger deux rendus du
   même contenu.** C'est le genre d'écart qu'on ne découvre qu'en comparant
   deux documents datés du même jour, et qui coûte alors la confiance dans les
   deux.

## Ce que l'audit a trouvé

### Les feuilles d'impression visaient des classes inexistantes — **corrigé**

Les maquettes nomment la barre latérale `.side` et la zone de contenu `.main`.
La coquille portée au L-05 les a nommées `.sidebar` et `.contenu`. Les blocs
`@media print` recopiés depuis les maquettes visaient donc **le vide** : la
barre latérale et l'en-tête s'imprimaient sur chaque feuille.

> **Rien ne pouvait le voir.** Un sélecteur CSS qui ne correspond à aucun
> élément ne produit ni erreur, ni avertissement, ni test rouge. Il est
> simplement inerte. Seule l'émulation du média d'impression le révèle — d'où
> `impression.e2e.spec.ts`, qui exerce la feuille au lieu de constater qu'elle
> existe.

Le défaut vivait dans la vue 09 depuis le L-37 : sa feuille d'impression était
consignée comme livrée, et elle ne masquait rien.

### Le planning n'avait aucune mise en page imprimable — **corrigé**

`cadrage/01 § 7` l'exige au même titre que la grille d'activité. La maquette 07
ne porte pourtant que le bloc d'impression du socle — lui-même **jamais porté**.
La mise en page est donc construite par analogie avec celle de la vue 09, et
l'écart est consigné en `DESIGN.md`.

Trois décisions, chacune répondant à une question que l'impression pose et que
l'écran ne pose pas :

| Décision | Motif |
| --- | --- |
| Feuille **paysage** | Sept colonnes de jours plus la colonne des ressources ne tiennent pas en portrait |
| Les couleurs deviennent des **filets** | Une imprimante de service est en noir et blanc : un statut porté par la seule couleur disparaît |
| Le cadre défilant **se déplie** | `max-height` et `overflow` sont des notions d'écran ; sur papier elles coupent la grille à la première page |

### Le bloc d'impression du socle n'avait jamais été porté — **corrigé**

`.toasts`, `.skip`, `.hcard`, `.pop`, `.scrim-modal`, `.drawer` : tout ce qui
n'existe qu'à l'écran s'imprimait. Le socle le prévoyait ; il n'était pas là.

## Ce que l'audit confirme

- **L'en-tête d'impression n'existe qu'à l'impression.** À l'écran, la barre
  d'outils dit déjà la période ; sur papier, une feuille sans période est
  inexploitable dès qu'elle a quitté la main de qui l'a imprimée.
- **Le jour courant garde une marque** quand il perd sa couleur — un `•` après
  le numéro.
- **`RG-RPT-02` tient sur papier** : le troncage à dix projets reste annoncé,
  et c'est là qu'il compte le plus, puisqu'on ne peut plus faire défiler pour
  constater qu'il manque des projets.
- **Les adresses ne sont pas déployées après les liens.** Sur un planning, une
  URL par cellule couvrirait la grille de texte illisible.

## Ce qui reste ouvert

- **Aucune impression réelle n'a été faite.** L'émulation du média rend les
  règles applicables et mesurables ; elle ne dit rien du rendu d'une imprimante
  physique, des marges réelles, ni des sauts de page sur une grille de vingt
  lignes. Un essai sur l'imprimante du service reste à faire, et il ne peut pas
  se simuler.
- **Les sauts de page ne sont pas pilotés** au-delà de `break-inside: avoid` sur
  les panneaux de rapport. Une grille longue se coupera où le navigateur le
  décide.
