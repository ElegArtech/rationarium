import { test, expect, type Page } from "@playwright/test";
import {
  serveur,
  SESSION,
  SESSION_LECTURE,
  PROJET,
  LIGNE_PROJET,
  ROUTE,
  EQUIPE,
  EPOPEES,
  INSTANTANES,
  SESSION_RAPPORTS,
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

/**
 * `EX-PRJ-04` — « Choisir une icône dans une bibliothèque thématique **avec
 * recherche** ».
 *
 * Les cinquante codes vivaient dans `@rationarium/contracts`, les cinquante
 * tracés dans `composants/icones-projet.tsx`, et **rien ne les employait** :
 * aucun sélecteur, aucune recherche, aucun champ « Icône du projet ». Les deux
 * moitiés étaient justes ; c'est le raccord qui manquait — et une
 * fonctionnalité absente ne fait échouer aucun contrôle.
 */
test.describe("EX-PRJ-04 — le sélecteur d'icône, avec sa recherche et ses catégories", () => {
  const reponses = {
    "/api/projets": { corps: { projets: [LIGNE_PROJET], affiches: 1, total: 1 } },
  };

  const ouvrirLaBibliotheque = async (page: Page) => {
    await serveur(page, { reponses });
    await page.goto("/projets");
    await page.getByRole("button", { name: "Créer un projet" }).click();
    await page.getByRole("button", { name: /Choisir une icône du projet/ }).click();
  };

  test("EX-PRJ-04 — la fenêtre de création porte le champ, dans l'état « Aucune icône »", async ({
    page,
  }) => {
    await serveur(page, { reponses });
    await page.goto("/projets");
    await page.getByRole("button", { name: "Créer un projet" }).click();

    await expect(page.getByText("Icône du projet", { exact: true })).toBeVisible();
    // L'état nommé par le brief, distinct de « Aucune icône trouvée ».
    await expect(page.getByText("Aucune icône", { exact: true })).toBeVisible();
  });

  test("EX-PRJ-04 — les onze catégories du cadrage sont proposées, plus « Toutes »", async ({
    page,
  }) => {
    await ouvrirLaBibliotheque(page);

    const categories = page.getByRole("group", { name: "Catégories d'icônes" });
    // Onze familles + « Toutes » : le compte est celui du cadrage, pas un
    // « au moins onze » qui passerait avec n'importe quel sur-ensemble.
    await expect(categories.getByRole("button")).toHaveCount(12);
    for (const nom of [
      "Gestion",
      "Numérique",
      "Finances",
      "RH",
      "Territoire",
      "Social",
      "Culture & Éducation",
      "Sécurité",
      "Environnement",
      "Juridique",
      "Symboles",
    ]) {
      await expect(categories.getByRole("button", { name: nom, exact: true })).toBeVisible();
    }
  });

  test("EX-PRJ-04 — la recherche filtre la bibliothèque, accents compris", async ({ page }) => {
    await ouvrirLaBibliotheque(page);

    const grille = page.getByRole("group", { name: "Bibliothèque d'icônes" });
    await expect(grille.getByRole("button")).toHaveCount(50);

    // Sans accent : « energie » doit trouver « Énergie ». Une recherche qui
    // exige l'accent ne sert qu'à qui sait déjà ce qu'il cherche.
    await page.getByLabel("Rechercher une icône…").fill("energie");
    await expect(grille.getByRole("button", { name: "Énergie", exact: true })).toBeVisible();
    await expect(grille.getByRole("button")).toHaveCount(1);
  });

  test("EX-PRJ-04 — recherche et catégorie se CUMULENT, elles ne se remplacent pas", async ({
    page,
  }) => {
    await ouvrirLaBibliotheque(page);
    const grille = page.getByRole("group", { name: "Bibliothèque d'icônes" });

    await page
      .getByRole("group", { name: "Catégories d'icônes" })
      .getByRole("button", { name: "Environnement", exact: true })
      .click();
    await expect(grille.getByRole("button")).toHaveCount(5);

    // « Territoire » existe dans la catégorie Territoire, PAS dans
    // Environnement : si la recherche remplaçait la catégorie au lieu de s'y
    // ajouter, on le verrait apparaître ici.
    await page.getByLabel("Rechercher une icône…").fill("Territoire");
    await expect(page.getByText("Aucune icône trouvée")).toBeVisible();
    await expect(grille).toHaveCount(0);
  });

  test("EX-PRJ-04 — choisir une icône la nomme ; la rappuyer la retire", async ({ page }) => {
    await ouvrirLaBibliotheque(page);
    const grille = page.getByRole("group", { name: "Bibliothèque d'icônes" });
    const eau = grille.getByRole("button", { name: "Eau", exact: true });

    await eau.click();
    await expect(eau).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByText("Eau", { exact: true })).toBeVisible();

    // `aria-pressed` promet une bascule : sans le relâchement, une icône posée
    // par erreur ne s'enlèverait plus.
    await eau.click();
    await expect(eau).toHaveAttribute("aria-pressed", "false");
    await expect(page.getByText("Aucune icône", { exact: true })).toBeVisible();
  });

  test("EX-PRJ-04 — le CODE de la bibliothèque part au serveur, pas un libellé", async ({
    page,
  }) => {
    let envoye: Record<string, unknown> | null = null;
    await serveur(page, { reponses });
    await page.route(
      (url) => url.pathname === "/api/projets",
      (route) => {
        if (route.request().method() !== "POST") return route.fallback();
        envoye = route.request().postDataJSON() as Record<string, unknown>;
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ id: PROJET.id }),
        });
      },
    );
    await page.goto("/projets");
    await page.getByRole("button", { name: "Créer un projet" }).click();
    await page.getByRole("button", { name: /Choisir une icône du projet/ }).click();
    await page
      .getByRole("group", { name: "Bibliothèque d'icônes" })
      .getByRole("button", { name: "Déchets", exact: true })
      .click();

    await page.getByLabel(/^Nom/).fill("Collecte des biodéchets");
    await page.getByLabel(/^Date de début/).fill("2026-01-01");
    await page.getByLabel(/^Date de fin/).fill("2026-12-31");
    await page.getByRole("button", { name: "Créer le projet" }).click();

    // Le serveur refuse tout ce qui n'est pas un code du catalogue : envoyer
    // « Déchets » ferait un 400. C'est `p-recycle` qui doit partir.
    await expect.poll(() => envoye).not.toBeNull();
    expect(envoye!["icone"]).toBe("p-recycle");
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

