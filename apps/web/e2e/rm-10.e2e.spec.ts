import AxeBuilder from "@axe-core/playwright";
import { test, expect } from "@playwright/test";
import { serveur } from "./fixtures/projets.js";
import { SESSION_CONFIG, REGLAGES, FERIES, VACANCES } from "./fixtures/parametrage.js";
const KARIM = { ...SESSION_CONFIG, prenom: "Karim", nom: "Delorme", role: { code: "ADMIN", nom: "Administrateur" }, permissions: [...SESSION_CONFIG.permissions, "holidays:update", "school_vacations:import"] };
const reponses = { "/api/parametrage": { corps: REGLAGES }, "/api/parametrage/feries": { corps: FERIES }, "/api/parametrage/vacances": { corps: VACANCES } };
for (const langue of ["fr", "en"] as const) test.describe(langue, () => {
  test.beforeEach(async ({ page }) => { await page.clock.setFixedTime(new Date("2026-08-11T09:00:00Z")); await page.addInitScript(l => localStorage.setItem("rationarium.langue", l), langue); });
  test(`RM-10 P-100 ${langue} Karim peut qualifier un férié existant`, async ({ page }) => {
    await serveur(page, { session: KARIM, reponses });
    const jours = FERIES.feries.map(f => ({ ...f, version: 1 }));
    const ecritures: unknown[] = [];
    await page.route(url => url.pathname === "/api/parametrage/feries", async route => {
      const annee = new URL(route.request().url()).searchParams.get("annee");
      const feries = annee === "2027" ? jours.filter(f => f.recurrent).map(f => ({ ...f, date: f.date.replace("2026", "2027") })) : jours;
      await route.fulfill({ json: { feries, statistiques: { total: feries.length, chomes: feries.filter(f => !f.ouvre).length, ouvres: feries.filter(f => f.ouvre).length, legaux: feries.filter(f => f.type === "legal").length } } });
    });
    await page.route(url => url.pathname.startsWith("/api/parametrage/feries/f"), async route => {
      const donnees = route.request().postDataJSON() as { version: number; ouvre?: boolean; recurrent?: boolean };
      const ferie = jours.find(f => route.request().url().endsWith(f.id))!;
      expect(donnees.version).toBe(ferie.version);
      ecritures.push(donnees);
      Object.assign(ferie, donnees, { version: ferie.version + 1 });
      await route.fulfill({ json: ferie });
    });
    await page.route(url => url.pathname === "/api/parametrage/feries/importer", async route => {
      expect(route.request().postDataJSON()).toEqual({ annee: 2026 });
      await route.fulfill({ json: { crees: 4, existants: 7 } });
    });
    await page.goto("/parametres#feries");
    const ligne = page.locator(".set-row").filter({ hasText: "Fête patronale" });
    const ouvre = ligne.getByRole("checkbox", { name: /Jour ouvré|Working day/ });
    await expect(ouvre).toBeVisible();
    await ouvre.click();
    await expect(ouvre).toBeChecked();
    await expect(page.locator(".kpi").filter({ has: page.getByText(langue === "fr" ? "Jours ouvrés" : "Working days", { exact: true }) }).locator(".kpi-val")).toHaveText("2");
    await ligne.getByRole("checkbox", { name: /Récurrent|Recurring/ }).click();
    await expect(ligne.getByRole("checkbox", { name: /Récurrent|Recurring/ })).toBeChecked();
    expect(ecritures).toEqual([{ version: 1, ouvre: true }, { version: 2, recurrent: true }]);
    await page.getByRole("button", { name: /Importer fériés FR|Import FR holidays/ }).click();
    await expect(page.getByRole("status")).toContainText(/4.*7/);
    for (const sombre of [false, true]) {
      await page.evaluate(dark => document.documentElement.classList.toggle("dark", dark), sombre);
      for (const width of [1440, 768]) {
        await page.setViewportSize({ width, height: 1024 });
        await page.evaluate(async () => { await Promise.all(document.getAnimations().map(a => a.finished.catch(() => undefined))); });
        expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
        await page.screenshot({ path: `../../recette/remediation/rm-10/feries-${langue}-${sombre ? "sombre" : "clair"}-${width}.png` });
      }
    }
    await page.getByRole("spinbutton", { name: langue === "fr" ? "Année" : "Year", exact: true }).fill("2027");
    await expect(page.locator(".set-row").filter({ hasText: "Fête patronale" })).toContainText("2027");

  });
  test(`RM-10 P-101 ${langue} Karim peut importer année et zone`, async ({ page }) => {
    await serveur(page, { session: KARIM, reponses });
    let imports = 0;
    await page.route(url => url.pathname === "/api/parametrage/vacances/importer", async route => {
      expect(route.request().postDataJSON()).toEqual({ anneeScolaire: "2026-2027", zone: "B" });
      imports++;
      await route.fulfill({ json: { crees: 4, existants: 0 } });
    });
    await page.goto("/parametres#vacances");
    const importer = page.getByRole("button", { name: /Importer les vacances|Import school holidays/ });
    await expect(importer).toBeVisible();
    await importer.click();
    await expect(page.getByRole("alert").filter({ hasText: /AAAA|YYYY/ })).toBeVisible();
    expect(imports).toBe(0);
    await page.locator("#vac-import-zone").fill("B");
    await page.locator("#vac-import-annee").fill("2026-2027");
    await importer.click();
    await expect(page.getByRole("status").filter({ hasText: /4.*0/ })).toBeVisible();
    expect(imports).toBe(1);
    for (const sombre of [false, true]) {
      await page.evaluate(dark => document.documentElement.classList.toggle("dark", dark), sombre);
      for (const width of [1440, 768]) {
        await page.setViewportSize({ width, height: 1024 });
        await page.evaluate(async () => { await Promise.all(document.getAnimations().map(a => a.finished.catch(() => undefined))); });
        expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
        await page.screenshot({ path: `../../recette/remediation/rm-10/vacances-${langue}-${sombre ? "sombre" : "clair"}-${width}.png` });
      }
    }
  });
  test(`RM-10 ${langue} saisie séquentielle stable malgré la latence et une erreur de lecture`, async ({ page }) => {
    await serveur(page, { session: KARIM, reponses });
    const lectures: string[] = [];
    await page.route(url => url.pathname === "/api/parametrage/vacances", async route => {
      lectures.push(new URL(route.request().url()).search);
      await new Promise(resolve => setTimeout(resolve, 250));
      await route.fulfill({ json: VACANCES });
    });
    await page.goto("/parametres#vacances");
    const annee = page.locator("#vac-import-annee");
    await expect(annee).toBeVisible();
    await annee.fill("");
    await annee.pressSequentially("2026-2027", { delay: 80 });
    await expect(annee).toHaveValue("2026-2027");
    await expect(annee).toBeFocused();
    await page.locator("#vac-import-zone").pressSequentially("B", { delay: 80 });
    expect(lectures).toHaveLength(1);
    await page.route(url => url.pathname === "/api/parametrage/vacances", async route => {
      await new Promise(resolve => setTimeout(resolve, 250));
      await route.fulfill({ status: 400, json: { code: "donnees_invalides" } });
    });
    await page.getByRole("button", { name: /Filtrer|Filter/, exact: true }).click();
    await expect(annee).toBeVisible();
    await expect(page.locator(".etat-erreur")).toBeVisible({ timeout: 15000 });
    await annee.click();
    await annee.press("ControlOrMeta+A");
    await annee.pressSequentially("2025-2026", { delay: 80 });
    await expect(annee).toHaveValue("2025-2026");
    await expect(annee).toBeFocused();
  });
  test(`RM-10 ${langue} zone globale enregistrée sert au formulaire d’import`, async ({ page }) => {
    await serveur(page, { session: KARIM, reponses });
    let valeurs = { ...REGLAGES, "planning.schoolZone": "A" };
    await page.route(url => url.pathname === "/api/parametrage", async route => {
      if (route.request().method() === "PUT") {
        valeurs = (route.request().postDataJSON() as { reglages: typeof valeurs }).reglages;
      }
      await route.fulfill({ json: valeurs });
    });
    await page.goto("/parametres#planning");
    const choix = page.locator("#planning-school-zone");
    await expect(choix).toHaveValue("A");
    await choix.selectOption("C");
    await page.locator(".dirty-bar").getByRole("button", { name: /Enregistrer|Save/, exact: true }).click();
    await expect.poll(() => valeurs["planning.schoolZone"]).toBe("C");
    await expect(page.locator(".dirty-bar")).toHaveCount(0);
    for (const sombre of [false, true]) {
      await page.evaluate(dark => document.documentElement.classList.toggle("dark", dark), sombre);
      for (const width of [1440, 768]) {
        await page.setViewportSize({ width, height: 1024 });
        expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
        await page.screenshot({ path: `../../recette/remediation/rm-10/zone-${langue}-${sombre ? "sombre" : "clair"}-${width}.png` });
      }
    }
    await page.locator(".tabbar").getByRole("link", { name: /Vacances scolaires|School holidays/, exact: true }).click();
    await expect(page.locator("#vac-import-zone")).toHaveValue("C");
    let importee = "";
    await page.route(url => url.pathname === "/api/parametrage/vacances/importer", async route => {
      importee = (route.request().postDataJSON() as { zone: string }).zone;
      await route.fulfill({ json: { crees: 4, existants: 0 } });
    });
    await page.locator("#vac-import-annee").fill("2026-2027");
    await page.getByRole("button", { name: /Importer les vacances|Import school holidays/ }).click();
    await expect.poll(() => importee).toBe("C");
  });
  test(`RM-10 ${langue} liste suit le couple importé après un filtre différent`, async ({ page }) => {
    await serveur(page, { session: KARIM, reponses });
    const lectures: string[] = [];
    await page.route(url => url.pathname === "/api/parametrage/vacances", async route => {
      lectures.push(new URL(route.request().url()).searchParams.get("anneeScolaire") ?? "");
      await route.fulfill({ json: VACANCES });
    });
    await page.route(url => url.pathname === "/api/parametrage/vacances/importer", async route => {
      expect(route.request().postDataJSON()).toEqual({ anneeScolaire: "2019-2020", zone: "B" });
      await route.fulfill({ json: { crees: 4, existants: 0 } });
    });
    await page.goto("/parametres#vacances");
    const annee = page.locator("#vac-import-annee");
    await expect(annee).toBeVisible();
    await expect.poll(() => lectures[0]).toBe(await annee.inputValue());
    await annee.fill("2026-2027");
    await page.locator("#vac-import-zone").fill("B");
    await page.getByRole("button", { name: /Filtrer|Filter/, exact: true }).click();
    await expect.poll(() => lectures.at(-1)).toBe("2026-2027");
    await annee.fill("2019-2020");
    await page.getByRole("button", { name: /Importer les vacances|Import school holidays/ }).click();
    await expect.poll(() => lectures.at(-1)).toBe("2019-2020");
  });
  test(`RM-10 D-RM02 ${langue} Hugo conserve uniquement la lecture calendrier`, async ({ page }) => {
    await serveur(page, { session: { ...KARIM, prenom: "Hugo", nom: "Nguyen", permissions: ["settings:read", "holidays:read", "school_vacations:read"] }, reponses });
    await page.goto("/parametres#feries");
    await expect(page.getByRole("button", { name: /Importer fériés|Import FR holidays/ })).toHaveCount(0);
    await expect(page.locator(".set-row").getByRole("checkbox")).toHaveCount(0);
    await page.goto("/parametres#vacances");
    await expect(page.getByRole("button", { name: /Importer les vacances|Import school holidays/ })).toHaveCount(0);
  });
});
