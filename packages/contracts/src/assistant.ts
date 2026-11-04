/**
 * M22 — assistant de suivi. `docs/assistant/SPEC-PHASE-1.md`.
 *
 * Ce fichier porte ce que le serveur, le client et l'agent de référence
 * partagent : la forme d'une action, de ses preuves, d'un plan de suivi et
 * d'un bilan de passage, et les réglages du module.
 *
 * **Une charge n'est pas le schéma du service.** L'action est exécutée par la
 * route d'écriture existante, qui revalide son corps avec son propre schéma.
 * Les charges ci-dessous ne fixent que ce qui sert à l'assistant : désigner la
 * cible, refuser ce que l'agent n'a pas le droit de demander (`RG-AST-11`) et
 * appliquer les règles du suivi (`RG-AST-08`, `RG-AST-09`). Les dupliquer
 * champ pour champ aurait fait deux définitions d'une même écriture.
 */
import { z } from "zod";
import { enumDe } from "./schemas.js";
import {
  MODES_ASSISTANT,
  PRIORITES,
  STATUTS_PROJET,
  STATUTS_TACHE,
  TYPES_ACTIVITE,
  TYPES_SOURCE_SUIVI,
  type TypeActionAgent,
} from "./vocabulaires.js";

// ── Bornes ──────────────────────────────────────────────────────────────────

/** `RG-AST-07`. */
export const LONGUEUR_EXTRAIT_PREUVE = 280;
export const PREUVES_PAR_ACTION = 10;
/** Nombre d'actions d'un dépôt. */
export const ACTIONS_PAR_LOT = 50;
/** `RG-AST-12` — une action défaite n'est pas refaite pendant cette durée. */
export const JOURS_REFUS_ACTION_DEFAITE = 90;
/** `RG-AST-15` — un passage pris sans signe de vie depuis cette durée est interrompu. */
export const MINUTES_SANS_SIGNE_DE_VIE = 30;
/** Un agent est dit joignable s'il a donné signe de vie depuis moins de cette durée. */
export const SECONDES_AGENT_JOIGNABLE = 60;
export const JOURS_VIE_JETON = 365;
/** Attente maximale de `GET /agent/v1/passages/suivant`. */
export const SECONDES_ATTENTE_PASSAGE = 25;

// ── Primitives ──────────────────────────────────────────────────────────────

const date = z.iso.date();

/** Une référence locale au lot : `reference` déclarée par une action précédente. */
export const REFERENCE_LOCALE = /^[a-z0-9_-]{1,40}$/;

/**
 * Un identifiant, ou `@reference` d'une entité créée par une action précédente
 * du même lot. Le serveur résout la référence ; il ne rapproche jamais deux
 * entités par leur libellé (`RG-AST-10`).
 */
export const identifiantOuReference = z.union([
  z.uuid(),
  z.string().regex(/^@[a-z0-9_-]{1,40}$/, "référence locale attendue : @nom"),
]);

/** `RG-AST-07` — une preuve désigne un signal ; elle ne le recopie pas. */
export const preuveSchema = z
  .object({
    /** Nature de la source : courriel, depot, dossier, canal, linkedin… */
    source: z.string().min(1).max(80),
    /** Identifiant du signal dans sa source : Message-ID, commit, chemin, URL. */
    reference: z.string().min(1).max(500),
    date: z.union([date, z.iso.datetime({ offset: true })]),
    lien: z.url().max(2000).optional(),
    extrait: z.string().max(LONGUEUR_EXTRAIT_PREUVE).optional(),
  })
  .strict();
export type Preuve = z.infer<typeof preuveSchema>;

export const sourceSuiviSchema = z
  .object({
    type: enumDe(TYPES_SOURCE_SUIVI),
    designation: z.string().min(1).max(1000),
    libelle: z.string().max(160).optional(),
  })
  .strict();
export type SourceSuivi = z.infer<typeof sourceSuiviSchema>;

/** Le plan de suivi d'un projet : ce que l'agent doit aller voir. */
export const planSuiviSchema = z
  .object({
    consigne: z.string().max(10_000).nullish(),
    sources: z.array(sourceSuiviSchema).max(50).optional(),
    silenceJours: z.number().int().min(1).max(365).nullish(),
    actif: z.boolean().optional(),
  })
  .strict();
