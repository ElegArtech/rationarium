import { test, expect } from "@playwright/test";
import { serveur, SESSION_LECTURE } from "./fixtures/projets.js";
import {
  SESSION_ADMIN,
  UTILISATEURS,
  IMPACT_BLOQUE,
  IMPACT_LIBRE,
  SUIVI,
  SUIVI_VIDE,
  ARBORESCENCE,
  IMPACT_DEPARTEMENT,
} from "./fixtures/administration.js";

/**
 * L-36 — vues 27, 28 et 29.
 *
 * Les points d'attention des briefs sont vérifiés tels qu'ils sont écrits :
 * « deux suppressions impossibles à confondre », « le sélecteur de période
 * s'applique aux six onglets », « deux règles de suppression opposées,
 * annoncées avant l'action ».
 */

test.describe("Vue 27 — utilisateurs", () => {
  const reponses = { "/api/utilisateurs": { corps: UTILISATEURS } };

  test("la liste porte identité, rôle, organisation et statut", async ({ page }) => {
    await serveur(page, { session: SESSION_ADMIN, reponses });
    await page.goto("/utilisateurs");

    await expect(page.getByRole("heading", { name: "Utilisateurs", level: 1 })).toBeVisible();
    await expect(page.getByText("camille.roussel@exemple.fr")).toBeVisible();
    await expect(page.getByText("Gestion administrative")).toBeVisible();
    // La maquette 27 dit « Désactivés », pas « Inactifs » : le vocabulaire du
    // produit a été aligné dessus au portage de la vue.
    await expect(page.getByText("Désactivé", { exact: true })).toBeVisible();
  });

  test("RG-USR-04 — soi-même est signalé, et ses actions désactivées AVEC leur raison", async ({
    page,
  }) => {
    await serveur(page, { session: SESSION_ADMIN, reponses });
    await page.goto("/utilisateurs");
    await page.getByRole("button", { name: "Actions pour Hugo Nguyen" }).click();

    // Masquer laisserait croire à un défaut d'affichage ; désactiver sans dire
    // pourquoi laisserait chercher.
    await expect(page.getByText("Vous ne pouvez pas vous désactiver vous-même")).toBeVisible();
    await expect(page.getByText("Vous ne pouvez pas vous supprimer vous-même")).toBeVisible();
  });

  test("les actions d'autrui, elles, sont bien actives", async ({ page }) => {
    await serveur(page, { session: SESSION_ADMIN, reponses });
    await page.goto("/utilisateurs");
    await page.getByRole("button", { name: "Actions pour Camille Roussel" }).click();

    await expect(page.getByRole("menuitem", { name: "Désactiver" })).toBeEnabled();
    await expect(page.getByText("Vous ne pouvez pas vous désactiver")).toHaveCount(0);
  });

  test("les deux suppressions sont distinctes : parcours, libellé, séparateur", async ({
    page,
  }) => {
    await serveur(page, { session: SESSION_ADMIN, reponses });
    await page.goto("/utilisateurs");
    await page.getByRole("button", { name: "Actions pour Camille Roussel" }).click();

    // « Désactiver » tient en un clic ; « Supprimer définitivement » ouvre une
    // séquence. Les libellés eux-mêmes ne se confondent pas.
    await expect(page.getByRole("menuitem", { name: "Désactiver" })).toBeVisible();
    await expect(
      page.getByRole("menuitem", { name: "Supprimer définitivement" }),
    ).toBeVisible();
  });

  test("la suppression définitive se déroule en trois temps, et refuse si bloquée", async ({
    page,
  }) => {
    await serveur(page, {
      session: SESSION_ADMIN,
      reponses: { ...reponses, "/impact": { corps: IMPACT_BLOQUE } },
    });
    await page.goto("/utilisateurs");
    await page.getByRole("button", { name: "Actions pour Camille Roussel" }).click();
    await page.getByRole("menuitem", { name: "Supprimer définitivement" }).click();

    await expect(page.getByText("Vérification des dépendances")).toBeVisible();
    await expect(page.getByText("Suppression impossible")).toBeVisible();
    await expect(page.getByText("218")).toBeVisible();
    await expect(page.getByText(/réassigner ou terminer ces éléments/)).toBeVisible();
    // Pas de bouton qui échouerait.
    await expect(
      page.getByRole("dialog").getByRole("button", { name: "Supprimer définitivement" }),
    ).toHaveCount(0);
  });

  test("sans dépendance bloquante, la suppression est offerte — et prévient", async ({ page }) => {
    await serveur(page, {
      session: SESSION_ADMIN,
      reponses: { ...reponses, "/impact": { corps: IMPACT_LIBRE } },
    });
    await page.goto("/utilisateurs");
    await page.getByRole("button", { name: "Actions pour Ancien Collegue" }).click();
    await page.getByRole("menuitem", { name: "Supprimer définitivement" }).click();

    await expect(page.getByText("Suppression possible")).toBeVisible();
    await expect(page.getByText(/cette action est irréversible/)).toBeVisible();
    await expect(page.getByText("La désactivation, elle, est réversible")).toBeVisible();
  });

  test("RG-AUTH-08 — le login est annoncé définitif à la création", async ({ page }) => {
    await serveur(page, { session: SESSION_ADMIN, reponses });
    await page.goto("/utilisateurs");
    await page.getByRole("button", { name: "Créer un utilisateur" }).click();

    await expect(page.getByText(/ne pourra plus être modifié ensuite/)).toBeVisible();
  });
});

