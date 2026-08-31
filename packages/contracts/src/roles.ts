/**
 * Modèles de rôles — `cadrage/01 § 3.2`.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * DÉCISION PRISE EN AUTONOMIE — 2026-08-16, réversible
 *
 * Le cadrage **nomme** 26 modèles de rôles et les groupe en familles, mais ne
 * spécifie nulle part leur contenu en permissions. Second trou de
 * spécification, relevé au montage du plan.
 *
 * Les compositions ci-dessous sont dérivées des personas de `§ 3.1` et des
 * variantes par rôle décrites dans les briefs de `cadrage/02`. Chaque modèle
 * porte le raisonnement qui l'a produit.
 *
 * `RG-DROITS-01` — un modèle est un point de départ, pas une contrainte : un
 * administrateur peut composer un rôle sur mesure. Ces modèles sont donc des
 * **données d'amorçage**, et les corriger n'a aucun coût structurel.
 * ────────────────────────────────────────────────────────────────────────────
 */

import { PERMISSIONS, permissionsDuDomaine, type Domaine } from "./permissions.js";

export type ModeleRole = {
  readonly code: string;
  readonly nom: string;
  readonly famille: string;
  /** `RG-DROITS-02` — un rôle système n'est ni supprimable ni renommable. */
  readonly systeme: boolean;
  readonly description: string;
  readonly permissions: readonly string[];
};

// ── Briques de composition ──────────────────────────────────────────────────

const tout = (...d: Domaine[]) => d.flatMap(permissionsDuDomaine);
const lecture = (...d: Domaine[]) => d.map((x) => `${x}:read`);

/**
 * Socle commun à tout compte actif. C'est ce que Camille, agent contributeur,
 * doit avoir pour que sa journée fonctionne — et sa barre latérale tient en
 * huit entrées (`cadrage/02 § B`).
 */
const SOCLE = [
  "planning:read",
  "projects:read",
  "tasks:read",
  "tasks:create_standalone",
  "tasks:update",
  "events:read",
  "leaves:read",
  "leaves:create",
  "leaves:update",
  "leaves:delete",
  "leaves:request_cancellation",
  "telework:read",
  "telework:create",
  "telework:update",
  "telework:delete",
  "time_tracking:read",
  "time_tracking:create",
  "time_tracking:delete",
  "time_tracking:validate_without_entry",
  "skills:read",
  "comments:read",
  "comments:create",
  "comments:update",
  "comments:delete",
  "documents:read",
  "documents:download",
  "settings:read",
];

/** Contribution à un projet dont on est membre. */
const CONTRIBUTION_PROJET = [
  "tasks:create",
  "tasks:delete",
  "tasks:manage_dependencies",
  "documents:create",
  "documents:update",
  "documents:delete",
  "milestones:read",
  "epics:read",
];

/** Conduite d'un projet : structuration, équipe, feuille de route. */
const CONDUITE_PROJET = [
  ...CONTRIBUTION_PROJET,
  "projects:create",
  "projects:update",
  "projects:archive",
  "projects:manage_members",
  "projects:import",
  "projects:export",
  ...tout("milestones", "epics"),
  "tasks:assign_any_user",
  "tasks:manage_raci",
  "tasks:import",
  "tasks:export",
  "events:create",
  "events:update",
  "events:delete",
  "third_parties:read",
  "third_parties:assign",
  "clients:read",
  "reports:read",
];

/** Encadrement d'une équipe : validation, visibilité, suivi individuel. */
const ENCADREMENT = [
  "leaves:read_team",
  "leaves:approve",
  "leaves:declare_for_other",
  "leaves:manage_any",
  "telework:read_team",
  "telework:manage_any",
  "telework:manage_rules",
  "time_tracking:read_team",
  /*
   * `RG-TMP-04` — déclarer du temps pour quelqu'un d'autre. La permission
   * existait au catalogue et **aucun modèle de rôle ne la détenait** : la règle
   * était donc inapplicable, et le service ne l'appliquait pas. Elle rejoint
   * l'encadrement, qui porte déjà `leaves:declare_for_other` — le même geste,
   * pour l'autre domaine.
   */
  "time_tracking:declare_for_third_party",
  "planning:read_team",
  "users:read",
  "users:read_individual_tracking",
  "skills:read_team",
  "reports:read",
  "departments:read",
  "directions:read",
  "services:read",
  "events:readAll",
  "tasks:readAll",
  "predefined_tasks:read",
  "predefined_tasks:assign",
];

