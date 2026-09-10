import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { serveur, PROJET, SESSION } from "./fixtures/projets.js";
import { FICHE, TACHE_PROJET } from "./fixtures/taches.js";

const MOMENT_FIGE = new Date("2026-09-10T09:00:00Z");
const SESSION_RECHERCHE = {
  ...SESSION,
  permissions: [...new Set([...SESSION.permissions, "projects:read", "tasks:read"])],
};

for (const langue of ["fr", "en"] as const) {
  test.describe(`RM-13 ${langue}`, () => {
    test.beforeEach(async ({ page }) => {
      await page.clock.setFixedTime(MOMENT_FIGE);
      await page.addInitScript(l => localStorage.setItem("rationarium.langue", l), langue);
    });

    test(`RM-13 P-144 ${langue} recherche globale groupée, navigable et vide explicite`, async ({ page }) => {
      await serveur(page, {
        session: { ...SESSION_RECHERCHE, langue },
        reponses: {
          "/api/recherche?terme=Maquette": {
            corps: {
              terme: "Maquette",
              total: 2,
              projets: [{ id: PROJET.id, nom: PROJET.nom, destination: `/projets/${PROJET.id}` }],
              taches: [{
                id: FICHE.id,
                titre: FICHE.titre,
                destination: `/taches/${FICHE.id}`,
                projet: { id: PROJET.id, nom: PROJET.nom },
              }],
            },
          },
          "/api/recherche?terme=Introuvable": {
            corps: { terme: "Introuvable", total: 0, projets: [], taches: [] },
          },
          [`/api/taches/${FICHE.id}`]: { corps: FICHE },
        },
      });
      await page.goto("/");

      const recherche = page.getByRole("searchbox", {
        name: langue === "fr" ? "Recherche globale" : "Global search",
      });
      await recherche.fill("Maquette");
      await recherche.press("Enter");
      const resultats = page.getByRole("region", {
        name: langue === "fr"
          ? "Résultats de recherche pour « Maquette »"
          : "Search results for “Maquette”",
      });
      await expect(resultats.getByRole("heading", { name: langue === "fr" ? "Projets" : "Projects" })).toBeVisible();
      await expect(resultats.getByRole("heading", { name: langue === "fr" ? "Tâches" : "Tasks" })).toBeVisible();
      await expect(resultats.getByRole("link", { name: FICHE.titre })).toBeVisible();
      await resultats.getByRole("link", { name: FICHE.titre }).click();
      await expect(page).toHaveURL(new RegExp(`/taches/${FICHE.id}`));
      await expect(page.getByRole("heading", { name: FICHE.titre })).toBeVisible();

      await page.goto("/");
      await recherche.fill("Introuvable");
      await recherche.press("Enter");
      await expect(page.getByText(
        langue === "fr"
          ? "Aucun projet ni aucune tâche visible ne correspond à « Introuvable »."
          : "No visible project or task matches “Introuvable”.",
        { exact: true },
      )).toBeVisible();
      await expect(recherche).toHaveValue("Introuvable");
    });

    test(`RM-13 P-147 ${langue} l'URL restaure filtres, résultat et retour de fiche`, async ({ page }) => {
      const listeFiltree = `/api/taches?projectId=${PROJET.id}&statut=doing`;
      await serveur(page, {
        session: { ...SESSION_RECHERCHE, langue },
        reponses: {
          "/api/taches": { corps: [TACHE_PROJET] },
          [`/api/taches?projectId=${PROJET.id}`]: { corps: [TACHE_PROJET] },
          [listeFiltree]: { corps: [TACHE_PROJET] },
          "/api/projets": { corps: { projets: [PROJET], affiches: 1, total: 1 } },
          [`/api/taches/${FICHE.id}`]: { corps: FICHE },
        },
      });
      await page.goto("/taches");

      const recherche = page.getByRole("searchbox", {
        name: langue === "fr" ? "Rechercher une tâche…" : "Search a task…",
      });
      await recherche.fill("Rédiger");
      await page.getByLabel(langue === "fr" ? "Projet" : "Project", { exact: true }).selectOption(PROJET.id);
      await page.getByLabel(langue === "fr" ? "Statut" : "Status", { exact: true }).selectOption("doing");
      await expect(page).toHaveURL(new RegExp(`q=R%C3%A9diger.*projectId=${PROJET.id}.*statut=doing`));
      await expect(page.getByRole("link", { name: TACHE_PROJET.titre })).toHaveCount(1);
      const adresseFiltree = new URL(page.url()).pathname + new URL(page.url()).search;

      await page.getByRole("link", { name: TACHE_PROJET.titre }).click();
      await expect(page.getByRole("heading", { name: FICHE.titre })).toBeVisible();
      for (const sombre of [false, true]) {
        await page.evaluate(dark => document.documentElement.classList.toggle("dark", dark), sombre);
        for (const width of [1440, 768]) {
          await page.setViewportSize({ width, height: 1024 });
          expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
          await page.screenshot({
            path: `../../recette/remediation/rm-13/reprise/vue17-retour-${langue}-${sombre ? "sombre" : "clair"}-${width}.png`,
            fullPage: true,
          });
        }
      }
      await page.getByRole("button", {
        name: langue === "fr" ? "Retour aux tâches" : "Back to tasks",
      }).click();
      await expect(page).toHaveURL(new RegExp(`q=R%C3%A9diger.*projectId=${PROJET.id}.*statut=doing`));
      await expect(recherche).toHaveValue("Rédiger");
      await expect(page.getByLabel(langue === "fr" ? "Projet" : "Project", { exact: true })).toHaveValue(PROJET.id);
      await expect(page.getByLabel(langue === "fr" ? "Statut" : "Status", { exact: true })).toHaveValue("doing");
      await expect(page.getByRole("link", { name: TACHE_PROJET.titre })).toHaveCount(1);
      for (const sombre of [false, true]) {
        await page.evaluate(dark => document.documentElement.classList.toggle("dark", dark), sombre);
        for (const width of [1440, 768]) {
          await page.setViewportSize({ width, height: 1024 });
          expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
          await page.screenshot({
            path: `../../recette/remediation/rm-13/reprise/vue16-retour-filtre-${langue}-${sombre ? "sombre" : "clair"}-${width}.png`,
            fullPage: true,
          });
        }
      }

      await page.goto(adresseFiltree);
      await expect(recherche).toHaveValue("Rédiger");
      await expect(page.getByLabel(langue === "fr" ? "Projet" : "Project", { exact: true })).toHaveValue(PROJET.id);
      await expect(page.getByLabel(langue === "fr" ? "Statut" : "Status", { exact: true })).toHaveValue("doing");
      await expect(page.getByRole("link", { name: TACHE_PROJET.titre })).toHaveCount(1);
    });

    test(`RM-13 vue 16 et recherche globale ${langue} — deux thèmes et deux largeurs`, async ({ page }) => {
      await serveur(page, {
        session: { ...SESSION_RECHERCHE, langue },
        reponses: {
          "/api/taches": { corps: [TACHE_PROJET] },
          "/api/projets": { corps: { projets: [PROJET], affiches: 1, total: 1 } },
          "/api/recherche?terme=Maquette": {
            corps: {
              terme: "Maquette",
              total: 2,
              projets: [{ id: PROJET.id, nom: PROJET.nom, destination: `/projets/${PROJET.id}` }],
              taches: [{
                id: FICHE.id,
                titre: FICHE.titre,
                destination: `/taches/${FICHE.id}`,
                projet: { id: PROJET.id, nom: PROJET.nom },
              }],
            },
          },
        },
      });
      await page.goto("/taches");
      const recherche = page.getByRole("searchbox", {
        name: langue === "fr" ? "Recherche globale" : "Global search",
      });
      await recherche.fill("Maquette");
      await recherche.press("Enter");
      await expect(page.getByRole("region", {
        name: langue === "fr"
          ? "Résultats de recherche pour « Maquette »"
          : "Search results for “Maquette”",
      })).toBeVisible();

      for (const sombre of [false, true]) {
        await page.evaluate(dark => document.documentElement.classList.toggle("dark", dark), sombre);
        await page.waitForTimeout(180);
        for (const width of [1440, 768]) {
          await page.setViewportSize({ width, height: 1024 });
          expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
          await page.screenshot({
            path: `../../recette/remediation/rm-13/reprise/recherche-${langue}-${sombre ? "sombre" : "clair"}-${width}.png`,
            fullPage: true,
          });
        }
      }
    });
  });
}
