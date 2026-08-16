import { SESSION } from "./projets.js";

/**
 * Jeux de données des vues 15 et 30 — L-22.
 *
 * Construits autour de ce que le brief nomme difficile : un troncage à dix
 * projets, une surcharge par écart à la moyenne, un historique trop court, un
 * ratio de complétion qui n'existe pas, et les cinq états RAG.
 */

export const SESSION_RAPPORTS = {
  ...SESSION,
  permissions: [...SESSION.permissions, "reports:read", "reports:export", "milestones:read"],
};

/** Sans le droit d'export : le menu n'est pas proposé. */
export const SESSION_SANS_EXPORT = {
  ...SESSION_RAPPORTS,
  permissions: SESSION_RAPPORTS.permissions.filter((p) => p !== "reports:export"),
};

const projet = (i: number) => ({
  id: `p${i}`,
  nom: `Projet ${String(i).padStart(2, "0")}`,
  icone: "◆",
  progression: 10 * i,
  taches: 4 + i,
});

export const VUE_ENSEMBLE = {
  periode: { nature: "mois", debut: "2026-08-01", fin: "2026-08-11" },
  alerte: { tachesEnRetard: 7 },
  progression: {
    // Douze projets, dix affichés : le troncage doit être annoncé.
    projets: Array.from({ length: 10 }, (_, i) => projet(i + 1)),
    total: 12,
    tronque: true,
    plafond: 10,
  },
  charge: {
    agents: [
      { id: "u1", nom: "Ana Berger", taches: 9, surcharge: true },
      { id: "u2", nom: "Bruno Costa", taches: 4, surcharge: false },
      { id: "u3", nom: "Chloe Dupont", taches: 2, surcharge: false },
    ],
    moyenne: 5,
    surcharges: 1,
  },
  sante: [
    {
      id: "p1", nom: "Portail citoyen", icone: "◆", completion: 90,
      restantes: 3, enRetard: 4, jalons: 5, jalonsAVenir: 2, tachesActives: 3,
      dateFin: "2026-12-31",
      chef: { id: "u1", prenom: "Driss", nom: "Amrani" },
      service: "Direction des services numériques",
      sante: "critical",
    },
    {
      id: "p2", nom: "Refonte intranet", icone: "◆", completion: 45,
      restantes: 8, enRetard: 0, jalons: 2, jalonsAVenir: 2, tachesActives: 8,
      dateFin: "2027-03-31",
      chef: null, service: null, sante: "good",
    },
  ],
  tendance: {
    points: [
      { date: "2026-08-01", progression: 30 },
      { date: "2026-08-04", progression: 38 },
      { date: "2026-08-07", progression: 46 },
      { date: "2026-08-10", progression: 55 },
    ],
    historiqueSuffisant: true,
    moyenne: 42,
    gain: 25,
    stagnation: false,
  },
  jalons: { total: 7, aTemps: 3, enRetard: 2, aVenir: 2, echus: 5 },
  repartitions: {
    priorite: [
      { cle: "critical", nombre: 2 },
      { cle: "high", nombre: 5 },
      { cle: "normal", nombre: 9 },
      { cle: "low", nombre: 1 },
    ],
    statut: [
      { cle: "todo", nombre: 8 },
      { cle: "doing", nombre: 6 },
      { cle: "review", nombre: 2 },
      { cle: "done", nombre: 11 },
    ],
    actives: 17,
  },
  activite: {
    terminees: 4,
    creees: 10,
    passeesEnRetard: 3,
    ratio: 0.4,
    interpretation: "grossit",
  },
};

/** `RG-RPT-03` et `EX-RPT-10` : historique court, et ratio inexistant. */
export const VUE_ENSEMBLE_JEUNE = {
  ...VUE_ENSEMBLE,
  alerte: { tachesEnRetard: 0 },
  progression: { projets: [projet(1)], total: 1, tronque: false, plafond: 10 },
  charge: { agents: [], moyenne: 0, surcharges: 0 },
  tendance: {
    points: [{ date: "2026-08-01", progression: 12 }],
    historiqueSuffisant: false,
    moyenne: 12,
    gain: 0,
    stagnation: false,
  },
  jalons: { total: 0, aTemps: 0, enRetard: 0, aVenir: 0, echus: 0 },
  activite: {
    terminees: 0, creees: 0, passeesEnRetard: 0, ratio: null, interpretation: null,
  },
};

/** `RG-RPT-04` — la stagnation est nommée, pas laissée à l'œil. */
export const VUE_ENSEMBLE_STAGNANTE = {
  ...VUE_ENSEMBLE,
  tendance: {
    points: [
      { date: "2026-08-01", progression: 42 },
      { date: "2026-08-04", progression: 42 },
      { date: "2026-08-07", progression: 43 },
      { date: "2026-08-10", progression: 42 },
    ],
    historiqueSuffisant: true,
    moyenne: 42,
    gain: 0,
    stagnation: true,
  },
};

export const VUE_ENSEMBLE_VIDE = {
  ...VUE_ENSEMBLE_JEUNE,
  progression: { projets: [], total: 0, tronque: false, plafond: 10 },
  sante: [],
  repartitions: { priorite: [], statut: [], actives: 0 },
};

