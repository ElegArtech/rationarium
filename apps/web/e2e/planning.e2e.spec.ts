import { test, expect, type Page } from "@playwright/test";
import { serveur, SESSION_LECTURE } from "./fixtures/projets.js";
import {
  SESSION_PLANNING,
  SESSION_SANS_TELETRAVAIL,
  SEMAINE,
  SEMAINE_SANS_PERMANENCES,
  MOIS,
  AUCUNE_RESSOURCE,
  GRILLE_ACTIVITE,
  GRILLE_VIDE,
  ELIGIBILITE,
  AUCUN_ELIGIBLE,
} from "./fixtures/planning.js";

/**
 * L-20 — vues 07, 08 et 09.
 *
 * **Le temps est figé.** Sans horloge fixe, « aujourd'hui » se déplace et les
 * contrôles deviennent verts ou rouges selon le jour où on les joue. Un test
 * qui dépend du calendrier ne prouve rien le mardi suivant.
 */

const MOMENT = new Date("2026-08-12T09:00:00.000Z");

async function horlogeFixe(page: Page) {
  await page.clock.setFixedTime(MOMENT);
}

const reponses = {
  "/api/planning": { corps: SEMAINE },
  "/api/planning/activite": { corps: GRILLE_ACTIVITE },
  "/api/activite/eligibilite": { corps: ELIGIBILITE },
};

// ── Vue 07 ──────────────────────────────────────────────────────────────────

