import AxeBuilder from "@axe-core/playwright";
import { test, expect } from "@playwright/test";
import { serveur, SESSION, PROJET, LIGNE_PROJET, ROUTE } from "./fixtures/projets.js";
import { FICHE, FICHE_VIDE } from "./fixtures/taches.js";

const CANDIDATS = [{id: "a1", prenom: "Camille", nom: "Roussel"}, {id: "a2", prenom: "Driss", nom: "Amrani"}];

for (const langue of ["fr", "en"] as const) {
  test.beforeEach(async ({ page }) => {
    await page.clock.setFixedTime(new Date("2026-08-11T09:00:00Z"));
  });
  test(`RM-06 P-43 ${langue} métadonnées saisissables et visibles`, async ({ page }) => {
    await page.addInitScript((l) => localStorage.setItem("rationarium.langue", l), langue);
    await serveur(page, { session: { ...SESSION, permissions: [...SESSION.permissions, "directions:read"] }, reponses: {
      "/api/projets": { corps: { projets: [LIGNE_PROJET], affiches: 1, total: 1 } },
      "/api/utilisateurs": { corps: CANDIDATS },
      "/api/organisation": { corps: { departements: [{ id: "d1", nom: "Numérique" }] } },
    } });
    await page.goto("/projets");
    await page.getByRole("button", { name: langue === "fr" ? "Créer un projet" : "New project", exact: true }).click();
    const modal = page.getByRole("dialog");
    await expect(modal.locator("#pf-chefId")).toBeVisible();
    await expect(modal.locator("#pf-sponsorId")).toBeVisible();
    await expect(modal.locator("#pf-departementId")).toBeVisible();
    await modal.locator("#pf-chefId").selectOption(CANDIDATS[0]!.id);
    await modal.locator("#pf-sponsorId").selectOption(CANDIDATS[1]!.id);
    await modal.locator("#pf-departementId").selectOption("d1");
    for (const sombre of [false, true]) {
      await page.evaluate(dark => document.documentElement.classList.toggle("dark", dark), sombre);
      for (const width of [1440, 768]) {
        await page.setViewportSize({ width, height: width === 1440 ? 1000 : 1024 });
        await modal.locator("#pf-chefId").scrollIntoViewIfNeeded();
        await page.evaluate(async () => { await Promise.all(document.getAnimations().map(a => a.finished.catch(() => undefined))); });
        expect((await new AxeBuilder({page}).include('[role="dialog"]').analyze()).violations).toEqual([]);
        await page.screenshot({path: `../../recette/remediation/rm-06/metadata-${langue}-${sombre ? "sombre" : "clair"}-${width}.png`});
      }
    }
  });
  test(`RM-06 P-44 ${langue} dates projet refusées avant réseau`, async ({ page }) => {
    await page.addInitScript((l) => localStorage.setItem("rationarium.langue", l), langue);
    await serveur(page, { reponses: { "/api/projets": { corps: { projets: [], affiches: 0, total: 0 } } } });
    let envois = 0;
    await page.route("**/api/projets", async route => {
      if (route.request().method() === "POST") { envois++; await route.fulfill({ status: 400, json: {} }); }
      else await route.fallback();
    });
    await page.goto("/projets");
    await page.getByRole("button", { name: langue === "fr" ? "Créer un projet" : "New project", exact: true }).click();
    await page.locator("#pf-nom").fill("Projet dates");
    await page.locator('input[type="date"]').nth(0).fill("2026-10-20");
    await page.locator('input[type="date"]').nth(1).fill("2026-10-19");
    await page.getByRole("dialog").getByRole("button", { name: langue === "fr" ? "Créer le projet" : "Create project", exact: true }).click();
    await expect(page.getByRole("dialog").locator(".alert-error")).toContainText(langue === "fr" ? "La date de fin précède la date de début." : "The end date comes before the start date.");
    expect(envois).toBe(0);
    await page.locator('input[type="date"]').nth(1).fill("2026-10-20");
    await page.getByRole("dialog").getByRole("button", { name: langue === "fr" ? "Créer le projet" : "Create project", exact: true }).click();
    await expect.poll(() => envois).toBe(1);
  });
  test(`RM-06 P-69 ${langue} archives retrouvables par filtre`, async ({ page }) => {
    await page.addInitScript((l) => localStorage.setItem("rationarium.langue", l), langue);
    await serveur(page, { reponses: { "/api/projets": { corps: { projets: [], affiches: 0, total: 0 } } } });
    await page.goto("/projets");
    await page.getByRole("button", { name: langue === "fr" ? "Archives" : "Archived projects", exact: true }).click();
    await expect(page.getByRole("button", { name: langue === "fr" ? "Archives" : "Archived projects", exact: true })).toHaveAttribute("aria-pressed", "true");
    expect(new URL(page.url()).searchParams.get("archives")).toBe(JSON.stringify("1"));
  });
  test(`RM-06 P-52 ${langue} attribution RACI proposée`, async ({ page }) => {
    await page.addInitScript((l) => localStorage.setItem("rationarium.langue", l), langue);
    await serveur(page, { session: { ...SESSION, permissions: [...SESSION.permissions, "tasks:manage_raci"] }, reponses: {
      [`/api/taches/${FICHE.id}`]: { corps: FICHE },
      "/api/utilisateurs": { corps: CANDIDATS },
    } });
    const raci: {userId: string; role: string; user: {prenom: string; nom: string}}[] = [];
    await page.route(`**/api/taches/${FICHE.id}`, route => route.fulfill({ json: { ...FICHE, raci } }));
    await page.route(`**/api/taches/${FICHE.id}/raci`, async route => {
      const corps = route.request().postDataJSON() as {userId: string; role: string};
      raci.push({ ...corps, user: { prenom: "Camille", nom: "Roussel" } });
      await route.fulfill({ json: {} });
    });
    await page.goto(`/taches/${FICHE.id}`);
    await expect(page.locator("#raci-personne")).toBeVisible();
    await expect(page.locator("#raci-role option")).toHaveCount(4);
    for (const role of ["responsible", "accountable", "consulted", "informed"]) {
      await page.locator("#raci-personne").selectOption("a1");
      await page.locator("#raci-role").selectOption(role);
      await page.getByRole("button", { name: langue === "fr" ? "Attribuer le rôle" : "Assign role", exact: true }).click();
      await expect(page.locator(".raci-row").filter({has: page.locator(`.raci-let-${role}`)}).getByText("Camille Roussel", {exact:true})).toBeVisible();
    }
    expect(raci).toHaveLength(4);
    await page.locator("#raci-personne").selectOption("a1");
    await page.getByRole("button", { name: langue === "fr" ? "Attribuer le rôle" : "Assign role", exact: true }).click();
    await expect(page.getByText(langue === "fr" ? "Cet agent porte déjà ce rôle RACI." : "This staff member already holds this RACI role.", {exact:true})).toBeVisible();
    expect(raci).toHaveLength(4);
  });
  test(`RM-06 P-67 ${langue} le projet de la fiche tâche est un lien, l'orpheline n'en invente pas`, async ({ page }) => {
    await page.addInitScript((l) => localStorage.setItem("rationarium.langue", l), langue);
    await serveur(page, {
      session: { ...SESSION, permissions: [...SESSION.permissions, "tasks:update"] },
      reponses: {
      [`/api/taches/${FICHE.id}`]: { corps: FICHE },
      [`/api/taches/${FICHE_VIDE.id}`]: { corps: FICHE_VIDE },
      "/api/projets": { corps: { projets: [LIGNE_PROJET], affiches: 1, total: 1 } },
      [`/api/projets/${PROJET.id}`]: { corps: PROJET },
      [`/api/projets/${PROJET.id}/feuille-de-route`]: { corps: ROUTE },
      [`/api/projets/${PROJET.id}/epopees`]: {
        corps: [
          { id: "e1", nom: "Socle numérique", description: null, taches: 2, version: 1 },
          { id: "e2", nom: "Accompagnement", description: null, taches: 1, version: 1 },
        ],
      },
      },
    });
    await page.goto(`/taches/${FICHE_VIDE.id}`);
    await expect(page.locator("main a[href^='/projets/']")).toHaveCount(0);
    await page.goto(`/taches/${FICHE.id}`);
    await page.getByRole("button", { name: langue === "fr" ? "Modifier" : "Edit", exact: true }).click();
    const modification = page.getByRole("dialog", {
      name: langue === "fr" ? "Modifier la tâche" : "Edit task",
    });
    await expect(modification.locator("#tm-jalon option")).toHaveText([
      langue === "fr" ? "Aucun jalon" : "No milestone",
      "Cadrage et ateliers",
      "Recette fonctionnelle",
      "Reste à planifier",
    ]);
    await expect(modification.locator("#tm-epopee option")).toHaveText([
      langue === "fr" ? "Aucune épopée" : "No epic",
      "Socle numérique",
      "Accompagnement",
    ]);
    await modification.getByRole("button", { name: langue === "fr" ? "Annuler" : "Cancel" }).click();
    const lien = page.locator("a.pchip-lien").filter({ hasText: PROJET.nom });
    await expect(lien).toHaveAccessibleName(
      langue === "fr" ? `Ouvrir le projet ${PROJET.nom}` : `Open project ${PROJET.nom}`,
    );
    await expect(lien).toHaveAttribute("href", `/projets/${PROJET.id}`);
    await lien.click();
    await expect(page).toHaveURL(new RegExp(`/projets/${PROJET.id}$`));
    await expect(page.getByRole("heading", { name: PROJET.nom, exact: true })).toBeVisible();
  });
  test(`RM-01 P-150 ${langue} sans-jalon issu du décompte serveur`, async ({ page }) => {
    await page.addInitScript((l) => localStorage.setItem("rationarium.langue", l), langue);
    await serveur(page, { reponses: {
      [`/api/projets/${PROJET.id}`]: { corps: { ...PROJET, taches: { ...PROJET.taches, total: 10 } } },
      [`/api/projets/${PROJET.id}/feuille-de-route`]: { corps: { ...ROUTE, indicateurs: { ...ROUTE.indicateurs, taches: 10, sansJalon: 2 } } },
      [`/api/projets/${PROJET.id}/epopees`]: { corps: [] },
    } });
    await page.goto(`/projets/${PROJET.id}/jalons`);
    await expect(page.getByText(langue === "fr" ? "dont 2 sans jalon" : "2 without a milestone", { exact: true })).toBeVisible();
  });
}

