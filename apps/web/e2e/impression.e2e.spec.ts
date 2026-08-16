import { test, expect, type Page } from "@playwright/test";
import { serveur } from "./fixtures/projets.js";
import { SESSION_PLANNING, SEMAINE, GRILLE_ACTIVITE } from "./fixtures/planning.js";
import { SESSION_RAPPORTS, VUE_ENSEMBLE, GANTT } from "./fixtures/rapports.js";

/**
 * L-27 — l'impression et le PDF.
 *
 * `cadrage/01 § 7` : « le planning et la grille d'activité disposent d'une mise
 * en page imprimable ». `EX-RPT-03` demande un export PDF des rapports — que le
 * produit obtient **par l'impression du navigateur**, décidé au L-22 et refermé
 * ici : générer un second chemin de mise en page ferait diverger deux rendus du
 * même contenu.
 *
 * **Ces contrôles émulent le média d'impression** (`emulateMedia`). C'est la
 * seule façon d'exercer une feuille `@media print` : sans elle, on vérifierait
 * que le CSS existe, pas qu'il s'applique — et un sélecteur mal orthographié
 * passerait indéfiniment.
 */

const MOMENT = new Date("2026-08-12T09:00:00.000Z");

async function enImpression(page: Page) {
  await page.emulateMedia({ media: "print" });
}

test.describe("Vue 07 — le planning imprimé", () => {
  const reponses = { "/api/planning": { corps: SEMAINE } };

  test("L'EN-TÊTE D'IMPRESSION N'EXISTE QU'À L'IMPRESSION", async ({ page }) => {
    await page.clock.setFixedTime(MOMENT);
    await serveur(page, { session: SESSION_PLANNING, reponses });
    await page.goto("/planning");

    // À l'écran, la barre d'outils dit déjà la période : un second bandeau
    // serait du bruit.
    const entete = page.locator(".print-head");
    await expect(entete).toBeHidden();

    await enImpression(page);
    await expect(entete).toBeVisible();
    // Une feuille sans période est inexploitable dès qu'elle a quitté la main
    // de qui l'a imprimée.
    await expect(entete).toContainText(/Semaine du/);
  });

  test("les commandes disparaissent, la grille reste", async ({ page }) => {
    await page.clock.setFixedTime(MOMENT);
    await serveur(page, { session: SESSION_PLANNING, reponses });
    await page.goto("/planning");
    await enImpression(page);

    // Une barre de filtres imprimée consomme du papier et n'agit sur rien.
    await expect(page.locator(".filters")).toBeHidden();
    await expect(page.getByRole("navigation", { name: /navigation principale/i })).toBeHidden();
    await expect(page.getByRole("button", { name: "Imprimer" })).toBeHidden();

    // Ce qui compte survit.
    await expect(page.getByText("Rédiger la note de cadrage").first()).toBeVisible();
    await expect(page.getByText("Hors présentiel")).toBeVisible();
  });

  test("LE CADRE DÉFILANT SE DÉPLIE — sinon la grille est coupée à la page 1", async ({
    page,
  }) => {
    await page.clock.setFixedTime(MOMENT);
    await serveur(page, { session: SESSION_PLANNING, reponses });
    await page.goto("/planning");
    await enImpression(page);

    // `max-height` et `overflow` sont des notions d'écran.
    //
    // La mesure passe par `page.evaluate` et non par un localisateur : celui-ci
    // capture une référence au nœud, et un rendu de React survenu entre-temps
    // la détache — `getComputedStyle` rend alors des chaînes vides, ce qui
    // ressemble à un défaut de style et n'en est pas un.
    // Attendre le nœud AVANT de mesurer : `page.evaluate` ne réessaie pas, et
    // une mesure prise pendant un rendu ne mesure rien.
    await expect(page.locator(".pl-wrap")).toBeVisible();
    const cadre = await page.evaluate(() => {
      const e = document.querySelector(".pl-wrap");
      if (!e) return null;
      const style = getComputedStyle(e);
      return { hauteur: style.maxHeight, debordement: style.overflow };
    });
    expect(cadre?.hauteur).toBe("none");
    expect(cadre?.debordement).toBe("visible");
  });

  test("le jour courant garde sa marque quand il perd sa couleur", async ({ page }) => {
    await page.clock.setFixedTime(MOMENT);
    await serveur(page, { session: SESSION_PLANNING, reponses });
    await page.goto("/planning");
    await enImpression(page);

    // Une imprimante de service est en noir et blanc : un repère porté par la
    // seule couleur disparaît.
    await expect(page.locator(".pl-head.is-today")).toBeVisible();
    const marque = await page.evaluate(() => {
      const e = document.querySelector(".pl-head.is-today .pl-dnum");
      return e ? getComputedStyle(e, "::after").content : null;
    });
    expect(marque).toContain("•");
  });
});

