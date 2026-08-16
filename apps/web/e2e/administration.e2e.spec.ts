import { test, expect, type Page } from "@playwright/test";
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
    /*
     * La maquette 27 dit « Désactivé », pas « Inactif » : c'est un compte que
     * quelqu'un a désactivé, pas un état d'activité constaté. Le filtre porte
     * « Désactivés » ; on vise la pastille de ligne, d'où l'exactitude.
     */
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

    /*
     * La maquette 28 écrit la portée SANS sujet et lui adjoint la réserve qui
     * fait tout le sens de la vue : certains chiffres échappent à la période.
     * Le test citait une phrase plus courte, qui n'existe pas.
     */
    await expect(
      page.getByText(
        "S'applique aux six onglets. Certains chiffres restent annuels ou instantanés : ils le disent.",
      ),
    ).toBeVisible();
    // Les bornes sont écrites deux fois — dans le bandeau (`.period-range` de
    // la maquette 28) et en tête du panneau d'activité récente. C'est le
    // bandeau qu'on vérifie ici.
    await expect(page.locator(".period-range")).toHaveText("01/08/2026 → 31/08/2026");
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

  /*
   * Les noms de l'arborescence se visent par les classes de la maquette 29 —
   * `.dir-n`, `.dep-n`, `.svc-n`. Un `getByText` nu attrape aussi les
   * `<option>` du filtre « Filtrer par département », qui portent les mêmes
   * noms : le test tombait en violation de mode strict sur du texte pourtant
   * bien affiché. Le niveau visé fait d'ailleurs partie de ce qu'on vérifie.
   */
  const direction = (page: Page, nom: string) => page.locator("p.dir-n").filter({ hasText: nom });
  const departement = (page: Page, nom: string) => page.locator("p.dep-n").filter({ hasText: nom });
  const service = (page: Page, nom: string) => page.locator("p.svc-n").filter({ hasText: nom });

  /** Le bloc de tête d'un nœud — c'est lui qui porte ses actions. */
  const teteDirection = (page: Page, nom: string) =>
    page.locator(".dir-head").filter({ has: page.locator("p.dir-n", { hasText: nom }) });
  const teteDepartement = (page: Page, nom: string) =>
    page.locator(".dep-head").filter({ has: page.locator("p.dep-n", { hasText: nom }) });

  test("L'ASYMÉTRIE DES DEUX RÈGLES EST ANNONCÉE EN TÊTE", async ({ page }) => {
    await serveur(page, { session: SESSION_ADMIN, reponses });
    await page.goto("/departements");

    // « Cette asymétrie doit être annoncée avant l'action, pas découverte au
    //   message d'erreur » — brief de la vue 29.
    await expect(page.getByText(/Une direction refuse d'être supprimée/)).toBeVisible();
    await expect(page.getByText(/Un département emporte ses services/)).toBeVisible();
  });

  test("l'arborescence est DÉPLIÉE d'emblée, sur ses trois niveaux", async ({ page }) => {
    await serveur(page, { session: SESSION_ADMIN, reponses });
    await page.goto("/departements");

    /*
     * La maquette 29 pose `open:true` sur chaque nœud : on vient lire la
     * structure entière, pas la déplier de proche en proche. Le test partait
     * de l'hypothèse inverse et cliquait le chevron — ce qui REPLIAIT le
     * niveau qu'il s'attendait ensuite à voir apparaître.
     */
    await expect(direction(page, "Direction générale des services")).toBeVisible();
    await expect(departement(page, "Direction des services numériques")).toBeVisible();
    await expect(service(page, "Études et développement")).toBeVisible();
    await expect(service(page, "Exploitation")).toBeVisible();

    // Et le chevron replie bien, puisqu'on le trouve déplié.
    await page
      .getByRole("button", { name: "Déplier le département Direction des services numériques" })
      .click();
    await expect(service(page, "Études et développement")).toHaveCount(0);

    await page.getByRole("button", { name: "Tout déplier" }).click();
    await expect(service(page, "Études et développement")).toBeVisible();
  });

  test("RG-ORG-03 — un département sans direction reste visible", async ({ page }) => {
    await serveur(page, { session: SESSION_ADMIN, reponses });
    await page.goto("/departements");

    await expect(page.getByText("Départements sans direction")).toBeVisible();
    await expect(departement(page, "Mission transversale")).toBeVisible();
  });

  test("une direction chargée REFUSE — et le bouton le dit AVANT le clic", async ({ page }) => {
    await serveur(page, { session: SESSION_ADMIN, reponses });
    await page.goto("/departements");

    /*
     * `RG-ORG-02`. La maquette 29 (`mini(…, why)`) désactive le bouton et
     * porte la raison en infobulle : la règle est annoncée avant l'action, pas
     * découverte au message d'erreur. Le test attendait une fenêtre qui
     * s'ouvre puis refuse — un aller-retour que la maquette évite.
     */
    const supprimer = teteDirection(page, "Direction générale des services").getByRole("button", {
      name: "Supprimer",
    });
    await expect(supprimer).toBeDisabled();
    await expect(supprimer.locator("[title]")).toHaveAttribute(
      "title",
      /1 département y est rattaché/,
    );

    // Et aucune fenêtre ne s'ouvre : le geste n'est pas seulement refusé, il
    // n'est pas proposé.
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });

  test("une direction vide accepte la suppression", async ({ page }) => {
    await serveur(page, { session: SESSION_ADMIN, reponses });
    await page.goto("/departements");

    // « Direction vide » ne porte aucun département. On la vise par son nom :
    // compter les boutons depuis le haut de l'arbre dépendait du dépliage.
    await teteDirection(page, "Direction vide").getByRole("button", { name: "Supprimer" }).click();
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

    await teteDepartement(page, "Direction des services numériques")
      .getByRole("button", { name: "Supprimer" })
      .click();
    const fenetre = page.getByRole("dialog");
    await expect(fenetre.getByText("Tous les services associés seront également supprimés.")).toBeVisible();
    // Les nommer évite de deviner lesquels.
    await expect(fenetre.getByText("Études et développement")).toBeVisible();
    await expect(fenetre.getByText("Exploitation")).toBeVisible();
    // Les agents, eux, sont détachés — pas supprimés.
    await expect(
      fenetre.getByText("10 agents seront détachés du département, sans être supprimés."),
    ).toBeVisible();
  });

  test("sans le droit de lecture, l'accès est refusé", async ({ page }) => {
    await serveur(page, { session: SESSION_LECTURE, reponses });
    await page.goto("/departements");
    await expect(page.getByText("Permission requise")).toBeVisible();
  });
});
