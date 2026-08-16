import { test, expect, type Page } from "@playwright/test";
import { serveur, SESSION_LECTURE } from "./fixtures/projets.js";
import {
  SESSION_RAPPORTS,
  SESSION_SANS_EXPORT,
  VUE_ENSEMBLE,
  VUE_ENSEMBLE_JEUNE,
  VUE_ENSEMBLE_STAGNANTE,
  VUE_ENSEMBLE_VIDE,
  GANTT,
  GANTT_VIDE,
  PROJET_GANTT,
  TACHES_GANTT,
  TACHES_SANS_DATES,
  ROUTE_GANTT,
  FICHE_T2,
} from "./fixtures/rapports.js";

/**
 * L-22 — vues 15 et 30.
 *
 * Le brief tient en une phrase : **Inès doit comprendre en trente secondes**.
 * Les contrôles portent donc moins sur la présence des chiffres que sur les
 * **conclusions** qui les accompagnent — troncage annoncé, surcharge nommée,
 * stagnation détectée, ratio interprété, historique jugé suffisant ou non.
 */

const MOMENT = new Date("2026-08-11T09:00:00.000Z");

async function horlogeFixe(page: Page) {
  await page.clock.setFixedTime(MOMENT);
}

const reponses = {
  "/api/rapports": { corps: VUE_ENSEMBLE },
  "/api/rapports/gantt": { corps: GANTT },
};

// ── Vue 30 ──────────────────────────────────────────────────────────────────