test.describe("Vue 09 — la grille d'activité imprimée", () => {
  const reponses = {
    "/api/planning/activite": { corps: GRILLE_ACTIVITE },
    "/api/planning": { corps: SEMAINE },
  };

  test("elle porte son en-tête et perd ses commandes", async ({ page }) => {
    await page.clock.setFixedTime(MOMENT);
    await serveur(page, { session: SESSION_PLANNING, reponses });
    await page.goto("/planning/activite");
    await enImpression(page);

    await expect(page.locator(".print-head")).toBeVisible();
    // « Ajouter » n'a aucun sens sur papier.
    await expect(page.getByRole("button", { name: /Ajouter des agents/ }).first()).toBeHidden();
    await expect(page.getByText("Permanence accueil")).toBeVisible();
  });
});

test.describe("Vue 30 — les rapports imprimés, et le PDF", () => {
  const reponses = {
    "/api/rapports": { corps: VUE_ENSEMBLE },
    "/api/rapports/gantt": { corps: GANTT },
  };

  test("l'en-tête porte la période — un tableau de chiffres sans période ne dit rien", async ({
    page,
  }) => {
    await serveur(page, { session: SESSION_RAPPORTS, reponses });
    await page.goto("/rapports");
    await enImpression(page);

    await expect(page.locator(".print-head")).toBeVisible();
    await expect(page.locator(".print-head")).toContainText("30 jours");
  });

  test("la barre de contrôle et les onglets disparaissent", async ({ page }) => {
    await serveur(page, { session: SESSION_RAPPORTS, reponses });
    await page.goto("/rapports");
    await enImpression(page);

    await expect(page.locator(".rep-bar")).toBeHidden();
    await expect(page.locator(".tabbar")).toBeHidden();
    // La santé du portefeuille, elle, est ce qu'on emporte en réunion.
    await expect(page.getByText("Portail citoyen").first()).toBeVisible();
  });

  test("RG-RPT-02 — LE TRONCAGE RESTE ANNONCÉ SUR PAPIER", async ({ page }) => {
    await serveur(page, { session: SESSION_RAPPORTS, reponses });
    await page.goto("/rapports");
    await enImpression(page);

    // C'est sur papier qu'il compte le plus : on ne peut plus faire défiler
    // pour constater qu'il manque des projets.
    await expect(page.getByText(/Affichage limité aux 10 premiers projets/)).toBeVisible();
  });
});

test.describe("Le socle d'impression", () => {
  test("ce qui n'existe qu'à l'écran ne consomme pas de papier", async ({ page }) => {
    await page.clock.setFixedTime(MOMENT);
    await serveur(page, {
      session: SESSION_PLANNING,
      reponses: { "/api/planning": { corps: SEMAINE } },
    });
    await page.goto("/planning");
    await enImpression(page);

    // Le lien d'évitement et la file de messages sont des dispositifs d'écran.
    await expect(page.locator(".skip")).toBeHidden();
    await expect(page.locator(".toasts")).toBeHidden();
  });

  test("les adresses ne sont PAS déployées après les liens", async ({ page }) => {
    await page.clock.setFixedTime(MOMENT);
    await serveur(page, {
      session: SESSION_PLANNING,
      reponses: { "/api/planning": { corps: SEMAINE } },
    });
    await page.goto("/planning");
    await enImpression(page);

    // Sur un planning, une URL par lien couvrirait la grille de texte illisible.
    const suffixe = await page.evaluate(() => {
      const e = document.querySelector("a[href]");
      return e ? getComputedStyle(e, "::after").content : "none";
    });
    expect(suffixe === "none" || suffixe === '""' || suffixe === "").toBe(true);
  });
});
