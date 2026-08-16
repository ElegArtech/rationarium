import { test, expect } from "@playwright/test";
import {
  serveur,
  SESSION_LECTURE,
  PROJET,
  LIGNE_PROJET,
  ROUTE,
  EQUIPE,
} from "./fixtures/projets.js";

/**
 * L-32 — vues 10, 11, 13 et 14.
 *
 * Les tests suivent `design/etats.json` : chaque axe d'état y est couvert, et
 * les notes du manifeste — « "rien n'existe" et "rien ne correspond" n'ont pas
 * la même sortie », « les trois états bloquent la modification différemment »,
 * « trois populations, trois formes de pastille » — sont vérifiées telles
 * qu'elles sont écrites.
 */

const CHEMIN_PROJET = `/projets/${PROJET.id}`;

test.describe("Vue 10 — portefeuille", () => {
  test("nominal : une ligne par projet, avec ses valeurs alignées", async ({ page }) => {
    await serveur(page, {
      reponses: { "/api/projets": { corps: { projets: [LIGNE_PROJET], affiches: 1, total: 1 } } },
    });
    await page.goto("/projets");

    await expect(page.getByRole("heading", { name: "Projets", level: 1 })).toBeVisible();
    await expect(page.getByText("1 projet", { exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: /Refonte du portail citoyen/ })).toBeVisible();
    // La progression est annoncée, pas seulement dessinée.
    await expect(page.getByRole("progressbar", { name: /Avancement de Refonte/ })).toHaveAttribute(
      "aria-valuenow",
      "62",
    );
  });

  test("« rien n'existe » propose de créer", async ({ page }) => {
    await serveur(page, {
      reponses: { "/api/projets": { corps: { projets: [], affiches: 0, total: 0 } } },
    });
    await page.goto("/projets");

    await expect(page.getByText("Le portefeuille est vide.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Créer un projet" })).toHaveCount(2);
    await expect(page.getByRole("button", { name: "Réinitialiser les filtres" })).toHaveCount(0);
  });

  test("« rien ne correspond » propose de réinitialiser — la sortie n'est pas la même", async ({
    page,
  }) => {
    await serveur(page, {
      reponses: { "/api/projets": { corps: { projets: [], affiches: 0, total: 12 } } },
    });
    await page.goto("/projets");
    await page.getByLabel("Rechercher par nom ou description…").fill("introuvable");

    await expect(page.getByText("Aucun projet ne correspond à votre recherche.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Réinitialiser les filtres" })).toBeVisible();
  });

  test("la fenêtre de création refuse les champs obligatoires vides", async ({ page }) => {
    await serveur(page, {
      reponses: { "/api/projets": { corps: { projets: [LIGNE_PROJET], affiches: 1, total: 1 } } },
    });
    await page.goto("/projets");
    await page.getByRole("button", { name: "Créer un projet" }).click();
    await page.getByRole("button", { name: "Créer le projet" }).click();

    await expect(page.getByText("Veuillez remplir tous les champs obligatoires.")).toBeVisible();
    await expect(page.getByLabel(/^Nom/)).toHaveAttribute("aria-invalid", "true");
    await expect(page.getByText("La date de début est requise")).toBeVisible();
  });

  test("RG-GEN-06 — sans droit de création, le bouton n'est pas proposé", async ({ page }) => {
    await serveur(page, {
      session: SESSION_LECTURE,
      reponses: { "/api/projets": { corps: { projets: [LIGNE_PROJET], affiches: 1, total: 1 } } },
    });
    await page.goto("/projets");

    await expect(page.getByRole("link", { name: /Refonte du portail citoyen/ })).toBeVisible();
    await expect(page.getByRole("button", { name: "Créer un projet" })).toHaveCount(0);
  });
});