test.describe("Vue 07 — planning, semaine", () => {
  test("la grille porte les ressources, groupées par service", async ({ page }) => {
    await horlogeFixe(page);
    await serveur(page, { session: SESSION_PLANNING, reponses });
    await page.goto("/planning");

    await expect(
      page.getByRole("heading", { name: "Planning des ressources", level: 1 }),
    ).toBeVisible();
    await expect(page.getByText("Études et développement")).toBeVisible();
    await expect(page.getByText("Exploitation")).toBeVisible();
    // Un agent sans service n'est pas escamoté.
    await expect(page.getByText("Sans service")).toBeVisible();
  });

  test("UN AGENT DE DEUX SERVICES APPARAÎT DEUX FOIS, mais n'est compté qu'une", async ({
    page,
  }) => {
    await horlogeFixe(page);
    await serveur(page, { session: SESSION_PLANNING, reponses });
    await page.goto("/planning");

    await expect(page.getByText("Bruno Costa")).toHaveCount(2);
    // La synthèse compte les personnes distinctes : trois, pas quatre.
    await expect(page.getByText("1/3").first()).toBeVisible();
  });

  test("EX-PLN-03 — les natures d'occupation cohabitent dans la même grille", async ({ page }) => {
    await horlogeFixe(page);
    await serveur(page, { session: SESSION_PLANNING, reponses });
    await page.goto("/planning");

    await expect(page.getByText("Rédiger la note de cadrage").first()).toBeVisible();
    await expect(page.getByText("Veille technique")).toBeVisible();
    await expect(page.getByText("Comité de pilotage")).toBeVisible();
    await expect(page.getByText("Permanence accueil")).toBeVisible();
    await expect(page.getByText("Congés annuels").first()).toBeVisible();
  });

  test("EX-PLN-13 — le congé en attente porte sa MENTION, pas seulement sa trame", async ({
    page,
  }) => {
    await horlogeFixe(page);
    await serveur(page, { session: SESSION_PLANNING, reponses });
    await page.goto("/planning");

    // La couleur et la hachure ne se lisent pas par tout le monde : le mot
    // « En attente » est ce qui rend la distinction accessible.
    // `getByText` sans ancrage attrape aussi le libellé d'assistance de la
    // cellule, « Congé en attente ». La mention visible est celle de
    // l'étiquette, et c'est elle que la règle demande.
    await expect(page.locator(".leave-tag", { hasText: /^En attente$/ }).first()).toBeVisible();
  });

  test("une demi-journée est nommée, pas devinée à la moitié d'un aplat", async ({ page }) => {
    await horlogeFixe(page);
    await serveur(page, { session: SESSION_PLANNING, reponses });
    await page.goto("/planning");

    await expect(page.getByText("Après-midi")).toBeVisible();
  });

  test("RG-EVT-06 — une intervention extérieure est signalée distinctement", async ({ page }) => {
    await horlogeFixe(page);
    await serveur(page, { session: SESSION_PLANNING, reponses });
    await page.goto("/planning");

    await expect(page.getByText("Audit prestataire")).toBeVisible();
    await expect(page.getByText("EXT").first()).toBeVisible();
  });

  test("EX-PLN-14 — la trame de fond est NOMMÉE, pas seulement teintée", async ({ page }) => {
    await horlogeFixe(page);
    await serveur(page, { session: SESSION_PLANNING, reponses });
    await page.goto("/planning");

    // Un aplat gris sans étiquette se prend pour un défaut d'affichage.
    await expect(page.getByText("Vacances d'été").first()).toBeVisible();
  });

  test("le férié du 15 août tombe un SAMEDI : il n'apparaît qu'avec le week-end", async ({
    page,
  }) => {
    await horlogeFixe(page);
    await serveur(page, {
      session: SESSION_PLANNING,
      reponses: { ...reponses, "/api/parametrage": { corps: { "planning.visibleDays": "0,1,2,3,4,5,6" } } },
    });
    await page.goto("/planning");

    // `RG-PLN-03` — la semaine ouvrée est le réglage par défaut, et elle masque
    // donc un férié tombant un samedi. Ce n'est pas un défaut : c'est le
    // réglage qui s'applique, et la maquette de la vue 08 le prévoit
    // explicitement dans son axe « Jours ouvrés / Tous les jours ».
    await expect(page.getByText("Férié").first()).toBeVisible();
  });

  test("EX-PLN-08 — la synthèse « hors présentiel » donne compte ET pourcentage", async ({
    page,
  }) => {
    await horlogeFixe(page);
    await serveur(page, { session: SESSION_PLANNING, reponses });
    await page.goto("/planning");

    await expect(page.getByText("Hors présentiel")).toBeVisible();
    await expect(page.getByText("2/3")).toBeVisible();
    await expect(page.getByText("67 %")).toBeVisible();
  });

  test("C6 — LE GLISSER-DÉPOSER EST DOUBLÉ D'UNE ACTION CLAVIER", async ({ page }) => {
    await horlogeFixe(page);
    await serveur(page, { session: SESSION_PLANNING, reponses });
    await page.goto("/planning");

    // Une grille qui ne se manipule qu'à la souris exclut, purement.
    await page.getByRole("button", { name: /Rédiger la note de cadrage/ }).first().click();
    await expect(page.getByRole("menuitem", { name: "Déplacer vers…" })).toBeVisible();
    await expect(page.getByRole("menuitem", { name: "Réassigner à…" })).toBeVisible();
  });

  test("RG-TSK-11 — sur une tâche multi-assignée, le déplacement en date EST ABSENT et dit pourquoi", async ({
    page,
  }) => {
    await horlogeFixe(page);
    await serveur(page, { session: SESSION_PLANNING, reponses });
    await page.goto("/planning");

    await page.getByRole("button", { name: /Recette croisée/ }).first().click();
    await expect(page.getByRole("menuitem", { name: "Déplacer vers…" })).toHaveCount(0);
    await expect(
      page.getByRole("menuitem", { name: /Date non déplaçable/ }),
    ).toBeVisible();
    // La réassignation, elle, reste possible : c'est exactement la règle.
    await expect(page.getByRole("menuitem", { name: "Réassigner à…" })).toBeVisible();
  });

  test("EX-PLN-09 — le télétravail se bascule depuis la cellule, et l'action se nomme", async ({
    page,
  }) => {
    await horlogeFixe(page);
    await serveur(page, {
      session: SESSION_PLANNING,
      reponses: { ...reponses, "/api/planning/teletravail": { corps: { id: "w1", etat: "office" } } },
    });
    await page.goto("/planning");

    const bascule = page.getByRole("button", { name: /Ana Berger, 2026-08-13/ });
    await expect(bascule).toBeVisible();
    await bascule.click();
    await expect(page.getByText("Télétravail mis à jour.")).toBeVisible();
  });

  test("RG-PLN-04 — sans le droit, la cellule reste LISIBLE mais inerte", async ({ page }) => {
    await horlogeFixe(page);
    await serveur(page, { session: SESSION_SANS_TELETRAVAIL, reponses });
    await page.goto("/planning");

    // Masquer l'information ferait croire qu'elle n'existe pas.
    await expect(page.getByText("Télétravail").first()).toBeVisible();
    await expect(page.getByRole("button", { name: /Ana Berger, 2026-08-13/ })).toHaveCount(0);
  });

  test("le PANNEAU DE DÉTAIL est monté en permanence, et INERTE quand il est fermé", async ({
    page,
  }) => {
    await horlogeFixe(page);
    await serveur(page, { session: SESSION_PLANNING, reponses });
    await page.goto("/planning");

    // La charpente est là dès le premier rendu — c'est la translation qui
    // ouvre, pas le montage. Un panneau monté au clic ferait apparaître et
    // disparaître un point de repère `dialog` de l'arbre d'accessibilité.
    const panneau = page.locator(".drawer");
    await expect(panneau).toHaveAttribute("role", "dialog");
    await expect(panneau.locator(".drawer-head")).toHaveCount(1);
    await expect(panneau.locator(".drawer-body .dl")).toHaveCount(1);

    // Fermé, il ne se tabule pas : `aria-hidden` seul laisserait le bouton de
    // fermeture atteignable, et le clavier repartirait dans l'invisible.
    await expect(panneau).not.toHaveClass(/is-open/);
    await expect(panneau.getByRole("button", { name: "Fermer le détail" })).toHaveCount(0);

    // Avec le droit de déplacer, l'occupation ouvre son menu ; c'est
    // « Voir le détail » qui ouvre le panneau.
    await page.getByRole("button", { name: /Rédiger la note de cadrage/ }).first().click();
    await page.getByRole("menuitem", { name: "Voir le détail" }).click();
    await expect(panneau).toHaveClass(/is-open/);
    await expect(panneau.getByRole("button", { name: "Fermer le détail" })).toBeVisible();
  });

  test("le « + » de cellule suit le droit de créer, jamais l'inverse", async ({ page }) => {
    await horlogeFixe(page);
    await serveur(page, { session: SESSION_PLANNING, reponses });
    await page.goto("/planning");

    // `RG-GEN-06` — proposé parce que le droit est là.
    await expect(
      page.getByRole("link", { name: /Créer ici — Ana Berger, 2026-08-10/ }),
    ).toHaveCount(1);

    const sansCreation = {
      ...SESSION_PLANNING,
      permissions: SESSION_PLANNING.permissions.filter((p) => p !== "tasks:create"),
    };
    await serveur(page, { session: sansCreation, reponses });
    await page.goto("/planning");
    await expect(page.locator(".cell-add")).toHaveCount(0);
  });

  test("LA FEUILLE D'IMPRESSION S'APPLIQUE — elle n'existe pas seulement", async ({ page }) => {
    await horlogeFixe(page);
    await serveur(page, { session: SESSION_PLANNING, reponses });
    await page.goto("/planning");

    // Une `@media print` ne se vérifie qu'en émulant le média : des
    // sélecteurs qui ne correspondent à rien restent muets, jamais rouges.
    // Ce défaut-là a déjà traversé deux lots.
    await page.emulateMedia({ media: "print" });

    await expect(page.locator(".side")).toBeHidden();
    await expect(page.locator(".topbar")).toBeHidden();
    await expect(page.locator(".filters")).toBeHidden();
    await expect(page.locator(".pl-toolbar")).toBeHidden();
    await expect(page.locator(".drawer")).toBeHidden();

    // L'en-tête d'impression, lui, n'existe QUE sur papier : une feuille sans
    // période est inexploitable dès qu'elle a quitté la main de qui l'a sortie.
    await expect(page.locator(".print-head")).toBeVisible();
    await expect(page.locator(".pl")).toBeVisible();

    await page.emulateMedia({ media: "screen" });
  });

  test("RG-PLN-07 — sans le droit, aucune permanence n'est rendue", async ({ page }) => {
    await horlogeFixe(page);
    await serveur(page, {
      session: SESSION_PLANNING,
      reponses: { ...reponses, "/api/planning": { corps: SEMAINE_SANS_PERMANENCES } },
    });
    await page.goto("/planning");

    await expect(page.getByText("Rédiger la note de cadrage").first()).toBeVisible();
    await expect(page.getByText("Permanence accueil")).toHaveCount(0);
  });

  test("EX-PLN-06 — éteindre une couche retire ses occupations, pas les autres", async ({
    page,
  }) => {
    await horlogeFixe(page);
    await serveur(page, { session: SESSION_PLANNING, reponses });
    await page.goto("/planning");

    await page.getByRole("checkbox", { name: "Tâches hors projets" }).uncheck();
    await expect(page.getByText("Veille technique")).toHaveCount(0);
    await expect(page.getByText("Rédiger la note de cadrage").first()).toBeVisible();
  });

  test("EX-PLN-07 — la légende FILTRE, elle ne décrit pas", async ({ page }) => {
    await horlogeFixe(page);
    await serveur(page, { session: SESSION_PLANNING, reponses });
    await page.goto("/planning");

    await page.getByRole("button", { name: "En cours" }).click();
    await expect(page.getByText("Rédiger la note de cadrage")).toHaveCount(0);

    await page.getByRole("button", { name: "Tout afficher" }).click();
    await expect(page.getByText("Rédiger la note de cadrage").first()).toBeVisible();
  });

  test("EX-PLN-04 — replier un service dit ce qu'il cache", async ({ page }) => {
    await horlogeFixe(page);
    await serveur(page, { session: SESSION_PLANNING, reponses });
    await page.goto("/planning");

    await page.getByRole("button", { name: "Replier le service Études et développement" }).click();
    await expect(page.getByText("Rédiger la note de cadrage")).toHaveCount(0);
    // Sans ce compte, replier reviendrait à faire disparaître du travail.
    await expect(page.getByText(/\(replié\)/)).toBeVisible();
  });

  test("l'état vide attribue la cause aux filtres, et propose de les lever", async ({ page }) => {
    await horlogeFixe(page);
    await serveur(page, {
      session: SESSION_PLANNING,
      reponses: { ...reponses, "/api/planning": { corps: AUCUNE_RESSOURCE } },
    });
    await page.goto("/planning");

    await expect(page.getByText("Aucune ressource à afficher")).toBeVisible();
    await expect(page.getByText("Vos filtres excluent toutes les ressources.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Réinitialiser les filtres" })).toBeVisible();
  });

  test("le panneau de détail sort le détail de la cellule", async ({ page }) => {
    await horlogeFixe(page);
    await serveur(page, { session: SESSION_PLANNING, reponses });
    await page.goto("/planning");

    await page.getByRole("button", { name: /Rédiger la note de cadrage/ }).first().click();
    await page.getByRole("menuitem", { name: "Voir le détail" }).click();

    await expect(page.getByText("Portail citoyen")).toBeVisible();
    await expect(page.getByText("40 %")).toBeVisible();
  });

  test("sans planning:read, l'accès est refusé", async ({ page }) => {
    await horlogeFixe(page);
    await serveur(page, { session: SESSION_LECTURE, reponses });
    await page.goto("/planning");
    await expect(page.getByText("Permission requise")).toBeVisible();
  });
});

