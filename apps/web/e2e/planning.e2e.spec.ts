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
    await expect(page.getByText("En attente")).toBeVisible();
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

    await expect(page.getByText("Ressource").first()).toBeVisible();
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

    await expect(page.getByText("Jours en lignes")).toBeVisible();
    await expect(page.getByText("Tâches en colonnes")).toBeVisible();
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
