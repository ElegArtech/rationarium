import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

/**
 * Accessibilité de l'**application**, par opposition aux maquettes gelées.
 *
 * Le contrôle voisin établit ce que la référence garantit ; celui-ci vérifie
 * que le portage ne l'a pas perdu. Les deux sont nécessaires : une maquette
 * accessible portée en composants inaccessibles passerait le premier sans
 * broncher.
 *
 * **Aucun cliquet ici.** La tolérance de `maquettes.a11y.spec.ts` existe parce
 * qu'on ne modifie pas la référence gelée ; le code, lui, se corrige. Une
 * violation grave sur une vue portée est un échec, pas un avertissement
 * (`.claude/rules/tests.md`).
 *
 * Chaque vue est passée dans **les deux thèmes** : le contraste change avec le
 * thème, et un seul des deux ne prouve rien.
 */

import { PROJET, LIGNE_PROJET, ROUTE, EQUIPE, serveur, SESSION } from "./fixtures/projets.js";
import { LISTE, FICHE } from "./fixtures/taches.js";
import {
  EVENEMENTS,
  TYPES_CONGE,
  SOLDES,
  DEMANDES,
  DELEGATIONS,
  PLANNING_TELETRAVAIL,
  REGLES_TELETRAVAIL,
  SAISIES,
} from "./fixtures/occupations.js";
import {
  MATRICE,
  REFERENTIEL,
  LISTE_TIERS,
  FICHE_TIERS,
  CLIENTS,
  FICHE_CLIENT,
} from "./fixtures/referentiels.js";
import { UTILISATEURS, SUIVI, ARBORESCENCE } from "./fixtures/administration.js";
import {
  REGLAGES,
  FERIES,
  VACANCES,
  ROLES,
  MATRICE_PERSONNALISE,
  AUDIT,
  FACETTES_AUDIT,
  PREDEFINIES,
} from "./fixtures/parametrage.js";
import { SEMAINE, GRILLE_ACTIVITE, ELIGIBILITE as ELIGIBILITE_A11Y } from "./fixtures/planning.js";
import { TABLEAU } from "./fixtures/tableau.js";

/** M18 — la cloche est présente sur toutes les vues de la coquille. */
const NOTIFICATIONS_A11Y = {
  entrees: [
    {
      id: "n1", type: "conge_a_valider", titre: "Demande de congé à valider",
      contenu: "Une demande attend votre décision.", lien: "/conges",
      lue: false, creeLe: "2026-08-11T08:30:00.000Z",
    },
  ],
  nonLues: 1,
};
import {
  VUE_ENSEMBLE,
  GANTT,
  PROJET_GANTT,
  TACHES_GANTT,
  ROUTE_GANTT,
} from "./fixtures/rapports.js";

/** Une session dotée des droits d'écriture : les vues doivent rester conformes
 *  avec leurs actions affichées, pas seulement en lecture seule. */
const SESSION_COMPLETE = {
  ...SESSION,
  permissions: [
    ...SESSION.permissions,
    "tasks:create",
    "tasks:update",
    "tasks:delete",
    "tasks:manage_dependencies",
    "tasks:manage_raci",
    "comments:create",
    "leaves:read",
    "leaves:create",
    "leaves:approve",
    "leaves:readAll",
    "leaves:manage_types",
    "leaves:manage_delegations",
    "leaves:request_cancellation",
    "telework:read",
    "telework:create",
    "telework:manage_rules",
    "time_tracking:read",
    "time_tracking:create",
    "time_tracking:delete",
    "events:read",
    "events:create",
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
    "users:read",
    "users:create",
    "users:deactivate",
    "users:delete_permanently",
    "users:read_individual_tracking",
    "departments:read",
    "departments:delete",
    "directions:read",
    "directions:delete",
    "services:read",
    "settings:read",
    "settings:update",
    "holidays:read",
    "holidays:import",
    "school_vacations:read",
    "users:manage_roles",
    "audit:read",
    "predefined_tasks:read",
    "users:import",
    "tasks:import",
    "predefined_tasks:assign",
    "predefined_tasks:update",
    "planning:export_ics",
    "telework:create",
    "reports:read",
    "reports:export",
    "milestones:read",
  ],
};

/**
 * Les vues portées à ce jour, et l'état de session qu'elles supposent.
 *
 * `apres` amène la vue dans un état qu'une simple adresse n'atteint pas —
 * un onglet, un panneau dépliant. Sans lui, les grilles les plus denses du
 * produit, qui sont justement les plus exposées, ne seraient jamais mesurées.
 */
