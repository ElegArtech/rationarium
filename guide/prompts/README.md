---
titre: Kit de prompts — la chaîne amont du cycle agentique
type: note de référence — méthode outillée
statut: v1 — dérivée du pilote rationarium
date: 2026-08-16
---

# Kit de prompts — produire la chaîne de cadrage

**Objet.** Rendre reproductible la chaîne d'artefacts qui va de l'expression d'un besoin jusqu'au plan de réalisation, telle qu'elle a été parcourue sur le pilote *rationarium*. Un prompt par étape, prêt à l'emploi.

**Ce que ce kit n'est pas.** Une collection de formulations habiles. Chaque prompt porte ses **contrôles de sortie** — ce qu'on vérifie mécaniquement avant de passer à l'étape suivante. C'est le principe du cycle appliqué à sa propre chaîne : *si on ne peut pas vérifier qu'un artefact est satisfaisant, il est mal spécifié*.

---

## 1. La chaîne

| Étape | Prompt | Régime | Sortie | Livrable |
| --- | --- | --- | --- | --- |
| 0 | [Entretien maïeutique](00-entretien-maieutique.md) | humain, assisté d'un interviewer | `besoin.md` | — |
| 1 | [Business analysis](01-business-analysis.md) | agentique | `ba.md` | — |
| 2 | [Cahier des charges fonctionnel](02-cahier-des-charges.md) | agentique | `01-…md` | **01** |
| 3 | [Inventaire des vues et briefs](03-inventaire-et-briefs.md) | agentique | `02-…md` | **02** |
| 4 | [Génération des maquettes](04-generation-maquettes.md) | assisté (webapp) | `mockups/` | — |
| 5 | [Socle technique](05-socle-technique.md) | agentique | `03-…md` | **03** |
| 6 | [Plan de réalisation agentique](06-plan-de-realisation.md) | agentique | `04-…md` | **04** |
| ⟲ | [Contrôles de cohérence](07-controles-de-coherence.md) | agentique | rapport d'écarts | transverse |

**Entrée de la chaîne : variable.** L'étape 0 accepte aussi bien un entretien de dix minutes qu'un document de trente pages déjà consolidé. Le prompt d'entretien détecte lequel des deux il a en face et adapte sa profondeur — c'est la première chose qu'il fait.

**Point de bascule.** L'étape 3 est celle qui décide de tout ce qui suit. C'est vérifiable : sur le pilote, ce sont les briefs qui ont produit les 35 maquettes, donc les 335 états atteignables, donc l'intégralité du critère d'acceptation d'interface de l'étape 6. Un brief faible ne produit pas une maquette faible — il produit **une absence de critère**, et l'agent d'exécution comble alors les vides avec ses habitudes.

---

## 2. Autocritique du pilote — ce que la chaîne a réellement raté

Cette section est le cœur du kit. Elle n'est pas spéculative : chacun de ces manques a été **découvert en construisant l'application**, après le gel du cadrage, et a coûté du travail de rattrapage. Chaque prompt du kit porte le contrôle qui l'aurait évité.

### 2.1 Les manques constatés

