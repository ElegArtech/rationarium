import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { serveur, SESSION, PROJET } from "./fixtures/projets.js";
import { SESSION_PLANNING, SEMAINE, GRILLE_ACTIVITE, ELIGIBILITE } from "./fixtures/planning.js";
import { LISTE } from "./fixtures/taches.js";
import {
  SESSION_RAPPORTS,
  PROJET_GANTT,
  ROUTE_GANTT,
  TACHES_GANTT,
  FICHE_T2,
} from "./fixtures/rapports.js";

/**
 * Le vocabulaire de style des MENUS — le seul contrôle qui les regarde.
 *
 * **Pourquoi ce fichier existe.** Quatre menus de l'application ont vécu
 * plusieurs lots sans une seule règle de style : celui d'une occupation du
 * planning, celui d'une colonne de kanban, celui d'une barre de Gantt et le
 * filtre de services. Leurs `MenuItem` ne portaient aucune classe, donc
 * `react-aria-components` posait la sienne — `react-aria-MenuItem`, que rien ne
 * définit ici. Résultat à l'écran : une boîte blanche, du texte à 15 px collé à
 * la bordure, aucun survol, aucun curseur. Deux d'entre eux n'avaient même pas
 * la boîte, leur `Menu` étant dépourvu de `.pop`.
 *
 * **Et aucune boucle ne pouvait le voir.** `pnpm conformite` relève la page AU
 * REPOS : elle n'ouvre pas un menu, donc elle ne mesure jamais son contenu.
 * `axe` ne voit rien de ce qui demande d'agir — c'est déjà consigné. Le typage
 * et la construction passent : une classe absente n'est pas une erreur. C'est la
 * quatrième fois dans ce dépôt qu'un défaut d'apparence échappe à tout contrôle
 * faute d'un contrôle qui le regarde.
 *
 * **Ce qu'il vérifie**, sur les vues qui portent des menus : tout déclencheur
 * `aria-haspopup="menu"` s'ouvre, sa boîte porte `.pop`, et CHACUN de ses items
 * porte `.pop-action`. Le contrôle affirme d'abord qu'il a quelque chose à
 * mesurer : un menu qui ne s'ouvre pas, ou une vue sans déclencheur, échoue —
 * il ne réussit pas en silence.
 */

const MOMENT = new Date("2026-08-12T09:00:00.000Z");

/** Le menu de déplacement d'une carte de kanban demande `tasks:update`. */
const SESSION_TACHES = {
  ...SESSION,
  permissions: [...SESSION.permissions, "tasks:create", "tasks:update"],
};

/** Les classes que `react-aria` pose quand le portage a oublié les siennes. */
const CLASSES_PAR_DEFAUT = /(^|\s)react-aria-(MenuItem|Menu)(\s|$)/;

/**
 * Ouvre chaque sorte de déclencheur de la page et juge le menu obtenu.
 *
 * `react-aria` porte `aria-haspopup="true"` sur le déclencheur d'un menu et
 * `aria-haspopup="menu"` sur l'item qui ouvre un SOUS-menu. Tous les
 * déclencheurs n'ouvrent pas un menu pour autant — celui des notifications
 * ouvre un panneau de liens : ceux-là sont écartés, pas jugés.
 *
 * Une même sorte n'est ouverte que deux fois : la grille du planning porte 57
 * occupations qui rendent toutes le même menu, et les rouvrir 57 fois mesurerait
 * la patience plutôt que le style.
 */
