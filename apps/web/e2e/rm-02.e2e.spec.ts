import AxeBuilder from "@axe-core/playwright";
import { test, expect } from "@playwright/test";
import { serveur } from "./fixtures/projets.js";
import { SESSION_ADMIN, UTILISATEURS } from "./fixtures/administration.js";

for (const langue of ["fr", "en"] as const) {
  test(`RM-02 P-07 ${langue} — attend la session fraîche avant navigation`, async ({ page }) => {
    await page.clock.setFixedTime(new Date("2026-08-11T09:00:00Z"));
    await page.addInitScript((l) => localStorage.setItem("rationarium.langue", l), langue);
    const session = { ...SESSION_ADMIN, motDePasseAChanger: true };
    await serveur(page, { session });
    let change = false;
    await page.route("**/api/auth/change-password", async (route) => {
      change = true;
      await route.fulfill({ json: {} });
    });
    await page.route("**/api/auth/me", async (route) => {
      if (change) await new Promise((resolve) => setTimeout(resolve, 800));
      await route.fulfill({ json: { ...session, motDePasseAChanger: !change } });
    });
    await page.goto("/planning");
    await expect(page).toHaveURL(/mot-de-passe-impose/);
    await expect(page.getByRole("navigation", { name: langue === "fr" ? "Navigation principale" : "Main navigation" })).toHaveCount(0);
    await page.locator('input[autocomplete="current-password"]').fill("Initial1!");
    const nouveaux = page.locator('input[autocomplete="new-password"]');
    await nouveaux.nth(0).fill("Nouveau2!");
    await nouveaux.nth(1).fill("Nouveau2!");
    await page.locator('button[type="submit"]').click();
    await expect(page).toHaveURL(/\/$/, { timeout: 10000 });
    await expect(page.getByRole("navigation", { name: langue === "fr" ? "Navigation principale" : "Main navigation" })).toBeVisible();
  });

  test(`RM-02 P-124 ${langue} — secret choisi, confirmé et transmis seulement après validation`, async ({ page }) => {
    await page.clock.setFixedTime(new Date("2026-08-11T09:00:00Z"));
    await page.addInitScript((l) => localStorage.setItem("rationarium.langue", l), langue);
    await serveur(page, {
      session: { ...SESSION_ADMIN, permissions: [...SESSION_ADMIN.permissions, "users:reset_password"] },
      reponses: { "/api/utilisateurs": { corps: UTILISATEURS } },
    });
    const envois: unknown[] = [];
    await page.route("**/api/utilisateurs/*/mot-de-passe", async (route) => {
      envois.push(route.request().postDataJSON());
      await route.fulfill({ json: {} });
    });
    await page.goto("/utilisateurs");
    await page.getByRole("button", { name: /Actions.*Camille Roussel/ }).click();
    await page.getByRole("menuitem", { name: langue === "fr" ? "Réinitialiser le mot de passe" : "Reset password" }).click();
    const dialogue = page.getByRole("dialog");
    await expect(dialogue).toBeVisible();
    expect(envois).toHaveLength(0);
    for (const sombre of [false, true]) {
      await page.evaluate((dark) => document.documentElement.classList.toggle("dark", dark), sombre);
      for (const width of [1440, 768]) {
        await page.setViewportSize({ width, height: width === 1440 ? 1000 : 1024 });
        await expect(dialogue).toBeVisible();
        await page.evaluate(async () => {
          await Promise.all(document.getAnimations().map((animation) => animation.finished.catch(() => undefined)));
        });
        expect((await new AxeBuilder({ page }).include('[role="dialog"]').analyze()).violations).toEqual([]);
        await page.screenshot({ path: `../../recette/remediation/rm-02/reset-${langue}-${sombre ? "sombre" : "clair"}-${width}.png` });
      }
    }
    const champs = dialogue.locator('input[autocomplete="new-password"]');
    await champs.nth(0).fill("court");
    await champs.nth(1).fill("court");
    const confirmer = dialogue.getByRole("button", { name: langue === "fr" ? "Réinitialiser le mot de passe" : "Reset password", exact: true });
    await confirmer.click();
    expect(envois).toHaveLength(0);
    await champs.nth(0).fill("Provisoire2!");
    await champs.nth(1).fill("Different3!");
    await confirmer.click();
    expect(envois).toHaveLength(0);
    await champs.nth(1).fill("Provisoire2!");
    await confirmer.click();
    await expect(dialogue).toHaveCount(0);
    expect(envois).toEqual([{ nouveau: "Provisoire2!" }]);
  });
}

for (const langue of ["fr", "en"] as const) {
  test(`RM-02 P-124 ${langue} — motif administrateur daté, deux thèmes et largeurs`, async ({ page }) => {
    await page.addInitScript((l) => localStorage.setItem("rationarium.langue", l), langue);
    await serveur(page, { session: {
      ...SESSION_ADMIN,
      motDePasseAChanger: true,
      motifChangementMotDePasse: "administrateur",
      motDePasseReinitialiseLe: "2026-09-10T10:00:00.000Z",
    } });
    await page.goto("/mot-de-passe-impose");
    await expect(page.getByText(langue === "fr" ? /réinitialisé par un administrateur le 10\/09\/2026/ : /An administrator reset your password on 10\/09\/2026/)).toBeVisible();
    for (const sombre of [false, true]) {
      await page.evaluate((dark) => document.documentElement.classList.toggle("dark", dark), sombre);
      for (const width of [1440, 768]) {
        await page.setViewportSize({ width, height: width === 1440 ? 1000 : 1024 });
        await page.evaluate(async () => {
          await Promise.all(document.getAnimations().map((animation) => animation.finished.catch(() => undefined)));
        });
        expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
        await page.screenshot({ path: `../../recette/remediation/rm-02/impose-admin-${langue}-${sombre ? "sombre" : "clair"}-${width}.png` });
      }
    }
  });

  test(`RM-02 P-124 ${langue} — clavier menu, piège de focus, Échap et retour`, async ({ page }) => {
    await page.addInitScript((l) => localStorage.setItem("rationarium.langue", l), langue);
    await serveur(page, {
      session: { ...SESSION_ADMIN, permissions: [...SESSION_ADMIN.permissions, "users:reset_password"] },
      reponses: { "/api/utilisateurs": { corps: UTILISATEURS } },
    });
    await page.goto("/utilisateurs");
    const declencheur = page.getByRole("button", { name: /Actions.*Camille Roussel/ });
    await declencheur.focus();
    await page.keyboard.press("Enter");
    const action = page.getByRole("menuitem", { name: langue === "fr" ? "Réinitialiser le mot de passe" : "Reset password" });
    await action.focus();
    await page.keyboard.press("Enter");
    const dialogue = page.getByRole("dialog");
    await expect(dialogue).toBeVisible();
    const premier = dialogue.getByRole("button").first();
    await expect(premier).toBeFocused();
    await page.keyboard.press("Shift+Tab");
    await expect(dialogue.getByRole("button").last()).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(premier).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(dialogue).toHaveCount(0);
    await expect(declencheur).toBeFocused();
  });
}
