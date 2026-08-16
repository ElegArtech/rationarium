/**
 * Schémas Zod — la validation d'entrée, partagée.
 *
 * Une seule définition, deux usages : le serveur valide via `nestjs-zod`, le
 * client type ses formulaires et ses réponses. Aucune génération de code à
 * orchestrer (ADR-0009).
 *
 * Les contraintes portées ici sont celles qui se vérifient **sur la donnée
 * seule**. Tout ce qui exige de consulter la base — solde suffisant,
 * chevauchement, appartenance à un projet — relève des règles serveur, pas de
 * ces schémas. Les y mettre donnerait une fausse impression de couverture.
 */

import { z } from "zod";
import {
  STATUTS_PROJET,
  STATUTS_TACHE,
  PRIORITES,
  DEMI_JOURNEES,
  PERIODES_JOURNEE,
  ETATS_TELETRAVAIL,
  TYPES_ACTIVITE,
  CATEGORIES_COMPETENCE,
  NIVEAUX_COMPETENCE,
  TYPES_TIERS,
  DUREES_TACHE_PREDEFINIE,
  ROLES_RACI,
  ROLES_PROJET,
} from "./vocabulaires.js";

/**
 * Le schéma Zod d'un vocabulaire de `cadrage/01 § 4.1`.
 *
 * Le type de sortie est **l'union littérale des codes**, pas `string` : c'est
 * ce qui permet à un contrôleur de passer directement le résultat validé à un
 * service typé, sans transtypage. Un `string` obligerait à réaffirmer à la
 * main ce que le schéma vient de vérifier — et ce genre d'affirmation survit
 * aux changements de vocabulaire sans broncher.
 */
export const enumDe = <T extends readonly { code: string }[]>(v: T) =>
  z.enum(v.map((t) => t.code) as [T[number]["code"], ...T[number]["code"][]]);

// ── Primitives métier ───────────────────────────────────────────────────────

export const uuid = z.string().uuid();

/**
 * Date métier : ISO `AAAA-MM-JJ`, sans heure ni fuseau (ADR-0010).
 * Le refus des instants est délibéré : accepter `2026-09-01T00:00:00Z` ici
 * ouvrirait la porte aux décalages d'un jour selon le fuseau du lecteur.
 */
export const dateMetier = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "date attendue au format AAAA-MM-JJ, sans heure ni fuseau")
  .refine((d) => !Number.isNaN(Date.parse(d)), "date inexistante");

/** Heure de la journée, `HH:MM`. */
export const heure = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "heure attendue au format HH:MM");

/**
 * RG-AUTH-06 — politique minimale : 8 caractères, une majuscule, un chiffre,
 * un caractère spécial. Les quatre critères sont vérifiés séparément pour que
 * l'interface puisse afficher lequel manque, comme l'exige la vue 02.
 */
export const motDePasse = z
  .string()
  .min(8, "8 caractères minimum")
  .regex(/[A-ZÀ-Þ]/, "une majuscule requise")
  .regex(/\d/, "un chiffre requis")
  .regex(/[^\p{L}\p{N}]/u, "un caractère spécial requis");

/** Une période dont la fin ne précède jamais le début. */
const periode = <T extends { dateDebut: string; dateFin: string }>(s: z.ZodType<T>) =>
  s.refine((v) => v.dateFin >= v.dateDebut, {
    message: "La date de fin doit être postérieure ou égale à la date de début.",
    path: ["dateFin"],
  });

// ── Authentification — M1 ───────────────────────────────────────────────────

export const connexionSchema = z.object({
  /** EX-AUTH-01 — identifiant **ou** email. */
  identifiant: z.string().min(1, "L'identifiant est requis"),
  motDePasse: z.string().min(1, "Le mot de passe est requis"),
});

export const inscriptionSchema = z
  .object({
    prenom: z.string().min(1),
    nom: z.string().min(1),
    email: z.string().email(),
    login: z.string().min(3).regex(/^[a-zA-Z0-9._-]+$/),
    motDePasse,
    confirmation: z.string(),
  })
  .refine((v) => v.motDePasse === v.confirmation, {
    message: "Les mots de passe ne correspondent pas",
    path: ["confirmation"],
  });

/** RG-AUTH-07 — le changement par l'intéressé exige le mot de passe actuel. */
export const changementMotDePasseSchema = z
  .object({
    actuel: z.string().min(1),
    nouveau: motDePasse,
    confirmation: z.string(),
  })
  .refine((v) => v.nouveau === v.confirmation, {
    message: "Les mots de passe ne correspondent pas",
    path: ["confirmation"],
  });

