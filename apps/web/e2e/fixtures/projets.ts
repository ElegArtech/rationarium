import type { Page } from "@playwright/test";

/**
 * Le serveur simulé des vues projet.
 *
 * Même motif que `socle.e2e.spec.ts` : la règle « jamais de simulacre » vise la
 * base de données, dont les contraintes font l'intégrité. Ici l'objet du test
 * est **ce que la vue affiche pour une charge donnée** — le serveur réel est
 * couvert par ses propres tests d'intégration.
 *
 * Les jeux de données sont nommés par l'état qu'ils produisent, pas par leur
 * contenu : `videAucun` et `videFiltre` sont deux états distincts de la même
 * vue, et c'est cette distinction que le test vérifie.
 */

export const SESSION = {
  id: "11111111-1111-4111-8111-111111111111",
  prenom: "Camille",
  nom: "Roussel",
  email: "camille.roussel@exemple.fr",
  login: "camille.roussel",
  avatarFichier: null,
  avatarPredefini: null,
  langue: "fr",
  theme: "auto",
  derniereConnexion: "2026-08-15T08:12:00.000Z",
  /*
   * `EX-AUTH-09` — le profil dit désormais le rattachement organisationnel.
   * Le jeu d'essai avait pris du retard sur le contrat : sans ces trois
   * champs, la coquille tombait et VINGT-SIX contrôles de bout en bout
   * échouaient sur des symptômes qui ne ressemblaient pas à leur cause.
   */
  departement: "Numérique et données",
  services: ["Études et projets"],
  membreDepuis: "2024-03-01T00:00:00.000Z",
  role: { code: "ENCADREMENT", nom: "Encadrement" },
  permissions: [
    "planning:read",
    "projects:read",
    "projects:create",
    "projects:update",
    "projects:archive",
    "projects:delete",
    "projects:manage_members",
    "milestones:read",
    "milestones:create",
    "milestones:update",
    "milestones:delete",
    "epics:read",
    "epics:create",
    "epics:update",
    "epics:delete",
    "tasks:read",
    "users:read",
  ],
  motDePasseAChanger: false,
};

/**
 * `EX-PRJ-13` — la session qui peut LIRE l'historique des instantanés.
 *
 * `reports:read` reste hors de `SESSION` à dessein : `SESSION_TABLEAU` en
 * dérive (`fixtures/tableau.ts`), et son contrôle « sans reports:read, la
 * capture n'est pas proposée » repose sur cette absence. L'ajouter au socle
 * commun faisait tomber ce contrôle-là — une permission de plus dans un jeu
 * d'essai partagé se paie deux fichiers plus loin.
 */
export const SESSION_RAPPORTS = {
  ...SESSION,
  permissions: [...SESSION.permissions, "reports:read"],
};

/** Une session en lecture seule : aucun bouton d'action ne doit apparaître. */
export const SESSION_LECTURE = {
  ...SESSION,
  role: { code: "AGENT", nom: "Agent" },
  permissions: ["projects:read", "milestones:read", "tasks:read", "epics:read"],
};

export const PROJET = {
  id: "22222222-2222-4222-8222-222222222222",
  nom: "Refonte du portail citoyen",
  description: "Reprise complète du portail à destination des administrés.",
  statut: "active",
  priorite: "high",
  dateDebut: "2026-03-01",
  dateFin: "2026-12-31",
  budgetHeures: "1200",
  icone: null,
  archive: false,
  version: 1,
  creeLe: "2026-02-12T09:00:00.000Z",
  chef: { id: "c1", prenom: "Driss", nom: "Amrani" },
  sponsor: { id: "s1", prenom: "Inès", nom: "Rocher" },
  createur: { id: "u1", prenom: "Fatou", nom: "Berthier" },
  progression: 62,
  budget: { alloue: 1200, consomme: 744, restant: 456, depassement: false },
  taches: { total: 34, enCours: 8, bloquees: 2 },
  equipe: { agents: 6, tiers: 2, clients: 1 },
  jalons: 4,
  epopees: 3,
  clients: [{ id: "cl1", nom: "Direction de la relation citoyen" }],
  dernierInstantane: { date: "2026-08-11", progression: 61 },
};

/**
 * `EX-PRJ-13` — l'historique des instantanés, **calqué sur la signature du
 * service**, jamais sur ce que le client croit recevoir.
 *
 * `GET /projets/:id/instantanes` rend les lignes `ProjectSnapshot` telles
 * quelles, du plus récent au plus ancien. `heuresConsommees` est une colonne
 * `Decimal` : une CHAÎNE en JSON, comme `budgetHeures`. La lire comme un
 * nombre marcherait à l'affichage et casserait à la première comparaison —
 * c'est exactement le couple client/fixture que les vues 14 et 27 ont déjà
 * payé deux fois.
 */
export const INSTANTANES = [
  {
    id: "sn3",
    projectId: PROJET.id,
    date: "2026-08-11",
    progression: 61,
    tachesTotal: 34,
    tachesFinies: 19,
    heuresConsommees: "744.00",
  },
  {
    id: "sn2",
    projectId: PROJET.id,
    date: "2026-07-31",
    progression: 48,
    tachesTotal: 31,
    tachesFinies: 12,
    heuresConsommees: "602.50",
  },
  {
    id: "sn1",
    projectId: PROJET.id,
    date: "2026-06-30",
    progression: 22,
    tachesTotal: 24,
    tachesFinies: 5,
    heuresConsommees: "310.00",
  },
];

export const LIGNE_PROJET = {
  id: PROJET.id,
  nom: PROJET.nom,
  description: PROJET.description,
  statut: PROJET.statut,
  priorite: PROJET.priorite,
  dateDebut: PROJET.dateDebut,
  dateFin: PROJET.dateFin,
  budgetHeures: PROJET.budgetHeures,
  icone: null,
  archive: false,
  chef: PROJET.chef,
  progression: 62,
  _count: { taches: 34, membres: 6 },
};

