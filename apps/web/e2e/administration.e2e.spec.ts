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
  IMPACT_SERVICE,
  SESSION_ADMIN_SERVICES,
  SESSION_TEMPS,
  SESSION_TEMPS_EQUIPE,
  TEMPS_VIDE,
  RAPPORT_AGENT,
  RAPPORT_TYPE,
} from "./fixtures/administration.js";

/**
 * **L'horloge est figée.** Les jeux d'essai de ce fichier portent des dates en
 * dur d'août 2026, et les vues construisent leurs grilles, leurs retards et
 * leurs décomptes à partir d'« aujourd'hui ».
 *
 * Le piège est consigné — « un test vert le lundi tombe le mardi » — et il
 * s'est réveillé le 1er septembre 2026 sur `occupations.e2e.spec.ts` : trois
 * contrôles verts la veille cherchaient des cases d'août dans une grille de
 * septembre. Neuf suites figeaient déjà leur horloge ; les autres ne tenaient
 * que par la coïncidence du mois en cours.
 *
 * Le 11 août 2026 est un mardi, au milieu de la fenêtre des jeux d'essai.
 */
const MOMENT_FIGE = new Date("2026-08-11T09:00:00.000Z");

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(MOMENT_FIGE);
});


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

  /**
   * `EX-USR-04` — modifier un compte, rôle et rattachements compris.
   *
   * L'action a manqué à la vue pendant tout le projet, derrière un commentaire
   * affirmant que « la route de modification d'un compte n'existe pas côté
   * serveur ». `PATCH /utilisateurs/:id` existe et porte `users:update`, que le
   * rôle ADMIN détient comme les 151 autres permissions. Une action ABSENTE ne
   * fait échouer aucun contrôle : c'est ce qui a laissé le commentaire faux
   * survivre à toutes les boucles.
   */
  test("EX-USR-04 — un compte se modifie, et l'écriture porte sa version", async ({ page }) => {
    let recu: unknown = null;
    await serveur(page, { session: SESSION_ADMIN, reponses });
    await page.route(
      (url) => url.pathname.startsWith("/api/utilisateurs/"),
      (route) => {
        if (route.request().method() !== "PATCH") return route.fallback();
        recu = route.request().postDataJSON();
        return route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
      },
    );

    await page.goto("/utilisateurs");
    await page.getByRole("button", { name: "Actions pour Camille Roussel" }).click();
    await page.getByRole("menuitem", { name: "Modifier" }).click();

    // `RG-AUTH-08` — l'identifiant reste hors d'atteinte, et le dit.
    await expect(page.getByLabel("Login", { exact: true })).toBeDisabled();

    await page.getByLabel("Prénom").fill("Camille-Rose");
    await page.getByRole("button", { name: "Enregistrer" }).click();

    await expect.poll(() => recu).not.toBeNull();
    expect(recu).toMatchObject({ prenom: "Camille-Rose", version: expect.any(Number) });
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

  /**
   * `EX-TLT-08` — « consulter le télétravail **et les statistiques** d'un agent ».
   *
   * L'onglet ne rendait qu'une liste de dates. Le brief réclame quatre
   * indicateurs (`cadrage/02:821`), dont « moyenne mensuelle », que `GET /suivi`
   * ne porte pas : ils viennent de `GET /teletravail/statistiques`, calculée
   * depuis L-16 et qu'aucun écran n'appelait. La maquette 28 les a dessinés.
   */
  test("EX-TLT-08 — l'onglet Télétravail porte ses quatre indicateurs", async ({ page }) => {
    await serveur(page, {
      session: SESSION_ADMIN,
      reponses: {
        ...reponses,
        "/teletravail/statistiques": {
          corps: {
            annee: 2026,
            parMois: [2, 3, 1, 4, 2, 0, 1, 5, 0, 0, 0, 0],
            moyenneMensuelle: 1.5,
          },
        },
      },
    });
    await page.goto("/utilisateurs/u-autre/suivi");
    await page
      .getByRole("navigation", { name: "Sections du suivi" })
      .getByRole("link")
      .filter({ hasText: "Télétravail" })
      .click();

    // Les indicateurs vivent dans leur propre grille : « Cette année » apparaît
    // aussi comme marqueur d'étendue, viser la page entière serait ambigu.
    const kpi = page.locator(".kpi-grid");
    await expect(kpi.getByText("Moyenne mensuelle")).toBeVisible();
    await expect(kpi.getByText("1,5", { exact: true })).toBeVisible();
    await expect(kpi.getByText("Cette année").first()).toBeVisible();
    // 2+3+1+4+2+0+1+5 = 18 jours sur l'année.
    await expect(kpi.getByText("18", { exact: true })).toBeVisible();
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

  /**
   * `EX-ORG-03` — **le troisième verbe du troisième niveau.**
   *
   * `DELETE /organisation/services/:id` et son impact existaient côté serveur
   * depuis la vague 7 sans qu'aucun écran ne les atteigne : le service se
   * créait et se modifiait, il ne se supprimait pas. Une action ABSENTE ne fait
   * échouer aucun contrôle — c'est ce qui l'a laissée manquer.
   */
  test("EX-ORG-03 — l'impact d'un service est demandé AVANT la confirmation, et il détache", async ({
    page,
  }) => {
    /* On observe l'appel : ce test doit distinguer « la fenêtre affiche 7 »
       de « la fenêtre affiche le _count de l'arborescence, qui vaut aussi 7 ».
       Sans cette observation, retirer entièrement la requête d'impact le
       laisserait vert. */
    const appels: string[] = [];
    await serveur(page, {
      session: SESSION_ADMIN_SERVICES,
      reponses: { ...reponses, "/organisation/services/svc1/impact": { corps: IMPACT_SERVICE } },
    });
    page.on("request", (r) => {
      const u = new URL(r.url());
      if (u.pathname.startsWith("/api/organisation/services")) appels.push(`${r.method()} ${u.pathname}`);
    });
    await page.goto("/departements");

    // Aucun impact n'est demandé tant que la fenêtre est fermée : une requête
    // par service au premier rendu coûterait autant d'appels que de lignes.
    // On attend que l'arbre soit rendu — sinon l'absence d'appel ne
    // prouverait que la lenteur du chargement.
    await expect(service(page, "Études et développement")).toBeVisible();
    expect(appels).toEqual([]);

    await page.getByRole("button", { name: "Supprimer le service Études et développement" }).click();
    const fenetre = page.getByRole("dialog");

    await expect(fenetre.getByText("Supprimer définitivement le service")).toBeVisible();
    await expect(fenetre.getByText("« Études et développement »")).toBeVisible();
    // Un service n'emporte rien : il DÉTACHE. C'est la troisième règle de la
    // vue, et elle ne doit pas se lire comme celle du département.
    await expect(
      fenetre.getByText("7 agents seront détachés du service, sans être supprimés."),
    ).toBeVisible();
    await expect(fenetre.getByText("seront également supprimés")).toHaveCount(0);

    expect(appels).toEqual(["GET /api/organisation/services/svc1/impact"]);
  });

  test("EX-ORG-03 — la suppression d'un service part en DELETE sur SON identifiant", async ({
    page,
  }) => {
    let recu: string | null = null;
    await serveur(page, {
      session: SESSION_ADMIN_SERVICES,
      reponses: { ...reponses, "/organisation/services/svc2/impact": { corps: IMPACT_SERVICE } },
    });
    await page.route(
      (url) => url.pathname.startsWith("/api/organisation/services/"),
      (route) => {
        if (route.request().method() !== "DELETE") return route.fallback();
        recu = new URL(route.request().url()).pathname;
        return route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
      },
    );
    await page.goto("/departements");

    // « Exploitation », le SECOND service du département : viser le premier
    // laisserait passer une fenêtre qui supprime toujours le même.
    await page.getByRole("button", { name: "Supprimer le service Exploitation" }).click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Supprimer le service", exact: true })
      .click();

    await expect(page.getByText("Service supprimé.")).toBeVisible();
    expect(recu).toBe("/api/organisation/services/svc2");
  });

  test("EX-ORG-03 — sans `services:delete`, le geste n'est pas proposé", async ({ page }) => {
    // `SESSION_ADMIN` porte `services:read`, pas `services:delete`.
    await serveur(page, { session: SESSION_ADMIN, reponses });
    await page.goto("/departements");

    /*
     * **L'attente vient AVANT l'assertion d'absence, et c'est tout ce qui la
     * rend probante.** `toHaveCount(0)` réussit dès le premier essai tant que
     * l'arbre n'a pas rendu : écrit sans cette ligne, ce test passait au vert
     * MÊME avec le bouton rendu sans garde — il mesurait la latence, pas la
     * permission. Le département, lui, garde son bouton : c'est bien la
     * permission du service qui manque.
     */
    await expect(service(page, "Études et développement")).toBeVisible();
    await expect(
      teteDepartement(page, "Direction des services numériques").getByRole("button", {
        name: "Supprimer",
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Supprimer le service Études et développement" }),
    ).toHaveCount(0);
  });

  test("la troisième règle de suppression est annoncée en tête, comme les deux autres", async ({
    page,
  }) => {
    await serveur(page, { session: SESSION_ADMIN_SERVICES, reponses });
    await page.goto("/departements");

    // « Trois niveaux hiérarchiques avec des règles de suppression
    //   différentes » — brief de la vue 29. La troisième manquait.
    await expect(page.getByText(/Un service ne porte rien/)).toBeVisible();
  });
});

/**
 * `EX-TMP-07` — le rapport agrégé de la vue 21.
 *
 * **Ces trois tests vivent ici faute de place ailleurs** : `occupations.e2e.spec.ts`
 * porte la vue 21 mais un autre agent y travaillait pendant cette tâche. À
 * regrouper avec le reste de la vue 21 à la première occasion.
 *
 * `GET /temps/rapport` n'avait aucun client : c'est le seul point d'entrée du
 * produit qui sait ventiler le temps PAR AGENT, et aucun écran ne l'offrait.
 */
test.describe("Vue 21 — rapport d'équipe", () => {
  const reponses = {
    "/api/temps": { corps: TEMPS_VIDE },
    "/api/projets": { corps: { projets: [] } },
  };

  test("EX-TMP-07 — le rapport ventile PAR AGENT, ce qu'aucune autre lecture ne sait faire", async ({
    page,
  }) => {
    await serveur(page, {
      session: SESSION_TEMPS_EQUIPE,
      reponses: { ...reponses, "/api/temps/rapport": { corps: RAPPORT_AGENT } },
    });
    await page.goto("/temps");

    const rapport = page.locator("section.panel").filter({ hasText: "Rapport d'équipe" });
    await expect(rapport.getByText("Driss Amrani")).toBeVisible();
    await expect(rapport.getByText("Hugo Nguyen")).toBeVisible();
    // Une saisie faite pour un tiers n'a pas d'agent : le serveur la nomme.
    await expect(rapport.getByText("Tiers", { exact: true })).toBeVisible();
    // Les heures ET le nombre d'entrées : « 34 h » seul ne dit pas si c'est
    // une grosse saisie ou neuf petites.
    await expect(rapport.getByText("34 h · 9 entrées")).toBeVisible();
    await expect(rapport.getByText("3,5 h · 1 entrée")).toBeVisible();
  });

  test("EX-TMP-07 — l'axe change la requête, et le type d'activité est TRADUIT", async ({
    page,
  }) => {
    const axes: string[] = [];
    await serveur(page, { session: SESSION_TEMPS_EQUIPE, reponses });
    await page.route(
      (url) => url.pathname === "/api/temps/rapport",
      (route) => {
        const axe = new URL(route.request().url()).searchParams.get("axe") ?? "";
        axes.push(axe);
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(axe === "type" ? RAPPORT_TYPE : RAPPORT_AGENT),
        });
      },
    );
    await page.goto("/temps");

    const rapport = page.locator("section.panel").filter({ hasText: "Rapport d'équipe" });
    await expect(rapport.getByText("Driss Amrani")).toBeVisible();

    await rapport.getByRole("button", { name: "Par type d'activité" }).click();

    /*
     * Le serveur rend le CODE en guise de libellé — « development ». Aucune
     * chaîne visible ne vient du serveur (`RG-GEN-08`) : la vue traduit par le
     * vocabulaire de `@rationarium/contracts`. Afficher « development » serait
     * passé inaperçu de toutes les autres boucles.
     */
    await expect(rapport.getByText("Développement")).toBeVisible();
    await expect(rapport.getByText("Réunion")).toBeVisible();
    await expect(rapport.getByText("development")).toHaveCount(0);

    // La période part avec la requête : sans elle le serveur rend un 400.
    expect(axes).toEqual(["agent", "type"]);
    const requete = new URL(page.url());
    expect(requete.pathname).toBe("/temps");
  });

  test("EX-TMP-07 — sans `time_tracking:read_team`, le rapport n'est ni affiché ni demandé", async ({
    page,
  }) => {
    let demande = false;
    await serveur(page, { session: SESSION_TEMPS, reponses });
    page.on("request", (r) => {
      if (new URL(r.url()).pathname === "/api/temps/rapport") demande = true;
    });
    await page.goto("/temps");

    /*
     * On attend un élément qui n'apparaît qu'APRÈS la réponse du serveur —
     * « Répartition » vit sous `requete.data`. Le panneau du rapport le suit
     * dans le document : sans cette attente, `toHaveCount(0)` réussirait avant
     * même le premier rendu, et mesurerait la latence au lieu de la
     * permission. Le piège s'est payé sur le test jumeau de la vue 29.
     */
    await expect(page.getByRole("heading", { name: "Temps passé", level: 1 })).toBeVisible();
    await expect(page.getByText("Répartition", { exact: true })).toBeVisible();
    await expect(page.getByText("Rapport d'équipe")).toHaveCount(0);
    /* Le client masque par courtoisie (`RG-GEN-06`) ; ne pas ÉMETTRE la requête
       est ce qui distingue « caché » de « refusé après coup ». */
    expect(demande).toBe(false);
  });
});
