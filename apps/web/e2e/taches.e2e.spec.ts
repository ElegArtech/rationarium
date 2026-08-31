import { test, expect } from "@playwright/test";
import { serveur, SESSION, SESSION_LECTURE, PROJET } from "./fixtures/projets.js";
import {
  LISTE,
  TACHE_PROJET,
  TACHE_INDEPENDANTE,
  FICHE,
  FICHE_VIDE,
  CANDIDATS,
  INCOHERENCES,
  DOCUMENT_MIEN,
  DOCUMENT_AUTRUI,
} from "./fixtures/taches.js";

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

/**
 * `EX-TSK-10` — **la fenêtre de sélection des dépendances**, vue 17.
 *
 * Le bouton « Modifier les dépendances » a vécu plusieurs lots désactivé
 * derrière un motif exact : le serveur posait et retirait un lien, mais
 * n'exposait pas la liste des tâches candidates. Un motif exact ne fait pas une
 * fonctionnalité — et une commande désactivée ne fait échouer aucun contrôle,
 * ce qui est précisément ce qui l'a laissée vivre.
 */
test.describe("Vue 17 — modifier les dépendances", () => {
  const reponsesDeps = {
    [`/api/taches/${FICHE.id}`]: { corps: FICHE },
    [`/api/taches/${FICHE.id}/dependances/candidats`]: { corps: CANDIDATS },
    [`/api/taches/${FICHE.id}/incoherences`]: { corps: INCOHERENCES },
  };

  test("EX-TSK-10 — le bouton OUVRE la fenêtre, et la liste n'est pas vide", async ({ page }) => {
    await serveur(page, { session: SESSION_TACHES, reponses: reponsesDeps });
    await page.goto(`/taches/${FICHE.id}`);

    const bouton = page.getByRole("button", { name: "Modifier les dépendances" });
    await expect(bouton).toBeEnabled();
    await bouton.click();

    const fenetre = page.getByRole("dialog");
    await expect(
      fenetre.getByText("Sélectionnez les tâches qui doivent être terminées avant celle-ci."),
    ).toBeVisible();
    // Les candidats du serveur ET le prérequis déjà posé : sans ce dernier, on
    // ne pourrait plus rien décocher.
    await expect(fenetre.getByRole("checkbox", { name: /Cadrer les parcours/ })).toBeVisible();
    await expect(fenetre.getByRole("checkbox", { name: /Ateliers usagers/ })).toBeChecked();
  });

  test("EX-TSK-10 — l'enregistrement pose l'ENSEMBLE, avec la version lue", async ({ page }) => {
    let recu: unknown = null;
    await serveur(page, { session: SESSION_TACHES, reponses: reponsesDeps });
    await page.route(
      (url) => url.pathname.endsWith("/dependances"),
      (route) => {
        if (route.request().method() !== "PUT") return route.fallback();
        recu = route.request().postDataJSON();
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ version: FICHE.version + 1, ajoutees: [], retirees: [] }),
        });
      },
    );

    await page.goto(`/taches/${FICHE.id}`);
    await page.getByRole("button", { name: "Modifier les dépendances" }).click();

    const fenetre = page.getByRole("dialog");
    await fenetre.getByRole("checkbox", { name: /Cadrer les parcours/ }).check();
    await fenetre.getByRole("checkbox", { name: /Ateliers usagers/ }).uncheck();
    await fenetre.getByRole("button", { name: "Enregistrer les dépendances" }).click();

    await expect.poll(() => recu).not.toBeNull();
    // L'ensemble part ENTIER, jamais par différence — et `RG-GEN-07` veut la
    // version lue avec lui.
    expect(recu).toEqual({
      version: FICHE.version,
      prerequisIds: [CANDIDATS[0]!.id],
    });
  });

  test("EX-TSK-12 — le conflit de dates se dit sur la ligne ET dans le compteur", async ({
    page,
  }) => {
    await serveur(page, { session: SESSION_TACHES, reponses: reponsesDeps });
    await page.goto(`/taches/${FICHE.id}`);
    await page.getByRole("button", { name: "Modifier les dépendances" }).click();

    const fenetre = page.getByRole("dialog");
    const avertissements = fenetre.getByText("conflit de dates", { exact: true });

    /*
     * Un seul avertissement au départ : celui du prérequis DÉJÀ posé, que
     * `GET :id/incoherences` signale. Le candidat qui conflirait n'est pas
     * encore coché — on ne signale pas un conflit qu'on n'a pas créé.
     */
    await expect(avertissements).toHaveCount(1);
    await expect(fenetre.getByText(/dont 1 conflit de dates/)).toBeVisible();

    // Cocher le candidat en conflit ajoute le sien, et le compteur suit.
    await fenetre.getByRole("checkbox", { name: /Recetter le portail/ }).check();
    await expect(avertissements).toHaveCount(2);
    await expect(fenetre.getByText(/dont 2 conflits de dates/)).toBeVisible();

    // Le décocher le retire : l'avertissement suit la SÉLECTION, pas la liste.
    await fenetre.getByRole("checkbox", { name: /Recetter le portail/ }).uncheck();
    await expect(avertissements).toHaveCount(1);
  });

  test("EX-TSK-10 — le compteur suit la sélection", async ({ page }) => {
    await serveur(page, { session: SESSION_TACHES, reponses: reponsesDeps });
    await page.goto(`/taches/${FICHE.id}`);
    await page.getByRole("button", { name: "Modifier les dépendances" }).click();

    const fenetre = page.getByRole("dialog");
    await expect(fenetre.getByText(/^1 dépendance sélectionnée/)).toBeVisible();

    // « Cadrer les parcours » finit avant le début de la tâche : elle grossit
    // le compte des sélectionnées, jamais celui des conflits.
    await fenetre.getByRole("checkbox", { name: /Cadrer les parcours/ }).check();
    await expect(fenetre.getByText(/^2 dépendances sélectionnées/)).toBeVisible();
    await expect(fenetre.getByText(/dont 1 conflit de dates/)).toBeVisible();
  });

  /**
   * `cadrage/02:571` — **deux états vides, pas un.** « Aucune tâche
   * disponible » dit qu'il n'y a rien à lier ; « Aucune tâche trouvée » dit que
   * la recherche est trop étroite. Les confondre laisserait croire à un projet
   * vide devant une faute de frappe.
   */
  test("EX-TSK-10 — « Aucune tâche disponible » quand le serveur ne propose rien", async ({
    page,
  }) => {
    await serveur(page, {
      session: SESSION_TACHES,
      reponses: {
        [`/api/taches/${FICHE_VIDE.id}`]: { corps: FICHE_VIDE },
        [`/api/taches/${FICHE_VIDE.id}/dependances/candidats`]: { corps: [] },
        [`/api/taches/${FICHE_VIDE.id}/incoherences`]: { corps: [] },
      },
    });
    await page.goto(`/taches/${FICHE_VIDE.id}`);
    await page.getByRole("button", { name: "Modifier les dépendances" }).click();

    const fenetre = page.getByRole("dialog");
    await expect(fenetre.getByText("Aucune tâche disponible", { exact: true })).toBeVisible();
    await expect(fenetre.getByText("Aucune tâche trouvée", { exact: true })).toHaveCount(0);
  });

  test("EX-TSK-10 — « Aucune tâche trouvée » quand c'est la RECHERCHE qui ne rend rien", async ({
    page,
  }) => {
    await serveur(page, { session: SESSION_TACHES, reponses: reponsesDeps });
    await page.goto(`/taches/${FICHE.id}`);
    await page.getByRole("button", { name: "Modifier les dépendances" }).click();

    const fenetre = page.getByRole("dialog");
    await fenetre.getByRole("searchbox", { name: "Rechercher une tâche…" }).fill("zzz");

    await expect(fenetre.getByText("Aucune tâche trouvée", { exact: true })).toBeVisible();
    await expect(fenetre.getByText("Aucune tâche disponible", { exact: true })).toHaveCount(0);
  });

  test("EX-TSK-10 — la recherche filtre la liste", async ({ page }) => {
    await serveur(page, { session: SESSION_TACHES, reponses: reponsesDeps });
    await page.goto(`/taches/${FICHE.id}`);
    await page.getByRole("button", { name: "Modifier les dépendances" }).click();

    const fenetre = page.getByRole("dialog");
    await fenetre.getByRole("searchbox", { name: "Rechercher une tâche…" }).fill("Recetter");

    await expect(fenetre.getByRole("checkbox", { name: /Recetter le portail/ })).toBeVisible();
    await expect(fenetre.getByRole("checkbox", { name: /Cadrer les parcours/ })).toHaveCount(0);
  });

  /**
   * `RG-TSK-04` — le bandeau ne se déclenche que sur une COURSE : le serveur
   * écarte les candidats cycliques de la liste, donc seul un lien posé ailleurs
   * entre le chargement et l'enregistrement peut refermer une boucle. Le texte
   * est celui de `cadrage/02:566`, à la lettre.
   */
  test("RG-TSK-04 — un cycle refusé au serveur s'affiche dans la fenêtre", async ({ page }) => {
    await serveur(page, { session: SESSION_TACHES, reponses: reponsesDeps });
    await page.route(
      (url) => url.pathname.endsWith("/dependances"),
      (route) => {
        if (route.request().method() !== "PUT") return route.fallback();
        return route.fulfill({
          status: 422,
          contentType: "application/json",
          body: JSON.stringify({
            cle: "erreurs:dependanceCirculaire",
            message: "Cette dépendance créerait un cycle.",
          }),
        });
      },
    );

    await page.goto(`/taches/${FICHE.id}`);
    await page.getByRole("button", { name: "Modifier les dépendances" }).click();
    const fenetre = page.getByRole("dialog");
    await fenetre.getByRole("checkbox", { name: /Cadrer les parcours/ }).check();
    await fenetre.getByRole("button", { name: "Enregistrer les dépendances" }).click();

    await expect(
      fenetre.getByText("Cette dépendance créerait une dépendance circulaire."),
    ).toBeVisible();
    // La fenêtre RESTE ouverte : refuser en la fermant ferait perdre la
    // sélection, et l'utilisateur ne saurait pas laquelle reprendre.
    await expect(fenetre).toBeVisible();
  });

  test("RG-GEN-06 — sans `tasks:manage_dependencies`, le bouton n'est pas proposé", async ({
    page,
  }) => {
    await serveur(page, { session: SESSION_LECTURE, reponses: reponsesDeps });
    await page.goto(`/taches/${FICHE.id}`);

    await expect(page.getByText("Dépend de (1)")).toBeVisible();
    await expect(page.getByRole("button", { name: "Modifier les dépendances" })).toHaveCount(0);
  });
});

