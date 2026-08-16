import type { Permission } from "@trame/contracts";

/**
 * Structure de la barre latérale — `cadrage/02 § B`.
 *
 * Chaque entrée porte la permission qui la rend visible. **Les entrées
 * auxquelles l'utilisateur n'a pas droit ne sont pas affichées** — pas
 * désactivées, absentes (RG-GEN-06). Un groupe dont toutes les entrées
 * disparaissent disparaît lui aussi : le brief prévient qu'il faut prévoir ce
 * cas.
 *
 * Effectifs relevés sur la maquette gelée (vue 06, panneau de revue), qui fait
 * foi : Camille 8 entrées · Fatou et Inès 12 · Karim 18.
 *
 * **Trois entrées demandent plus que la lecture**, et le relevé l'a montré.
 * La distinction est toujours la même : la permission de LIRE une donnée sert
 * à l'afficher ailleurs ; ouvrir la page qui la GÈRE est autre chose.
 *
 *   Compétences        `skills:read_team`        — consulter ses propres
 *                                                  compétences ne donne pas
 *                                                  accès à la matrice
 *   Paramètres         `settings:update`         — `settings:read` sert à tout
 *                                                  le monde, pour les formats
 *                                                  de date
 *   Tâches prédéfinies `predefined_tasks:update` — `predefined_tasks:read`
 *                                                  sert au planning, où les
 *                                                  permanences s'affichent
 *                                                  (RG-PLN-07)
 *
 * Confondre les deux donnait à Camille et à Fatou des entrées
 * d'administration qu'elles n'ont pas dans la maquette.
 */
export type EntreeNav = { cle: string; chemin: string; permission: Permission };
export type GroupeNav = { cle: string; entrees: EntreeNav[] };

export const NAVIGATION: GroupeNav[] = [
  {
    cle: "pilotage",
    entrees: [
      { cle: "tableauDeBord", chemin: "/", permission: "planning:read" },
      { cle: "planning", chemin: "/planning", permission: "planning:read" },
      { cle: "rapports", chemin: "/rapports", permission: "reports:read" },
    ],
  },
  {
    cle: "projets",
    entrees: [
      { cle: "projetsListe", chemin: "/projets", permission: "projects:read" },
      { cle: "taches", chemin: "/taches", permission: "tasks:read" },
      { cle: "evenements", chemin: "/evenements", permission: "events:read" },
    ],
  },
  {
    cle: "rh",
    entrees: [
      { cle: "conges", chemin: "/conges", permission: "leaves:read" },
      { cle: "teletravail", chemin: "/teletravail", permission: "telework:read" },
      { cle: "tempsPasse", chemin: "/temps", permission: "time_tracking:read" },
      { cle: "competences", chemin: "/competences", permission: "skills:read_team" },
    ],
  },
  {
    cle: "referentiels",
    entrees: [
      { cle: "utilisateurs", chemin: "/utilisateurs", permission: "users:read" },
      { cle: "departements", chemin: "/departements", permission: "departments:read" },
      { cle: "tiers", chemin: "/tiers", permission: "third_parties:read" },
      { cle: "clients", chemin: "/clients", permission: "clients:read" },
    ],
  },
  {
    cle: "administration",
    entrees: [
      { cle: "roles", chemin: "/roles", permission: "users:manage_roles" },
      { cle: "journalAudit", chemin: "/audit", permission: "audit:read" },
      { cle: "tachesPredefinies", chemin: "/taches-predefinies", permission: "predefined_tasks:update" },
      { cle: "parametres", chemin: "/parametres", permission: "settings:update" },
    ],
  },
];

/** Filtre la navigation selon les permissions résolues côté serveur. */
export const navigationVisible = (permissions: ReadonlySet<string>): GroupeNav[] =>
  NAVIGATION.map((g) => ({ ...g, entrees: g.entrees.filter((e) => permissions.has(e.permission)) }))
    .filter((g) => g.entrees.length > 0);
