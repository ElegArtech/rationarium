import { test, expect } from "@playwright/test";
import { serveur, SESSION_LECTURE } from "./fixtures/projets.js";
import {
  SESSION_REFERENTIELS,
  MATRICE,
  REFERENTIEL,
  DETENTEURS,
  DETENTEURS_EXPERTS,
  EXPORT_MATRICE,
  LISTE_TIERS,
  TIERS_ARCHIVE,
  FICHE_TIERS,
  FICHE_TIERS_VIDE,
  CLIENTS,
  FICHE_CLIENT,
  FICHE_CLIENT_VIDE,
  IMPACT_VIDE,
} from "./fixtures/referentiels.js";
/*
 * Les trois trous de la vague 7-4 touchent les vues 20, 22 et 29.
 * `occupations.e2e.spec.ts` et `administration.e2e.spec.ts` étant tenus par
 * d'autres agents pendant cette vague, leurs contrôles vivent ici, avec leurs
 * jeux d'origine.
 */
import { SESSION_ADMIN, ARBORESCENCE } from "./fixtures/administration.js";
import { CAMILLE, PLANNING_TELETRAVAIL, REGLES_TELETRAVAIL } from "./fixtures/occupations.js";

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

/**
 * Vue 22 — les deux capacités serveur que la vue n'offrait pas.
 *
 * `GET /competences/export` et `GET /competences/:id/detenteurs` vivaient dans
 * `SANS_CLIENT` : gardées, testées côté serveur, et hors d'atteinte depuis un
 * écran. Ce qui suit vérifie ce que chacune **promet**, pas seulement qu'elle
 * répond.
 */