export type PlanSuivi = z.infer<typeof planSuiviSchema>;

/** `RG-AST-11` — aucun statut d'annulation : annuler un projet vaut le supprimer (`RG-PRJ-02`). */
const statutProjetPermis = enumDe(STATUTS_PROJET).refine((s) => s !== "cancelled", {
  message: "l'agent n'annule pas un projet (RG-AST-11)",
});

// ── Charges ─────────────────────────────────────────────────────────────────

const chargeProjetCreer = z
  .object({
    nom: z.string().min(1).max(160),
    description: z.string().max(5000).optional(),
    statut: statutProjetPermis.optional(),
    priorite: enumDe(PRIORITES).optional(),
    dateDebut: date,
    dateFin: date,
    budgetHeures: z.number().min(0).optional(),
    icone: z.string().max(80).optional(),
    chefId: z.uuid().nullish(),
    sponsorId: z.uuid().nullish(),
    departementId: z.uuid().nullish(),
    suivi: planSuiviSchema.optional(),
  })
  .strict();

const chargeProjetModifier = z
  .object({
    projectId: identifiantOuReference,
    version: z.number().int().positive(),
    nom: z.string().min(1).max(160).optional(),
    description: z.string().max(5000).nullish(),
    statut: statutProjetPermis.optional(),
    priorite: enumDe(PRIORITES).optional(),
    dateDebut: date.optional(),
    dateFin: date.optional(),
    budgetHeures: z.number().min(0).nullish(),
    icone: z.string().max(80).nullish(),
    chefId: z.uuid().nullish(),
    sponsorId: z.uuid().nullish(),
    departementId: z.uuid().nullish(),
  })
  .strict();

const chargeJalonCreer = z
  .object({
    projectId: identifiantOuReference,
    nom: z.string().min(1).max(160),
    description: z.string().max(5000).optional(),
    /** Facultative : un jalon dont l'événement n'est pas encore programmé n'a pas de date. */
    dateEcheance: date.optional(),
  })
  .strict();

const chargeJalonModifier = z
  .object({
    milestoneId: identifiantOuReference,
    version: z.number().int().positive(),
    nom: z.string().min(1).max(160).optional(),
    description: z.string().max(5000).nullish(),
    dateEcheance: date.nullish(),
  })
  .strict();

const heure = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

const chargeTacheCreer = z
  .object({
    projectId: identifiantOuReference.nullish(),
    milestoneId: identifiantOuReference.nullish(),
    titre: z.string().min(1).max(200),
    description: z.string().max(10_000).optional(),
    statut: enumDe(STATUTS_TACHE).optional(),
    priorite: enumDe(PRIORITES).optional(),
    dateDebut: date.nullish(),
    dateFin: date.nullish(),
    heureDebut: heure.nullish(),
    heureFin: heure.nullish(),
    estimationHeures: z.number().min(0).optional(),
    avancement: z.number().int().min(0).max(100).optional(),
    interventionExterieure: z.boolean().optional(),
    /** Vide ou absent : le propriétaire du jeton. */
    assigneIds: z.array(z.uuid()).max(20).optional(),
  })
  .strict();

const chargeTacheModifier = z
  .object({
    taskId: identifiantOuReference,
    version: z.number().int().positive(),
    titre: z.string().min(1).max(200).optional(),
    description: z.string().max(10_000).nullish(),
    statut: enumDe(STATUTS_TACHE).optional(),
    priorite: enumDe(PRIORITES).optional(),
    dateDebut: date.nullish(),
    dateFin: date.nullish(),
    heureDebut: heure.nullish(),
    heureFin: heure.nullish(),
    estimationHeures: z.number().min(0).nullish(),
    avancement: z.number().int().min(0).max(100).optional(),
    milestoneId: identifiantOuReference.nullish(),
  })
  .strict();