for (const langue of ["fr", "en"] as const) {
  test(`RM-06 P-58 ${langue} compteurs projet actualisés après import sans rechargement`, async ({ page }) => {
    await page.addInitScript((l) => localStorage.setItem("rationarium.langue", l), langue);
    await serveur(page, { session: { ...SESSION, permissions: [...SESSION.permissions, "tasks:import"] }, reponses: {
      "/api/taches": { corps: [] },
      [`/api/projets/${PROJET.id}`]: { corps: { ...PROJET, taches: { ...PROJET.taches, total: 2 }, jalons: 1 } },
      [`/api/imports/projet/${PROJET.id}/volumes`]: { corps: { jalons: 1, taches: 2, sousTaches: 0 } },
      "/api/imports/apercu?type=projet": { corps: { lignes: [{ rowType: "TASK", title: "Importée" }], total: 1, erreurs: [] } },
    } });
    let importe = false;
    await page.route(`**/api/projets/${PROJET.id}`, route => route.fulfill({ json: { ...PROJET, taches: { ...PROJET.taches, total: importe ? 3 : 2 }, jalons: 1 } }));
    await page.route(`**/api/imports/projet/${PROJET.id}`, async route => {
      importe = true;
      await route.fulfill({ json: { importes: 1, ignores: 0, ignorees: [], erreurs: [] } });
    });
    await page.goto(`/projets/${PROJET.id}/taches`);
    await page.getByRole("button", { name: langue === "fr" ? "Import projet (jalons + tâches)" : "Project import (milestones + tasks)", exact: true }).click();
    await page.locator('input[type="file"]').setInputFiles({ name: "projet.csv", mimeType: "text/csv", buffer: Buffer.from("rowType;title\nTASK;Importée\n") });
    await page.getByRole("dialog").getByRole("button", { name: langue === "fr" ? "Importer" : "Import", exact: true }).click();
    await expect(page.locator(".tabbar").getByRole("link", { name: langue === "fr" ? /Tâches3/ : /Tasks3/ })).toBeVisible();
  });
  test(`RM-06 P-70 ${langue} annulation portefeuille confirmée`, async ({ page }) => {
    await page.addInitScript((l) => localStorage.setItem("rationarium.langue", l), langue);
    await serveur(page, { reponses: { "/api/projets": { corps: { projets: [LIGNE_PROJET], affiches: 1, total: 1 } } } });
    let envois = 0;
    await page.route(`**/api/projets/${PROJET.id}/annuler`, async route => { envois++; await route.fulfill({ json: {} }); });
    await page.goto("/projets");
    await page.getByRole("button", { name: langue === "fr" ? "Annuler un projet" : "Cancel a project", exact: true }).click();
    expect(envois).toBe(0);
    await page.locator("#pf-annuler").selectOption(PROJET.id);
    await expect(page.getByRole("dialog").locator(".phrase-confirmation")).toContainText(PROJET.nom);
    await page.getByRole("button", { name: langue === "fr" ? "Annuler ce projet" : "Cancel this project", exact: true }).click();
    await expect.poll(() => envois).toBe(1);
  });
  test(`RM-06 P-71 ${langue} client rattachable avec son propre droit sans gestion des agents`, async ({ page }) => {
    await page.addInitScript((l) => localStorage.setItem("rationarium.langue", l), langue);
    await serveur(page, { session: { ...SESSION, permissions: ["projects:read", "clients:read", "clients:update"] }, reponses: {
      [`/api/projets/${PROJET.id}`]: { corps: PROJET },
      [`/api/projets/${PROJET.id}/equipe`]: { corps: { agents: [], tiers: [], clients: [], allocationCumulee: 0 } },
      "/api/clients": { corps: [{ id: "c1", nom: "Bénéficiaire actif", actif: true }] },
    } });
    let recu: unknown;
    await page.route(`**/api/clients/projets/${PROJET.id}`, async route => { recu = route.request().postDataJSON(); await route.fulfill({ json: {} }); });
    await page.goto(`/projets/${PROJET.id}/equipe`);
    await page.getByRole("button", { name: langue === "fr" ? "+ Ajouter un membre" : "+ Add a member", exact: true }).click();
    const dialogue = page.getByRole("dialog");
    await expect(dialogue.getByRole("button", { name: /Agent|Staff/ })).toHaveCount(0);
    await dialogue.getByLabel(langue === "fr" ? /^Bénéficiaire/ : /^Beneficiary/).selectOption("c1");
    await dialogue.getByRole("button", { name: langue === "fr" ? "Ajouter" : "Add", exact: true }).click();
    await expect.poll(() => recu).toEqual({ clientIds: ["c1"] });
  });
}

