import { SESSION } from "./projets.js";

/**
 * Jeux de données des vues 07, 08 et 09 — L-20.
 *
 * Le jeu est construit autour des cas que le brief nomme comme difficiles :
 * une cellule qui porte plusieurs natures d'occupation, un congé en attente à
 * côté d'un congé validé, une demi-journée, une tâche multi-assignée, un jour
 * férié, une semaine de vacances scolaires, un agent rattaché à deux services.
 */

export const SESSION_PLANNING = {
  ...SESSION,
  id: "u-moi",
  prenom: "Fatou",
  nom: "Diallo",
  role: { code: "ENCADREMENT", nom: "Encadrement" },
  permissions: [
    ...SESSION.permissions,
    "planning:read",
    "planning:export_ics",
    "tasks:update",
    "tasks:create",
    "events:create",
    "telework:create",
    "predefined_tasks:read",
    "predefined_tasks:assign",
    "predefined_tasks:update",
  ],
};

/**
 * ════════════════════════════════════════════════════════════════════════════
 * `RG-GEN-06` — **le planning sans la grille d'activité.**
 *
 * `predefined_tasks:read` vient d'`ENCADREMENT` : un porteur du seul `SOCLE`
 * ne l'a pas, et `GET /api/planning/activite` lui répond `403`. Le sélecteur
 * de mode lui proposait pourtant « Activité » sur les vues 07, 08 et 09.
 *
 * La permission de permanence `predefined_tasks:assign` part avec elle : la
 * garder ferait de ce jeu une combinaison que le catalogue de rôles ne produit
 * pas.
 * ════════════════════════════════════════════════════════════════════════════
 */
export const SESSION_SANS_ACTIVITE = {
  ...SESSION_PLANNING,
  role: { code: "SOCLE", nom: "Agent" },
  permissions: SESSION_PLANNING.permissions.filter((p) => !p.startsWith("predefined_tasks:")),
};

/**
 * `RG-PLN-04`, `RG-TLT-07` — **la bascule de lieu s'apprécie LIGNE PAR LIGNE.**
 *
 * `SESSION_PLANNING` porte `telework:create` et rien d'autre : elle peut donc
 * déclarer SON lieu, et celui de personne d'autre. Elle vaut « u-moi », qui
 * n'est dans aucun groupe de `SEMAINE` — aucune cellule de la grille ne lui
 * offre donc la bascule, et c'est juste. Le jeu était écrit quand la décision
 * se prenait à l'échelle de la vue : la cellule d'Ana s'y basculait sur la
 * seule `telework:create`, et le serveur répondait `403` après coup.
 *
 * Trois sessions, une par branche de `teletravailModifiablePar` :
 *
 *  - `SESSION_TELETRAVAIL_AUTRUI` — les deux permissions : elle bascule tout ;
 *  - `SESSION_ANA` — `telework:create` seule, mais elle EST dans la grille :
 *    sa cellule à elle se bascule, celle de Bruno non ;
 *  - `SESSION_SANS_TELETRAVAIL` — `telework:manage_any` sans l'écriture :
 *    rien ne se bascule, et la cellule reste pourtant lisible.
 *
 * `SESSION_PLANNING` reste inchangée : quatre autres suites en dépendent, et
 * une permission de plus dans un jeu d'essai partagé se paie deux fichiers
 * plus loin.
 */
export const SESSION_TELETRAVAIL_AUTRUI = {
  ...SESSION_PLANNING,
  permissions: [...SESSION_PLANNING.permissions, "telework:manage_any"],
};

/** `RG-TLT-07` — Ana en personne : son lieu à elle, pas celui des autres. */
export const SESSION_ANA = {
  ...SESSION_PLANNING,
  id: "u-ana",
  prenom: "Ana",
  nom: "Berger",
};