/**
 * **L-48** — trois capacités serveur que la fiche tâche n'atteignait pas.
 *
 * Les trois routes existent, gardées et testées côté serveur. La vue affichait
 * les documents sans pouvoir en déposer, les commentaires sans pouvoir les
 * corriger, et les tiers assignés sans pouvoir en assigner. Une capacité sans
 * client ne fait échouer aucun contrôle : c'est ce que le lot L-39 mesure
 * désormais, et ces trois-là en sortaient.
 */
test.describe("Vue 17 — trois gestes que la fiche n'offrait pas", () => {
  const SESSION_DOC = {
    ...SESSION_TACHES,
    permissions: [
      ...SESSION_TACHES.permissions,
      "documents:create",
      "documents:read",
      "documents:download",
      "comments:update",
      "comments:delete",
    ],
  };

  test("EX-DOC-01 — la zone de dépôt EST un champ de fichier, pas un paragraphe", async ({
    page,
  }) => {
    let recu: Record<string, unknown> | null = null;
    await serveur(page, {
      session: SESSION_DOC,
      reponses: { [`/api/taches/${FICHE.id}`]: { corps: FICHE } },
    });
    await page.route(
      (url) => url.pathname === "/api/documents",
      (route) => {
        if (route.request().method() !== "POST") return route.fallback();
        recu = route.request().postDataJSON() as Record<string, unknown>;
        return route.fulfill({ status: 201, contentType: "application/json", body: '{"id":"d1"}' });
      },
    );
    await page.goto(`/taches/${FICHE.id}`);

    await page
      .getByLabel("Déposez un fichier ici, ou cliquez pour parcourir.")
      .setInputFiles({ name: "note.txt", mimeType: "text/plain", buffer: Buffer.from("bonjour") });

    await expect.poll(() => recu).not.toBeNull();
    expect(recu).toMatchObject({ nom: "note.txt", typeMime: "text/plain", taskId: FICHE.id });
    // Le contenu part en base64 — c'est ce que la route attend.
    expect(Buffer.from(String(recu!["contenuBase64"]), "base64").toString()).toBe("bonjour");
  });

  test("RG-GEN-06 — sans documents:create, la zone de dépôt n'est pas proposée", async ({
    page,
  }) => {
    await serveur(page, {
      session: SESSION_TACHES,
      reponses: { [`/api/taches/${FICHE.id}`]: { corps: FICHE } },
    });
    await page.goto(`/taches/${FICHE.id}`);
    await expect(
      page.getByLabel("Déposez un fichier ici, ou cliquez pour parcourir."),
    ).toHaveCount(0);
  });

  test("EX-DOC-04 — on modifie et supprime SES commentaires, pas ceux des autres", async ({
    page,
  }) => {
    /*
     * `RG-DOC-01` — « un utilisateur modifie et supprime ses propres
     * contributions ». Le client masque par courtoisie ce que le serveur
     * refuserait de toute façon : les commandes n'apparaissent que sur ses
     * propres commentaires.
     */
    let patch: Record<string, unknown> | null = null;
    const mien = { ...SESSION_DOC };
    const fiche = {
      ...FICHE,
      commentaires: [
        {
          id: "c-moi",
          contenu: "À moi",
          creeLe: "2026-08-10T09:15:00.000Z",
          auteur: { id: mien.id, prenom: "Camille", nom: "Roussel" },
        },
        {
          id: "c-autre",
          contenu: "À quelqu'un d'autre",
          creeLe: "2026-08-10T10:00:00.000Z",
          auteur: { id: "a1", prenom: "Driss", nom: "Amrani" },
        },
      ],
    };

    await serveur(page, { session: mien, reponses: { [`/api/taches/${FICHE.id}`]: { corps: fiche } } });
    await page.route(
      (url) => url.pathname.startsWith("/api/documents/commentaires/"),
      (route) => {
        if (route.request().method() !== "PATCH") return route.fallback();
        patch = route.request().postDataJSON() as Record<string, unknown>;
        return route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
      },
    );
    await page.goto(`/taches/${FICHE.id}`);

    // Une seule paire de commandes, et elle est DANS le commentaire qui est le
    // mien. Viser la page entière attraperait le « Modifier » de la fiche.
    const actions = page.locator(".cmt-acts");
    await expect(actions).toHaveCount(1);
    await expect(actions.getByRole("button", { name: "Supprimer" })).toBeVisible();

    await actions.getByRole("button", { name: "Modifier" }).click();
    await page.getByLabel("Modifier", { exact: true }).fill("Corrigé");
    await page.getByRole("button", { name: "Enregistrer", exact: true }).click();

    await expect.poll(() => patch).not.toBeNull();
    expect(patch).toMatchObject({ contenu: "Corrigé" });
  });
});