test.describe("Vue 22 — export de la matrice et détenteurs", () => {
  const reponses = {
    "/api/competences/matrice": { corps: MATRICE },
    "/api/competences": { corps: REFERENTIEL },
  };

  test("EX-CMP-08 — L'EXPORT PORTE LA MATRICE, PAS LE RÉFÉRENTIEL", async ({ page }) => {
    /*
     * Le défaut que ce contrôle ferme : le bouton « Export CSV » de la barre
     * de filtres de la matrice pointait `/imports/export/competences`, qui
     * exporte le RÉFÉRENTIEL — la liste des compétences, sans un seul agent.
     * `EX-CMP-08` dit « exporter la matrice ». On vise donc la route, pas
     * l'apparence du bouton.
     */
    let demande: string | null = null;
    await serveur(page, { session: SESSION_REFERENTIELS, reponses });
    await page.route("**/api/competences/export", (route) => {
      demande = new URL(route.request().url()).pathname;
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(EXPORT_MATRICE),
      });
    });
    await page.goto("/competences");

    await page.getByRole("button", { name: "Export CSV", exact: true }).click();

    // Le brief de la vue 22 nomme l'état de retour mot pour mot.
    await expect(page.getByText("Export CSV téléchargé.")).toBeVisible();
    expect(demande).toBe("/api/competences/export");
  });

  test("EX-CMP-08 — les deux exports portent DEUX NOMS distincts", async ({ page }) => {
    await serveur(page, { session: SESSION_REFERENTIELS, reponses });
    await page.goto("/competences");

    /*
     * Les deux capacités existent et n'exportent pas la même chose : la
     * matrice (agents × compétences) et le référentiel (le catalogue,
     * réimportable). Deux boutons portant tous deux « Export CSV » auraient
     * rendu l'un des deux impossible à demander.
     */
    await expect(page.getByRole("button", { name: "Export CSV", exact: true })).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Exporter le référentiel", exact: true }),
    ).toHaveAttribute("href", "/api/imports/export/competences");
  });

  test("RG-GEN-06 — sans skills:export, aucun export n'est proposé", async ({ page }) => {
    await serveur(page, { session: SESSION_LECTURE, reponses });
    await page.goto("/competences");

    // Ni proposé puis refusé : absent.
    await expect(page.getByRole("button", { name: "Export CSV", exact: true })).toHaveCount(0);
    await expect(
      page.getByRole("link", { name: "Exporter le référentiel", exact: true }),
    ).toHaveCount(0);
  });

  test("EX-CMP-10 — le référentiel dit QUI détient la compétence, et à quel niveau", async ({
    page,
  }) => {
    await serveur(page, {
      session: SESSION_REFERENTIELS,
      reponses: { ...reponses, "/api/competences/s1/detenteurs": { corps: DETENTEURS } },
    });
    await page.goto("/competences");
    await page.getByRole("button", { name: "Référentiel" }).click();
    await page.getByRole("button", { name: "Voir les détenteurs de Cartographie SIG" }).click();

    const fenetre = page.getByRole("dialog");
    await expect(fenetre.getByText("Cartographie SIG", { exact: true })).toBeVisible();
    /*
     * La fenêtre ne réaffiche AUCUN ratio, et ce contrôle le fige. Le
     * référentiel compte 1 détenteur pour cette compétence (« Partielle 1/3 »)
     * là où la route en rend 3 : `referentiel()` compte toutes les lignes de
     * `user_skills`, `detenteurs()` écarte les comptes désactivés, `matrice()`
     * y ajoute le périmètre. Recopier « 1/3 » au-dessus de trois noms aurait
     * mis une contradiction à l'écran sans qu'aucune moitié soit fausse.
     */
    await expect(fenetre.getByText("Partielle 1/3")).toHaveCount(0);
    await expect(fenetre.getByText("Driss Amrani")).toBeVisible();
    await expect(fenetre.getByText("Sofia Zaidi")).toBeVisible();
    await expect(fenetre.getByText("Léa Vidal")).toBeVisible();
    await expect(fenetre.getByText("3 personnes affichées.")).toBeVisible();
  });

  test("EX-CMP-10 — les niveaux hauts d'abord, quel que soit l'ordre du serveur", async ({
    page,
  }) => {
    /*
     * Le serveur ordonne par nom de famille. Devant un écart de couverture on
     * cherche d'abord les niveaux hauts : le classement est refait ici. Le jeu
     * d'essai est construit pour que les deux ordres diffèrent — Amrani
     * (expert) est premier alphabétiquement, Zaidi (maître) dernier.
     */
    await serveur(page, {
      session: SESSION_REFERENTIELS,
      reponses: { ...reponses, "/api/competences/s1/detenteurs": { corps: DETENTEURS } },
    });
    await page.goto("/competences");
    await page.getByRole("button", { name: "Référentiel" }).click();
    await page.getByRole("button", { name: "Voir les détenteurs de Cartographie SIG" }).click();

    const noms = page.getByRole("dialog").locator(".sk-chip");
    await expect(noms).toHaveCount(3);
    await expect(noms.nth(0)).toContainText("Sofia Zaidi");
    await expect(noms.nth(1)).toContainText("Driss Amrani");
    await expect(noms.nth(2)).toContainText("Léa Vidal");
  });

  test("EX-CMP-10 — LE FILTRE DE NIVEAU EST UN PLANCHER, et il le dit", async ({ page }) => {
    /*
     * Le serveur prend `niveauMinimum` et rend tout ce qui est au-dessus :
     * demander « Expert » rend les experts ET les maîtres. Un libellé
     * « Niveau : Expert » aurait décrit une réponse que la route ne rend pas.
     */
    let demandee: string | null = null;
    await serveur(page, { session: SESSION_REFERENTIELS, reponses });
    await page.route("**/api/competences/s1/detenteurs**", (route) => {
      const requete = new URL(route.request().url());
      demandee = requete.searchParams.get("niveauMinimum");
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(demandee === "expert" ? DETENTEURS_EXPERTS : DETENTEURS),
      });
    });
    await page.goto("/competences");
    await page.getByRole("button", { name: "Référentiel" }).click();
    await page.getByRole("button", { name: "Voir les détenteurs de Cartographie SIG" }).click();

    const fenetre = page.getByRole("dialog");
    await expect(fenetre.getByText("Léa Vidal")).toBeVisible();

    await fenetre.getByLabel("Niveau minimum").selectOption("expert");

    /* L'effet AVANT la variable : lire `demandee` tout de suite reviendrait à
       la lire avant l'aller-retour réseau, et le contrôle passerait au vert
       ou au rouge selon la charge de la machine. */
    await expect(fenetre.getByText("Léa Vidal")).toHaveCount(0);
    expect(demandee).toBe("expert");
    // Le maître reste : c'est ce que « plancher » veut dire.
    await expect(fenetre.getByText("Sofia Zaidi")).toBeVisible();
    await expect(fenetre.getByText("Driss Amrani")).toBeVisible();
    await expect(fenetre.getByText("Le filtre est un plancher")).toBeVisible();
  });

  test("RG-GEN-04 — personne au-dessus du plancher : la fenêtre l'écrit et dit quoi faire", async ({
    page,
  }) => {
    await serveur(page, {
      session: SESSION_REFERENTIELS,
      reponses: { ...reponses, "/api/competences/s1/detenteurs": { corps: [] } },
    });
    await page.goto("/competences");
    await page.getByRole("button", { name: "Référentiel" }).click();
    await page.getByRole("button", { name: "Voir les détenteurs de Cartographie SIG" }).click();

    const fenetre = page.getByRole("dialog");
    // Jamais une zone blanche : l'absence s'explique et propose la suite.
    await expect(fenetre.getByText("Personne ne détient cette compétence")).toBeVisible();
    await expect(
      fenetre.getByText("Assignez-la depuis la matrice ou depuis la vue par utilisateur."),
    ).toBeVisible();
  });

  test("RG-GEN-06 — sans skills:read, les détenteurs ne sont pas proposés", async ({ page }) => {
    await serveur(page, { session: SESSION_LECTURE, reponses });
    await page.goto("/competences");
    await page.getByRole("button", { name: "Référentiel" }).click();

    await expect(
      page.getByRole("button", { name: "Voir les détenteurs de Cartographie SIG" }),
    ).toHaveCount(0);
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
    /*
     * Le projet paraît DEUX fois désormais : en lien dans la liste des
     * rattachements, et en colonne de la tâche assignée — la colonne était
     * un `<div/>` vide avant. On vise donc les deux distinctement plutôt que
     * d'affaiblir l'assertion, qui sinon cesserait de dire lequel manque.
     */
    await expect(
      page.getByRole("link", { name: "Refonte du portail citoyen" }),
    ).toBeVisible();
    await expect(page.getByText("Audit d'accessibilité")).toBeVisible();
    // Le nombre de saisies est porté deux fois : sous le compteur d'heures
    // (`kpi-sub` de la maquette 24) et dans la fiche d'informations. On vise
    // le compteur, sinon la recherche est ambiguë.
    /*
     * `heuresDeclarees` est la SOMME, `saisies` le NOMBRE de lignes. La fiche
     * affichait la même valeur aux deux places — 18 h ET « sur 18 saisies » —
     * donc fausse dans l'une des deux à coup sûr. Le contrôle les distingue :
     * trois saisies pour dix-huit heures.
     */
    await expect(page.locator(".kpi-sub").filter({ hasText: "3 saisies" })).toBeVisible();
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
    // Le compte de SAISIES chiffre l'enjeu, il n'est pas seulement évoqué —
    // et c'est bien le nombre de lignes, pas la somme des heures.
    await expect(fenetre.getByText("3", { exact: true })).toBeVisible();
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
    // La ligne de liste porte la forme COURTE — la colonne est étroite. La
    // forme longue reste celle de l'état vide de la fiche.
    await expect(page.getByText("Aucun projet", { exact: true })).toBeVisible();
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

/*
 * Les trois trous de la vague 7-4, vérifiés de bout en bout.
 *
 * `occupations.e2e.spec.ts` et `administration.e2e.spec.ts` étant tenus par
 * d'autres agents pendant cette vague, les contrôles des vues 20 et 29 vivent
 * ici. Ils y sont à leur place : ce fichier couvre déjà la vue 22, et les
 * trois portent la même règle — un filtre ou un tri est un paramètre du point
 * d'entrée, pas une propriété de l'écran.
 */

test.describe("EX-CMP-07 — filtres et tris partent au SERVEUR", () => {
  const reponses = {
    "/api/competences/matrice": { corps: MATRICE },
    "/api/competences": { corps: REFERENTIEL },
  };

  test("EX-CMP-07 — le filtre de niveau et le tri de la matrice sont dans la REQUÊTE", async ({
    page,
  }) => {
    /*
     * Le contrôle qui distingue « trié » de « trié à l'écran ». Il ne regarde
     * pas l'ordre affiché — un tri client le produirait aussi — il regarde ce
     * que la requête EMPORTE. C'est la seule chose que le portage change tant
     * que la liste tient en mémoire, et c'est celle qui compte à la première
     * pagination.
     */
    const requetes: string[] = [];
    await serveur(page, { session: SESSION_REFERENTIELS, reponses });
    await page.route(
      (url) => url.pathname === "/api/competences/matrice",
      (route) => {
        requetes.push(new URL(route.request().url()).search);
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(MATRICE),
        });
      },
    );
    await page.goto("/competences");

    await page.getByLabel("Niveau", { exact: true }).selectOption("expert");
    await page.getByLabel("Tri", { exact: true }).selectOption("nombre");
    await page.getByPlaceholder("Rechercher un collaborateur…").fill("Driss");

    await expect
      .poll(() => requetes.some((q) => q.includes("niveau=expert")))
      .toBe(true);
    await expect.poll(() => requetes.some((q) => q.includes("tri=nombre"))).toBe(true);
    await expect.poll(() => requetes.some((q) => q.includes("recherche=Driss"))).toBe(true);
  });

  test("EX-CMP-07 — le référentiel a SA barre de filtres, et son tri par couverture", async ({
    page,
  }) => {
    /*
     * La barre était enfermée dans la branche « matrice » : sur l'onglet
     * Référentiel, `categorie` et `recherche` gardaient la dernière valeur
     * posée ailleurs, sans un seul contrôle pour les changer. Et le tri par
     * couverture — le ratio de `RG-CMP-03`, celui qui répond à la question du
     * module — n'existait nulle part.
     */
    const requetes: string[] = [];
    await serveur(page, { session: SESSION_REFERENTIELS, reponses });
    await page.route(
      (url) => url.pathname === "/api/competences",
      (route) => {
        requetes.push(new URL(route.request().url()).search);
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(REFERENTIEL),
        });
      },
    );
    await page.goto("/competences");
    await page.getByRole("button", { name: "Référentiel", exact: true }).click();

    const tri = page.getByLabel("Tri", { exact: true });
    await expect(tri).toBeVisible();
    /*
     * Le vocabulaire du référentiel, pas celui de la matrice : la couverture
     * range des compétences, le nombre de compétences range des agents.
     *
     * Les options se visent par `locator("option")` et non `getByRole` : un
     * `<select>` natif n'expose PAS ses options comme rôle `option` dans
     * l'arbre d'accessibilité de Chromium. Un `getByRole` y renvoie zéro dans
     * tous les cas — donc l'assertion « ce tri n'est pas là » passait sans
     * rien mesurer, et celle qui compte l'a fait échouer. Faux témoin de la
     * même famille que l'assertion portée sur le conteneur.
     */
    await expect(tri.locator("option[value='couverture']")).toHaveCount(1);
    await expect(tri.locator("option[value='nombre']")).toHaveCount(0);
    await expect(tri.locator("option[value='competence']")).toHaveCount(0);

    await tri.selectOption("couverture");
    await expect.poll(() => requetes.some((q) => q.includes("tri=couverture"))).toBe(true);
  });
});