export const ROUTE = {
  jalons: [
    {
      id: "j1",
      nom: "Cadrage et ateliers",
      description: null,
      dateEcheance: "2026-04-30",
      statut: "done",
      version: 1,
      taches: [
        {
          id: "t1",
          titre: "Ateliers usagers",
          statut: "done",
          priorite: "normal",
          avancement: 100,
          dateFin: "2026-04-20",
          estimationHeures: 8,
          assignes: [{ user: { id: "a1", prenom: "Camille", nom: "Roussel" } }],
        },
      ],
    },
    {
      id: "j2",
      nom: "Recette fonctionnelle",
      description: null,
      dateEcheance: "2026-11-28",
      statut: "doing",
      version: 1,
      taches: [
        {
          id: "t2",
          titre: "Jeux d'essai",
          statut: "doing",
          priorite: "high",
          avancement: 45,
          dateFin: "2026-11-10",
          estimationHeures: null,
          // Personne : l'état « sans porteur » existe, et la vue le dit.
          assignes: [],
        },
      ],
    },
    {
      id: "j3",
      nom: "Reste à planifier",
      description: null,
      dateEcheance: null,
      statut: "pending",
      version: 1,
      taches: [],
    },
  ],
  /*
   * `RG-JAL-05` — les tâches détachées d'un jalon supprimé. Le jeu d'essai
   * DOIT porter la forme exacte du serveur : trois défauts de ce projet
   * viennent d'un jeu d'essai qui recopiait une forme inventée par le client,
   * et validait donc l'erreur au lieu de la trouver.
   */
  sansJalon: [
    {
      id: "t9",
      titre: "Reprise des libellés",
      statut: "todo",
      priorite: "normal",
      avancement: 0,
      dateFin: null,
      estimationHeures: 4,
      assignes: [{ user: { id: "a2", prenom: "Driss", nom: "Amrani" } }],
    },
  ],
  indicateurs: { total: 3, termines: 1, enCours: 1, taches: 3, sansJalon: 1 },
};

export const EQUIPE = {
  agents: [
    {
      userId: "a1",
      roleProjet: "chefDeProjet",
      tauxAllocation: 60,
      utilisateur: {
        id: "a1",
        prenom: "Driss",
        nom: "Amrani",
        email: "driss.amrani@exemple.fr",
        departement: { nom: "Direction des services numériques" },
      },
    },
  ],
  tiers: [{ id: "x1", type: "organisation", organisation: "Presta SA", contactNom: null }],
  clients: [{ id: "cl1", nom: "Direction de la relation citoyen", contactNom: null }],
  allocationCumulee: 60,
};

type Reponses = Record<string, { statut?: number; corps: unknown }>;

/**
 * Installe une session et un jeu de réponses.
 *
 * ────────────────────────────────────────────────────────────────────────
 * PIÈGE, RENCONTRÉ ICI. Un motif `**\/api/**` intercepte AUSSI les modules
 * servis par Vite en développement : `/src/api/client.ts`,
 * `/src/api/projets.ts`. Le navigateur reçoit du JSON là où il attend un
 * module, et l'application ne démarre pas — page blanche, sans erreur
 * parlante. L'interception se fait donc sur un **prédicat** ancré à la
 * racine, jamais sur un glob qui « contient » le mot api.
 * ────────────────────────────────────────────────────────────────────────
 *
 * Les motifs de réponse sont testés du plus long au plus court : sans cela,
 * `/api/projets` intercepterait `/api/projets/<id>/equipe`.
 */
export async function serveur(
  page: Page,
  options: { session?: unknown; reponses?: Reponses } = {},
) {
  const session = options.session ?? SESSION;
  const reponses = options.reponses ?? {};
  const motifs = Object.keys(reponses).sort((a, b) => b.length - a.length);

  await page.route(
    (url) => url.pathname.startsWith("/api/"),
    (route) => {
      const chemin = new URL(route.request().url()).pathname;

      if (chemin === "/api/auth/me") {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(session),
        });
      }

      // Correspondance exacte d'abord, suffixe ensuite. Un « contient »
      // ferait répondre la fiche projet à la requête de sa feuille de route,
      // dont le chemin commence par le sien.
      //
      // Un motif qui porte une chaîne de requête est comparé au chemin ET à
      // sa requête : c'est ce qui permet de distinguer deux réponses d'un même
      // point d'entrée — `?inclureInactives=true` n'est pas la même demande
      // que la demande nue. Sans cela, un filtre serveur ne se teste pas.
      const complet = chemin + new URL(route.request().url()).search;
      const trouve =
        motifs.find((m) => complet === m) ??
        motifs.find((m) => chemin === m) ??
        motifs.find((m) => chemin.endsWith(m));
      if (!trouve) return route.fulfill({ status: 404, body: "{}" });
      const r = reponses[trouve]!;
      return route.fulfill({
        status: r.statut ?? 200,
        contentType: "application/json",
        body: JSON.stringify(r.corps),
      });
    },
  );
}

/**
 * `EX-JAL-07` — les épopées d'un projet.
 *
 * Deux, dont une vide : le décompte par épopée est un champ qu'on lit sans
 * jamais le contredire, et deux valeurs différentes sont ce qui prouve qu'il
 * porte bien SON compte et non celui du projet.
 */
export const EPOPEES = [
  { id: "e1", nom: "Socle technique", description: "Les fondations", taches: 2, version: 1 },
  { id: "e2", nom: "Reprise de données", description: null, taches: 0, version: 3 },
];