// ── Organisation — M2 ───────────────────────────────────────────────────────

export const directionSchema = z.object({
  nom: z.string().min(1).max(120),
  description: z.string().max(2000).optional(),
  responsableId: uuid.nullish(),
});

export const departementSchema = z.object({
  nom: z.string().min(1).max(120),
  description: z.string().max(2000).optional(),
  directionId: uuid.nullish(),
  responsableId: uuid.nullish(),
});

export const serviceSchema = z.object({
  nom: z.string().min(1).max(120),
  description: z.string().max(2000).optional(),
  departementId: uuid,
  managerId: uuid.nullish(),
});

// ── Utilisateurs — M3 ───────────────────────────────────────────────────────

export const utilisateurSchema = z.object({
  prenom: z.string().min(1).max(80),
  nom: z.string().min(1).max(80),
  email: z.string().email(),
  /** RG-AUTH-08 — non modifiable après création : absent des schémas de mise à jour. */
  login: z.string().min(3).max(60).regex(/^[a-zA-Z0-9._-]+$/),
  roleId: uuid.nullish(),
  departementId: uuid.nullish(),
  serviceIds: z.array(uuid).default([]),
  actif: z.boolean().default(true),
});

export const utilisateurMiseAJourSchema = utilisateurSchema.omit({ login: true }).partial();

// ── Projets — M4, M5 ────────────────────────────────────────────────────────

export const projetSchema = periode(
  z.object({
    nom: z.string().min(1).max(200),
    description: z.string().max(5000).optional(),
    statut: enumDe(STATUTS_PROJET).default("draft"),
    priorite: enumDe(PRIORITES).default("normal"),
    dateDebut: dateMetier,
    dateFin: dateMetier,
    budgetHeures: z.number().nonnegative().optional(),
    icone: z.string().max(60).optional(),
    chefId: uuid.nullish(),
    sponsorId: uuid.nullish(),
    departementId: uuid.nullish(),
  }),
);

export const jalonSchema = z.object({
  nom: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  dateEcheance: dateMetier,
  projectId: uuid,
  /** RG-JAL-01 — le statut est calculé, jamais saisi : il n'est pas dans le schéma. */
});

export const epopeeSchema = z.object({
  nom: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  projectId: uuid,
});

export const membreProjetSchema = z.object({
  userId: uuid,
  /*
   * `cadrage/01 § M4` énumère dix-sept rôles : ce n'est donc pas une chaîne
   * libre. En l'acceptant comme telle, deux projets pouvaient écrire « Chef de
   * projet » et « chef de projet », et la vue 14 n'avait aucune liste à
   * proposer dans son sélecteur.
   */
  roleProjet: enumDe(ROLES_PROJET),
  tauxAllocation: z.number().int().min(0).max(100).optional(),
});

// ── Tâches — M6 ─────────────────────────────────────────────────────────────

export const tacheSchema = z
  .object({
    titre: z.string().min(1).max(300),
    description: z.string().max(10000).optional(),
    statut: enumDe(STATUTS_TACHE).default("todo"),
    priorite: enumDe(PRIORITES).default("normal"),
    /** RG-TSK-01 — l'absence de projet est un cas nominal, pas une anomalie. */
    projectId: uuid.nullish(),
    milestoneId: uuid.nullish(),
    epicId: uuid.nullish(),
    assigneIds: z.array(uuid).default([]),
    serviceIds: z.array(uuid).default([]),
    dateDebut: dateMetier.nullish(),
    dateFin: dateMetier.nullish(),
    heureDebut: heure.nullish(),
    heureFin: heure.nullish(),
    estimationHeures: z.number().nonnegative().optional(),
    avancement: z.number().int().min(0).max(100).default(0),
    confidentielle: z.boolean().default(false),
    interventionExterieure: z.boolean().default(false),
  })
  .refine((v) => !v.dateDebut || !v.dateFin || v.dateFin >= v.dateDebut, {
    message: "La date de fin doit être postérieure ou égale à la date de début.",
    path: ["dateFin"],
  })
  /** RG-JAL-04 — une tâche hors projet ne se rattache ni à un jalon ni à une épopée. */
  .refine((v) => v.projectId || (!v.milestoneId && !v.epicId), {
    message: "Une tâche hors projet ne peut être rattachée ni à un jalon ni à une épopée.",
    path: ["milestoneId"],
  });

export const sousTacheSchema = z.object({
  libelle: z.string().min(1).max(300),
  fait: z.boolean().default(false),
  ordre: z.number().int().nonnegative(),
});

