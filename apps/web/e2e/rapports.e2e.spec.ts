import { test, expect, type Page } from "@playwright/test";
import { serveur, SESSION_LECTURE } from "./fixtures/projets.js";
import {
  SESSION_RAPPORTS,
  SESSION_SANS_EXPORT,
  VUE_ENSEMBLE,
  VUE_ENSEMBLE_JEUNE,
  VUE_ENSEMBLE_STAGNANTE,
  VUE_ENSEMBLE_VIDE,
  GANTT,
  GANTT_VIDE,
  PROJET_GANTT,
  TACHES_GANTT,
  TACHES_SANS_DATES,
  ROUTE_GANTT,
  FICHE_T2,
} from "./fixtures/rapports.js";

/**
 * L-22 — vues 15 et 30.
 *
 * Le brief tient en une phrase : **Inès doit comprendre en trente secondes**.
 * Les contrôles portent donc moins sur la présence des chiffres que sur les
 * **conclusions** qui les accompagnent — troncage annoncé, surcharge nommée,
 * stagnation détectée, ratio interprété, historique jugé suffisant ou non.
 */

const MOMENT = new Date("2026-08-11T09:00:00.000Z");

async function horlogeFixe(page: Page) {
  await page.clock.setFixedTime(MOMENT);
}

const reponses = {
  "/api/rapports": { corps: VUE_ENSEMBLE },
  "/api/rapports/gantt": { corps: GANTT },
};

// ── Vue 30 ──────────────────────────────────────────────────────────────────

