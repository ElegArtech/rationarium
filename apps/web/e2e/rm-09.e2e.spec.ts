import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { serveur } from "./fixtures/projets.js";
import {
  IMPACT_BLOQUE,
  SESSION_ADMIN_ROLES,
  UTILISATEURS,
} from "./fixtures/administration.js";
import { ROLES } from "./fixtures/parametrage.js";
import { FICHE_TIERS, SESSION_REFERENTIELS } from "./fixtures/referentiels.js";
import { FICHE } from "./fixtures/taches.js";

const MOMENT_FIGE = new Date("2026-09-10T10:00:00Z");

for (const langue of ["fr", "en"] as const) {
  test.describe(`RM-09 ${langue}`, () => {
    test.beforeEach(async ({ page }) => {
      await page.clock.setFixedTime(MOMENT_FIGE);
      await page.addInitScript(l => localStorage.setItem("rationarium.langue", l), langue);
    });

    test(`RM-09 P-128 ${langue} initialise le référentiel vide après confirmation`, async ({ page }) => {
      let initialise = false;
      let corps: unknown = null;
      await serveur(page, { session: { ...SESSION_ADMIN_ROLES, langue } });
      await page.route(
        url => url.pathname === "/api/administration/roles",
        route => route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(initialise ? ROLES : []),
        }),
      );
      await page.route(
        url => url.pathname === "/api/administration/roles/initialiser",
        async route => {
          corps = route.request().postDataJSON();
          initialise = true;
          await route.fulfill({
            status: 201,
            contentType: "application/json",
            body: JSON.stringify({ crees: 2, existants: 0, collisions: [] }),
          });
        },
      );

      await page.goto("/roles");
      await expect(page.getByText(langue === "fr" ? "Aucun rôle configuré" : "No role configured")).toBeVisible();
      await page.getByRole("button", {
        name: langue === "fr" ? "Initialiser le référentiel" : "Initialise the catalogue",
      }).click();
      await expect(page.getByRole("dialog")).toContainText(
        langue === "fr" ? "Les modèles manquants seront ajoutés" : "Missing templates will be added",
      );
      await expect.poll(() => corps).toBeNull();
      await page.getByRole("button", {
        name: langue === "fr" ? "Confirmer l’initialisation" : "Confirm initialisation",
      }).click();
      await expect.poll(() => corps).toEqual({ confirmer: true });
      await expect(page.getByText(langue === "fr" ? "Administrateur" : "Administrator", { exact: true }).first()).toBeVisible();
    });

    test(`RM-09 P-128 collision ${langue} rend le compte rendu incomplet explicite`, async ({ page }) => {
      await serveur(page, { session: { ...SESSION_ADMIN_ROLES, langue } });
      await page.route(
        url => url.pathname === "/api/administration/roles",
        route => route.fulfill({ status: 200, contentType: "application/json", body: "[]" }),
      );
      await page.route(
        url => url.pathname === "/api/administration/roles/initialiser",
        route => route.fulfill({
          status: 201,
          contentType: "application/json",
          body: JSON.stringify({
            crees: 25,
            existants: 0,
            collisions: [{ code: "ADMIN", roleId: "role-personnalise" }],
          }),
        }),
      );
      await page.goto("/roles");
      await page.getByRole("button", {
        name: langue === "fr" ? "Initialiser le référentiel" : "Initialise the catalogue",
      }).click();
      await page.getByRole("button", {
        name: langue === "fr" ? "Confirmer l’initialisation" : "Confirm initialisation",
      }).click();
      await expect(page.getByRole("alert")).toContainText(
        langue === "fr"
          ? "le code réservé ADMIN est déjà utilisé par un rôle personnalisé"
          : "reserved code ADMIN is already used by a custom role",
      );
    });

    test(`RM-09 P-121 ${langue} confirme le compte nommé et transporte sa version`, async ({ page }) => {
      let corps: unknown = null;
      await serveur(page, {
        session: { ...SESSION_ADMIN_ROLES, langue },
        reponses: {
          "/api/utilisateurs": { corps: UTILISATEURS },
          "/api/administration/roles": { corps: ROLES },
          "/api/organisation": { corps: { directions: [], departementsSansDirection: [], departements: [] } },
        },
      });
      await page.route(
        url => url.pathname === "/api/utilisateurs/u-autre/desactiver",
        async route => {
          corps = route.request().postDataJSON();
          await route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
        },
      );
      await page.goto("/utilisateurs");
      await page.getByRole("button", {
        name: langue === "fr" ? "Actions pour Camille Roussel" : "Actions for Camille Roussel",
      }).click();
      await page.getByRole("menuitem", {
        name: langue === "fr" ? "Désactiver le compte" : "Deactivate account",
      }).click();
      const dialogue = page.getByRole("dialog");
      await expect(dialogue).toContainText("Camille Roussel");
      expect(corps).toBeNull();
      await dialogue.getByRole("button", {
        name: langue === "fr" ? "Confirmer la désactivation" : "Confirm deactivation",
      }).click();
      await expect.poll(() => corps).toEqual({ version: 1 });
    });

    test(`RM-09 P-123 ${langue} traduit les codes de blocage`, async ({ page }) => {
      await serveur(page, {
        session: { ...SESSION_ADMIN_ROLES, langue },
        reponses: {
          "/api/utilisateurs": { corps: UTILISATEURS },
          "/api/utilisateurs/u-autre/impact": { corps: IMPACT_BLOQUE },
          "/api/administration/roles": { corps: ROLES },
          "/api/organisation": { corps: { directions: [], departementsSansDirection: [], departements: [] } },
        },
      });
      await page.goto("/utilisateurs");
      await page.getByRole("button", {
        name: langue === "fr" ? "Actions pour Camille Roussel" : "Actions for Camille Roussel",
      }).click();
      await page.getByRole("menuitem", {
        name: langue === "fr" ? "Supprimer définitivement" : "Delete permanently",
      }).click();
      await expect(page.getByRole("dialog")).toContainText(
        langue === "fr" ? "Saisies de temps" : "Time entries",
      );
    });

    test(`RM-09 P-122 ${langue} explique au focus pourquoi son propre compte est protégé`, async ({ page }) => {
      await serveur(page, {
        session: { ...SESSION_ADMIN_ROLES, langue },
        reponses: {
          "/api/utilisateurs": { corps: UTILISATEURS },
          "/api/administration/roles": { corps: ROLES },
          "/api/organisation": { corps: { directions: [], departementsSansDirection: [], departements: [] } },
        },
      });
      await page.goto("/utilisateurs");
      await page.getByRole("button", {
        name: langue === "fr" ? "Actions pour Hugo Nguyen" : "Actions for Hugo Nguyen",
      }).click();
      const interdit = page.getByRole("menuitem", {
        name: langue === "fr"
          ? /Désactiver le compte.*Vous ne pouvez pas vous désactiver vous-même/
          : /Deactivate account.*You cannot deactivate yourself/,
      });
      await expect(interdit).toHaveAttribute("aria-disabled", "true");
      // Le menu place le focus sur sa première action. Deux flèches atteignent
      // réellement l'action protégée ; un `.focus()` direct masquerait une
      // option que React Aria aurait retirée de la navigation clavier.
      await page.keyboard.press("ArrowDown");
      await page.keyboard.press("ArrowDown");
      await expect(interdit).toBeFocused();
    });

    test(`RM-09 vue 27 ${langue} garde sa grille lisible à deux largeurs et deux thèmes`, async ({ page }) => {
      const utilisateursLongs = Array.from({ length: 32 }, (_, index) => ({
        ...UTILISATEURS[index % UTILISATEURS.length]!,
        id: `u-grille-${index}`,
        email: `agent.${index}@exemple.fr`,
        identifiant: `agent.${index}`,
      }));
      await serveur(page, {
        session: { ...SESSION_ADMIN_ROLES, langue },
        reponses: {
          "/api/utilisateurs": { corps: utilisateursLongs },
          "/api/administration/roles": { corps: ROLES },
          "/api/organisation": { corps: { directions: [], departementsSansDirection: [], departements: [] } },
        },
      });
      await page.goto("/utilisateurs");
      const grille = page.getByRole("region", {
        name: langue === "fr" ? "Liste des utilisateurs" : "User list",
      });
      await expect(grille).toBeVisible();
      for (const sombre of [false, true]) {
        await page.evaluate(dark => document.documentElement.classList.toggle("dark", dark), sombre);
        await page.waitForTimeout(180);
        for (const width of [1440, 768]) {
          await page.setViewportSize({ width, height: 1024 });
          const dimensions = await grille.evaluate(element => ({
            client: element.clientWidth,
            scroll: element.scrollWidth,
          }));
          if (width === 768) {
            expect(dimensions.scroll).toBeGreaterThan(dimensions.client);
            const premiereColonne = grille.locator(".us-row .us-who").first();
            const avant = await premiereColonne.boundingBox();
            await grille.evaluate(element => { element.scrollLeft = 280; });
            const apres = await premiereColonne.boundingBox();
            expect(avant).not.toBeNull();
            expect(apres).not.toBeNull();
            expect(Math.abs((apres?.x ?? 0) - (avant?.x ?? 0))).toBeLessThan(16);
            await grille.evaluate(element => { element.scrollLeft = 0; });
          }
          const entete = grille.locator(".us-head");
          const vertical = await grille.evaluate(element => ({
            client: element.clientHeight,
            scroll: element.scrollHeight,
          }));
          expect(vertical.scroll).toBeGreaterThan(vertical.client);
          const hautAvant = await entete.boundingBox();
          await grille.evaluate(element => { element.scrollTop = 420; });
          const hautApres = await entete.boundingBox();
          expect(hautAvant).not.toBeNull();
          expect(hautApres).not.toBeNull();
          expect(Math.abs((hautApres?.y ?? 0) - (hautAvant?.y ?? 0))).toBeLessThan(2);
          await grille.evaluate(element => { element.scrollTop = 0; });
          await grille.focus();
          await expect(grille).toBeFocused();
          expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
          await page.screenshot({
            path: `../../recette/remediation/rm-09/reprise/utilisateurs-${langue}-${sombre ? "sombre" : "clair"}-${width}.png`,
          });
        }
      }
    });

    test(`RM-09 P-139 ${langue} ouvre la tâche d’un tiers et conserve le retour`, async ({ page }) => {
      await serveur(page, {
        session: { ...SESSION_REFERENTIELS, langue },
        reponses: {
          [`/api/tiers/${FICHE_TIERS.id}`]: { corps: FICHE_TIERS },
          "/api/taches/k1": { corps: { ...FICHE, id: "k1", titre: "Audit d'accessibilité" } },
        },
      });
      await page.goto(`/tiers/${FICHE_TIERS.id}`);
      await page.getByRole("link", { name: /Audit d'accessibilité/ }).click();
      await expect(page).toHaveURL(new RegExp(`/taches/k1\\?retour=%2Ftiers%2F${FICHE_TIERS.id}$`));
      await expect(page.getByRole("heading", { name: "Audit d'accessibilité" })).toBeVisible();
    });
  });
}
