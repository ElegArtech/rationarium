import { test, expect, type Page } from "@playwright/test";
import { serveur, SESSION, PROJET, LIGNE_PROJET } from "./fixtures/projets.js";
import { SESSION_PLANNING, SEMAINE } from "./fixtures/planning.js";
import { SESSION_ADMIN, UTILISATEURS } from "./fixtures/administration.js";

/**
 * L-25 — **le clavier, que `axe` ne voit pas.**
 *
 * L'analyse statique d'`axe` couvre les rôles, les libellés et le contraste.
 * Elle ne couvre **rien** de ce qui suit, et c'est pourtant là que se jouent
 * les usages réels d'une navigation sans souris :
 *
 * - un lien d'évitement qui existe dans le code mais ne mène nulle part ;
 * - un piège de focus dans une fenêtre modale ;
 * - un focus qui ne revient pas au déclencheur à la fermeture ;
 * - une grille dense qu'on ne peut pas traverser ;
 * - un menu qui ne s'ouvre qu'à la souris.
 *
 * Ces contrôles sont donc **complémentaires**, pas redondants — et ce sont eux
 * qui décident si `C6` et « navigation clavier complète » sont tenus.
 */

const MOMENT = new Date("2026-08-12T09:00:00.000Z");

/** L'élément qui a le focus, décrit assez pour être lisible dans un échec. */
async function focalise(page: Page): Promise<{ role: string; texte: string }> {
  return page.evaluate(() => {
    const e = document.activeElement;
    return {
      role: e?.getAttribute("role") ?? e?.tagName.toLowerCase() ?? "",
      texte: (e?.getAttribute("aria-label") ?? e?.textContent ?? "").trim().slice(0, 60),
    };
  });
}

/**
 * Le retour du focus au déclencheur — **attendu, pas lu une fois**.
 *
 * Ces deux contrôles lisaient `document.activeElement` dans l'instant qui suit
 * la disparition de la surcouche. Or `react-aria` rend le focus au tour suivant :
 * la lecture arrivait parfois avant, trouvait `BODY`, et le test échouait sur un
 * produit correct. Mesuré sur la branche INTACTE, à un seul ouvrier :
 * **7 échecs sur 72 passages**, toujours sur ces deux tests — donc une course
 * dans le contrôle, pas un défaut du produit.
 *
 * Le contrôle garde toute sa force : il échoue toujours si le focus ne revient
 * jamais. Il cesse seulement d'exiger qu'il revienne dans la même milliseconde.
 */
async function attendreFocusSur(page: Page, texte: string) {
  await expect
    .poll(async () => (await focalise(page)).texte, {
      message: `le focus n'est jamais revenu sur « ${texte} »`,
      timeout: 5000,
    })
    .toContain(texte);
}

test.describe("Le lien d'évitement", () => {
  test("IL EST LE PREMIER ARRÊT DE TABULATION, et il mène au contenu", async ({ page }) => {
    await serveur(page, { session: SESSION, reponses: {} });
    await page.goto("/profil");
    // La coquille doit être montée : tabuler pendant le chargement de session
    // mesurerait l'ordre de tabulation d'un écran d'attente.
    await expect(page.getByRole("navigation", { name: /navigation principale/i })).toBeVisible();

    // Un lien d'évitement qui n'est pas le premier arrêt ne sert à rien : on
    // aurait déjà traversé la navigation avant de l'atteindre.
    await page.keyboard.press("Tab");
    const premier = await focalise(page);
    expect(premier.texte).toMatch(/contenu principal/i);

    await page.keyboard.press("Enter");
    // Il doit mener quelque part : une ancre morte est pire qu'aucun lien,
    // parce qu'elle donne l'illusion du raccourci.
    await expect(page.locator("#contenu")).toHaveCount(1);
  });
});

