import { test, expect } from "@playwright/test";
import { serveur, SESSION, SESSION_LECTURE, PROJET } from "./fixtures/projets.js";
import { LISTE, TACHE_PROJET, TACHE_INDEPENDANTE, FICHE, FICHE_VIDE } from "./fixtures/taches.js";

/**
 * L-33 — vues 12, 16 et 17.
 *
 * Les points d'attention des briefs sont testés tels qu'ils sont écrits :
 * « la tâche hors projet est un cas nominal », « les colonnes À faire et
 * Terminé ne peuvent jamais être masquées », « le glisser-déposer doit être
 * doublé d'une alternative clavier », « ce qui compte au quotidien doit être
 * atteignable sans défilement ».
 */

const SESSION_TACHES = {
  ...SESSION,
  permissions: [...SESSION.permissions, "tasks:create", "tasks:update", "tasks:delete",
    "tasks:manage_dependencies", "tasks:manage_raci", "comments:create"],
};

const reponsesListe = { "/api/taches": { corps: LISTE }, "/api/projets": { corps: { projets: [], affiches: 0, total: 0 } } };

test.describe("Vue 16 — tâches, vue globale", () => {
  test("la liste montre projet, statut, échéance et assignés", async ({ page }) => {
    await serveur(page, { session: SESSION_TACHES, reponses: reponsesListe });
    await page.goto("/taches");

    await expect(page.getByRole("heading", { name: "Tâches", level: 1 })).toBeVisible();
    await expect(page.getByText("Rédiger la note de cadrage")).toBeVisible();
    await expect(page.getByText(PROJET.nom).first()).toBeVisible();
  });

  test("la tâche hors projet porte une identité, pas une case vide", async ({ page }) => {
    await serveur(page, { session: SESSION_TACHES, reponses: reponsesListe });
    await page.goto("/taches");

    // « Elle doit être nommée et assumée dans l'interface, jamais présentée
    //   comme une donnée incomplète » — brief de la vue 16.
    await expect(page.getByText("Tâche indépendante").first()).toBeVisible();
    await expect(page.getByText("dont 1 hors projet")).toBeVisible();
  });

  test("le filtre « sans projet » désactive le choix de projet", async ({ page }) => {
    await serveur(page, { session: SESSION_TACHES, reponses: reponsesListe });
    await page.goto("/taches");

    const filtre = page.getByRole("button", { name: "Tâches sans projet" });
    await expect(filtre).toHaveAttribute("aria-pressed", "false");
    await filtre.click();
    await expect(filtre).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByLabel("Projet", { exact: true })).toBeDisabled();
  });

  test("la bascule Liste / Kanban change l'affichage", async ({ page }) => {
    await serveur(page, { session: SESSION_TACHES, reponses: reponsesListe });
    await page.goto("/taches");

    await page.getByRole("button", { name: "Kanban" }).click();
    await expect(page.getByRole("region", { name: /À faire/ })).toBeVisible();
    await expect(page.getByRole("region", { name: /Terminé/ })).toBeVisible();
  });

  test("état vide : aucune tâche, avec sa sortie", async ({ page }) => {
    await serveur(page, {
      session: SESSION_TACHES,
      reponses: { ...reponsesListe, "/api/taches": { corps: [] } },
    });
    await page.goto("/taches");

    await expect(page.getByText("Aucune tâche", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Créer une tâche" })).toHaveCount(2);
  });

  test("« Aucun projet » est une option nommée, avec son indice", async ({ page }) => {
    await serveur(page, { session: SESSION_TACHES, reponses: reponsesListe });
    await page.goto("/taches");
    await page.getByRole("button", { name: "Créer une tâche" }).click();

    await expect(
      page.getByRole("option", { name: "Aucun projet (tâche indépendante)" }),
    ).toBeAttached();
    await expect(page.getByText(/Laissez vide pour une tâche hors projet/)).toBeVisible();
    // Le jalon reste inerte tant qu'aucun projet n'est choisi, et le dit.
    await expect(page.getByLabel("Jalon")).toBeDisabled();
    await expect(page.getByRole("option", { name: "Sélectionnez d'abord un projet" })).toBeAttached();
  });

  /**
   * `RG-TSK-15` — « les assignés proposés sont en priorité les membres du
   * projet ; **si le projet n'a pas de membre, tous les utilisateurs sont
   * proposés** ».
   *
   * Le repli n'a jamais fonctionné. `GET /api/utilisateurs` rend un TABLEAU ;
   * trois vues lisaient `data.utilisateurs` dessus, donc `undefined`, donc
   * zéro candidat — et l'interface montrait un état vide au lieu de la liste.
   * On ne pouvait s'assigner une tâche hors projet à personne, soi compris.
   *
   * Même piège que la vue 27 en son temps : une forme de réponse inventée
   * côté client, que le typage valide puisqu'il décrit la même invention.
   */
  test("RG-TSK-15 — sans projet, TOUS les utilisateurs sont proposés", async ({ page }) => {
    await serveur(page, {
      session: SESSION_TACHES,
      reponses: {
        ...reponsesListe,
        // La forme réelle du serveur : un tableau nu.
        "/api/utilisateurs": {
          corps: [
            { id: "u-1", prenom: "Administration", nom: "Rationarium" },
            { id: "u-2", prenom: "Inès", nom: "Bertrand" },
          ],
        },
      },
    });
    await page.goto("/taches");
    await page.getByRole("button", { name: "Créer une tâche" }).click();

    const boite = page.getByRole("group", { name: /Assignés/i });
    await expect(boite.getByText("Administration Rationarium")).toBeVisible();
    await expect(boite.getByText("Inès Bertrand")).toBeVisible();
  });

  test("le titre est obligatoire", async ({ page }) => {
    await serveur(page, { session: SESSION_TACHES, reponses: reponsesListe });
    await page.goto("/taches");
    await page.getByRole("button", { name: "Créer une tâche" }).click();
    await page.getByRole("button", { name: "Créer la tâche" }).click();

    await expect(page.getByText("Le titre est obligatoire").first()).toBeVisible();
  });
});

test.describe("Vue 12 — kanban", () => {
  const reponses = {
    "/api/taches": { corps: LISTE },
    [`/api/projets/${PROJET.id}`]: { corps: PROJET },
  };

  test("cinq colonnes, dont « À faire » et « Terminé » toujours présentes", async ({ page }) => {
    await serveur(page, { session: SESSION_TACHES, reponses });
    await page.goto(`/projets/${PROJET.id}/taches`);

    for (const colonne of ["À faire", "En cours", "En revue", "Terminé", "Bloqué"]) {
      await expect(page.getByRole("region", { name: new RegExp(colonne) })).toBeVisible();
    }
  });

  test("une colonne vide le dit", async ({ page }) => {
    await serveur(page, { session: SESSION_TACHES, reponses });
    await page.goto(`/projets/${PROJET.id}/taches`);
    // Trois colonnes sur cinq sont vides avec ce jeu de données.
    await expect(page.getByText("Aucune tâche", { exact: true })).toHaveCount(3);
  });

  test("C6 — le déplacement existe au clavier, en nommant la destination", async ({ page }) => {
    await serveur(page, { session: SESSION_TACHES, reponses });
    await page.goto(`/projets/${PROJET.id}/taches`);

    await page.getByRole("button", { name: /Déplacer la tâche Rédiger/ }).click();
    // « Déplacer vers Terminé » se comprend et s'annonce ; une traînée simulée
    // ne laisserait aucune prise.
    await expect(page.getByRole("menuitem", { name: "Déplacer vers Terminé" })).toBeVisible();
    await expect(page.getByRole("menuitem", { name: "Déplacer vers En cours" })).toHaveCount(0);
  });

  test("RG-GEN-06 — sans droit de modification, aucun déplacement n'est proposé", async ({
    page,
  }) => {
    await serveur(page, {
      session: { ...SESSION_LECTURE, permissions: [...SESSION_LECTURE.permissions] },
      reponses,
    });
    await page.goto(`/projets/${PROJET.id}/taches`);

    await expect(page.getByText("Rédiger la note de cadrage")).toBeVisible();
    await expect(page.getByRole("button", { name: /Déplacer la tâche/ })).toHaveCount(0);
  });
});

test.describe("Vue 17 — fiche tâche", () => {
  const reponses = { [`/api/taches/${FICHE.id}`]: { corps: FICHE } };

  test("la barre du quotidien porte statut, assignés et avancement", async ({ page }) => {
    await serveur(page, { session: SESSION_TACHES, reponses });
    await page.goto(`/taches/${FICHE.id}`);

    // « Ce qui compte au quotidien doit être atteignable sans défilement. »
    await expect(page.getByLabel("Statut", { exact: true })).toHaveValue("doing");
    await expect(page.getByLabel("Avancement", { exact: true })).toHaveValue("45");
    await expect(page.getByText("Driss Amrani").first()).toBeVisible();
  });

  /**
   * `EX-TSK-05` — fixer les assignés d'une tâche EXISTANTE.
   *
   * Le bouton « + » a vécu désactivé derrière un commentaire affirmant que
   * « l'ajout d'un assigné n'a pas de point d'entrée ». `PUT /taches/:id/
   * assignes` existe depuis L-33. Quatrième commentaire de ce genre à se
   * révéler faux, et le quatrième défaut qu'aucune boucle ne pouvait voir :
   * une commande désactivée ne fait échouer aucun contrôle.
   *
   * Le cas exercé est celui qui bloquait vraiment — une tâche **hors projet**,
   * où `RG-TSK-15` veut que tous les utilisateurs soient proposés.
   */
  test("EX-TSK-05 — les assignés se fixent depuis la fiche, liste ENTIÈRE", async ({ page }) => {
    let recu: unknown = null;
    await serveur(page, {
      session: SESSION_TACHES,
      reponses: {
        [`/api/taches/${FICHE_VIDE.id}`]: { corps: FICHE_VIDE },
        "/api/utilisateurs": {
          corps: [
            { id: "a1", prenom: "Driss", nom: "Amrani" },
            { id: "a2", prenom: "Hugo", nom: "Nguyen" },
          ],
        },
      },
    });
    await page.route(
      (url) => url.pathname.endsWith("/assignes"),
      (route) => {
        if (route.request().method() !== "PUT") return route.fallback();
        recu = route.request().postDataJSON();
        return route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
      },
    );

    await page.goto(`/taches/${FICHE_VIDE.id}`);

    const plus = page.getByRole("button", { name: "Ajouter un assigné" });
    await expect(plus).toBeEnabled();
    await plus.click();

    // Hors projet : tous les utilisateurs, et l'interface le dit.
    await expect(page.getByText("Tous les utilisateurs")).toBeVisible();
    await page.getByRole("checkbox", { name: "Driss Amrani" }).check();
    await page.getByRole("checkbox", { name: "Hugo Nguyen" }).check();
    await page.getByRole("button", { name: "Enregistrer les assignés" }).click();

    // La route REMPLACE : la liste part entière, jamais par différence.
    await expect.poll(() => recu).not.toBeNull();
    expect(recu).toEqual({ userIds: ["a1", "a2"] });
  });

  test("les dépendances sont montrées dans les deux sens", async ({ page }) => {
    await serveur(page, { session: SESSION_TACHES, reponses });
    await page.goto(`/taches/${FICHE.id}`);

    await expect(page.getByText("Dépend de (1)")).toBeVisible();
    await expect(page.getByText("Bloque (1)")).toBeVisible();
    await expect(page.getByText("Ateliers usagers")).toBeVisible();
    await expect(page.getByText("Rédiger le cahier des charges")).toBeVisible();
  });

  test("les quatre rôles RACI sont listés, même ceux que personne ne porte", async ({ page }) => {
    await serveur(page, { session: SESSION_TACHES, reponses });
    await page.goto(`/taches/${FICHE.id}`);

    for (const role of ["Responsable", "Autorité", "Consulté", "Informé"]) {
      await expect(page.getByText(role, { exact: true })).toBeVisible();
    }
    // Un rôle vide se dit ; il ne disparaît pas.
    await expect(page.getByText("Personne", { exact: true })).toHaveCount(2);
  });

  test("C6 — les sous-tâches se réordonnent aussi au clavier", async ({ page }) => {
    await serveur(page, { session: SESSION_TACHES, reponses });
    await page.goto(`/taches/${FICHE.id}`);

    await expect(page.getByRole("button", { name: /Descendre Recenser les acteurs/ })).toBeAttached();
    await expect(page.getByRole("button", { name: /Monter Écrire le périmètre/ })).toBeAttached();
    // La première ne peut pas monter, la dernière ne peut pas descendre.
    await expect(page.getByRole("button", { name: /Monter Recenser les acteurs/ })).toBeDisabled();
  });

  test("tout vide : chaque section le dit à sa manière", async ({ page }) => {
    await serveur(page, {
      session: SESSION_TACHES,
      reponses: { [`/api/taches/${FICHE_VIDE.id}`]: { corps: FICHE_VIDE } },
    });
    await page.goto(`/taches/${FICHE_VIDE.id}`);

    await expect(page.getByText("Aucune description")).toBeVisible();
    await expect(page.getByText("Aucune sous-tâche")).toBeVisible();
    await expect(page.getByText("Aucune dépendance")).toBeVisible();
    await expect(page.getByText("Aucune tâche dépendante")).toBeVisible();
    await expect(page.getByText("Aucun commentaire")).toBeVisible();
    await expect(page.getByText("Aucun document")).toBeVisible();
  });

  test("suppression bloquée : le bouton n'existe pas, les bloquantes sont nommées", async ({
    page,
  }) => {
    await serveur(page, { session: SESSION_TACHES, reponses });
    await page.goto(`/taches/${FICHE.id}`);
    await page.getByRole("button", { name: "Supprimer", exact: true }).click();

    await expect(
      page.getByText(/Impossible de supprimer une tâche dont d'autres tâches dépendent/),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Supprimer la tâche" })).toHaveCount(0);
    // Les tâches bloquantes sont nommées DANS la fenêtre : deviner ce qui
    // bloque après un refus est le contraire d'un message actionnable.
    await expect(
      page.getByRole("dialog").getByText("Rédiger le cahier des charges"),
    ).toBeVisible();
  });

  test("suppression possible quand rien ne dépend de la tâche", async ({ page }) => {
    await serveur(page, {
      session: SESSION_TACHES,
      reponses: { [`/api/taches/${FICHE_VIDE.id}`]: { corps: FICHE_VIDE } },
    });
    await page.goto(`/taches/${FICHE_VIDE.id}`);
    await page.getByRole("button", { name: "Supprimer", exact: true }).click();

    await expect(page.getByRole("button", { name: "Supprimer la tâche" })).toBeVisible();
  });

  test("le bandeau d'incohérences apparaît quand il y en a", async ({ page }) => {
    await serveur(page, {
      session: SESSION_TACHES,
      reponses: {
        [`/api/taches/${FICHE.id}`]: {
          /*
           * La forme est celle que `TachesService.incoherences` rend : le
           * prérequis complet et le nombre de jours de recouvrement. Le jeu
           * d'essai disait `{ id, titre }`, une forme que le serveur n'a jamais
           * produite — la vue ne pouvait donc pas nommer la tâche en cause.
           */
          corps: {
            ...FICHE,
            incoherences: [
              {
                prerequis: { id: "p1", titre: "Ateliers usagers", dateFin: "2026-11-16" },
                jours: 3,
              },
            ],
          },
        },
      },
    });
    await page.goto(`/taches/${FICHE.id}`);
    await expect(page.getByText(/incohérences de dates détectées/)).toBeVisible();
  });

  test("RG-GEN-06 — en lecture seule, le titre n'est pas éditable", async ({ page }) => {
    await serveur(page, { session: SESSION_LECTURE, reponses });
    await page.goto(`/taches/${FICHE.id}`);

    await expect(page.getByRole("heading", { name: TACHE_PROJET.titre, level: 1 })).toBeVisible();
    await expect(page.getByLabel("Titre de la tâche")).toHaveCount(0);
    await expect(page.getByLabel("Statut", { exact: true })).toBeDisabled();
  });
});

test.describe("La tâche indépendante, de bout en bout", () => {
  test("elle porte son identité jusque dans sa fiche", async ({ page }) => {
    await serveur(page, {
      session: SESSION_TACHES,
      reponses: {
        [`/api/taches/${FICHE_VIDE.id}`]: { corps: FICHE_VIDE },
      },
    });
    await page.goto(`/taches/${FICHE_VIDE.id}`);
    // Le surtitre de la fiche dit « Tâche indépendante » là où un projet
    // s'afficherait : le hors-projet n'est jamais un blanc.
    await expect(page.getByText("Tâche indépendante").first()).toBeVisible();
    void TACHE_INDEPENDANTE;
  });
});
