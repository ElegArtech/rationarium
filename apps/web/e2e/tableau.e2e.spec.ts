import { test, expect, type Page } from "@playwright/test";
import { serveur, SESSION_LECTURE, PROJET, ROUTE } from "./fixtures/projets.js";
import { FICHE } from "./fixtures/taches.js";
import {
  SESSION_TABLEAU,
  SESSION_TABLEAU_SANS_ANNUAIRE,
  SESSION_INSTANTANE,
  TABLEAU,
  TABLEAU_VIDE,
  TABLEAU_LIMITE,
  PRESENCE,
  PRESENCE_VIDE,
  INSTANTANE_PRIS,
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
    // Les libellés sont ceux de la maquette en mode « Tout vide » : à zéro,
    // « 0 % complétées » n'est pas une information — un pourcentage sans
    // population ne veut rien dire.
    await expect(page.getByText("Rien à afficher")).toBeVisible();
    await expect(page.getByText("Aucun retard")).toBeVisible();
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

  /*
   * L'extrait montrait le travail sans y donner accès : on y lisait le titre
   * d'une tâche sans pouvoir l'ouvrir. Le contrôle porte sur la DESTINATION,
   * pas sur la présence d'un lien — un lien vers la mauvaise fiche passerait
   * une assertion de rôle.
   */
  test("EX-DSH-03 — une tâche de l'extrait MÈNE À SA FICHE", async ({ page }) => {
    await horlogeFixe(page);
    await serveur(page, { session: SESSION_TABLEAU, reponses });
    await page.goto("/");

    // La tâche court du lundi au mardi : elle a donc un jeton par jour, et les
    // deux mènent au même endroit.
    const jetons = page.locator(".week a.tchip", { hasText: "Rédiger la note de cadrage" });
    await expect(jetons).toHaveCount(2);
    const jeton = jetons.first();
    await expect(jeton).toHaveAttribute("href", "/taches/t-note");
    // Le libellé se coupe dans une colonne étroite : le titre complet doit
    // rester lisible quelque part.
    await expect(jeton).toHaveAttribute("title", "Rédiger la note de cadrage");
  });

  /*
   * `RG-GEN-06` — sans le droit de lire une tâche, le jeton reste un libellé.
   * Un lien qui mène à un refus est pire que pas de lien : il promet.
   */
  test("RG-GEN-06 — sans tasks:read, le jeton n'est pas un lien", async ({ page }) => {
    await horlogeFixe(page);
    await serveur(page, {
      session: {
        ...SESSION_TABLEAU,
        permissions: SESSION_TABLEAU.permissions.filter((p) => p !== "tasks:read"),
      },
      reponses,
    });
    await page.goto("/");

    await expect(page.getByText("Rédiger la note de cadrage").first()).toBeVisible();
    await expect(page.locator(".week a.tchip")).toHaveCount(0);
  });

  /*
   * Le cache du client servait l'état d'AVANT une écriture faite ailleurs.
   *
   * Clore une tâche depuis sa fiche, revenir au tableau de bord par la barre
   * latérale : la tâche y restait « à faire ». Seul un rechargement complet
   * de la page montrait la vérité — le pire des symptômes, car l'affichage
   * n'a pas l'air en panne, il a l'air d'avoir raison.
   *
   * Le contrôle NAVIGUE, il ne recharge pas. Écrit avec `page.goto`, il
   * passait avant comme après le correctif : une navigation dure vide le
   * cache et masque exactement ce qu'on cherche à voir.
   */
  test("une écriture faite AILLEURS se voit au retour, sans recharger la page", async ({
    page,
  }) => {
    await horlogeFixe(page);
    // Le serveur rend la tâche terminée UNE FOIS l'écriture reçue : c'est ce
    // décalage qui distingue un affichage à jour d'un affichage en cache.
    let ecrite = false;
    page.on("request", (r) => {
      if (r.method() === "PATCH") ecrite = true;
    });
    await serveur(page, {
      session: SESSION_TABLEAU,
      reponses: {
        ...reponses,
        "/api/taches/t-note": { corps: { ...FICHE, id: "t-note", titre: "Rédiger la note de cadrage" } },
      },
    });
    await page.route(
      (url) => url.pathname === "/api/tableau-de-bord",
      (route) =>
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(
            ecrite
              ? {
                  ...TABLEAU,
                  planning: {
                    ...TABLEAU.planning,
                    occupations: {
                      ...TABLEAU.planning.occupations,
                      taches: TABLEAU.planning.occupations.taches.map((t) =>
                        t.id === "t-note" ? { ...t, statut: "done" } : t,
                      ),
                    },
                  },
                }
              : TABLEAU,
          ),
        }),
    );
    await page.goto("/");

    const jeton = page.locator(".week a.tchip", { hasText: "Rédiger la note de cadrage" }).first();
    await expect(jeton).toHaveAttribute("style", /st-doing/);

    // Par le lien, pas par une adresse : c'est le trajet de l'utilisateur.
    await jeton.click();
    await page.waitForURL("**/taches/t-note");
    const ecriture = page.waitForRequest(
      (r) => r.method() === "PATCH" && r.url().includes("/api/taches/t-note"),
    );
    await page.locator("select.mini-select").first().selectOption("done");
    await ecriture;

    await page.getByRole("link", { name: "Tableau de bord", exact: true }).click();
    await expect(
      page.locator(".week a.tchip", { hasText: "Rédiger la note de cadrage" }).first(),
    ).toHaveAttribute("style", /st-done/);
  });

  /*
   * `RG-PLN-03` — le réglage des jours visibles vaut ICI AUSSI.
   *
   * L'extrait découpait `slice(0, 5)` : activer le samedi et le dimanche
   * changeait la vue 07 et laissait celle-ci du lundi au vendredi, sans que
   * rien ne le dise. Le contrôle compte les colonnes ET cherche le contenu du
   * samedi : un simple compte passerait sur cinq colonnes vides de plus.
   */
  test("RG-PLN-03 — l'extrait suit les jours visibles du paramétrage", async ({ page }) => {
    await horlogeFixe(page);
    await serveur(page, { session: SESSION_TABLEAU, reponses });
    await page.goto("/");

    await expect(page.locator(".week-col")).toHaveCount(5);
    await expect(page.getByText("Astreinte de week-end")).toHaveCount(0);

    await serveur(page, {
      session: SESSION_TABLEAU,
      reponses: {
        ...reponses,
        "/api/parametrage": { corps: { "planning.visibleDays": "0,1,2,3,4,5,6" } },
      },
    });
    await page.goto("/");

    await expect(page.locator(".week-col")).toHaveCount(7);
    await expect(page.getByText("Astreinte de week-end")).toBeVisible();
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
    // Le séparateur porte le compte, dans les termes de la maquette.
    await expect(page.getByText("Terminées · 1")).toBeVisible();
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

/**
 * `EX-USR-09` — la présence du jour.
 *
 * L'exigence vit au module M3 (utilisateurs et annuaire) et **aucun brief de
 * vue ne la porte** : ni celui de la 06, ni celui de la 27. Le choix de la
 * vue 06 est motivé dans `TableauDeBord.tsx` et consigné au rapport de lot.
 *
 * **L'horloge est figée dans chacun de ces contrôles.** Ce n'est pas une
 * précaution de style : la vue calcule la date qu'elle demande, et le serveur
 * simulé ne répond qu'à cette date-là. Sans horloge figée, ces tests
 * passeraient le 12 août 2026 et échoueraient le 13.
 */
test.describe("Vue 06 — EX-USR-09, la présence du jour", () => {
  /* Le serveur simulé ne connaît QUE le jour de `MOMENT`. Une vue qui
     demanderait une autre date — ou aucune — recevrait un 404 et rendrait son
     état d'erreur : c'est ce qui fait de ce motif une assertion. */
  const avecPresence = {
    ...reponses,
    "/api/utilisateurs/presence?jour=2026-08-12": { corps: PRESENCE },
  };

  /*
   * Le bloc, et rien que lui. « Camille Roussel » est aussi le nom du menu
   * utilisateur de la coquille, et « Télétravail » un jeton de « Mon
   * planning » : une assertion non bornée attrapait l'un ou l'autre **selon
   * l'instant du rendu**, donc passait au vert par accident tant que le bloc
   * n'était pas encore monté.
   */
  const bloc = (page: Page) =>
    page.locator("section.panel").filter({ hasText: "Qui est là aujourd'hui" });

  test("EX-USR-09 — QUI EST LÀ, QUI EST EN CONGÉ, QUI EST EN TÉLÉTRAVAIL", async ({ page }) => {
    await horlogeFixe(page);
    await serveur(page, { session: SESSION_TABLEAU, reponses: avecPresence });
    await page.goto("/");

    const panneau = bloc(page);
    await expect(panneau).toBeVisible();

    // Les trois états sont ÉCRITS. Trois jetons les distinguent aussi, mais
    // « en congé » et « en télétravail » ne se devinent pas d'une nuance.
    await expect(panneau.getByText("Camille Roussel")).toBeVisible();
    await expect(panneau.getByText("Au bureau", { exact: true })).toBeVisible();
    await expect(panneau.getByText("Driss Amrani")).toBeVisible();
    await expect(panneau.getByText("Inès Rocher")).toBeVisible();
    await expect(panneau.getByText("Télétravail", { exact: true })).toBeVisible();
  });

  test("EX-USR-09 — le type de congé est nommé, pas réduit à « en congé »", async ({ page }) => {
    await horlogeFixe(page);
    await serveur(page, { session: SESSION_TABLEAU, reponses: avecPresence });
    await page.goto("/");

    // Le serveur rend `typeConge` ; s'en servir dit « Congé annuel » là où
    // « En congé » aurait perdu ce que la donnée portait déjà.
    await expect(bloc(page).getByText("Congé annuel", { exact: true })).toBeVisible();
  });

  test("EX-USR-09 — le taux de présence est chiffré, pas seulement listé", async ({ page }) => {
    await horlogeFixe(page);
    await serveur(page, { session: SESSION_TABLEAU, reponses: avecPresence });
    await page.goto("/");

    // `cadrage/01 § 2`, Fatou : « voir le taux de présence ». Compter les
    // lignes à l'œil n'est pas voir un taux.
    await expect(page.getByText("1 au bureau · 1 en congé · 1 en télétravail")).toBeVisible();
  });

  test("EX-USR-09 — LA DATE DEMANDÉE EST CELLE DE L'HORLOGE, jamais laissée au serveur", async ({
    page,
  }) => {
    /*
     * Le défaut que ce contrôle ferme : `GET /utilisateurs/presence` accepte
     * `jour` en option et retombe sinon sur `new Date()` — un instant, avec
     * son heure —, qu'il compare à `telework.date` par égalité stricte et à
     * `leave.dateFin` par `>=`, deux colonnes stockées à minuit. Sans `jour`,
     * plus personne n'est jamais en télétravail et tout congé qui s'achève
     * aujourd'hui est manqué : la réponse serait « tout le monde est
     * présent » — fausse, et parfaitement plausible.
     */
    await horlogeFixe(page);
    let demandee: string | null = null;
    await serveur(page, { session: SESSION_TABLEAU, reponses: avecPresence });
    await page.route("**/api/utilisateurs/presence**", (route) => {
      demandee = new URL(route.request().url()).searchParams.get("jour");
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(PRESENCE),
      });
    });
    await page.goto("/");

    /* L'effet AVANT la variable : la liste rendue prouve que la réponse est
       arrivée, donc que `demandee` a été renseignée. */
    await expect(bloc(page).getByText("Driss Amrani")).toBeVisible();
    // `MOMENT` vaut le 12 août 2026 : la date est calculée, transmise, et nue.
    expect(demandee).toBe("2026-08-12");
  });

  test("RG-GEN-04 — un périmètre sans agent s'explique, il ne reste pas blanc", async ({
    page,
  }) => {
    await horlogeFixe(page);
    await serveur(page, {
      session: SESSION_TABLEAU,
      reponses: {
        ...reponses,
        "/api/utilisateurs/presence?jour=2026-08-12": { corps: PRESENCE_VIDE },
      },
    });
    await page.goto("/");

    await expect(bloc(page).getByText("Aucun agent dans votre périmètre")).toBeVisible();
    await expect(
      page.getByText("La présence du jour se remplit dès qu'un agent vous est rattaché."),
    ).toBeVisible();
  });

  test("RG-GEN-06 — SANS users:read, LE BLOC N'EXISTE PAS", async ({ page }) => {
    /*
     * Le brief exige la vue « complète en un écran, sans défilement » pour
     * Camille, contributrice. Elle ne détient pas `users:read` : le bloc ne
     * s'affiche pas pour elle, et la contrainte du brief tient. Ni grisé, ni
     * vide — une présence d'équipe ne s'annonce pas à qui n'y a pas droit.
     */
    await horlogeFixe(page);
    let appelee = false;
    await serveur(page, {
      session: SESSION_TABLEAU_SANS_ANNUAIRE,
      reponses: avecPresence,
    });
    await page.route("**/api/utilisateurs/presence**", (route) => {
      appelee = true;
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(PRESENCE),
      });
    });
    await page.goto("/");

    // La page a bien rendu : c'est le bloc qui manque, pas le chargement.
    await expect(page.getByRole("heading", { name: "Bonjour Camille", level: 1 })).toBeVisible();
    await expect(bloc(page)).toHaveCount(0);
    await expect(page.getByText("Driss Amrani")).toHaveCount(0);
    // Et la donnée n'est même pas demandée.
    expect(appelee).toBe(false);
  });
});

