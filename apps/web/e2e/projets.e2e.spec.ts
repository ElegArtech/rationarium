import { test, expect } from "@playwright/test";
import {
  serveur,
  SESSION,
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

  /**
   * `EX-PRJ-07`, `RG-PRJ-02` — « la suppression d'un projet est d'abord logique :
   * le projet passe au statut Annulé et reste restaurable ».
   *
   * Tout l'aval était porté depuis L-32 — le bandeau, le bouton « Restaurer », le
   * refus de modifier un projet annulé — et **rien dans le produit ne pouvait
   * produire cet état**. Le premier des trois temps de `RG-GEN-10` manquait, donc
   * la suppression définitive était le seul chemin offert : perdre les tâches, les
   * jalons et l'équipe pour corriger une erreur de saisie.
   */
  test("EX-PRJ-07, RG-PRJ-02 — l'annulation logique existe, AVANT la suppression définitive", async ({
    page,
  }) => {
    let appelee = false;
    await serveur(page, { reponses });
    await page.route(
      (url) => url.pathname.endsWith("/annuler"),
      (route) => {
        if (route.request().method() !== "POST") return route.fallback();
        appelee = true;
        return route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
      },
    );
    await page.goto(CHEMIN_PROJET);

    const annuler = page.getByRole("button", { name: "Annuler le projet" });
    await expect(annuler).toBeVisible();
    await annuler.click();

    await expect.poll(() => appelee).toBe(true);
  });

  test("RG-PRJ-02 — un projet DÉJÀ annulé ne se réannule pas", async ({ page }) => {
    await serveur(page, {
      reponses: {
        ...reponses,
        [`/api/projets/${PROJET.id}`]: { corps: { ...PROJET, statut: "cancelled" } },
      },
    });
    await page.goto(CHEMIN_PROJET);
    await expect(page.getByRole("button", { name: "Annuler le projet" })).toHaveCount(0);
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

test.describe("EX-PRJ-08 — la fiche projet en CINQ onglets", () => {
  const reponses = {
    "/feuille-de-route": { corps: ROUTE },
    [`/api/projets/${PROJET.id}`]: { corps: PROJET },
  };

  /*
   * Le compteur voyage DANS le lien : le nom accessible de l'onglet Tâches est
   * « Tâches 34 », pas « Tâches ». Un `getByRole("link", { name, exact: true })`
   * ne trouverait rien — et l'échec ne ressemblerait pas à sa cause.
   */
  const ONGLETS = ["Vue d'ensemble", "Tâches", "Jalons", "Équipe", "Gantt"];

  test("les cinq onglets du cadrage sont là, dans l'ordre, et mènent quelque part", async ({
    page,
  }) => {
    await serveur(page, { reponses });
    await page.goto(CHEMIN_PROJET);

    const barre = page.getByRole("navigation", { name: "Sections du projet" });
    await expect(barre).toBeVisible();

    const liens = barre.getByRole("link");
    await expect(liens).toHaveCount(ONGLETS.length);
    for (const [i, libelle] of ONGLETS.entries()) {
      await expect(liens.nth(i)).toContainText(libelle);
      // Un onglet sans destination serait un onglet inerte : la vue 11 en
      // avait cinq, et rien ne le disait.
      await expect(liens.nth(i)).toHaveAttribute("href", /\/projets\//);
    }
  });

  test("L'ONGLET COURANT SE DIT PAR aria-current, jamais par aria-pressed", async ({ page }) => {
    /*
     * Un lien navigue, il ne bascule pas. `aria-pressed` sur un lien est une
     * violation critique — le dépôt l'a déjà payée sur le groupe segmenté.
     */
    await serveur(page, { reponses });
    await page.goto(CHEMIN_PROJET);

    const barre = page.getByRole("navigation", { name: "Sections du projet" });
    await expect(barre.getByRole("link", { name: /Vue d'ensemble/ })).toHaveAttribute(
      "aria-current",
      "page",
    );
    await expect(barre.locator("[aria-pressed]")).toHaveCount(0);
    // Un seul onglet courant à la fois.
    await expect(barre.locator("[aria-current='page']")).toHaveCount(1);
  });

  test("changer d'onglet DÉPLACE le marqueur — la barre suit la navigation", async ({ page }) => {
    await serveur(page, { reponses });
    await page.goto(CHEMIN_PROJET);

    // Un onglet se vise TOUJOURS dans sa barre de sections : « Jalons » existe
    // aussi ailleurs, et un `getByRole` nu naviguerait autre part.
    const barre = page.getByRole("navigation", { name: "Sections du projet" });
    await barre.getByRole("link", { name: /Jalons/ }).click();

    await expect(page).toHaveURL(new RegExp(`${PROJET.id}/jalons$`));
    await expect(barre.getByRole("link", { name: /Jalons/ })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  /*
   * ────────────────────────────────────────────────────────────────────────
   * DÉFAUT TROUVÉ ICI, NON CORRIGÉ — ce lot n'écrit pas de code de production.
   *
   * Sur les quatre onglets autres que « Vue d'ensemble », DEUX liens portent
   * `aria-current="page"` en même temps. `Fiche.tsx` calcule bien l'attribut
   * lui-même (`o.cle === onglet ? "page" : undefined`) et neutralise la classe
   * du routeur par `activeProps={{ className: "" }}` — mais le `Link` de
   * TanStack pose AUSSI son propre `aria-current="page"` sur toute route
   * active, et `/projets/$id` reste active par préfixe quand on est sur
   * `/projets/$id/jalons`. La neutralisation porte sur la classe, pas sur
   * l'attribut.
   *
   * Conséquence : un lecteur d'écran annonce deux « page courante » dans la
   * même barre. `axe` ne le voit pas — plusieurs `aria-current` ne sont pas
   * une violation en soi — et le rendu ne bouge pas, puisque `is-active` est
   * bien exclusif. C'est la famille « inerte et invisible » du dépôt, vue
   * depuis l'autre côté : ici l'attribut est en TROP, et rien ne le dit.
   *
   * Le correctif est `activeOptions={{ exact: true }}` sur le lien de la vue
   * d'ensemble, ou `aria-current` posé par le routeur seul. Il relève d'une
   * tâche de vue, pas d'un lot de traçabilité.
   * ────────────────────────────────────────────────────────────────────────
   */
  test("EX-PRJ-08 — UN SEUL onglet porte aria-current à la fois", async ({ page }) => {
    /*
     * **Défaut trouvé par ce test, puis corrigé.** `activeProps` neutralisait la
     * classe que le routeur ajoute, pas son `aria-current` — et `/projets/$id`
     * reste active par PRÉFIXE sur `/projets/$id/jalons`. Deux liens portaient
     * donc « page courante » en même temps, et un lecteur d'écran l'annonçait
     * deux fois. `axe` ne le voit pas, le rendu ne bouge pas : seul un contrôle
     * qui COMPTE l'attribut l'attrape. Correctif : `activeOptions={{ exact: true }}`.
     */
    await serveur(page, { reponses });
    await page.goto(`${CHEMIN_PROJET}/jalons`);

    const barre = page.getByRole("navigation", { name: "Sections du projet" });
    await expect(barre.locator("[aria-current='page']")).toHaveCount(1);
  });

  test("trois onglets portent leur compte, et il vient du serveur", async ({ page }) => {
    await serveur(page, { reponses });
    await page.goto(CHEMIN_PROJET);

    const barre = page.getByRole("navigation", { name: "Sections du projet" });
    await expect(barre.getByRole("link", { name: /Tâches/ })).toContainText("34");
    await expect(barre.getByRole("link", { name: /Jalons/ })).toContainText("4");
    // 6 agents + 2 tiers + 1 client : l'onglet Équipe compte les trois
    // populations, pas les seuls agents.
    await expect(barre.getByRole("link", { name: /Équipe/ })).toContainText("9");
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

test.describe("EX-JAL-05 — déplier / replier les tâches d'un jalon, et modifier leur statut depuis la feuille de route", () => {
  /*
   * Le statut se change EN LIGNE : c'est ce que `cadrage/02` pose sur la vue
   * 13 (« chaque tâche affiche titre, statut modifiable en ligne, assignés,
   * estimation »), et c'est pour cela que `feuilleDeRoute` rend la `version`
   * de chaque tâche — sans elle, le client ne pourrait écrire qu'en « dernier
   * arrivé gagne », ce que `RG-GEN-07` interdit.
   *
   * Le jeu d'essai la porte donc, comme le serveur la rend. Un jeu d'essai qui
   * inventerait sa forme validerait l'invention au lieu de trouver l'erreur.
   */
  const ROUTE_VERSIONNEE = {
    ...ROUTE,
    jalons: ROUTE.jalons.map((j) => ({
      ...j,
      taches: j.taches.map((t, i) => ({ ...t, version: i + 1 })),
    })),
    sansJalon: ROUTE.sansJalon.map((t) => ({ ...t, version: 3 })),
  };

  /** `RG-GEN-06` — le client désactive par courtoisie ; le droit fait le geste. */
  const SESSION_EDITION = {
    ...SESSION,
    permissions: [...SESSION.permissions, "tasks:update"],
  };

  const reponses = {
    "/feuille-de-route": { corps: ROUTE_VERSIONNEE },
    [`/api/projets/${PROJET.id}`]: { corps: PROJET },
  };

  test("un jalon SE REPLIE et SE REDÉPLIE — la bascule va dans les deux sens", async ({ page }) => {
    await serveur(page, { session: SESSION_EDITION, reponses });
    await page.goto(`${CHEMIN_PROJET}/jalons`);

    // Les jalons porteurs de tâches sont dépliés d'emblée : « Ateliers
    // usagers » est donc visible avant tout clic.
    await expect(page.getByText("Ateliers usagers")).toBeVisible();

    await page.getByRole("button", { name: "Masquer" }).first().click();
    await expect(page.getByText("Ateliers usagers")).toHaveCount(0);

    await page.getByRole("button", { name: "Afficher" }).first().click();
    await expect(page.getByText("Ateliers usagers")).toBeVisible();
  });

  test("LE STATUT SE CHANGE SANS QUITTER LA FEUILLE DE ROUTE, et l'écriture porte sa version", async ({
    page,
  }) => {
    let corpsRecu: unknown = null;
    await serveur(page, { session: SESSION_EDITION, reponses });
    await page.route(
      (url) => /\/api\/taches\/[^/]+$/.test(url.pathname),
      (route) => {
        if (route.request().method() !== "PATCH") return route.fallback();
        corpsRecu = route.request().postDataJSON();
        return route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
      },
    );
    await page.goto(`${CHEMIN_PROJET}/jalons`);

    const statut = page.getByLabel("Statut de Jeux d'essai");
    await expect(statut).toBeEnabled();
    await statut.selectOption("done");

    await expect.poll(() => corpsRecu).not.toBeNull();
    // `RG-GEN-07` — la version lue accompagne l'écriture. Sans elle, deux
    // personnes qui changent le même statut s'écrasent en silence.
    expect(corpsRecu).toMatchObject({ statut: "done", version: 1 });
    await expect(page.getByText("Statut mis à jour. Le jalon a été recalculé.")).toBeVisible();
  });

  test("RG-GEN-06 — sans tasks:update le sélecteur reste VISIBLE mais DÉSACTIVÉ", async ({
    page,
  }) => {
    /*
     * Le masquer ferait disparaître l'information ; le laisser actif ferait
     * échouer le geste au serveur. Désactivé, il dit à la fois ce qu'il y a et
     * ce qu'on ne peut pas faire.
     */
    await serveur(page, { session: SESSION_LECTURE, reponses });
    await page.goto(`${CHEMIN_PROJET}/jalons`);

    const statut = page.getByLabel("Statut de Jeux d'essai");
    await expect(statut).toBeVisible();
    await expect(statut).toBeDisabled();
  });

  test("les tâches SANS JALON se déplient aussi, et leur statut s'y change", async ({ page }) => {
    /*
     * `RG-JAL-05` détache les tâches d'un jalon supprimé sans les supprimer :
     * une tâche qui ne pend à rien est précisément celle qu'on oublie.
     */
    await serveur(page, { session: SESSION_EDITION, reponses });
    await page.goto(`${CHEMIN_PROJET}/jalons`);

    await expect(page.getByText("Reprise des libellés")).toHaveCount(0);
    await page.getByRole("button", { name: "Afficher" }).last().click();

    await expect(page.getByText("Reprise des libellés")).toBeVisible();
    await expect(page.getByLabel("Statut de Reprise des libellés")).toBeEnabled();
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
      // `GET /utilisateurs` rend un TABLEAU. Ce jeu l'enveloppait dans
      // `{ utilisateurs: [...] }` — la forme que le client avait inventée, et
      // que le serveur n'a jamais rendue. Les deux erreurs se validaient l'une
      // l'autre : le sélecteur de membres était vide en exploitation, et ce
      // contrôle passait au vert sur la fiction. Même couple que la vue 27.
      reponses: { ...reponses, "/utilisateurs": { corps: [{ id: "a1", prenom: "Driss", nom: "Amrani" }] } },
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