test.describe("Vue 11 — fiche projet", () => {
  const reponses = {
    "/feuille-de-route": { corps: ROUTE },
    [`/api/projets/${PROJET.id}`]: { corps: PROJET },
  };

  test("les indicateurs calculés sont marqués comme tels", async ({ page }) => {
    await serveur(page, { reponses });
    await page.goto(CHEMIN_PROJET);

    await expect(page.getByRole("heading", { name: PROJET.nom, level: 1 })).toBeVisible();
    // « Ne pas suggérer qu'ils sont modifiables » — brief de la vue 11.
    const marqueurs = page.getByText("Calculé", { exact: true });
    await expect(marqueurs).toHaveCount(2);
    await expect(page.getByText("62 %", { exact: true })).toBeVisible();
    await expect(page.getByText("sur 1 200 h, 456 h restantes")).toBeVisible();
  });

  test("une valeur absente s'écrit, elle ne se tait pas", async ({ page }) => {
    await serveur(page, {
      reponses: {
        ...reponses,
        [`/api/projets/${PROJET.id}`]: {
          corps: { ...PROJET, sponsor: null, dernierInstantane: null, clients: [] },
        },
      },
    });
    await page.goto(CHEMIN_PROJET);
    await expect(page.getByText("Non renseigné").first()).toBeVisible();
  });

  test("projet annulé : bandeau propre, avec la restauration", async ({ page }) => {
    await serveur(page, {
      reponses: {
        ...reponses,
        [`/api/projets/${PROJET.id}`]: { corps: { ...PROJET, statut: "cancelled" } },
      },
    });
    await page.goto(CHEMIN_PROJET);

    await expect(page.getByText(/Ce projet est annulé/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Restaurer" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Archiver", exact: true })).toHaveCount(0);
  });

  test("projet archivé : bandeau distinct, avec le désarchivage", async ({ page }) => {
    await serveur(page, {
      reponses: {
        ...reponses,
        [`/api/projets/${PROJET.id}`]: { corps: { ...PROJET, archive: true } },
      },
    });
    await page.goto(CHEMIN_PROJET);

    // Les deux états ne se confondent pas : chacun porte SA sortie.
    await expect(page.getByText(/Ce projet est archivé/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Désarchiver" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Restaurer" })).toHaveCount(0);
  });

  test("suppression possible : les volumes sont chiffrés avant de confirmer", async ({ page }) => {
    await serveur(page, {
      reponses: {
        ...reponses,
        "/impact": {
          corps: {
            blocages: [],
            effacements: [
              { objet: "tâches", nombre: 34 },
              { objet: "jalons", nombre: 4 },
            ],
            alternative: null,
          },
        },
      },
    });
    await page.goto(CHEMIN_PROJET);
    await page.getByRole("button", { name: "Supprimer", exact: true }).click();

    await expect(page.getByText("Cette action est irréversible.")).toBeVisible();
    await expect(page.getByText("34 tâches")).toBeVisible();
    await expect(page.getByRole("button", { name: "Supprimer définitivement" })).toBeVisible();
  });

  test("suppression refusée : pas de bouton qui échouera, l'archivage à la place", async ({
    page,
  }) => {
    await serveur(page, {
      reponses: {
        ...reponses,
        "/impact": {
          corps: {
            blocages: [{ objet: "heures déclarées", nombre: 218 }],
            effacements: [],
            alternative: "archiver",
          },
        },
      },
    });
    await page.goto(CHEMIN_PROJET);
    await page.getByRole("button", { name: "Supprimer", exact: true }).click();

    await expect(page.getByText(/Impossible de supprimer définitivement/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Supprimer définitivement" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Archiver le projet" })).toBeVisible();
  });
});

test.describe("Vue 13 — jalons", () => {
  const reponses = {
    "/feuille-de-route": { corps: ROUTE },
    [`/api/projets/${PROJET.id}`]: { corps: PROJET },
  };

  test("la chronologie liste les jalons, dates et avancement", async ({ page }) => {
    await serveur(page, { reponses });
    await page.goto(`${CHEMIN_PROJET}/jalons`);

    await expect(page.getByRole("heading", { name: "Feuille de route" })).toBeVisible();
    await expect(page.getByText("Cadrage et ateliers")).toBeVisible();
    // Un jalon sans date le dit, plutôt que d'afficher un blanc.
    // En français, zéro prend le singulier : « 0 tâche ». C'est la règle ICU
    // qui le sait, pas une concaténation — et c'est tout l'intérêt d'ICU.
    await expect(page.getByText(/Aucune date · 0 tâche/)).toBeVisible();
  });

  test("le statut du jalon est marqué comme calculé, sur chaque ligne", async ({ page }) => {
    await serveur(page, { reponses });
    await page.goto(`${CHEMIN_PROJET}/jalons`);
    // Trois jalons + deux indicateurs calculés.
    await expect(page.getByText("Calculé", { exact: true })).toHaveCount(5);
  });

  test("déplier un jalon montre ses tâches ; un jalon vide le dit", async ({ page }) => {
    await serveur(page, { reponses });
    await page.goto(`${CHEMIN_PROJET}/jalons`);

    await page.getByRole("button", { name: "Afficher" }).first().click();
    await expect(page.getByText("Ateliers usagers")).toBeVisible();

    await page.getByRole("button", { name: "Afficher" }).last().click();
    await expect(page.getByText("Aucune tâche dans ce jalon")).toBeVisible();
  });

  test("l'encart du statut calculé est DANS le formulaire, pas en aide au survol", async ({
    page,
  }) => {
    await serveur(page, { reponses });
    await page.goto(`${CHEMIN_PROJET}/jalons`);
    await page.getByRole("button", { name: "+ Nouveau jalon" }).click();

    await expect(page.getByText("Statut calculé automatiquement")).toBeVisible();
    await expect(page.getByText("En attente — aucune tâche commencée")).toBeVisible();
    await expect(page.getByText("Terminé — toutes les tâches sont terminées")).toBeVisible();
    // Le champ « statut » ne doit pas exister : c'est tout le point.
    await expect(page.getByLabel("Statut", { exact: true })).toHaveCount(0);
  });

  test("le nom du jalon est obligatoire", async ({ page }) => {
    await serveur(page, { reponses });
    await page.goto(`${CHEMIN_PROJET}/jalons`);
    await page.getByRole("button", { name: "+ Nouveau jalon" }).click();
    await page.getByRole("button", { name: "Enregistrer" }).click();

    await expect(page.getByText("Le nom du jalon est requis")).toBeVisible();
  });

  test("état vide : aucun jalon défini, avec sa sortie", async ({ page }) => {
    await serveur(page, {
      reponses: {
        ...reponses,
        "/feuille-de-route": {
          corps: { jalons: [], indicateurs: { total: 0, termines: 0, enCours: 0, taches: 0 } },
        },
      },
    });
    await page.goto(`${CHEMIN_PROJET}/jalons`);

    await expect(page.getByText("Aucun jalon défini")).toBeVisible();
    await expect(page.getByRole("button", { name: "+ Créer un jalon" })).toBeVisible();
  });
});