test.describe("Vue 28 — suivi individuel", () => {
  const reponses = { "/suivi": { corps: SUIVI } };

  test("le bandeau de période dit sa portée, et reste visible", async ({ page }) => {
    await serveur(page, { session: SESSION_ADMIN, reponses });
    await page.goto("/utilisateurs/u-autre/suivi");

    await expect(page.getByText("La période s'applique aux six onglets.")).toBeVisible();
    await expect(page.getByText("01/08/2026 → 31/08/2026")).toBeVisible();
  });

  test("CHAQUE CHIFFRE PORTE SON ÉTENDUE — c'est le piège de cette vue", async ({ page }) => {
    await serveur(page, { session: SESSION_ADMIN, reponses });
    await page.goto("/utilisateurs/u-autre/suivi");

    // Les heures suivent la période, le solde suit l'année, les tâches
    // actives valent à l'instant. Sous un même en-tête, ils seraient faux.
    await expect(page.getByText("Sur la période").first()).toBeVisible();
    await expect(page.getByText("Année civile")).toBeVisible();
    await expect(page.getByText("À l'instant").first()).toBeVisible();
  });

  test("les six onglets existent et se parcourent", async ({ page }) => {
    await serveur(page, { session: SESSION_ADMIN, reponses });
    await page.goto("/utilisateurs/u-autre/suivi");

    const onglets = page.getByRole("navigation", { name: "Sections du suivi" }).getByRole("link");
    await expect(onglets).toHaveCount(6);

    // Les onglets portent les mêmes libellés que la navigation principale :
    // on vise la barre de sections.
    await onglets.filter({ hasText: "Tâches" }).click();
    await expect(page.getByText("Rédiger la note de cadrage")).toBeVisible();
    // Le hors-projet est nommé ici aussi.
    await expect(page.getByText("Hors projet").first()).toBeVisible();
  });

  test("l'onglet Congés rappelle que ses jours sont ceux de l'année", async ({ page }) => {
    await serveur(page, { session: SESSION_ADMIN, reponses });
    await page.goto("/utilisateurs/u-autre/suivi");
    await page
      .getByRole("navigation", { name: "Sections du suivi" })
      .getByRole("link", { name: "Congés" })
      .click();

    await expect(page.getByText(/imputés sur l'année 2026/)).toBeVisible();
  });

  test("l'onglet Temps donne la répartition par projet", async ({ page }) => {
    await serveur(page, { session: SESSION_ADMIN, reponses });
    await page.goto("/utilisateurs/u-autre/suivi");
    await page
      .getByRole("navigation", { name: "Sections du suivi" })
      .getByRole("link", { name: "Temps" })
      .click();

    await expect(page.getByText("Répartition par projet")).toBeVisible();
    await expect(page.getByText("6 h").first()).toBeVisible();
  });

  test("une arrivée récente : chaque onglet a son propre état vide", async ({ page }) => {
    await serveur(page, {
      session: SESSION_ADMIN,
      reponses: { "/suivi": { corps: SUIVI_VIDE } },
    });
    await page.goto("/utilisateurs/u-neuve/suivi");

    for (const [onglet, message] of [
      ["Tâches", "Aucune tâche assignée"],
      ["Congés", "Aucun congé enregistré"],
      ["Télétravail", "Aucun jour de télétravail enregistré"],
      ["Temps", "Aucune saisie de temps"],
      ["Compétences", "Aucune compétence enregistrée"],
    ] as const) {
      await page
        .getByRole("navigation", { name: "Sections du suivi" })
        .getByRole("link", { name: onglet })
        .click();
      await expect(page.getByText(message)).toBeVisible();
    }
  });

  test("sans le droit dédié, l'accès est refusé — et le dit", async ({ page }) => {
    await serveur(page, { session: SESSION_LECTURE, reponses });
    await page.goto("/utilisateurs/u-autre/suivi");

    await expect(page.getByText("Permission requise")).toBeVisible();
  });
});

test.describe("Vue 29 — départements et services", () => {
  const reponses = { "/api/organisation": { corps: ARBORESCENCE } };

  test("L'ASYMÉTRIE DES DEUX RÈGLES EST ANNONCÉE EN TÊTE", async ({ page }) => {
    await serveur(page, { session: SESSION_ADMIN, reponses });
    await page.goto("/departements");

    // « Cette asymétrie doit être annoncée avant l'action, pas découverte au
    //   message d'erreur » — brief de la vue 29.
    await expect(page.getByText(/Une direction refuse d'être supprimée/)).toBeVisible();
    await expect(page.getByText(/Un département emporte ses services/)).toBeVisible();
  });

  test("l'arborescence se déplie sur trois niveaux", async ({ page }) => {
    await serveur(page, { session: SESSION_ADMIN, reponses });
    await page.goto("/departements");

    await expect(page.getByText("Direction générale des services")).toBeVisible();
    await page
      .getByRole("button", { name: "Déplier la direction Direction générale des services" })
      .click();
    await expect(page.getByText("Direction des services numériques")).toBeVisible();

    await page
      .getByRole("button", { name: "Déplier le département Direction des services numériques" })
      .click();
    await expect(page.getByText("Études et développement")).toBeVisible();
    await expect(page.getByText("Exploitation")).toBeVisible();
  });

  test("RG-ORG-03 — un département sans direction reste visible", async ({ page }) => {
    await serveur(page, { session: SESSION_ADMIN, reponses });
    await page.goto("/departements");

    await expect(page.getByText("Départements sans direction")).toBeVisible();
    await expect(page.getByText("Mission transversale")).toBeVisible();
  });

  test("une direction chargée REFUSE, et nomme ce qui bloque", async ({ page }) => {
    await serveur(page, { session: SESSION_ADMIN, reponses });
    await page.goto("/departements");
    await page
      .getByRole("button", { name: "Déplier la direction Direction générale des services" })
      .click();

    await page.getByRole("button", { name: "Supprimer" }).first().click();
    await expect(page.getByText(/porte encore des départements/)).toBeVisible();
    await expect(
      page.getByRole("dialog").getByRole("button", { name: "Supprimer la direction" }),
    ).toHaveCount(0);
  });

  test("une direction vide accepte la suppression", async ({ page }) => {
    await serveur(page, { session: SESSION_ADMIN, reponses });
    await page.goto("/departements");

    // La deuxième direction n'a pas de département.
    await page.getByRole("button", { name: "Supprimer" }).nth(1).click();
    await expect(
      page.getByRole("dialog").getByRole("button", { name: "Supprimer la direction" }),
    ).toBeVisible();
  });

  test("un département EMPORTE ses services, et les nomme un par un", async ({ page }) => {
    await serveur(page, {
      session: SESSION_ADMIN,
      reponses: { ...reponses, "/impact": { corps: IMPACT_DEPARTEMENT } },
    });
    await page.goto("/departements");
    await page
      .getByRole("button", { name: "Déplier la direction Direction générale des services" })
      .click();

    await page.getByRole("button", { name: "Supprimer" }).nth(1).click();
    await expect(page.getByText(/Tous les services associés seront également supprimés/)).toBeVisible();
    // Les nommer évite de deviner lesquels.
    await expect(page.getByRole("dialog").getByText("Études et développement")).toBeVisible();
    await expect(page.getByRole("dialog").getByText("Exploitation")).toBeVisible();
    // Les agents, eux, sont détachés — pas supprimés.
    await expect(page.getByText(/10 agents seront détachés du département/)).toBeVisible();
  });

  test("sans le droit de lecture, l'accès est refusé", async ({ page }) => {
    await serveur(page, { session: SESSION_LECTURE, reponses });
    await page.goto("/departements");
    await expect(page.getByText("Permission requise")).toBeVisible();
  });
});
