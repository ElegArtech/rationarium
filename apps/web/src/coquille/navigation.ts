import type { Permission } from "@rationarium/contracts";

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
export type EntreeNav = { cle: string; chemin: string; permission: Permission; icone: string };
export type GroupeNav = { cle: string; entrees: EntreeNav[] };

export const NAVIGATION: GroupeNav[] = [
  {
    cle: "pilotage",
    entrees: [
      { cle: "tableauDeBord", chemin: "/", permission: "planning:read" , icone: "i-dash" },
      { cle: "planning", chemin: "/planning", permission: "planning:read" , icone: "i-planning" },
      { cle: "rapports", chemin: "/rapports", permission: "reports:read" , icone: "i-reports" },
    ],
  },
  {
    cle: "projets",
    entrees: [
      { cle: "projetsListe", chemin: "/projets", permission: "projects:read" , icone: "i-projects" },
      { cle: "taches", chemin: "/taches", permission: "tasks:read" , icone: "i-tasks" },
      { cle: "evenements", chemin: "/evenements", permission: "events:read" , icone: "i-events" },
    ],
  },
  {
    cle: "rh",
    entrees: [
      { cle: "conges", chemin: "/conges", permission: "leaves:read" , icone: "i-leaves" },
      { cle: "teletravail", chemin: "/teletravail", permission: "telework:read" , icone: "i-telework" },
      { cle: "tempsPasse", chemin: "/temps", permission: "time_tracking:read" , icone: "i-time" },
      { cle: "competences", chemin: "/competences", permission: "skills:read_team" , icone: "i-skills" },
    ],
  },
  {
    cle: "referentiels",
    entrees: [
      { cle: "utilisateurs", chemin: "/utilisateurs", permission: "users:read" , icone: "i-users" },
      { cle: "departements", chemin: "/departements", permission: "departments:read" , icone: "i-depts" },
      { cle: "tiers", chemin: "/tiers", permission: "third_parties:read" , icone: "i-third" },
      { cle: "clients", chemin: "/clients", permission: "clients:read" , icone: "i-clients" },
    ],
  },
  {
    cle: "administration",
    entrees: [
      { cle: "roles", chemin: "/roles", permission: "users:manage_roles" , icone: "i-roles" },
      { cle: "journalAudit", chemin: "/audit", permission: "audit:read" , icone: "i-audit" },
      { cle: "tachesPredefinies", chemin: "/taches-predefinies", permission: "predefined_tasks:update" , icone: "i-predef" },
      { cle: "parametres", chemin: "/parametres", permission: "settings:update" , icone: "i-settings" },
    ],
  },
];

/** Filtre la navigation selon les permissions résolues côté serveur. */
export const navigationVisible = (permissions: ReadonlySet<string>): GroupeNav[] =>
  NAVIGATION.map((g) => ({ ...g, entrees: g.entrees.filter((e) => permissions.has(e.permission)) }))
    .filter((g) => g.entrees.length > 0);