async function ouvrirEtVerifier(page: Page, vue: string) {
  const declencheurs = page.locator('[aria-haspopup="true"]');
  const total = await declencheurs.count();

  // Un contrôle qui n'a rien à mesurer doit ÉCHOUER, jamais réussir en silence.
  expect(total, `${vue} — aucun déclencheur : la vue a-t-elle rendu ?`).toBeGreaterThan(0);

  const vues = new Map<string, number>();
  let menusVus = 0;
  let itemsVus = 0;

  for (let i = 0; i < total; i += 1) {
    const d = declencheurs.nth(i);
    if (!(await d.isVisible())) continue;

    const sorte = (await d.getAttribute("class")) ?? `#${i}`;
    if ((vues.get(sorte) ?? 0) >= 2) continue;
    vues.set(sorte, (vues.get(sorte) ?? 0) + 1);

    await d.click();
    await page.waitForTimeout(150);

    // Un panneau de liens n'est pas un menu : on ne le juge pas ici.
    if ((await page.locator('[role="menu"]').count()) === 0) {
      await page.keyboard.press("Escape");
      continue;
    }

    const menu = page.locator('[role="menu"]').last();

    /*
     * La boîte : le vocabulaire de la maquette pour un panneau flottant.
     *
     * `.pop` se porte indifféremment sur le `Menu` — ce que font les vues 07, 12
     * et 15 — ou sur le `Popover` qui l'enveloppe — ce que fait la coquille pour
     * son menu utilisateur. Les deux rendent la même boîte ; le contrôle juge
     * donc l'élément OU son ascendant, sans imposer un des deux styles d'écriture.
     */
    const boite = await menu.evaluate((el) => !!el.closest(".pop"));
    expect(
      boite,
      `${vue} — ni le menu « ${sorte} » ni son enveloppe ne portent \`.pop\``,
    ).toBe(true);

    // Les rangées : `.pop-action`, jamais la classe par défaut de react-aria.
    const items = menu.locator(
      '[role="menuitem"], [role="menuitemcheckbox"], [role="menuitemradio"]',
    );
    const n = await items.count();
    expect(n, `${vue} — le menu « ${sorte} » est vide`).toBeGreaterThan(0);

    for (let j = 0; j < n; j += 1) {
      const classe = (await items.nth(j).getAttribute("class")) ?? "";
      const intitule = (await items.nth(j).textContent())?.trim() ?? "";
      expect(
        classe,
        `${vue} — « ${intitule} » porte la classe par défaut de react-aria`,
      ).not.toMatch(CLASSES_PAR_DEFAUT);
      expect(
        classe,
        `${vue} — « ${intitule} » n'a pas \`.pop-action\``,
      ).toMatch(/(^|\s)pop-action(\s|$)/);
      itemsVus += 1;
    }

    menusVus += 1;
    await page.keyboard.press("Escape");
    await page.waitForTimeout(100);
  }

  expect(menusVus, `${vue} — aucun menu ouvert : le contrôle n'a rien mesuré`).toBeGreaterThan(0);
  expect(itemsVus, `${vue} — aucun item de menu mesuré`).toBeGreaterThan(0);
}

