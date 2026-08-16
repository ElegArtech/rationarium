# Étape 1 — Business analysis

**Régime : agentique.** Draft par agent, arbitrage humain ligne à ligne.

**Le maillon qui manquait au pilote (M1).** Son absence n'a rien cassé — mais elle est irrattrapable : on ne rétro-écrit pas un arbitrage qui n'a pas eu lieu. Une business analysis produite après coup ne produit pas une décision, elle produit une justification.

**Entrée** : `besoin.md`.
**Sortie** : `ba.md`.
**Critère de sortie** : le problème est fermé — on sait ce qu'on ne résout pas, et les alternatives sont tranchées explicitement.

---

## Le prompt

````markdown
Tu produis une business analysis à partir du besoin ci-joint.

# Ce que tu produis, et pour qui

Un document qui permet de **décider s'il faut construire**, et si oui, quoi. Il sera
arbitré ligne à ligne par un humain. Ton objectif n'est pas de convaincre : c'est de
donner de quoi trancher.

**Un draft plausible mais subtilement à côté du besoin coûte plus cher que pas de draft
du tout** — parce qu'il sera lu, approuvé, et deviendra la base de tout le reste. Écris
en pensant à ce risque : signale ce dont tu n'es pas sûr, plutôt que de lisser.

# Structure attendue

## 1. Reformulation du problème
En une page, dans tes mots, à partir du besoin. Si tu dois inventer pour que ça tienne,
**arrête-toi et signale ce qui manque** : le besoin retourne en rédaction.

## 2. Acteurs et usages
Qui, quoi, à quelle fréquence. Pour chaque acteur : ce qu'il attend, et ce qu'il ne fera
jamais. Le second est aussi structurant que le premier.

## 3. L'existant
Que fait-on aujourd'hui, avec quels outils, à quel coût, avec quelles douleurs ? Un
contournement en place est une spécification implicite : il dit ce que les gens font
vraiment.

## 4. Alternatives — la section portante

**Tu examines et tu tranches explicitement les quatre, sans exception :**

| Alternative | Ce que tu dois établir |
| --- | --- |
| **Ne rien construire** | Que se passe-t-il si on ne fait rien ? Coût de l'inaction, chiffré ou décrit. C'est le point de comparaison de tous les autres |
| **Un outil existant** | Nomme au moins trois candidats réels, avec ce qui les disqualifie point par point. « Ça ne correspond pas » n'est pas un motif : dis quelle contrainte du besoin ils violent |
| **Un assemblage d'outils existants** | Souvent la vraie alternative, et la plus souvent ignorée. Que coûterait la couture ? |
| **Construire** | Ce que ça suppose, et à quelles conditions ça devient le bon choix |

Chaque alternative reçoit un verdict **retenue** ou **écartée**, avec son motif. Une
alternative écartée sans motif écrit est une alternative non examinée.

Si aucun candidat existant ne peut être nommé, dis-le : c'est soit que le besoin est très
spécifique — information précieuse —, soit que la recherche n'a pas été faite.

## 5. Contraintes structurantes
Reprises du besoin, **avec ce que chacune élimine**. Une contrainte qui n'élimine rien
n'est pas une contrainte : c'est un souhait. Formule-la ainsi :

> C1 — Réseau fermé, sans Internet sortant. Élimine : tout service en ligne, tout CDN,
> toute police distante, toute brique qui télécharge à l'installation.

C'est cette forme qui rend les contraintes opérantes en aval. Sans elle, elles restent
décoratives.

## 6. Risques
Ce qui peut faire échouer le projet — pas les risques techniques d'implémentation, ceux-là
viendront plus tard. Ici : adoption, périmètre qui enfle, dépendance à une personne,
données de départ inexploitables, contrainte réglementaire découverte tard.

Pour chacun : gravité, et ce qui le rendrait visible tôt.

## 7. Hypothèses non validées
Tout ce que tu as supposé pour que le document tienne. **Liste-les.** Une hypothèse non
listée devient un fait au document suivant.

# Ton
Sobre. Pas de superlatifs, pas de vocabulaire de présentation commerciale. Le lecteur
décide, il n'a pas besoin d'être convaincu.
````

---

## Contrôles de sortie

- [ ] **Les quatre alternatives sont tranchées**, chacune avec un verdict et un motif écrit.
- [ ] **Au moins trois outils existants sont nommés**, avec la contrainte précise qu'ils violent.
- [ ] **Chaque contrainte dit ce qu'elle élimine.** Test : une contrainte dont la colonne « élimine » serait vide est à supprimer ou à reformuler.
- [ ] **Les hypothèses non validées sont listées** et distinctes des faits.
- [ ] **Rien n'a été inventé.** Test : chaque affirmation du document doit être traçable au besoin, ou marquée comme hypothèse.
