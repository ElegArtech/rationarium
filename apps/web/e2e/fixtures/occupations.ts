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

/**
 * Les événements de la vue 18.
 *
 * **Les champs de récurrence sont ceux que le SERVEUR rend** —
 * `recurrenceFrequence`, `recurrenceJourSemaine`, `recurrenceFin`, tels que
 * `EvenementsService.surPlage` les tire de Prisma. Ce jeu d'essai déclarait
 * `frequenceSemaines` / `jourSemaine` / `recurrenceJusqua`, c'est-à-dire les
 * noms du corps de CRÉATION, et il validait ainsi l'invention du client : la
 * détection de série ne tombait jamais sur cette branche, et le test passait au
 * vert sur une forme que le serveur n'a jamais rendue. Un jeu d'essai se calque
 * sur la signature du service, jamais sur ce que le client croit recevoir.
 */
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
    recurrenceFrequence: 2,
    recurrenceJourSemaine: 3,
    recurrenceFin: "2026-12-31",
    version: 1,
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
    recurrenceFrequence: null,
    recurrenceJourSemaine: null,
    recurrenceFin: null,
    version: 1,
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

/**
 * `EX-CNG-07` — une demande d'ANNULATION, telle que le serveur la sert au
 * validateur.
 *
 * `GET /conges?aValider=true` filtre sur
 * `statut: { in: ["pending", "cancellation_requested"] }` : cette ligne-là
 * arrive donc dans le même tableau que les demandes en attente. Le jeu d'essai
 * n'en portait aucune, et c'est précisément ce qui a laissé vivre le défaut —
 * la branche « Approuver / Refuser » n'avait rien à quoi se heurter.
 */
export const DEMANDE_ANNULATION = {
  id: "c3",
  statut: "cancellation_requested",
  dateDebut: "2026-10-05",
  dateFin: "2026-10-09",
  demiJourneeDebut: null,
  demiJourneeFin: null,
  motif: null,
  motifRefus: null,
  joursOuvres: "5",
  version: 2,
  type: { id: "t1", nom: "Congés annuels", couleur: "#6A4BA6", icone: null },
  user: personne("Youssef", "Haddad", "u4"),
  validateur: personne("Fatou", "Berthier", "u2"),
  repartitions: [{ annee: 2026, jours: "5" }],
};

/**
 * `EX-CNG-09` — le solde d'UN type pour UNE année, **tel que
 * `GET /conges/solde` le rend** : un objet `Solde` nu, pas une entrée du
 * catalogue `{ type, solde }` de `GET /conges/soldes`.
 *
 * Les chiffres sont **délibérément différents** de ceux de `SOLDES` : c'est
 * ce qui rend le contrôle capable de dire laquelle des deux routes la fenêtre
 * de demande a réellement interrogée. Avec des chiffres identiques, le test
 * passerait au vert que la vue appelle l'une ou l'autre — il ne mesurerait
 * rien.
 */
export const SOLDE_T1_2026 = {
  annee: 2026,
  attribues: 30,
  consommes: 21,
  engages: 0,
  disponibles: 9,
};

/**
 * `RG-CNG-08` — la réponse de `GET /conges/validateur` : **un identifiant, et
 * rien d'autre**.
 *
 * `CongesController.validateur` rend `{ validateurId }`. Le jeu d'essai s'en
 * tient là, y compris à ce qui manque : ni prénom, ni nom. C'est le défaut
 * serveur que la vue contourne, et le recopier ici est ce qui empêche le
 * contrôle de valider une forme que le serveur ne rend pas.
 *
 * `u2` est l'identifiant de Fatou Berthier dans `DEMANDES` : c'est par là que
 * l'écran retrouve son nom.
 */
export const VALIDATEUR = { validateurId: "u2" };

/** Aucun validateur déterminé à cette date — la troisième branche de `RG-CNG-08`. */
export const SANS_VALIDATEUR = { validateurId: null };

/**
 * `RG-CNG-29` — un type **désactivé** que les congés existants conservent.
 *
 * Il n'est dans NI `TYPES_CONGE` (le référentiel actif) NI dans `SOLDES` (que
 * le serveur borne à `actif: true`) — c'est tout l'intérêt : une demande
 * posée dessus reste modifiable (`EX-CNG-05`), et son solde ne peut venir que
 * de `GET /conges/solde`, qui ne filtre pas sur l'activité du type.
 */