test.describe("Les menus portent le vocabulaire de la maquette", () => {
  test("vue 07 — planning : occupation, filtre de services, menu « Créer »", async ({ page }) => {
    await page.clock.setFixedTime(MOMENT);
    await serveur(page, {
      session: SESSION_PLANNING,
      reponses: {
        "/api/planning": { corps: SEMAINE },
        "/api/planning/activite": { corps: GRILLE_ACTIVITE },
        "/api/activite/eligibilite": { corps: ELIGIBILITE },
      },
    });
    await page.goto("/planning");
    await expect(page.locator(".occ").first()).toBeVisible();
    await ouvrirEtVerifier(page, "vue 07");
  });

  /*
   * Le sous-menu se vérifie à part : il n'existe qu'une fois son parent ouvert,
   * donc la boucle générique ci-dessus ne l'atteint pas. C'est aussi le seul
   * endroit où une DATE s'affichait en ISO brut — `RG-GEN-09` veut le formatage
   * global, pas la valeur de transport.
   */
  test("vue 07 — le sous-menu « Déplacer vers… » est stylé et ses dates formatées", async ({
    page,
  }) => {
    await page.clock.setFixedTime(MOMENT);
    await serveur(page, {
      session: SESSION_PLANNING,
      reponses: { "/api/planning": { corps: SEMAINE } },
    });
    await page.goto("/planning");
    await page.locator(".occ").first().click();

    const parent = page.getByRole("menuitem", { name: "Déplacer vers…" });
    await expect(parent).toBeVisible();
    await expect(parent).toHaveClass(/pop-action/);
    await parent.hover();

    const sous = page.locator('[role="menu"]').last();
    await expect(sous).toHaveClass(/(^|\s)pop(\s|$)/);

    const items = sous.locator('[role="menuitem"]');
    const n = await items.count();
    expect(n, "aucun jour proposé au déplacement").toBeGreaterThan(0);

    for (let j = 0; j < n; j += 1) {
      const txt = (await items.nth(j).textContent())?.trim() ?? "";
      await expect(items.nth(j)).toHaveClass(/pop-action/);
      // Ni « 2026-08-18 », ni rien qui ressemble à une valeur de transport.
      expect(txt, "une date ISO est montrée à l'utilisateur").not.toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  /*
   * La sortie de la semaine — « Une autre date… ».
   *
   * La liste des jours recopie la portée du glisser-déposer, et c'est voulu ;
   * mais aucune règle ne borne la date d'une tâche à la semaine affichée. Ce
   * contrôle vérifie que l'entrée existe, que la fenêtre s'ouvre avec la date
   * courante de la tâche, et que la requête de déplacement part avec la date
   * choisie — ici le 24 décembre, hors de toute colonne visible.
   */
  test("vue 07 — « Une autre date… » ouvre le choix libre et déplace hors semaine", async ({
    page,
  }) => {
    await page.clock.setFixedTime(MOMENT);
    await serveur(page, {
      session: SESSION_PLANNING,
      reponses: { "/api/planning": { corps: SEMAINE } },
    });

    // Ce que le serveur reçoit : c'est la preuve du déplacement.
    const envoye: unknown[] = [];
    await page.route(
      (u) => u.pathname === "/api/planning/taches/deplacer",
      async (route) => {
        envoye.push(route.request().postDataJSON());
        await route.fulfill({
          status: 200,
          json: { dateModifiee: true, assigneModifie: false },
        });
      },
    );

    await page.goto("/planning");
    const cible = page.locator(".occ:not(.is-flat)[aria-haspopup]").first();
    await expect(cible).toBeVisible();
    await cible.click();
    await page.getByRole("menuitem", { name: "Déplacer vers…" }).hover();

    const sortie = page.getByRole("menuitem", { name: "Une autre date…" });
    await expect(sortie).toBeVisible();
    // Détachée de la liste rapide par le séparateur de menu du socle.
    await expect(sortie).toHaveClass(/menu-sep/);
    await sortie.click();

    const fenetre = page.locator(".modal-dialogue");
    await expect(fenetre).toBeVisible();
    const champ = fenetre.locator('input[type="date"]');
    // Préremplie à la date actuelle de la tâche, pas vide.
    await expect(champ).not.toHaveValue("");
    await expect(fenetre.locator(".field-label")).toHaveText("Nouvelle date");

    await champ.fill("2026-12-24");
    await fenetre.getByRole("button", { name: "Déplacer", exact: true }).click();

    await expect(fenetre).toHaveCount(0);
    await expect
      .poll(() => envoye.length, { message: "aucune requête de déplacement" })
      .toBeGreaterThan(0);
    expect(envoye[0]).toMatchObject({ nouvelleDate: "2026-12-24" });
  });

  /*
   * `RG-GEN-04` — un sous-menu VIDE au lieu d'un état qui explique.
   *
   * `RG-PLN-03` autorise « au moins un jour ». Avec un seul jour affiché, il
   * n'existe aucune autre colonne où déposer la tâche, et « Déplacer vers… »
   * ouvrait une languette vide de 190 × 2 px — mesurée, pas supposée. La raison
   * se dit désormais sur un item désactivé, comme pour la date verrouillée.
   */
  test("vue 07 — un seul jour affiché : la raison se dit, aucun sous-menu vide", async ({
    page,
  }) => {
    await page.clock.setFixedTime(MOMENT);
    await serveur(page, {
      session: SESSION_PLANNING,
      reponses: {
        "/api/planning": { corps: SEMAINE },
        "/api/parametrage": { corps: { "planning.visibleDays": "1" } },
      },
    });
    await page.goto("/planning");
    await expect(page.locator(".occ").first()).toBeVisible();

    // Une seule colonne de jour : la condition du défaut est bien réunie.
    await expect(page.locator(".pl-dow")).toHaveCount(1);

    await page.locator(".occ").first().click();
    await expect(page.getByRole("menuitem", { name: /Déplacer vers/i })).toHaveCount(0);

    const raison = page.getByRole("menuitem", {
      name: "Déplacement impossible : aucun autre jour affiché",
    });
    await expect(raison).toBeVisible();
    await expect(raison).toHaveClass(/pop-action/);
    // Désactivée, donc jamais « proposée puis refusée » (`RG-GEN-06`).
    await expect(raison).toHaveAttribute("aria-disabled", "true");
  });

  /*
   * `RG-GEN-06` — les agents DÉJÀ assignés étaient proposés, puis refusés par le
   * serveur au titre de `RG-PLN-06`. « Recette croisée » est assignée à Ana ET à
   * Bruno : depuis la ligne d'Ana, Bruno ne doit plus être offert, Chloe si.
   */
  test("vue 07 — la réassignation n'offre pas un agent déjà assigné", async ({ page }) => {
    await page.clock.setFixedTime(MOMENT);
    await serveur(page, {
      session: SESSION_PLANNING,
      reponses: { "/api/planning": { corps: SEMAINE } },
    });
    await page.goto("/planning");

    await page.getByRole("button", { name: /Recette croisée/ }).first().click();
    await page.getByRole("menuitem", { name: "Réassigner à…" }).hover();

    const sous = page.locator('[role="menu"]').last();
    await expect(sous.getByRole("menuitem", { name: "Chloe Dupont" })).toBeVisible();
    await expect(sous.getByRole("menuitem", { name: "Bruno Costa" })).toHaveCount(0);

    // La liste longue défile : `.pop-list` est le primitif de la maquette.
    await expect(sous).toHaveClass(/pop-list/);
    const defile = await sous.evaluate((el) => {
      const cs = getComputedStyle(el);
      return { maxHeight: cs.maxHeight, overflowY: cs.overflowY };
    });
    expect(defile.maxHeight).not.toBe("none");
    expect(["auto", "scroll"]).toContain(defile.overflowY);
  });

  /*
   * `axe` sur un menu OUVERT, dans les deux thèmes.
   *
   * La suite d'accessibilité mesure les 35 vues au repos : aucun de ses 177
   * contrôles n'a jamais vu un menu déployé. Or c'est là que vivent les états
   * ajoutés au portage — le contraste d'un item désactivé, et depuis
   * `.pop-list` une région défilante, que `axe` refuse en « serious » quand
   * rien n'y est focalisable (`scrollable-region-focusable`).
   */
  for (const theme of ["clair", "sombre"] as const) {
    test(`vue 07 — axe ne trouve rien sur un menu ouvert, thème ${theme}`, async ({ page }) => {
      await page.clock.setFixedTime(MOMENT);
      await serveur(page, {
        session: SESSION_PLANNING,
        reponses: { "/api/planning": { corps: SEMAINE } },
      });
      await page.goto("/planning");
      if (theme === "sombre") {
        /*
         * La bascule doit AGIR, pas seulement s'appliquer : sans cette
         * vérification, une classe inopérante ferait mesurer deux fois le thème
         * clair et le contrôle passerait au vert en ne comparant rien.
         */
        const effet = await page.evaluate(() => {
          const lu = () => getComputedStyle(document.documentElement).getPropertyValue("--surface").trim();
          const clair = lu();
          document.documentElement.classList.add("dark");
          return { clair, sombre: lu() };
        });
        expect(effet.sombre, "la bascule de thème n'a aucun effet").not.toBe(effet.clair);
      }

      // Une tâche multi-assignée : elle porte AUSSI l'item désactivé.
      await page.getByRole("button", { name: /Recette croisée/ }).first().click();
      await expect(page.getByRole("menuitem", { name: /Réassigner à/i })).toBeVisible();
      await page.getByRole("menuitem", { name: /Réassigner à/i }).hover();
      await expect(page.locator('[role="menu"]')).toHaveCount(2);

      const resultat = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
        .analyze();
      const graves = resultat.violations.filter(
        (v) => v.impact === "critical" || v.impact === "serious",
      );
      if (graves.length) {
        console.log(
          `\nmenu ouvert (${theme}) — ${graves.length} violation(s) :\n` +
            graves.map((v) => `  ${v.id} · ${v.nodes.length} · ${v.help}`).join("\n"),
        );
      }
      expect(graves, `menu ouvert (${theme}) — violations graves`).toEqual([]);
    });
  }

  /* Vue 12 — le menu « déplacer cette tâche » d'une carte de kanban. Son `Menu`
     n'avait AUCUNE classe : pas même la boîte. */
  test("vue 12 — le menu d'une carte de kanban", async ({ page }) => {
    await page.clock.setFixedTime(MOMENT);
    await serveur(page, {
      session: SESSION_TACHES,
      reponses: {
        "/api/taches": { corps: LISTE },
        [`/api/projets/${PROJET.id}`]: { corps: PROJET },
      },
    });
    await page.goto(`/projets/${PROJET.id}/taches`);
    await expect(page.locator(".kmove").first()).toBeVisible();
    await ouvrirEtVerifier(page, "vue 12");
  });

  /* Vue 15 — le menu d'une barre de Gantt. Même défaut que le kanban. */
  test("vue 15 — le menu d'une barre de Gantt", async ({ page }) => {
    await page.clock.setFixedTime(MOMENT);
    await serveur(page, {
      session: SESSION_RAPPORTS,
      reponses: {
        "/api/projets/p1": { corps: PROJET_GANTT },
        "/api/projets/p1/feuille-de-route": { corps: ROUTE_GANTT },
        "/api/taches": { corps: TACHES_GANTT },
        "/api/taches/t2": { corps: FICHE_T2 },
      },
    });
    await page.goto("/projets/p1/gantt");
    await expect(page.locator(".g-grp-name").first()).toBeVisible();
    await ouvrirEtVerifier(page, "vue 15");
  });
});
