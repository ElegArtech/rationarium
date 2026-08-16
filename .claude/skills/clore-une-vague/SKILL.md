---
description: Assemble le dossier de revue d'une vague et son entrée de journal. À invoquer avant toute revue humaine de fin de vague.
argument-hint: "[n]"
---

# Clore la vague $0

Tu **prépares** la clôture. La revue et la décision de clore sont humaines.

## 1. Couverture

Pour chaque lot de la vague, la table : `EX-…`/`RG-…` du contrat → test qui la cite → verdict. Toute règle sans test nommé est un manque, pas un détail.

## 2. Boucles

Sortie de `pnpm verif`, `pnpm test:int`, `pnpm e2e`, `pnpm a11y`, `pnpm perf`. Les sorties, pas leur résumé.

## 3. Conformité visuelle

Pour chaque vue de la vague : résultat des étages 1 et 2, et le compte des faux positifs de l'étage 1.

## 4. Diff retour

Ce que l'implémentation a fait émerger et que `cadrage/01` et `02` ne prévoyaient pas. Rassemble les « questions que j'ai dû trancher » de chaque compte rendu de lot.

Pour chaque écart : mise à jour de spec proposée, avec sa justification. **Arbitrage humain, systématique.** Rien n'est porté dans `cadrage/` sans décision — un hook y veille.

## 5. Capitalisation

Trois destinations, trois natures :

| Nature | Destination |
| --- | --- |
| Erreur récurrente, piège d'environnement, convention implicite | `CLAUDE.md` § pièges, ou une règle de chemin |
| Décision d'architecture, interdiction, choix tranché | Un ADR |
| Motif d'interface, variante de composant, règle de densité | `DESIGN.md` |

Un piège rencontré deux fois sans avoir été consigné est un défaut de capitalisation, pas un défaut d'agent.

## 6. Auto-audit

Présente les cinq signaux d'érosion (`cadrage/04 § 10.1`) pour réponse humaine :

- Je ne relis plus vraiment les diffs de criticité haute.
- Je ne saurais pas réexpliquer tel module sans le rouvrir.
- La profondeur de revue a baissé « parce que ça marchait ».
- `01` et `02` n'ont pas bougé depuis plusieurs vagues alors que le code, si.
- J'accepte des propositions sans savoir dire pourquoi elles sont justes.

**Deux signaux ou plus : redescendre d'un cran d'autonomie**, repasser en pair sur les lots en cours.

Ajoute la mesure honnête : temps nécessaire pour localiser où se ferait une modification donnée, **sans agent**, sur un module tiré au sort.

## 7. Entrée de journal

Écris `docs/journal/vague-$0.md` au gabarit de `cadrage/04` annexe D, avec les mesures d'instrumentation du § 12.
