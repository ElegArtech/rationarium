---
description: Ouvre un lot du DAG — vérifie ses dépendances, produit ses contrats de tâche, présente le gate. À invoquer avant tout démarrage de lot.
argument-hint: "[L-xx]"
---

# Ouvrir le lot $0

## 1. Vérifier que le lot est ouvrable

Lis `docs/dag.md`. Contrôle, dans l'ordre :

- [ ] Toutes les dépendances du lot sont à l'état **livré** — pas « en cours », pas « presque ».
- [ ] La vague précédente est **close** : revue faite, capitalisation intégrée, entrée de journal écrite.
- [ ] Les arbitrages dont dépend ce lot sont rendus (table des arbitrages en fin de `dag.md`).
- [ ] `pnpm verif` est vert sur `main`.

**Une case non cochée arrête ici.** On n'ouvre pas un lot « en attendant ».

## 2. Produire les contrats

Emploie le sous-agent `redacteur-de-contrats`. Il produit un brouillon dans `docs/taches/`.

Relis chaque contrat toi-même. Trois questions par contrat :

- Les critères d'acceptation sont-ils **exécutables** ? Une commande, un résultat attendu.
- Le hors-périmètre est-il explicite ?
- Un agent qui ne lit que ce contrat et le harnais peut-il travailler sans rien deviner ?

## 3. Fixer la criticité

Selon la grille de `cadrage/04 § 6.1`, qui est fermée. Elle détermine **mécaniquement** le mode d'exécution et la profondeur de revue. Ce n'est pas un réglage de confort : la profondeur de revue est fonction de la criticité, **jamais du track record récent**.

## 4. Présenter le gate

Les quatre questions, pour chaque tâche. Quatre réponses positives requises, sans exception :

1. L'objectif est-il explicite et sans ambiguïté ?
2. Les contraintes et critères d'acceptation sont-ils formalisés et exécutables ?
3. L'agent dispose-t-il des outils pour implémenter, tester et corriger seul ?
4. Suis-je en mesure d'expliquer, d'évaluer et de valider le résultat ?

Une réponse négative renvoie en amont — 1 vers la spec, 2 vers le contrat, 3 vers le harnais, 4 vers une session de relecture sans production. **Elle ne se contourne pas par une surveillance renforcée.**

Le gate est humain. Présente-le, ne le coche pas.
