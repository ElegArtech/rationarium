# Tâche T-003 — `packages/contracts` : vocabulaires, permissions, rôles, schémas

- **Lot** : L-03 — **Vague** : 1
- **Exigences** : structurantes pour tous les modules — `cadrage/01 § 3.2`, `§ 3.3`, `§ 4.1`
- **Règles** : `RG-DROITS-01`, `RG-DROITS-02`, `RG-DROITS-03`, `RG-SCOPE-01` à `04`
- **Criticité** : **haute** → mode : pair
- **Pointeurs harnais** : `ADR-0009` (contrat Zod), `ADR-0010` (dates sans fuseau), `.claude/rules/api.md`

## Objet

Produire la définition unique dont dérivent la validation d'entrée du serveur, les types et formulaires du client, la garde de permission, la matrice de la vue 32 et les tests.

## Contenu attendu

1. **Vocabulaires** du `§ 4.1`, exhaustifs, avec leur code technique et leur libellé FR/EN.
2. **Catalogue des permissions atomiques** — `cadrage/01 § 3.2` annonce « ≈ 125 » sans les énumérer. À produire par croisement domaine × famille d'actions, plus les permissions nommées.
3. **26 modèles de rôles** — nommés dans `§ 3.2`, leur contenu en permissions n'est spécifié nulle part. À produire.
4. **Schémas Zod** des objets du `§ 4`, avec leurs contraintes de validation issues des `RG-…`.

## Décisions prises en autonomie

Les points 2 et 3 sont des trous de spécification, pas des choix d'implémentation. Ils sont tranchés ici, **de façon réversible** : chaque décision est motivée dans le code, et le catalogue est une donnée, modifiable sans refonte.

## Critères d'acceptation exécutables

- [ ] `pnpm typecheck` → vert
- [ ] `pnpm test -- contracts` → chaque vocabulaire, chaque invariant du catalogue et chaque modèle de rôle couvert par un test nommé
- [ ] Le catalogue est **fermé** : un test vérifie qu'aucune permission n'est employée hors catalogue
- [ ] Les 26 modèles de rôles existent, et chacun ne référence que des permissions du catalogue
- [ ] `RG-DROITS-02` : les rôles système sont marqués non supprimables et non renommables
- [ ] Les vocabulaires sont identiques, valeur par valeur, à `cadrage/01 § 4.1`

## Hors périmètre

La garde de permission (L-04), le constructeur de prédicats de périmètre (L-06), la matrice d'administration (L-08), toute persistance (L-02).
