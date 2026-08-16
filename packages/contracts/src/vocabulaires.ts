/**
 * Vocabulaires — `cadrage/01 § 4.1`.
 *
 * Définition unique, employée par le serveur, le client, les énumérations en
 * base et les tests. Toute énumération locale d'un de ces vocabulaires est
 * interdite : une règle ESLint le refuse.
 *
 * Les valeurs sont arrêtées après l'arbitrage B1 du 2026-08-16 : priorité à
 * quatre niveaux, statut de projet à cinq valeurs. Voir `cadrage/03 § 7`.
 */

/** Décrit une valeur d'énumération : son code technique et ses libellés. */
export type Terme<C extends string> = {
  readonly code: C;
  readonly fr: string;
  readonly en: string;
};

const vocabulaire = <const T extends readonly Terme<string>[]>(termes: T) => termes;

// ── Projets ─────────────────────────────────────────────────────────────────

export const STATUTS_PROJET = vocabulaire([
  { code: "draft", fr: "Brouillon", en: "Draft" },
  { code: "active", fr: "Actif", en: "Active" },
  { code: "paused", fr: "Suspendu", en: "Paused" },
  { code: "done", fr: "Terminé", en: "Completed" },
  { code: "cancelled", fr: "Annulé", en: "Cancelled" },
]);
export type StatutProjet = (typeof STATUTS_PROJET)[number]["code"];

// ── Tâches ──────────────────────────────────────────────────────────────────

export const STATUTS_TACHE = vocabulaire([
  { code: "todo", fr: "À faire", en: "To do" },
  { code: "doing", fr: "En cours", en: "In progress" },
  { code: "review", fr: "En revue", en: "In review" },
  { code: "done", fr: "Terminé", en: "Done" },
  { code: "blocked", fr: "Bloqué", en: "Blocked" },
]);
export type StatutTache = (typeof STATUTS_TACHE)[number]["code"];

export const STATUTS_JALON = vocabulaire([
  { code: "pending", fr: "En attente", en: "Pending" },
  { code: "doing", fr: "En cours", en: "In progress" },
  { code: "done", fr: "Terminé", en: "Completed" },
]);
export type StatutJalon = (typeof STATUTS_JALON)[number]["code"];

/**
 * Rôles dans l'équipe projet — `cadrage/01 § M4`, dix-sept valeurs énumérées.
 *
 * **Le cadrage les énumère, donc ce n'est pas une chaîne libre.** Le contrat
 * les acceptait pourtant en `z.string().max(80)` : deux projets pouvaient
 * écrire « Chef de projet » et « chef de projet », et la vue 14 n'avait aucune
 * liste à proposer — son sélecteur de rôle, que la maquette dessine sur chaque
 * ligne d'équipe, n'avait pas d'options.
 *
 * L'ordre est celui du cadrage : il va du pilotage à l'observation, et c'est
 * l'ordre dans lequel une équipe se lit.
 */
export const ROLES_PROJET = vocabulaire([
  { code: "sponsor", fr: "Sponsor", en: "Sponsor" },
  { code: "chef_de_projet", fr: "Chef de projet", en: "Project manager" },
  { code: "responsable_technique", fr: "Responsable technique", en: "Technical manager" },
  { code: "architecte", fr: "Architecte", en: "Architect" },
  { code: "tech_lead", fr: "Tech Lead", en: "Tech lead" },
  { code: "developpeur_senior", fr: "Développeur senior", en: "Senior developer" },
  { code: "developpeur", fr: "Développeur", en: "Developer" },
  { code: "developpeur_junior", fr: "Développeur junior", en: "Junior developer" },
  { code: "devops", fr: "DevOps", en: "DevOps" },
  { code: "qa_lead", fr: "QA Lead", en: "QA lead" },
  { code: "testeur", fr: "Testeur", en: "Tester" },
  { code: "designer", fr: "UX/UI Designer", en: "UX/UI designer" },
  { code: "product_owner", fr: "Product Owner", en: "Product owner" },
  { code: "scrum_master", fr: "Scrum Master", en: "Scrum master" },
  { code: "analyste_metier", fr: "Analyste métier", en: "Business analyst" },
  { code: "membre", fr: "Membre", en: "Member" },
  { code: "observateur", fr: "Observateur", en: "Observer" },
]);
export type RoleProjet = (typeof ROLES_PROJET)[number]["code"];