const VUES: {
  nom: string;
  chemin: string;
  session: "valide" | "absente";
  apres?: (page: Page) => Promise<void>;
}[] = [
  { nom: "01 — connexion", chemin: "/connexion", session: "absente" },
  { nom: "02 — inscription", chemin: "/inscription", session: "absente" },
  { nom: "03 — mot de passe oublié", chemin: "/mot-de-passe-oublie", session: "absente" },
  { nom: "04 — réinitialisation", chemin: "/reinitialisation?jeton=exemple", session: "absente" },
  { nom: "35 — mon profil, dans la coquille", chemin: "/profil", session: "valide" },
  { nom: "10 — portefeuille de projets", chemin: "/projets", session: "valide" },
  { nom: "11 — fiche projet", chemin: `/projets/${PROJET.id}`, session: "valide" },
  { nom: "13 — jalons", chemin: `/projets/${PROJET.id}/jalons`, session: "valide" },
  { nom: "14 — équipe", chemin: `/projets/${PROJET.id}/equipe`, session: "valide" },
  { nom: "12 — kanban du projet", chemin: `/projets/${PROJET.id}/taches`, session: "valide" },
  { nom: "16 — tâches, vue globale", chemin: "/taches", session: "valide" },
  { nom: "17 — fiche tâche", chemin: `/taches/${FICHE.id}`, session: "valide" },
  { nom: "18 — événements", chemin: "/evenements", session: "valide" },
  { nom: "19 — congés", chemin: "/conges", session: "valide" },
  { nom: "20 — télétravail", chemin: "/teletravail", session: "valide" },
  { nom: "21 — temps passé", chemin: "/temps", session: "valide" },
  { nom: "22 — compétences (matrice)", chemin: "/competences", session: "valide" },
  { nom: "23 — tiers", chemin: "/tiers", session: "valide" },
  { nom: "24 — fiche tiers", chemin: `/tiers/${FICHE_TIERS.id}`, session: "valide" },
  { nom: "25 — clients", chemin: "/clients", session: "valide" },
  { nom: "26 — fiche client", chemin: `/clients/${FICHE_CLIENT.id}`, session: "valide" },
  { nom: "27 — utilisateurs", chemin: "/utilisateurs", session: "valide" },
  {
    nom: "M21 — fenêtre d'import CSV",
    chemin: "/utilisateurs",
    session: "valide",
    apres: (page) => page.getByRole("button", { name: "Importer CSV" }).click(),
  },
  { nom: "28 — suivi individuel", chemin: "/utilisateurs/u-autre/suivi", session: "valide" },
  { nom: "29 — départements et services", chemin: "/departements", session: "valide" },
  { nom: "06 — tableau de bord", chemin: "/", session: "valide" },
  {
    nom: "M18 — panneau de notifications ouvert",
    chemin: "/profil",
    session: "valide",
    apres: (page) => page.getByRole("button", { name: /notification/ }).click(),
  },
  { nom: "30 — rapports, vue d'ensemble", chemin: "/rapports", session: "valide" },
  {
    nom: "30 — rapports, analytics avancés",
    chemin: "/rapports",
    session: "valide",
    apres: (page) => page.getByRole("tab", { name: "Analytics avancés" }).click(),
  },
  {
    nom: "30 — Gantt portefeuille",
    chemin: "/rapports",
    session: "valide",
    apres: (page) => page.getByRole("tab", { name: "Gantt Portfolio" }).click(),
  },
  { nom: "15 — projet, Gantt", chemin: `/projets/${PROJET_GANTT.id}/gantt`, session: "valide" },
  {
    nom: "06 — tableau de bord, onglet non déclarées",
    chemin: "/",
    session: "valide",
    apres: (page) => page.getByRole("tab", { name: "Non déclarées" }).click(),
  },
  { nom: "07 — planning, semaine", chemin: "/planning", session: "valide" },
  { nom: "08 — planning, mois", chemin: "/planning/mois", session: "valide" },
  { nom: "09 — planning, activité", chemin: "/planning/activite", session: "valide" },
  {
    nom: "09 — fenêtre d'ajout d'agents",
    chemin: "/planning/activite",
    session: "valide",
    // La fenêtre porte le piège d'accessibilité de la vue : une liste de
    // cases dont certaines sont désactivées avec leur raison.
    apres: (page) =>
      page.getByRole("button", { name: /Ajouter des agents à/ }).first().click(),
  },
  { nom: "31 — paramètres", chemin: "/parametres", session: "valide" },
  {
    nom: "31 — paramètres, onglet jours fériés",
    chemin: "/parametres",
    session: "valide",
    apres: (page) => page.getByRole("link", { name: "Jours fériés" }).click(),
  },
  { nom: "32 — rôles et permissions", chemin: "/roles", session: "valide" },
  {
    nom: "32 — matrice des permissions dépliée",
    chemin: "/roles",
    session: "valide",
    // La grille la plus dense du produit : 26 modules × 30 actions.
    apres: (page) => page.getByRole("button", { name: "Ouvrir la matrice" }).nth(1).click(),
  },
  { nom: "33 — journal d'audit", chemin: "/audit", session: "valide" },
  { nom: "34 — tâches prédéfinies", chemin: "/taches-predefinies", session: "valide" },
  { nom: "adresse inconnue", chemin: "/adresse-inexistante", session: "valide" },
];