test.describe("EX-ORG-05 — le filtre de l'organisation part au SERVEUR", () => {
  test("EX-ORG-05 — le département choisi et la recherche sont dans la REQUÊTE", async ({
    page,
  }) => {
    /*
     * Le filtre vivait dans la vue et n'y couvrait qu'une des deux racines de
     * l'arborescence : le bloc « Départements sans direction » restait entier.
     * Le portage se vérifie là où le défaut était impossible à voir — dans ce
     * que la requête emporte.
     */
    const requetes: string[] = [];
    await serveur(page, {
      session: SESSION_ADMIN,
      reponses: { "/api/organisation": { corps: ARBORESCENCE } },
    });
    await page.route(
      (url) => url.pathname === "/api/organisation",
      (route) => {
        requetes.push(new URL(route.request().url()).search);
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(ARBORESCENCE),
        });
      },
    );
    await page.goto("/departements");

    const filtre = page.getByLabel("Filtrer par département");
    // La liste des choix vient du serveur, à part : elle porte les DEUX
    // départements, celui sous direction et l'orphelin. Peuplée depuis
    // l'arborescence filtrée, elle se serait vidée à la première sélection.
    await expect(filtre.locator("option")).toHaveCount(3);

    await filtre.selectOption("dep2");
    await expect.poll(() => requetes.some((q) => q.includes("departementId=dep2"))).toBe(true);

    await page.getByPlaceholder("Rechercher…").fill("Mission");
    await expect.poll(() => requetes.some((q) => q.includes("recherche=Mission"))).toBe(true);
  });
});