for (const langue of ["fr", "en"] as const) {
  test(`RM-06 P-44 ${langue} dates tâche refusées avant réseau et égalité acceptée`, async ({ page }) => {
    await page.addInitScript(l => localStorage.setItem("rationarium.langue", l), langue);
    await serveur(page, { session: { ...SESSION, permissions: [...SESSION.permissions, "tasks:create"] }, reponses: {
      "/api/taches": { corps: [] },
      "/api/projets": { corps: { projets: [LIGNE_PROJET], affiches: 1, total: 1 } },
      "/api/utilisateurs": { corps: CANDIDATS },
    } });
    let envois = 0;
    await page.route("**/api/taches", async route => {
      if (route.request().method() === "POST") { envois++; await route.fulfill({status: 400, json: {}}); }
      else await route.fallback();
    });
    await page.goto("/taches");
    await page.getByRole("button", { name: langue === "fr" ? "Créer une tâche" : "New task", exact: true }).click();
    await page.locator("#tk-titre").fill("Tâche dates");
    await page.locator("#tk-debut").fill("2026-10-20");
    await page.locator("#tk-fin").fill("2026-10-19");
    const enregistrer = page.getByRole("dialog").getByRole("button", { name: langue === "fr" ? "Créer la tâche" : "Create task", exact: true });
    await enregistrer.click();
    await expect(page.getByRole("dialog").locator(".alert-error")).toContainText(langue === "fr" ? "La date de fin précède la date de début." : "The end date comes before the start date.");
    expect(envois).toBe(0);
    await page.locator("#tk-fin").fill("2026-10-20");
    await enregistrer.click();
    await expect.poll(() => envois).toBe(1);
  });
}