/**
 * La capture d'un instantané d'avancement — vue 11.
 *
 * **`EX-PRJ-13` n'est cité par aucun de ces titres, et c'est délibéré.**
 * L'exigence dit « **consulter l'historique** des instantanés » : elle porte
 * deux verbes, capturer et consulter. Le premier est branché ici ; le second
 * n'a ni méthode de service, ni route — `fiche()` ne rend que le dernier
 * relevé. La citer serait déclarer couverte une exigence dont la moitié
 * n'existe pas, exactement ce que la vague 7-4 a refusé de faire pour
 * `EX-JAL-01` et `EX-CMP-09`. Elle reste donc en dette, son `defaut` mis à
 * jour pour dire ce qui est fait et ce qui manque.
 *
 * `RG-PRJ-09` n'est pas cité non plus : la règle veut une capture
 * **périodique**, confiée à `pg-boss` par `cadrage/03 § 5.4`, et ce travail
 * de fond n'existe pas. Ce bouton est aujourd'hui le seul producteur
 * d'instantanés du produit — ce qui rend la capture nécessaire, pas la règle
 * satisfaite.
 *
 * **Ce bloc décrit la vue 11 et vit pourtant dans le fichier de la vue 06.**
 * `projets.e2e.spec.ts` est travaillé par un autre lot au même moment ; deux
 * lots dans le même fichier se perdent l'un l'autre. À la fusion, sa place est
 * là-bas, sous « Vue 11 ».
 */
