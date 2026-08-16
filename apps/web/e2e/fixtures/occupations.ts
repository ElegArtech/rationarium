import { SESSION } from "./projets.js";

/**
 * Jeux de données des vues 18 à 21.
 *
 * Les trois sessions reproduisent les trois publics de la vue 19, tels que
 * `cadrage/02` les nomme : Camille demande, Fatou valide, Hugo administre.
 * Le test « 1 onglet, 4 onglets, 6 onglets » de `design/etats.json` porte
 * exactement sur cette différence.
 */

export const CAMILLE = {
  ...SESSION,
  prenom: "Camille",
  nom: "Roussel",
  role: { code: "AGENT", nom: "Agent" },
  permissions: [
    "leaves:read",
    "leaves:create",
    "leaves:request_cancellation",
    "telework:read",
    "telework:create",
    "telework:manage_rules",
    "time_tracking:read",
    "time_tracking:create",
    "time_tracking:delete",
    "events:read",
    "events:create",
    "projects:read",
    "tasks:read",
  ],
};

export const FATOU = {
  ...CAMILLE,
  prenom: "Fatou",
  nom: "Berthier",
  role: { code: "ENCADREMENT", nom: "Encadrement" },
  permissions: [...CAMILLE.permissions, "leaves:approve", "leaves:manage_delegations"],
};

export const HUGO = {
  ...FATOU,
  prenom: "Hugo",
  nom: "Nguyen",
  role: { code: "RH", nom: "Ressources humaines" },
  permissions: [...FATOU.permissions, "leaves:readAll", "leaves:manage_types"],
};

// ── Vue 18 — Événements ─────────────────────────────────────────────────────

export const EVENEMENTS = [
  {
    id: "e1",
    titre: "Comité de pilotage",
    description: null,
    date: "2026-08-12",
    journeeEntiere: false,
    heureDebut: "09:00",
    heureFin: "10:30",
    interventionExterieure: false,
    parentId: null,
    frequenceSemaines: 2,
    jourSemaine: 3,
    recurrenceJusqua: "2026-12-31",
    project: { id: "p1", nom: "Refonte du portail citoyen" },
    participants: [
      { userId: "a1", user: { prenom: "Driss", nom: "Amrani" } },
      { userId: "a2", user: { prenom: "Inès", nom: "Rocher" } },
    ],
  },
  {
    id: "e2",
    titre: "Audit du prestataire",
    description: null,
    date: "2026-08-20",
    journeeEntiere: true,
    heureDebut: null,
    heureFin: null,
    interventionExterieure: true,
    parentId: null,
    frequenceSemaines: null,
    jourSemaine: null,
    recurrenceJusqua: null,
    project: null,
    participants: [],
  },
];

// ── Vue 19 — Congés ─────────────────────────────────────────────────────────

export const TYPES_CONGE = [
  {
    id: "t1",
    code: "CA",
    nom: "Congés annuels",
    description: "Congés payés légaux",
    icone: null,
    couleur: "#6A4BA6",
    remunere: true,
    validationRequise: true,
    limiteAnnuelle: 25,
    actif: true,
    systeme: true,
    utilisations: 42,
  },
  {
    id: "t2",
    code: "RTT",
    nom: "RTT",
    description: null,
    icone: null,
    couleur: "#0C6E86",
    remunere: true,
    validationRequise: false,
    limiteAnnuelle: null,
    actif: true,
    systeme: false,
    utilisations: 0,
  },
];

export const SOLDES = [
  {
    type: {
      id: "t1",
      code: "CA",
      nom: "Congés annuels",
      couleur: "#6A4BA6",
      icone: null,
      validationRequise: true,
    },
    solde: { annee: 2026, attribues: 25, consommes: 12, engages: 3, disponibles: 10 },
  },
  {
    type: {
      id: "t2",
      code: "RTT",
      nom: "RTT",
      couleur: "#0C6E86",
      icone: null,
      validationRequise: false,
    },
    solde: { annee: 2026, attribues: 12, consommes: 4, engages: 0, disponibles: 8 },
  },
];

