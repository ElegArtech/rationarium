import { PROJET } from "./projets.js";

/**
 * Jeux de données des vues 12, 16 et 17.
 *
 * Ils sont construits pour que chaque état de `design/etats.json` soit
 * atteignable : colonnes vides, tâche hors projet, dépendances dans les deux
 * sens, tâche sans rien.
 */

const assigne = (prenom: string, nom: string, id: string) => ({
  userId: id,
  porteur: false,
  user: { prenom, nom },
});

export const TACHE_PROJET = {
  id: "33333333-3333-4333-8333-333333333333",
  version: 3,
  titre: "Rédiger la note de cadrage",
  description: "Le périmètre, les acteurs et le calendrier.",
  statut: "doing",
  priorite: "high",
  dateDebut: "2026-03-02",
  dateFin: "2026-11-30",
  estimationHeures: "14",
  avancement: 45,
  confidentielle: false,
  project: { id: PROJET.id, nom: PROJET.nom, icone: null },
  milestone: { id: "j2", nom: "Recette fonctionnelle" },
  assignes: [assigne("Driss", "Amrani", "a1"), assigne("Hugo", "Nguyen", "a2")],
  _count: { sousTaches: 2, dependances: 1 },
  enRetard: false,
  horsProjet: false,
};

/** Le cas nominal du hors-projet : réunion, transverse, sollicitation. */
export const TACHE_INDEPENDANTE = {
  ...TACHE_PROJET,
  id: "44444444-4444-4444-8444-444444444444",
  titre: "Réunion de service hebdomadaire",
  description: null,
  statut: "todo",
  priorite: "normal",
  dateFin: "2026-02-01",
  estimationHeures: null,
  avancement: 0,
  project: null,
  milestone: null,
  assignes: [],
  _count: { sousTaches: 0, dependances: 0 },
  enRetard: true,
  horsProjet: true,
};

export const LISTE = [TACHE_PROJET, TACHE_INDEPENDANTE];

export const FICHE = {
  ...TACHE_PROJET,
  creeLe: "2026-02-20T10:00:00.000Z",
  modifieLe: "2026-08-14T16:30:00.000Z",
  heureDebut: "09:00",
  heureFin: "12:30",
  interventionExterieure: false,
  epic: { id: "e1", nom: "Socle numérique" },
  sousTaches: [
    { id: "s1", libelle: "Recenser les acteurs", fait: true, ordre: 0 },
    { id: "s2", libelle: "Écrire le périmètre", fait: false, ordre: 1 },
  ],
  raci: [
    { userId: "a1", role: "responsible", user: { prenom: "Driss", nom: "Amrani" } },
    { userId: "a2", role: "consulted", user: { prenom: "Hugo", nom: "Nguyen" } },
  ],
  tiers: [{ id: "x1", organisation: "Presta SA", contactNom: null }],
  commentaires: [
    {
      id: "c1",
      contenu: "Le périmètre a été revu avec la direction.",
      creeLe: "2026-08-10T09:15:00.000Z",
      auteur: { id: "a1", prenom: "Driss", nom: "Amrani" },
    },
  ],
  documents: [
    {
      id: "d1",
      nom: "cadrage-v2.pdf",
      tailleOctets: 248_320,
      typeMime: "application/pdf",
      creeLe: "2026-08-09T11:00:00.000Z",
      auteur: { prenom: "Fatou", nom: "Berthier" },
    },
  ],
  /*
   * `RG-SCOPE-04` — **`lisible` est TOUJOURS rendu par le serveur**, et il
   * manquait ici. Le jeu d'essai décrivait donc une forme que
   * `TachesService.dependances` n'a jamais produite : toute vue qui filtre sur
   * `lisible` — la fenêtre de sélection le fait, pour savoir ce qu'elle a le
   * droit de nommer — trouvait `undefined` et n'affichait rien. Deuxième
   * occurrence dans ce fichier du couple client/fixture qui se valide lui-même.
   */
  dependances: {
    dependDe: [
      {
        id: "p1",
        titre: "Ateliers usagers",
        statut: "done",
        // Postérieure au 2026-03-02, début de la tâche : c'est une incohérence
        // de dates réelle, et `GET :id/incoherences` la rend.
        dateFin: "2026-04-20",
        lisible: true,
      },
    ],
    bloque: [
      {
        id: "b1",
        titre: "Rédiger le cahier des charges",
        statut: "todo",
        dateDebut: "2026-12-01",
        lisible: true,
      },
    ],
  },
  incoherences: [] as {
    prerequis: { id: string; titre: string; dateFin: string | null };
    jours: number;
  }[],
};

/** Une tâche dont tout est vide : l'état « tout vide » de `design/etats.json`. */
export const FICHE_VIDE = {
  ...FICHE,
  id: "55555555-5555-4555-8555-555555555555",
  titre: "Tâche à peine créée",
  description: null,
  dateDebut: null,
  dateFin: null,
  heureDebut: null,
  heureFin: null,
  estimationHeures: null,
  avancement: 0,
  project: null,
  milestone: null,
  epic: null,
  horsProjet: true,
  assignes: [],
  sousTaches: [],
  raci: [],
  tiers: [],
  commentaires: [],
  documents: [],
  dependances: { dependDe: [], bloque: [] },
  enRetard: false,
};

/**
 * `EX-TSK-10` — les tâches candidates que `GET :id/dependances/candidats` rend.
 *
 * Le serveur a DÉJÀ écarté les cinq refus : ce que la fenêtre reçoit est
 * posable, sans exception. Le jeu d'essai se calque donc sur la signature du
 * service — `{ id, titre, statut, dateFin, conflit }` —, jamais sur ce que le
 * client croirait recevoir.
 */
export const CANDIDATS = [
  {
    id: "66666666-6666-4666-8666-666666666666",
    titre: "Cadrer les parcours",
    statut: "done",
    dateFin: "2026-05-12",
    conflit: false,
  },
  {
    id: "77777777-7777-4777-8777-777777777777",
    titre: "Recetter le portail",
    statut: "doing",
    // Postérieure au 2026-03-02, début de `TACHE_PROJET` : c'est le conflit de
    // dates que `.dep-warn` annonce à la sélection.
    dateFin: "2026-12-15",
    conflit: true,
  },
];

/** `EX-TSK-12` — ce que `GET :id/incoherences` rend pour `FICHE`. */
export const INCOHERENCES = [
  {
    prerequis: { id: "p1", titre: "Ateliers usagers", dateFin: "2026-04-20" },
    jours: 49,
  },
];