test.describe("Vue 14 — équipe", () => {
  const reponses = {
    "/equipe": { corps: EQUIPE },
    "/feuille-de-route": { corps: ROUTE },
    [`/api/projets/${PROJET.id}`]: { corps: PROJET },
  };

  test("les trois populations sont séparées et nommées", async ({ page }) => {
    await serveur(page, { reponses });
    await page.goto(`${CHEMIN_PROJET}/equipe`);

    await expect(page.getByText("Agents de la collectivité")).toBeVisible();
    await expect(page.getByText("Intervenants extérieurs", { exact: true })).toBeVisible();
    await expect(page.getByText("Bénéficiaires", { exact: true })).toBeVisible();
    // La distinction n'est pas que graphique : elle est écrite.
    await expect(page.getByText("Comptent dans la charge")).toBeVisible();
    await expect(page.getByText("Hors charge interne")).toBeVisible();
    await expect(page.getByText("Commanditaires, pas contributeurs")).toBeVisible();
  });

  test("l'allocation cumulée est traduite en ETP", async ({ page }) => {
    await serveur(page, { reponses });
    await page.goto(`${CHEMIN_PROJET}/equipe`);
    await expect(page.getByText("60 % · 0,6 ETP")).toBeVisible();
  });

  test("un tiers n'a pas d'allocation, et la vue le dit", async ({ page }) => {
    await serveur(page, { reponses });
    await page.goto(`${CHEMIN_PROJET}/equipe`);
    await expect(page.getByText("Sans allocation")).toBeVisible();
    await expect(page.getByText("Ne contribue pas")).toBeVisible();
  });

  test("chaque section vide porte son propre message", async ({ page }) => {
    await serveur(page, {
      reponses: {
        ...reponses,
        "/equipe": { corps: { agents: [], tiers: [], clients: [], allocationCumulee: 0 } },
      },
    });
    await page.goto(`${CHEMIN_PROJET}/equipe`);

    await expect(page.getByText("Aucun membre")).toBeVisible();
    await expect(page.getByText("Aucun intervenant extérieur")).toBeVisible();
    await expect(page.getByText("Aucun client rattaché")).toBeVisible();
  });

  test("le doublon est annoncé sans aller-retour au serveur", async ({ page }) => {
    await serveur(page, {
      reponses: { ...reponses, "/utilisateurs": { corps: { utilisateurs: [{ id: "a1", prenom: "Driss", nom: "Amrani" }] } } },
    });
    await page.goto(`${CHEMIN_PROJET}/equipe`);
    await page.getByRole("button", { name: "+ Ajouter un membre" }).click();
    await page.getByLabel(/^Utilisateur/).selectOption("a1");
    await page.getByRole("button", { name: "Ajouter", exact: true }).click();

    await expect(page.getByText("Cet utilisateur est déjà membre du projet.")).toBeVisible();
  });

  test("le retrait dit ce qu'il ne supprime pas", async ({ page }) => {
    await serveur(page, { reponses });
    await page.goto(`${CHEMIN_PROJET}/equipe`);
    await page.getByRole("button", { name: /Retirer Driss Amrani du projet/ }).click();

    await expect(page.getByText(/Voulez-vous vraiment retirer Driss Amrani/)).toBeVisible();
    await expect(page.getByText(/Le temps déclaré et les tâches assignées sont conservés/)).toBeVisible();
    await expect(page.getByText("Aucune donnée n'est supprimée")).toBeVisible();
  });
});