/**
 * `EX-DOC-02` — « consulter, télécharger, renommer, supprimer un document ».
 *
 * Trois des quatre verbes vivaient sans écran. `GET`, `PATCH` et
 * `DELETE /documents/:id` existaient, gardées et couvertes côté serveur, et
 * **aucun appel client ne les visait** : on téléchargeait, un point c'est tout.
 * Le verbe du milieu, encore — cinquième occurrence de la famille.
 *
 * Ce que ces contrôles vérifient, et pourquoi chacun :
 *
 *   - la consultation **part sur le clic, pas au chargement** : `RG-DOC-02` la
 *     trace, et tracer une lecture que personne n'a demandée est un faux dans
 *     le journal d'audit ;
 *   - le renommage porte le nom saisi, pas celui qu'on avait lu ;
 *   - la suppression vise le document ouvert ;
 *   - `RG-DOC-01` — sur le document d'autrui, les deux commandes **n'existent
 *     pas**, et la raison est écrite. Le serveur refuserait de toute façon
 *     (`pas_son_contenu`) : le client masque par courtoisie, il ne décide pas.
 */
test.describe("Vue 17 — les trois verbes du document que rien n'appelait", () => {
  const SESSION_DOCUMENTS = {
    ...SESSION_TACHES,
    permissions: [
      ...SESSION_TACHES.permissions,
      "documents:read",
      "documents:download",
      "documents:create",
      "documents:update",
      "documents:delete",
    ],
  };

  /** Le serveur de documents : compte les appels, et dit ce qu'il a reçu. */
  async function serveurDocument(
    page: import("@playwright/test").Page,
    options: {
      session?: unknown;
      detail: unknown;
      statutPatch?: number;
    },
  ) {
    const journal: { verbe: string; corps: unknown }[] = [];
    await serveur(page, {
      session: options.session ?? SESSION_DOCUMENTS,
      reponses: { [`/api/taches/${FICHE.id}`]: { corps: FICHE } },
    });
    await page.route(
      (url) => url.pathname === "/api/documents/d1",
      (route) => {
        const verbe = route.request().method();
        journal.push({
          verbe,
          corps: verbe === "GET" ? null : route.request().postDataJSON(),
        });
        if (verbe === "GET") {
          return route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify(options.detail),
          });
        }
        return route.fulfill({
          status: options.statutPatch ?? 200,
          contentType: "application/json",
          body: "{}",
        });
      },
    );
    return journal;
  }

  test("EX-DOC-02 — consulter : le nom du document APPELLE le serveur, et rend ce que la liste ne dit pas", async ({
    page,
  }) => {
    const journal = await serveurDocument(page, { detail: DOCUMENT_MIEN });
    await page.goto(`/taches/${FICHE.id}`);

    await expect(page.getByRole("button", { name: "cadrage-v2.pdf" })).toBeVisible();
    /*
     * `RG-DOC-02` — la consultation laisse une trace. Elle ne doit donc PAS
     * partir toute seule : afficher la fiche tâche n'est pas consulter chacune
     * de ses pièces jointes. Sans cette assertion, un appel dressé au
     * chargement passerait pour un succès.
     */
    expect(journal).toHaveLength(0);

    await page.getByRole("button", { name: "cadrage-v2.pdf" }).click();

    await expect.poll(() => journal.length).toBe(1);
    expect(journal[0]!.verbe).toBe("GET");

    // Ce que `GET /taches/:id` ne porte pas, et que seule la consultation rend.
    const fenetre = page.getByRole("dialog");
    await expect(fenetre.getByText("application/pdf")).toBeVisible();
    await expect(fenetre.getByText(DOCUMENT_MIEN.empreinte)).toBeVisible();
  });

  test("EX-DOC-02 — renommer : le PATCH porte le nom SAISI, pas celui qu'on avait lu", async ({
    page,
  }) => {
    const journal = await serveurDocument(page, { detail: DOCUMENT_MIEN });
    await page.goto(`/taches/${FICHE.id}`);
    await page.getByRole("button", { name: "cadrage-v2.pdf" }).click();

    const fenetre = page.getByRole("dialog");
    const champ = fenetre.getByLabel("Nom du document");
    await expect(champ).toHaveValue("cadrage-v2.pdf");
    // Le bouton reste inerte tant que le nom n'a pas changé : renommer en
    // l'identique est une écriture — et une trace — pour rien.
    await expect(fenetre.getByRole("button", { name: "Renommer" })).toBeDisabled();

    await champ.fill("cadrage-v3.pdf");
    await fenetre.getByRole("button", { name: "Renommer" }).click();

    await expect.poll(() => journal.filter((a) => a.verbe === "PATCH")).toHaveLength(1);
    expect(journal.find((a) => a.verbe === "PATCH")!.corps).toEqual({ nom: "cadrage-v3.pdf" });
    await expect(page.getByText("Document renommé.")).toBeVisible();
  });

  test("EX-DOC-02 — supprimer : le DELETE vise le document ouvert", async ({ page }) => {
    const journal = await serveurDocument(page, { detail: DOCUMENT_MIEN });
    await page.goto(`/taches/${FICHE.id}`);
    await page.getByRole("button", { name: "cadrage-v2.pdf" }).click();

    await page.getByRole("dialog").getByRole("button", { name: "Supprimer", exact: true }).click();

    await expect.poll(() => journal.filter((a) => a.verbe === "DELETE")).toHaveLength(1);
    await expect(page.getByText("Document supprimé.")).toBeVisible();
  });

  test("RG-DOC-01 — sur le document d'AUTRUI, ni renommage ni suppression, et la raison est dite", async ({
    page,
  }) => {
    await serveurDocument(page, { detail: DOCUMENT_AUTRUI });
    await page.goto(`/taches/${FICHE.id}`);
    await page.getByRole("button", { name: "cadrage-v2.pdf" }).click();

    const fenetre = page.getByRole("dialog");
    // La session détient `documents:update` ET `documents:delete` : ce qui
    // retire les commandes ici est l'APPARTENANCE, pas la permission.
    await expect(fenetre.getByLabel("Nom du document")).toHaveCount(0);
    await expect(fenetre.getByRole("button", { name: "Supprimer", exact: true })).toHaveCount(0);
    await expect(
      fenetre.getByText("Ce document a été déposé par quelqu'un d'autre", { exact: false }),
    ).toBeVisible();

    // La pièce reste consultable et téléchargeable : la règle porte sur
    // l'écriture, pas sur la lecture.
    await expect(fenetre.getByText("application/pdf")).toBeVisible();
    await expect(page.getByRole("link", { name: "Télécharger" })).toBeVisible();
  });

  test("RG-GEN-06 — sur SON PROPRE document, sans `documents:update` ni `documents:delete`, rien n'est proposé", async ({
    page,
  }) => {
    await serveurDocument(page, {
      session: {
        ...SESSION_TACHES,
        permissions: [...SESSION_TACHES.permissions, "documents:read", "documents:download"],
      },
      detail: DOCUMENT_MIEN,
    });
    await page.goto(`/taches/${FICHE.id}`);
    await page.getByRole("button", { name: "cadrage-v2.pdf" }).click();

    const fenetre = page.getByRole("dialog");
    // Le document est le sien — `RG-DOC-01` ne s'y oppose pas. C'est la
    // permission qui manque, et le message le dit autrement.
    await expect(fenetre.getByLabel("Nom du document")).toHaveCount(0);
    await expect(fenetre.getByRole("button", { name: "Supprimer", exact: true })).toHaveCount(0);
    await expect(
      fenetre.getByText("Vous n'avez pas le droit de renommer ce document.", { exact: true }),
    ).toBeVisible();
  });

  test("RG-GEN-06 — sans `documents:read`, le nom reste LISIBLE mais n'est plus une commande", async ({
    page,
  }) => {
    await serveur(page, {
      session: SESSION_TACHES,
      reponses: { [`/api/taches/${FICHE.id}`]: { corps: FICHE } },
    });
    await page.goto(`/taches/${FICHE.id}`);

    // Masquer la ligne ferait croire qu'aucune pièce n'est jointe.
    await expect(page.getByText("cadrage-v2.pdf", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "cadrage-v2.pdf" })).toHaveCount(0);
  });
});

