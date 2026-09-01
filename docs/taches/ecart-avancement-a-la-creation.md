# Écart — `avancement` est accepté à la création d'une tâche, puis perdu

*Constaté le 1er septembre 2026 sur l'instance, en peuplant un projet réel.*
*Fiche hors numérotation de vague : à renuméroter si elle entre dans un lot.*

> **CLOS le 1er septembre 2026 — voie A retenue, mesure systémique comprise.**
> Le détail de l'application est en fin de fiche, avec deux constats qu'elle
> ne prévoyait pas.

## Le symptôme

Un projet dont toutes les tâches sont créées avec `statut: "done"` affiche
une progression de zéro pour cent.

Reproduction, sur une instance quelconque :

1. Créer un projet.
2. Créer trois tâches par `POST /api/taches` avec `statut: "done"` et
   `avancement: 100`.
3. Lire `GET /api/projets/:id`.

Attendu, si le champ est pris en compte : `progression: 100`.
Obtenu : `progression: 0`.

L'appel de création rend pourtant un `201` et aucune erreur. Le champ est
reçu, il traverse la validation, et il disparaît.

## Où le champ se perd, exactement

Il se perd deux fois, indépendamment.

**Au contrôleur.** `apps/api/src/taches/taches.controller.ts:70`, la route
`@Post()` ne réutilise pas `tacheSchema` : elle redéfinit son propre objet
Zod en ligne, qui déclare seize champs et pas `avancement`. Zod retire par
défaut les clés inconnues sans rien signaler, donc la valeur est supprimée
avant même d'atteindre le service.

**Au service.** `apps/api/src/taches/taches.service.ts:174`, la signature de
`creer` ne comporte pas `avancement`, et le bloc `data` du `create` Prisma
non plus. La colonne `avancement Int @default(0)`
(`packages/db/prisma/schema.prisma:473`) prend donc systématiquement sa
valeur par défaut.

La conséquence en cascade est mécanique. `RG-PRJ-07` calcule la progression
d'un projet comme la moyenne de l'`avancement` de ses tâches, et `RG-JAL-01`
calcule le statut d'un jalon de la même façon. Un projet importé avec son
historique affiche donc zéro pour cent, et ses jalons passés restent
« en attente ».

## Ce qui n'est pas un bogue, et qu'il faut lire avant de corriger

**L'exigence ne demande pas ce champ à la création.** `EX-TSK-04`
(`cadrage/01-cahier-des-charges-fonctionnel.md:390`) énumère les champs de
création : titre, description, projet, assignés, statut, priorité, dates,
horaires, estimation, jalon, intervention extérieure. `avancement` n'y est
pas. Il fait l'objet d'une exigence distincte, `EX-TSK-08` (ligne 394),
« renseigner un pourcentage d'avancement », que la route `PATCH :id` remplit
correctement puisque son schéma en ligne, lui, comporte le champ.

Le contrôleur est donc **conforme à son exigence**. Ne pas le « corriger »
en supposant l'inverse.

**Le vrai défaut est un contrat qui ment.** `packages/contracts/src/schemas.ts:226`,
`tacheSchema` déclare `avancement` (ligne 243) avec une valeur par défaut, et
ce schéma est exporté comme le type canonique `Tache`. Tout consommateur du
contrat — une interface, un import en masse, un agent qui écrit par l'API —
en déduit légitimement que le champ est accepté à la création. Il l'est, au
sens où rien ne le refuse. Il n'est simplement pas écrit.

Un refus se verrait. Ce silence ne se voit pas.

**Ce n'est pas la première fois.** Le commentaire de
`taches.controller.ts:66-68` documente exactement le même incident sur
d'autres champs : « Ils manquaient au schéma : Zod les retirait en silence et
le créneau d'une réunion était insaisissable. » La classe de défaut a déjà
mordu une fois, et rien dans le dépôt n'en protège aujourd'hui.

## La décision à prendre

Trois voies, dont une seule est à retenir. Elle appartient au propriétaire du
produit, et le choix change l'exigence, pas seulement le code.

