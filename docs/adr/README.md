# Décisions d'architecture

Un fichier, une décision. **Un ADR ne se modifie pas après coup** : s'il devient faux, on en écrit un nouveau qui le remplace, et on marque l'ancien comme remplacé. C'est ce qui permet de reconstituer non seulement ce qu'on a décidé, mais quand et sur quelle information.

Chaque ADR porte une rubrique **« ce qui est désormais interdit »**. Ce n'est pas une formule : c'est la partie qui compte. Un ADR est lu à chaque session comme une contrainte active, pas comme un souvenir.

| # | Décision | Origine |
| --- | --- | --- |
| [0001](ADR-0001-application-monopage.md) | Application monopage, sans rendu serveur | `03 § 4, D1` |
| [0002](ADR-0002-react.md) | React plutôt que Vue ou Svelte | `03 § 4, D2` |
| [0003](ADR-0003-react-aria-components.md) | React Aria Components plutôt que Radix ou Base UI | `03 § 4, D3` |
| [0004](ADR-0004-glisser-deposer.md) | Pragmatic drag and drop, et l'alternative clavier obligatoire | `03 § 4, D4` |
| [0005](ADR-0005-nestjs.md) | NestJS plutôt que Fastify seul | `03 § 4, D5` |
| [0006](ADR-0006-prisma-orm.md) | Prisma, et ce que Prisma 7 exige réellement hors ligne | `03 § 4, D6` · **vérifié** |
| [0007](ADR-0007-postgresql-seul.md) | PostgreSQL seul : ni Redis, ni moteur de recherche | `03 § 4, D7` |
| [0008](ADR-0008-sessions-opaques.md) | Sessions opaques en base, pas de JWT | `03 § 4, D8` |
| [0009](ADR-0009-contrat-zod.md) | Contrat partagé en Zod, ni GraphQL ni tRPC | `03 § 4, D9` |
| [0010](ADR-0010-temporal.md) | Temporal pour l'arithmétique calendaire | `03 § 4, D10` |
| [0011](ADR-0011-i18next.md) | i18next avec format ICU | `03 § 4, D11` |
| [0012](ADR-0012-aucune-bibliotheque-graphique.md) | Aucune bibliothèque de graphiques, de Gantt ni de planning | `03 § 4, D12` |
| [0013](ADR-0013-chaine-approvisionnement-hors-ligne.md) | Chaîne d'approvisionnement et construction hors ligne | `C1` · **vérifié** |
| [0014](ADR-0014-typescript-6-plutot-que-7.md) | TypeScript 6.0.3 plutôt que 7.0.2 | `03 § 6, R1` · **vérifié** |
| [0015](ADR-0015-densite-vue-mois.md) | Densité de la vue Mois : pas de virtualisation | `03 § 6, R5` · **vérifié** |

Les quatre marqués **vérifié** ne dérivent pas d'un document : ils consignent le résultat d'une vérification menée en conditions réelles. Deux **corrigent** le socle technique ; un troisième établit que le risque qu'il traitait était mal attribué.

## Écrire un nouvel ADR

Toute addition de dépendance en exige un (`CLAUDE.md`). Structure attendue :

```markdown
# ADR-00xx — <décision en une ligne>

- **Statut** : accepté | remplacé par ADR-00yy | déprécié — <date>
- **Source** : <d'où vient la question>

## Contexte
<le fait structurant, pas l'historique>

## Décision
<ce qu'on fait>

## Ce qui est désormais interdit
<la partie lue à chaque session — prescriptive, pas descriptive>

## Alternatives écartées
<nommées, avec le motif du rejet>
```