/**
 * Priorité — quatre niveaux (arbitrage B1).
 * « Moyenne » et « Urgente » écartés : la première n'était pas distinguable de
 * « Normale », la seconde faisait doublon avec « Critique ».
 */
export const PRIORITES = vocabulaire([
  { code: "low", fr: "Basse", en: "Low" },
  { code: "normal", fr: "Normale", en: "Normal" },
  { code: "high", fr: "Haute", en: "High" },
  { code: "critical", fr: "Critique", en: "Critical" },
]);
export type Priorite = (typeof PRIORITES)[number]["code"];

/** Rôles RACI sur une tâche — `cadrage/01 § 4`. */
export const ROLES_RACI = vocabulaire([
  { code: "responsible", fr: "Responsable", en: "Responsible" },
  { code: "accountable", fr: "Autorité", en: "Accountable" },
  { code: "consulted", fr: "Consulté", en: "Consulted" },
  { code: "informed", fr: "Informé", en: "Informed" },
]);
export type RoleRaci = (typeof ROLES_RACI)[number]["code"];

// ── Congés et présence ──────────────────────────────────────────────────────

/**
 * Statut de congé. `cancellation_requested` est l'état transitoire de
 * `RG-CNG-01` : Approuvé → Annulation demandée → (Annulé | retour Approuvé).
 */
export const STATUTS_CONGE = vocabulaire([
  { code: "pending", fr: "En attente", en: "Pending" },
  { code: "approved", fr: "Approuvé", en: "Approved" },
  { code: "refused", fr: "Refusé", en: "Refused" },
  { code: "cancelled", fr: "Annulé", en: "Cancelled" },
  { code: "cancellation_requested", fr: "Annulation demandée", en: "Cancellation requested" },
]);
export type StatutConge = (typeof STATUTS_CONGE)[number]["code"];

/** Demi-journée — `RG-CNG-17`, `RG-CNG-18`. */
export const DEMI_JOURNEES = vocabulaire([
  { code: "morning", fr: "Matin", en: "Morning" },
  { code: "afternoon", fr: "Après-midi", en: "Afternoon" },
]);
export type DemiJournee = (typeof DEMI_JOURNEES)[number]["code"];

/** Période de journée — inclut la journée entière, contrairement à la demi-journée. */
export const PERIODES_JOURNEE = vocabulaire([
  { code: "morning", fr: "Matin", en: "Morning" },
  { code: "afternoon", fr: "Après-midi", en: "Afternoon" },
  { code: "full_day", fr: "Journée entière", en: "Full day" },
]);
export type PeriodeJournee = (typeof PERIODES_JOURNEE)[number]["code"];

/** Trois états par jour, plus le week-end distingué — `RG-TLT-02`. */
export const ETATS_TELETRAVAIL = vocabulaire([
  { code: "telework", fr: "Télétravail", en: "Telework" },
  { code: "office", fr: "Bureau", en: "Office" },
  { code: "undeclared", fr: "Non déclaré", en: "Undeclared" },
]);
export type EtatTeletravail = (typeof ETATS_TELETRAVAIL)[number]["code"];

// ── Temps et compétences ────────────────────────────────────────────────────

export const TYPES_ACTIVITE = vocabulaire([
  { code: "development", fr: "Développement", en: "Development" },
  { code: "meeting", fr: "Réunion", en: "Meeting" },
  { code: "support", fr: "Support", en: "Support" },
  { code: "training", fr: "Formation", en: "Training" },
  { code: "other", fr: "Autre", en: "Other" },
]);
export type TypeActivite = (typeof TYPES_ACTIVITE)[number]["code"];