/**
 * `EX-TSK-02` — « déplacer une tâche entre colonnes par glisser-déposer ».
 *
 * **Ce qui est prouvé ici est l'EFFET, pas le geste.** Le glisser-déposer HTML5
 * simulé est la source d'instabilité la plus classique d'une suite de bout en
 * bout, et un rouge intermittent apprend à relancer plutôt qu'à chercher. Le
 * kanban porte déjà l'alternative clavier qu'exige `C6` — menu « Déplacer
 * vers… » et Alt + ← / → — et les deux chemins passent par la MÊME mutation.
 * Prouver que la mutation part avec les bons arguments prouve le déplacement ;
 * prouver qu'une traînée simulée ne lève pas d'exception ne prouve rien.
 *
 * Note d'exécution, consignée : `POST /taches/:id/deplacer` ne sert PAS le
 * kanban. Elle déplace une date ou un assigné et ne touche jamais au statut —
 * c'est le même service que `PATCH /planning/taches/deplacer`, que la vue 07
 * appelle déjà. Les colonnes du kanban sont des statuts : c'est
 * `PATCH /taches/:id` qui les écrit.
 */
test.describe("Vue 12 — EX-TSK-02, le déplacement entre colonnes", () => {
  const reponses = {
    "/api/taches": { corps: LISTE },
    [`/api/projets/${PROJET.id}`]: { corps: PROJET },
  };

  async function serveurKanban(
    page: import("@playwright/test").Page,
    options: { statut?: number } = {},
  ) {
    const journal: Record<string, unknown>[] = [];
    await serveur(page, { session: SESSION_TACHES, reponses });
    await page.route(
      (url) => url.pathname === `/api/taches/${TACHE_PROJET.id}`,
      (route) => {
        if (route.request().method() !== "PATCH") return route.fallback();
        journal.push(route.request().postDataJSON() as Record<string, unknown>);
        return route.fulfill({
          status: options.statut ?? 200,
          contentType: "application/json",
          body: options.statut === 409 ? '{"cle":"erreurs:conflitDeVersion"}' : '{"version":4}',
        });
      },
    );
    return journal;
  }

  test("EX-TSK-02 — la colonne d'arrivée est ÉCRITE, avec la version lue", async ({ page }) => {
    const journal = await serveurKanban(page);
    await page.goto(`/projets/${PROJET.id}/taches`);

    await page.getByRole("button", { name: /Déplacer la tâche Rédiger/ }).click();
    await page.getByRole("menuitem", { name: "Déplacer vers Terminé" }).click();

    await expect.poll(() => journal).toHaveLength(1);
    // `RG-GEN-07` — la version lue accompagne l'écriture. Sans elle, deux
    // déplacements simultanés se recouvriraient en silence.
    expect(journal[0]).toEqual({ statut: "done", version: TACHE_PROJET.version });
    await expect(page.getByText("Statut mis à jour.")).toBeVisible();
  });

  test("EX-TSK-02 — Alt + → décale d'UNE colonne, dans l'ordre du vocabulaire", async ({
    page,
  }) => {
    const journal = await serveurKanban(page);
    await page.goto(`/projets/${PROJET.id}/taches`);

    // La tâche est en « En cours » : la colonne suivante est « En revue », pas
    // « Terminé ». Un décalage qui saute une colonne passerait inaperçu sans
    // cette assertion sur la valeur exacte.
    await page.getByRole("article", { name: /Rédiger la note de cadrage/ }).focus();
    await page.keyboard.press("Alt+ArrowRight");

    await expect.poll(() => journal).toHaveLength(1);
    expect(journal[0]).toEqual({ statut: "review", version: TACHE_PROJET.version });
  });

  test("EX-TSK-02 — déplacement échoué : la carte est ANNONCÉE de retour dans sa colonne", async ({
    page,
  }) => {
    await serveurKanban(page, { statut: 409 });
    await page.goto(`/projets/${PROJET.id}/taches`);

    await page.getByRole("button", { name: /Déplacer la tâche Rédiger/ }).click();
    await page.getByRole("menuitem", { name: "Déplacer vers Terminé" }).click();

    // Brief de la vue 12 : « Déplacement échoué : "Erreur lors de la mise à
    // jour du statut", carte remise à sa place d'origine. »
    await expect(page.getByText("Échec : la carte revient dans En cours")).toBeVisible();
    await expect(
      page.getByRole("article", { name: "Rédiger la note de cadrage — En cours" }),
    ).toBeVisible();
  });

  test("RG-TSK-11 — la règle porte sur la DATE au planning : au kanban, la tâche multi-assignée change de statut", async ({
    page,
  }) => {
    /*
     * L'assertion inverse de `planning.e2e.spec.ts`, et elle compte autant :
     * `RG-TSK-11` dit « dans le planning, une tâche multi-assignée ne peut pas
     * voir sa DATE modifiée par glisser-déposer ». Elle ne dit rien du statut.
     * Étendre le verrou au kanban aurait rendu indéplaçable toute tâche à deux
     * assignés — et personne ne l'aurait vu, faute de contrôle en face.
     */
    const journal = await serveurKanban(page);
    await page.goto(`/projets/${PROJET.id}/taches`);

    expect(TACHE_PROJET.assignes.length).toBeGreaterThan(1);
    await page.getByRole("button", { name: /Déplacer la tâche Rédiger/ }).click();
    await expect(page.getByRole("menuitem", { name: /Date non déplaçable/ })).toHaveCount(0);
    await page.getByRole("menuitem", { name: "Déplacer vers Bloqué" }).click();

    await expect.poll(() => journal).toHaveLength(1);
    expect(journal[0]).toEqual({ statut: "blocked", version: TACHE_PROJET.version });
  });
});