/**
 * `EX-PRJ-13` — « Consulter l'historique des instantanés d'avancement ».
 *
 * L'exigence porte deux verbes ; seul « capturer » était servi. `fiche()` ne
 * rendait que `dernierInstantane` — UN point —, et la tendance des rapports
 * moyenne `progression` par date sur un LOT de projets en jetant les tâches et
 * les heures. Le projet écrivait un historique que personne ne pouvait relire.
 */
test.describe("EX-PRJ-13 — consulter l'historique des instantanés", () => {
  const reponses = {
    "/feuille-de-route": { corps: ROUTE },
    "/instantanes": { corps: INSTANTANES },
    [`/api/projets/${PROJET.id}`]: { corps: PROJET },
  };
  const session = SESSION_RAPPORTS;

  test("EX-PRJ-13 — les trois colonnes que la tendance JETTE sont là, et l'ordre est le plus récent d'abord", async ({
    page,
  }) => {
    await serveur(page, { session, reponses });
    await page.goto(CHEMIN_PROJET);

    const liste = page.getByRole("region", { name: "Historique des instantanés" });
    await expect(liste).toBeVisible();

    /*
     * L'assertion porte sur LA LIGNE, jamais sur le panneau : « 61 % » figure
     * déjà ailleurs dans la fiche, et une assertion large passerait avec comme
     * sans le correctif. C'est le faux témoin le plus dangereux, parce qu'il a
     * l'air plus robuste.
     */
    const lignes = liste.locator(".snap-row");
    await expect(lignes).toHaveCount(3);

    const premiere = lignes.first();
    await expect(premiere).toContainText("11/08/2026");
    await expect(premiere).toContainText("61 %");
    // `tachesFinies` sur `tachesTotal` — ce que `tendance()` ne rend pas.
    await expect(premiere).toContainText("19 terminées sur 34");
    // `heuresConsommees` arrive en CHAÎNE décimale : « 744.00 », pas 744.
    await expect(premiere).toContainText("744");

    // L'ordre : le plus ancien ferme la marche.
    await expect(lignes.last()).toContainText("30/06/2026");
    await expect(lignes.last()).toContainText("22 %");
  });

  test("EX-PRJ-13 — l'état vide est nommé, et il dit sa sortie", async ({ page }) => {
    await serveur(page, { session, reponses: { ...reponses, "/instantanes": { corps: [] } } });
    await page.goto(CHEMIN_PROJET);

    await expect(page.getByText("Aucun instantané pour ce projet")).toBeVisible();
    // `RG-GEN-04` — l'état vide porte sa sortie, ici la commande d'en-tête.
    await expect(page.getByText(/Capturer un instantané.*sans attendre/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Capturer un instantané" })).toBeVisible();
  });

  /*
   * Le raccord entre les deux verbes de l'exigence : capturer, puis VOIR la
   * ligne. C'est le contrôle qui manque partout ailleurs dans ce dépôt — celui
   * qui prend la sortie de l'écriture et la retrouve dans la lecture.
   */
  test("EX-PRJ-13 — la capture rafraîchit l'historique affiché juste dessous", async ({ page }) => {
    const NEUF = {
      id: "sn4",
      projectId: PROJET.id,
      date: "2026-08-31",
      progression: 66,
      tachesTotal: 35,
      tachesFinies: 23,
      heuresConsommees: "801.00",
    };
    let capture = false;
    await serveur(page, { session, reponses });
    await page.route(
      (url) => url.pathname.endsWith("/instantanes"),
      (route) => {
        const corps = capture ? [NEUF, ...INSTANTANES] : INSTANTANES;
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(corps),
        });
      },
    );
    await page.route(
      (url) => url.pathname.endsWith("/instantane"),
      (route) => {
        if (route.request().method() !== "POST") return route.fallback();
        capture = true;
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(NEUF),
        });
      },
    );
    await page.goto(CHEMIN_PROJET);

    const liste = page.getByRole("region", { name: "Historique des instantanés" });
    await expect(liste.locator(".snap-row")).toHaveCount(3);

    await page.getByRole("button", { name: "Capturer un instantané" }).click();

    await expect(liste.locator(".snap-row")).toHaveCount(4);
    await expect(liste.locator(".snap-row").first()).toContainText("23 terminées sur 35");
  });

  test("EX-PRJ-13, RG-GEN-06 — sans reports:read, l'historique n'est pas proposé", async ({
    page,
  }) => {
    await serveur(page, { session: SESSION_LECTURE, reponses });
    await page.goto(CHEMIN_PROJET);

    // La page a rendu — c'est la SECTION qui manque, pas la fiche.
    await expect(page.getByRole("heading", { name: PROJET.nom, level: 1 })).toBeVisible();
    await expect(page.getByRole("region", { name: "Historique des instantanés" })).toHaveCount(0);
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
    /*
     * DEUX jalons sur trois portent des tâches, plus deux indicateurs : quatre
     * repères « Calculé ». Le troisième — « Reste à planifier » — n'a aucune
     * tâche : depuis `RG-JAL-06`, son statut se marque à la main et son repère
     * dit « Marqué ». Afficher « Calculé » là enverrait chercher un
     * avancement qui n'existe pas.
     */
    await expect(page.getByText("Calculé", { exact: true })).toHaveCount(4);
    await expect(page.getByText("Marqué", { exact: true })).toHaveCount(1);
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

/**
 * `EX-JAL-07` — les épopées, et `EX-JAL-01` — modifier un jalon.
 *
 * **Ce que ces contrôles réparent.** L'épopée existait en base, au catalogue de
 * permissions, dans quatre modèles de rôles et dans le formulaire de création
 * d'une tâche — et n'avait aucun service, aucune route, aucun écran. Le jalon,
 * lui, se créait et se supprimait mais ne se corrigeait pas : décaler une
 * échéance imposait de supprimer le jalon, donc de détacher ses tâches
 * (`RG-JAL-05`), puis de les rattacher une à une.
 */
test.describe("Vue 13 — épopées et modification d'un jalon", () => {
  const reponses = {
    "/feuille-de-route": { corps: ROUTE },
    [`/api/projets/${PROJET.id}/epopees`]: { corps: EPOPEES },
    [`/api/projets/${PROJET.id}`]: { corps: PROJET },
  };

  test("EX-JAL-07 — le panneau liste les épopées avec LEUR décompte de tâches", async ({
    page,
  }) => {
    await serveur(page, { reponses });
    await page.goto(`${CHEMIN_PROJET}/jalons`);

    const panneau = page.locator(".orphan", { hasText: "Épopées" });
    await expect(panneau.getByText("Socle technique", { exact: true })).toBeVisible();
    await expect(panneau.getByText("Reprise de données", { exact: true })).toBeVisible();
    // Deux valeurs différentes : un décompte qui rendrait celui du projet
    // afficherait le même nombre sur les deux lignes.
    await expect(panneau.getByText("2 tâches", { exact: true })).toBeVisible();
    await expect(panneau.getByText("aucune tâche", { exact: true })).toBeVisible();
  });

  test("EX-JAL-07 — créer une épopée envoie son nom au serveur", async ({ page }) => {
    await serveur(page, { reponses });
    await page.goto(`${CHEMIN_PROJET}/jalons`);

    await page.getByRole("button", { name: "+ Nouvelle épopée" }).click();
    await page.getByLabel("Nom", { exact: false }).last().fill("Accessibilité");

    const envoi = page.waitForRequest(
      (r) => r.method() === "POST" && r.url().includes("/epopees"),
    );
    await page.getByRole("button", { name: "Enregistrer" }).click();
    const requete = await envoi;
    expect(requete.postDataJSON()).toMatchObject({ nom: "Accessibilité" });
  });

  test("RG-GEN-07 — modifier une épopée transmet LA VERSION LUE", async ({ page }) => {
    /*
     * La version voyage depuis la lecture jusqu'à l'écriture, sans quoi la
     * concurrence n'est pas détectée mais écrasée. Le jeu d'essai donne
     * volontairement `3` à la seconde épopée : un client qui enverrait `1` en
     * dur passerait sur la première et échouerait ici.
     */
    await serveur(page, { reponses });
    await page.goto(`${CHEMIN_PROJET}/jalons`);

    await page.getByRole("button", { name: "Modifier l'épopée Reprise de données" }).click();
    const envoi = page.waitForRequest(
      (r) => r.method() === "PATCH" && r.url().includes("/epopees/e2"),
    );
    await page.getByRole("button", { name: "Enregistrer" }).click();
    expect((await envoi).postDataJSON()).toMatchObject({ version: 3 });
  });

  test("EX-JAL-07 — la suppression DIT combien de tâches elle détache", async ({ page }) => {
    await serveur(page, {
      reponses: { ...reponses, "/api/projets/epopees/e1": { corps: { tachesDetachees: 2 } } },
    });
    await page.goto(`${CHEMIN_PROJET}/jalons`);

    await page.getByRole("button", { name: "Supprimer l'épopée Socle technique" }).click();
    // La promesse est faite AVANT le clic sur le bouton rouge : c'est ce qui
    // lève l'inquiétude, pas ce qui la constate après coup.
    await expect(
      page.getByText("Les 2 tâches rattachées seront détachées, pas supprimées."),
    ).toBeVisible();

    await page.getByRole("button", { name: "Supprimer l'épopée", exact: true }).click();
    await expect(page.getByText("Épopée supprimée, 2 tâches détachées.")).toBeVisible();
  });

  test("RG-GEN-06 — sans les permissions, aucune commande d'épopée", async ({ page }) => {
    await serveur(page, { session: SESSION_LECTURE, reponses });
    await page.goto(`${CHEMIN_PROJET}/jalons`);

    // Le panneau reste : la lecture est permise. Ce sont les gestes qui
    // disparaissent — la courtoisie, le contrôle étant au serveur.
    await expect(page.getByText("Socle technique", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "+ Nouvelle épopée" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Modifier l'épopée/ })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Supprimer l'épopée/ })).toHaveCount(0);
  });

  test("EX-JAL-01 — modifier un jalon part de SES valeurs et transmet sa version", async ({
    page,
  }) => {
    await serveur(page, { reponses });
    await page.goto(`${CHEMIN_PROJET}/jalons`);

    await page.getByRole("button", { name: "Modifier le jalon Recette fonctionnelle" }).click();
    // Le formulaire est amorcé sur le jalon, pas vide : une fenêtre de
    // modification qui s'ouvre vierge efface ce qu'on venait corriger.
    await expect(page.getByLabel("Nom", { exact: false }).last()).toHaveValue(
      "Recette fonctionnelle",
    );

    const envoi = page.waitForRequest(
      (r) => r.method() === "PATCH" && r.url().includes("/jalons/j2"),
    );
    await page.getByRole("button", { name: "Enregistrer" }).click();
    expect((await envoi).postDataJSON()).toMatchObject({
      nom: "Recette fonctionnelle",
      version: 1,
    });
  });
});

/**
 * `EX-JAL-02`, `RG-JAL-06` — marquer un jalon SANS TÂCHE comme atteint.
 *
 * L'arbitrage du 2026-08-31 : `EX-JAL-02` et `RG-JAL-01` se contredisaient, le
 * produit avait tranché pour le calcul, et le geste n'existait nulle part. Un
 * jalon sans tâche est le cas que le calcul ne sait pas trancher — il restait
 * « en attente » pour toujours, échéance tenue comprise.
 */
test.describe("Vue 13 — un jalon sans tâche se marque à la main", () => {
  const reponses = {
    "/feuille-de-route": { corps: ROUTE },
    [`/api/projets/${PROJET.id}/epopees`]: { corps: EPOPEES },
    [`/api/projets/${PROJET.id}`]: { corps: PROJET },
  };

  /** « Reste à planifier » est le jalon du jeu d'essai qui n'a aucune tâche. */
  const ligneVide = (page: Page) => page.locator(".tli", { hasText: "Reste à planifier" });
  const lignePleine = (page: Page) => page.locator(".tli", { hasText: "Recette fonctionnelle" });

  test("EX-JAL-02 — la commande n'est proposée QUE sur un jalon sans tâche", async ({ page }) => {
    /*
     * Sur un jalon qui porte des tâches, le serveur refuse : proposer un geste
     * voué au refus est exactement ce que `RG-GEN-06` interdit. La commande
     * absente est aussi la manière la plus courte d'expliquer la règle.
     */
    await serveur(page, { reponses });
    await page.goto(`${CHEMIN_PROJET}/jalons`);

    await expect(ligneVide(page).getByRole("button", { name: "Marquer atteint" })).toBeVisible();
    await expect(
      lignePleine(page).getByRole("button", { name: "Marquer atteint" }),
    ).toHaveCount(0);
  });

  test("EX-JAL-02, RG-GEN-07 — marquer part avec la version LUE du jalon", async ({ page }) => {
    await serveur(page, { reponses });
    const envoi = page.waitForRequest(
      (r) => r.method() === "POST" && r.url().includes("/jalons/j3/marquer"),
    );
    await page.goto(`${CHEMIN_PROJET}/jalons`);

    await ligneVide(page).getByRole("button", { name: "Marquer atteint" }).click();
    expect((await envoi).postDataJSON()).toEqual({ atteint: true, version: 1 });
  });

  test("RG-JAL-06 — le repère « calculé » DIT que le statut est marqué, pas calculé", async ({
    page,
  }) => {
    /*
     * Le même repère dans les deux cas ferait chercher un avancement qui
     * n'existe pas. C'est le genre d'explication qui, fausse, coûte plus cher
     * que son absence.
     */
    await serveur(page, { reponses });
    await page.goto(`${CHEMIN_PROJET}/jalons`);

    // Le repère porte « Marqué », pas « Calculé » — et son explication le dit.
    const repere = ligneVide(page).locator(".calc-tag");
    await expect(repere).toHaveText("Marqué");
    await expect(repere).toHaveAttribute(
      "aria-description",
      /il n'y a rien à calculer, son statut se marque à la main/,
    );

    // Sur un jalon qui porte des tâches, le repère dit l'inverse.
    await expect(lignePleine(page).locator(".calc-tag")).toHaveText("Calculé");
  });

  test("RG-GEN-06 — sans milestones:update, aucune marque n'est proposée", async ({ page }) => {
    await serveur(page, { session: SESSION_LECTURE, reponses });
    await page.goto(`${CHEMIN_PROJET}/jalons`);

    await expect(page.getByText("Reste à planifier")).toBeVisible();
    await expect(page.getByRole("button", { name: "Marquer atteint" })).toHaveCount(0);
  });
});
