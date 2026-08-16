# Étape 2 — Cahier des charges fonctionnel

**Régime : agentique.** Le document devient la **référence fonctionnelle unique** : toute demande ultérieure s'apprécie par rapport à lui.

**Entrée** : `besoin.md` + `ba.md`.
**Sortie** : livrable **01**.
**Critère de sortie** : chaque exigence est vérifiable, chaque règle est opposable, chaque vocabulaire est défini une seule fois.

> **Ce prompt porte la correction de M3** — la promesse chiffrée sans artefact. Sur le pilote, « ≈ 125 permissions » a été annoncé et jamais énuméré ; 26 modèles de rôles ont été nommés et leur contenu jamais spécifié. Les deux trous étaient au cœur du cloisonnement, et ils ont été découverts au moment de les implémenter.

---

## Le prompt

````markdown
Tu produis le cahier des charges fonctionnel à partir du besoin et de la business analysis
ci-joints.

# Ce que ce document est

La **référence fonctionnelle unique** du projet. Il dit ce que le produit doit faire,
indépendamment de toute technologie. Il servira à trois choses : chiffrer, construire,
recetter. Écris-le en pensant aux trois.

**Il ne contient aucun choix technique.** Pas de framework, pas de schéma de base, pas
d'architecture. Si tu te surprends à écrire « une table », « un cache », « une API »,
tu as glissé : reformule en termes de comportement observable.

# Les deux mécaniques portantes

## Identifiants atomiques

Chaque capacité attendue reçoit un identifiant `EX-<MODULE>-<n>`.
Chaque contrainte de comportement reçoit un identifiant `RG-<MODULE>-<n>`.

Ces identifiants seront cités dans les tests, les commits et les contrats de tâche. Ils
sont donc **stables** : on n'en renumérote jamais un, on en ajoute.

**Règle de découpe, et c'est un critère de qualité :** si on ne peut pas vérifier
mécaniquement qu'une exigence est satisfaite — par un test, une commande, une assertion,
une comparaison de rendu —, elle est mal découpée. Redécoupe-la.

Mauvais : `EX-PRJ-01 — Gérer les projets`
Bon : `EX-PRJ-01 — Consulter le portefeuille en cartes, avec compteur et compteur filtré`

## Rédaction des règles

Une règle dit **ce qui est refusé et avec quel message**, pas seulement ce qui est permis.
Les messages destinés à l'utilisateur sont **écrits littéralement** : ils sont
contractuels, et ils seront vérifiés à la lettre.

Mauvais : `RG-AUTH-02 — Le message d'erreur doit être générique.`
Bon : `RG-AUTH-02 — Le message d'échec ne distingue jamais « identifiant inconnu » de
« mot de passe erroné ».`

# Structure attendue

## 0. Nature du document
Ce qu'il est, ce qu'il n'est pas, comment le lire. Trois paragraphes.

## 1. Contexte et objectifs
Le besoin en une page · le principe directeur en une phrase encadrée · les objectifs
mesurables sous forme de table objectif → indicateur observable · les contraintes
structurantes.

**Le principe directeur mérite qu'on s'y arrête.** Une phrase, qui dit ce que le produit
réconcilie ou résout. Elle sera citée dans tous les documents suivants et servira à
trancher les cas limites. Si tu n'arrives pas à l'écrire, le périmètre n'est pas mûr.

## 2. Périmètre
Modules numérotés `M1…Mn`, une ligne de rôle chacun. Puis **hors périmètre**, explicite
et nominatif.

## 3. Acteurs
**Personas nommés**, avec ce qu'ils attendent et ce qu'ils ne feront jamais. Une persona
qui n'ouvrira jamais un rapport est une information de conception majeure.

Puis le modèle de droits, s'il y en a un.

## 4. Dictionnaire des objets métier
Table objet → définition → attributs porteurs de sens.

### 4.1 Vocabulaires — section critique

**Chaque énumération fermée est définie ici, une seule fois, exhaustivement.** Statuts,
priorités, niveaux, catégories, types.

Deux règles :
- **Un vocabulaire par notion.** Deux échelles divergentes selon les écrans rendent les
  filtres et les rapports incomparables.
- **Aucun synonyme.** Deux libellés pour le même état produisent des données
  inexploitables. Relis ta liste en te demandant, pour chaque paire : un utilisateur
  saurait-il dire laquelle choisir ? Si non, il y en a une de trop.

