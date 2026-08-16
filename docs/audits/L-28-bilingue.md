# L-28 — Audit bilingue et formats

**Périmètre** : les 1 794 clés des deux catalogues, les formats de date et
d'heure (`RG-GEN-09`), et la contrainte de largeur de `cadrage/02 § D.7` —
*« prévoir des libellés anglais 30 % plus longs : aucune largeur calée sur le
français »*.

## Ce que l'audit a trouvé

### 1. LE PARAMÉTRAGE D'AFFICHAGE N'ÉTAIT APPLIQUÉ NULLE PART — **corrigé**

C'est le défaut principal du lot, et il était invisible à toutes les boucles.

La vue 31 offre cinq formats de date, trois formats d'heure, un premier jour de
semaine et une liste de jours visibles. Ils étaient **enregistrés, relus,
affichés dans l'interface, contrôlés par des tests** — et ils n'agissaient sur
rien. Un utilisateur qui choisissait « AAAA-MM-JJ » voyait toujours
« 01/03/2026 ».

`RG-GEN-09` dit pourtant : *« les formats de date et d'heure suivent le
paramétrage global »*. `RG-PLN-03` dit de même pour les jours visibles.

> **Un test qui vérifie qu'un réglage s'enregistre ne dit rien de ce qui
> compte : qu'il change quelque chose.** Les contrôles de la vue 31 étaient
> verts, complets, et portaient sur la moitié inutile du problème.

Le correctif tient en trois pièces :

| Pièce | Rôle |
| --- | --- |
| `appliquerReglages()` dans `formats.ts` | Les réglages sont **poussés**, pas cherchés : une fonction de formatage appelée des centaines de fois par rendu de grille ne peut pas déclencher de requête |
| La coquille attend le paramétrage | Les fonctions de formatage lisent un module et non un état React : un réglage arrivé après coup ne provoquerait aucun nouveau rendu, et rendre puis corriger produirait un clignotement de format |
| `retry: false` sur cette requête | Le paramétrage n'est pas une condition de service. En cas de panne, le produit garde ses défauts corrects plutôt que de refuser de servir |

Quatre cas limites que le correctif traite explicitement, parce que chacun
produisait un affichage faux plutôt qu'une erreur :

- `MM/JJ/AAAA` ne s'exprime pas en options `Intl` : il se construit à partir des
  **parties** rendues par `Intl`, jamais par découpage de chaîne. C'est le
  format le plus dangereux du lot — « 03/01 » se lit 3 janvier ou 1er mars selon
  le lecteur —, et le proposer impose de le rendre juste.
- Minuit et midi en format 12 heures : `00:00` n'est pas « 00:00 AM », et
  `12:00` n'est pas « 00:00 PM ».
- Un réglage `planning.visibleDays` **vide** donnait « dimanche seulement » —
  `Number("")` vaut zéro. Le filtre porte désormais sur la chaîne.
- `i18next.language` est indéfini avant l'initialisation : le défaut français
  est explicite plutôt que subi.

### 2. Neuf règles de pluriel françaises dans le catalogue anglais — **corrigé**

`{n, plural, =0 {user} one {user} other {users}}` : le cas zéro suivait la règle
**française**, où « 0 utilisateur » est correct. En anglais, zéro prend le
pluriel — « 0 users ». Neuf clés étaient concernées, sur cinq espaces de noms.

C'est le miroir exact d'un piège déjà consigné en sens inverse (« le pluriel
français de zéro »), et il montre que la parité de clés ne dit rien de la
justesse des règles.

### 3. Les heures s'affichaient sans passer par le formateur — **corrigé**

Six endroits interpolaient `{tache.heureDebut}` directement. Tant que le seul
format était `HH:MM`, cela ne se voyait pas ; dès que le format 12 heures
devient possible, ces six endroits mentent.

## Ce que l'audit confirme

- **Parité complète** : 1 794 clés, aucune orpheline, aucune manquante.
  `i18n:check` le tient à chaque boucle.
- **102 valeurs identiques en français et en anglais**, toutes examinées : ce
  sont des cognates légitimes — *Actions*, *Date*, *Type*, *Module*, *Total*,
  *Notifications* — ou des chaînes purement interpolées. Aucune traduction
  oubliée.
- **Aucun libellé tronqué en anglais** sur les surfaces dont la largeur est
  contrainte : navigation, boutons, surtitres, titres de panneaux, couches
  d'affichage. Les cellules de grille sont exclues : leur troncature est
  **assumée**, avec `text-overflow: ellipsis` et le contenu complet dans le
  libellé d'assistance.
- **Le choix de langue survit à la navigation**, et l'attribut `lang` suit.

## Ce qui reste ouvert

- **La qualité des traductions n'est pas auditée.** Ce lot vérifie la parité,
  les règles de pluriel et les largeurs. Il ne dit pas si « Third party » est le
  terme qu'emploierait une collectivité anglophone — cela demande un relecteur,
  pas un contrôle.
- **Les formats régionaux au-delà de deux locales.** `fr-FR` et `en-GB` sont
  câblés ; une instance qui voudrait `en-US` — où la date est en MM/JJ par
  défaut — passerait par le réglage global, ce qui fonctionne, mais la locale
  de `Intl` resterait britannique pour les nombres.
