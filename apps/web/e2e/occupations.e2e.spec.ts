import { test, expect } from "@playwright/test";
import { serveur } from "./fixtures/projets.js";
import {
  CAMILLE,
  FATOU,
  HUGO,
  EVENEMENTS,
  TYPES_CONGE,
  SOLDES,
  DEMANDES,
  DEMANDE_ANNULATION,
  JOURS_OUVRES_A_CHEVAL,
  JOURS_OUVRES_SEMAINE,
  DELEGATIONS,
  PLANNING_TELETRAVAIL,
  REGLES_TELETRAVAIL,
  SAISIES,
} from "./fixtures/occupations.js";

/**
 * L-34 — vues 18, 19, 20 et 21.
 *
 * Les points d'attention des briefs sont vérifiés tels qu'ils sont écrits :
 * « la portée du geste explicite au moment de l'action », « Camille en voit un
 * onglet, Hugo en voit six », « le solde ne doit pas être à cherché »,
 * « cinq apparences sur une même case », « rendre visible ce qui manque ».
 */

const PROJETS_VIDES = { "/api/projets": { corps: { projets: [], affiches: 0, total: 0 } } };

test.describe("Vue 18 — événements", () => {
  const reponses = { ...PROJETS_VIDES, "/api/evenements": { corps: EVENEMENTS } };
  /** `EX-EVT-06` — le profil qui détient les deux gestes du lot L-42. */
  const REDACTEUR = {
    ...CAMILLE,
    permissions: [...CAMILLE.permissions, "events:update", "events:delete"],
  };

  test("la liste groupe par jour et dit les horaires", async ({ page }) => {
    await serveur(page, { session: CAMILLE, reponses });
    await page.goto("/evenements");

    await expect(page.getByRole("heading", { name: "Événements", level: 1 })).toBeVisible();
    await expect(page.getByText("Comité de pilotage")).toBeVisible();
    await expect(page.getByText("09:00 – 10:30")).toBeVisible();
    // « Toute la journée » se dit ; ce n'est pas un horaire vide.
    await expect(page.getByText("Toute la journée").first()).toBeVisible();
  });

  test("une série est signalée, une intervention extérieure aussi", async ({ page }) => {
    await serveur(page, { session: CAMILLE, reponses });
    await page.goto("/evenements");

    await expect(page.getByText("Série", { exact: true })).toBeVisible();
    await expect(page.getByText("Intervention ext.")).toBeVisible();
  });

  test("la portée du geste est demandée AVANT d'agir, avec ses deux effets décrits", async ({
    page,
  }) => {
    // Le profil porte `events:update` : `POST /evenements/:id/arreter` l'exige,
    // et depuis L-42 la commande n'est plus proposée sans elle — RG-GEN-06 dit
    // qu'une action interdite n'est jamais proposée puis refusée.
    await serveur(page, { session: REDACTEUR, reponses });
    await page.goto("/evenements");
    // Le geste part du panneau de détail, comme la maquette : on ouvre
    // l'événement, puis on agit sur sa série.
    await page.getByRole("button", { name: EVENEMENTS[0].titre }).click();
    await page.getByRole("button", { name: "Arrêter la récurrence" }).click();

    await expect(page.getByText("Toute la série à partir d'ici")).toBeVisible();
    await expect(page.getByText(/Les occurrences futures sont supprimées/)).toBeVisible();
    await expect(page.getByText("Cette occurrence seulement")).toBeVisible();
    // Le passé est intact, et c'est écrit à côté du bouton qui inquiète.
    await expect(page.getByText("Le passé n'est jamais touché")).toBeVisible();
  });

  test("l'aperçu de récurrence se relit en langage naturel", async ({ page }) => {
    await serveur(page, { session: CAMILLE, reponses });
    await page.goto("/evenements");
    await page.getByRole("button", { name: "Créer un événement" }).click();
    // Le libellé porte l'astérisque des champs obligatoires : « Date * ».
    await page.getByLabel(/^Date/).fill("2026-09-01");
    await page.getByLabel("Événement récurrent").check();

    await expect(page.getByText(/Toutes les semaine/)).toBeVisible();
  });

  test("« Toute la journée » fait disparaître les horaires, pas les griser", async ({ page }) => {
    await serveur(page, { session: CAMILLE, reponses });
    await page.goto("/evenements");
    await page.getByRole("button", { name: "Créer un événement" }).click();

    await expect(page.getByLabel("Heure de début")).toBeVisible();
    await page.getByLabel("Toute la journée").check();
    await expect(page.getByLabel("Heure de début")).toHaveCount(0);
  });

  test("EX-EVT-06 — sur une série, « Modifier » demande sa portée AVANT d'ouvrir le formulaire", async ({
    page,
  }) => {
    await serveur(page, { session: REDACTEUR, reponses });
    await page.goto("/evenements");
    await page.getByRole("button", { name: EVENEMENTS[0].titre }).click();
    await page.getByRole("button", { name: "Modifier", exact: true }).click();

    // La question, avec ses deux effets décrits — pas un bouton dont l'effet se
    // révèle une fois exécuté.
    await expect(page.getByText("Cette occurrence seulement")).toBeVisible();
    await expect(page.getByText("Toute la série, à partir de celle-ci")).toBeVisible();
    await expect(page.getByText(/Les occurrences déjà passées sont conservées/)).toBeVisible();
    await expect(page.getByText("Le passé n'est jamais touché")).toBeVisible();
    // Le formulaire n'est PAS encore là : la portée se choisit d'abord.
    await expect(page.getByLabel(/^Titre/)).toHaveCount(0);
  });

  test("EX-EVT-06 — hors série, « Modifier » ouvre directement le formulaire, prérempli", async ({
    page,
  }) => {
    await serveur(page, { session: REDACTEUR, reponses });
    await page.goto("/evenements");
    // Le second événement du jeu n'est pas récurrent : la question de portée
    // n'aurait qu'une réponse possible, donc elle n'est pas posée.
    await page.getByRole("button", { name: EVENEMENTS[1].titre }).click();
    await page.getByRole("button", { name: "Modifier", exact: true }).click();

    await expect(page.getByText("Cette occurrence seulement")).toHaveCount(0);
    await expect(page.getByLabel(/^Titre/)).toHaveValue(EVENEMENTS[1].titre);
  });

  test("EX-EVT-06 — en portée « toute la série », la date disparaît et le formulaire dit pourquoi", async ({
    page,
  }) => {
    await serveur(page, { session: REDACTEUR, reponses });
    await page.goto("/evenements");
    await page.getByRole("button", { name: EVENEMENTS[0].titre }).click();
    await page.getByRole("button", { name: "Modifier", exact: true }).click();
    await page.getByRole("button", { name: /Toute la série/ }).click();
    // « Continuer », et non « Modifier » : la fenêtre de portée ne modifie rien,
    // elle ouvre le formulaire.
    await page.getByRole("button", { name: "Continuer" }).click();

    await expect(page.getByLabel(/^Titre/)).toHaveValue(EVENEMENTS[0].titre);
    // Un champ proposé puis refusé par le serveur serait exactement ce que
    // RG-GEN-06 interdit : il n'est pas proposé.
    await expect(page.getByLabel(/^Date/)).toHaveCount(0);
    await expect(page.getByText(/La date distingue les occurrences/)).toBeVisible();
  });

  test("RG-GEN-06 — sans les permissions, les deux gestes ne sont pas proposés", async ({
    page,
  }) => {
    // Camille crée des événements et n'en modifie aucun : la vue reste
    // crédible en droits minimaux.
    await serveur(page, { session: CAMILLE, reponses });
    await page.goto("/evenements");
    await page.getByRole("button", { name: EVENEMENTS[0].titre }).click();

    await expect(page.getByRole("button", { name: "Modifier", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Supprimer", exact: true })).toHaveCount(0);
    // Même raison pour l'arrêt de récurrence : la route exige `events:update`,
    // et la commande était proposée à qui ne l'a pas — corrigé en L-42.
    await expect(page.getByRole("button", { name: "Arrêter la récurrence" })).toHaveCount(0);
  });

  test("état vide", async ({ page }) => {
    await serveur(page, {
      session: CAMILLE,
      reponses: { ...reponses, "/api/evenements": { corps: [] } },
    });
    await page.goto("/evenements");
    await expect(page.getByText("Aucun événement trouvé")).toBeVisible();
  });
});

test.describe("Vue 19 — congés : trois publics, un écran", () => {
  const reponses = {
    "/api/conges/soldes": { corps: SOLDES },
    "/api/conges/types": { corps: TYPES_CONGE },
    "/api/conges/delegations": { corps: DELEGATIONS },
    "/api/conges": { corps: DEMANDES },
    /* `RG-CNG-16` — le décompte en jours ouvrés est SERVEUR depuis L-46 : sans
       cette réponse, la fenêtre de demande n'a plus ni années ni total. */
    "/api/parametrage/jours-ouvres": { corps: JOURS_OUVRES_A_CHEVAL },
  };

  test("Camille ne voit qu'un onglet", async ({ page }) => {
    await serveur(page, { session: CAMILLE, reponses });
    await page.goto("/conges");

    const onglets = page.getByRole("navigation", { name: "Sections des congés" }).getByRole("link");
    await expect(onglets).toHaveCount(1);
    // L'onglet porte son compteur à côté de son libellé, comme la maquette.
    await expect(onglets.first()).toContainText("Mes demandes");
  });

  test("Fatou en voit trois : elle valide et délègue", async ({ page }) => {
    await serveur(page, { session: FATOU, reponses });
    await page.goto("/conges");

    const onglets = page.getByRole("navigation", { name: "Sections des congés" }).getByRole("link");
    await expect(onglets).toHaveCount(3);
    await expect(page.getByRole("link", { name: "À valider" })).toBeVisible();
  });

  test("Hugo voit tout, types compris", async ({ page }) => {
    await serveur(page, { session: HUGO, reponses });
    await page.goto("/conges");

    const onglets = page.getByRole("navigation", { name: "Sections des congés" }).getByRole("link");
    await expect(onglets).toHaveCount(5);
    await expect(page.getByRole("link", { name: "Types de congés" })).toBeVisible();
  });

  test("le solde est en tête de page, pas à chercher", async ({ page }) => {
    await serveur(page, { session: CAMILLE, reponses });
    await page.goto("/conges");

    // Le chiffre mis en avant est le DISPONIBLE, pas le total attribué.
    await expect(page.getByText("Congés annuels").first()).toBeVisible();
    await expect(page.getByText("jours disponibles").first()).toBeVisible();
    await expect(page.getByText("Total 25")).toBeVisible();
    await expect(page.getByText("Utilisés 12")).toBeVisible();
    await expect(page.getByText("En attente 3")).toBeVisible();
  });

  test("RG-CNG-19 — une demande à cheval sur deux ans montre sa répartition", async ({ page }) => {
    await serveur(page, { session: CAMILLE, reponses });
    await page.goto("/conges");

    // Les jours s'affichent avec une décimale : une demi-journée existe.
    await expect(page.getByText("2026 : 2,0 · 2027 : 2,0")).toBeVisible();
  });

  test("un congé approuvé propose l'annulation, pas la suppression", async ({ page }) => {
    await serveur(page, { session: CAMILLE, reponses });
    await page.goto("/conges");

    // RG-CNG-12 : on ne supprime pas un congé approuvé, on en demande l'annulation.
    await expect(page.getByRole("button", { name: "Demander l'annulation" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Supprimer" })).toHaveCount(1);
  });

  test("l'onglet À valider porte le compte et les deux actions", async ({ page }) => {
    await serveur(page, { session: FATOU, reponses });
    await page.goto("/conges");
    await page.getByRole("link", { name: "À valider" }).click();

    await expect(page.getByText(/demandes? en attente de validation/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Approuver" }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Refuser" }).first()).toBeVisible();
  });

  test("le refus demande un motif, présenté comme facultatif", async ({ page }) => {
    await serveur(page, { session: FATOU, reponses });
    await page.goto("/conges");
    await page.getByRole("link", { name: "À valider" }).click();
    await page.getByRole("button", { name: "Refuser" }).first().click();

    await expect(page.getByLabel("Motif du refus (optionnel)")).toBeVisible();
    await expect(page.getByRole("button", { name: "Confirmer le refus" })).toBeVisible();
  });

  test("les délégations sont expliquées avant d'être listées", async ({ page }) => {
    await serveur(page, { session: FATOU, reponses });
    await page.goto("/conges");
    await page.getByRole("link", { name: "Délégations" }).click();

    await expect(page.getByText(/pourra valider les demandes de congé à votre place/)).toBeVisible();
    await expect(page.getByText("Délégations données")).toBeVisible();
    await expect(page.getByText("Aucune délégation reçue")).toBeVisible();
  });

  test("les types disent leur usage AVANT toute action de suppression", async ({ page }) => {
    await serveur(page, { session: HUGO, reponses });
    await page.goto("/conges");
    await page.getByRole("link", { name: "Types de congés" }).click();

    // RG-CNG-17 : un type utilisé sera désactivé, pas supprimé. Le compte le
    // dit d'avance plutôt que de laisser découvrir la règle en la heurtant.
    await expect(page.getByText("42 congés")).toBeVisible();
    await expect(page.getByText("Système", { exact: true })).toBeVisible();
    await expect(page.getByText("Auto", { exact: true })).toBeVisible();
  });

  test("un type auto-approuvé le dit dans la fenêtre de demande", async ({ page }) => {
    await serveur(page, { session: CAMILLE, reponses });
    await page.goto("/conges");
    await page.getByRole("button", { name: "Nouvelle demande" }).click();
    await page.getByLabel("Type de congé").selectOption("t2");

    await expect(page.getByText("Ce type est approuvé automatiquement.")).toBeVisible();
    await expect(page.getByText(/soumise à validation/)).toHaveCount(0);
  });

  test("le contrôle de solde apparaît par année, et signale le chevauchement d'années", async ({
    page,
  }) => {
    await serveur(page, { session: CAMILLE, reponses });
    await page.goto("/conges");
    await page.getByRole("button", { name: "Nouvelle demande" }).click();
    await page.getByLabel("Type de congé").selectOption("t1");
    await page.getByLabel("Date de début").fill("2026-12-28");
    await page.getByLabel("Date de fin").fill("2027-01-03");

    await expect(page.getByText("À cheval sur deux années")).toBeVisible();
    await expect(page.getByText("Attribués 2026")).toBeVisible();
    await expect(page.getByText("Attribués 2027")).toBeVisible();
  });

  // ── L-46 — les trois capacités qu'aucun écran n'atteignait ────────────────

  /**
   * LE DÉFAUT ACTIF, et le contrôle qui compte le plus de ce lot.
   *
   * `GET /conges?aValider=true` rend `pending` ET `cancellation_requested`.
   * La ligne posait « Approuver » / « Refuser » sur les deux, et sur une
   * annulation les deux appelaient `POST /conges/:id/approuver` — que le
   * serveur refuse en `statut_incompatible`. Deux boutons qui ne pouvaient pas
   * fonctionner, sous les yeux du validateur.
   */
  test("EX-CNG-07 — une demande d'annulation ne porte plus « Approuver », mais ses deux commandes propres", async ({
    page,
  }) => {
    await serveur(page, {
      session: FATOU,
      reponses: { ...reponses, "/api/conges": { corps: [DEMANDE_ANNULATION] } },
    });
    await page.goto("/conges");
    await page.getByRole("navigation", { name: "Sections des congés" }).getByRole("link", {
      name: "À valider",
    }).click();

    // `{ exact: true }` : « Refuser l'annulation » contient « Refuser », et
    // sans lui l'assertion négative passerait au vert en visant le mauvais
    // bouton — `getByRole` cherche par sous-chaîne.
    await expect(page.getByRole("button", { name: "Approuver", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Refuser", exact: true })).toHaveCount(0);

    await expect(page.getByRole("button", { name: "Accepter l'annulation" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Refuser l'annulation" })).toBeVisible();
    // L'onglet n'a pas de colonne de statut : la ligne le dit elle-même.
    await expect(page.getByText("Annulation demandée")).toBeVisible();
  });

  test("EX-CNG-07 — les deux commandes appellent la route de traitement, et s'y distinguent par « accepte »", async ({
    page,
  }) => {
    const corps: unknown[] = [];
    await serveur(page, {
      session: FATOU,
      reponses: { ...reponses, "/api/conges": { corps: [DEMANDE_ANNULATION] } },
    });
    /* Enregistrée APRÈS `serveur` : Playwright essaie les interceptions dans
       l'ordre inverse de leur déclaration, donc celle-ci l'emporte. */
    await page.route(
      (url) => url.pathname === `/api/conges/${DEMANDE_ANNULATION.id}/annulation/traiter`,
      (route) => {
        corps.push(route.request().postDataJSON());
        return route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
      },
    );
    await page.goto("/conges");
    await page.getByRole("navigation", { name: "Sections des congés" }).getByRole("link", {
      name: "À valider",
    }).click();

    await page.getByRole("button", { name: "Accepter l'annulation" }).click();
    await expect(page.getByText("Annulation acceptée : le congé est annulé.")).toBeVisible();

    await page.getByRole("button", { name: "Refuser l'annulation" }).click();
    await expect(page.getByText("Annulation refusée : le congé reste approuvé.")).toBeVisible();

    // Le corps distingue les deux issues — c'est tout le contrat de la route.
    expect(corps).toEqual([{ accepte: true }, { accepte: false }]);
  });

  /**
   * `RG-CNG-06` — refuser une annulation ne laisse pas la demande en l'état :
   * le congé **revient à « Approuvé »**. Un bouton nommé « Refuser » tout
   * court laisserait croire que c'est le congé qui tombe.
   */
  test("RG-CNG-06 — refuser l'annulation dit que le congé RESTE approuvé", async ({ page }) => {
    await serveur(page, {
      session: FATOU,
      reponses: {
        ...reponses,
        "/api/conges": { corps: [DEMANDE_ANNULATION] },
        [`/api/conges/${DEMANDE_ANNULATION.id}/annulation/traiter`]: { corps: {} },
      },
    });
    await page.goto("/conges");
    await page.getByRole("navigation", { name: "Sections des congés" }).getByRole("link", {
      name: "À valider",
    }).click();
    await page.getByRole("button", { name: "Refuser l'annulation" }).click();

    await expect(page.getByText("Annulation refusée : le congé reste approuvé.")).toBeVisible();
    // Le contraire — « le congé est annulé » — serait le message de l'autre
    // issue : c'est le seul mot qui sépare les deux.
    await expect(page.getByText("Annulation acceptée : le congé est annulé.")).toHaveCount(0);
  });

  /**
   * `EX-CNG-13` — `DELETE /conges/types/:id` ne supprime pas toujours, et son
   * retour n'est pas trivial : `{ desactive, conges, systeme }`.
   */
  test("EX-CNG-13 — retirer un type UTILISÉ annonce une désactivation chiffrée, jamais une suppression", async ({
    page,
  }) => {
    await serveur(page, {
      session: HUGO,
      reponses: {
        ...reponses,
        // Le serveur DÉSACTIVE : le type est système et porte 42 congés.
        "/api/conges/types/t1": { corps: { desactive: true, conges: 42, systeme: true } },
      },
    });
    await page.goto("/conges");
    await page.getByRole("navigation", { name: "Sections des congés" }).getByRole("link", {
      name: "Types de congés",
    }).click();
    await page.getByRole("button", { name: "Désactiver Congés annuels" }).click();

    // `cadrage/02`, état « Suppression d'un type utilisé » : le chiffre est
    // dans la question, pas seulement dans la réponse.
    await expect(
      page.getByText(
        "« Congés annuels » est utilisé par 42 congés. Il sera désactivé au lieu d'être supprimé. Continuer ?",
      ),
    ).toBeVisible();

    await page.getByRole("dialog").getByRole("button", { name: "Désactiver", exact: true }).click();

    await expect(page.getByText("Type désactivé — 42 congés le conservent.")).toBeVisible();
    // Le mot qui serait faux : rien n'a été supprimé.
    await expect(page.getByText("Type supprimé.")).toHaveCount(0);
  });

  test("RG-CNG-31 — un type qu'AUCUN congé n'emploie annonce bien une suppression, et le retour le confirme", async ({
    page,
  }) => {
    await serveur(page, {
      session: HUGO,
      reponses: {
        ...reponses,
        // RTT : ni système, ni utilisé — le serveur supprime pour de bon.
        "/api/conges/types/t2": { corps: { desactive: false, conges: 0, systeme: false } },
      },
    });
    await page.goto("/conges");
    await page.getByRole("navigation", { name: "Sections des congés" }).getByRole("link", {
      name: "Types de congés",
    }).click();
    await page.getByRole("button", { name: "Désactiver RTT" }).click();

    await expect(
      page.getByText(
        "« RTT » n'est utilisé par aucun congé : il sera supprimé définitivement. Continuer ?",
      ),
    ).toBeVisible();

    await page.getByRole("dialog").getByRole("button", { name: "Supprimer", exact: true }).click();
    await expect(page.getByText("Type supprimé.")).toBeVisible();
  });

  test("RG-CNG-30 — la pastille « Système » porte, au survol, ce qui reste modifiable", async ({
    page,
  }) => {
    await serveur(page, { session: HUGO, reponses });
    await page.goto("/conges");
    await page.getByRole("navigation", { name: "Sections des congés" }).getByRole("link", {
      name: "Types de congés",
    }).click();

    await expect(page.getByText("Système", { exact: true })).toHaveAttribute(
      "title",
      "Type système : seuls le nom, la description, l'icône, la couleur et la validation requise peuvent être modifiés.",
    );
  });

  /**
   * `RG-CNG-16` — « le nombre de jours est calculé en jours ouvrés : week-ends
   * exclus, jours fériés non ouvrés exclus ».
   *
   * Du lundi 7 au dimanche 13 septembre : **sept jours de calendrier, cinq
   * jours ouvrés**. L'écart entre les deux chiffres est toute la preuve — une
   * découpe de chaîne au client ne peut donner que sept.
   */
  test("RG-CNG-16 — le décompte en jours ouvrés vient du SERVEUR : les samedis ne comptent pas", async ({
    page,
  }) => {
    const appels: string[] = [];
    await serveur(page, {
      session: CAMILLE,
      reponses: { ...reponses, "/api/parametrage/jours-ouvres": { corps: JOURS_OUVRES_SEMAINE } },
    });
    page.on("request", (r) => {
      if (new URL(r.url()).pathname === "/api/parametrage/jours-ouvres") appels.push(r.url());
    });
    await page.goto("/conges");
    await page.getByRole("button", { name: "Nouvelle demande" }).click();
    await page.getByLabel("Type de congé").selectOption("t1");
    await page.getByLabel("Date de début").fill("2026-09-07");
    await page.getByLabel("Date de fin").fill("2026-09-13");

    await expect(page.getByText("5 jours ouvrés")).toBeVisible();
    // Sept jours de calendrier : le chiffre que le client produirait seul.
    await expect(page.getByText("7 jours")).toHaveCount(0);
    // Et c'est bien la plage saisie qui a été soumise au décompte.
    await expect.poll(() => appels.at(-1) ?? "").toContain("debut=2026-09-07");
    expect(appels.at(-1)).toContain("fin=2026-09-13");
  });

  /**
   * `RG-CNG-17` — « une demi-journée peut être précisée en début et en fin de
   * période ; le décompte en tient compte au demi-jour près ». Le demi-jour se
   * retranche au serveur, et **seulement si le jour concerné est ouvrable** :
   * la vue n'a pas de quoi le savoir, elle transmet.
   */
  test("RG-CNG-17 — la demi-journée choisie part au décompte serveur, elle n'est pas devinée à l'écran", async ({
    page,
  }) => {
    const appels: string[] = [];
    await serveur(page, {
      session: CAMILLE,
      reponses: { ...reponses, "/api/parametrage/jours-ouvres": { corps: JOURS_OUVRES_SEMAINE } },
    });
    page.on("request", (r) => {
      if (new URL(r.url()).pathname === "/api/parametrage/jours-ouvres") appels.push(r.url());
    });
    await page.goto("/conges");
    await page.getByRole("button", { name: "Nouvelle demande" }).click();
    await page.getByLabel("Type de congé").selectOption("t1");
    await page.getByLabel("Date de début").fill("2026-09-07");
    await page.getByLabel("Date de fin").fill("2026-09-13");
    await expect.poll(() => appels.length).toBeGreaterThan(0);

    await page.getByLabel("Demi-journée de début").selectOption("morning");
    await expect.poll(() => appels.at(-1) ?? "").toContain("demiJourneeDebut=true");
    // La demi-journée de FIN n'a pas été choisie : elle ne part pas.
    expect(appels.at(-1)).not.toContain("demiJourneeFin");
  });

  test("RG-CNG-19 — la répartition par année vient du serveur, et le pied de fenêtre la chiffre", async ({
    page,
  }) => {
    await serveur(page, { session: CAMILLE, reponses });
    await page.goto("/conges");
    await page.getByRole("button", { name: "Nouvelle demande" }).click();
    await page.getByLabel("Type de congé").selectOption("t1");
    await page.getByLabel("Date de début").fill("2026-12-28");
    await page.getByLabel("Date de fin").fill("2027-01-03");

    // Quatre jours ouvrés sur sept de calendrier, deux de chaque côté du
    // 1er janvier : ni la coupure d'année ni les week-ends ne se devinent.
    await expect(page.getByText("4 jours ouvrés · répartis sur 2 années civiles")).toBeVisible();
    await expect(page.getByText("Cette demande")).toHaveCount(2);
    await expect(page.getByText("2,0 j", { exact: true })).toHaveCount(2);
  });
});

test.describe("Vue 20 — télétravail", () => {
  const reponses = {
    "/api/teletravail/regles": { corps: REGLES_TELETRAVAIL },
    "/api/teletravail": { corps: PLANNING_TELETRAVAIL },
  };

  test("l'explication du geste est dans le flux, pas au survol", async ({ page }) => {
    await serveur(page, { session: CAMILLE, reponses });
    await page.goto("/teletravail");

    await expect(page.getByText(/Cliquez sur un jour pour faire évoluer sa déclaration/)).toBeVisible();
  });

  test("la légende nomme les six apparences", async ({ page }) => {
    await serveur(page, { session: CAMILLE, reponses });
    await page.goto("/teletravail");

    for (const etat of [
      "Télétravail",
      "Bureau (déclaré)",
      "Non déclaré",
      "Week-end",
      "Télétravail récurrent",
      "Exception",
    ]) {
      await expect(page.getByText(etat, { exact: true }).first()).toBeVisible();
    }
  });

  test("chaque case dit son état en toutes lettres, pas seulement en couleur", async ({ page }) => {
    await serveur(page, { session: CAMILLE, reponses });
    await page.goto("/teletravail");

    // Une grille qui ne parlerait qu'en couleur serait muette pour qui ne la voit pas.
    await expect(page.getByRole("button", { name: /— Télétravail$/ }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /— Non déclaré$/ }).first()).toBeVisible();
  });

  test("un jour issu d'une règle porte son marqueur, en plus de son état", async ({ page }) => {
    await serveur(page, { session: CAMILLE, reponses });
    await page.goto("/teletravail");
    await expect(page.getByText(/Récurrent/).first()).toBeVisible();
  });

  /*
   * `EX-TLT-02` — modifier un jour engendré par une règle en fait une
   * EXCEPTION, et l'exception se surajoute à l'état, elle ne le remplace pas.
   * Le jeu d'essai porte un 11 août à la fois `issuDeRegle` et `exception`.
   */
  test("une exception à une règle porte son propre marqueur", async ({ page }) => {
    await serveur(page, { session: CAMILLE, reponses });
    await page.goto("/teletravail");
    await expect(page.getByText("⌁ Exception").first()).toBeVisible();
  });

  test("les règles se relisent en langage naturel", async ({ page }) => {
    await serveur(page, { session: CAMILLE, reponses });
    await page.goto("/teletravail");
    await page.getByRole("button", { name: "Configurer jours fixes" }).click();

    // « Tous les mardis à partir du 01/03/2026 » se relit ; un couple
    // (jourSemaine, dateDebut) se déchiffre.
    await expect(page.getByText("Tous les Mardi à partir du 01/03/2026")).toBeVisible();
    await expect(page.getByText("Tous les Jeudi du 05/01/2026 au 30/06/2026")).toBeVisible();
    // Une règle inactive reste visible : elle explique un calendrier qui a changé.
    await expect(page.getByText("Règle inactive")).toBeVisible();
  });

  test("état vide des règles", async ({ page }) => {
    await serveur(page, {
      session: CAMILLE,
      reponses: { ...reponses, "/api/teletravail/regles": { corps: [] } },
    });
    await page.goto("/teletravail");
    await page.getByRole("button", { name: "Configurer jours fixes" }).click();
    await expect(page.getByText("Aucun jour fixe configuré")).toBeVisible();
  });
});

test.describe("Vue 21 — temps passé", () => {
  const reponses = { ...PROJETS_VIDES, "/api/temps": { corps: SAISIES } };

  test("le total et le compte sont en tête", async ({ page }) => {
    await serveur(page, { session: CAMILLE, reponses });
    await page.goto("/temps");

    await expect(page.getByRole("heading", { name: "Temps passé", level: 1 })).toBeVisible();
    await expect(page.getByText("3 entrées")).toBeVisible();
    await expect(page.getByText("17,5 h au total")).toBeVisible();
  });

  test("les saisies sont groupées par jour, avec le total et le plafond", async ({ page }) => {
    await serveur(page, { session: CAMILLE, reponses });
    await page.goto("/temps");

    // Le plafond est journalier, et le dépassement est CHIFFRÉ : « dépasse le
    // plafond de 1,5 h », pas « dépassé ». Sans le compte, il faut recompter.
    await expect(page.getByText("13,5 h", { exact: true })).toBeVisible();
    await expect(page.getByText("dépasse le plafond de 1,5 h")).toBeVisible();
    await expect(page.getByRole("progressbar", { name: /Remplissage du 12/ })).toBeVisible();
  });

  test("le hors-projet est nommé, et une saisie pour un tiers le dit", async ({ page }) => {
    await serveur(page, { session: CAMILLE, reponses });
    await page.goto("/temps");

    await expect(page.getByText("Hors projet")).toBeVisible();
    await expect(page.getByText("◇ Presta SA")).toBeVisible();
  });

  test("RG-TMP-01 — ni tâche ni projet est refusé sans aller-retour", async ({ page }) => {
    await serveur(page, { session: CAMILLE, reponses });
    await page.goto("/temps");
    await page.getByRole("button", { name: "Saisir du temps" }).click();
    await page.getByLabel("Durée en heures").fill("3");
    await page.getByRole("button", { name: "Enregistrer" }).click();

    await expect(page.getByText("Une tâche ou un projet doit être spécifié.")).toBeVisible();
  });

  test("la tâche dépend du projet, et le dit", async ({ page }) => {
    await serveur(page, { session: CAMILLE, reponses });
    await page.goto("/temps");
    await page.getByRole("button", { name: "Saisir du temps" }).click();

    await expect(page.getByLabel("Tâche")).toBeDisabled();
    await expect(
      page.getByRole("option", { name: "Sélectionnez d'abord un projet" }),
    ).toBeAttached();
  });

  test("la suppression rappelle que l'acteur ne se corrige pas", async ({ page }) => {
    await serveur(page, { session: CAMILLE, reponses });
    await page.goto("/temps");
    await page.getByRole("button", { name: /Supprimer la saisie du 12/ }).first().click();

    // RG-TMP-03 — corriger l'acteur en place réécrirait l'histoire de deux
    // personnes : il faut supprimer et recréer, et la fenêtre le dit.
    await expect(page.getByText("La personne d'une saisie ne se corrige pas")).toBeVisible();
  });

  test("état vide", async ({ page }) => {
    await serveur(page, {
      session: CAMILLE,
      reponses: {
        ...reponses,
        "/api/temps": {
          corps: { saisies: [], cumul: { entrees: 0, heures: 0, plafondJournalier: 12 } },
        },
      },
    });
    await page.goto("/temps");

    await expect(page.getByText("Aucune entrée de temps")).toBeVisible();
    await expect(page.getByRole("button", { name: "Saisir votre première entrée" })).toBeVisible();
  });
});
