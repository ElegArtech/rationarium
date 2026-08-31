import { SESSION } from "./projets.js";

/** Jeux de données des vues 27, 28 et 29. */

export const SESSION_ADMIN = {
  ...SESSION,
  id: "u-moi",
  prenom: "Hugo",
  nom: "Nguyen",
  role: { code: "RH", nom: "Ressources humaines" },
  permissions: [
    ...SESSION.permissions,
    "users:read",
    "users:create",
    "users:update",
    "users:deactivate",
    "users:delete_permanently",
    "users:read_individual_tracking",
    "departments:read",
    "departments:delete",
    "directions:read",
    "directions:delete",
    "services:read",
  ],
};

// ── Vue 27 ──────────────────────────────────────────────────────────────────

/*
 * `GET /api/utilisateurs` rend un TABLEAU.
 *
 * Ce jeu l'enveloppait dans `{ utilisateurs: [...] }` — la forme que le type du
 * client attendait, et que le serveur n'a jamais rendue. Les deux erreurs se
 * validaient l'une l'autre : la vue 27 n'a jamais affiché une seule ligne, et
 * les parcours de bout en bout passaient au vert sur la forme inventée.
 */
export const UTILISATEURS = [
    {
      id: "u-moi",
      prenom: "Hugo",
      nom: "Nguyen",
      email: "hugo.nguyen@exemple.fr",
      login: "hugo.nguyen",
      actif: true,
      derniereConnexion: "2026-08-16T08:00:00.000Z",
      version: 1,
      role: { id: "r1", code: "RH", nom: "Ressources humaines" },
      departement: { id: "d1", nom: "Direction des ressources humaines" },
      services: [{ service: { id: "s1", nom: "Gestion administrative" } }],
    },
    {
      id: "u-autre",
      prenom: "Camille",
      nom: "Roussel",
      email: "camille.roussel@exemple.fr",
      login: "camille.roussel",
      actif: true,
      derniereConnexion: null,
      version: 1,
      role: { id: "r2", code: "AGENT", nom: "Agent" },
      departement: null,
      services: [],
    },
    {
      id: "u-parti",
      prenom: "Ancien",
      nom: "Collegue",
      email: "ancien@exemple.fr",
      login: "ancien",
      actif: false,
      derniereConnexion: null,
      version: 1,
      role: null,
      departement: null,
      services: [],
  },
];

export const IMPACT_BLOQUE = {
  nom: "Camille Roussel",
  blocages: [
    { objet: "saisies de temps", nombre: 218 },
    { objet: "congés approuvés", nombre: 4 },
  ],
  effacements: [],
};

export const IMPACT_LIBRE = {
  nom: "Ancien Collegue",
  blocages: [],
  effacements: [{ objet: "to-do personnelles", nombre: 3 }],
};

// ── Vue 28 ──────────────────────────────────────────────────────────────────

export const SUIVI = {
  agent: {
    id: "u-autre",
    prenom: "Camille",
    nom: "Roussel",
    email: "camille.roussel@exemple.fr",
    login: "camille.roussel",
    actif: true,
    creeLe: "2025-09-01T00:00:00.000Z",
    derniereConnexion: "2026-08-15T08:00:00.000Z",
    role: { code: "AGENT", nom: "Agent" },
    departement: { id: "d1", nom: "Direction des services numériques" },
    services: [{ id: "s1", nom: "Études et développement" }],
  },
  periode: { debut: "2026-08-01", fin: "2026-08-31", annee: 2026 },
  taches: [
    {
      id: "t1",
      titre: "Rédiger la note de cadrage",
      statut: "doing",
      priorite: "high",
      avancement: 45,
      dateFin: "2026-11-30",
      project: { id: "p1", nom: "Refonte du portail citoyen" },
    },
    {
      id: "t2",
      titre: "Réunion de service",
      statut: "todo",
      priorite: "normal",
      avancement: 0,
      dateFin: null,
      project: null,
    },
  ],
  conges: [
    {
      id: "c1",
      statut: "approved",
      dateDebut: "2026-02-10",
      dateFin: "2026-02-14",
      joursOuvres: "5",
      type: { id: "ty1", nom: "Congés annuels", couleur: "#6A4BA6" },
      repartitions: [{ annee: 2026, jours: "5" }],
    },
  ],
  teletravail: [
    { date: "2026-08-04", etat: "telework", issuDeRegle: true },
    { date: "2026-08-11", etat: "telework", issuDeRegle: false },
  ],
  temps: [
    {
      id: "e1",
      date: "2026-08-05",
      heures: "6",
      typeActivite: "development",
      description: "Formulaire de contact",
      project: { id: "p1", nom: "Refonte du portail citoyen" },
    },
    {
      id: "e2",
      date: "2026-08-06",
      heures: "4",
      typeActivite: "meeting",
      description: null,
      project: null,
    },
  ],
  competences: [
    { id: "s1", nom: "Cartographie SIG", categorie: "technical", niveau: "expert" },
  ],
  statistiques: {
    tachesActives: 2,
    tachesTerminees: 0,
    tachesBloquees: 0,
    joursTeletravail: 2,
    heuresSaisies: 10,
    congesAnnee: 5,
    projetsActifs: 1,
    competences: 1,
  },
};