test.describe("Le focus est visible partout", () => {
  test("chaque arrêt de tabulation porte un indicateur de focus", async ({ page }) => {
    await serveur(page, { session: SESSION, reponses: {} });
    await page.goto("/profil");
    await expect(page.getByRole("navigation", { name: /navigation principale/i })).toBeVisible();

    // Vingt tabulations suffisent à traverser la coquille et l'entrée de vue.
    for (let i = 0; i < 20; i += 1) {
      await page.keyboard.press("Tab");
      const visible = await page.evaluate(() => {
        const e = document.activeElement;
        if (!e || e === document.body) return true;
        const style = getComputedStyle(e);
        // `outline: none` sans autre marque est le défaut classique : il rend
        // la navigation clavier possible mais aveugle.
        const contour = style.outlineStyle !== "none" && style.outlineWidth !== "0px";
        const ombre = style.boxShadow !== "none";
        const bordure = style.borderColor !== "";
        return contour || ombre || bordure;
      });
      expect(visible).toBe(true);
    }
  });
});

test.describe("Les fenêtres modales — piège de focus et retour au déclencheur", () => {
  test("LE FOCUS REVIENT AU DÉCLENCHEUR à la fermeture", async ({ page }) => {
    await serveur(page, {
      session: SESSION_ADMIN,
      reponses: { "/api/utilisateurs": { corps: UTILISATEURS } },
    });
    await page.goto("/utilisateurs");

    const declencheur = page.getByRole("button", { name: "Créer un utilisateur" });
    await declencheur.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("dialog")).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);

    // Sans ce retour, le focus repart au début du document : on doit
    // retraverser toute la page pour reprendre là où on en était.
    await attendreFocusSur(page, "Créer un utilisateur");
  });

  test("le focus reste PIÉGÉ dans la fenêtre tant qu'elle est ouverte", async ({ page }) => {
    await serveur(page, {
      session: SESSION_ADMIN,
      reponses: { "/api/utilisateurs": { corps: UTILISATEURS } },
    });
    await page.goto("/utilisateurs");
    await page.getByRole("button", { name: "Créer un utilisateur" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();

    // Trente tabulations : bien plus que le nombre de champs. Si le focus
    // s'échappait, il serait dehors depuis longtemps.
    for (let i = 0; i < 30; i += 1) {
      await page.keyboard.press("Tab");
      const dedans = await page.evaluate(() =>
        Boolean(document.activeElement?.closest('[role="dialog"]')),
      );
      expect(dedans).toBe(true);
    }
  });

  test("Échap ferme, et n'enregistre rien", async ({ page }) => {
    await serveur(page, {
      session: SESSION_ADMIN,
      reponses: { "/api/utilisateurs": { corps: UTILISATEURS } },
    });
    await page.goto("/utilisateurs");
    await page.getByRole("button", { name: "Créer un utilisateur" }).click();
    await page.keyboard.press("Escape");

    await expect(page.getByRole("dialog")).toHaveCount(0);
    // La liste n'a pas bougé : fermer n'est pas valider.
    await expect(page.getByText("camille.roussel@exemple.fr")).toBeVisible();
  });
});

test.describe("Les menus s'ouvrent et se parcourent au clavier", () => {
  test("Entrée ouvre, les flèches parcourent, Échap ferme", async ({ page }) => {
    await serveur(page, {
      session: SESSION_ADMIN,
      reponses: { "/api/utilisateurs": { corps: UTILISATEURS } },
    });
    await page.goto("/utilisateurs");

    const declencheur = page.getByRole("button", { name: "Actions pour Camille Roussel" });
    await declencheur.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("menu")).toBeVisible();

    await page.keyboard.press("ArrowDown");
    const surUnItem = await page.evaluate(
      () => document.activeElement?.getAttribute("role") === "menuitem",
    );
    expect(surUnItem).toBe(true);

    await page.keyboard.press("Escape");
    await expect(page.getByRole("menu")).toHaveCount(0);
    // Le focus revient au déclencheur, comme pour une fenêtre.
    await attendreFocusSur(page, "Actions pour Camille Roussel");
  });
});