export const CATEGORIES_COMPETENCE = vocabulaire([
  { code: "technical", fr: "Technique", en: "Technical" },
  { code: "methodology", fr: "Méthodologie", en: "Methodology" },
  { code: "soft_skill", fr: "Savoir-être", en: "Soft skill" },
  { code: "business", fr: "Métier", en: "Business" },
]);
export type CategorieCompetence = (typeof CATEGORIES_COMPETENCE)[number]["code"];

export const NIVEAUX_COMPETENCE = vocabulaire([
  { code: "beginner", fr: "Débutant", en: "Beginner" },
  { code: "intermediate", fr: "Intermédiaire", en: "Intermediate" },
  { code: "expert", fr: "Expert", en: "Expert" },
  { code: "master", fr: "Maître", en: "Master" },
]);
export type NiveauCompetence = (typeof NIVEAUX_COMPETENCE)[number]["code"];

// ── Tiers, activité récurrente, santé ───────────────────────────────────────

export const TYPES_TIERS = vocabulaire([
  { code: "individual", fr: "Personne physique", en: "Individual" },
  { code: "organisation", fr: "Personne morale", en: "Organisation" },
]);
export type TypeTiers = (typeof TYPES_TIERS)[number]["code"];

/** Durée d'une tâche prédéfinie — `RG-ACT-02` impose des horaires pour `time_slot`. */
export const DUREES_TACHE_PREDEFINIE = vocabulaire([
  { code: "half_day", fr: "Demi-journée", en: "Half day" },
  { code: "full_day", fr: "Journée entière", en: "Full day" },
  { code: "time_slot", fr: "Créneau horaire", en: "Time slot" },
]);
export type DureeTachePredefinie = (typeof DUREES_TACHE_PREDEFINIE)[number]["code"];

/** Santé de projet — `cadrage/01 § M17`, calculée, jamais saisie. */
export const SANTES_PROJET = vocabulaire([
  { code: "good", fr: "Bon", en: "Good" },
  { code: "warning", fr: "Attention", en: "Warning" },
  { code: "critical", fr: "Critique", en: "Critical" },
]);
export type SanteProjet = (typeof SANTES_PROJET)[number]["code"];

/** RAG du Gantt portefeuille — `cadrage/01 § M17`. */
export const ETATS_RAG = vocabulaire([
  { code: "on_track", fr: "On track", en: "On track" },
  { code: "at_risk", fr: "À risque", en: "At risk" },
  { code: "late", fr: "En retard", en: "Late" },
  { code: "upcoming", fr: "À venir", en: "Upcoming" },
  { code: "done", fr: "Terminé", en: "Completed" },
]);
export type EtatRag = (typeof ETATS_RAG)[number]["code"];

// ── Index ───────────────────────────────────────────────────────────────────

/**
 * Tous les vocabulaires, indexés. Employé par les contrôles de cohérence et
 * par la génération des catalogues de traduction.
 */
export const VOCABULAIRES = {
  statutProjet: STATUTS_PROJET,
  statutTache: STATUTS_TACHE,
  statutJalon: STATUTS_JALON,
  priorite: PRIORITES,
  roleProjet: ROLES_PROJET,
  roleRaci: ROLES_RACI,
  statutConge: STATUTS_CONGE,
  demiJournee: DEMI_JOURNEES,
  periodeJournee: PERIODES_JOURNEE,
  etatTeletravail: ETATS_TELETRAVAIL,
  typeActivite: TYPES_ACTIVITE,
  categorieCompetence: CATEGORIES_COMPETENCE,
  niveauCompetence: NIVEAUX_COMPETENCE,
  typeTiers: TYPES_TIERS,
  dureeTachePredefinie: DUREES_TACHE_PREDEFINIE,
  santeProjet: SANTES_PROJET,
  etatRag: ETATS_RAG,
} as const;

export type NomVocabulaire = keyof typeof VOCABULAIRES;

/** Codes d'un vocabulaire, pour construire une énumération Zod ou Prisma. */
export const codes = <N extends NomVocabulaire>(nom: N): string[] =>
  VOCABULAIRES[nom].map((t) => t.code);