for (const langue of ["fr", "en"] as const) {
  test(`RM-06 P-70 ${langue} sélection d'annulation périmée après fermeture et filtrage`, async ({ page }) => {
    await page.addInitScript(l => localStorage.setItem("rationarium.langue", l), langue);
    await serveur(page);
    let envois = 0;
    await page.route(url => url.pathname === "/api/projets", route => {
      const filtre = new URL(route.request().url()).searchParams.get("recherche");
      return route.fulfill({ json: { projets: filtre ? [] : [LIGNE_PROJET], affiches: filtre ? 0 : 1, total: 1 } });
    });
    await page.route(`**/api/projets/${PROJET.id}/annuler`, async route => { envois++; await route.fulfill({json: {}}); });
    await page.goto("/projets");
    const ouvrir = page.getByRole("button", { name: langue === "fr" ? "Annuler un projet" : "Cancel a project", exact: true });
    await ouvrir.click();
    await page.locator("#pf-annuler").selectOption(PROJET.id);
    await page.getByRole("dialog").getByRole("button", { name: langue === "fr" ? "Fermer" : "Close", exact: true }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page.locator('.filters input[type="search"]').fill("absent");
    await expect(page.locator(".prow-card")).toHaveCount(0);
    await ouvrir.click();
    await expect(page.getByRole("dialog").getByRole("button", { name: langue === "fr" ? "Annuler ce projet" : "Cancel this project", exact: true })).toBeDisabled();
    await expect(page.getByRole("dialog").locator(".phrase-confirmation")).toHaveCount(0);
    expect(envois).toBe(0);
  });
}