test.describe("Vue 30 — rapports et analytics", () => {
  test("EX-RPT-12 — L'ALERTE EST EN TÊTE, et elle dit où agir", async ({ page }) => {
    await horlogeFixe(page);
    await serveur(page, { session: SESSION_RAPPORTS, reponses });
    await page.goto("/rapports");

    await expect(
      page.getByRole("heading", { name: "Rapports & Analytics", level: 1 }),
    ).toBeVisible();
    // Un compteur sans suite laisse chercher où agir.
    await expect(page.getByText("Attention requise")).toBeVisible();
    await expect(page.getByText(/7 tâches en retard nécessitent votre attention/)).toBeVisible();
  });

  test("aucune alerte quand rien n'est en retard : le bandeau disparaît", async ({ page }) => {
    await horlogeFixe(page);
    await serveur(page, {
      session: SESSION_RAPPORTS,
      reponses: { ...reponses, "/api/rapports": { corps: VUE_ENSEMBLE_JEUNE } },
    });
    await page.goto("/rapports");

    await expect(page.getByText("Attention requise")).toHaveCount(0);
  });

  test("EX-RPT-06 — la santé est lisible, et le détail l'accompagne", async ({ page }) => {
    await horlogeFixe(page);
    await serveur(page, { session: SESSION_RAPPORTS, reponses });
    await page.goto("/rapports");

    await expect(page.getByText("Portail citoyen").first()).toBeVisible();
    await expect(page.getByText("Critique").first()).toBeVisible();
    await expect(page.getByText(/3 tâches restantes/)).toBeVisible();
    await expect(page.getByText(/4 en retard/)).toBeVisible();
    // « Non assigné » plutôt qu'une case vide, qui se prend pour un défaut.
    await expect(page.getByText("Non assigné")).toBeVisible();
  });

  test("RG-RPT-02 — LE TRONCAGE EST ANNONCÉ, jamais silencieux", async ({ page }) => {
    await horlogeFixe(page);
    await serveur(page, { session: SESSION_RAPPORTS, reponses });
    await page.goto("/rapports");

    // Une liste coupée en silence fait conclure qu'il n'y a que dix projets.
    await expect(
      page.getByText(/Affichage limité aux 10 premiers projets pour lisibilité — 12 au total/),
    ).toBeVisible();
  });

  test("RG-RPT-05 — la surcharge est nommée, ET la moyenne est montrée", async ({ page }) => {
    await horlogeFixe(page);
    await serveur(page, { session: SESSION_RAPPORTS, reponses });
    await page.goto("/rapports");
    await page.getByRole("navigation", { name: /Sections des rapports|Report sections/ }).getByRole("button", { name: "Analytics avancés" }).click();

    // Dix tâches ne veulent rien dire sans la moyenne à côté.
    await expect(page.getByText("Surcharge", { exact: true }).first()).toBeVisible();
    await expect(page.getByText(/Moyenne : 5 tâches actives/)).toBeVisible();
    await expect(
      page.getByRole("progressbar", { name: /Ana Berger : 9 tâches — surcharge/ }),
    ).toBeVisible();
  });

  test("RG-RPT-03 — UN HISTORIQUE COURT LE DIT plutôt que de tracer une courbe", async ({
    page,
  }) => {
    await horlogeFixe(page);
    await serveur(page, {
      session: SESSION_RAPPORTS,
      reponses: { ...reponses, "/api/rapports": { corps: VUE_ENSEMBLE_JEUNE } },
    });
    await page.goto("/rapports");
    await page.getByRole("navigation", { name: /Sections des rapports|Report sections/ }).getByRole("button", { name: "Analytics avancés" }).click();

    await expect(page.getByText("Historique en cours de construction")).toBeVisible();
    // Une courbe lissée sur un point aurait l'air d'une mesure.
    await expect(page.getByRole("img", { name: /Progression de/ })).toHaveCount(0);
  });

  test("la courbe existe quand l'historique suffit, et se résume en mots", async ({ page }) => {
    await horlogeFixe(page);
    await serveur(page, { session: SESSION_RAPPORTS, reponses });
    await page.goto("/rapports");
    await page.getByRole("navigation", { name: /Sections des rapports|Report sections/ }).getByRole("button", { name: "Analytics avancés" }).click();

    // Un tracé n'est pas lisible autrement.
    await expect(
      page.getByRole("img", { name: "Progression de 30 % à 55 % sur 4 relevés" }),
    ).toBeVisible();
  });

  test("RG-RPT-04 — la stagnation est DÉTECTÉE, pas laissée à l'œil", async ({ page }) => {
    await horlogeFixe(page);
    await serveur(page, {
      session: SESSION_RAPPORTS,
      reponses: { ...reponses, "/api/rapports": { corps: VUE_ENSEMBLE_STAGNANTE } },
    });
    await page.goto("/rapports");
    await page.getByRole("navigation", { name: /Sections des rapports|Report sections/ }).getByRole("button", { name: "Analytics avancés" }).click();

    await expect(page.getByText("Stagnation détectée")).toBeVisible();
  });

  test("EX-RPT-08 — les jalons se répartissent en trois états nommés", async ({ page }) => {
    await horlogeFixe(page);
    await serveur(page, { session: SESSION_RAPPORTS, reponses });
    await page.goto("/rapports");
    await expect(page.getByText(/jalons atteints à temps sur 5 échus/)).toBeVisible();
    await expect(page.getByText("À temps", { exact: true })).toBeVisible();
    await expect(page.getByText("En retard", { exact: true })).toBeVisible();
    await expect(page.getByText("À venir", { exact: true })).toBeVisible();
  });

  /**
   * `socle.css` pose `.panel + .panel { margin-top: 16px }` pour les panneaux
   * EMPILÉS. Dans `.two-col`, le second panneau reste le frère adjacent du
   * premier : il héritait ces 16 px et pendait plus bas que son voisin, alors
   * que `align-items: start` l'alignait déjà en haut de sa cellule.
   *
   * Rien ne pouvait le voir : `axe` ne regarde pas la mise en page, le typage
   * non plus, et le composant est irréprochable à la lecture — le défaut est
   * dans l'ADJACENCE, pas dans le balisage. Le contrôle porte donc sur la
   * géométrie rendue, seul endroit où il existe.
   */
  test("les deux panneaux d'une rangée s'alignent en haut", async ({ page }) => {
    await horlogeFixe(page);
    await serveur(page, { session: SESSION_RAPPORTS, reponses });
    await page.goto("/rapports");

    // La rangée n'existe qu'une fois les données rendues : mesurer avant, c'est
    // mesurer une page vide et conclure « aligné ». Le premier jet du contrôle
    // faisait exactement cela — vert avec le défaut en place.
    const rangees = page.locator(".two-col");
    await expect(rangees.first().locator("> .panel").nth(1)).toBeVisible();

    for (const rangee of await rangees.all()) {
      const panneaux = rangee.locator("> .panel");
      if ((await panneaux.count()) < 2) continue;

      const hauts: number[] = [];
      for (const panneau of await panneaux.all()) {
        const boite = await panneau.boundingBox();
        expect(boite).not.toBeNull();
        hauts.push(boite!.y);
      }
      // Même bord supérieur, au pixel de rendu près.
      expect(Math.max(...hauts) - Math.min(...hauts)).toBeLessThanOrEqual(1);
    }
  });

  test("les rangées de l'onglet avancé s'alignent aussi", async ({ page }) => {
    await horlogeFixe(page);
    await serveur(page, { session: SESSION_RAPPORTS, reponses });
    await page.goto("/rapports");
    await page
      .getByRole("navigation", { name: /Sections des rapports|Report sections/ })
      .getByRole("button", { name: "Analytics avancés" })
      .click();

    const rangees = page.locator(".two-col");
    await expect(rangees.first().locator("> .panel").nth(1)).toBeVisible();

    for (const rangee of await rangees.all()) {
      const panneaux = rangee.locator("> .panel");
      if ((await panneaux.count()) < 2) continue;
      const hauts: number[] = [];
      for (const panneau of await panneaux.all()) {
        hauts.push((await panneau.boundingBox())!.y);
      }
      expect(Math.max(...hauts) - Math.min(...hauts)).toBeLessThanOrEqual(1);
    }
  });

  /**
   * `.pl-toolbar` centre ses enfants : le libellé de période se centrait sur le
   * bloc titre entier — surtitre plus `h1` — et tombait donc à mi-hauteur entre
   * les deux, aligné sur ni l'un ni l'autre. Il se cale sur la ligne du `h1`, à
   * droite de la vue.
   */
  test("le libellé de période s'aligne sur le titre, à droite", async ({ page }) => {
    await horlogeFixe(page);
    await serveur(page, { session: SESSION_RAPPORTS, reponses });
    await page.goto("/rapports");

    const libelle = page.locator(".rep-arrete");
    await expect(libelle).toBeVisible();

    const l = (await libelle.boundingBox())!;
    const titre = (await page.locator("h1.titre-vue").boundingBox())!;
    const barre = (await page.locator(".pl-toolbar").boundingBox())!;

    // Même ligne de base que le titre, et non entre le surtitre et lui.
    expect(Math.abs(l.y + l.height - (titre.y + titre.height))).toBeLessThanOrEqual(1);
    // Rangé au bord droit de la vue.
    expect(Math.abs(l.x + l.width - (barre.x + barre.width))).toBeLessThanOrEqual(1);
  });

  test("EX-RPT-10 — LE RATIO EST INTERPRÉTÉ, pas laissé nu", async ({ page }) => {
    await horlogeFixe(page);
    await serveur(page, { session: SESSION_RAPPORTS, reponses });
    await page.goto("/rapports");
    await page.getByRole("navigation", { name: /Sections des rapports|Report sections/ }).getByRole("button", { name: "Analytics avancés" }).click();

    // « 0,4 » ne dit rien à qui ne le manipule pas tous les jours.
    await expect(page.getByText("0,4")).toBeVisible();
    await expect(
      page.getByText("Le backlog grossit : il se crée plus de tâches qu'il ne s'en termine."),
    ).toBeVisible();
  });

  test("un ratio qui n'existe pas ne s'invente pas en « stable »", async ({ page }) => {
    await horlogeFixe(page);
    await serveur(page, {
      session: SESSION_RAPPORTS,
      reponses: { ...reponses, "/api/rapports": { corps: VUE_ENSEMBLE_JEUNE } },
    });
    await page.goto("/rapports");
    await page.getByRole("navigation", { name: /Sections des rapports|Report sections/ }).getByRole("button", { name: "Analytics avancés" }).click();

    await expect(page.getByText("Aucune complétion sur la période")).toBeVisible();
    await expect(page.getByText(/Le backlog/)).toHaveCount(0);
  });

  test("RG-RPT-06 — CHAQUE GRAPHIQUE A SON ÉTAT VIDE RÉDIGÉ", async ({ page }) => {
    await horlogeFixe(page);
    await serveur(page, {
      session: SESSION_RAPPORTS,
      reponses: { ...reponses, "/api/rapports": { corps: VUE_ENSEMBLE_VIDE } },
    });
    await page.goto("/rapports");

    // Une zone blanche se signale au support au lieu d'être comprise.
    await expect(page.getByText("Aucun projet à afficher").first()).toBeVisible();
    await expect(page.getByText("Aucun jalon défini")).toBeVisible();

    await page.getByRole("navigation", { name: /Sections des rapports|Report sections/ }).getByRole("button", { name: "Analytics avancés" }).click();
    await expect(page.getByText("Aucune tâche active à afficher").first()).toBeVisible();
  });

  test("EX-RPT-01 — la période se choisit, et la requête suit", async ({ page }) => {
    await horlogeFixe(page);
    await serveur(page, { session: SESSION_RAPPORTS, reponses });
    await page.goto("/rapports");

    const demandes: string[] = [];
    page.on("request", (r) => {
      if (r.url().includes("/api/rapports")) demandes.push(r.url());
    });

    await page.getByRole("button", { name: "90 jours" }).click();
    await expect
      .poll(() => demandes.some((u) => u.includes("periode=trimestre")))
      .toBe(true);
  });

  test("EX-RPT-03 — les trois formats d'export sont proposés, et nommés honnêtement", async ({
    page,
  }) => {
    await horlogeFixe(page);
    await serveur(page, { session: SESSION_RAPPORTS, reponses });
    await page.goto("/rapports");

    await page.getByRole("button", { name: "Exporter" }).click();
    // « CSV (tableur) » plutôt qu'« Excel » : le produit ne rend pas un
    // classeur, et l'annoncer autrement serait un mensonge d'étiquette.
    await expect(page.getByRole("menuitem", { name: "CSV (tableur)" })).toBeVisible();
    await expect(page.getByRole("menuitem", { name: "JSON" })).toBeVisible();
    await expect(page.getByRole("menuitem", { name: "PDF (impression)" })).toBeVisible();
  });

  test("RG-GEN-06 — sans reports:export, le menu n'est pas proposé", async ({ page }) => {
    await horlogeFixe(page);
    await serveur(page, { session: SESSION_SANS_EXPORT, reponses });
    await page.goto("/rapports");

    await expect(page.getByRole("button", { name: "Exporter" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Actualiser" })).toBeVisible();
  });

  test("sans reports:read, l'accès est refusé", async ({ page }) => {
    await horlogeFixe(page);
    await serveur(page, { session: SESSION_LECTURE, reponses });
    await page.goto("/rapports");
    await expect(page.getByText("Permission requise")).toBeVisible();
  });
});

// ── Vue 30, onglet Gantt ────────────────────────────────────────────────────

test.describe("Vue 30 — la complétion des jalons", () => {
  test("`RG-RPT-07` — LE COMPTE GLOBAL EST DÉCLINÉ : chaque retard nomme son projet", async ({
    page,
  }) => {
    await horlogeFixe(page);
    await serveur(page, { session: SESSION_RAPPORTS, reponses });
    await page.goto("/rapports");

    // Le compte global reste, c'est lui qui situe. Ce qui manquait est dessous.
    await expect(page.getByText("3 / 5", { exact: true }).first()).toBeVisible();

    const bloc = page.locator(".mile-late");
    await expect(bloc.getByText("Ce qui est en retard", { exact: true })).toBeVisible();

    /*
      Un compteur sans suite laisse chercher où agir. Chaque ligne doit donc
      porter les quatre faits ensemble : le jalon, le projet, l'ancienneté du
      retard et ce qu'il reste à faire pour le lever.
    */
    const premiere = bloc.locator(".mile-item").first();
    await expect(premiere.getByText("Recette fonctionnelle", { exact: true })).toBeVisible();
    await expect(premiere.getByText("Sous tension", { exact: true })).toBeVisible();
    await expect(premiere.getByText("39 jours de retard", { exact: true })).toBeVisible();
    await expect(premiere.getByText(/03\/07\/2026 · 4 tâches restent/)).toBeVisible();

    // Le plus ancien retard vient en tête : c'est l'ordre où on les traite.
    await expect(bloc.locator(".mile-item .mile-nom")).toHaveText([
      "Recette fonctionnelle",
      "Livraison du socle",
    ]);

    // Et la ligne MÈNE au projet, sans quoi il faudrait le retrouver à la main.
    await expect(premiere.getByRole("link")).toHaveAttribute("href", "/projets/p2/jalons");
  });

  test("`RG-RPT-07` — aucun retard : l'absence est ÉCRITE, elle ne se déduit pas d'un vide", async ({ page }) => {
    await horlogeFixe(page);
    await serveur(page, {
      session: SESSION_RAPPORTS,
      reponses: {
        ...reponses,
        "/api/rapports": {
          corps: {
            ...VUE_ENSEMBLE,
            jalons: {
              total: 4, aTemps: 2, enRetard: 0, aVenir: 2, echus: 2,
              retards: [], retardsNonListes: 0,
            },
          },
        },
      },
    });
    await page.goto("/rapports");

    await expect(page.getByText("Aucun jalon échu n'est en retard.")).toBeVisible();
    await expect(page.locator(".mile-item")).toHaveCount(0);
  });
});

test.describe("Vue 30 — Gantt portefeuille", () => {
  test("EX-RPT-11 — LES CINQ ÉTATS RAG sont distingués et légendés", async ({ page }) => {
    await horlogeFixe(page);
    await serveur(page, { session: SESSION_RAPPORTS, reponses });
    await page.goto("/rapports");
    await page.getByRole("navigation", { name: /Sections des rapports|Report sections/ }).getByRole("button", { name: "Gantt portefeuille" }).click();

    for (const etat of ["On track", "À risque", "En retard", "À venir", "Terminé"]) {
      await expect(page.getByText(etat, { exact: true }).first()).toBeVisible();
    }
  });

  test("chaque barre porte SON RÉSUMÉ COMPLET — le survol n'existe pas au clavier", async ({
    page,
  }) => {
    await horlogeFixe(page);
    await serveur(page, { session: SESSION_RAPPORTS, reponses });
    await page.goto("/rapports");
    await page.getByRole("navigation", { name: /Sections des rapports|Report sections/ }).getByRole("button", { name: "Gantt portefeuille" }).click();

    await expect(
      page.getByRole("img", {
        name: /Sur les rails — 40 % · du 01\/06\/2026 au 31\/12\/2026 · chef : Driss Amrani/,
      }),
    ).toBeVisible();
    // Une valeur absente se nomme, elle ne se laisse pas vide.
    await expect(
      page.getByRole("img", { name: /Sous tension.*chef : Non assigné/ }),
    ).toBeVisible();
  });

  test("les neuf tris du brief sont proposés", async ({ page }) => {
    await horlogeFixe(page);
    await serveur(page, { session: SESSION_RAPPORTS, reponses });
    await page.goto("/rapports");
    await page.getByRole("navigation", { name: /Sections des rapports|Report sections/ }).getByRole("button", { name: "Gantt portefeuille" }).click();

    const tri = page.getByLabel("Trier");
    await expect(tri.locator("option")).toHaveCount(9);
    await tri.selectOption("nom");
    // Le tri réordonne la colonne de gauche sans recharger.
    await expect(page.getByText("Échéance passée")).toBeVisible();
  });

  test("EX-RPT-13 — L'ÉCHELLE CHANGE LA FRISE, elle ne fait pas que s'enregistrer", async ({
    page,
  }) => {
    await horlogeFixe(page);
    await serveur(page, { session: SESSION_RAPPORTS, reponses });
    await page.goto("/rapports");
    await page.getByRole("navigation", { name: /Sections des rapports|Report sections/ }).getByRole("button", { name: "Gantt portefeuille" }).click();

    const echelle = page.getByRole("group", { name: "Échelle de temps" });
    for (const nom of ["Jour", "Semaine", "Mois", "Trimestre"]) {
      await expect(echelle.getByRole("button", { name: nom, exact: true })).toBeVisible();
    }
    // Le mois est la valeur par défaut : l'onglet s'ouvre comme avant ce choix.
    await expect(echelle.getByRole("button", { name: "Mois", exact: true })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    /*
      Ce qui est vérifié ici est l'EFFET, jamais l'état du bouton. Un réglage
      qui s'enregistre sans agir a déjà vécu deux lots verts dans ce dépôt.
      Deux effets indépendants sont donc mesurés : la graduation, qui change
      de vocabulaire, et la largeur de la frise, qui change d'ordre de
      grandeur.
    */
    const frise = page.locator(".pg-right");
    const largeurDe = async () => (await frise.boundingBox())!.width;

    await expect(page.getByText("juin 26", { exact: true })).toBeVisible();
    const auMois = await largeurDe();

    await echelle.getByRole("button", { name: "Trimestre", exact: true }).click();
    await expect(page.getByText("T2 26", { exact: true })).toBeVisible();
    await expect(page.getByText("juin 26", { exact: true })).toHaveCount(0);
    expect(await largeurDe()).toBeLessThan(auMois);

    await echelle.getByRole("button", { name: "Jour", exact: true }).click();
    await expect(page.getByText("01/06", { exact: true }).first()).toBeVisible();
    expect(await largeurDe()).toBeGreaterThan(auMois * 5);

    await echelle.getByRole("button", { name: "Semaine", exact: true }).click();
    await expect(page.getByText("S23", { exact: true }).first()).toBeVisible();

    /*
      Les barres sont positionnées en pourcentage de la frise : leur longueur
      RELATIVE ne doit pas bouger d'une échelle à l'autre, sinon la frise et
      les barres se désalignent. On le mesure sur une barre connue.
    */
    const barre = page.getByRole("img", { name: /Sur les rails/ });
    const partAuSemaine = (await barre.boundingBox())!.width / (await largeurDe());
    await echelle.getByRole("button", { name: "Mois", exact: true }).click();
    const partAuMois = (await barre.boundingBox())!.width / (await largeurDe());
    expect(Math.abs(partAuSemaine - partAuMois)).toBeLessThan(0.02);
  });

  test("LE GANTT SE DÉPLOIE : la page défile, le cadre ne défile pas verticalement", async ({
    page,
  }) => {
    // Vingt projets, pour que la question se pose : cinq tiennent dans l'écran.
    const GANTT_LONG = {
      ...GANTT,
      lignes: Array.from({ length: 20 }, (_, i) => {
        const modele = GANTT.lignes[i % GANTT.lignes.length];
        return { ...modele, id: `x${i}`, nom: `${modele.nom} ${i + 1}` };
      }),
    };
    await page.setViewportSize({ width: 1400, height: 800 });
    await horlogeFixe(page);
    await serveur(page, {
      session: SESSION_RAPPORTS,
      reponses: { ...reponses, "/api/rapports/gantt": { corps: GANTT_LONG } },
    });
    await page.goto("/rapports");
    await page.getByRole("navigation", { name: /Sections des rapports|Report sections/ }).getByRole("button", { name: "Gantt portefeuille" }).click();
    await expect(page.getByText("Sur les rails 1", { exact: true })).toBeVisible();

    const cadre = await page.evaluate(() => {
      const c = document.querySelector(".pg-wrap") as HTMLElement;
      return {
        defileVerticalement: c.scrollHeight > c.clientHeight + 1,
        defileHorizontalement: c.scrollWidth > c.clientWidth + 1,
        pageDefile: document.documentElement.scrollHeight > window.innerHeight + 1,
      };
    });
    /*
      Une barre verticale dans le cadre, à l'intérieur d'une page qui en a déjà
      une, fait défiler deux choses pour un seul geste de molette. La barre
      HORIZONTALE, elle, reste indispensable : c'est elle qui porte la frise, et
      c'est elle qui garde la colonne des projets collée à gauche.
    */
    expect(cadre.defileVerticalement).toBe(false);
    expect(cadre.defileHorizontalement).toBe(true);
    expect(cadre.pageDefile).toBe(true);
  });

  test("l'état vide du Gantt est celui du brief", async ({ page }) => {
    await horlogeFixe(page);
    await serveur(page, {
      session: SESSION_RAPPORTS,
      reponses: { ...reponses, "/api/rapports/gantt": { corps: GANTT_VIDE } },
    });
    await page.goto("/rapports");
    await page.getByRole("navigation", { name: /Sections des rapports|Report sections/ }).getByRole("button", { name: "Gantt portefeuille" }).click();

    await expect(page.getByText("Aucun projet actif à afficher")).toBeVisible();
  });
});

// ── Vue 15 ──────────────────────────────────────────────────────────────────

test.describe("Vue 15 — projet, onglet Gantt", () => {
  const reponsesProjet = {
    "/api/projets/p1": { corps: PROJET_GANTT },
    "/api/projets/p1/feuille-de-route": { corps: ROUTE_GANTT },
    "/api/taches": { corps: TACHES_GANTT },
    "/api/taches/t2": { corps: FICHE_T2 },
  };

  test("les tâches se rangent par jalon, et celles qui n'en ont pas sont NOMMÉES", async ({
    page,
  }) => {
    await horlogeFixe(page);
    await serveur(page, { session: SESSION_RAPPORTS, reponses: reponsesProjet });
    await page.goto("/projets/p1/gantt");

    // Depuis que la frise porte ses jalons (`g-mile-lab`), « Lancement »
    // figure deux fois : dans le groupe et sur la graduation. On vise le
    // groupe, qui est ce que la règle demande.
    await expect(page.locator(".g-grp-name", { hasText: /^Lancement$/ })).toBeVisible();
    // Une tâche sans jalon ne flotte pas en tête sans explication.
    await expect(page.getByText("Sans jalon")).toBeVisible();
    await expect(page.getByText("Veille").first()).toBeVisible();
  });

  test("chaque barre porte son résumé : statut, dates, avancement", async ({ page }) => {
    await horlogeFixe(page);
    await serveur(page, { session: SESSION_RAPPORTS, reponses: reponsesProjet });
    await page.goto("/projets/p1/gantt");

    await expect(
      page.getByRole("button", {
        name: /Développement — En cours, du 01\/07\/2026 au 30\/09\/2026, 45 %/,
      }),
    ).toBeVisible();
  });

  /*
   * CONTRADICTION ENTRE SOURCES GELÉES, non tranchée — voir
   * `docs/audits/conformite-maquettes.md § 2.1`.
   *
   *   mockups/15-projet-gantt.html:1549   « Cliquez UNE tâche… »
   *   cadrage/02 …:509                    « Cliquez SUR une tâche… »
   *
   * La vue porte la maquette, qui fait loi dans cette campagne et que mesure
   * la boucle de conformité. Le contrôle suit donc la maquette — et cite la
   * contradiction, pour qu'un changement d'arbitrage se voie ici.
   */
  test("l'indice de la maquette est là, mot pour mot", async ({ page }) => {
    await horlogeFixe(page);
    await serveur(page, { session: SESSION_RAPPORTS, reponses: reponsesProjet });
    await page.goto("/projets/p1/gantt");

    await expect(
      page.getByText(
        "Cliquez une tâche pour voir ses dépendances, double-cliquez pour les modifier.",
      ),
    ).toBeVisible();
  });

  /*
   * La règle a changé de forme, pas d'intention.
   *
   * Le bandeau d'incohérences de dates (`conf-list`, `is-conflict`) que la
   * maquette 15 exige a besoin du GRAPHE, pas de la seule branche
   * sélectionnée : il ne peut pas attendre un clic. Ce qui reste interdit —
   * et c'est tout l'enjeu — est de lire les dépendances de CHAQUE ligne : le
   * `_count.dependances` servi par la liste dit lesquelles en ont, et les
   * autres ne déclenchent aucun appel.
   *
   * Le contrôle vérifie donc la borne, qui est la propriété coûteuse, et non
   * plus le moment, qui ne l'est pas.
   */
  test("LES DÉPENDANCES NE SE LISENT QUE POUR LES TÂCHES QUI EN ONT", async ({ page }) => {
    await horlogeFixe(page);
    await serveur(page, { session: SESSION_RAPPORTS, reponses: reponsesProjet });

    const appels: string[] = [];
    page.on("request", (r) => {
      if (r.url().includes("/api/taches/t2")) appels.push(r.url());
    });

    await page.goto("/projets/p1/gantt");
    // Depuis que la frise porte ses jalons (`g-mile-lab`), « Lancement »
    // figure deux fois : dans le groupe et sur la graduation. On vise le
    // groupe, qui est ce que la règle demande.
    await expect(page.locator(".g-grp-name", { hasText: /^Lancement$/ })).toBeVisible();
    /*
     * Une seule tâche du jeu porte des prérequis : un seul appel, avant comme
     * après la sélection. Si le nombre grimpait avec la taille de la frise,
     * c'est que la borne a sauté — et le coût redeviendrait linéaire en
     * nombre de lignes.
     */
    await expect.poll(() => appels.length).toBe(1);

    await page.getByRole("button", { name: /Développement — En cours/ }).click();
    await expect(page.getByText(/dépend/i).first()).toBeVisible();
    expect(appels).toHaveLength(1);
  });

  test("l'échelle se change, et le choix est annoncé", async ({ page }) => {
    await horlogeFixe(page);
    await serveur(page, { session: SESSION_RAPPORTS, reponses: reponsesProjet });
    await page.goto("/projets/p1/gantt");

    const jour = page.getByRole("button", { name: "Jour", exact: true });
    await jour.click();
    await expect(jour).toHaveAttribute("aria-pressed", "true");
  });

  test("aucune tâche datée : l'état vide est celui du brief", async ({ page }) => {
    await horlogeFixe(page);
    await serveur(page, {
      session: SESSION_RAPPORTS,
      reponses: { ...reponsesProjet, "/api/taches": { corps: TACHES_SANS_DATES } },
    });
    await page.goto("/projets/p1/gantt");

    await expect(page.getByText("Aucune tâche avec des dates")).toBeVisible();
    await expect(
      page.getByText(
        "Ajoutez des dates de début et de fin aux tâches pour les voir dans le Gantt.",
      ),
    ).toBeVisible();
  });

  test("l'onglet Gantt de la fiche projet y mène", async ({ page }) => {
    await horlogeFixe(page);
    await serveur(page, { session: SESSION_RAPPORTS, reponses: reponsesProjet });
    await page.goto("/projets/p1/gantt");

    await expect(page.getByRole("link", { name: /Gantt/ })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });
});