/** Administration du référentiel des ressources humaines. */
const RH = [
  ...tout("leaves"),
  ...tout("telework"),
  "users:read",
  "users:readAll",
  "users:create",
  "users:update",
  "users:deactivate",
  "users:reset_password",
  "users:import",
  "users:read_individual_tracking",
  "holidays:read",
  "school_vacations:read",
  "skills:read",
  "skills:read_team",
  "reports:read",
  "reports:readAll",
];

const dedoublonne = (p: readonly string[]) => [...new Set(p)].sort();

// ── Les 26 modèles ──────────────────────────────────────────────────────────

export const MODELES_ROLES: readonly ModeleRole[] = [
  // Administration ──────────────────────────────────────────────────────────
  {
    code: "ADMIN",
    nom: "Administrateur",
    famille: "Administration",
    systeme: true,
    description: "Accès complet. Karim : comptes, rôles, calendrier, audit.",
    permissions: [...PERMISSIONS],
  },
  {
    code: "ADMIN_DELEGATED",
    nom: "Administrateur délégué",
    famille: "Administration",
    systeme: true,
    description:
      "Administration courante sans la gouvernance des droits ni le journal d'audit — la séparation qui empêche un délégué de s'octroyer des permissions.",
    permissions: dedoublonne(
      PERMISSIONS.filter(
        (p) =>
          !p.startsWith("audit:") &&
          p !== "users:manage_roles" &&
          p !== "users:manage_permissions" &&
          p !== "users:delete_permanently",
      ),
    ),
  },

  // Management ──────────────────────────────────────────────────────────────
  {
    code: "PORTFOLIO_MANAGER",
    nom: "Responsable de portefeuille",
    famille: "Management",
    systeme: true,
    description: "Inès : la santé du portefeuille en une page, les jalons à risque, la charge par service.",
    permissions: dedoublonne([
      ...SOCLE,
      ...ENCADREMENT,
      "projects:readAll",
      "projects:manage_any",
      "projects:create",
      "projects:update",
      "projects:archive",
      "projects:export",
      "reports:readAll",
      "reports:export",
      "planning:readAll",
      "users:readAll",
    ]),
  },
  {
    code: "MANAGER",
    nom: "Manager de service",
    famille: "Management",
    systeme: true,
    description: "Fatou : valider les congés en connaissant l'impact, repérer les surcharges, suivre un agent.",
    permissions: dedoublonne([...SOCLE, ...CONTRIBUTION_PROJET, ...ENCADREMENT]),
  },
  {
    code: "MANAGER_PROJECT_FOCUS",
    nom: "Manager — orientation projets",
    famille: "Management",
    systeme: false,
    description: "Encadrement centré sur la conduite de projet ; validation RH réduite au minimum.",
    permissions: dedoublonne([
      ...SOCLE,
      ...CONDUITE_PROJET,
      "leaves:read_team",
      "leaves:approve",
      "planning:read_team",
      "users:read",
      "tasks:readAll",
      "projects:readAll",
    ]),
  },
  {
    code: "MANAGER_HR_FOCUS",
    nom: "Manager — orientation RH",
    famille: "Management",
    systeme: false,
    description: "Encadrement centré sur les personnes : congés, télétravail, présence, compétences.",
    permissions: dedoublonne([
      ...SOCLE,
      ...ENCADREMENT,
      "skills:update",
      "skills:manage_matrix",
      "predefined_tasks:assign_bulk",
    ]),
  },

  // Conduite de projet ──────────────────────────────────────────────────────
  {
    code: "PROJECT_LEAD",
    nom: "Chef de projet",
    famille: "Conduite de projet",
    systeme: true,
    description: "Driss : structurer en jalons, savoir qui est disponible, repérer retards et dépendances.",
    permissions: dedoublonne([...SOCLE, ...CONDUITE_PROJET, "planning:read_team", "users:read"]),
  },
  {
    code: "PROJECT_LEAD_JUNIOR",
    nom: "Chef de projet junior",
    famille: "Conduite de projet",
    systeme: false,
    description: "Conduite de projet sans création ni archivage : on pilote l'existant, on ne l'ouvre pas.",
    permissions: dedoublonne(
      [...SOCLE, ...CONDUITE_PROJET, "users:read"].filter(
        (p) => p !== "projects:create" && p !== "projects:archive" && p !== "projects:import",
      ),
    ),
  },
  {
    code: "TECHNICAL_LEAD",
    nom: "Responsable technique",
    famille: "Conduite de projet",
    systeme: false,
    description: "Conduite technique : tâches, dépendances, RACI, compétences de l'équipe. Pas de gestion de projet.",
    permissions: dedoublonne([
      ...SOCLE,
      ...CONTRIBUTION_PROJET,
      "tasks:assign_any_user",
      "tasks:manage_raci",
      "tasks:readAll",
      "tasks:import",
      "tasks:export",
      "skills:read_team",
      "skills:update",
      "users:read",
    ]),
  },

  // Contribution ────────────────────────────────────────────────────────────
  {
    code: "PROJECT_CONTRIBUTOR",
    nom: "Contributeur projet",
    famille: "Contribution",
    systeme: true,
    description: "Camille : ses tâches du jour, ses congés, son télétravail, son temps. N'ouvrira jamais un rapport.",
    permissions: dedoublonne([...SOCLE, ...CONTRIBUTION_PROJET]),
  },
  {
    code: "PROJECT_CONTRIBUTOR_LIGHT",
    nom: "Contributeur projet — restreint",
    famille: "Contribution",
    systeme: false,
    description: "Contribution en lecture et mise à jour de ses propres tâches, sans création ni suppression.",
    permissions: dedoublonne(
      [...SOCLE, "milestones:read", "epics:read", "documents:create"].filter(
        (p) => p !== "tasks:create_standalone",
      ),
    ),
  },
  {
    code: "FUNCTIONAL_REFERENT",
    nom: "Référent fonctionnel",
    famille: "Contribution",
    systeme: false,
    description: "Contribution élargie à la lecture transverse : comprendre l'ensemble sans agir dessus.",
    permissions: dedoublonne([
      ...SOCLE,
      ...CONTRIBUTION_PROJET,
      "projects:readAll",
      "tasks:readAll",
      "events:readAll",
      "reports:read",
    ]),
  },

  // Ressources humaines ─────────────────────────────────────────────────────
  {
    code: "HR_OFFICER",
    nom: "Responsable RH",
    famille: "RH",
    systeme: true,
    description: "Hugo : paramétrer types de congés et soldes, importer en masse, contrôler.",
    permissions: dedoublonne([...SOCLE, ...RH]),
  },
  {
    code: "HR_OFFICER_LIGHT",
    nom: "Gestionnaire RH — restreint",
    famille: "RH",
    systeme: false,
    description: "Gestion RH courante sans le référentiel : ni types de congés, ni soldes, ni suppression de compte.",
    permissions: dedoublonne(
      [...SOCLE, ...RH].filter(
        (p) =>
          p !== "leaves:manage_types" &&
          p !== "leaves:manage_balances" &&
          p !== "leaves:delete" &&
          p !== "users:deactivate",
      ),
    ),
  },

  // Transverse ──────────────────────────────────────────────────────────────
  {
    code: "THIRD_PARTY_MANAGER",
    nom: "Gestionnaire des tiers",
    famille: "Transverse",
    systeme: false,
    description: "Référentiel des intervenants externes et des bénéficiaires.",
    permissions: dedoublonne([...SOCLE, ...tout("third_parties", "clients"), "projects:readAll"]),
  },
  {
    code: "CONTROLLER",
    nom: "Contrôleur",
    famille: "Transverse",
    systeme: false,
    description: "Lecture transverse complète et journal d'audit. Ne modifie rien : c'est ce qui fait sa valeur.",
    permissions: dedoublonne([
      ...SOCLE,
      "audit:read",
      ...lecture("projects", "tasks", "events", "leaves", "telework", "time_tracking", "skills", "users", "clients", "third_parties"),
      "projects:readAll",
      "tasks:readAll",
      "leaves:readAll",
      "telework:readAll",
      "time_tracking:readAll",
      "users:readAll",
      "reports:readAll",
      "planning:readAll",
    ]),
  },
  {
    code: "BUDGET_ANALYST",
    nom: "Analyste budgétaire",
    famille: "Transverse",
    systeme: false,
    description: "Temps déclaré, budgets consommés, charge. Lecture et export.",
    permissions: dedoublonne([
      ...SOCLE,
      "time_tracking:readAll",
      "projects:readAll",
      "tasks:readAll",
      "reports:readAll",
      "reports:export",
      "projects:export",
    ]),
  },
  {
    code: "DATA_ANALYST",
    nom: "Analyste de données",
    famille: "Transverse",
    systeme: false,
    description: "Rapports et exports sur l'ensemble du périmètre, sans accès au journal d'audit.",
    permissions: dedoublonne([
      ...SOCLE,
      "reports:readAll",
      "reports:export",
      "projects:readAll",
      "tasks:readAll",
      "planning:readAll",
      "planning:export_ics",
      "skills:export",
      "users:readAll",
    ]),
  },

  // Informatique ────────────────────────────────────────────────────────────
  {
    code: "IT_SUPPORT",
    nom: "Support informatique",
    famille: "Informatique",
    systeme: false,
    description:
      "Assistance aux comptes : réinitialiser un mot de passe, corriger un rattachement. **Pas de gestion des rôles** — c'est la limite qui sépare le support de l'administration.",
    permissions: dedoublonne([
      ...SOCLE,
      "users:read",
      "users:readAll",
      "users:update",
      "users:reset_password",
      ...lecture("departments", "directions", "services"),
    ]),
  },
  {
    code: "IT_INFRASTRUCTURE",
    nom: "Infrastructure informatique",
    famille: "Informatique",
    systeme: false,
    description: "Paramétrage technique et calendrier de l'organisation ; journal d'audit en lecture.",
    permissions: dedoublonne([
      ...SOCLE,
      ...tout("settings", "holidays", "school_vacations"),
      "audit:read",
      "users:read",
    ]),
  },

  // Observation ─────────────────────────────────────────────────────────────
  {
    code: "OBSERVER_FULL",
    nom: "Observateur — complet",
    famille: "Observation",
    systeme: false,
    description: "Lecture seule sur tout le périmètre autorisé. Aucune écriture, jamais.",
    permissions: dedoublonne([
      ...PERMISSIONS.filter((p) => p.endsWith(":read") || p.endsWith(":readAll") || p.endsWith(":read_team")),
    ]),
  },
  {
    code: "OBSERVER_PROJECTS_ONLY",
    nom: "Observateur — projets",
    famille: "Observation",
    systeme: false,
    description: "Lecture seule sur le domaine projet. Ne voit rien des congés ni du télétravail.",
    permissions: dedoublonne([
      ...lecture("projects", "tasks", "milestones", "epics", "events", "comments", "documents"),
      "projects:readAll",
      "tasks:readAll",
      "reports:read",
      "planning:read",
      "settings:read",
    ]),
  },
  {
    code: "OBSERVER_HR_ONLY",
    nom: "Observateur — ressources humaines",
    famille: "Observation",
    systeme: false,
    description: "Lecture seule sur les personnes et leur disponibilité. Ne voit rien du contenu des projets.",
    permissions: dedoublonne([
      ...lecture("users", "leaves", "telework", "skills", "departments", "directions", "services"),
      "leaves:readAll",
      "telework:readAll",
      "users:readAll",
      "planning:read",
      "settings:read",
    ]),
  },

  // Restreints ──────────────────────────────────────────────────────────────
  {
    code: "BASIC_USER",
    nom: "Utilisateur de base",
    famille: "Restreints",
    systeme: true,
    description: "Le strict nécessaire : son planning, ses congés, son télétravail, son temps.",
    permissions: dedoublonne(SOCLE),
  },
  {
    code: "EXTERNAL_PRESTATAIRE",
    nom: "Prestataire externe",
    famille: "Restreints",
    systeme: false,
    description:
      "Intervenant extérieur : ses tâches et son temps, rien d'autre. **Ni congés, ni télétravail, ni annuaire** — il n'est pas agent de l'organisation.",
    permissions: dedoublonne([
      "planning:read",
      "projects:read",
      "tasks:read",
      "tasks:update",
      "events:read",
      "time_tracking:read",
      "time_tracking:create",
      "time_tracking:delete",
      "comments:read",
      "comments:create",
      "comments:update",
      "documents:read",
      "documents:download",
      "settings:read",
    ]),
  },
  {
    code: "STAGIAIRE_ALTERNANT",
    nom: "Stagiaire ou alternant",
    famille: "Restreints",
    systeme: false,
    description: "Contribution encadrée : ses tâches, son temps, ses congés. Pas de création de tâche hors projet.",
    /*
     * **Sa description supposait un droit qu'il n'avait pas.** « Pas de
     * création de tâche hors projet » dit en creux qu'il en crée DANS un
     * projet ; or `SOCLE` porte `tasks:create_standalone` et non
     * `tasks:create`, si bien que le retrait du premier ne lui laissait aucun
     * droit de création du tout. Le stagiaire ne pouvait rien créer, nulle
     * part.
     *
     * Le trou était invisible tant que la route de création n'exigeait que
     * `tasks:create` quel que soit le corps : `RG-TSK-02` a rendu les deux
     * droits distincts, et c'est en la portant qu'on l'a vu.
     */
    permissions: dedoublonne([
      ...SOCLE.filter((p) => p !== "tasks:create_standalone"),
      "tasks:create",
      // De quoi rattacher la tâche qu'il crée : `RG-JAL-03` s'applique à lui
      // comme aux autres, et un rattachement se choisit dans une liste.
      "milestones:read",
      "epics:read",
    ]),
  },
];

export const NOMBRE_MODELES = MODELES_ROLES.length;

export const modeleParCode = (code: string): ModeleRole | undefined =>
  MODELES_ROLES.find((m) => m.code === code);
