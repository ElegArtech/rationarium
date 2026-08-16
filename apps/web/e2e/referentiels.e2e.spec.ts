import { test, expect } from "@playwright/test";
import { serveur, SESSION_LECTURE } from "./fixtures/projets.js";
import {
  SESSION_REFERENTIELS,
  MATRICE,
  REFERENTIEL,
  LISTE_TIERS,
  TIERS_ARCHIVE,
  FICHE_TIERS,
  FICHE_TIERS_VIDE,
  CLIENTS,
  FICHE_CLIENT,
  FICHE_CLIENT_VIDE,
  IMPACT_VIDE,
} from "./fixtures/referentiels.js";

/**
 * L-35 — vues 22 à 26.
 *
 * Les points d'attention des briefs sont vérifiés tels qu'ils sont écrits :
 * « la couverture insuffisante doit sauter aux yeux », « le contact nommé
 * n'existe que pour une personne physique », « détacher ne supprime pas le
 * projet ».
 */

test.describe("Vue 22 — compétences", () => {
  const reponses = {
    "/api/competences/matrice": { corps: MATRICE },
    "/api/competences": { corps: REFERENTIEL },
  };

  test("la couverture insuffisante saute aux yeux, et elle est ÉCRITE", async ({ page }) => {
    await serveur(page, { session: SESSION_REFERENTIELS, reponses });
    await page.goto("/competences");

    // « C'est l'information qu'on vient chercher » — brief de la vue 22.
    await expect(page.getByText(/Compétences à renforcer/)).toBeVisible();
    /*
     * Le bandeau écrit chaque écart « nom (détenteurs/requis, il manque n) » —
     * c'est le format de `renderRef`/`gap-list` dans la maquette 22, et le
     * catalogue `competences.ecartLigne` le reprend mot pour mot. Le test
     * attendait le ratio nu « (1/3) », qui ne dit pas combien il manque.
     */
    await expect(page.getByText("Cartographie SIG (1/3, il manque 2)")).toBeVisible();
    await expect(page.getByText("1 compétence à renforcer")).toBeVisible();
  });

  test("la ligne de couverture dit le ratio en toutes lettres", async ({ page }) => {
    await serveur(page, { session: SESSION_REFERENTIELS, reponses });
    await page.goto("/competences");

    // La couleur ne dit rien à qui ne la voit pas : le libellé porte le sens.
    await expect(
      page.getByLabel(/Cartographie SIG : couverture partielle 1\/3, 2 ressources manquantes/),
    ).toBeVisible();
    await expect(
      page.getByLabel(/Rédaction administrative : couverture complète 2\/1/),
    ).toBeVisible();
  });

  test("chaque cellule dit qui, quoi et quel niveau", async ({ page }) => {
    await serveur(page, { session: SESSION_REFERENTIELS, reponses });
    await page.goto("/competences");

    await expect(
      page.getByRole("button", { name: /Driss Amrani — Cartographie SIG : Expert/ }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Inès Rocher — Cartographie SIG : aucun niveau/ }),
    ).toBeVisible();
  });

  test("le niveau est doublé d'une abréviation, pas seulement d'une nuance", async ({ page }) => {
    await serveur(page, { session: SESSION_REFERENTIELS, reponses });
    await page.goto("/competences");

    // Quatre nuances de bleu ne se distinguent pas d'un coup d'œil ; trois
    // lettres si.
    await expect(page.getByText("Exp", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Maî", { exact: true }).first()).toBeVisible();
  });

  test("la vue par utilisateur liste les compétences détenues, et dit le vide", async ({
    page,
  }) => {
    await serveur(page, { session: SESSION_REFERENTIELS, reponses });
    await page.goto("/competences");
    await page.getByRole("button", { name: "Par utilisateur" }).click();

    await expect(page.getByText("2 compétences")).toBeVisible();
    await expect(page.getByText("Aucune compétence assignée")).toBeVisible();
  });

  test("le référentiel dit l'écart, pas seulement l'effectif", async ({ page }) => {
    await serveur(page, { session: SESSION_REFERENTIELS, reponses });
    await page.goto("/competences");
    await page.getByRole("button", { name: "Référentiel" }).click();

    /*
     * La maquette 22 (`renderRef`) donne au référentiel deux colonnes
     * distinctes : « Ressources requises » porte l'effectif, « Couverture »
     * porte une pastille écrite — « Partielle 1/3 », « Complète 2/1 ». C'est
     * elle qui dit l'écart.
     *
     * Le test cherchait « 2 manquantes », qui n'existe nulle part, et le ratio
     * nu « 1/3 », qui vise aussi le bandeau d'écarts.
     */
    await expect(page.getByText("3 personnes")).toBeVisible();
    await expect(page.getByText("Partielle 1/3")).toBeVisible();
    await expect(page.getByText("Complète 2/1")).toBeVisible();
  });

  test("RG-GEN-06 — sans droit sur la matrice, les cellules sont inertes", async ({ page }) => {
    await serveur(page, { session: SESSION_LECTURE, reponses });
    await page.goto("/competences");

    await expect(
      page.getByRole("button", { name: /Driss Amrani — Cartographie SIG/ }),
    ).toBeDisabled();
  });
});

test.describe("Vue 23 — tiers", () => {
  const reponses = { "/api/tiers": { corps: LISTE_TIERS } };

  test("une personne morale n'a pas de contact nommé, et la vue l'écrit", async ({ page }) => {
    await serveur(page, { session: SESSION_REFERENTIELS, reponses });
    await page.goto("/tiers");

    /*
     * RG-TRS-01 — on l'écrit, on ne laisse pas une case vide qui se lirait
     * comme une donnée manquante. La maquette 23 choisit le mot : là où une
     * personne physique porte un nom, une personne morale porte des
     * « Coordonnées génériques ». Le test attendait une formule inventée.
     */
    await expect(page.getByText("Coordonnées génériques")).toBeVisible();
    await expect(page.getByText("nadia.kaufmann@exemple.fr")).toBeVisible();
  });

  test("les archivés sont exclus par défaut, mais restent demandables", async ({ page }) => {
    /*
     * Le serveur rend TOUT, y compris l'archivé : c'est le filtre de statut,
     * posé sur « Actifs » d'emblée par la maquette 23, qui l'exclut. Mocker
     * une liste déjà filtrée aurait testé le mock, pas la vue.
     *
     * Et ce filtre est une liste déroulante — Actifs / Archivés / Tous —, pas
     * le bouton « Voir les archivés » que ce test supposait.
     */
    await serveur(page, {
      session: SESSION_REFERENTIELS,
      reponses: { "/api/tiers": { corps: [...LISTE_TIERS, TIERS_ARCHIVE] } },
    });
    await page.goto("/tiers");
    await expect(page.getByText("Presta SA")).toBeVisible();
    await expect(page.getByText("Ancien prestataire")).toHaveCount(0);

    await page.getByLabel("Statut", { exact: true }).selectOption("off");
    await expect(page.getByText("Ancien prestataire")).toBeVisible();
    await expect(page.getByText("Presta SA")).toHaveCount(0);
    // Un archivé reste consultable, mais il est dit non assignable.
    await expect(page.getByText("non assignable")).toBeVisible();
  });

  test("les champs de contact DISPARAISSENT pour une personne morale", async ({ page }) => {
    await serveur(page, { session: SESSION_REFERENTIELS, reponses });
    await page.goto("/tiers");
    await page.getByRole("button", { name: "Nouveau tiers" }).click();
    const fenetre = page.getByRole("dialog");

    // Physique par défaut : le champ est là. La maquette 23 nomme la colonne
    // et le champ « Coordonnées », pas « Contact ».
    await expect(fenetre.getByLabel("Coordonnées", { exact: true })).toBeVisible();

    // Le type se choisit sur un groupe segmenté (`.kind-seg` de la maquette),
    // pas sur une liste déroulante.
    await fenetre.getByRole("button", { name: /Personne morale/ }).click();
    // Un champ grisé invite à chercher comment le remplir ; un champ absent
    // dit que la question ne se pose pas.
    await expect(fenetre.getByLabel("Coordonnées", { exact: true })).toHaveCount(0);
    await expect(
      fenetre.getByText("Une personne morale ne porte pas de contact nommé"),
    ).toBeVisible();
  });
});

test.describe("Vue 24 — fiche tiers", () => {
  test("les rattachements sont listés, et le temps déclaré chiffré", async ({ page }) => {
    await serveur(page, {
      session: SESSION_REFERENTIELS,
      reponses: { [`/api/tiers/${FICHE_TIERS.id}`]: { corps: FICHE_TIERS } },
    });
    await page.goto(`/tiers/${FICHE_TIERS.id}`);

    await expect(page.getByRole("heading", { name: "Presta SA", level: 1 })).toBeVisible();
    await expect(page.getByText("Refonte du portail citoyen")).toBeVisible();
    await expect(page.getByText("Audit d'accessibilité")).toBeVisible();
    // Le nombre de saisies est porté deux fois : sous le compteur d'heures
    // (`kpi-sub` de la maquette 24) et dans la fiche d'informations. On vise
    // le compteur, sinon la recherche est ambiguë.
    await expect(page.locator(".kpi-sub").filter({ hasText: "18 saisies" })).toBeVisible();
  });

  test("le contact nommé n'apparaît pas pour une personne morale", async ({ page }) => {
    await serveur(page, {
      session: SESSION_REFERENTIELS,
      reponses: { [`/api/tiers/${FICHE_TIERS.id}`]: { corps: FICHE_TIERS } },
    });
    await page.goto(`/tiers/${FICHE_TIERS.id}`);

    /*
     * `RG-TRS-01` sur la fiche : la LIGNE « Contact nommé » existe et dit
     * qu'elle est sans objet. La supprimer laisserait croire à un oubli de
     * saisie ; c'est le choix de la maquette 24.
     *
     * L'ancienne seconde assertion visait « Courriel », un mot que le produit
     * n'emploie nulle part : elle passait sans rien vérifier.
     */
    await expect(page.getByText("Contact nommé")).toBeVisible();
    await expect(page.getByText("Sans objet pour une personne morale")).toBeVisible();
    // L'adresse subsiste, mais elle est annoncée générique — pas nominative.
    await expect(page.getByText("Email générique")).toBeVisible();
  });

  test("sans rattachement, chaque section le dit", async ({ page }) => {
    await serveur(page, {
      session: SESSION_REFERENTIELS,
      reponses: { [`/api/tiers/${FICHE_TIERS_VIDE.id}`]: { corps: FICHE_TIERS_VIDE } },
    });
    await page.goto(`/tiers/${FICHE_TIERS_VIDE.id}`);

    await expect(page.getByText("Aucun projet rattaché")).toBeVisible();
    await expect(page.getByText("Aucune tâche assignée")).toBeVisible();
  });

  test("le bilan d'impact précède la confirmation", async ({ page }) => {
    await serveur(page, {
      session: SESSION_REFERENTIELS,
      reponses: {
        [`/api/tiers/${FICHE_TIERS.id}`]: { corps: FICHE_TIERS },
        "/impact": { corps: IMPACT_VIDE },
      },
    });
    await page.goto(`/tiers/${FICHE_TIERS.id}`);
    await page.getByRole("button", { name: "Supprimer", exact: true }).click();
    const fenetre = page.getByRole("dialog");

    /*
     * La maquette 24 introduit le bilan avant toute confirmation, et son pied
     * rappelle qu'il y a deux issues. Le test attendait « Le bilan est établi
     * avant le geste », une phrase absente du produit.
     */
    await expect(
      fenetre.getByText("Voici ce à quoi ce tiers est rattaché aujourd'hui."),
    ).toBeVisible();
    await expect(fenetre.getByText("Deux issues, deux conséquences")).toBeVisible();
    // Le compte de saisies chiffre l'enjeu, il n'est pas seulement évoqué.
    await expect(fenetre.getByText("18", { exact: true })).toBeVisible();
  });
});

test.describe("Vues 25 et 26 — clients", () => {
  test("la liste porte le portefeuille et le statut", async ({ page }) => {
    await serveur(page, {
      session: SESSION_REFERENTIELS,
      reponses: { "/api/clients": { corps: CLIENTS } },
    });
    await page.goto("/clients");

    await expect(page.getByText("Direction de la relation citoyen")).toBeVisible();
    await expect(page.getByText("1 projet")).toBeVisible();

    /*
     * Le filtre de statut est sur « Actifs » d'emblée — c'est l'ordre des
     * options de la maquette 25. Le client inactif ne se voit qu'en le
     * demandant ; le test le supposait affiché sans rien demander.
     */
    await expect(page.getByText("Association des usagers")).toHaveCount(0);
    await page.getByLabel("Statut", { exact: true }).selectOption("");

    await expect(page.getByText("Association des usagers")).toBeVisible();
    await expect(page.getByText("Aucun projet rattaché")).toBeVisible();
    await expect(page.getByText("Inactif", { exact: true })).toBeVisible();
  });

  test("la fiche montre le portefeuille", async ({ page }) => {
    await serveur(page, {
      session: SESSION_REFERENTIELS,
      reponses: { [`/api/clients/${FICHE_CLIENT.id}`]: { corps: FICHE_CLIENT } },
    });
    await page.goto(`/clients/${FICHE_CLIENT.id}`);

    await expect(
      page.getByRole("heading", { name: "Direction de la relation citoyen", level: 1 }),
    ).toBeVisible();
    await expect(page.getByText("Guichet unique")).toBeVisible();
  });

  test("DÉTACHER N'EST PAS SUPPRIMER — et la fenêtre le dit deux fois", async ({ page }) => {
    await serveur(page, {
      session: SESSION_REFERENTIELS,
      reponses: {
        [`/api/clients/${FICHE_CLIENT.id}`]: { corps: FICHE_CLIENT },
        "/impact": { corps: IMPACT_VIDE },
      },
    });
    await page.goto(`/clients/${FICHE_CLIENT.id}`);
    await page.getByRole("button", { name: "Supprimer", exact: true }).click();

    // Une fois dans le pied, à côté du bouton rouge ; une fois dans le corps,
    // avec le nombre exact de projets concernés.
    await expect(page.getByText("Les projets sont détachés, pas supprimés")).toBeVisible();
    await expect(
      page.getByText("2 projets perdront leur bénéficiaire. Ils ne sont pas supprimés."),
    ).toBeVisible();
  });

  test("un client sans projet le dit, et sa fiche porte le bandeau d'inactivité", async ({
    page,
  }) => {
    await serveur(page, {
      session: SESSION_REFERENTIELS,
      reponses: { [`/api/clients/${FICHE_CLIENT_VIDE.id}`]: { corps: FICHE_CLIENT_VIDE } },
    });
    await page.goto(`/clients/${FICHE_CLIENT_VIDE.id}`);

    await expect(page.getByText(/Ce client est inactif/)).toBeVisible();
    await expect(page.getByText("Aucun projet rattaché")).toBeVisible();
  });
});