export const DEMANDE_TYPE_DESACTIVE = {
  id: "c4",
  statut: "pending",
  dateDebut: "2026-09-07",
  dateFin: "2026-09-11",
  demiJourneeDebut: null,
  demiJourneeFin: null,
  motif: "Congé exceptionnel accordé avant retrait du type",
  motifRefus: null,
  joursOuvres: "5",
  version: 1,
  type: { id: "t3", nom: "Congé exceptionnel", couleur: "#8A5A00", icone: null },
  user: personne("Camille", "Roussel", "u1"),
  validateur: personne("Fatou", "Berthier", "u2"),
  repartitions: [{ annee: 2026, jours: "5" }],
};

/** Le solde du type désactivé — servi par `GET /conges/solde`, par personne d'autre. */
export const SOLDE_T3_2026 = {
  annee: 2026,
  attribues: 6,
  consommes: 1,
  engages: 0,
  disponibles: 5,
};

/**
 * `RG-CNG-16` — le décompte en jours ouvrés, **tel que le serveur le rend**.
 *
 * `GET /parametrage/jours-ouvres` répond `{ jours, parAnnee }` : c'est la
 * signature de `ParametrageController.joursOuvres`, qui compose
 * `CalendrierService.joursOuvres` et `repartitionParAnnee`.
 *
 * Le jeu par défaut est celui de la demande à cheval du 28/12/2026 au
 * 03/01/2027 : quatre jours ouvrés, deux de chaque côté du 1er janvier.
 */
export const JOURS_OUVRES_A_CHEVAL = {
  jours: 4,
  parAnnee: [
    { annee: 2026, jours: 2 },
    { annee: 2027, jours: 2 },
  ],
};

/**
 * Une semaine pleine — du lundi 7 au dimanche 13 septembre 2026 : **sept jours
 * de calendrier, cinq jours ouvrés**. C'est l'écart entre les deux chiffres
 * qui prouve d'où vient le décompte.
 */
export const JOURS_OUVRES_SEMAINE = {
  jours: 5,
  parAnnee: [{ annee: 2026, jours: 5 }],
};

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

/**
 * Le planning de télétravail, **à la forme que le serveur rend réellement** :
 * `{ calendrier, cumul }`, un jour par date de la plage, avec `weekend` et
 * `exception`.
 *
 * La version précédente de ce jeu d'essai était un simple tableau de trois
 * jours — une forme que `TeletravailService.planning` n'a jamais rendue. Le
 * type du client la recopiait, la vue faisait `.map` dessus, et la vue 20 ne
 * s'affichait pas du tout : elle levait à chaque rendu. Les contrôles de bout
 * en bout passaient, puisqu'ils servaient la même fiction que le code.
 *
 * **Un jeu d'essai qui ment sur la forme rend le contrôle aveugle.**
 */
export const PLANNING_TELETRAVAIL = {
  calendrier: [
    { date: "2026-08-03", etat: "undeclared", weekend: false, issuDeRegle: false, exception: false },
    { date: "2026-08-04", etat: "telework", weekend: false, issuDeRegle: true, exception: false },
    { date: "2026-08-05", etat: "undeclared", weekend: false, issuDeRegle: false, exception: false },
    { date: "2026-08-06", etat: "office", weekend: false, issuDeRegle: false, exception: false },
    { date: "2026-08-07", etat: "undeclared", weekend: false, issuDeRegle: false, exception: false },
    { date: "2026-08-08", etat: "undeclared", weekend: true, issuDeRegle: false, exception: false },
    { date: "2026-08-09", etat: "undeclared", weekend: true, issuDeRegle: false, exception: false },
    { date: "2026-08-10", etat: "undeclared", weekend: false, issuDeRegle: false, exception: false },
    { date: "2026-08-11", etat: "office", weekend: false, issuDeRegle: true, exception: true },
  ],
  cumul: { teletravail: 1, bureau: 2, nonDeclares: 5 },
};

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
  /* `RG-TMP-02` — le plafond vient du serveur, la vue n'en garde pas de copie.
     Douze heures : la journée du 12 août en cumule 13,5 et doit donc ressortir
     en dépassement. */
  cumul: { entrees: 3, heures: 17.5, plafondJournalier: 12 },
};