const chargeEvenementCreer = z
  .object({
    titre: z.string().min(1).max(200),
    description: z.string().max(10_000).optional(),
    date,
    journeeEntiere: z.boolean().optional(),
    heureDebut: heure.nullish(),
    heureFin: heure.nullish(),
    projectId: identifiantOuReference.nullish(),
    interventionExterieure: z.boolean().optional(),
    /** Vide ou absent : le propriétaire du jeton. */
    participantIds: z.array(z.uuid()).max(50).optional(),
  })
  .strict();

const chargeEvenementModifier = z
  .object({
    eventId: identifiantOuReference,
    version: z.number().int().positive(),
    titre: z.string().min(1).max(200).optional(),
    description: z.string().max(10_000).nullish(),
    date: date.optional(),
    journeeEntiere: z.boolean().optional(),
    heureDebut: heure.nullish(),
    heureFin: heure.nullish(),
    projectId: identifiantOuReference.nullish(),
  })
  .strict();

const chargeTempsSaisir = z
  .object({
    date,
    heures: z.number().positive().max(24),
    typeActivite: enumDe(TYPES_ACTIVITE).optional(),
    projectId: identifiantOuReference.nullish(),
    taskId: identifiantOuReference.nullish(),
    description: z.string().max(2000).optional(),
  })
  .strict();

const chargeCommentaireAjouter = z
  .object({
    projectId: identifiantOuReference.nullish(),
    taskId: identifiantOuReference.nullish(),
    contenu: z.string().min(1).max(10_000),
  })
  .strict()
  .refine((c) => Boolean(c.projectId) !== Boolean(c.taskId), {
    message: "un commentaire porte sur un projet ou sur une tâche, pas les deux",
  });

const chargeSuiviModifier = planSuiviSchema.extend({
  projectId: identifiantOuReference,
  version: z.number().int().positive().optional(),
});

/** La charge de chaque type d'action. */
export const CHARGES_ACTION_AGENT = {
  projet_creer: chargeProjetCreer,
  projet_modifier: chargeProjetModifier,
  jalon_creer: chargeJalonCreer,
  jalon_modifier: chargeJalonModifier,
  tache_creer: chargeTacheCreer,
  tache_modifier: chargeTacheModifier,
  evenement_creer: chargeEvenementCreer,
  evenement_modifier: chargeEvenementModifier,
  temps_saisir: chargeTempsSaisir,
  commentaire_ajouter: chargeCommentaireAjouter,
  suivi_modifier: chargeSuiviModifier,
} as const satisfies Record<TypeActionAgent, z.ZodType>;

export type ChargeAction<T extends TypeActionAgent> = z.infer<(typeof CHARGES_ACTION_AGENT)[T]>;

const enveloppe = {
  /** Nom local de l'entité créée, que les actions suivantes du lot désignent par `@nom`. */
  reference: z.string().regex(REFERENCE_LOCALE).optional(),
  justification: z.string().min(1).max(2000),
  preuves: z.array(preuveSchema).min(1).max(PREUVES_PAR_ACTION),
};

export const actionAgentSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("projet_creer"), charge: chargeProjetCreer, ...enveloppe }).strict(),
  z.object({ type: z.literal("projet_modifier"), charge: chargeProjetModifier, ...enveloppe }).strict(),
  z.object({ type: z.literal("jalon_creer"), charge: chargeJalonCreer, ...enveloppe }).strict(),
  z.object({ type: z.literal("jalon_modifier"), charge: chargeJalonModifier, ...enveloppe }).strict(),
  z.object({ type: z.literal("tache_creer"), charge: chargeTacheCreer, ...enveloppe }).strict(),
  z.object({ type: z.literal("tache_modifier"), charge: chargeTacheModifier, ...enveloppe }).strict(),
  z.object({ type: z.literal("evenement_creer"), charge: chargeEvenementCreer, ...enveloppe }).strict(),
  z.object({ type: z.literal("evenement_modifier"), charge: chargeEvenementModifier, ...enveloppe }).strict(),
  z.object({ type: z.literal("temps_saisir"), charge: chargeTempsSaisir, ...enveloppe }).strict(),
  z.object({ type: z.literal("commentaire_ajouter"), charge: chargeCommentaireAjouter, ...enveloppe }).strict(),
  z.object({ type: z.literal("suivi_modifier"), charge: chargeSuiviModifier, ...enveloppe }).strict(),
]);
export type ActionAgent = z.infer<typeof actionAgentSchema>;

