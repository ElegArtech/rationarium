# Étape 6 — Plan de réalisation agentique

**Régime : agentique.** Dit **comment** on construit : harnais, découpage, orchestration, vérification.

**Entrée** : livrables 01, 02, 03 + maquettes gelées.
**Sortie** : livrable **04**.
**Critère de sortie** : un agent qui lit 01 à 04 et le harnais peut ouvrir le premier lot sans rien deviner.

---

## Le prompt

````markdown
Tu produis le plan de réalisation à partir des trois livrables précédents et des maquettes
gelées. Tu suis le cycle de vie décrit dans la note de méthode jointe.

# Ce que ce document est

Il dit comment on construit : dans quel ordre, sous quelles contraintes de méthode, avec
quelles capacités agentiques, et selon quels critères on décide qu'une chose est faite.

**Ce n'est pas un planning en dates ni un chiffrage.** Il fixe un ordre, des dépendances
et des critères de sortie.

# Structure attendue

## 1. Ce que le cycle impose
Les principes de méthode repris de la note, chacun avec **ce qu'il élimine**. Un principe
qui n'élimine aucune manière de travailler est un principe décoratif.

## 2. Où en est le cadrage
Table de correspondance `artefact du cycle | équivalent dans ce dépôt | état`.

C'est la section qui empêche de refaire ce qui existe et de sauter ce qui manque. Sois
franc sur les manques : un artefact absent qu'on ne peut pas produire honnêtement — parce
qu'il consignerait un arbitrage qui n'a pas eu lieu — se **constate**, il ne se rétro-écrit
pas.

## 3. Le harnais permanent
Tout ce qui contraint l'agent **sans figurer dans la tâche**. C'est le préalable absolu à
toute délégation.

Décris l'arborescence cible et le contenu attendu de chaque pièce :
- le contrat permanent : sources de vérité, commandes, interdits structurels, définition de
  terminé, pièges connus, convention de commit ;
- les règles à portée de chemin, qui ne chargent que quand l'agent touche les fichiers visés ;
- les ADR, un par décision, **au format prescriptif** — chacun portant une rubrique « ce qui
  est désormais interdit », qui est la partie réellement lue à chaque session ;
- le contrat de style, extrait des maquettes par relevé et non par rédaction ;
- l'inventaire des états, lisible par machine ;
- les gardes mécaniques, qui tiennent ce qui ne doit jamais dépendre d'un jugement.

**Puis les boucles de vérification rapides**, une table `commande | ce qu'elle garantit |
budget de temps`. La qualité de la délégation est proportionnelle à leur vitesse : une
boucle lente est une boucle que l'agent contournera.

## 4. L'outillage agentique
Table `capacité | ce qu'elle apporte | emploi dans ce projet | réserve`.

**La colonne « réserve » est la plus utile.** Une capacité présentée sans ses limites sera
employée là où elle ne convient pas.

Puis la correspondance **criticité → mode d'exécution → capacités autorisées**, avec ses
interdits. Cette règle s'inscrit au contrat de tâche et ne se renégocie pas en cours
d'exécution.

## 5. Le découpage
Lots en tranches verticales, chacun livrant un comportement complet de bout en bout.
Table `lot | contenu | modules | vues | criticité | dépend de | vague`.

Trois règles de découpe :
1. **Un lot se vérifie.** S'il n'existe pas de démonstration mécanique qu'il est livré, il
   est mal découpé.
2. **Un lot est étanche dans sa vague.** Deux lots simultanés ne modifient jamais les mêmes
   fichiers.
3. **Les exigences transverses sont dans la définition de terminé de chaque lot**, pas
   reportées en fin de projet. Une vague d'audit final **balaie et constate** ; elle n'est
   jamais la première prise en compte.

**Nomme et justifie tout écart au découpage vertical.** Le modèle de données produit
globalement en est un, presque toujours nécessaire, et il doit être assorti de sa
contrepartie : toute évolution ultérieure du schéma passe par une tâche dédiée, garantie
par un garde-fou et non par une consigne.

## 6. Criticité, contrat de tâche, gate
La grille de criticité **fermée** du projet. Le gabarit du contrat de tâche. Les quatre
questions du gate.

## 7. La boucle d'exécution
Ouverture de vague, ouverture de lot, boucle de tâche, clôture.

**La boucle de conformité d'interface mérite un traitement propre.** Une comparaison au
pixel entre une maquette autonome et une application réelle produit un flot de faux
positifs — polices, lissage, données d'exemple, barres de défilement. Propose une approche
à étages : mécanique et bloquant sur ce qui est comparable sans ambiguïté ; jugé et non
bloquant sur la hiérarchie visuelle ; strict en non-régression, implémentation contre
elle-même.

## 8. La vérification
L'ordre de revue — spec, puis honnêteté des tests, puis diff — et la profondeur par
criticité. **La profondeur est fonction de la criticité, jamais du track record récent** :
c'est la parade à la dérive qui naît des séries de succès.

Puis le diff retour : ce que l'implémentation fait émerger et que les specs n'avaient pas
prévu, remonté systématiquement.

## 9 à 12. Capitalisation · risques · traçabilité · instrumentation
La capitalisation, avec ses trois destinations selon la nature de l'apprentissage.
Les risques propres à l'exécution agentique, avec leur parade **structurelle**.
La chaîne de traçabilité de bout en bout et la convention de commit qui la porte.
L'instrumentation : ce qu'on mesure pour répondre aux points ouverts de la méthode.

## 13 et 14. Prérequis et amorçage
Les arbitrages bloquants, avec ce que chacun bloque. Les prérequis techniques, **avec leur
état constaté** — pas supposé. Puis la séquence d'amorçage, étape par étape.

# Ton
Prescriptif. Ce document sera lu par un agent qui doit pouvoir agir sans interpréter.
````

---

## Contrôles de sortie

- [ ] **Chaque lot a un critère de sortie mécaniquement vérifiable.**
- [ ] **Le graphe de dépendances est acyclique**, et chaque vague est réellement parallélisable — deux lots simultanés ne partagent aucun fichier.
- [ ] **Chaque capacité agentique porte sa réserve d'emploi.**
- [ ] **Aucune étape du plan ne dépend d'une capacité expérimentale.**
- [ ] **La grille de criticité est fermée** et couvre tous les lots.
- [ ] **Les prérequis techniques portent leur état constaté**, vérifié sur la machine — pas leur état supposé.
- [ ] **Chaque arbitrage bloquant dit ce qu'il bloque**, et à quelle échéance il doit être rendu.
- [ ] **Test de suffisance** : un agent qui ne lit que les livrables 01 à 04 et le harnais peut-il ouvrir le premier lot sans rien deviner ? Si non, ce qui manque est à ajouter au harnais, pas à la conversation.
