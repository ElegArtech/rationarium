# Étape 5 — Socle technique

**Régime : agentique.** Dit **avec quoi** on construit, et pourquoi. Subordonné aux précédents : quand une brique s'oppose à la maquette, c'est la brique qu'on change.

**Entrée** : livrables 01 et 02 + maquettes gelées.
**Sortie** : livrable **03**.
**Critère de sortie** : chaque décision est motivée par une contrainte du cadrage, et les options écartées sont nommées.

> **Correction de M8.** Sur le pilote, une affirmation technique décisive — « plus de binaire de moteur à télécharger » — s'est révélée fausse dans sa portée, avec un échec silencieux à la clé. Elle avait été écrite sur la foi d'une note de version, jamais éprouvée. Ce prompt impose de distinguer ce qui est vérifié de ce qui est cru.

---

## Le prompt

````markdown
Tu produis le socle technique à partir du cahier des charges, des briefs de conception et
des maquettes gelées.

# Ce que ce document est

Il dit avec quoi on construit, et pourquoi. **Il est subordonné aux précédents** : aucune
contrainte technique énoncée ici ne justifie de dévier d'une exigence, d'une règle ou
d'une décision de conception portée par une maquette. Quand une brique s'oppose à la
maquette, c'est la brique qu'on change.

# Structure attendue

## 1. Ce que le cadrage impose

Table `# | contrainte | origine | ce qu'elle élimine`.

**La colonne « ce qu'elle élimine » est la colonne portante.** Une contrainte qui
n'élimine rien n'a pas sa place ici. C'est elle qui transforme le cadrage en critère de
sélection au lieu d'un décor.

Termine par la volumétrie cible et les budgets de performance, chiffrés.

Puis une phrase qui dit **où est la vraie difficulté du produit**. Presque jamais la
volumétrie brute ; presque toujours la densité d'affichage, la finesse du modèle de
droits, ou le nombre de règles métier. Cette phrase oriente toute la sélection.

## 2. Principe de sélection

Une phrase encadrée qui dit ce qui décide. Puis ses conséquences directes.

Si des maquettes existent, elles ne sont pas des illustrations : ce sont des prototypes
qui portent un socle graphique et une logique de rendu déjà écrite. Cela élimine
mécaniquement tout framework de style et toute bibliothèque de composants habillés — les
adopter reviendrait à jeter le travail de conception pour le refaire dans un autre
vocabulaire.

## 3. La pile

Tables `brique | version | rôle`, groupées par domaine.

**Versions exactes, vérifiées contre le registre officiel, et datées.** Un document qui
donne des versions sans date est périmé sans qu'on puisse le savoir. Écris : *« versions
vérifiées le [date] ; toute reprise ultérieure doit les revalider. »*

Pour chaque choix non évident, un paragraphe qui dit pourquoi cette version plutôt que la
suivante ou la précédente.

## 4. Les décisions structurantes

Une section par décision, numérotée `D1…Dn`. Pour chacune :

- **Retenu** : quoi, en version exacte.
- **Pourquoi** : la contrainte du § 1 qui l'impose, citée par identifiant.
- **Écartés** : les candidats sérieux, **nommés**, avec le motif précis du rejet.

Un candidat écarté sans motif est un candidat non examiné. « Ne correspond pas au besoin »
n'est pas un motif : dis quelle contrainte il viole.

Vise dix à quinze décisions. Ce sont elles qui deviendront les ADR du dépôt, une par
fichier, relues à chaque session comme des contraintes actives.

## 5. Architecture dictée par les règles

Les points où une règle de gestion impose une décision technique précise. Cite la règle,
puis dis ce qu'elle impose. C'est la section qui empêche de traiter le cadrage comme une
liste de souhaits.

## 6. Risques et points à valider dès la première semaine

Table `# | risque | comment le vérifier | repli`.

**La colonne « repli » n'est pas optionnelle.** Elle est le cœur de la section : elle
transforme un risque en décision déjà prise. Quand le risque se réalise — et l'un d'eux
se réalisera —, il n'y a plus d'arbitrage à conduire à chaud.

La colonne « comment le vérifier » doit décrire une **manipulation**, pas une intention.
« Surveiller la compatibilité » ne se fait pas ; « monter un projet témoin et lancer ces
quatre commandes » se fait.

## 7. Écarts constatés dans les maquettes

Ce que la lecture des maquettes révèle et qu'il faudra corriger au portage. Pour chacun :
ce que c'est, quelle contrainte il viole, et la correction.

## 8. Ce qui reste à arbitrer

Les points qui relèvent de la maîtrise d'ouvrage ou de l'exploitation et qui conditionnent
des choix encore ouverts.

## 9. Récapitulatif des versions

Une table unique, datée. C'est ce qui sera revalidé au démarrage.

# Interdit de rédaction — la règle du vérifié et du cru

**Distingue systématiquement ce que tu as vérifié de ce que tu tiens d'une documentation.**

Une affirmation technique tirée d'une note de version n'est pas une affirmation vérifiée.
Écris « d'après les notes de version » quand c'est le cas, et **inscris la vérification
correspondante au § 6**.

Le mode de défaillance à redouter : une propriété affirmée avec assurance, jamais éprouvée,
sur laquelle tout un pan de l'architecture repose. Elle ne se découvre qu'en production, et
son coût de correction est maximal à ce moment-là.

# Ton
Argumentatif et sobre. Chaque décision doit pouvoir être contestée sur ses motifs — ce qui
suppose qu'ils soient écrits.
````

---

## Contrôles de sortie

- [ ] **Chaque contrainte du § 1 dit ce qu'elle élimine**, et cite son origine dans le livrable 01.
- [ ] **Chaque décision cite la contrainte qui l'impose.** Une décision sans contrainte est une préférence — c'est acceptable, mais ça doit être dit.
- [ ] **Chaque option écartée est nommée** avec un motif précis.
- [ ] **Chaque version est exacte et vérifiée contre le registre**, à une date écrite.
- [ ] **Chaque risque a un repli déjà arbitré** et une vérification qui est une manipulation.
- [ ] **Les affirmations non vérifiées sont marquées comme telles** et ont leur vérification inscrite au § 6.
- [ ] **Aucune décision ne contredit une maquette.** Test : parcourir les maquettes et vérifier qu'aucune brique retenue n'impose un rendu, un thème ou un DOM incompatible.