| # | Manque | Découvert par | Coût réel | Prompt corrigé |
| --- | --- | --- | --- | --- |
| M1 | **Aucune business analysis.** Les alternatives — ne rien construire, prendre un outil existant — n'ont jamais été examinées ni tranchées | Lecture de la chaîne au regard du cycle | Nul ici, mais irrattrapable : on ne rétro-écrit pas un arbitrage qui n'a pas eu lieu | Étape 1 |
| M2 | **Vocabulaires divergents entre `01` et `02`.** Priorité à six niveaux contre quatre ; statut de projet à six valeurs contre cinq, dont deux synonymes | Confrontation des deux documents avant écriture du modèle de données | Arbitrage bloquant à chaud, juste avant la première migration | Étape 7 |
| M3 | **Promesse chiffrée sans artefact.** « ≈ 125 permissions » annoncé, jamais énuméré. 26 modèles de rôles nommés, leur contenu jamais spécifié | Ouverture du lot qui devait les implémenter | Deux trous de spec au cœur du cloisonnement | Étapes 2 et 7 |
| M4 | **Incohérence interne du jeu de maquettes.** Une correction de contraste appliquée à 9 fichiers sur 35, jamais rétro-propagée | Extraction mécanique du socle graphique | Un design system non conforme RGAA aurait été figé si j'avais pris un fichier au hasard | Étapes 4 et 7 |
| M5 | **Exigence contractuelle jamais mesurée.** RGAA posé comme contraignant dans `01` et `02` ; jamais contrôlé sur les maquettes. 33 manquements graves dormaient dans la référence gelée | Premier passage d'axe-core | Une dette d'accessibilité propagée dans 35 vues si elle n'avait été vue qu'en fin de projet | Étapes 4 et 7 |
| M6 | **Structure du livrable non documentée.** Les 35 maquettes sont cumulatives — chaque fichier embarque les sections des précédents. Rien ne le disait | Comparaison des feuilles de style | Un socle tronqué si le portage était parti d'un fichier arbitraire | Étape 4 |
| M7 | **États spécifiés en prose, jamais consolidés.** Une quarantaine d'états vides recensés en prose, dispersés dans 35 sections | Besoin d'un critère d'acceptation mécanique | Un inventaire lisible par machine a dû être dérivé après coup | Étape 3 |
| M8 | **Affirmation technique non vérifiée.** « Plus de binaire de moteur à télécharger » — vrai du moteur de requêtes, faux du moteur de schéma, avec échec silencieux à la clé | Test en réseau fermé | Une installation hors ligne qui paraît réussir et casse à la première migration | Étape 5 |

### 2.2 Le motif commun

Sept manques sur huit ont la même forme : **une affirmation portée par un document, jamais confrontée à une mesure.** Un vocabulaire déclaré unique et jamais diffé. Un nombre de permissions annoncé et jamais compté. Une conformité posée comme contractuelle et jamais testée. Une propriété technique affirmée et jamais éprouvée.

Ce n'est pas un défaut de rédaction — les quatre livrables du pilote sont d'excellente tenue. C'est un défaut de **chaîne** : il manquait une étape de contrôle entre chaque artefact et le suivant.

D'où la règle qui structure ce kit :

> **Tout prompt qui produit un artefact produit aussi le moyen de vérifier cet artefact.**
> Un document qui affirme sans fournir de quoi mesurer transmet sa dette à l'étape suivante, où elle coûte dix fois plus.

### 2.3 Ce que la chaîne a exceptionnellement bien fait

À conserver sans y toucher — c'est ce qui a rendu l'exécution possible.

| Acquis | Pourquoi ça marche |
| --- | --- |
| **Identifiants atomiques `EX-…` / `RG-…`** | Stables, citables, vérifiables un par un. Ils rendent la traçabilité mécanique et permettent la règle « une règle = un test nommé qui la cite » |
| **Partis pris de conception** (`01 § 8`) | Ils éliminent des classes entières de divergence en amont, plutôt que de les arbitrer une par une en aval |
| **Préambule commun** en tête de chaque brief (`02 § A`) | La parade au risque structurel de la génération en webapp : dix conversations produiraient sinon dix applications différentes |
| **Rubrique « Attention » par vue** | Une phrase qui nomme le piège de conception propre à la vue. Densité d'information imbattable |
| **Panneau de revue dans chaque maquette** | **L'invention la plus rentable de tout le pilote.** Il rend chaque état atteignable par appel de fonction, donc la conformité d'interface mesurable. Il n'était pas prévu par la méthode : il en est sorti |
| **Registre de risques avec repli pré-décidé** (`03 § 6`) | Quand R1 a échoué, le repli était déjà arbitré. Aucune décision à prendre à chaud |

---

## 3. Comment employer le kit

1. **Une étape, une conversation.** Les artefacts sont trop volumineux pour cohabiter, et le mélange des régimes brouille les rôles.
2. **Le contrôle de sortie n'est pas optionnel.** Chaque prompt se termine par une liste de vérifications. Une étape dont les contrôles ne passent pas ne se transmet pas : elle se reprend.
3. **L'étape 7 se rejoue à chaque fois qu'un artefact amont bouge.** C'est peu coûteux et c'est ce qui aurait évité M2, M3, M4 et M5.
4. **Le stylo reste humain à l'étape 0.** L'agent interviewe, détecte les ambiguïtés, pose les questions non posées — il n'écrit pas le besoin. C'est le seul point où l'information entre dans le système depuis l'extérieur ; si l'IA co-rédige l'origine, tout le reste devient une boucle auto-référentielle où l'on valide du plausible.