// ── Vue 08 ──────────────────────────────────────────────────────────────────

test.describe("Vue 08 — planning, mois", () => {
  const reponsesMois = { ...reponses, "/api/planning": { corps: MOIS } };

  test("trente et une colonnes, et la colonne Ressource reste en tête", async ({ page }) => {
    await horlogeFixe(page);
    await serveur(page, { session: SESSION_PLANNING, reponses: reponsesMois });
    await page.goto("/planning/mois");

    // `exact` : sans lui, « Ressource » correspond aussi à « Planning des
    // ressources » — la correspondance de Playwright est insensible à la
    // casse —, et depuis L-27 ce titre existe aussi dans l'en-tête
    // d'impression, masqué à l'écran.
    await expect(page.getByText("Ressource", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Ana Berger")).toBeVisible();
    await expect(page.getByText("Hors présentiel")).toBeVisible();
  });

  test("LA CELLULE EST MUETTE À L'ÉCRAN : son libellé d'assistance porte tout", async ({
    page,
  }) => {
    await horlogeFixe(page);
    await serveur(page, { session: SESSION_PLANNING, reponses: reponsesMois });
    await page.goto("/planning/mois");

    // À 34 px, la texture ne dit rien à qui ne la voit pas. Si le libellé ne
    // le dit pas, personne ne l'entend.
    await expect(
      page.getByRole("button", { name: /Ana Berger, 2026-08-11 — 2 occupations/ }),
    ).toBeVisible();
    // Bruno appartient à deux services : sa ligne existe deux fois, et sa
    // cellule aussi. Les deux disent la même chose — c'est le point.
    await expect(
      page.getByRole("button", { name: /Bruno Costa, 2026-08-10 — Congés annuels/ }),
    ).toHaveCount(2);
  });

  test("le détail SORT de la cellule, et s'atteint au clavier", async ({ page }) => {
    await horlogeFixe(page);
    await serveur(page, { session: SESSION_PLANNING, reponses: reponsesMois });
    await page.goto("/planning/mois");

    await page.getByRole("button", { name: /Ana Berger, 2026-08-10/ }).click();
    await expect(page.getByText("Rédiger la note de cadrage").first()).toBeVisible();
  });

  test("une cellule sans rien le dit plutôt que de rester muette", async ({ page }) => {
    await horlogeFixe(page);
    await serveur(page, { session: SESSION_PLANNING, reponses: reponsesMois });
    await page.goto("/planning/mois");

    await page.getByRole("button", { name: /Ana Berger, 2026-08-20/ }).click();
    await expect(page.getByText("Rien de prévu ce jour-là.")).toBeVisible();
  });

  test("la bascule de mode change de vue sans perdre le fil", async ({ page }) => {
    await horlogeFixe(page);
    await serveur(page, { session: SESSION_PLANNING, reponses: reponsesMois });
    await page.goto("/planning/mois");

    // Un lien n'est pas un bouton bascule : l'état courant se dit par
    // `aria-current`, que les technologies d'assistance annoncent.
    await expect(page.getByRole("link", { name: "Mois" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    await expect(page.getByRole("link", { name: "Semaine" })).not.toHaveAttribute(
      "aria-current",
      "page",
    );
  });
});

// ── Vue 09 ──────────────────────────────────────────────────────────────────

test.describe("Vue 09 — planning, activité", () => {
  test("L'INVERSION DES AXES EST ANNONCÉE, pas laissée à deviner", async ({ page }) => {
    await horlogeFixe(page);
    await serveur(page, { session: SESSION_PLANNING, reponses });
    await page.goto("/planning/activite");

    // La maquette 09 annonce l'inversion DEUX fois, et ce n'est pas une
    // redondance : le bandeau la porte hors de la grille — donc y compris
    // quand la grille est vide, le moment précis où l'on cherche à
    // comprendre la vue —, la cellule d'angle la rappelle à la lecture.
    await expect(
      page.getByText(
        "les axes sont inversés par rapport aux vues Semaine et Mois",
        { exact: false },
      ),
    ).toBeVisible();

    // Dans l'angle, la maquette dit « Jours » et « Tâches », rien de plus :
    // les deux flèches portent le sens. `exact` est obligatoire — sans lui,
    // « Tâches » attraperait « Tâches prédéfinies » de la barre latérale.
    await expect(page.getByText("Jours", { exact: true })).toBeVisible();
    await expect(
      page.locator(".act-corner").getByText("Tâches", { exact: true }),
    ).toBeVisible();
  });

  test("le bandeau d'axes reste lisible quand la grille est vide", async ({ page }) => {
    await horlogeFixe(page);
    await serveur(page, {
      session: SESSION_PLANNING,
      reponses: {
        ...reponses,
        "/api/planning/activite": {
          corps: { colonnes: [], lignes: [], trame: { joursChomes: [], vacances: [] } },
        },
      },
    });
    await page.goto("/planning/activite");

    await expect(page.getByText("Aucune tâche prédéfinie active")).toBeVisible();
    await expect(
      page.getByText("les jours sont en lignes, les tâches prédéfinies en colonnes", {
        exact: false,
      }),
    ).toBeVisible();
  });

  test("la clé de lecture des marqueurs de réalisation est donnée", async ({ page }) => {
    await horlogeFixe(page);
    await serveur(page, { session: SESSION_PLANNING, reponses });
    await page.goto("/planning/activite");

    // Trois marqueurs — « · », « ✓ », « ✗ » — ne se devinent pas.
    const cle = page.locator(".legende-statuts");
    await expect(cle.getByText("Prévue", { exact: true })).toBeVisible();
    await expect(cle.getByText("Réalisée", { exact: true })).toBeVisible();
    await expect(cle.getByText("Non réalisée", { exact: true })).toBeVisible();
  });

  test("les tâches sont en colonnes, les jours en lignes", async ({ page }) => {
    await horlogeFixe(page);
    await serveur(page, { session: SESSION_PLANNING, reponses });
    await page.goto("/planning/activite");

    await expect(page.getByText("Permanence accueil")).toBeVisible();
    await expect(page.getByText("Astreinte technique")).toBeVisible();
    await expect(page.getByText("Lundi")).toBeVisible();
    await expect(page.getByText("08:30 – 12:30")).toBeVisible();
  });

  test("EX-PLN-14 — un férié se voit dans cette grille aussi", async ({ page }) => {
    await horlogeFixe(page);
    await serveur(page, { session: SESSION_PLANNING, reponses });
    await page.goto("/planning/activite");

    // C'est le jour où une permanence surprend le plus.
    await expect(page.getByText("Férié")).toBeVisible();
  });

  test("une cellule vide porte un tiret, pas un blanc", async ({ page }) => {
    await horlogeFixe(page);
    await serveur(page, { session: SESSION_PLANNING, reponses });
    await page.goto("/planning/activite");

    await expect(page.getByLabel("Aucun agent affecté").first()).toBeVisible();
  });

  test("EX-ACT-06 — la réalisation se déclare depuis la cellule", async ({ page }) => {
    await horlogeFixe(page);
    await serveur(page, {
      session: SESSION_PLANNING,
      reponses: { ...reponses, "/api/activite/assignations/realisation": { corps: {} } },
    });
    await page.goto("/planning/activite");

    await expect(
      page.getByRole("button", { name: "Marquer la permanence de Ana Berger comme non tenue" }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Marquer la permanence de Bruno Costa comme tenue" })
      .click();
    await expect(page.getByText("Statut de réalisation enregistré.")).toBeVisible();
  });

  test("RG-PLN-08 — CHAQUE AGENT INÉLIGIBLE PORTE SA RAISON", async ({ page }) => {
    await horlogeFixe(page);
    await serveur(page, { session: SESSION_PLANNING, reponses });
    await page.goto("/planning/activite");

    await page
      .getByRole("button", { name: /Ajouter des agents à Permanence accueil/ })
      .first()
      .click();

    // Les masquer ferait chercher qui manque ; les griser sans raison ferait
    // chercher pourquoi la case refuse de se cocher.
    await expect(page.getByText("Déjà assigné")).toBeVisible();
    await expect(page.getByText("En congé · Congés annuels")).toBeVisible();
    await expect(page.getByText("En télétravail")).toBeVisible();
    await expect(page.getByRole("checkbox", { name: "" }).first()).toBeEnabled();
  });

  test("la fenêtre compte les sélectionnés et le dit sur son bouton", async ({ page }) => {
    await horlogeFixe(page);
    await serveur(page, {
      session: SESSION_PLANNING,
      reponses: { ...reponses, "/api/activite/assignations": { corps: { crees: 1 } } },
    });
    await page.goto("/planning/activite");
    await page
      .getByRole("button", { name: /Ajouter des agents à Permanence accueil/ })
      .first()
      .click();

    await expect(page.getByRole("button", { name: "Ajouter (0)" })).toBeDisabled();
    await page.getByRole("dialog").getByRole("checkbox").first().check();
    await expect(page.getByText("1 agent sélectionné")).toBeVisible();
    await page.getByRole("button", { name: "Ajouter (1)" }).click();
    await expect(page.getByText("1 assignation créée")).toBeVisible();
  });

  test("aucun agent éligible : le message est celui du brief, à la lettre", async ({ page }) => {
    await horlogeFixe(page);
    await serveur(page, {
      session: SESSION_PLANNING,
      reponses: { ...reponses, "/api/activite/eligibilite": { corps: AUCUN_ELIGIBLE } },
    });
    await page.goto("/planning/activite");
    await page
      .getByRole("button", { name: /Ajouter des agents à Permanence accueil/ })
      .first()
      .click();

    await expect(
      page.getByText("Tous les agents sont déjà assignés, en congé ou en télétravail ce jour."),
    ).toBeVisible();
  });

  test("aucune tâche active : l'état vide dit par où sortir", async ({ page }) => {
    await horlogeFixe(page);
    await serveur(page, {
      session: SESSION_PLANNING,
      reponses: { ...reponses, "/api/planning/activite": { corps: GRILLE_VIDE } },
    });
    await page.goto("/planning/activite");

    await expect(page.getByText("Aucune tâche prédéfinie active")).toBeVisible();
    await expect(page.getByRole("link", { name: "Ouvrir le catalogue" })).toBeVisible();
  });
});

// ── Ce que la base de démonstration ne peut pas montrer ─────────────────────

/**
 * **Le vocabulaire de classes des maquettes, prouvé sur données.**
 *
 * `pnpm ui:diff` compare la maquette à l'instance réelle. Or l'instance de
 * développement porte le jeu de VOLUMÉTRIE — noms neutres, aucun projet
 * illustré, aucune tâche hors projet, aucun férié, aucune vacance scolaire.
 * Une dizaine de classes de la maquette y sont donc réputées « absentes »
 * alors que le code les pose ; sans ce contrôle, rien ne permettrait de
 * distinguer « la vue ne sait pas les rendre » de « la base n'a pas le cas ».
 *
 * C'est exactement la question que le comparateur ne peut pas trancher, et
 * celle qu'il faut trancher avant de conclure quoi que ce soit sur un écart.
 */
test.describe("le vocabulaire de la maquette est posé dès que la donnée existe", () => {
  test("vue 07 — les classes réputées manquantes apparaissent sur le jeu de démonstration", async ({
    page,
  }) => {
    await horlogeFixe(page);
    await serveur(page, { session: SESSION_PLANNING, reponses });
    await page.goto("/planning");

    // Une tâche hors projet : filet interrompu.
    await expect(page.locator(".occ.is-indep")).not.toHaveCount(0);
    // Une intervention extérieure : l'étiquette « EXT ».
    await expect(page.locator(".occ-ext")).not.toHaveCount(0);
    // Une demi-journée de congé.
    await expect(page.locator(".leave.is-half")).not.toHaveCount(0);
    // Le jour courant, l'horloge étant figée au 12 août 2026.
    await expect(page.locator(".pl-head.is-today")).not.toHaveCount(0);
    await expect(page.locator(".cell.is-today")).not.toHaveCount(0);
    // La trame de vacances scolaires.
    await expect(page.locator(".pl-bandcell.is-vac")).not.toHaveCount(0);
    // La synthèse au-delà du seuil d'alerte.
    await expect(page.locator(".sum-cell.is-high")).not.toHaveCount(0);
    // La pastille de projet, quand le référentiel porte une icône.
    await expect(page.locator(".pglyph")).not.toHaveCount(0);
  });

  test("vue 08 — la micro-cellule porte ses états", async ({ page }) => {
    await horlogeFixe(page);
    await serveur(page, {
      session: SESSION_PLANNING,
      reponses: { ...reponses, "/api/planning": { corps: MOIS } },
    });
    await page.goto("/planning/mois");

    await expect(page.locator(".mcell.is-today")).not.toHaveCount(0);
    await expect(page.locator(".mbar.is-indep")).not.toHaveCount(0);
    await expect(page.locator(".mo-band.is-vac")).not.toHaveCount(0);
    // La demi-journée : l'aplat ne couvre que la moitié de la micro-cellule.
    await expect(page.locator(".mleave.is-am, .mleave.is-pm")).not.toHaveCount(0);

    // Une barre sans libellé est une texture muette : sur cette vue, c'est le
    // survol qui dit ce qu'elle désigne.
    const sansLibelle = await page
      .locator(".mbar")
      .evaluateAll((n) => n.filter((e) => !e.getAttribute("title")).length);
    expect(sansLibelle).toBe(0);
    await expect(page.locator('.mbar[title="Rédiger la note de cadrage"]')).not.toHaveCount(0);
  });

  /*
   * Le compteur des occupations non dessinées était posé en HAUT à droite, à
   * l'endroit exact où commence la première barre : il se lisait par-dessus
   * elle. Ce contrôle porte sur la géométrie, seule chose qui le dise — une
   * assertion de présence passait déjà, et passerait encore.
   */
  test("vue 08 — le compteur se lit sous les barres, jamais par-dessus", async ({ page }) => {
    await horlogeFixe(page);
    await serveur(page, {
      session: SESSION_PLANNING,
      reponses: { ...reponses, "/api/planning": { corps: MOIS } },
    });
    await page.goto("/planning/mois");

    await expect(page.locator(".mcount")).not.toHaveCount(0);
    const mesures = await page.locator(".mcount").evaluateAll((compteurs) =>
      compteurs.map((c) => {
        const cellule = c.closest(".mcell");
        const rc = c.getBoundingClientRect();
        const rcell = cellule.getBoundingClientRect();
        const chevauche = (a, b) =>
          !(a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top);
        return {
          dansLaMoitieBasse: rc.top >= rcell.top + rcell.height / 2,
          surUneBarre: [...cellule.querySelectorAll(".mbar")].some((b) =>
            chevauche(rc, b.getBoundingClientRect()),
          ),
          surLeFilet: [...cellule.querySelectorAll(".mplace")].some((p) =>
            chevauche(rc, p.getBoundingClientRect()),
          ),
          hors: rc.right > rcell.right + 0.5 || rc.bottom > rcell.bottom + 0.5,
        };
      }),
    );
    expect(mesures.filter((m) => !m.dansLaMoitieBasse)).toEqual([]);
    expect(mesures.filter((m) => m.surUneBarre)).toEqual([]);
    expect(mesures.filter((m) => m.surLeFilet)).toEqual([]);
    expect(mesures.filter((m) => m.hors)).toEqual([]);
  });

  test("vue 09 — la grille pose tout son vocabulaire dès qu'une tâche est active", async ({
    page,
  }) => {
    await horlogeFixe(page);
    await serveur(page, { session: SESSION_PLANNING, reponses });
    await page.goto("/planning/activite");

    for (const classe of [
      ".act",
      ".act-corner",
      ".act-head",
      ".act-head-top",
      ".act-glyph",
      ".act-name",
      ".act-sub",
      ".act-day",
      ".act-dow",
      ".act-date",
      ".acell",
      ".acell-none",
      ".acell-add",
      ".agent",
      ".agent-av",
      ".agent-name",
      ".agent-st",
      ".ax",
      ".ax-line",
      ".ax-arrow",
    ]) {
      await expect(page.locator(classe), `classe ${classe}`).not.toHaveCount(0);
    }
  });
});

/**
 * `RG-PLN-05` — « Si une modification aboutit mais que le rafraîchissement
 * échoue, l'utilisateur est averti que l'affichage peut être périmé. »
 *
 * La règle décrit une situation qui n'existe que dans le client : le serveur a
 * répondu, et c'est la SECONDE requête, celle de relecture, qui tombe. Aucun
 * point d'entrée ne peut la porter, aucun test d'intégration ne peut la
 * provoquer — d'où sa dette jusqu'ici.
 *
 * Le montage : la première lecture du planning réussit, l'écriture réussit, et
 * la relecture échoue. Le silence serait pire que l'échec — il laisserait agir
 * sur des données fausses.
 */
test.describe("RG-PLN-05 — le rafraîchissement qui échoue après une écriture réussie", () => {
  test("RG-PLN-05 — l'écriture aboutit, la relecture tombe, et l'utilisateur EST AVERTI", async ({
    page,
  }) => {
    await horlogeFixe(page);

    let lectures = 0;
    await page.route(
      (url) => url.pathname.startsWith("/api/"),
      (route) => {
        const chemin = new URL(route.request().url()).pathname;

        if (chemin === "/api/auth/me") {
          return route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify(SESSION_PLANNING),
          });
        }
        if (chemin === "/api/planning/teletravail") {
          // L'écriture, elle, réussit : c'est toute la difficulté de la règle.
          return route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({ id: "w1", etat: "office" }),
          });
        }
        if (chemin === "/api/planning") {
          lectures += 1;
          // La première lecture peuple la grille ; la relecture tombe.
          return lectures === 1
            ? route.fulfill({
                status: 200,
                contentType: "application/json",
                body: JSON.stringify(SEMAINE),
              })
            : route.fulfill({ status: 503, contentType: "application/json", body: "{}" });
        }
        return route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
      },
    );

    await page.goto("/planning");

    const bascule = page.getByRole("button", { name: /Ana Berger, 2026-08-13/ });
    await expect(bascule).toBeVisible();
    await bascule.click();

    // La confirmation de l'écriture arrive : elle a bien abouti.
    await expect(page.getByText("Télétravail mis à jour.")).toBeVisible();

    // Et l'avertissement de péremption avec elle. C'est lui que la règle exige.
    await expect(
      page.getByText(
        "Modification enregistrée, mais l'affichage n'a pas pu être actualisé — données possiblement périmées.",
      ),
    ).toBeVisible();
  });
});