const personne = (prenom: string, nom: string, id: string) => ({ id, prenom, nom });

export const DEMANDES = [
  {
    id: "c1",
    statut: "pending",
    dateDebut: "2026-09-07",
    dateFin: "2026-09-11",
    demiJourneeDebut: null,
    demiJourneeFin: null,
    motif: "Vacances scolaires",
    motifRefus: null,
    joursOuvres: "5",
    version: 1,
    type: { id: "t1", nom: "Congés annuels", couleur: "#6A4BA6", icone: null },
    user: personne("Camille", "Roussel", "u1"),
    validateur: personne("Fatou", "Berthier", "u2"),
    repartitions: [{ annee: 2026, jours: "5" }],
  },
  {
    id: "c2",
    statut: "approved",
    dateDebut: "2026-12-28",
    dateFin: "2027-01-03",
    demiJourneeDebut: null,
    demiJourneeFin: null,
    motif: null,
    motifRefus: null,
    joursOuvres: "4",
    version: 1,
    type: { id: "t1", nom: "Congés annuels", couleur: "#6A4BA6", icone: null },
    user: personne("Camille", "Roussel", "u1"),
    validateur: personne("Fatou", "Berthier", "u2"),
    // `RG-CNG-19` — à cheval sur deux années civiles, donc réparti.
    repartitions: [
      { annee: 2026, jours: "2" },
      { annee: 2027, jours: "2" },
    ],
  },
];

export const DELEGATIONS = {
  donnees: [
    {
      id: "d1",
      dateDebut: "2026-08-01",
      dateFin: "2026-08-31",
      active: true,
      delegue: personne("Hugo", "Nguyen", "u3"),
    },
  ],
  recues: [],
};

// ── Vue 20 — Télétravail ────────────────────────────────────────────────────

export const PLANNING_TELETRAVAIL = [
  { date: "2026-08-04", etat: "telework", issuDeRegle: true },
  { date: "2026-08-06", etat: "office", issuDeRegle: false },
  { date: "2026-08-11", etat: "none", issuDeRegle: false },
];

export const REGLES_TELETRAVAIL = [
  { id: "r1", jourSemaine: 2, dateDebut: "2026-03-01", dateFin: null, active: true },
  { id: "r2", jourSemaine: 4, dateDebut: "2026-01-05", dateFin: "2026-06-30", active: false },
];

// ── Vue 21 — Temps passé ────────────────────────────────────────────────────

export const SAISIES = {
  saisies: [
    {
      id: "s1",
      date: "2026-08-12",
      heures: "7",
      typeActivite: "development",
      description: "Reprise du formulaire de contact",
      creeLe: "2026-08-12T18:00:00.000Z",
      project: { id: "p1", nom: "Refonte du portail citoyen" },
      task: { id: "k1", titre: "Formulaire de contact" },
      user: personne("Camille", "Roussel", "u1"),
      thirdParty: null,
    },
    {
      id: "s2",
      date: "2026-08-12",
      heures: "6.5",
      typeActivite: "meeting",
      description: "Ateliers usagers",
      creeLe: "2026-08-12T18:05:00.000Z",
      project: null,
      task: null,
      user: personne("Camille", "Roussel", "u1"),
      thirdParty: null,
    },
    {
      id: "s3",
      date: "2026-08-11",
      heures: "4",
      typeActivite: "development",
      description: "Prestation externe",
      creeLe: "2026-08-11T17:00:00.000Z",
      project: { id: "p1", nom: "Refonte du portail citoyen" },
      task: null,
      user: null,
      thirdParty: { id: "x1", organisation: "Presta SA", contactNom: null },
    },
  ],
  cumul: { entrees: 3, heures: 17.5 },
};