export const raciSchema = z.object({
  userId: uuid,
  role: enumDe(ROLES_RACI),
});

// ── Congés — M10 ────────────────────────────────────────────────────────────

export const demandeCongeSchema = periode(
  z.object({
    typeId: uuid,
    dateDebut: dateMetier,
    dateFin: dateMetier,
    demiJourneeDebut: enumDe(DEMI_JOURNEES).nullish(),
    demiJourneeFin: enumDe(DEMI_JOURNEES).nullish(),
    motif: z.string().max(2000).optional(),
    /** EX-CNG-08 — déclarer pour un collaborateur ; exige la permission dédiée. */
    userId: uuid.optional(),
  }),
).refine(
  (v) =>
    v.dateDebut !== v.dateFin ||
    !v.demiJourneeFin ||
    v.demiJourneeDebut === v.demiJourneeFin,
  {
    /** RG-CNG-18 — la demi-journée simple ne vaut que pour un congé d'un jour. */
    message: "Une demi-journée ne s'applique qu'à un congé d'une seule journée.",
    path: ["demiJourneeFin"],
  },
);

export const decisionCongeSchema = z.discriminatedUnion("decision", [
  z.object({ decision: z.literal("approve") }),
  z.object({
    decision: z.literal("refuse"),
    /** EX-CNG-05 — le refus porte son motif. */
    motifRefus: z.string().min(1, "Le motif de refus est requis").max(2000),
  }),
]);

export const typeCongeSchema = z.object({
  code: z.string().min(1).max(20).regex(/^[A-Z0-9_]+$/),
  nom: z.string().min(1).max(120),
  description: z.string().max(2000).optional(),
  icone: z.string().max(60).optional(),
  couleur: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  remunere: z.boolean().default(true),
  validationRequise: z.boolean().default(true),
  limiteAnnuelle: z.number().nonnegative().nullish(),
  ordre: z.number().int().nonnegative().default(0),
  actif: z.boolean().default(true),
});

export const delegationSchema = periode(
  z.object({
    delegueId: uuid,
    dateDebut: dateMetier,
    dateFin: dateMetier,
  }),
);

// ── Télétravail — M11 ───────────────────────────────────────────────────────

export const teletravailSchema = z.object({
  userId: uuid.optional(),
  date: dateMetier,
  etat: enumDe(ETATS_TELETRAVAIL),
});

export const regleTeletravailSchema = z.object({
  userId: uuid.optional(),
  jourSemaine: z.number().int().min(0).max(6),
  dateDebut: dateMetier,
  dateFin: dateMetier.nullish(),
  active: z.boolean().default(true),
});

// ── Activité récurrente — M8 ────────────────────────────────────────────────

export const tachePredefinieSchema = z
  .object({
    nom: z.string().min(1).max(200),
    description: z.string().max(2000).optional(),
    couleur: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
    icone: z.string().max(60).optional(),
    dureeParDefaut: enumDe(DUREES_TACHE_PREDEFINIE).default("full_day"),
    heureDebut: heure.nullish(),
    heureFin: heure.nullish(),
    teletravailAutorise: z.boolean().default(true),
    poids: z.number().int().min(1).max(5).default(1),
    actif: z.boolean().default(true),
  })
  /** RG-ACT-02 — une durée « créneau horaire » exige ses horaires. */
  .refine((v) => v.dureeParDefaut !== "time_slot" || (v.heureDebut && v.heureFin), {
    message: "Une tâche de durée « créneau horaire » exige une heure de début et une heure de fin.",
    path: ["heureDebut"],
  });

export const assignationSchema = z.object({
  predefinedTaskId: uuid,
  userIds: z.array(uuid).min(1),
  date: dateMetier,
  periode: enumDe(PERIODES_JOURNEE).default("full_day"),
});

// ── Événements — M9 ─────────────────────────────────────────────────────────

export const evenementSchema = z
  .object({
    titre: z.string().min(1).max(300),
    description: z.string().max(5000).optional(),
    date: dateMetier,
    journeeEntiere: z.boolean().default(false),
    heureDebut: heure.nullish(),
    heureFin: heure.nullish(),
    projectId: uuid.nullish(),
    participantIds: z.array(uuid).default([]),
    serviceIds: z.array(uuid).default([]),
    interventionExterieure: z.boolean().default(false),
    recurrenceFrequence: z.number().int().min(1).max(52).nullish(),
    recurrenceJourSemaine: z.number().int().min(0).max(6).nullish(),
    recurrenceFin: dateMetier.nullish(),
  })
  .refine((v) => v.journeeEntiere || (v.heureDebut && v.heureFin), {
    message: "Un événement qui n'occupe pas la journée entière porte ses horaires.",
    path: ["heureDebut"],
  })
  .refine((v) => !v.heureDebut || !v.heureFin || v.heureFin > v.heureDebut, {
    message: "L'heure de fin doit être postérieure à l'heure de début.",
    path: ["heureFin"],
  });

