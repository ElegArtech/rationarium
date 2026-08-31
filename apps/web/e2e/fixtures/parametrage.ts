import type { Page } from "@playwright/test";
import { SESSION_ADMIN } from "./administration.js";

/**
 * Jeux de données des vues 31, 32, 33 et 34 — L-37.
 *
 * Chaque jeu est construit autour du point d'attention de son brief, pas
 * autour d'un cas moyen : un férié **ouvré** (le lundi de Pentecôte, journée
 * de solidarité), un croisement de permissions qui **n'existe pas**, un acteur
 * d'audit **supprimé**, une récurrence au **31** du mois.
 */

export const SESSION_CONFIG = {
  ...SESSION_ADMIN,
  permissions: [
    ...SESSION_ADMIN.permissions,
    "settings:read",
    "settings:update",
    "holidays:read",
    "holidays:import",
    "holidays:create",
    "school_vacations:read",
    "school_vacations:create",
    "users:manage_roles",
    "audit:read",
    "predefined_tasks:read",
  ],
};

/**
 * Les mêmes droits, PLUS l'écriture sur le catalogue d'activité.
 *
 * `RG-GEN-06` — sans `predefined_tasks:update`, la vue 34 masque ses
 * commandes : le compte d'assignations conservées, qui vit dans la fenêtre de
 * désactivation, devient alors inatteignable. C'est le comportement voulu, pas
 * un défaut — il faut donc une session qui écrit pour l'observer.
 */
export const SESSION_ACTIVITE = {
  ...SESSION_CONFIG,
  permissions: [...SESSION_CONFIG.permissions, "predefined_tasks:update"],
};

/** Les mêmes droits, sans l'écriture : la vue doit rester crédible. */
export const SESSION_CONFIG_LECTURE = {
  ...SESSION_CONFIG,
  permissions: SESSION_CONFIG.permissions.filter(
    (p) =>
      p !== "settings:update" &&
      p !== "holidays:import" &&
      // `RG-GEN-06` — sans le droit de créer, on ne propose pas de créer puis
      // de refuser. Les deux nouvelles commandes de la vue 31 en dépendent.
      p !== "holidays:create" &&
      p !== "school_vacations:create",
  ),
};

// ── Vue 31 ──────────────────────────────────────────────────────────────────

export const REGLAGES = {
  "display.dateFormat": "JJ/MM/AAAA",
  "display.timeFormat": "24h",
  "display.firstDayOfWeek": "1",
  "planning.visibleDays": "1,2,3,4,5",
};

/** Le cas limite de `RG-PRM-01` : un seul jour visible, qu'on ne peut ôter. */
export const REGLAGES_UN_JOUR = { ...REGLAGES, "planning.visibleDays": "3" };

export const FERIES = {
  feries: [
    {
      id: "f1",
      date: "2026-01-01",
      libelle: "Jour de l'an",
      type: "legal",
      ouvre: false,
      recurrent: true,
    },
    {
      id: "f2",
      date: "2026-05-01",
      libelle: "Fête du travail",
      type: "legal",
      ouvre: false,
      recurrent: true,
    },
    {
      // Journée de solidarité : férié ET travaillé. C'est exactement le
      // paramètre « à effet de bord lointain » du brief.
      id: "f3",
      date: "2026-05-25",
      libelle: "Lundi de Pentecôte",
      type: "legal",
      ouvre: true,
      recurrent: true,
    },
    {
      id: "f4",
      date: "2026-09-14",
      libelle: "Fête patronale",
      type: "local",
      ouvre: false,
      recurrent: false,
    },
  ],
  statistiques: { total: 4, chomes: 3, ouvres: 1, legaux: 3 },
};

export const FERIES_VIDE = {
  feries: [],
  statistiques: { total: 0, chomes: 0, ouvres: 0, legaux: 0 },
};

export const VACANCES = {
  vacances: [
    {
      id: "v1",
      libelle: "Vacances de la Toussaint",
      dateDebut: "2026-10-17",
      dateFin: "2026-11-02",
      zone: "B",
      anneeScolaire: "2026-2027",
      importee: true,
    },
    {
      id: "v2",
      libelle: "Pont de l'Ascension",
      dateDebut: "2027-05-13",
      dateFin: "2027-05-16",
      zone: "B",
      anneeScolaire: "2026-2027",
      importee: false,
    },
  ],
  statistiques: { total: 2, importees: 1, manuelles: 1 },
};

// ── Vue 32 ──────────────────────────────────────────────────────────────────

