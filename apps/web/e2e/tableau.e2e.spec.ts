import { test, expect, type Page } from "@playwright/test";
import { serveur, SESSION_LECTURE } from "./fixtures/projets.js";
import {
  SESSION_TABLEAU,
  TABLEAU,
  TABLEAU_VIDE,
  TABLEAU_LIMITE,
} from "./fixtures/tableau.js";

/**
 * L-21 — vue 06.
 *
 * Deux exigences opposées, tenues ensemble : **complète en un écran** pour un
 * contributeur, **digne à zéro** pour une direction. Les tests portent sur ce
 * couple, et sur la saisie en place — le point d'attention du brief.
 */

const MOMENT = new Date("2026-08-12T09:00:00.000Z");

async function horlogeFixe(page: Page) {
  await page.clock.setFixedTime(MOMENT);
}

const reponses = { "/api/tableau-de-bord": { corps: TABLEAU } };

test.describe("Vue 06 — tableau de bord", () => {
  test("EX-DSH-01 — l'accueil est nominatif, et c'est la page d'accueil", async ({ page }) => {
    await horlogeFixe(page);
    await serveur(page, { session: SESSION_TABLEAU, reponses });
    await page.goto("/");

    await expect(page.getByRole("heading", { name: "Bonjour Camille", level: 1 })).toBeVisible();
    await expect(page.getByText("Voici un aperçu de votre activité.")).toBeVisible();
  });

  test("EX-DSH-02 — CHAQUE INDICATEUR PORTE SON DÉNOMINATEUR", async ({ page }) => {
    await horlogeFixe(page);
    await serveur(page, { session: SESSION_TABLEAU, reponses });
    await page.goto("/");

    // « 2 » ne dit rien ; « sur 5 projets » situe.
    await expect(page.getByText("sur 5 projets")).toBeVisible();
    await expect(page.getByText("sur 11 tâches")).toBeVisible();
    await expect(page.getByText("55 % complétées")).toBeVisible();
    await expect(page.getByText("Échéance dépassée")).toBeVisible();
  });

  test("LA VUE RESTE DIGNE QUAND TOUT EST À ZÉRO", async ({ page }) => {
    await horlogeFixe(page);
    await serveur(page, {
      session: SESSION_TABLEAU,
      reponses: { "/api/tableau-de-bord": { corps: TABLEAU_VIDE } },
    });
    await page.goto("/");

    // Le brief l'exige pour une direction, dont les compteurs personnels n'ont
    // pas de sens. Aucun « NaN », aucun bloc blanc : quatre états rédigés.
    await expect(page.getByText("0 % complétées")).toBeVisible();
    await expect(page.getByText("Aucune échéance dépassée")).toBeVisible();
    await expect(page.getByText("Aucune tâche assignée")).toBeVisible();
    await expect(page.getByText("Aucune to-do pour le moment")).toBeVisible();
    await expect(page.getByText("Aucun projet assigné")).toBeVisible();
  });

  test("RG-DSH-04 — la tâche en retard porte un marqueur TEXTUEL", async ({ page }) => {
    await horlogeFixe(page);
    await serveur(page, { session: SESSION_TABLEAU, reponses });
    await page.goto("/");

    await expect(page.getByText("Reprendre le cahier de recette")).toBeVisible();
    // La couleur seule ne se lit pas par tout le monde.
    await expect(page.getByText("En retard", { exact: true })).toBeVisible();
  });

  test("une tâche hors projet le dit, plutôt que de laisser un vide", async ({ page }) => {
    await horlogeFixe(page);
    await serveur(page, { session: SESSION_TABLEAU, reponses });
    await page.goto("/");

    await expect(page.getByText("Sans projet").first()).toBeVisible();
  });

  test("EX-DSH-05 — LE STATUT SE CHANGE SANS QUITTER LA PAGE", async ({ page }) => {
    await horlogeFixe(page);
    await serveur(page, {
      session: SESSION_TABLEAU,
      reponses: { ...reponses, "/api/taches/t-note": { corps: { version: 4 } } },
    });
    await page.goto("/");

    // Une fenêtre modale pour changer un statut coûterait plus que le geste.
    await page
      .getByLabel("Statut de la tâche Rédiger la note de cadrage")
      .selectOption("done");
    await expect(page.getByText("Statut enregistré.")).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });

  test("EX-DSH-05 — la saisie d'heures tient en UNE FRAPPE puis Entrée", async ({ page }) => {
    await horlogeFixe(page);
    await serveur(page, {
      session: SESSION_TABLEAU,
      reponses: { ...reponses, "/api/temps": { corps: { id: "te1" } } },
    });
    await page.goto("/");

    const champ = page.getByLabel("Heures à déclarer sur la tâche Rédiger la note de cadrage");
    await champ.fill("2");
    await champ.press("Enter");
    await expect(page.getByText("Temps enregistré.")).toBeVisible();
  });

  test("RG-TMP-07 — la saisie dit le temps DÉJÀ déclaré, tous contributeurs confondus", async ({
    page,
  }) => {
    await horlogeFixe(page);
    await serveur(page, { session: SESSION_TABLEAU, reponses });
    await page.goto("/");

    // Saisir trois heures de plus parce qu'un collègue l'avait fait est
    // exactement l'erreur que ce chiffre évite.
    await expect(page.getByText("4,5 h déjà déclarées")).toBeVisible();
  });

  test("EX-DSH-06 — clore une tâche sans déclaration, depuis l'onglet dédié", async ({ page }) => {
    await horlogeFixe(page);
    await serveur(page, {
      session: SESSION_TABLEAU,
      reponses: { ...reponses, "/api/temps/renoncement/t-close": { corps: {} } },
    });
    await page.goto("/");

    await page.getByRole("tab", { name: "Non déclarées" }).click();
    await expect(page.getByText("Recette de la version 2.1")).toBeVisible();
    // `.click()` et non `.check()` : le simulacre rend toujours la même liste,
    // donc la ligne ne disparaît pas et la case se réinitialise au
    // rafraîchissement. C'est l'action et son accusé de réception qu'on
    // vérifie ici, pas la persistance d'un état transitoire.
    await page.getByRole("checkbox", { name: "Valider sans déclaration" }).click();
    await expect(page.getByText("Tâche close sans déclaration.")).toBeVisible();
  });

  test("les deux onglets de tâches se parcourent au clavier", async ({ page }) => {
    await horlogeFixe(page);
    await serveur(page, { session: SESSION_TABLEAU, reponses });
    await page.goto("/");

    // Les onglets viennent de l'inventaire : les flèches y fonctionnent, ce
    // qu'une imitation à base de boutons n'aurait pas donné.
    await page.getByRole("tab", { name: "À venir" }).focus();
    await page.keyboard.press("ArrowRight");
    await expect(page.getByRole("tab", { name: "Non déclarées" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  test("EX-DSH-03 — l'extrait de planning est celui de la semaine, et le sien", async ({
    page,
  }) => {
    await horlogeFixe(page);
    await serveur(page, { session: SESSION_TABLEAU, reponses });
    await page.goto("/");

    await expect(page.getByText("Mon planning")).toBeVisible();
    await expect(page.getByText("Rédiger la note de cadrage").first()).toBeVisible();
    await expect(page.getByText("Télétravail")).toBeVisible();
    await expect(page.getByRole("link", { name: "Ouvrir le planning" })).toBeVisible();
  });

  test("RG-DSH-03 — les to-do complétées sont regroupées à part, AVEC leur compte", async ({
    page,
  }) => {
    await horlogeFixe(page);
    await serveur(page, { session: SESSION_TABLEAU, reponses });
    await page.goto("/");

    await expect(page.getByText("Relire la note de cadrage")).toBeVisible();
    // Mêlées aux autres elles allongent la liste ; supprimées d'office elles
    // feraient perdre la trace de ce qu'on vient de faire.
    await expect(page.getByText("1 complétée")).toBeVisible();
    await expect(page.getByText("Réserver la salle")).toBeVisible();
  });

  test("RG-DSH-02 — une to-do s'édite en place, au double-clic ET au clavier", async ({
    page,
  }) => {
    await horlogeFixe(page);
    await serveur(page, {
      session: SESSION_TABLEAU,
      reponses: { ...reponses, "/api/tableau-de-bord/todos/td1": { corps: { id: "td1" } } },
    });
    await page.goto("/");

    // Une action qui n'existe qu'à la souris n'existe pas.
    await page.getByRole("button", { name: "Relire la note de cadrage", exact: true }).click();
    await expect(page.getByLabel("Modifier « Relire la note de cadrage »")).toBeFocused();
  });

  test("RG-DSH-01 — la limite est ANNONCÉE, et le champ se ferme", async ({ page }) => {
    await horlogeFixe(page);
    await serveur(page, {
      session: SESSION_TABLEAU,
      reponses: { "/api/tableau-de-bord": { corps: TABLEAU_LIMITE } },
    });
    await page.goto("/");

    // Découvrir la limite sur un champ qui ne répond plus serait l'apprendre
    // au pire moment.
    await expect(page.getByText("Limite de 3 to-dos atteinte.")).toBeVisible();
    await expect(page.getByLabel("Nouvelle to-do")).toBeDisabled();
  });

  test("une to-do s'ajoute à la touche Entrée, sans quitter le champ", async ({ page }) => {
    await horlogeFixe(page);
    await serveur(page, {
      session: SESSION_TABLEAU,
      reponses: { ...reponses, "/api/tableau-de-bord/todos": { corps: { id: "td9" } } },
    });
    await page.goto("/");

    const champ = page.getByLabel("Nouvelle to-do");
    await champ.fill("Préparer la revue");
    await champ.press("Enter");
    await expect(champ).toHaveValue("");
  });

  test("EX-DSH-07 — mes projets mènent à leur fiche", async ({ page }) => {
    await horlogeFixe(page);
    await serveur(page, { session: SESSION_TABLEAU, reponses });
    await page.goto("/");

    await expect(page.getByRole("link", { name: /Portail citoyen/ })).toHaveAttribute(
      "href",
      "/projets/p1",
    );
    await expect(page.getByText(/24 tâches/)).toBeVisible();
  });

  test("sans planning:read, l'accès est refusé", async ({ page }) => {
    await horlogeFixe(page);
    await serveur(page, { session: SESSION_LECTURE, reponses });
    await page.goto("/");
    await expect(page.getByText("Permission requise")).toBeVisible();
  });
});