/**
 * `RG-PLN-04` — sans le droit d'ÉCRIRE, la cellule est en lecture seule.
 *
 * Elle dérive de `SESSION_TELETRAVAIL_AUTRUI`, pas de `SESSION_PLANNING` :
 * elle garde donc `telework:manage_any` et perd `telework:create`. C'est la
 * seule façon que le contrôle mesure quelque chose — dérivée de la session
 * nue, il passerait avec comme sans la règle, puisque la bascule n'était de
 * toute façon offerte sur aucune cellule.
 */
export const SESSION_SANS_TELETRAVAIL = {
  ...SESSION_TELETRAVAIL_AUTRUI,
  permissions: SESSION_TELETRAVAIL_AUTRUI.permissions.filter((p) => p !== "telework:create"),
};

/** `RG-PLN-07` — sans le droit, les permanences ne sont pas rendues du tout. */
export const SESSION_SANS_PERMANENCES = {
  ...SESSION_PLANNING,
  permissions: SESSION_PLANNING.permissions.filter((p) => p !== "predefined_tasks:read"),
};

const jours = (debut: string, n: number) => {
  const sortie: string[] = [];
  const d = new Date(`${debut}T00:00:00.000Z`);
  for (let i = 0; i < n; i += 1) {
    sortie.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return sortie;
};

const PERSONNES = [
  {
    id: "u-ana", prenom: "Ana", nom: "Berger",
    avatarFichier: null, avatarPredefini: null,
    departement: { id: "dep1", nom: "Direction des services numériques" },
    services: [{ service: { id: "svc1", nom: "Études et développement" } }],
  },
  {
    // Bruno appartient à deux services : il apparaît deux fois, compté une.
    id: "u-bruno", prenom: "Bruno", nom: "Costa",
    avatarFichier: null, avatarPredefini: null,
    departement: { id: "dep1", nom: "Direction des services numériques" },
    services: [
      { service: { id: "svc1", nom: "Études et développement" } },
      { service: { id: "svc2", nom: "Exploitation" } },
    ],
  },
  {
    // Sans service : un agent invisible est un agent qu'on croit disponible.
    id: "u-solo", prenom: "Chloe", nom: "Dupont",
    avatarFichier: null, avatarPredefini: null,
    departement: { id: "dep2", nom: "Mission transversale" },
    services: [],
  },
];

const GROUPES = [
  {
    service: { id: "svc1", nom: "Études et développement" },
    personnes: [PERSONNES[0]!, PERSONNES[1]!],
  },
  { service: { id: "svc2", nom: "Exploitation" }, personnes: [PERSONNES[1]!] },
  { service: null, personnes: [PERSONNES[2]!] },
];

/** La semaine du lundi 10 au dimanche 16 août 2026. Le 15 est un samedi férié. */
export const SEMAINE = {
  periode: { debut: "2026-08-10", fin: "2026-08-16", jours: jours("2026-08-10", 7) },
  groupes: GROUPES,
  occupations: {
    taches: [
      {
        id: "t-note", titre: "Rédiger la note de cadrage", version: 1, statut: "doing",
        priorite: "high", avancement: 40,
        dateDebut: "2026-08-10", dateFin: "2026-08-11",
        heureDebut: null, heureFin: null, interventionExterieure: false,
        project: { id: "p1", nom: "Portail citoyen", icone: "◆" },
        assignes: ["u-ana"], horsProjet: false, multiAssignee: false,
      },
      {
        // Hors projet : filet interrompu, visuellement distincte.
        id: "t-veille", titre: "Veille technique", version: 1, statut: "todo",
        priorite: "low", avancement: 0,
        dateDebut: "2026-08-12", dateFin: "2026-08-12",
        heureDebut: null, heureFin: null, interventionExterieure: false,
        project: null, assignes: ["u-ana"], horsProjet: true, multiAssignee: false,
      },
      {
        // `RG-TSK-11` — multi-assignée : la date ne se déplace pas d'ici.
        id: "t-partagee", titre: "Recette croisée", version: 1, statut: "review",
        priorite: "normal", avancement: 60,
        dateDebut: "2026-08-13", dateFin: "2026-08-13",
        heureDebut: null, heureFin: null, interventionExterieure: false,
        project: { id: "p1", nom: "Portail citoyen", icone: "◆" },
        assignes: ["u-ana", "u-bruno"], horsProjet: false, multiAssignee: true,
      },
    ],
    conges: [
      {
        id: "c-valide", userId: "u-bruno",
        dateDebut: "2026-08-10", dateFin: "2026-08-11",
        statut: "approved", demiJourneeDebut: null, demiJourneeFin: null,
        type: { id: "ct1", nom: "Congés annuels", couleur: null, icone: null },
      },
      {
        // `EX-PLN-13` — en attente : trame, filet interrompu ET mention.
        id: "c-attente", userId: "u-solo",
        dateDebut: "2026-08-12", dateFin: "2026-08-12",
        statut: "pending", demiJourneeDebut: null, demiJourneeFin: null,
        type: { id: "ct1", nom: "Congés annuels", couleur: null, icone: null },
      },
      {
        // Une demi-journée : la cellule se scinde.
        id: "c-demi", userId: "u-ana",
        dateDebut: "2026-08-14", dateFin: "2026-08-14",
        statut: "approved", demiJourneeDebut: "afternoon", demiJourneeFin: null,
        type: { id: "ct2", nom: "RTT", couleur: null, icone: null },
      },
    ],
    teletravail: [
      { id: "w1", userId: "u-ana", date: "2026-08-13", etat: "telework", issuDeRegle: true, version: 1 },
      { id: "w2", userId: "u-bruno", date: "2026-08-12", etat: "office", issuDeRegle: false, version: 1 },
    ],
    evenements: [
      {
        id: "e-comite", titre: "Comité de pilotage", date: "2026-08-11",
        journeeEntiere: false, heureDebut: "14:00", heureFin: "15:30",
        interventionExterieure: false,
        project: { id: "p1", nom: "Portail citoyen" },
        participants: ["u-ana", "u-bruno"],
      },
      {
        // `RG-EVT-06` — l'intervention extérieure est signalée distinctement.
        id: "e-audit", titre: "Audit prestataire", date: "2026-08-13",
        journeeEntiere: true, heureDebut: null, heureFin: null,
        interventionExterieure: true, project: null, participants: ["u-solo"],
      },
    ],
    permanences: [
      {
        id: "a-accueil", userId: "u-solo", date: "2026-08-10",
        periode: "full_day", realisee: false,
        predefinedTask: {
          actif: true, id: "pt1", nom: "Permanence accueil", couleur: null, icone: null,
          heureDebut: "08:30", heureFin: "12:30",
        },
      },
    ],
  },
  trame: {
    joursChomes: ["2026-08-15"],
    vacances: [
      {
        libelle: "Vacances d'été",
        dateDebut: "2026-08-10", dateFin: "2026-08-14",
        zone: "B",
      },
    ],
  },
  synthese: [
    { date: "2026-08-10", absents: 1, total: 3, pourcentage: 33 },
    { date: "2026-08-11", absents: 1, total: 3, pourcentage: 33 },
    { date: "2026-08-12", absents: 0, total: 3, pourcentage: 0 },
    { date: "2026-08-13", absents: 1, total: 3, pourcentage: 33 },
    { date: "2026-08-14", absents: 2, total: 3, pourcentage: 67 },
    { date: "2026-08-15", absents: 0, total: 3, pourcentage: 0 },
    { date: "2026-08-16", absents: 0, total: 3, pourcentage: 0 },
  ],
};

/** `RG-PLN-07` — la même semaine, sans le droit de voir les permanences. */
export const SEMAINE_SANS_PERMANENCES = {
  ...SEMAINE,
  occupations: { ...SEMAINE.occupations, permanences: null },
};

/**
 * Le mois d'août 2026, sur la même population.
 *
 * Il ajoute à la semaine une journée SURCHARGÉE — le jeudi 13, cinq
 * occupations pour Ana, qui y a déjà du télétravail déclaré. C'est le seul
 * cas qui fasse apparaître `.mcount`, le compteur des occupations non
 * dessinées, et le seul où il cohabite avec le filet de lieu. Sans lui, le
 * contrôle de son placement n'a rien à mesurer et le dit.
 */
export const MOIS = {
  ...SEMAINE,
  periode: { debut: "2026-08-01", fin: "2026-08-31", jours: jours("2026-08-01", 31) },
  occupations: {
    ...SEMAINE.occupations,
    taches: [
      ...SEMAINE.occupations.taches,
      ...["Reprise des libellés", "Recette portail", "Charte éditoriale"].map((titre, i) => ({
        id: `t-charge-${i}`, titre, version: 1, statut: "doing",
        priorite: "normal", avancement: 10,
        dateDebut: "2026-08-13", dateFin: "2026-08-13",
        heureDebut: null, heureFin: null, interventionExterieure: false,
        project: { id: "p1", nom: "Portail citoyen", icone: "◆" },
        assignes: ["u-ana"], horsProjet: false, multiAssignee: false,
      })),
    ],
  },
  synthese: jours("2026-08-01", 31).map((date, i) => ({
    date,
    absents: i % 5,
    total: 3,
    pourcentage: Math.round(((i % 5) / 3) * 100),
  })),
};

/** L'état « aucune ressource » : le brief l'attribue d'abord aux filtres. */
export const AUCUNE_RESSOURCE = {
  ...SEMAINE,
  groupes: [],
  occupations: {
    taches: [], conges: [], teletravail: [], evenements: [], permanences: [],
  },
  synthese: SEMAINE.synthese.map((s) => ({ ...s, absents: 0, total: 0, pourcentage: 0 })),
};

// ── Vue 09 ──────────────────────────────────────────────────────────────────

export const GRILLE_ACTIVITE = {
  colonnes: [
    {
      actif: true, id: "pt1", nom: "Permanence accueil", couleur: null, icone: null,
      heureDebut: "08:30", heureFin: "12:30",
    },
    { actif: true, id: "pt2", nom: "Astreinte technique", couleur: null, icone: null, heureDebut: null, heureFin: null },
  ],
  lignes: jours("2026-08-10", 7).map((date, i) => ({
    date,
    cellules: [
      {
        tacheId: "pt1",
        agents:
          i === 0
            ? [
                /* Le rattachement de service accompagne l'agent : c'est ce
                   que filtre le sélecteur « Tous les services » de la
                   maquette 09. Ana relève des études, Bruno n'est rattaché
                   à rien — les deux cas doivent tenir. */
                {
                  id: "u-ana", prenom: "Ana", nom: "Berger",
                  version: 1, assignationId: "as1", periode: "full_day", realisee: true,
                  services: [{ service: { id: "s1", nom: "Études et développement" } }],
                },
                {
                  id: "u-bruno", prenom: "Bruno", nom: "Costa",
                  version: 1, assignationId: "as2", periode: "full_day", realisee: false,
                  services: [],
                },
              ]
            : [],
      },
      { tacheId: "pt2", agents: [] },
    ],
  })),
  trame: SEMAINE.trame,
};

export const GRILLE_VIDE = { colonnes: [], lignes: [], trame: SEMAINE.trame };

/** `RG-PLN-08` — chaque inéligible porte SA raison. */
export const ELIGIBILITE = [
  { userId: "u-ana", prenom: "Ana", nom: "Berger", motif: null },
  { userId: "u-bruno", prenom: "Bruno", nom: "Costa", motif: "deja_assigne" },
  { userId: "u-solo", prenom: "Chloe", nom: "Dupont", motif: "en_conge", detail: "Congés annuels" },
  { userId: "u-quatre", prenom: "David", nom: "Elias", motif: "en_teletravail" },
];

export const AUCUN_ELIGIBLE = ELIGIBILITE.filter((a) => a.motif !== null);