export const ROLES = [
  {
    id: "r-admin",
    code: "ADMIN",
    nom: "Administrateur",
    description: "Tous les droits",
    systeme: true,
    version: 1,
    nombrePermissions: 180,
    nombreUtilisateurs: 2,
  },
  {
    id: "r-agent",
    code: "AGENT_PROJET",
    nom: "Agent de projet",
    description: "Rôle taillé pour les chefs de projet",
    systeme: false,
    version: 3,
    nombrePermissions: 24,
    nombreUtilisateurs: 17,
  },
];

const ACTIONS = ["read", "create", "update", "delete", "approve"];

/**
 * Une matrice où **trois croisements n'existent pas** : on n'approuve ni un
 * projet, ni une tâche, ni un département. Le serveur le dit par `null` ; la
 * vue doit ne rien dessiner du tout, pas une case grisée.
 */
const ligne = (domaine: string, detenues: string[], inexistantes: string[] = []) => ({
  domaine,
  cases: ACTIONS.map((action) => ({
    action,
    permission: `${domaine}:${action}`,
    detenue: inexistantes.includes(action) ? null : detenues.includes(action),
  })),
});

export const MATRICE_PERSONNALISE = {
  role: { id: "r-agent", code: "AGENT_PROJET", nom: "Agent de projet", systeme: false, version: 3 },
  actions: ACTIONS,
  lignes: [
    ligne("projects", ["read", "create", "update"], ["approve"]),
    ligne("tasks", ["read", "create"], ["approve"]),
    ligne("leaves", ["read", "approve"]),
    ligne("departments", ["read"], ["approve"]),
  ],
};

export const MATRICE_SYSTEME = {
  ...MATRICE_PERSONNALISE,
  role: { id: "r-admin", code: "ADMIN", nom: "Administrateur", systeme: true, version: 1 },
};

// ── Vue 33 ──────────────────────────────────────────────────────────────────

export const FACETTES_AUDIT = {
  actions: ["leave.approve", "project.create", "access.denied"],
  typesEntite: ["Leave", "Project", "User"],
};

export const AUDIT = {
  entrees: [
    {
      id: "a1",
      horodatage: "2026-08-16T09:14:00.000Z",
      action: "leave.approve",
      typeEntite: "Leave",
      entiteId: "lv-4821",
      systeme: false,
      acteur: { id: "u-moi", prenom: "Hugo", nom: "Nguyen" },
      detail: null,
    },
    {
      // `RG-ADM-09` — une action système n'est pas une action humaine.
      id: "a2",
      horodatage: "2026-08-16T04:00:00.000Z",
      action: "predefined_task.generate",
      typeEntite: "PredefinedTask",
      entiteId: "pt-permanence",
      systeme: true,
      acteur: null,
      detail: null,
    },
    {
      // L'entrée survit à la personne : c'est le point d'un journal.
      id: "a3",
      horodatage: "2026-08-15T17:32:00.000Z",
      action: "project.create",
      typeEntite: "Project",
      entiteId: "pj-118",
      systeme: false,
      acteur: { id: "u-parti", supprime: true },
      detail: null,
    },
  ],
  curseurSuivant: { horodatage: "2026-08-15T17:32:00.000Z", id: "a3" },
};

export const AUDIT_VIDE = { entrees: [], curseurSuivant: null };

// ── Vue 34 ──────────────────────────────────────────────────────────────────

export const PREDEFINIES = [
  {
    id: "pt1",
    nom: "Permanence accueil",
    description: "Tenue du guichet du rez-de-chaussée",
    couleur: null,
    icone: null,
    dureeParDefaut: "half_day",
    heureDebut: "08:30",
    heureFin: "12:30",
    teletravailAutorise: false,
    poids: 4,
    actif: true,
    recurrences: [
      {
        id: "rc1",
        type: "weekly",
        frequence: 1,
        jourSemaine: 2,
        jourMois: null,
        ordinal: null,
        dateDebut: "2026-09-01",
        dateFin: null,
        active: true,
        version: 1,
      },
    ],
    _count: { assignations: 42 },
  },
  {
    id: "pt2",
    nom: "Revue de direction",
    description: null,
    couleur: null,
    icone: null,
    dureeParDefaut: "time_slot",
    heureDebut: null,
    heureFin: null,
    teletravailAutorise: true,
    poids: 2,
    actif: true,
    recurrences: [
      {
        // Le 31 : le mois qui n'en a pas ramène au dernier jour. La règle doit
        // être dite ici, pas découverte sur une date inattendue.
        id: "rc2",
        /*
         * `monthly_fixed`, et non `monthly_date`. Trois orthographes ont
         * cohabité pour le même type : le moteur lit `monthly_fixed`, le
         * point d'entrée n'acceptait que `monthly`, la vue lisait
         * `monthly_date`. Une règle mensuelle se créait AVEC SUCCÈS et
         * n'engendrait jamais rien. `TYPES_RECURRENCE` tranche.
         */
        type: "monthly_fixed",
        frequence: 1,
        jourSemaine: null,
        jourMois: 31,
        ordinal: null,
        dateDebut: "2026-01-01",
        dateFin: "2026-12-31",
        active: true,
        version: 1,
      },
      {
        id: "rc3",
        type: "monthly_ordinal",
        frequence: 1,
        jourSemaine: 2,
        jourMois: null,
        ordinal: 3,
        dateDebut: "2026-09-01",
        dateFin: null,
        active: false,
        version: 1,
      },
    ],
    _count: { assignations: 0 },
  },
];