/** Les cinq états RAG, chacun une fois. */
export const GANTT = {
  lignes: [
    {
      id: "p1", nom: "Sur les rails", icone: "◆", statut: "active", priorite: "normal",
      dateDebut: "2026-06-01", dateFin: "2026-12-31", progression: 40, taches: 10, enRetard: 0,
      rag: "on_track",
      chef: { id: "u1", prenom: "Driss", nom: "Amrani" },
      service: { id: "d1", nom: "Direction des services numériques" },
    },
    {
      id: "p2", nom: "Sous tension", icone: "◆", statut: "active", priorite: "critical",
      dateDebut: "2026-05-01", dateFin: "2026-10-31", progression: 25, taches: 8, enRetard: 3,
      rag: "at_risk", chef: null, service: null,
    },
    {
      id: "p3", nom: "Échéance passée", icone: "◆", statut: "active", priorite: "high",
      dateDebut: "2026-01-01", dateFin: "2026-07-15", progression: 70, taches: 12, enRetard: 5,
      rag: "late",
      chef: { id: "u2", prenom: "Fatou", nom: "Diallo" },
      service: { id: "d1", nom: "Direction des services numériques" },
    },
    {
      id: "p4", nom: "Pas encore lancé", icone: "◆", statut: "draft", priorite: "low",
      dateDebut: "2026-11-01", dateFin: "2027-06-30", progression: 0, taches: 0, enRetard: 0,
      rag: "upcoming", chef: null, service: null,
    },
    {
      id: "p5", nom: "Livré", icone: "◆", statut: "done", priorite: "normal",
      dateDebut: "2026-02-01", dateFin: "2026-06-30", progression: 100, taches: 20, enRetard: 0,
      rag: "done",
      chef: { id: "u1", prenom: "Driss", nom: "Amrani" },
      service: { id: "d2", nom: "Direction générale" },
    },
  ],
  reference: "2026-08-11",
};

export const GANTT_VIDE = { lignes: [], reference: "2026-08-11" };

// ── Vue 15 ──────────────────────────────────────────────────────────────────

export const PROJET_GANTT = {
  id: "p1",
  nom: "Portail citoyen",
  description: "Refonte du portail",
  statut: "active",
  priorite: "high",
  icone: "◆",
  dateDebut: "2026-06-01",
  dateFin: "2026-12-31",
  budgetHeures: 400,
  archive: false,
  version: 2,
  createur: { id: "u1", prenom: "Driss", nom: "Amrani" },
  chef: { id: "u1", prenom: "Driss", nom: "Amrani" },
  sponsor: null,
  departement: null,
  progression: 40,
  sante: "good",
  budget: { alloue: 400, consomme: 120, restant: 280, depassement: false },
  taches: { total: 3, parStatut: {} },
  jalons: 2,
  equipe: { agents: 3, tiers: 0, clients: 0 },
  instantanes: 6,
  documents: 0,
  commentaires: 0,
};

const tache = (donnees: {
  id: string;
  titre: string;
  statut: string;
  debut: string;
  fin: string;
  jalon?: { id: string; nom: string };
  avancement?: number;
  dependances?: number;
}) => ({
  id: donnees.id,
  version: 1,
  titre: donnees.titre,
  description: null,
  statut: donnees.statut,
  priorite: "normal",
  dateDebut: donnees.debut,
  dateFin: donnees.fin,
  estimationHeures: null,
  avancement: donnees.avancement ?? 0,
  confidentielle: false,
  project: { id: "p1", nom: "Portail citoyen", icone: "◆" },
  milestone: donnees.jalon ?? null,
  assignes: [],
  _count: { sousTaches: 0, dependances: donnees.dependances ?? 0 },
  enRetard: false,
  horsProjet: false,
});

export const TACHES_GANTT = [
  tache({
    id: "t1", titre: "Cadrage", statut: "done", debut: "2026-06-01", fin: "2026-06-30",
    jalon: { id: "m1", nom: "Lancement" }, avancement: 100,
  }),
  tache({
    id: "t2", titre: "Développement", statut: "doing", debut: "2026-07-01", fin: "2026-09-30",
    jalon: { id: "m1", nom: "Lancement" }, avancement: 45, dependances: 1,
  }),
  // Sans jalon : le groupe est nommé, la tâche ne flotte pas.
  tache({ id: "t3", titre: "Veille", statut: "todo", debut: "2026-08-01", fin: "2026-08-15" }),
];

/** Aucune tâche datée : l'état vide du brief, mot pour mot. */
export const TACHES_SANS_DATES = [
  { ...tache({ id: "t9", titre: "À planifier", statut: "todo", debut: "2026-01-01", fin: "2026-01-02" }), dateDebut: null, dateFin: null },
];

export const ROUTE_GANTT = {
  jalons: [
    { id: "m1", nom: "Lancement", description: null, dateEcheance: "2026-09-30", statut: "doing", taches: [] },
    { id: "m2", nom: "Recette", description: null, dateEcheance: "2026-11-30", statut: "pending", taches: [] },
  ],
  indicateurs: { total: 2, termines: 0, enCours: 1, taches: 2 },
};

/** La fiche d'une tâche sélectionnée : ses dépendances, chargées à la demande. */
export const FICHE_T2 = {
  id: "t2",
  version: 1,
  titre: "Développement",
  description: null,
  statut: "doing",
  priorite: "normal",
  dateDebut: "2026-07-01",
  dateFin: "2026-09-30",
  heureDebut: null,
  heureFin: null,
  estimationHeures: null,
  avancement: 45,
  confidentielle: false,
  interventionExterieure: false,
  project: { id: "p1", nom: "Portail citoyen", icone: "◆" },
  milestone: { id: "m1", nom: "Lancement" },
  epic: null,
  assignes: [],
  sousTaches: [],
  dependances: {
    dependDe: [{ id: "t1", titre: "Cadrage", statut: "done" }],
    bloque: [],
  },
  incoherences: [],
  raci: [],
  tiers: [],
  documents: [],
  commentaires: [],
  saisiesTemps: [],
};