**A. Étendre la création.** Ajouter `avancement` au schéma en ligne du `@Post()`,
à la signature de `creer` et au bloc `data`. Cela suppose d'amender `EX-TSK-04`,
car l'exigence change. C'est la voie que le besoin d'import réclame : charger un
historique déjà accompli est un cas d'usage réel, et le module `imports` existe
précisément pour cela.

**B. Assumer la divergence et la rendre visible.** Laisser la création sans
`avancement`, mais retirer le champ de `tacheSchema` ou scinder ce schéma en
deux, création et modification, pour que le contrat cesse de promettre ce que
la route ne tient pas. Documenter que le chargement d'un historique demande un
second appel `PATCH`.

**C. Ne rien changer.** Défendable seulement si l'import d'historique n'est pas
un usage prévu. À écarter si le module `imports` doit servir à cela.

**Recommandation.** La voie A, complétée par la mesure systémique ci-dessous.
Le module `imports` sert à créer en masse, et une création en masse qui ne sait
pas porter l'état d'avancement produit un portefeuille faux dès le premier
chargement.

## La mesure systémique, à retenir quelle que soit la voie

Les schémas Zod des routes d'écriture retirent les clés inconnues en silence.
C'est le mécanisme qui a masqué ce défaut, et celui de l'incident déjà
documenté au contrôleur.

Deux remèdes, cumulables :

1. Passer les schémas d'écriture en `.strict()`, pour qu'une clé inconnue lève
   une erreur au lieu d'être ignorée. Un client qui envoie un champ inexistant
   l'apprend immédiatement.
2. Ajouter un contrôle au script `scripts/tracabilite-check.mjs`, ou un test,
   qui compare les champs de chaque schéma en ligne d'écriture avec ceux du
   schéma correspondant de `packages/contracts`. Toute divergence non déclarée
   échoue la vérification.

Le deuxième remède est le plus durable : il empêche la classe entière de
revenir, alors que le premier ne protège que le sens client vers serveur.

## Critères d'acceptation exécutables

Pour la voie A :

1. `POST /api/taches` avec `avancement: 100` crée une tâche dont la relecture
   par `GET /api/taches` rend `avancement: 100`.
2. Un projet dont les trois tâches sont créées à `avancement: 100` rend
   `progression: 100` sur `GET /api/projets/:id`.
3. Un jalon dont toutes les tâches sont créées terminées rend `statut: "done"`
   sans marquage manuel.
4. `avancement` absent du corps continue de valoir zéro.
5. Une valeur hors de l'intervalle zéro à cent est refusée par un `400`.
6. `EX-TSK-04` est amendée dans `cadrage/01-cahier-des-charges-fonctionnel.md`,
   et la table de traçabilité suit.
7. Le module `imports` accepte une colonne d'avancement pour le type `taches`,
   ou la fiche dit explicitement pourquoi il ne le fait pas.

Pour la mesure systémique :

8. Un test échoue si un schéma d'écriture en ligne accepte une clé absente du
   contrat, ou inversement.

## Hors périmètre

Ne pas toucher au calcul de `RG-PRJ-07` ni à celui de `RG-JAL-01` : ils sont
justes, ce sont leurs entrées qui manquaient.

Ne pas ajouter `avancement` à la route `PATCH :id` : il y figure déjà et
fonctionne.

Ne pas modifier la route `PUT :id/assignes`, qui est correcte : l'assignation
a délibérément son propre point d'entrée avec confrontation de version
(`RG-GEN-07`), et ce n'est pas un oubli du `PATCH`.

---

## Application — 1er septembre 2026

**Voie A retenue**, telle que la fiche la recommande, avec la mesure systémique.

### Ce qui a été fait

