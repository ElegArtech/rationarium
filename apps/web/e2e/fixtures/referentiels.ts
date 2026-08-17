import { SESSION } from "./projets.js";

/** Jeux de données des vues 22 à 26. */

export const SESSION_REFERENTIELS = {
  ...SESSION,
  permissions: [
    ...SESSION.permissions,
    "skills:read",
    "skills:create",
    "skills:delete",
    "skills:manage_matrix",
    "third_parties:read",
    "third_parties:create",
    "third_parties:delete",
    "clients:read",
    "clients:create",
    "clients:delete",
  ],
};

// ── Vue 22 — Compétences ────────────────────────────────────────────────────

export const MATRICE = {
  colonnes: [
    {
      id: "s1",
      nom: "Cartographie SIG",
      categorie: "technical",
      effectifRequis: 3,
      detenteurs: 1,
      manque: 2,
      ecart: true,
      couverture: "partielle" as const,
      ratio: "1/3",
    },
    {
      id: "s2",
      nom: "Rédaction administrative",
      categorie: "methodology",
      effectifRequis: 1,
      detenteurs: 2,
      manque: 0,
      ecart: false,
      couverture: "complete" as const,
      ratio: "2/1",
    },
  ],
  lignes: [
    {
      agent: { id: "a1", prenom: "Driss", nom: "Amrani" },
      niveaux: ["expert", "master"],
    },
    {
      agent: { id: "a2", prenom: "Inès", nom: "Rocher" },
      niveaux: [null, "intermediate"],
    },
    {
      agent: { id: "a3", prenom: "Sans", nom: "Competence" },
      niveaux: [null, null],
    },
  ],
  synthese: { competences: 2, avecEcart: 1, couvertureMoyenne: 67 },
};

export const REFERENTIEL = [
  {
    id: "s1",
    nom: "Cartographie SIG",
    categorie: "technical",
    description: "Production et mise à jour des couches cartographiques",
    effectifRequis: 3,
    detenteurs: 1,
    manque: 2,
  },
  {
    id: "s2",
    nom: "Rédaction administrative",
    categorie: "methodology",
    description: null,
    effectifRequis: 1,
    detenteurs: 2,
    manque: 0,
  },
];

// ── Vues 23 et 24 — Tiers ───────────────────────────────────────────────────

export const TIERS_MORALE = {
  id: "x1",
  type: "organisation",
  organisation: "Presta SA",
  contactNom: null,
  contactEmail: null,
  contactTelephone: null,
  notes: "Marché à bons de commande 2026",
  actif: true,
  _count: { projets: 2, taches: 5 },
};

export const TIERS_PHYSIQUE = {
  id: "x2",
  type: "individual",
  organisation: null,
  contactNom: "Nadia Kaufmann",
  contactEmail: "nadia.kaufmann@exemple.fr",
  contactTelephone: "01 02 03 04 05",
  notes: null,
  actif: true,
  _count: { projets: 1, taches: 0 },
};

export const TIERS_ARCHIVE = {
  ...TIERS_MORALE,
  id: "x3",
  organisation: "Ancien prestataire",
  actif: false,
};

export const LISTE_TIERS = [TIERS_MORALE, TIERS_PHYSIQUE];

export const FICHE_TIERS = {
  id: TIERS_MORALE.id,
  type: TIERS_MORALE.type,
  organisation: TIERS_MORALE.organisation,
  contactNom: null,
  contactEmail: null,
  contactTelephone: null,
  notes: TIERS_MORALE.notes,
  actif: true,
  projets: [{ id: "p1", nom: "Refonte du portail citoyen", statut: "active", icone: "p-screen" }],
  taches: [
    { id: "k1", titre: "Audit d'accessibilité", statut: "doing", dateFin: "2026-09-30", projet: { id: "p1", nom: "Refonte du portail citoyen", icone: "p-screen" } },
  ],
  /*
   * `heuresDeclarees` est la SOMME, `saisies` le NOMBRE de lignes. La fiche
   * affichait la même valeur aux deux places — donc fausse dans l'une des
   * deux. Le jeu d'essai les distingue désormais, sinon il consacrerait le
   * défaut au lieu de le trouver.
   */
  heuresDeclarees: 18,
  saisies: 3,
  saisiesRecentes: [
    { id: "h1", date: "2026-08-14", heures: 7, typeActivite: "development", description: "Atelier de cadrage" },
    { id: "h2", date: "2026-08-12", heures: 6, typeActivite: "meeting", description: "Recette" },
    { id: "h3", date: "2026-08-10", heures: 5, typeActivite: "support", description: null },
  ],
  saisiesRestantes: 0,
  premiereIntervention: "2026-08-10",
  derniereIntervention: "2026-08-14",
  creeLe: "2026-01-05T00:00:00.000Z",
  modifieLe: "2026-08-14T00:00:00.000Z",
};

export const FICHE_TIERS_VIDE = {
  ...FICHE_TIERS,
  id: "x9",
  organisation: "Sans rattachement",
  projets: [],
  taches: [],
  heuresDeclarees: 0,
  saisies: 0,
  saisiesRecentes: [],
  saisiesRestantes: 0,
  premiereIntervention: null,
  derniereIntervention: null,
};

// ── Vues 25 et 26 — Clients ─────────────────────────────────────────────────

export const CLIENTS = [
  {
    id: "c1",
    nom: "Direction de la relation citoyen",
    contactNom: "Fatou Berthier",
    contactEmail: "f.berthier@exemple.fr",
    contactTelephone: null,
    adresse: "12 place de la Mairie",
    notes: null,
    actif: true,
    projets: [{ project: { id: "p1", nom: "Refonte du portail citoyen" } }],
    _count: { projets: 1 },
  },
  {
    id: "c2",
    nom: "Association des usagers",
    contactNom: null,
    contactEmail: null,
    contactTelephone: null,
    adresse: null,
    notes: null,
    actif: false,
    projets: [],
    _count: { projets: 0 },
  },
];

export const FICHE_CLIENT = {
  id: "c1",
  nom: "Direction de la relation citoyen",
  contactNom: "Fatou Berthier",
  contactEmail: "f.berthier@exemple.fr",
  contactTelephone: null,
  adresse: "12 place de la Mairie",
  notes: null,
  actif: true,
  projets: [
    { id: "p1", nom: "Refonte du portail citoyen", statut: "active" },
    { id: "p2", nom: "Guichet unique", statut: "draft" },
  ],
};

export const FICHE_CLIENT_VIDE = {
  ...FICHE_CLIENT,
  id: "c2",
  nom: "Association des usagers",
  actif: false,
  projets: [],
};

export const IMPACT_VIDE = { blocages: [], effacements: [], alternative: null };
