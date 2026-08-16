/**
 * Catalogue des permissions atomiques — `cadrage/01 § 3.2`.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * DÉCISION PRISE EN AUTONOMIE — 2026-08-16, réversible
 *
 * `cadrage/01 § 3.2` annonce « ≈ 125 permissions », donne la nomenclature, les
 * familles d'actions et les 24 domaines couverts — mais **ne les énumère pas**.
 * C'est un trou de spécification, relevé comme tel au montage du plan.
 *
 * Le catalogue ci-dessous est produit par croisement domaine × actions
 * applicables, plus les permissions nommées citées en exemple par le cadrage.
 * Les choix d'attribution sont motivés domaine par domaine.
 *
 * Il est **réversible** : c'est une donnée, pas une structure. Ajouter, retirer
 * ou renommer une permission ne demande aucune refonte — seulement de rejouer
 * les tests, qui vérifient la fermeture du catalogue et la validité des rôles.
 * ────────────────────────────────────────────────────────────────────────────
 *
 * Nomenclature : `domaine:action`.
 *
 * Familles d'actions, telles que définies par le cadrage :
 *   read · create · update · delete   opérations de base sur son propre périmètre
 *   readAll                            lecture au-delà de son périmètre
 *   manage_any                         modification d'objets dont on n'est pas propriétaire
 *   read_team                          lecture restreinte à son équipe / service
 *   permissions nommées                comportements spécifiques
 *
 * `RG-DROITS-03` — toute permission absente est refusée par défaut (liste blanche).
 */

/** Les 24 domaines de `cadrage/01 § 3.2`, dans l'ordre du document. */
export const DOMAINES = [
  "audit",
  "clients",
  "comments",
  "departments",
  "directions",
  "documents",
  "epics",
  "events",
  "holidays",
  "leaves",
  "milestones",
  "planning",
  "predefined_tasks",
  "projects",
  "reports",
  "school_vacations",
  "services",
  "settings",
  "skills",
  "tasks",
  "telework",
  "third_parties",
  "time_tracking",
  "users",
] as const;

export type Domaine = (typeof DOMAINES)[number];

const CRUD = ["read", "create", "update", "delete"] as const;

/**
 * Actions applicables par domaine, et pourquoi.
 *
 * Le principe d'attribution : un domaine reçoit `readAll` quand un périmètre
 * organisationnel le restreint (`RG-SCOPE-01`) ; `manage_any` quand ses objets
 * ont un propriétaire ; `read_team` quand le cadrage prévoit explicitement une
 * lecture d'équipe.
 */
const ACTIONS_PAR_DOMAINE: Record<Domaine, readonly string[]> = {
  /** Lecture seule, et l'accès refusé est lui-même tracé (`RG-ADM-03`). */
  audit: ["read"],

  clients: [...CRUD],
  /** Un commentaire a un auteur : agir sur celui d'autrui exige `manage_any` (`RG-DOC-01`). */
  comments: [...CRUD, "manage_any"],
  departments: [...CRUD],
  directions: [...CRUD],
  /** `RG-DOC-02` : lecture et téléchargement sont tracés, donc distincts. */
  documents: [...CRUD, "download", "manage_any"],
  epics: [...CRUD],
  /** Événements : périmètre organisationnel, et participants d'autrui. */
  events: [...CRUD, "readAll", "manage_any"],
  holidays: [...CRUD, "import"],
  /** Le domaine le plus riche : validation, délégation, soldes, déclaration pour autrui. */
  leaves: [
    ...CRUD,
    "readAll",
    "read_team",
    "manage_any",
    "approve",
    "self_approve",
    "declare_for_other",
    "request_cancellation",
    "manage_types",
    "manage_balances",
    "manage_delegations",
    "import",
  ],
  milestones: [...CRUD, "import"],
  /** Le planning est une vue, pas un CRUD : seule la portée de lecture varie. */
  planning: ["read", "read_team", "readAll", "export_ics", "import_ics"],
  predefined_tasks: [...CRUD, "assign", "assign_bulk", "generate"],
  projects: [...CRUD, "readAll", "manage_any", "archive", "manage_members", "import", "export"],
  reports: ["read", "readAll", "export"],
  school_vacations: [...CRUD, "import"],
  services: [...CRUD],
  settings: ["read", "update", "reset"],
  skills: [...CRUD, "manage_matrix", "read_team", "import", "export"],
  tasks: [
    ...CRUD,
    "readAll",
    "manage_any",
    "create_standalone",
    "assign_any_user",
    "read_confidential",
    "manage_dependencies",
    "manage_raci",
    "import",
    "export",
  ],
  telework: [...CRUD, "read_team", "readAll", "manage_any", "manage_rules", "generate"],
  third_parties: [...CRUD, "assign"],
  time_tracking: [...CRUD, "readAll", "read_team", "declare_for_third_party", "validate_without_entry"],
  /** Cycle de vie des comptes : désactivation et suppression définitive distinctes (`RG-GEN-10`). */
  users: [
    ...CRUD,
    "readAll",
    "manage_any",
    "deactivate",
    "delete_permanently",
    "reset_password",
    "manage_roles",
    "manage_permissions",
    "import",
    "read_individual_tracking",
  ],
};

/** Le catalogue, engendré et figé. */
export const PERMISSIONS: readonly string[] = Object.entries(ACTIONS_PAR_DOMAINE)
  .flatMap(([domaine, actions]) => actions.map((a) => `${domaine}:${a}`))
  .sort();

export type Permission = string;

/** Nombre de permissions au catalogue. Contrôlé par un test : il ne dérive pas en silence. */
export const NOMBRE_PERMISSIONS = PERMISSIONS.length;

const ENSEMBLE = new Set(PERMISSIONS);

/** Une permission existe-t-elle au catalogue ? Liste blanche stricte (`RG-DROITS-03`). */
export const estAuCatalogue = (p: string): boolean => ENSEMBLE.has(p);

/** Les permissions d'un domaine donné. */
export const permissionsDuDomaine = (d: Domaine): readonly string[] =>
  (ACTIONS_PAR_DOMAINE[d] ?? []).map((a) => `${d}:${a}`);

/**
 * Permissions de gestion globale — elles court-circuitent le prédicat de
 * périmètre (`RG-SCOPE-03`). Liste fermée et volontairement courte : chaque
 * ajout élargit la vue complète de l'instance à un rôle de plus.
 */
export const PERMISSIONS_GESTION_GLOBALE: readonly string[] = [
  "users:manage_any",
  "tasks:manage_any",
  "projects:manage_any",
  "leaves:manage_any",
  "telework:manage_any",
  "events:manage_any",
] as const;