/** `RG-ACT-05` — une tâche désactivée reste au catalogue. */
export const PREDEFINIES_AVEC_INACTIVE = [
  ...PREDEFINIES,
  {
    id: "pt3",
    nom: "Astreinte week-end",
    description: null,
    couleur: null,
    icone: null,
    dureeParDefaut: "full_day",
    heureDebut: null,
    heureFin: null,
    teletravailAutorise: false,
    poids: 5,
    actif: false,
    recurrences: [],
    _count: { assignations: 118 },
  },
];

// ── Vue 31 — l'EFFET d'un jour férié déclaré ────────────────────────────────

/**
 * Le jeudi 13 août 2026 : un jour ouvré ordinaire de la semaine servie par
 * `SEMAINE` (jeu du planning). Ni week-end, ni férié — donc si la trame de
 * fond le grise après la déclaration, c'est la déclaration qui l'a fait.
 */
export const JOUR_A_DECLARER = "2026-08-13";

type Ferie = {
  id: string;
  date: string;
  libelle: string;
  type: string;
  ouvre: boolean;
  recurrent: boolean;
};

const statistiquesDe = (feries: Ferie[]) => ({
  total: feries.length,
  chomes: feries.filter((f) => !f.ouvre).length,
  ouvres: feries.filter((f) => f.ouvre).length,
  legaux: feries.filter((f) => f.type === "legal").length,
});

/**
 * Un calendrier de test qui **garde ce qu'on lui déclare**.
 *
 * Les autres jeux de cette suite sont figés : ils répondent la même chose
 * avant et après une écriture, donc ils ne peuvent rien dire de l'*effet* d'un
 * réglage — seulement du fait qu'il a été envoyé. C'est exactement le piège
 * consigné pour cette vue : « un réglage qui s'enregistre n'est pas un réglage
 * qui s'applique ».
 *
 * La dérivation faite ici n'est pas une invention : `CalendrierService` sert
 * la liste de la vue 31 **et** la trame de fond du planning depuis la même
 * table, par `joursChomes` — un férié non ouvré y devient un jour chômé, un
 * férié ouvré non. Ce lien est tenu au serveur par `calendrier.int.test.ts`
 * (« un jour férié chômé retire un jour », « RG-PRM-01 — un férié marqué OUVRÉ
 * ne retire rien », « EX-PLN-14 — la trame réunit fériés chômés et vacances »).
 * Le jeu s'y conforme ; il ne décide rien.
 *
 * Rend la fonction qui donne le dernier corps reçu par le `POST` : les
 * drapeaux à effet — `ouvre`, `recurrent` — doivent voyager, et un formulaire
 * qui les laisserait tomber enregistrerait un jour sans conséquence.
 */
export async function calendrierQuiRetient(
  page: Page,
  semaine: { trame: { joursChomes: string[]; vacances: unknown[] } },
) {
  const feries: Ferie[] = structuredClone(FERIES.feries);
  let dernierEnvoi: Record<string, unknown> | null = null;

  await page.route(
    (url) => url.pathname === "/api/parametrage/feries",
    (route) => {
      if (route.request().method() === "POST") {
        const corps = route.request().postDataJSON() as Ferie;
        dernierEnvoi = { ...corps };
        feries.push({ ...corps, id: `f-${feries.length + 1}` });
        return route.fulfill({
          status: 201,
          contentType: "application/json",
          body: JSON.stringify({ ...corps, id: `f-${feries.length}` }),
        });
      }
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ feries, statistiques: statistiquesDe(feries) }),
      });
    },
  );

  await page.route(
    (url) => url.pathname === "/api/planning",
    (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ...semaine,
          trame: {
            ...semaine.trame,
            joursChomes: feries.filter((f) => !f.ouvre).map((f) => f.date),
          },
        }),
      }),
  );

  return () => dernierEnvoi;
}