async function preparer(page: Page, session: "valide" | "absente", theme: "clair" | "sombre") {
  if (session === "valide") {
    await serveur(page, {
      session: SESSION_COMPLETE,
      reponses: {
        "/api/projets": { corps: { projets: [LIGNE_PROJET], affiches: 1, total: 1 } },
        [`/api/projets/${PROJET.id}`]: { corps: PROJET },
        "/feuille-de-route": { corps: ROUTE },
        "/equipe": { corps: EQUIPE },
        "/api/taches": { corps: LISTE },
        [`/api/taches/${FICHE.id}`]: { corps: FICHE },
        "/utilisateurs": { corps: { utilisateurs: [] } },
        "/api/evenements": { corps: EVENEMENTS },
        "/api/conges/soldes": { corps: SOLDES },
        "/api/conges/types": { corps: TYPES_CONGE },
        "/api/conges/delegations": { corps: DELEGATIONS },
        "/api/conges": { corps: DEMANDES },
        "/api/teletravail/regles": { corps: REGLES_TELETRAVAIL },
        "/api/teletravail": { corps: PLANNING_TELETRAVAIL },
        "/api/temps": { corps: SAISIES },
        "/api/competences/matrice": { corps: MATRICE },
        "/api/competences": { corps: REFERENTIEL },
        "/api/tiers": { corps: LISTE_TIERS },
        [`/api/tiers/${FICHE_TIERS.id}`]: { corps: FICHE_TIERS },
        "/api/clients": { corps: CLIENTS },
        [`/api/clients/${FICHE_CLIENT.id}`]: { corps: FICHE_CLIENT },
        "/api/utilisateurs": { corps: UTILISATEURS },
        "/suivi": { corps: SUIVI },
        "/api/organisation": { corps: ARBORESCENCE },
        "/api/parametrage": { corps: REGLAGES },
        "/api/parametrage/feries": { corps: FERIES },
        "/api/parametrage/vacances": { corps: VACANCES },
        "/api/administration/roles": { corps: ROLES },
        "/api/administration/roles/r-agent/matrice": { corps: MATRICE_PERSONNALISE },
        "/api/administration/audit": { corps: AUDIT },
        "/api/administration/audit/facettes": { corps: FACETTES_AUDIT },
        "/api/activite/taches": { corps: PREDEFINIES },
        "/api/planning": { corps: SEMAINE },
        "/api/tableau-de-bord": { corps: TABLEAU },
        "/api/rapports": { corps: VUE_ENSEMBLE },
        "/api/notifications": { corps: NOTIFICATIONS_A11Y },
        "/api/rapports/gantt": { corps: GANTT },
        [`/api/projets/${PROJET_GANTT.id}`]: { corps: PROJET_GANTT },
        [`/api/projets/${PROJET_GANTT.id}/feuille-de-route`]: { corps: ROUTE_GANTT },
        // Le motif porte sa chaîne de requête : la vue 15 demande les tâches
        // d'un projet, pas la liste globale servie plus haut.
        [`/api/taches?projectId=${PROJET_GANTT.id}`]: { corps: TACHES_GANTT },
        "/api/planning/activite": { corps: GRILLE_ACTIVITE },
        "/api/activite/eligibilite": { corps: ELIGIBILITE_A11Y },
      },
    });
  } else {
    await page.route(
      (url) => url.pathname.startsWith("/api/"),
      (route) =>
        route.fulfill({
          status: 401,
          contentType: "application/json",
          body: JSON.stringify({ cle: "auth:erreurs.sessionRequise", message: "Session requise" }),
        }),
    );
  }
  // Le thème est mémorisé avant le premier rendu : l'appliquer après ferait
  // mesurer axe sur la palette claire pendant un instant.
  await page.addInitScript((t: string) => {
    window.localStorage.setItem("trame.theme", t);
  }, theme === "sombre" ? "sombre" : "clair");
}

for (const vue of VUES) {
  for (const theme of ["clair", "sombre"] as const) {
    test(`${vue.nom} — thème ${theme}`, async ({ page }) => {
      await preparer(page, vue.session, theme);
      await page.goto(vue.chemin);
      await page.waitForLoadState("networkidle");
      if (vue.apres) {
        await vue.apres(page);
        await page.waitForLoadState("networkidle");
      }

      const resultat = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
        .analyze();

      const graves = resultat.violations.filter(
        (v) => v.impact === "critical" || v.impact === "serious",
      );

      if (graves.length) {
        console.log(
          `\n${vue.nom} (${theme}) — ${graves.length} violation(s) :\n` +
            graves
              .map(
                (v) =>
                  `  · [${v.impact}] ${v.id} — ${v.help}\n` +
                  v.nodes
                    .slice(0, 3)
                    .map((n) => `      ${n.target.join(" ")}`)
                    .join("\n"),
              )
              .join("\n"),
        );
      }
      expect(graves.map((v) => v.id)).toEqual([]);
    });
  }
}