| Critère | État |
| --- | --- |
| 1 — `POST` avec `avancement: 100` se relit à 100 | fait, contrôle HTTP |
| 2 — trois tâches à 100 rendent `progression: 100` | fait, plus un contre-témoin sur la moyenne |
| 3 — jalon dont les tâches sont créées terminées | fait ; **tenait déjà**, voir plus bas |
| 4 — absent du corps, vaut zéro | fait |
| 5 — hors de zéro à cent, refusé en 400 | fait, sur `101`, `-1` et `12.5` |
| 6 — `EX-TSK-04` amendée, traçabilité suivie | fait, avec la note d'arbitrage |
| 7 — le module `imports` porte la colonne | fait : `progress`, sur les deux types qui créent des tâches |
| 8 — un test refuse la divergence contrat / route | fait : `apps/api/src/commun/schemas-ecriture.test.ts` |

Le correctif tient en trois endroits — le schéma en ligne du `@Post()`, la
signature de `creer`, le bloc `data` — et a été **vérifié rouge sans lui** :
retirer `avancement: donnees.avancement ?? 0` fait tomber trois contrôles.

### Deux constats que la fiche n'avait pas

**L'export ne portait pas le champ non plus.** La fiche écrit « l'export le rend
déjà » ; il ne le rendait pas. Ajouter la colonne à l'import sans l'écrire à
l'export aurait produit un aller-retour qui perd l'avancement — le défaut
d'origine, remonté d'un cran. `exporterTaches` l'écrit désormais, et un
contrôle le tient.

**Le critère 3 tenait déjà.** `RG-JAL-01` calcule le statut d'un jalon à partir
du `statut` de ses tâches, pas de leur `avancement` — et `statut` était accepté
à la création. La fiche dit « de la même façon » que `RG-PRJ-07` ; ce n'est pas
le cas. Le contrôle est écrit quand même, parce que la fiche le demande et
parce qu'il pose le raccord, mais il ne prouve rien du correctif. Il est
commenté comme tel : un test qu'on n'a pas vu échouer ne prouve pas ce qu'on
croit.

### La mesure systémique, et où elle s'arrête

**Remède 2 — le contrôle de divergence — est appliqué**, sur huit appariements
route / contrat. Il compare les clés du schéma en ligne de chaque route
d'écriture à celles du schéma correspondant de `@rationarium/contracts`. Toute
différence doit être écrite avec sa raison, dans les deux sens. Trois gardes
l'accompagnent : l'inventaire est affirmé, une raison périmée échoue, une
raison de moins de quarante caractères aussi.

Il a trouvé une erreur **dans sa propre table de déclarations** à la première
exécution — `serviceIds` déclaré absent du contrat alors qu'il y est. C'est ce
qu'on lui demande de faire.

**Remède 1 — `.strict()` — est appliqué au SEUL module des tâches.** Six
schémas, vérifiés au niveau HTTP. Il n'est pas généralisé aux soixante-dix-huit
autres routes d'écriture : un `400` là où le produit acceptait silencieusement
casserait un appelant existant, et rien aujourd'hui ne prouve qu'aucun n'envoie
de champ superflu. Le module des tâches a payé la classe quatre fois — horaires,
`projectId`, `avancement`, et le sous-objet de récurrence des événements par
ricochet — c'est là que le remède se justifie sans démonstration
supplémentaire. **Décision assumée, à rouvrir le jour où chaque route
d'écriture aura un contrôle HTTP.**

### Ce que le contrôle a révélé au passage

Deux divergences contrat / route, déclarées et non corrigées, parce qu'elles
sont justes :

- `POST /evenements` groupe la récurrence dans un sous-objet
  `recurrence: { frequenceSemaines, jourSemaine, jusqua }` là où le contrat
  aplatit `recurrenceFrequence`, `recurrenceJourSemaine`, `recurrenceFin`. Une
  récurrence est entière ou absente ; le sous-objet le dit mieux que trois
  champs qu'on pourrait remplir à moitié.
- `POST /utilisateurs` n'accepte pas `actif`. Un compte naît actif
  (`RG-AUTH-05`) ; le créer désactivé donnerait deux façons de produire un
  compte que personne ne peut employer.