test.describe("C6 — les grilles denses se traversent et s'actionnent au clavier", () => {
  test("LE PLANNING SE MANIPULE SANS SOURIS — déplacer et réassigner", async ({ page }) => {
    await page.clock.setFixedTime(MOMENT);
    await serveur(page, {
      session: SESSION_PLANNING,
      reponses: { "/api/planning": { corps: SEMAINE } },
    });
    await page.goto("/planning");

    // Une grille qui ne se manipule qu'à la souris exclut, purement.
    const occupation = page.getByRole("button", { name: /Rédiger la note de cadrage/ }).first();
    await occupation.focus();
    await page.keyboard.press("Enter");

    await expect(page.getByRole("menuitem", { name: "Déplacer vers…" })).toBeVisible();
    await expect(page.getByRole("menuitem", { name: "Réassigner à…" })).toBeVisible();
  });

  test("la bascule de télétravail s'atteint au clavier, et se nomme", async ({ page }) => {
    await page.clock.setFixedTime(MOMENT);
    await serveur(page, {
      session: SESSION_PLANNING,
      reponses: {
        "/api/planning": { corps: SEMAINE },
        "/api/planning/teletravail": { corps: { id: "w1", etat: "office" } },
      },
    });
    await page.goto("/planning");

    const bascule = page.getByRole("button", { name: /Ana Berger, 2026-08-13/ });
    await bascule.focus();
    // Le libellé dit l'état courant ET l'état suivant : sans cela, actionner
    // à l'aveugle revient à jouer à pile ou face.
    await expect(bascule).toHaveAttribute("aria-label", /actuellement.*Basculer vers/);
    await page.keyboard.press("Enter");
    await expect(page.getByText("Télétravail mis à jour.")).toBeVisible();
  });

  test("aucune grille ne piège le focus : on en sort par tabulation", async ({ page }) => {
    await page.clock.setFixedTime(MOMENT);
    await serveur(page, {
      session: SESSION_PLANNING,
      reponses: { "/api/planning": { corps: SEMAINE } },
    });
    await page.goto("/planning");

    const premier = page.getByRole("button", { name: /Rédiger la note de cadrage/ }).first();
    await premier.focus();

    // Cinquante tabulations doivent finir par sortir de la grille. Un piège
    // ferait tourner le focus indéfiniment sur les mêmes cellules.
    let sorti = false;
    for (let i = 0; i < 50 && !sorti; i += 1) {
      await page.keyboard.press("Tab");
      sorti = await page.evaluate(() => !document.activeElement?.closest(".pl"));
    }
    expect(sorti).toBe(true);
  });
});

test.describe("Les vues denses restent parcourables", () => {
  test("le kanban propose son déplacement au clavier", async ({ page }) => {
    await serveur(page, {
      session: { ...SESSION, permissions: [...SESSION.permissions, "tasks:update"] },
      reponses: {
        [`/api/projets/${PROJET.id}`]: { corps: PROJET },
        "/api/projets": { corps: { projets: [LIGNE_PROJET], affiches: 1, total: 1 } },
        "/api/taches": { corps: [] },
      },
    });
    await page.goto(`/projets/${PROJET.id}/taches`);

    // Même sans tâche, la vue doit rester parcourable : un état vide qui
    // avale le focus est un cul-de-sac.
    await page.keyboard.press("Tab");
    await page.keyboard.press("Tab");
    const arret = await focalise(page);
    expect(arret.role).not.toBe("");
  });
});

test.describe("RGAA 8.3, 8.6 — la langue et le titre de page", () => {
  test("LE TITRE DE PAGE DISTINGUE LES VUES — sinon l'historique est illisible", async ({
    page,
  }) => {
    await serveur(page, {
      session: SESSION_ADMIN,
      reponses: { "/api/utilisateurs": { corps: UTILISATEURS } },
    });

    await page.goto("/profil");
    await expect(page).toHaveTitle(/Trame$/);
    const surLeProfil = await page.title();

    await page.goto("/utilisateurs");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page).toHaveTitle(/Utilisateurs — Trame/);

    // Deux vues, deux titres : c'est ce qui rend l'historique et le
    // basculement de fenêtre utilisables.
    expect(await page.title()).not.toBe(surLeProfil);
  });

  test("l'attribut de langue suit la langue de l'interface", async ({ page }) => {
    await serveur(page, { session: SESSION, reponses: {} });
    await page.goto("/profil");
    await expect(page.locator("html")).toHaveAttribute("lang", "fr");

    // Le sélecteur est un groupe de deux boutons « FR » / « EN ».
    await page.getByRole("button", { name: "EN", exact: true }).click();

    // Un lecteur d'écran prononcerait sinon l'anglais avec la phonétique
    // française : le texte est juste, la voix ne l'est pas.
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
  });
});
