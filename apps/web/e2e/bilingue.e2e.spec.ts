import { test, expect, type Page } from "@playwright/test";
import { serveur, SESSION } from "./fixtures/projets.js";
import { SESSION_PLANNING, SEMAINE } from "./fixtures/planning.js";

/**
 * L-28 — l'audit bilingue.
 *
 * Trois questions, et aucune n'est couverte par `i18n:check`, qui compte des
 * clés et ne regarde jamais l'écran :
 *
 * 1. **Les libellés changent-ils vraiment de langue ?** Une clé présente dans
 *    les deux catalogues peut n'être jamais employée.
 * 2. **`RG-GEN-09` — les formats suivent-ils le paramétrage global ?** Ils
 *    étaient enregistrés par la vue 31 et appliqués nulle part.
 * 3. **`cadrage/02 § D.7` — l'anglais est 30 % plus long.** Aucune largeur ne
 *    doit être calée sur le français : un libellé tronqué en anglais est un
 *    défaut de conception, pas un accident de traduction.
 */

const MOMENT = new Date("2026-08-12T09:00:00.000Z");

async function enAnglais(page: Page) {
  await page.getByRole("button", { name: "EN", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
}

/** Un élément est-il tronqué ? Son contenu déborde-t-il de sa boîte ? */
async function tronques(page: Page, selecteur: string): Promise<string[]> {
  return page.evaluate((sel) => {
    const coupes: string[] = [];
    for (const e of document.querySelectorAll<HTMLElement>(sel)) {
      // `scrollWidth > clientWidth` signale un débordement horizontal. La
      // tolérance d'un pixel absorbe les arrondis de rendu.
      if (e.scrollWidth > e.clientWidth + 1 && (e.textContent ?? "").trim().length > 0) {
        coupes.push(`${e.className} · ${(e.textContent ?? "").trim().slice(0, 40)}`);
      }
    }
    return coupes;
  }, selecteur);
}

test.describe("Le basculement de langue", () => {
  test("il change les libellés SANS RECHARGER la page", async ({ page }) => {
    await serveur(page, { session: SESSION, reponses: {} });
    await page.goto("/profil");

    await expect(page.getByRole("navigation", { name: "Navigation principale" })).toBeVisible();
    await enAnglais(page);

    // La navigation est le premier repère : si elle ne bascule pas, rien ne
    // bascule.
    await expect(page.getByRole("navigation", { name: "Main navigation" })).toBeVisible();
  });

  test("le choix survit au changement de vue", async ({ page }) => {
    await page.clock.setFixedTime(MOMENT);
    await serveur(page, {
      session: SESSION_PLANNING,
      reponses: { "/api/planning": { corps: SEMAINE } },
    });
    await page.goto("/profil");
    await enAnglais(page);

    await page.goto("/planning");
    // Une langue qui se réinitialise à chaque navigation est pire qu'une
    // absence de bilinguisme : elle se remarque en permanence.
    await expect(page.getByRole("heading", { name: "Resource schedule", level: 1 })).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
  });
});

test.describe("cadrage/02 § D.7 — L'ANGLAIS EST 30 % PLUS LONG", () => {
  const vues = [
    { nom: "planning", chemin: "/planning" },
    { nom: "profil", chemin: "/profil" },
  ];

  for (const vue of vues) {
    test(`aucun libellé n'est tronqué en anglais — ${vue.nom}`, async ({ page }) => {
      await page.clock.setFixedTime(MOMENT);
      await serveur(page, {
        session: SESSION_PLANNING,
        reponses: { "/api/planning": { corps: SEMAINE } },
      });
      await page.goto(vue.chemin);
      await enAnglais(page);
      await page.waitForLoadState("networkidle");

      // Les éléments dont la largeur est contrainte par la mise en page : ce
      // sont eux qui coupent. Les cellules de grille ont une troncature
      // ASSUMÉE — elles portent `text-overflow: ellipsis` et leur contenu
      // complet est dans le libellé d'assistance —, elles sont donc exclues.
      const coupes = await tronques(
        page,
        ".nav-item span, .chip-btn, .btn, .eyebrow, .panel-title, .kpi-sub, .layer span",
      );
      expect(coupes).toEqual([]);
    });
  }
});

test.describe("RG-GEN-09 — les formats suivent le paramétrage global", () => {
  const reglages = {
    "display.dateFormat": "AAAA-MM-JJ",
    "display.timeFormat": "12h",
    "planning.visibleDays": "1,2,3,4,5",
  };

  test("LE FORMAT DE DATE CHOISI S'APPLIQUE — il était enregistré et inerte", async ({ page }) => {
    await page.clock.setFixedTime(MOMENT);
    await serveur(page, {
      session: SESSION_PLANNING,
      reponses: {
        "/api/planning": { corps: SEMAINE },
        "/api/parametrage": { corps: reglages },
      },
    });
    await page.goto("/planning");

    // La barre d'outils affiche la période : c'est le premier endroit où le
    // format se voit.
    await expect(page.locator(".pl-period")).toContainText("2026-08-10");
  });

  test("RG-PLN-03 — les jours visibles suivent le réglage", async ({ page }) => {
    await page.clock.setFixedTime(MOMENT);
    await serveur(page, {
      session: SESSION_PLANNING,
      reponses: {
        "/api/planning": { corps: SEMAINE },
        "/api/parametrage": { corps: { ...reglages, "planning.visibleDays": "1,2,3" } },
      },
    });
    await page.goto("/planning");

    // Trois jours demandés, trois colonnes rendues — plus la colonne des
    // ressources et la ligne de synthèse.
    await expect(page.locator(".pl-head")).toHaveCount(3);
  });

  test("tous les jours quand le réglage les demande", async ({ page }) => {
    await page.clock.setFixedTime(MOMENT);
    await serveur(page, {
      session: SESSION_PLANNING,
      reponses: {
        "/api/planning": { corps: SEMAINE },
        "/api/parametrage": { corps: { ...reglages, "planning.visibleDays": "0,1,2,3,4,5,6" } },
      },
    });
    await page.goto("/planning");
    await expect(page.locator(".pl-head")).toHaveCount(7);
  });

  test("sans réglage servi, le produit garde ses défauts", async ({ page }) => {
    await page.clock.setFixedTime(MOMENT);
    await serveur(page, {
      session: SESSION_PLANNING,
      reponses: { "/api/planning": { corps: SEMAINE } },
    });
    await page.goto("/planning");

    // Le paramétrage peut être indisponible — droit manquant, panne — et la
    // vue doit rester juste : semaine ouvrée, date française.
    await expect(page.locator(".pl-head")).toHaveCount(5);
    await expect(page.locator(".pl-period")).toContainText("10/08/2026");
  });
});