test.describe("Vue 30 — rapports et analytics", () => {
  test("EX-RPT-12 — L'ALERTE EST EN TÊTE, et elle dit où agir", async ({ page }) => {
    await horlogeFixe(page);
    await serveur(page, { session: SESSION_RAPPORTS, reponses });
    await page.goto("/rapports");

    await expect(
      page.getByRole("heading", { name: "Rapports & Analytics", level: 1 }),
    ).toBeVisible();
    // Un compteur sans suite laisse chercher où agir.
    await expect(page.getByText("Attention requise")).toBeVisible();
    await expect(page.getByText(/7 tâches en retard nécessitent votre attention/)).toBeVisible();
  });

  test("aucune alerte quand rien n'est en retard : le bandeau disparaît", async ({ page }) => {
    await horlogeFixe(page);
    await serveur(page, {
      session: SESSION_RAPPORTS,
      reponses: { ...reponses, "/api/rapports": { corps: VUE_ENSEMBLE_JEUNE } },
    });
    await page.goto("/rapports");

    await expect(page.getByText("Attention requise")).toHaveCount(0);
  });

  test("EX-RPT-06 — la santé est lisible, et le détail l'accompagne", async ({ page }) => {
    await horlogeFixe(page);
    await serveur(page, { session: SESSION_RAPPORTS, reponses });
    await page.goto("/rapports");

    await expect(page.getByText("Portail citoyen").first()).toBeVisible();
    await expect(page.getByText("Critique").first()).toBeVisible();
    await expect(page.getByText(/3 tâches restantes/)).toBeVisible();
    await expect(page.getByText(/4 en retard/)).toBeVisible();
    // « Non assigné » plutôt qu'une case vide, qui se prend pour un défaut.
    await expect(page.getByText("Non assigné")).toBeVisible();
  });

  test("RG-RPT-02 — LE TRONCAGE EST ANNONCÉ, jamais silencieux", async ({ page }) => {
    await horlogeFixe(page);
    await serveur(page, { session: SESSION_RAPPORTS, reponses });
    await page.goto("/rapports");

    // Une liste coupée en silence fait conclure qu'il n'y a que dix projets.
    await expect(
      page.getByText(/Affichage limité aux 10 premiers projets pour lisibilité — 12 au total/),
    ).toBeVisible();
  });

  test("RG-RPT-05 — la surcharge est nommée, ET la moyenne est montrée", async ({ page }) => {
    await horlogeFixe(page);
    await serveur(page, { session: SESSION_RAPPORTS, reponses });
    await page.goto("/rapports");
    await page.getByRole("navigation", { name: /Sections des rapports|Report sections/ }).getByRole("button", { name: "Analytics avancés" }).click();

    // Dix tâches ne veulent rien dire sans la moyenne à côté.
    await expect(page.getByText("Surcharge", { exact: true }).first()).toBeVisible();
    await expect(page.getByText(/Moyenne : 5 tâches actives/)).toBeVisible();
    await expect(
      page.getByRole("progressbar", { name: /Ana Berger : 9 tâches — surcharge/ }),
    ).toBeVisible();
  });

  test("RG-RPT-03 — UN HISTORIQUE COURT LE DIT plutôt que de tracer une courbe", async ({
    page,
  }) => {
    await horlogeFixe(page);
    await serveur(page, {
      session: SESSION_RAPPORTS,
      reponses: { ...reponses, "/api/rapports": { corps: VUE_ENSEMBLE_JEUNE } },
    });
    await page.goto("/rapports");
    await page.getByRole("navigation", { name: /Sections des rapports|Report sections/ }).getByRole("button", { name: "Analytics avancés" }).click();

    await expect(page.getByText("Historique en cours de construction")).toBeVisible();
    // Une courbe lissée sur un point aurait l'air d'une mesure.
    await expect(page.getByRole("img", { name: /Progression de/ })).toHaveCount(0);
  });

  test("la courbe existe quand l'historique suffit, et se résume en mots", async ({ page }) => {
    await horlogeFixe(page);
    await serveur(page, { session: SESSION_RAPPORTS, reponses });
    await page.goto("/rapports");
    await page.getByRole("navigation", { name: /Sections des rapports|Report sections/ }).getByRole("button", { name: "Analytics avancés" }).click();

    // Un tracé n'est pas lisible autrement.
    await expect(
      page.getByRole("img", { name: "Progression de 30 % à 55 % sur 4 relevés" }),
    ).toBeVisible();
  });

  test("RG-RPT-04 — la stagnation est DÉTECTÉE, pas laissée à l'œil", async ({ page }) => {
    await horlogeFixe(page);
    await serveur(page, {
      session: SESSION_RAPPORTS,
      reponses: { ...reponses, "/api/rapports": { corps: VUE_ENSEMBLE_STAGNANTE } },
    });
    await page.goto("/rapports");
    await page.getByRole("navigation", { name: /Sections des rapports|Report sections/ }).getByRole("button", { name: "Analytics avancés" }).click();

    await expect(page.getByText("Stagnation détectée")).toBeVisible();
  });

  test("EX-RPT-08 — les jalons se répartissent en trois états nommés", async ({ page }) => {
    await horlogeFixe(page);
    await serveur(page, { session: SESSION_RAPPORTS, reponses });
    await page.goto("/rapports");
    await expect(page.getByText(/jalons atteints à temps sur 5 échus/)).toBeVisible();
    await expect(page.getByText("À temps", { exact: true })).toBeVisible();
    await expect(page.getByText("En retard", { exact: true })).toBeVisible();
    await expect(page.getByText("À venir", { exact: true })).toBeVisible();
  });

  test("EX-RPT-10 — LE RATIO EST INTERPRÉTÉ, pas laissé nu", async ({ page }) => {
    await horlogeFixe(page);
    await serveur(page, { session: SESSION_RAPPORTS, reponses });
    await page.goto("/rapports");
    await page.getByRole("navigation", { name: /Sections des rapports|Report sections/ }).getByRole("button", { name: "Analytics avancés" }).click();

    // « 0,4 » ne dit rien à qui ne le manipule pas tous les jours.
    await expect(page.getByText("0,4")).toBeVisible();
    await expect(
      page.getByText("Le backlog grossit : il se crée plus de tâches qu'il ne s'en termine."),
    ).toBeVisible();
  });

  test("un ratio qui n'existe pas ne s'invente pas en « stable »", async ({ page }) => {
    await horlogeFixe(page);
    await serveur(page, {
      session: SESSION_RAPPORTS,
      reponses: { ...reponses, "/api/rapports": { corps: VUE_ENSEMBLE_JEUNE } },
    });
    await page.goto("/rapports");
    await page.getByRole("navigation", { name: /Sections des rapports|Report sections/ }).getByRole("button", { name: "Analytics avancés" }).click();

    await expect(page.getByText("Aucune complétion sur la période")).toBeVisible();
    await expect(page.getByText(/Le backlog/)).toHaveCount(0);
  });

  test("RG-RPT-06 — CHAQUE GRAPHIQUE A SON ÉTAT VIDE RÉDIGÉ", async ({ page }) => {
    await horlogeFixe(page);
    await serveur(page, {
      session: SESSION_RAPPORTS,
      reponses: { ...reponses, "/api/rapports": { corps: VUE_ENSEMBLE_VIDE } },
    });
    await page.goto("/rapports");

    // Une zone blanche se signale au support au lieu d'être comprise.
    await expect(page.getByText("Aucun projet à afficher").first()).toBeVisible();
    await expect(page.getByText("Aucun jalon défini")).toBeVisible();

    await page.getByRole("navigation", { name: /Sections des rapports|Report sections/ }).getByRole("button", { name: "Analytics avancés" }).click();
    await expect(page.getByText("Aucune tâche active à afficher").first()).toBeVisible();
  });

  test("EX-RPT-01 — la période se choisit, et la requête suit", async ({ page }) => {
    await horlogeFixe(page);
    await serveur(page, { session: SESSION_RAPPORTS, reponses });
    await page.goto("/rapports");

    const demandes: string[] = [];
    page.on("request", (r) => {
      if (r.url().includes("/api/rapports")) demandes.push(r.url());
    });

    await page.getByRole("button", { name: "90 jours" }).click();
    await expect
      .poll(() => demandes.some((u) => u.includes("periode=trimestre")))
      .toBe(true);
  });

  test("EX-RPT-03 — les trois formats d'export sont proposés, et nommés honnêtement", async ({
    page,
  }) => {
    await horlogeFixe(page);
    await serveur(page, { session: SESSION_RAPPORTS, reponses });
    await page.goto("/rapports");

    await page.getByRole("button", { name: "Exporter" }).click();
    // « CSV (tableur) » plutôt qu'« Excel » : le produit ne rend pas un
    // classeur, et l'annoncer autrement serait un mensonge d'étiquette.
    await expect(page.getByRole("menuitem", { name: "CSV (tableur)" })).toBeVisible();
    await expect(page.getByRole("menuitem", { name: "JSON" })).toBeVisible();
    await expect(page.getByRole("menuitem", { name: "PDF (impression)" })).toBeVisible();
  });

  test("RG-GEN-06 — sans reports:export, le menu n'est pas proposé", async ({ page }) => {
    await horlogeFixe(page);
    await serveur(page, { session: SESSION_SANS_EXPORT, reponses });
    await page.goto("/rapports");

    await expect(page.getByRole("button", { name: "Exporter" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Actualiser" })).toBeVisible();
  });

  test("sans reports:read, l'accès est refusé", async ({ page }) => {
    await horlogeFixe(page);
    await serveur(page, { session: SESSION_LECTURE, reponses });
    await page.goto("/rapports");
    await expect(page.getByText("Permission requise")).toBeVisible();
  });
});

// ── Vue 30, onglet Gantt ────────────────────────────────────────────────────

test.describe("Vue 30 — Gantt portefeuille", () => {
  test("EX-RPT-11 — LES CINQ ÉTATS RAG sont distingués et légendés", async ({ page }) => {
    await horlogeFixe(page);
    await serveur(page, { session: SESSION_RAPPORTS, reponses });
    await page.goto("/rapports");
    await page.getByRole("navigation", { name: /Sections des rapports|Report sections/ }).getByRole("button", { name: "Gantt portefeuille" }).click();

    for (const etat of ["On track", "À risque", "En retard", "À venir", "Terminé"]) {
      await expect(page.getByText(etat, { exact: true }).first()).toBeVisible();
    }
  });

  test("chaque barre porte SON RÉSUMÉ COMPLET — le survol n'existe pas au clavier", async ({
    page,
  }) => {
    await horlogeFixe(page);
    await serveur(page, { session: SESSION_RAPPORTS, reponses });
    await page.goto("/rapports");
    await page.getByRole("navigation", { name: /Sections des rapports|Report sections/ }).getByRole("button", { name: "Gantt portefeuille" }).click();

    await expect(
      page.getByRole("img", {
        name: /Sur les rails — 40 % · du 01\/06\/2026 au 31\/12\/2026 · chef : Driss Amrani/,
      }),
    ).toBeVisible();
    // Une valeur absente se nomme, elle ne se laisse pas vide.
    await expect(
      page.getByRole("img", { name: /Sous tension.*chef : Non assigné/ }),
    ).toBeVisible();
  });

  test("les neuf tris du brief sont proposés", async ({ page }) => {
    await horlogeFixe(page);
    await serveur(page, { session: SESSION_RAPPORTS, reponses });
    await page.goto("/rapports");
    await page.getByRole("navigation", { name: /Sections des rapports|Report sections/ }).getByRole("button", { name: "Gantt portefeuille" }).click();

    const tri = page.getByLabel("Trier");
    await expect(tri.locator("option")).toHaveCount(9);
    await tri.selectOption("nom");
    // Le tri réordonne la colonne de gauche sans recharger.
    await expect(page.getByText("Échéance passée")).toBeVisible();
  });

  test("l'état vide du Gantt est celui du brief", async ({ page }) => {
    await horlogeFixe(page);
    await serveur(page, {
      session: SESSION_RAPPORTS,
      reponses: { ...reponses, "/api/rapports/gantt": { corps: GANTT_VIDE } },
    });
    await page.goto("/rapports");
    await page.getByRole("navigation", { name: /Sections des rapports|Report sections/ }).getByRole("button", { name: "Gantt portefeuille" }).click();

    await expect(page.getByText("Aucun projet actif à afficher")).toBeVisible();
  });
});

// ── Vue 15 ──────────────────────────────────────────────────────────────────

test.describe("Vue 15 — projet, onglet Gantt", () => {
  const reponsesProjet = {
    "/api/projets/p1": { corps: PROJET_GANTT },
    "/api/projets/p1/feuille-de-route": { corps: ROUTE_GANTT },
    "/api/taches": { corps: TACHES_GANTT },
    "/api/taches/t2": { corps: FICHE_T2 },
  };

  test("les tâches se rangent par jalon, et celles qui n'en ont pas sont NOMMÉES", async ({
    page,
  }) => {
    await horlogeFixe(page);
    await serveur(page, { session: SESSION_RAPPORTS, reponses: reponsesProjet });
    await page.goto("/projets/p1/gantt");

    await expect(page.getByText("Lancement")).toBeVisible();
    // Une tâche sans jalon ne flotte pas en tête sans explication.
    await expect(page.getByText("Sans jalon")).toBeVisible();
    await expect(page.getByText("Veille").first()).toBeVisible();
  });

  test("chaque barre porte son résumé : statut, dates, avancement", async ({ page }) => {
    await horlogeFixe(page);
    await serveur(page, { session: SESSION_RAPPORTS, reponses: reponsesProjet });
    await page.goto("/projets/p1/gantt");

    await expect(
      page.getByRole("button", {
        name: /Développement — En cours, du 01\/07\/2026 au 30\/09\/2026, 45 %/,
      }),
    ).toBeVisible();
  });

  test("l'indice du brief est là, mot pour mot", async ({ page }) => {
    await horlogeFixe(page);
    await serveur(page, { session: SESSION_RAPPORTS, reponses: reponsesProjet });
    await page.goto("/projets/p1/gantt");

    await expect(
      page.getByText(
        "Cliquez sur une tâche pour voir ses dépendances, double-cliquez pour les modifier.",
      ),
    ).toBeVisible();
  });

  test("LES DÉPENDANCES NE SE CHARGENT QU'À LA SÉLECTION", async ({ page }) => {
    await horlogeFixe(page);
    await serveur(page, { session: SESSION_RAPPORTS, reponses: reponsesProjet });

    const appels: string[] = [];
    page.on("request", (r) => {
      if (r.url().includes("/api/taches/t2")) appels.push(r.url());
    });

    await page.goto("/projets/p1/gantt");
    await expect(page.getByText("Lancement")).toBeVisible();
    // Rien tant qu'on n'a rien choisi : le graphe entier n'est pas rapporté
    // pour n'en dessiner qu'une branche.
    expect(appels).toHaveLength(0);

    await page.getByRole("button", { name: /Développement — En cours/ }).click();
    await expect.poll(() => appels.length).toBeGreaterThan(0);
  });

  test("l'échelle se change, et le choix est annoncé", async ({ page }) => {
    await horlogeFixe(page);
    await serveur(page, { session: SESSION_RAPPORTS, reponses: reponsesProjet });
    await page.goto("/projets/p1/gantt");

    const jour = page.getByRole("button", { name: "Jour", exact: true });
    await jour.click();
    await expect(jour).toHaveAttribute("aria-pressed", "true");
  });

  test("aucune tâche datée : l'état vide est celui du brief", async ({ page }) => {
    await horlogeFixe(page);
    await serveur(page, {
      session: SESSION_RAPPORTS,
      reponses: { ...reponsesProjet, "/api/taches": { corps: TACHES_SANS_DATES } },
    });
    await page.goto("/projets/p1/gantt");

    await expect(page.getByText("Aucune tâche avec des dates")).toBeVisible();
    await expect(
      page.getByText(
        "Ajoutez des dates de début et de fin aux tâches pour les voir dans le Gantt.",
      ),
    ).toBeVisible();
  });

  test("l'onglet Gantt de la fiche projet y mène", async ({ page }) => {
    await horlogeFixe(page);
    await serveur(page, { session: SESSION_RAPPORTS, reponses: reponsesProjet });
    await page.goto("/projets/p1/gantt");

    await expect(page.getByRole("link", { name: /Gantt/ })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });
});
