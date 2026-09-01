import { test, expect } from "@playwright/test";
import { serveur } from "./fixtures/projets.js";
import { CAMILLE, EVENEMENTS } from "./fixtures/occupations.js";

/**
 * **L'horloge est figée.** Les jeux d'essai de ce fichier portent des dates en
 * dur d'août 2026, et les vues construisent leurs grilles, leurs retards et
 * leurs décomptes à partir d'« aujourd'hui ».
 *
 * Le piège est consigné — « un test vert le lundi tombe le mardi » — et il
 * s'est réveillé le 1er septembre 2026 sur `occupations.e2e.spec.ts` : trois
 * contrôles verts la veille cherchaient des cases d'août dans une grille de
 * septembre. Neuf suites figeaient déjà leur horloge ; les autres ne tenaient
 * que par la coïncidence du mois en cours.
 *
 * Le 11 août 2026 est un mardi, au milieu de la fenêtre des jeux d'essai.
 */
const MOMENT_FIGE = new Date("2026-08-11T09:00:00.000Z");

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(MOMENT_FIGE);
});


/**
 * `EX-EVT-08` — « Ajouter et retirer des participants. »
 *
 * **Ce que ces contrôles réparent.** Les deux routes existaient, gardées par
 * `events:update`, bornées au périmètre et testées — et aucun écran ne les
 * appelait. Le tiroir de la vue 18 n'affichait qu'un COMPTE de participants :
 * on pouvait composer la liste à la création, jamais la corriger. Une réunion
 * dont un participant change est pourtant le cas courant.
 *
 * Fichier séparé de `occupations.e2e.spec.ts` : la vue 18 y est déjà couverte
 * sur ses autres axes, et ce lot vit à côté plutôt que de se mêler à un
 * fichier édité en parallèle.
 */

const PROJETS_VIDES = { "/api/projets": { corps: { projets: [], affiches: 0, total: 0 } } };

/** Camille lit les événements ; elle ne les modifie pas. */
const REDACTEUR = { ...CAMILLE, permissions: [...CAMILLE.permissions, "events:update"] };

const ANNUAIRE = [
  { id: "a1", prenom: "Driss", nom: "Amrani" },
  { id: "a2", prenom: "Inès", nom: "Rocher" },
  { id: "a3", prenom: "Sofia", nom: "Lenoir" },
];

const reponses = {
  ...PROJETS_VIDES,
  "/api/evenements": { corps: EVENEMENTS },
  "/api/utilisateurs": { corps: ANNUAIRE },
};

/** Ouvre le tiroir sur le premier événement, qui porte deux participants. */
async function ouvrirLeDetail(page: import("@playwright/test").Page) {
  await page.goto("/evenements");
  await page.getByRole("button", { name: /Comité de pilotage/ }).first().click();
  await expect(page.getByRole("complementary", { name: "Événement" })).toBeVisible();
}

test.describe("EX-EVT-08 — les participants d'un événement", () => {
  test("EX-EVT-08 — le tiroir NOMME les participants, il ne les compte pas seulement", async ({
    page,
  }) => {
    await serveur(page, { session: REDACTEUR, reponses });
    await ouvrirLeDetail(page);

    const tiroir = page.getByRole("complementary", { name: "Événement" });
    await expect(tiroir.getByText("Driss Amrani", { exact: true })).toBeVisible();
    await expect(tiroir.getByText("Inès Rocher", { exact: true })).toBeVisible();
  });

  test("EX-EVT-08 — ajouter un participant part en POST avec SON identifiant", async ({ page }) => {
    await serveur(page, { session: REDACTEUR, reponses });
    await ouvrirLeDetail(page);

    // Sofia n'est pas encore invitée : elle est donc proposée.
    await page.getByLabel("Ajouter", { exact: true }).selectOption("a3");

    const envoi = page.waitForRequest(
      (r) => r.method() === "POST" && r.url().includes("/evenements/e1/participants"),
    );
    await page.getByRole("button", { name: "Ajouter", exact: true }).click();
    expect((await envoi).postDataJSON()).toEqual({ userId: "a3" });
  });

  test("EX-EVT-08 — le sélecteur NE PROPOSE PAS quelqu'un de déjà invité", async ({ page }) => {
    /*
     * Proposer un participant en place produirait une erreur que l'écran
     * pouvait éviter. C'est aussi ce qui rend l'action lisible : ce qu'on voit
     * dans la liste est ce qu'on peut ajouter.
     */
    await serveur(page, { session: REDACTEUR, reponses });
    await ouvrirLeDetail(page);

    const options = page.getByLabel("Ajouter", { exact: true }).getByRole("option");
    await expect(options).toHaveCount(2); // « Sélectionner » + Sofia
    await expect(options.filter({ hasText: "Driss Amrani" })).toHaveCount(0);
  });

  test("EX-EVT-08 — retirer un participant part en DELETE sur SON identifiant", async ({ page }) => {
    await serveur(page, { session: REDACTEUR, reponses });
    await ouvrirLeDetail(page);

    const envoi = page.waitForRequest(
      (r) =>
        r.method() === "DELETE" && r.url().includes("/evenements/e1/participants/a1"),
    );
    await page.getByRole("button", { name: "Retirer Driss Amrani" }).click();
    await envoi;
  });

  test("EX-EVT-08 — un événement sans participant le DIT, plutôt que de rester vide", async ({
    page,
  }) => {
    await serveur(page, { session: REDACTEUR, reponses });
    await page.goto("/evenements");
    await page.getByRole("button", { name: /Audit du prestataire/ }).first().click();

    await expect(page.getByText("Aucun participant pour l'instant.")).toBeVisible();
  });

  test("RG-GEN-06 — sans events:update, la liste se LIT et rien ne se propose", async ({ page }) => {
    await serveur(page, { session: CAMILLE, reponses });
    await ouvrirLeDetail(page);

    const tiroir = page.getByRole("complementary", { name: "Événement" });
    // Masquer la liste ferait croire qu'il n'y a personne.
    await expect(tiroir.getByText("Driss Amrani", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Ajouter", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^Retirer / })).toHaveCount(0);
  });
});