/**
 * `EX-TRS-02`, `RG-TRS-04` — assigner un tiers à une tâche.
 *
 * **Le dernier « geste sans liste de candidats » du produit.** La route
 * d'assignation existait depuis L-12 et rien ne l'appelait : la fiche affichait
 * les tiers assignés sans jamais offrir d'en assigner un, faute de savoir
 * lesquels proposer. `RG-TRS-04` borne la liste aux tiers rattachés au projet
 * parent — et le serveur applique le même refus à l'écriture, donc l'écran ne
 * propose jamais ce qui serait refusé.
 *
 * Même manque que L-45 a comblé pour les dépendances de tâche.
 */
test.describe("Vue 17 — assigner un tiers", () => {
  const SESSION_TIERS = {
    ...SESSION_TACHES,
    permissions: [...SESSION_TACHES.permissions, "third_parties:assign", "third_parties:read"],
  };

  test("EX-TRS-02 — la liste des candidats vient du SERVEUR, et l'assignation la vise", async ({
    page,
  }) => {
    let assigne: Record<string, unknown> | null = null;
    await serveur(page, {
      session: SESSION_TIERS,
      reponses: {
        [`/api/taches/${FICHE.id}`]: { corps: FICHE },
        [`/api/tiers/taches/${FICHE.id}/candidats`]: {
          corps: [{ id: "tp1", type: "organisation", organisation: "Cabinet Vallée", contactNom: null }],
        },
      },
    });
    await page.route(
      (url) => url.pathname.endsWith("/assigner"),
      (route) => {
        if (route.request().method() !== "POST") return route.fallback();
        assigne = route.request().postDataJSON() as Record<string, unknown>;
        return route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
      },
    );
    await page.goto(`/taches/${FICHE.id}`);

    await page.getByRole("button", { name: "Assigner un tiers" }).click();
    await page.getByRole("button", { name: "Cabinet Vallée" }).click();

    await expect.poll(() => assigne).not.toBeNull();
    expect(assigne).toMatchObject({ thirdPartyId: "tp1" });
  });

  test("RG-TRS-04 — aucun candidat : la sortie dit qu'il faut rattacher au PROJET", async ({
    page,
  }) => {
    /*
     * Le vide n'est pas le même selon qu'on est dans un projet ou non — et il
     * dit ce qu'il faut faire, pas seulement qu'il n'y a rien.
     */
    await serveur(page, {
      session: SESSION_TIERS,
      reponses: {
        [`/api/taches/${FICHE.id}`]: { corps: FICHE },
        [`/api/tiers/taches/${FICHE.id}/candidats`]: { corps: [] },
      },
    });
    await page.goto(`/taches/${FICHE.id}`);
    await page.getByRole("button", { name: "Assigner un tiers" }).click();

    await expect(page.getByText(/Rattachez-en un au projet d'abord/)).toBeVisible();
  });

  test("RG-GEN-06 — sans third_parties:assign, le geste n'est pas proposé", async ({ page }) => {
    await serveur(page, {
      session: SESSION_TACHES,
      reponses: { [`/api/taches/${FICHE.id}`]: { corps: FICHE } },
    });
    await page.goto(`/taches/${FICHE.id}`);
    await expect(page.getByRole("button", { name: "Assigner un tiers" })).toHaveCount(0);
  });
});
