import AxeBuilder from "@axe-core/playwright";
import { test, expect, type Page } from "@playwright/test";
import { serveur } from "./fixtures/projets.js";
import { FATOU, CAMILLE, DEMANDES, TYPES_CONGE, SOLDES, SOLDE_T1_2026, JOURS_OUVRES_SEMAINE, PLANNING_TELETRAVAIL, SAISIES } from "./fixtures/occupations.js";

const AGENT = { id: "a1", prenom: "Camille", nom: "Roussel" };
const DELEGUE = { id: "a2", prenom: "Driss", nom: "Amrani" };
const reponses = {
  "/api/conges": { corps: [] },
  "/api/conges/types": { corps: TYPES_CONGE },
  "/api/conges/soldes": { corps: SOLDES },
  "/api/conges/solde": { corps: SOLDE_T1_2026 },
  "/api/conges/validateur": { corps: { validateurId: DELEGUE.id, validateur: DELEGUE } },
  "/api/conges/candidats": { corps: [AGENT, DELEGUE] },
  "/api/conges/delegations": { corps: { donnees: [], recues: [] } },
  "/api/parametrage/jours-ouvres": { corps: JOURS_OUVRES_SEMAINE },
};
async function voirDialogue(page: Page, nom: string, langue: string) {
  for (const sombre of [false, true]) {
    await page.evaluate(dark => document.documentElement.classList.toggle("dark", dark), sombre);
    for (const width of [1440, 768]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.evaluate(async () => { await Promise.all(document.getAnimations().map(animation => animation.finished.catch(() => undefined))); });
      expect((await new AxeBuilder({ page }).include('[role="dialog"]').analyze()).violations).toEqual([]);
      await page.screenshot({ path: `../../recette/remediation/rm-07/${nom}-${langue}-${sombre ? "sombre" : "clair"}-${width}.png` });
    }
  }
}
for (const langue of ["fr", "en"] as const) {
 test.describe(langue, () => {
  test.beforeEach(async ({ page }) => {
    await page.clock.setFixedTime(new Date("2026-08-11T09:00:00Z"));
    await page.addInitScript(l => localStorage.setItem("rationarium.langue", l), langue);
  });
  test(`RM-07 P-78 ${langue} congé pour autrui et solde cible`, async ({ page }) => {
    await serveur(page, { session: { ...FATOU, permissions: [...FATOU.permissions, "leaves:declare_for_other"] }, reponses });
    const corps: unknown[] = [];
    await page.route(url => url.pathname === "/api/conges", async route => {
      if (route.request().method() === "POST") { corps.push(route.request().postDataJSON()); await route.fulfill({ json: { id: "nouveau" } }); } else await route.fallback();
    });
    await page.goto("/conges");
    await page.getByRole("button", { name: langue === "fr" ? "Nouvelle demande" : "New request", exact: true }).click();
    const dialogue = page.getByRole("dialog");
    await dialogue.locator("#cg-beneficiaire").selectOption(AGENT.id);
    await dialogue.locator("#cg-type").selectOption(TYPES_CONGE[0]!.id);
    await dialogue.locator("#cg-debut").fill("2026-08-17");
    const soldeCible = page.waitForRequest(r => new URL(r.url()).pathname === "/api/conges/solde" && new URL(r.url()).searchParams.get("userId") === AGENT.id);
    await dialogue.locator("#cg-fin").fill("2026-08-21");
    await soldeCible;
    await expect(dialogue.getByText(langue === "fr" ? "Ce congé sera directement approuvé et tracé à votre nom." : "This leave will be approved immediately and recorded under your name.", { exact: true })).toBeVisible();
    for (const sombre of [false, true]) {
      await page.evaluate(dark => document.documentElement.classList.toggle("dark", dark), sombre);
      for (const width of [1440, 768]) {
        await page.setViewportSize({ width, height: 1000 });
        await page.evaluate(async () => { await Promise.all(document.getAnimations().map(animation => animation.finished.catch(() => undefined))); });
        expect((await new AxeBuilder({ page }).include('[role="dialog"]').analyze()).violations).toEqual([]);
        await page.screenshot({ path: `../../recette/remediation/rm-07/conge-${langue}-${sombre ? "sombre" : "clair"}-${width}.png` });
      }
    }
    await dialogue.getByRole("button", { name: langue === "fr" ? "Déposer la demande" : "Submit request", exact: true }).click();
    await expect(dialogue).toHaveCount(0);
    expect(corps).toEqual([expect.objectContaining({ userId: AGENT.id, typeId: TYPES_CONGE[0]!.id })]);
  });
  test(`RM-07 P-80 ${langue} création puis désactivation délégation`, async ({ page }) => {
    await serveur(page, { session: FATOU, reponses });
    let active = false;
    let cree = false;
    await page.route(url => url.pathname === "/api/conges/delegations", async route => {
      if (route.request().method() === "POST") { expect(route.request().postDataJSON()).toEqual({ delegantId: FATOU.id, delegueId: DELEGUE.id, dateDebut: "2026-08-17", dateFin: "2026-08-21" }); active = true; cree = true; await route.fulfill({ json: { id: "dg1" } }); }
      else await route.fulfill({ json: { donnees: cree ? [{ id: "dg1", delegue: DELEGUE, dateDebut: "2026-08-17", dateFin: "2026-08-21", active }] : [], recues: [] } });
    });
    await page.route(url => url.pathname === "/api/conges/delegations/dg1", async route => { active = false; await route.fulfill({ json: {} }); });
    await page.goto("/conges#delegations");
    const ouvrir = page.getByRole("button", { name: langue === "fr" ? "Déléguer la validation" : "Delegate approval", exact: true });
    await expect(ouvrir).toBeVisible({ timeout: 2000 });
    await ouvrir.click();
    await expect(page.getByRole("dialog").getByRole("button", { name: langue === "fr" ? "Fermer" : "Close", exact: true })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(ouvrir).toBeFocused();
    await ouvrir.click();
    await page.locator("#dg-who").selectOption(DELEGUE.id);
    await page.locator("#dg-debut").fill("2026-08-17");
    await page.locator("#dg-fin").fill("2026-08-21");
    await voirDialogue(page, "delegation", langue);
    await page.getByRole("dialog").getByRole("button", { name: langue === "fr" ? "Créer la délégation" : "Create delegation", exact: true }).click();
    const ligne = page.locator(".dg-row").filter({ hasText: "Driss Amrani" });
    await expect(ligne).toContainText(langue === "fr" ? "Active" : "Active");
    await ligne.getByRole("button", { name: langue === "fr" ? "Désactiver" : "Deactivate", exact: true }).click();
    await expect(ligne).toContainText(langue === "fr" ? "Inactive" : "Inactive");
    expect(active).toBe(false);
  });
  test(`RM-07 P-80 ${langue} chronologie de délégation explicite`, async ({ page }) => {
    await serveur(page, { session: FATOU, reponses });
    let ecritures = 0;
    await page.route(url => url.pathname === "/api/conges/delegations", async route => {
      if (route.request().method() === "POST") { ecritures++; await route.fulfill({ json: { id: "dg1" } }); }
      else await route.fallback();
    });
    await page.goto("/conges#delegations");
    await page.getByRole("button", { name: langue === "fr" ? "Déléguer la validation" : "Delegate approval", exact: true }).click();
    const dialogue = page.getByRole("dialog");
    const creer = dialogue.getByRole("button", { name: langue === "fr" ? "Créer la délégation" : "Create delegation", exact: true });
    await creer.click();
    await expect(dialogue.getByRole("alert")).toContainText(langue === "fr" ? "Veuillez remplir tous les champs obligatoires." : "Please fill in all required fields.");
    await page.locator("#dg-who").selectOption(DELEGUE.id);
    await page.locator("#dg-debut").fill("2026-08-21");
    await page.locator("#dg-fin").fill("2026-08-17");
    await creer.click();
    await expect(dialogue.getByRole("alert")).toHaveText(langue === "fr" ? "La date de fin précède la date de début." : "The end date comes before the start date.");
    expect(ecritures).toBe(0);
    await page.locator("#dg-fin").fill("2026-08-21");
    await creer.click();
    await expect(dialogue).toHaveCount(0);
    expect(ecritures).toBe(1);
  });
  test(`RM-07 P-85 P-158 ${langue} statistiques agent et présence prioritaire`, async ({ page }) => {
    await serveur(page, { session: { ...FATOU, permissions: [...FATOU.permissions, "telework:read_team"] }, reponses: {
      "/api/teletravail": { corps: PLANNING_TELETRAVAIL },
      "/api/teletravail/equipe": { corps: [{ ...AGENT, etat: "undeclared", enConge: true, nonOuvre: false }, { ...DELEGUE, etat: "undeclared", nonOuvre: true }] },
      "/api/teletravail/statistiques": { corps: { annee: 2026, total: 24, parMois: [1,2,3,4,2,2,2,8,0,0,0,0], moyenneMensuelle: 2 } },
    } });
    await page.goto("/teletravail");
    await page.getByRole("button", { name: langue === "fr" ? "Vue équipe" : "Team view", exact: true }).click();
    await expect(page.locator(".team-row").filter({ hasText: "Camille Roussel" })).toContainText(langue === "fr" ? "En congé" : "On leave");
    await expect(page.locator(".team-row").filter({ hasText: "Driss Amrani" })).toContainText(langue === "fr" ? "Jour non ouvré" : "Non-working day");
    await page.getByRole("button", { name: langue === "fr" ? "Statistiques de Camille Roussel" : "Statistics for Camille Roussel", exact: true }).click();
    await expect(page.getByText(langue === "fr" ? "Mois 2026-08 : 8 jours" : "Month 2026-08: 8 days", { exact: true })).toBeVisible();
    await expect(page.getByText(langue === "fr" ? "Année 2026 : 24 jours" : "Year 2026: 24 days", { exact: true })).toBeVisible();
    for (const sombre of [false, true]) {
      await page.evaluate(dark => document.documentElement.classList.toggle("dark", dark), sombre);
      for (const width of [1440, 768]) {
        await page.setViewportSize({ width, height: 1000 });
        await page.evaluate(async () => { await Promise.all(document.getAnimations().map(animation => animation.finished.catch(() => undefined))); });
        expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
        await page.screenshot({ path: `../../recette/remediation/rm-07/presence-${langue}-${sombre ? "sombre" : "clair"}-${width}.png` });
      }
    }
  });
  test(`RM-07 P-90 ${langue} acteur externe envoyé et filtre tiers`, async ({ page }) => {
    await serveur(page, { session: { ...FATOU, permissions: [...FATOU.permissions, "time_tracking:declare_for_third_party", "time_tracking:read_team", "third_parties:read"] }, reponses: {
      "/api/temps": { corps: SAISIES }, "/api/tiers": { corps: [{ id: "tier1", organisation: "Atelier externe", contactNom: null }] }, "/api/projets": { corps: { projets: [{ id: "p1", nom: "Projet témoin" }], total: 1, affiches: 1 } }, "/api/taches": { corps: [] },
    } });
    const corps: unknown[] = [];
    await page.route(url => url.pathname === "/api/temps", async route => { if (route.request().method() === "POST") { corps.push(route.request().postDataJSON()); await route.fulfill({ json: { id: "s1" } }); } else await route.fallback(); });
    await page.goto("/temps");
    const filtre = page.waitForRequest(r => new URL(r.url()).pathname === "/api/temps" && new URL(r.url()).searchParams.get("thirdPartyId") === "tier1");
    await page.locator(".filters select").first().selectOption("third:tier1");
    await filtre;
    await page.getByRole("button", { name: langue === "fr" ? "Saisir du temps" : "Log time", exact: true }).first().click();
    await page.locator("#tp-acteur").selectOption("third:tier1");
    await page.locator("#tp-heures").fill("2");
    await page.locator("#tp-projet").selectOption("p1");
    await voirDialogue(page, "temps", langue);
    await page.getByRole("dialog").getByRole("button", { name: langue === "fr" ? "Enregistrer" : "Save", exact: true }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    expect(corps).toEqual([expect.objectContaining({ thirdPartyId: "tier1", heures: 2 })]);
    expect(corps[0]).not.toHaveProperty("userId");
  });
  test(`RM-07 P-159 ${langue} contexte avant décision`, async ({ page }) => {
    await serveur(page, { session: FATOU, reponses: { ...reponses, "/api/conges": { corps: [{ ...DEMANDES[0], user: { ...AGENT, services: [{ id: "s1", nom: "Études et projets" }] }, absencesConcomitantes: [{ id: "autre", user: DELEGUE, dateDebut: "2026-09-07", dateFin: "2026-09-09" }] }] } } });
    await page.goto("/conges#aValider");
    await expect(page.getByText("Études et projets", { exact: true })).toBeVisible();
    await expect(page.getByText(langue === "fr" ? "Absences concomitantes : 1" : "Overlapping absences: 1", { exact: false })).toBeVisible();
    await expect(page.getByText(/Driss Amrani ·/)).toBeVisible();
    await expect(page.getByRole("button", { name: langue === "fr" ? "Approuver" : "Approve", exact: true })).toBeVisible();
  });
  test(`RM-07 droits minimaux ${langue} aucune écriture autrui`, async ({ page }) => {
    await serveur(page, { session: CAMILLE, reponses });
    await page.goto("/conges");
    await page.getByRole("button", { name: langue === "fr" ? "Nouvelle demande" : "New request", exact: true }).click();
    await expect(page.locator("#cg-beneficiaire")).toHaveCount(0);
    await expect(page.getByRole("link", { name: langue === "fr" ? "Délégations" : "Delegations", exact: true })).toHaveCount(0);
  });
 });
}
