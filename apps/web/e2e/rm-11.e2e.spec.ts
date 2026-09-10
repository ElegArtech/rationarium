import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { serveur } from "./fixtures/projets.js";
import {
  GANTT,
  SESSION_RAPPORTS,
  VUE_ENSEMBLE,
  VUE_ENSEMBLE_JEUNE,
  VUE_ENSEMBLE_VIDE,
} from "./fixtures/rapports.js";

const MOMENT_FIGE = new Date("2026-08-11T09:00:00Z");

const vueAvecVolumetrie = (nombre: 6 | 12) => ({
  ...VUE_ENSEMBLE,
  progression: {
    ...VUE_ENSEMBLE.progression,
    projets: VUE_ENSEMBLE.progression.projets.slice(0, nombre),
    total: nombre,
  },
  sante: Array.from({ length: nombre }, (_, index) => ({
    ...VUE_ENSEMBLE.sante[index % VUE_ENSEMBLE.sante.length]!,
    id: `vol-${nombre}-${index + 1}`,
    nom: `${VUE_ENSEMBLE.sante[index % VUE_ENSEMBLE.sante.length]!.nom} ${index + 1}`,
  })),
});

for (const langue of ["fr", "en"] as const) {
  test.describe(`RM-11 ${langue}`, () => {
    test.beforeEach(async ({ page }) => {
      await page.clock.setFixedTime(MOMENT_FIGE);
      await page.addInitScript(l => localStorage.setItem("rationarium.langue", l), langue);
    });

    test(`RM-11 P-84 ${langue} l'alerte chiffrée donne la suite exacte`, async ({ page }) => {
      await serveur(page, {
        session: { ...SESSION_RAPPORTS, langue },
        reponses: {
          "/api/rapports": { corps: VUE_ENSEMBLE },
          "/api/rapports/gantt": { corps: GANTT },
        },
      });
      await page.goto("/rapports");
      const alerte = page.locator('.alert[role="status"]');
      await expect(alerte).toContainText(
        langue === "fr"
          ? "Consultez la page Tâches pour plus de détails."
          : "See the Tasks page for more details.",
      );
      const lien = alerte.getByRole("link", {
        name: langue === "fr" ? "Ouvrir les tâches" : "Open tasks",
      });
      await expect(lien).toHaveAttribute("href", "/taches?retard=1");
    });

    test(`RM-11 P-112 ${langue} quatre échelles sans graduation tronquée`, async ({ page }) => {
      await serveur(page, {
        session: { ...SESSION_RAPPORTS, langue },
        reponses: {
          "/api/rapports": { corps: VUE_ENSEMBLE },
          "/api/rapports/gantt": { corps: GANTT },
        },
      });
      await page.goto("/rapports");
      await page.getByRole("button", {
        name: langue === "fr" ? "Gantt portefeuille" : "Portfolio Gantt",
      }).click();
      const noms = langue === "fr"
        ? ["Jour", "Semaine", "Mois", "Trimestre"]
        : ["Day", "Week", "Month", "Quarter"];
      await expect(page.getByRole("button", { name: noms[2]!, exact: true })).toHaveAttribute("aria-pressed", "true");
      for (const nom of noms) {
        await page.getByRole("group", {
          name: langue === "fr" ? "Échelle de temps" : "Time scale",
        }).getByRole("button", { name: nom, exact: true }).click();
        const mesures = await page.locator(".pg-m").evaluateAll(elements =>
          elements.map(element => ({ visible: element.clientWidth, requis: element.scrollWidth })),
        );
        expect(mesures.length).toBeGreaterThan(1);
        expect(
          mesures.filter(m => m.requis > m.visible + 1).map(m => ({ echelle: nom, ...m })),
        ).toEqual([]);
        for (const sombre of [false, true]) {
          await page.evaluate(dark => document.documentElement.classList.toggle("dark", dark), sombre);
          await page.waitForTimeout(180);
          for (const width of [1440, 768]) {
            await page.setViewportSize({ width, height: 1024 });
            expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
            await page.screenshot({
              path: `../../recette/remediation/rm-11/reprise/gantt-${nom.toLowerCase()}-${langue}-${sombre ? "sombre" : "clair"}-${width}.png`,
              fullPage: true,
            });
          }
        }
      }
    });

    for (const nombre of [12, 6] as const) {
      test(`RM-11 vue 30 volumétrie ${nombre} projets ${langue}`, async ({ page }) => {
        await serveur(page, {
          session: { ...SESSION_RAPPORTS, langue },
          reponses: {
            "/api/rapports": { corps: vueAvecVolumetrie(nombre) },
            "/api/rapports/gantt": { corps: GANTT },
          },
        });
        await page.goto("/rapports");
        await expect(page.getByText(
          langue === "fr" ? `${nombre} suivis` : `${nombre} tracked`,
          { exact: true },
        )).toBeVisible();
        for (const sombre of [false, true]) {
          await page.evaluate(dark => document.documentElement.classList.toggle("dark", dark), sombre);
          await page.waitForTimeout(180);
          for (const width of [1440, 768]) {
            await page.setViewportSize({ width, height: 1024 });
            expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
            await page.screenshot({
              path: `../../recette/remediation/rm-11/reprise/volumetrie-${nombre}-${langue}-${sombre ? "sombre" : "clair"}-${width}.png`,
              fullPage: true,
            });
          }
        }
      });
    }

    test(`RM-11 P-113 ${langue} propose un vrai XLSX avec filtres et langue`, async ({ page }) => {
      const responsable = VUE_ENSEMBLE.sante[0]!.chef!.id;
      await serveur(page, {
        session: { ...SESSION_RAPPORTS, langue },
        reponses: {
          "/api/rapports": { corps: VUE_ENSEMBLE },
          [`/api/rapports?periode=mois&responsables=${responsable}`]: { corps: VUE_ENSEMBLE },
          "/api/rapports/gantt": { corps: GANTT },
        },
      });
      await page.goto("/rapports");
      await page.getByLabel(langue === "fr" ? "Responsable" : "Lead", { exact: true }).selectOption(responsable);
      await page.getByRole("button", { name: langue === "fr" ? "Exporter" : "Export" }).click();
      const excel = page.getByRole("menuitem", { name: "Excel (.xlsx)" });
      await expect(excel).toBeVisible();
      const href = await excel.getAttribute("href");
      expect(href).toContain("format=xlsx");
      expect(href).toContain(`responsables=${responsable}`);
      expect(href).toContain(`langue=${langue}`);
      await expect(page.getByRole("menuitem", { name: "JSON" })).toBeVisible();
      await expect(page.getByRole("menuitem", {
        name: langue === "fr" ? "PDF (impression)" : "PDF (print)",
      })).toBeVisible();
    });

    test(`RM-11 tendance restreinte ${langue} nomme la confidentialité avant l'historique court`, async ({ page }) => {
      const tendance = {
        ...VUE_ENSEMBLE.tendance,
        accesRestreint: true,
        historiqueSuffisant: false,
        points: [],
      };
      await serveur(page, {
        session: { ...SESSION_RAPPORTS, langue },
        reponses: {
          "/api/rapports": { corps: { ...VUE_ENSEMBLE, tendance } },
          "/api/rapports/gantt": { corps: GANTT },
        },
      });
      await page.goto("/rapports");
      await page.getByRole("button", {
        name: langue === "fr" ? "Analytics avancés" : "Advanced analytics",
      }).click();
      await expect(page.getByText(
        langue === "fr" ? "Historique partiellement accessible" : "Partially accessible history",
        { exact: true },
      )).toBeVisible();
      await expect(page.getByText(
        langue === "fr" ? "Historique en cours de construction" : "History still being built",
        { exact: true },
      )).toHaveCount(0);
    });

    for (const [etat, corps, statut] of [
      ["nominal", VUE_ENSEMBLE, 200],
      ["vide", VUE_ENSEMBLE_VIDE, 200],
      ["historique-court", VUE_ENSEMBLE_JEUNE, 200],
      ["erreur", {}, 500],
    ] as const) {
      test(`RM-11 vue 30 ${etat} ${langue} — deux thèmes et deux largeurs`, async ({ page }) => {
        await serveur(page, {
          session: { ...SESSION_RAPPORTS, langue },
          reponses: {
            "/api/rapports": { corps, statut },
            "/api/rapports/gantt": { corps: GANTT },
          },
        });
        await page.goto("/rapports");
        if (etat === "erreur") {
          await expect(page.getByText(
            langue === "fr"
              ? "Impossible de charger les données analytiques."
              : "Analytics data could not be loaded.",
          )).toBeVisible();
        } else {
          await expect(page.getByRole("heading", {
            name: langue === "fr" ? "Rapports & analytics" : "Reports & analytics",
          })).toBeVisible();
        }
        for (const sombre of [false, true]) {
          await page.evaluate(dark => document.documentElement.classList.toggle("dark", dark), sombre);
          await page.waitForTimeout(180);
          for (const width of [1440, 768]) {
            await page.setViewportSize({ width, height: 1024 });
            expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
            await page.screenshot({
              path: `../../recette/remediation/rm-11/reprise/vue30-${etat}-${langue}-${sombre ? "sombre" : "clair"}-${width}.png`,
              fullPage: true,
            });
          }
        }
      });
    }
  });
}
