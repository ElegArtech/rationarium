# Étape ⟲ — Contrôles de cohérence inter-documents

**Régime : agentique.** Se rejoue **à chaque fois qu'un artefact amont bouge**.

> **C'est l'étape qui manquait au pilote, et elle explique quatre manques sur huit.**
> M2 — vocabulaires divergents entre 01 et 02, découverts juste avant la première migration.
> M3 — « ≈ 125 permissions » annoncé, jamais énuméré ; 26 modèles de rôles nommés, jamais spécifiés.
> M4 — correction de contraste appliquée à 9 maquettes sur 35.
> M5 — accessibilité posée comme contractuelle, jamais mesurée.
>
> Aucun de ces quatre n'aurait survécu à une passe de contrôle. Chacun a été découvert au moment de l'implémenter, c'est-à-dire au pire moment.

Ce contrôle est **peu coûteux** : il est mécanique, il se lance en quelques minutes, et il ne produit pas de prose. Il n'a aucune raison de ne pas être joué systématiquement.

---

## Le prompt

````markdown
Tu vérifies la cohérence de la chaîne de cadrage. Tu ne corriges rien : tu produis un
rapport d'écarts.

Tu as accès à : le besoin, la business analysis, le cahier des charges (01), les briefs
(02), les maquettes, le socle technique (03), le plan de réalisation (04).

# Les sept contrôles

## C1 — Vocabulaires
Pour chaque énumération fermée du § 4.1 du livrable 01 : la retrouver partout ailleurs et
**comparer valeur par valeur**.

Cherche trois défauts :
- une valeur présente ici et absente là ;
- **deux libellés pour le même état** — le plus insidieux, parce que chaque document est
  cohérent avec lui-même ;
- une valeur employée dans une maquette et absente du § 4.1.

Signale aussi les **synonymes internes** : deux valeurs d'une même énumération qu'un
utilisateur ne saurait pas départager.

## C2 — Promesses chiffrées
Cherche tout nombre suivi d'un nom au pluriel : « environ 125 permissions », « 26 modèles
de rôles », « six formats d'import », « une quarantaine d'états vides ».

Pour chacun : **l'énumération exhaustive existe-t-elle quelque part ?**

Un nombre annoncé sans liste est un trou de spécification qui sera découvert au moment de
l'implémenter. Compte aussi les listes qui existent : si le document annonce 26 et que la
liste en contient 24, c'est un écart.

## C3 — Couverture
Dans les deux sens, et les deux sens comptent :

- Chaque `EX-…` qui suppose une interface est-elle rattachée à au moins une vue ?
  Une exigence orpheline est soit une vue manquante, soit une exigence sans interface — et
  il faut savoir laquelle.
- Chaque vue de l'inventaire couvre-t-elle au moins une exigence ?
  Une vue sans exigence est soit une exigence manquante, soit une vue inventée.

## C4 — États
Compare les états spécifiés en prose dans les briefs à ceux de l'inventaire lisible par
machine, et à ceux réellement pilotables dans les maquettes. Les trois nombres doivent
coïncider.

Un état spécifié mais non pilotable est un état qu'on ne pourra jamais vérifier sur
l'implémentation.

## C5 — Cohérence interne du jeu de maquettes
Extrais les jetons de style de chaque fichier et compare-les **deux à deux**.

Toute divergence est un défaut. Détermine lequel :
- une correction appliquée à certains fichiers seulement — cherche alors quelle valeur est
  la bonne, en calculant les contrastes si c'est une couleur ;
- une dérive de génération d'une conversation à l'autre.

Documente aussi **comment les fichiers se rapportent les uns aux autres** : indépendants,
cumulatifs, en lignées. Cette structure change tout au portage et elle n'est presque jamais
écrite.

## C6 — Exigences non fonctionnelles réellement mesurées
Pour chaque exigence non fonctionnelle du livrable 01 — accessibilité, performance,
impression, langues, thèmes : **existe-t-il une mesure, ou seulement une affirmation ?**

Une exigence contractuelle jamais mesurée est une dette qui grossit silencieusement. Là où
la mesure est possible tout de suite, lance-la : l'accessibilité et les contrastes se
mesurent sur les maquettes, sans attendre l'application.

## C7 — Affirmations techniques non vérifiées
Dans le livrable 03, distingue ce qui a été **éprouvé** de ce qui est tiré d'une note de
version.

Pour chaque affirmation non vérifiée qui porte une décision d'architecture : est-elle
inscrite au registre des risques avec une manipulation qui la testera ? Sinon, c'est un
pari non assumé.

# Ce que tu rends

Un rapport, sans correction :

## Écarts
| # | Contrôle | Écart | Documents | Gravité | Ce qu'il coûte s'il n'est pas traité |

**Gravité selon le moment où l'écart se découvrira**, pas selon sa taille apparente :
- **bloquant** — se découvrira au moment d'écrire du code fondateur, schéma de base ou
  contrat partagé ;
- **coûteux** — se découvrira en cours d'implémentation et exigera un rattrapage ;
- **mineur** — se découvrira à la relecture, sans conséquence.

Un vocabulaire divergent est bloquant, même s'il ne porte que sur deux mots : il fixe une
énumération en base.

## Ce que je n'ai pas pu vérifier
Ton autocritique. Les contrôles que tu n'as pas su mener, et pourquoi.
````

---

## Quand le rejouer

| Événement | Contrôles à rejouer |
| --- | --- |
| Le livrable 01 change | C1, C2, C3, C6 |
| Les briefs changent | C1, C3, C4 |
| Une maquette est modifiée | C4, C5, C6 |
| Le socle technique change | C7 |
| Avant d'ouvrir la première vague d'exécution | **Tous** |
| Après chaque diff retour venu de l'implémentation | C1, C2, C3 |

---

## Contrôles de sortie

- [ ] **Les sept contrôles ont été menés**, ou leur impossibilité est motivée.
- [ ] **Chaque écart porte sa gravité**, établie sur le moment où il se découvrirait.
- [ ] **Aucun écart bloquant ne subsiste** avant d'ouvrir l'exécution.
- [ ] **Le rapport ne corrige rien.** Les corrections sont des décisions humaines, portées séparément et tracées.
