import { SESSION } from "./projets.js";
import { SEMAINE } from "./planning.js";

/**
 * Jeux de données de la vue 06 — L-21.
 *
 * Le brief nomme deux profils opposés, et les deux sont ici : Camille, pour qui
 * la page doit être complète, et Inès, dont **tous les compteurs sont à zéro**
 * et pour qui la page doit rester digne.
 */

export const SESSION_TABLEAU = {
  ...SESSION,
  id: "u-moi",
  prenom: "Camille",
  nom: "Roussel",
  permissions: [
    ...SESSION.permissions,
    "planning:read",
    "tasks:update",
    "time_tracking:create",
    "time_tracking:read",
  ],
};

/** L'extrait de planning est celui d'une seule personne : la sienne. */
const PLANNING_PERSONNEL = {
  ...SEMAINE,
  groupes: [
    {
      service: { id: "svc1", nom: "Études et développement" },
      personnes: [
        {
          id: "u-moi", prenom: "Camille", nom: "Roussel",
          avatarFichier: null, avatarPredefini: null,
          departement: { id: "dep1", nom: "Direction des services numériques" },
          services: [{ service: { id: "svc1", nom: "Études et développement" } }],
        },
      ],
    },
  ],
  occupations: {
    taches: [
      {
        id: "t-note", titre: "Rédiger la note de cadrage", statut: "doing",
        priorite: "high", avancement: 40,
        dateDebut: "2026-08-10", dateFin: "2026-08-11",
        heureDebut: null, heureFin: null, interventionExterieure: false,
        project: { id: "p1", nom: "Portail citoyen", icone: "◆" },
        assignes: ["u-moi"], horsProjet: false, multiAssignee: false,
      },
    ],
    conges: [],
    teletravail: [
      { id: "w1", userId: "u-moi", date: "2026-08-12", etat: "telework", issuDeRegle: true, version: 1 },
    ],
    evenements: [],
    permanences: [],
  },
};

export const TABLEAU = {
  indicateurs: {
    projets: { actifs: 2, total: 5 },
    tachesEnCours: { valeur: 3, total: 11 },
    tachesTerminees: { valeur: 6, pourcentage: 55 },
    tachesEnRetard: 2,
  },
  taches: {
    aVenir: [
      {
        id: "t-note", titre: "Rédiger la note de cadrage", statut: "doing",
        priorite: "high", dateDebut: "2026-08-10", dateFin: "2026-08-11",
        estimationHeures: 8, version: 3,
        project: { id: "p1", nom: "Portail citoyen", icone: "◆" },
        enRetard: false, heuresDeclarees: 4.5,
      },
      {
        // `RG-DSH-04` — échéance dépassée et pas terminée.
        id: "t-retard", titre: "Reprendre le cahier de recette", statut: "todo",
        priorite: "critical", dateDebut: "2026-07-01", dateFin: "2026-08-01",
        estimationHeures: null, version: 1,
        project: null, enRetard: true, heuresDeclarees: 0,
      },
    ],
    nonDeclarees: [
      {
        id: "t-close", titre: "Recette de la version 2.1",
        dateFin: "2026-08-05", projet: "Portail citoyen",
      },
    ],
  },
  todos: {
    actives: [
      { id: "td1", libelle: "Relire la note de cadrage", fait: false, ordre: 1 },
      { id: "td2", libelle: "Appeler le prestataire", fait: false, ordre: 2 },
    ],
    faites: [{ id: "td3", libelle: "Réserver la salle", fait: true, ordre: 3 }],
    limite: 20,
    limiteAtteinte: false,
  },
  projets: [
    {
      id: "p1", nom: "Portail citoyen", statut: "active", icone: "◆",
      dateFin: "2026-12-31", _count: { taches: 24 },
    },
  ],
  planning: PLANNING_PERSONNEL,
};

/**
 * Le cas d'Inès : direction, aucun compteur personnel.
 *
 * Le brief l'exige explicitement — « la vue reste digne quand tous les
 * compteurs sont à zéro ». C'est le jeu de données qui le vérifie.
 */
export const TABLEAU_VIDE = {
  indicateurs: {
    projets: { actifs: 0, total: 0 },
    tachesEnCours: { valeur: 0, total: 0 },
    tachesTerminees: { valeur: 0, pourcentage: 0 },
    tachesEnRetard: 0,
  },
  taches: { aVenir: [], nonDeclarees: [] },
  todos: { actives: [], faites: [], limite: 20, limiteAtteinte: false },
  projets: [],
  planning: { ...PLANNING_PERSONNEL, occupations: {
    taches: [], conges: [], teletravail: [], evenements: [], permanences: [],
  } },
};

/** `RG-DSH-01` — la limite atteinte : le champ se ferme, et il dit pourquoi. */
export const TABLEAU_LIMITE = {
  ...TABLEAU,
  todos: {
    actives: TABLEAU.todos.actives,
    faites: TABLEAU.todos.faites,
    limite: 3,
    limiteAtteinte: true,
  },
};