test.describe("EX-TLT-04 — une règle de télétravail se modifie et se supprime", () => {
  const reponses = {
    "/api/teletravail": { corps: PLANNING_TELETRAVAIL },
    "/api/teletravail/regles": { corps: REGLES_TELETRAVAIL },
  };

  test("EX-TLT-04 — la règle porte ses trois commandes, et la désactivation EMPORTE la version lue", async ({
    page,
  }) => {
    /*
     * `TeleworkRule.active` avait un défaut à `true` et aucun chemin ne
     * l'écrivait : la maquette réservait deux colonnes d'actions à droite de
     * chaque règle, vides parce que le serveur ne savait ni modifier, ni
     * désactiver, ni supprimer.
     *
     * L'assertion porte sur le CORPS envoyé, pas seulement sur le clic : c'est
     * `version` qui prouve que la lecture et l'écriture se raccordent — le
     * raccord entre deux moitiés justes est ce qui casse, jamais les moitiés.
     */
    const corps: unknown[] = [];
    await serveur(page, { session: CAMILLE, reponses });
    await page.route(
      (url) => url.pathname === "/api/teletravail/regles/r1",
      (route) => {
        corps.push({ methode: route.request().method(), donnees: route.request().postDataJSON() });
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ ...REGLES_TELETRAVAIL[0], active: false, version: 2 }),
        });
      },
    );
    await page.goto("/teletravail");
    await page.getByRole("button", { name: "Configurer jours fixes" }).click();

    const mardi = page.locator(".rule").filter({ hasText: "Mardi" });
    await mardi.getByRole("button", { name: /^Désactiver la règle/ }).click();

    await expect.poll(() => corps.length).toBe(1);
    expect(corps[0]).toEqual({
      methode: "PATCH",
      // `version: 1`, celle que `GET /teletravail/regles` a rendue.
      donnees: { version: 1, active: false },
    });
  });

  test("EX-TLT-04 — la règle INACTIVE se réactive, et le libellé de la commande le dit", async ({
    page,
  }) => {
    /*
     * Le versant nominal. Sans lui, une vue qui n'enverrait jamais que
     * `active: false` passerait le test précédent.
     */
    const corps: unknown[] = [];
    await serveur(page, { session: CAMILLE, reponses });
    await page.route(
      (url) => url.pathname === "/api/teletravail/regles/r2",
      (route) => {
        corps.push(route.request().postDataJSON());
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ ...REGLES_TELETRAVAIL[1], active: true, version: 4 }),
        });
      },
    );
    await page.goto("/teletravail");
    await page.getByRole("button", { name: "Configurer jours fixes" }).click();

    const jeudi = page.locator(".rule").filter({ hasText: "Jeudi" });
    await jeudi.getByRole("button", { name: /^Activer la règle/ }).click();
    await expect.poll(() => corps.length).toBe(1);
    expect(corps[0]).toEqual({ version: 3, active: true });
  });

  test("EX-TLT-04 — la suppression se confirme, et la fenêtre dit ce qu'elle NE fait PAS", async ({
    page,
  }) => {
    const appels: string[] = [];
    await serveur(page, { session: CAMILLE, reponses });
    await page.route(
      (url) => url.pathname === "/api/teletravail/regles/r1",
      (route) => {
        appels.push(route.request().method());
        return route.fulfill({ status: 204, body: "" });
      },
    );
    await page.goto("/teletravail");
    await page.getByRole("button", { name: "Configurer jours fixes" }).click();
    await page
      .locator(".rule")
      .filter({ hasText: "Mardi" })
      .getByRole("button", { name: /^Supprimer la règle/ })
      .click();

    // Les jours déjà générés restent : le découvrir après coup, ou croire
    // qu'ils ont disparu, est le genre d'apprentissage qu'on ne fait qu'une
    // fois et mal.
    await expect(page.getByText(/Les jours déjà générés au calendrier sont conservés/)).toBeVisible();
    // Rien n'est parti tant que la confirmation n'est pas donnée.
    expect(appels).toEqual([]);

    // La confirmation est une SECONDE fenêtre par-dessus celle des règles : on
    // la vise par ce qu'elle est seule à dire, sinon le sélecteur attrape les
    // deux et le clic part au hasard.
    await page
      .getByRole("dialog")
      .filter({ hasText: "Les jours déjà générés" })
      .getByRole("button", { name: "Supprimer", exact: true })
      .click();
    await expect.poll(() => appels).toEqual(["DELETE"]);
  });

  test("EX-TLT-04 — MODIFIER charge le formulaire de la règle, et enregistre la nouvelle valeur", async ({
    page,
  }) => {
    const corps: unknown[] = [];
    await serveur(page, { session: CAMILLE, reponses });
    await page.route(
      (url) => url.pathname === "/api/teletravail/regles/r1",
      (route) => {
        corps.push(route.request().postDataJSON());
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ ...REGLES_TELETRAVAIL[0], jourSemaine: 3, version: 2 }),
        });
      },
    );
    await page.goto("/teletravail");
    await page.getByRole("button", { name: "Configurer jours fixes" }).click();
    await page
      .locator(".rule")
      .filter({ hasText: "Mardi" })
      .getByRole("button", { name: /^Modifier la règle/ })
      .click();

    // Le formulaire s'est chargé de la règle : c'est ce qui distingue
    // « modifier » de « créer une seconde règle à côté ».
    await expect(page.getByLabel("Date de début")).toHaveValue("2026-03-01");
    await page.getByLabel("Jour de la semaine").selectOption("3");
    await page.getByRole("button", { name: "Enregistrer", exact: true }).click();

    await expect.poll(() => corps.length).toBe(1);
    expect(corps[0]).toMatchObject({ version: 1, jourSemaine: 3, dateDebut: "2026-03-01" });
  });

  test("RG-GEN-06 — sans telework:manage_rules, aucune commande n'est proposée", async ({
    page,
  }) => {
    await serveur(page, {
      session: {
        ...CAMILLE,
        permissions: CAMILLE.permissions.filter(
          (p: string) => p !== "telework:manage_rules",
        ),
      },
      reponses,
    });
    await page.goto("/teletravail");

    /*
     * La fenêtre des règles est elle-même gardée par `telework:manage_rules` :
     * sans la permission, elle ne s'ouvre pas, donc les trois commandes ne sont
     * pas atteignables — ce qui est le comportement voulu, et ce que ce
     * contrôle fixe. Le calendrier, lui, reste consultable.
     */
    await expect(page.getByRole("button", { name: "Configurer jours fixes" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^Désactiver la règle/ })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^Supprimer la règle/ })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^Modifier la règle/ })).toHaveCount(0);
  });
});