// ── Temps passé — M12 ───────────────────────────────────────────────────────

export const saisieTempsSchema = z
  .object({
    date: dateMetier,
    heures: z.number().positive().max(24),
    typeActivite: enumDe(TYPES_ACTIVITE).default("development"),
    projectId: uuid.nullish(),
    taskId: uuid.nullish(),
    description: z.string().max(2000).optional(),
    /** EX-TMP-08 — déclarer pour un tiers externe ; exige la permission dédiée. */
    thirdPartyId: uuid.nullish(),
  })
  /** RG-TMP-01 — une saisie référence au minimum une tâche ou un projet. */
  .refine((v) => v.projectId || v.taskId, {
    message: "Une saisie de temps doit référencer au minimum une tâche ou un projet.",
    path: ["projectId"],
  });

// ── Compétences — M13 ───────────────────────────────────────────────────────

export const competenceSchema = z.object({
  nom: z.string().min(1).max(200),
  categorie: enumDe(CATEGORIES_COMPETENCE),
  description: z.string().max(2000).optional(),
  effectifRequis: z.number().int().min(1).default(1),
});

export const competenceDetenueSchema = z.object({
  userId: uuid,
  skillId: uuid,
  niveau: enumDe(NIVEAUX_COMPETENCE),
});

// ── Tiers et clients — M14 ──────────────────────────────────────────────────

export const tiersSchema = z
  .object({
    type: enumDe(TYPES_TIERS),
    organisation: z.string().max(200).nullish(),
    contactNom: z.string().max(160).nullish(),
    contactEmail: z.string().email().nullish(),
    contactTelephone: z.string().max(40).nullish(),
    notes: z.string().max(5000).optional(),
    actif: z.boolean().default(true),
  })
  /** RG-TRS-01 — une personne morale ne porte pas de contact nommé. */
  .refine((v) => v.type !== "organisation" || !v.contactNom, {
    message: "Une personne morale ne porte pas de contact nommé.",
    path: ["contactNom"],
  });

export const clientSchema = z.object({
  nom: z.string().min(1).max(200),
  contactNom: z.string().max(160).nullish(),
  contactEmail: z.string().email().nullish(),
  contactTelephone: z.string().max(40).nullish(),
  adresse: z.string().max(500).nullish(),
  notes: z.string().max(5000).optional(),
  actif: z.boolean().default(true),
});

// ── Calendrier — M19 ────────────────────────────────────────────────────────

export const jourFerieSchema = z.object({
  date: dateMetier,
  libelle: z.string().min(1).max(160),
  type: z.string().max(40).default("legal"),
  /** RG-PRM-01 — un jour férié marqué ouvré compte comme jour travaillé. */
  ouvre: z.boolean().default(false),
  recurrent: z.boolean().default(false),
});

export const vacancesScolairesSchema = periode(
  z.object({
    libelle: z.string().min(1).max(160),
    dateDebut: dateMetier,
    dateFin: dateMetier,
    zone: z.string().min(1).max(10),
    anneeScolaire: z.string().regex(/^\d{4}-\d{4}$/),
  }),
);

// ── Divers ──────────────────────────────────────────────────────────────────

export const commentaireSchema = z.object({
  contenu: z.string().min(1).max(10000),
});

export const todoSchema = z.object({
  libelle: z.string().min(1).max(300),
  fait: z.boolean().default(false),
});

/** Fenêtre du planning — RG-TLT-06 borne une plage à 366 jours. */
export const plagePlanningSchema = periode(
  z.object({
    dateDebut: dateMetier,
    dateFin: dateMetier,
  }),
).refine(
  (v) => (Date.parse(v.dateFin) - Date.parse(v.dateDebut)) / 86_400_000 <= 366,
  { message: "Une plage interrogée ne peut excéder 366 jours.", path: ["dateFin"] },
);

export type Connexion = z.infer<typeof connexionSchema>;
export type Projet = z.infer<typeof projetSchema>;
export type Tache = z.infer<typeof tacheSchema>;
export type DemandeConge = z.infer<typeof demandeCongeSchema>;
export type SaisieTemps = z.infer<typeof saisieTempsSchema>;