/**
 * Le dépôt d'un lot. Les actions sont validées une par une : une action mal
 * formée est refusée seule, et les suivantes sont exécutées.
 */
export const lotActionsSchema = z
  .object({ actions: z.array(z.unknown()).min(1).max(ACTIONS_PAR_LOT) })
  .strict();

// ── Passages ────────────────────────────────────────────────────────────────

export const pointOuvertSchema = z
  .object({
    projectId: z.uuid().optional(),
    texte: z.string().min(1).max(1000),
    preuves: z.array(preuveSchema).max(PREUVES_PAR_ACTION).optional(),
  })
  .strict();
export type PointOuvert = z.infer<typeof pointOuvertSchema>;

export const bilanPassageSchema = z
  .object({
    resume: z.string().max(4000).optional(),
    sources: z
      .array(
        z
          .object({
            type: z.string().min(1).max(80),
            designation: z.string().max(1000).optional(),
            signaux: z.number().int().min(0),
          })
          .strict(),
      )
      .max(200)
      .optional(),
    signauxLus: z.number().int().min(0).optional(),
    pointsOuverts: z.array(pointOuvertSchema).max(200).optional(),
    limites: z.array(z.string().min(1).max(500)).max(50).optional(),
    consommation: z
      .object({
        modele: z.string().max(120).optional(),
        jetonsEntree: z.number().int().min(0).optional(),
        jetonsSortie: z.number().int().min(0).optional(),
        cout: z.number().min(0).optional(),
        devise: z.string().max(8).optional(),
      })
      .strict()
      .optional(),
  })
  .strict();
export type BilanPassage = z.infer<typeof bilanPassageSchema>;

export const finPassageSchema = z
  .object({
    etat: z.enum(["terminee", "echec"]),
    bilan: bilanPassageSchema.optional(),
    erreur: z.string().max(2000).optional(),
  })
  .strict();

export const progressionPassageSchema = z
  .object({ libelle: z.string().min(1).max(200) })
  .strict();

export const nouveauPassageSchema = z
  .object({ projectIds: z.array(z.uuid()).max(500).optional() })
  .strict();

export const rejetActionSchema = z
  .object({ motif: z.string().max(1000).optional() })
  .strict();

// ── Jetons ──────────────────────────────────────────────────────────────────

export const nouveauJetonSchema = z
  .object({
    libelle: z.string().min(1).max(120),
    /** Vide ou absent : tous les types d'action (`RG-AST-05`). */
    typesAutorises: z
      .array(z.enum(Object.keys(CHARGES_ACTION_AGENT) as [TypeActionAgent, ...TypeActionAgent[]]))
      .max(20)
      .optional(),
    joursValidite: z.number().int().min(1).max(JOURS_VIE_JETON * 2).optional(),
  })
  .strict();

// ── Réglages ────────────────────────────────────────────────────────────────

/** Cinq champs cron, sans les extensions qui varieraient d'un moteur à l'autre. */
export const CRON_CINQ_CHAMPS = /^(\S+\s+){4}\S+$/;

export const reglagesAssistantSchema = z
  .object({
    mode: enumDe(MODES_ASSISTANT),
    planification: z.union([z.literal(""), z.string().max(120).regex(CRON_CINQ_CHAMPS)]),
    jalonObligatoire: z.boolean(),
    conservationJours: z.number().int().min(30).max(1830),
    actionsParPassage: z.number().int().min(1).max(1000),
    /** `RG-AST-21` — une création de projet attend la validation de son propriétaire. */
    validationProjets: z.boolean(),
  })
  .strict();
export type ReglagesAssistant = z.infer<typeof reglagesAssistantSchema>;

export const REGLAGES_ASSISTANT_DEFAUT: ReglagesAssistant = {
  mode: "desactive",
  planification: "",
  jalonObligatoire: true,
  conservationJours: 180,
  actionsParPassage: 500,
  validationProjets: true,
};

/** Le préfixe des clés de `settings` propres au module. */
export const PREFIXE_REGLAGES_ASSISTANT = "assistant.";