/** Une arrivée récente : ses onglets sont presque vides. */
export const SUIVI_VIDE = {
  ...SUIVI,
  agent: { ...SUIVI.agent, id: "u-neuve", prenom: "Nadia", nom: "Kaufmann" },
  taches: [],
  conges: [],
  teletravail: [],
  temps: [],
  competences: [],
  statistiques: {
    tachesActives: 0,
    tachesTerminees: 0,
    tachesBloquees: 0,
    joursTeletravail: 0,
    heuresSaisies: 0,
    congesAnnee: 0,
    projetsActifs: 0,
    competences: 0,
  },
};

// ── Vue 29 ──────────────────────────────────────────────────────────────────

const personne = (prenom: string, nom: string, id: string) => ({ id, prenom, nom });

export const ARBORESCENCE = {
  directions: [
    {
      id: "dir1",
      nom: "Direction générale des services",
      description: "Pilotage de l'ensemble des services",
      responsable: personne("Inès", "Rocher", "a1"),
      departements: [
        {
          id: "dep1",
          nom: "Direction des services numériques",
          description: null,
          creeLe: "2025-01-15T00:00:00.000Z",
          responsable: personne("Driss", "Amrani", "a2"),
          services: [
            {
              id: "svc1",
              nom: "Études et développement",
              description: null,
              manager: personne("Hugo", "Nguyen", "a3"),
              _count: { membres: 7 },
            },
            {
              id: "svc2",
              nom: "Exploitation",
              description: null,
              manager: null,
              _count: { membres: 3 },
            },
          ],
          _count: { membres: 10, services: 2 },
        },
      ],
    },
    {
      id: "dir2",
      nom: "Direction vide",
      description: null,
      responsable: null,
      departements: [],
    },
  ],
  departementsSansDirection: [
    {
      id: "dep2",
      nom: "Mission transversale",
      description: "Rattachée à personne pour l'instant",
      creeLe: "2026-03-01T00:00:00.000Z",
      responsable: null,
      services: [],
      _count: { membres: 2, services: 0 },
    },
  ],
};

export const IMPACT_DEPARTEMENT = {
  nom: "Direction des services numériques",
  servicesSupprimes: ["Études et développement", "Exploitation"],
  agentsDetaches: 10,
};

/**
 * `EX-ORG-03` — l'impact d'un SERVICE. Il n'a pas de liste : un service
 * n'emporte rien. Sept agents, comme le `_count.membres` d'« Études et
 * développement » dans `ARBORESCENCE` — les deux doivent concorder, sinon le
 * test ne dit plus lequel des deux chiffres la fenêtre affiche.
 */
export const IMPACT_SERVICE = {
  nom: "Études et développement",
  agentsDetaches: 7,
};

/** La même session, plus le droit de supprimer un service. */
export const SESSION_ADMIN_SERVICES = {
  ...SESSION_ADMIN,
  permissions: [...SESSION_ADMIN.permissions, "services:delete"],
};

// ── Vue 21 — le versant équipe (EX-TMP-07) ──────────────────────────────────

/**
 * `EX-TMP-07` — le rapport agrégé est gardé par `time_tracking:read_team`,
 * que la session personnelle de la vue 21 ne porte pas.
 *
 * Les deux sessions vivent ici, et non dans les jeux de la vue 21, parce que
 * c'est la DIFFÉRENCE entre elles qu'on vient mesurer : le panneau apparaît
 * avec la permission et disparaît sans elle.
 */
export const SESSION_TEMPS = {
  ...SESSION_ADMIN,
  prenom: "Camille",
  nom: "Roussel",
  role: { code: "AGENT", nom: "Agent" },
  permissions: ["time_tracking:read", "time_tracking:create", "projects:read", "tasks:read"],
};

export const SESSION_TEMPS_EQUIPE = {
  ...SESSION_TEMPS,
  role: { code: "ENCADREMENT", nom: "Encadrement" },
  permissions: [...SESSION_TEMPS.permissions, "time_tracking:read_team"],
};

/** `GET /temps` — le strict nécessaire pour que la page 21 rende. */
export const TEMPS_VIDE = {
  saisies: [],
  cumul: { entrees: 0, heures: 0, plafondJournalier: 8 },
};

/**
 * `GET /temps/rapport` — la forme EXACTE du contrôleur : un TABLEAU de
 * `{ cle, libelle, heures, entrees }`, jamais un objet enveloppe.
 *
 * `heures` est un NOMBRE, pas une chaîne : `TempsService.rapport` le passe par
 * `Number(l._sum.heures)`. La liste des saisies, elle, rend `heures` en
 * chaîne — les deux points d'entrée du même module ne s'accordent pas, et un
 * jeu d'essai qui lisserait la différence validerait une conversion que le
 * client ne fait pas.
 */
export const RAPPORT_AGENT = [
  { cle: "a2", libelle: "Driss Amrani", heures: 34, entrees: 9 },
  { cle: "a3", libelle: "Hugo Nguyen", heures: 12.5, entrees: 4 },
  /* `userId` vaut `null` pour une saisie faite au nom d'un tiers : le service
     la nomme « Tiers » plutôt que de la laisser sans libellé. */
  { cle: null, libelle: "Tiers", heures: 3.5, entrees: 1 },
];

export const RAPPORT_TYPE = [
  { cle: "development", libelle: "development", heures: 30, entrees: 8 },
  { cle: "meeting", libelle: "meeting", heures: 20, entrees: 6 },
];
