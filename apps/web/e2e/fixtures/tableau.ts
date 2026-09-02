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

/**
 * Le contributeur du brief : `planning:read`, mais **pas** `users:read`.
 *
 * `SESSION_TABLEAU` hérite de `users:read` par `SESSION`. Sans cette
 * variante, `RG-GEN-06` ne pourrait pas être vérifiée sur le bloc de
 * présence — et « la vue est complète en un écran pour Camille » resterait
 * une affirmation.
 */
export const SESSION_TABLEAU_SANS_ANNUAIRE = {
  ...SESSION_TABLEAU,
  role: { code: "PROJECT_CONTRIBUTOR", nom: "Contributeur projet" },
  permissions: SESSION_TABLEAU.permissions.filter((p) => p !== "users:read"),
};

/**
 * `EX-USR-09` — la présence du jour, dans la forme que rend le SERVEUR.
 *
 * Relevée sur `utilisateurs.service.ts` (`presenceDuJour`), pas déduite du
 * nom de la route : trois états exclusifs, `typeConge` non nul seulement pour
 * un congé, et aucune couleur — le service sélectionne bien `type.couleur`
 * mais ne la réémet pas. Un jeu d'essai qui l'inventerait ferait passer au
 * vert une vue que le serveur ne peut pas nourrir.
 */
export const PRESENCE = [
  { id: "u-moi", prenom: "Camille", nom: "Roussel", etat: "present", typeConge: null },
  { id: "u-driss", prenom: "Driss", nom: "Amrani", etat: "conge", typeConge: "Congé annuel" },
  { id: "u-ines", prenom: "Inès", nom: "Rocher", etat: "teletravail", typeConge: null },
];

/** `RG-GEN-04` — le périmètre vide s'explique, il ne se laisse pas blanc. */
export const PRESENCE_VIDE: typeof PRESENCE = [];

/**
 * `EX-PRJ-13` — la capture d'instantané, et sa réponse.
 *
 * **Ces deux-là décrivent la vue 11, pas la vue 06.** Ils vivent ici parce que
 * le contrôle de la capture est logé dans `tableau.e2e.spec.ts` : un autre lot
 * travaille sur `projets.e2e.spec.ts`, et deux lots dans le même fichier se
 * perdent l'un l'autre. À la fusion, leur place est `fixtures/projets.ts`.
 */
export const SESSION_INSTANTANE = {
  ...SESSION_TABLEAU,
  permissions: [...SESSION_TABLEAU.permissions, "reports:read"],
};

/**
 * La ligne `ProjectSnapshot` telle que Prisma la sérialise.
 *
 * `heuresConsommees` est une **chaîne** : la colonne est un `Decimal`, et un
 * `Decimal` porte un `toJSON` qui rend du texte — comme `budgetHeures` de la
 * fiche projet. L'écrire en nombre ici aurait validé une forme que le serveur
 * ne rend jamais.
 */
export const INSTANTANE_PRIS = {
  id: "snap-1",
  projectId: "22222222-2222-4222-8222-222222222222",
  date: "2026-08-12",
  progression: 62,
  tachesTotal: 34,
  tachesFinies: 21,
  heuresConsommees: "744.00",
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
      {
        /*
         * Le SAMEDI 15 août 2026. Rien d'autre ne tombe le week-end : sans
         * cette tâche, montrer ou masquer le samedi ne changerait qu'une
         * colonne vide, et le contrôle du réglage des jours visibles ne
         * pourrait pas dire que le contenu suit.
         */
        id: "t-samedi", titre: "Astreinte de week-end", statut: "todo",
        priorite: "normal", avancement: 0,
        dateDebut: "2026-08-15", dateFin: "2026-08-15",
        heureDebut: null, heureFin: null, interventionExterieure: false,
        project: null, assignes: ["u-moi"], horsProjet: true, multiAssignee: false,
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