## 5. Spécifications par module
Pour chaque module : table des exigences `EX-…`, puis les règles `RG-…` groupées par
thème quand elles sont nombreuses.

## 6. Règles transverses
Ce qui s'applique partout : confirmation des actions destructrices, états vides, états de
chargement, actions interdites masquées plutôt que refusées, gestion de la concurrence,
traduction, formats.

## 7. Exigences non fonctionnelles
Disponibilité, performance **avec des budgets chiffrés**, volumétrie cible, accessibilité,
traçabilité, confidentialité, réversibilité, impression.

Un budget non chiffré n'est pas une exigence. « Rapide » ne se recette pas ; « le planning
d'un service sur une semaine s'affiche en moins de 2 s » se recette.

## 8. Partis pris de conception
**La section la plus rentable du document.** Les orientations qui structurent l'ensemble
et priment sur toute interprétation locale. Chacune avec sa justification.

Un parti pris élimine une classe entière de divergences en amont, au lieu de les arbitrer
une par une en aval. Exemples de la forme attendue :

> **Un seul système de droits** : permissions atomiques regroupées en modèles de rôles,
> sans catégorie privilégiée hors de ce mécanisme.
> *Justification : deux mécanismes concurrents rendent les droits impossibles à auditer.*

> **Toute limite fonctionnelle est un paramètre d'administration**, jamais une valeur figée.
> *Justification : l'organisation doit pouvoir ajuster ses seuils sans livraison.*

Vise huit à douze partis pris. Moins, tu n'as pas assez tranché ; plus, tu descends dans
le détail d'implémentation.

## 9. Ce qui reste à arbitrer
Les points qui relèvent de la maîtrise d'ouvrage. Pour chacun : **ce qu'il bloque**, et
**quelle serait la valeur par défaut** si personne ne tranchait. Un point ouvert sans
valeur par défaut bloque le projet ; avec, il ne bloque que ce qu'il concerne vraiment.

# Interdits de rédaction

- **Aucune promesse chiffrée sans artefact.** Si tu écris « environ 125 permissions »,
  tu produis la liste des 125, en annexe. Si tu nommes 26 modèles de rôles, tu donnes le
  contenu des 26. **Un nombre annoncé sans énumération est un trou de spécification qui
  sera découvert au moment de l'implémenter**, c'est-à-dire au pire moment. Si la liste
  est trop longue pour le corps du document, elle va en annexe — jamais nulle part.
- Aucun choix technique.
- Aucun « etc. », aucun « … » dans une énumération fermée.
- Aucune règle qui ne dise pas ce qui se passe quand elle est violée.

# Ton
Sobre, dense, sans remplissage. Des tables partout où l'information est tabulaire. Une
phrase qui n'apporte rien est une phrase à supprimer : le document sera lu des dizaines de
fois, chaque mot inutile coûte à chaque lecture.
````

---

## Contrôles de sortie

Fais exécuter ces contrôles par un agent distinct de celui qui a rédigé.

- [ ] **Chaque `EX-…` est mécaniquement vérifiable.** Test : formuler pour chacune la commande ou l'observation qui prouverait qu'elle est satisfaite. Celles pour lesquelles c'est impossible sont à redécouper.
- [ ] **Chaque `RG-…` dit ce qui se passe en cas de violation.**
- [ ] **Aucune promesse chiffrée sans énumération.** Test : chercher tous les nombres suivis d'un nom au pluriel (« 125 permissions », « 26 modèles », « 6 formats »). Chacun doit renvoyer à une liste exhaustive.
- [ ] **§ 4.1 sans synonymes.** Test : pour chaque paire de valeurs d'une même énumération, un utilisateur saurait-il dire laquelle choisir ?
- [ ] **Aucun choix technique.** Test : chercher les noms de technologies, de structures de données, de protocoles.
- [ ] **Chaque exigence non fonctionnelle est chiffrée** ou explicitement qualitative avec un moyen de la constater.
- [ ] **Chaque point ouvert du § 9 porte ce qu'il bloque et sa valeur par défaut.**
- [ ] **Couverture du besoin** : chaque élément de `besoin.md` et de `ba.md` se retrouve dans le cahier des charges, ou son absence est justifiée en hors-périmètre.