test.describe("Vue 11 — capturer un instantané d'avancement", () => {
  const CHEMIN = `/projets/${PROJET.id}`;
  const reponsesProjet = {
    [`/api${CHEMIN}`]: { corps: PROJET },
    [`/api${CHEMIN}/feuille-de-route`]: { corps: ROUTE },
  };

  test("LA CAPTURE PART AVEC LA DATE DU JOUR, jamais avec l'heure", async ({ page }) => {
    /*
     * `RG-PRJ-09` confie la capture à un travail périodique (`cadrage/03
     * § 5.4`) — qui n'existe pas. Cette commande est donc aujourd'hui le seul
     * producteur d'instantanés du produit : sans elle, `dernierInstantane` et
     * la courbe de tendance de la vue 30 restent vides à jamais.
     *
     * L'horloge est figée : la date envoyée est calculée par la vue.
     */
    await horlogeFixe(page);
    let envoyee: unknown = null;
    await serveur(page, { session: SESSION_INSTANTANE, reponses: reponsesProjet });
    await page.route(`**/api${CHEMIN}/instantane`, (route) => {
      envoyee = route.request().postDataJSON();
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(INSTANTANE_PRIS),
      });
    });
    await page.goto(CHEMIN);

    await page.getByRole("button", { name: "Capturer un instantané" }).click();

    expect(envoyee).toEqual({ date: "2026-08-12" });
  });

  test("l'accusé rend la progression REÇUE, pas celle qu'on affichait", async ({
    page,
  }) => {
    /*
     * La fiche affiche 62 % et le serveur écrit ce qu'il a calculé. Relire la
     * réponse plutôt que son propre état est la seule façon de voir que le
     * serveur a bien enregistré ce qu'on croit : c'est le défaut qu'une
     * capacité sans client cache par nature.
     */
    await horlogeFixe(page);
    await serveur(page, {
      session: SESSION_INSTANTANE,
      reponses: {
        ...reponsesProjet,
        [`/api${CHEMIN}/instantane`]: { corps: { ...INSTANTANE_PRIS, progression: 58 } },
      },
    });
    await page.goto(CHEMIN);

    await page.getByRole("button", { name: "Capturer un instantané" }).click();

    await expect(page.getByText("Instantané capturé — 58 % au 12/08/2026.")).toBeVisible();
  });

  test("RG-GEN-06 — sans reports:read, la capture n'est pas proposée", async ({ page }) => {
    await horlogeFixe(page);
    await serveur(page, { session: SESSION_TABLEAU, reponses: reponsesProjet });
    await page.goto(CHEMIN);

    // La page a rendu — c'est la commande qui manque.
    await expect(page.getByRole("heading", { name: PROJET.nom })).toBeVisible();
    await expect(page.getByRole("button", { name: "Capturer un instantané" })).toHaveCount(0);
  });

  test("un projet annulé est figé : aucune capture", async ({ page }) => {
    /*
     * `cadrage/02`, vue 11 : « Ce projet est annulé […] toute modification
     * bloquée ». Un instantané est une écriture.
     */
    await horlogeFixe(page);
    await serveur(page, {
      session: SESSION_INSTANTANE,
      reponses: {
        ...reponsesProjet,
        [`/api${CHEMIN}`]: { corps: { ...PROJET, statut: "cancelled" } },
      },
    });
    await page.goto(CHEMIN);

    await expect(page.getByText("Ce projet est annulé")).toBeVisible();
    await expect(page.getByRole("button", { name: "Capturer un instantané" })).toHaveCount(0);
  });
});
