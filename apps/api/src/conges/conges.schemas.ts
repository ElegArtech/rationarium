import { z } from "zod";
import { enumDe, DEMI_JOURNEES } from "@rationarium/contracts";
import { dateSchema } from "../commun/http.js";

/**
 * Les schémas d'écriture du module congés.
 *
 * **Pourquoi ils ne sont pas `demandeCongeSchema` lui-même.** Le contrat de
 * `@rationarium/contracts` porte les dates en `AAAA-MM-JJ` — c'est la forme
 * qui voyage sur le réseau et que la vue 19 manipule. Le service, lui, prend
 * des `Date` : c'est `dateSchema` qui fait la bascule, et une bascule ne se
 * greffe pas sur un `refine` déjà posé sur des chaînes.
 *
 * **Ce que cette différence a coûté.** Le schéma en ligne du contrôleur
 * portait les mêmes clés que le contrat et **aucun de ses deux `refine`** :
 * une demande avec `dateFin < dateDebut` traversait la validation, atteignait
 * PostgreSQL et mourait sur la contrainte `leaves_periode_coherente` (23514,
 * rendue par Prisma en `P2039`, que rien ne mappe) — donc **500, « Une erreur
 * inattendue est survenue »**, là où `RG-CNG-28` a une phrase à dire.
 * `RG-CNG-18` était perdue de la même façon.
 *
 * Le contrôle de `schemas-ecriture.test.ts` ne pouvait pas le voir : il
 * compare des **jeux de clés**, et une règle inter-champs n'en porte aucune.
 * Ce qui le voit est `conges.schemas.test.ts`, qui confronte ces schémas au
 * contrat sur des **valeurs**, verdict par verdict.
 */

const demi = enumDe(DEMI_JOURNEES).nullish();

/** `RG-CNG-28` — la date de fin est postérieure ou égale à la date de début. */
const MESSAGE_PERIODE = "La date de fin doit être postérieure ou égale à la date de début.";

/** `RG-CNG-18` — la demi-journée simple ne vaut que pour un congé d'un jour. */
const MESSAGE_DEMI_JOURNEE = "Une demi-journée ne s'applique qu'à un congé d'une seule journée.";

/**
 * La plage demandée, avec les deux règles que le contrat porte.
 *
 * L'égalité de dates se lit sur l'instant, pas sur la référence : deux `Date`
 * du même jour ne sont jamais le même objet, et `dateDebut !== dateFin`
 * — vrai recopié tel quel du contrat, où ce sont des chaînes — aurait rendu
 * `RG-CNG-18` toujours satisfaite, donc muette.
 */
export const plageDemandee = z
  .object({
    dateDebut: dateSchema,
    dateFin: dateSchema,
    demiJourneeDebut: demi,
    demiJourneeFin: demi,
    motif: z.string().max(2000).optional(),
  })
  .refine((v) => v.dateFin >= v.dateDebut, {
    message: MESSAGE_PERIODE,
    path: ["dateFin"],
  })
  .refine(
    (v) =>
      v.dateDebut.getTime() !== v.dateFin.getTime() ||
      !v.demiJourneeFin ||
      v.demiJourneeDebut === v.demiJourneeFin,
    { message: MESSAGE_DEMI_JOURNEE, path: ["demiJourneeFin"] },
  );

/** `POST /conges` — le dépôt. `userId` absent vaut « pour moi ». */
export const depotSchema = plageDemandee.extend({
  typeId: z.uuid(),
  userId: z.uuid().optional(),
});

/**
 * `PATCH /conges/:id` — la correction d'une demande en attente.
 *
 * `RG-GEN-07` — `version` est obligatoire : une modification ne change pas le
 * statut, donc le garde-fou de statut ne voit pas deux corrections
 * concurrentes passer.
 */
export const modificationSchema = plageDemandee.extend({
  version: z.number().int().min(1),
});

// ── Référentiel des types de congé — EX-CNG-13, RG-CNG-30 ───────────────────

/**
 * `RG-CNG-30` — sur un type **système**, cinq champs seulement sont
 * modifiables : le nom, la description, l'icône, la couleur et l'exigence de
 * validation. Le code, la rémunération, la limite, l'ordre et l'activité sont
 * fixés par le produit.
 *
 * La liste est écrite **en positif** : ce qui est permis. Une liste
 * d'interdits laisse tout champ neuf modifiable par défaut, et c'est
 * exactement le sens inverse de la règle.
 */
export const CHAMPS_MODIFIABLES_TYPE_SYSTEME = [
  "nom",
  "description",
  "icone",
  "couleur",
  "validationRequise",
] as const;

/**
 * `EX-CNG-13` — la modification d'un type.
 *
 * Tous les champs sont facultatifs — la vue 31 enregistre le formulaire tel
 * qu'il a été rempli —, sauf `version` : `RG-GEN-07` ne se négocie pas.
 * `code` en fait partie : un type non système peut être recodé tant que le
 * code reste unique.
 */
export const modificationTypeSchema = z.object({
  code: z.string().min(1).max(20).regex(/^[A-Z0-9_]+$/).optional(),
  nom: z.string().min(1).max(120).optional(),
  description: z.string().max(2000).nullish(),
  icone: z.string().max(60).nullish(),
  couleur: z.string().regex(/^#[0-9A-Fa-f]{6}$/).nullish(),
  remunere: z.boolean().optional(),
  validationRequise: z.boolean().optional(),
  limiteAnnuelle: z.number().nonnegative().nullish(),
  ordre: z.number().int().nonnegative().optional(),
  actif: z.boolean().optional(),
  version: z.number().int().min(1),
});

/**
 * Le même, restreint aux cinq champs que `RG-CNG-30` laisse ouverts.
 *
 * **Le refus est nommé champ par champ**, et non par un « clés inconnues »
 * générique : `cadrage/02` affiche l'erreur sous le champ fautif, et un
 * message global obligerait à chercher lequel des dix est en cause. C'est le
 * même contrat que toute autre validation d'entrée — `valider` rend un 400
 * avec son détail —, et c'est ce qui permet à la règle d'être **rédigée**
 * plutôt que codée (`RG-GEN-03`).
 */
export const modificationTypeSystemeSchema = modificationTypeSchema.superRefine((v, ctx) => {
  const ouverts = new Set<string>(CHAMPS_MODIFIABLES_TYPE_SYSTEME);
  for (const [champ, valeur] of Object.entries(v)) {
    if (champ === "version" || ouverts.has(champ) || valeur === undefined) continue;
    ctx.addIssue({
      code: "custom",
      path: [champ],
      message:
        "Ce type de congé est fourni avec le produit : seuls son nom, sa description, son icône, sa couleur et son exigence de validation sont modifiables.",
    });
  }
});
