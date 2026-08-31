import { test, expect, type Page } from "@playwright/test";
import { serveur } from "./fixtures/projets.js";
import { UTILISATEURS } from "./fixtures/administration.js";
import {
  CAMILLE,
  FATOU,
  HUGO,
  HUGO_SANS_ATTRIBUTION,
  EVENEMENTS,
  TYPES_CONGE,
  SOLDES,
  SOLDE_T1_2026,
  SOLDE_T3_2026,
  VALIDATEUR,
  SANS_VALIDATEUR,
  DEMANDES,
  DEMANDE_ANNULATION,
  DEMANDE_TYPE_DESACTIVE,
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
    /* `EX-CNG-09` — le SOLDE de la fenêtre de demande vient de la route par
       type depuis L-47 : `/api/conges/soldes` sert la carte de tête, celle-ci
       sert le bloc « Contrôle du solde ». Deux routes, deux jeux de chiffres
       délibérément distincts — c'est ce qui rend lisible qui sert quoi. */
    "/api/conges/solde": { corps: SOLDE_T1_2026 },
  };

  /*
   * `EX-CNG-10` — l'onglet Soldes lit le catalogue des soldes ET l'annuaire :
   * `userId: null` vaut le défaut global, mais choisir un agent demande de
   * savoir lesquels existent. La route est `GET /utilisateurs`, gardée par
   * `users:read`, et elle rend un TABLEAU — pas `{ utilisateurs }`.
   */
  const reponsesSoldes = { ...reponses, "/api/utilisateurs": { corps: UTILISATEURS } };

  /** Un onglet se vise toujours DANS sa barre de sections, jamais nu. */
  const ouvrirSoldes = async (page: Page) => {
    await page
      .getByRole("navigation", { name: "Sections des congés" })
      .getByRole("link", { name: "Soldes" })
      .click();
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

  test("Hugo voit tout, types et soldes compris", async ({ page }) => {
    await serveur(page, { session: HUGO, reponses: reponsesSoldes });
    await page.goto("/conges");

    /* « Camille en voit un, Hugo en voit six » — `cadrage/02` § vue 19. Le
       sixième est « Soldes » depuis l'arbitrage du 2026-08-31 : la vue rend les
       deux listes de délégations dans un seul onglet, là où l'énumération de la
       section en comptait deux. */
    const onglets = page.getByRole("navigation", { name: "Sections des congés" }).getByRole("link");
    await expect(onglets).toHaveCount(6);
    await expect(page.getByRole("link", { name: "Types de congés" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Soldes" })).toBeVisible();
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

    /* Le corps distingue les deux issues — c'est tout le contrat de la route —
       et porte la version lue, que `RG-GEN-07` exige sur chaque écriture. */
    expect(corps).toEqual([
      { accepte: true, version: DEMANDE_ANNULATION.version },
      { accepte: false, version: DEMANDE_ANNULATION.version },
    ]);
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

  test("RG-CNG-19 — CHAQUE année montre SON solde, pas celui de l'année courante", async ({
    page,
  }) => {
    /*
     * **Défaut trouvé et corrigé.** Le bloc bouclait sur les années et rendait à
     * chaque tour le MÊME objet solde, celui de l'année en cours. Une demande du
     * 28/12 au 03/01 affichait « Année 2027 » avec les chiffres de 2026 — trois
     * lignes sur quatre fausses, sous un intitulé qui affirmait le contraire.
     *
     * Le décompte de jours, lui, était juste : c'est ce qui rendait l'erreur
     * crédible. Et elle mentait dans le sens rassurant — l'année suivante
     * paraissait toujours avoir le solde plein de l'année courante. Le contrôle
     * serveur (`RG-CNG-21`) n'a jamais été trompé ; c'est l'écran qui mentait.
     */
    await serveur(page, {
      session: CAMILLE,
      reponses: {
        ...reponses,
        // 2026 : 10 disponibles. 2027 : une allocation neuve, 25 disponibles.
        // Chaque année a SA réponse, sur la route qui prend une année en
        // paramètre — c'est la seule façon de les distinguer à l'écran.
        "/api/conges/solde?typeId=t1&annee=2026": {
          corps: { annee: 2026, attribues: 25, consommes: 12, engages: 3, disponibles: 10 },
        },
        "/api/conges/solde?typeId=t1&annee=2027": {
          corps: { annee: 2027, attribues: 25, consommes: 0, engages: 0, disponibles: 25 },
        },
      },
    });
    await page.goto("/conges");
    await page.getByRole("button", { name: "Nouvelle demande" }).click();
    await page.getByLabel("Type de congé").selectOption("t1");
    await page.getByLabel("Date de début").fill("2026-12-28");
    await page.getByLabel("Date de fin").fill("2027-01-03");

    const blocs = page.locator(".cb-year");
    await expect(blocs).toHaveCount(2);

    /*
     * On vise la LIGNE, pas le bloc : « 25,0 » figure déjà comme *attribués*
     * dans les deux années, et une assertion au niveau du bloc passait donc
     * avec ET sans le correctif — elle ne mesurait rien. C'est le piège que ce
     * dépôt paie à répétition, et il vient de se présenter une fois de plus.
     */
    const ligne = (n: number, libelle: string) =>
      blocs.nth(n).locator(".cb-line").filter({ hasText: libelle }).locator("b");

    // 2026 : 12 consommés sur 25, il reste 10. 2027 : allocation neuve.
    await expect(ligne(0, "Déjà utilisés")).toHaveText("12,0");
    await expect(ligne(1, "Déjà utilisés")).toHaveText("0,0");
    await expect(ligne(0, "Disponible")).toHaveText("10,0");
    await expect(ligne(1, "Disponible")).toHaveText("25,0");
  });

  // ── L-47 — deux des trois capacités qu'aucun écran n'atteignait ───────────

  /**
   * `EX-CNG-09` — « Consulter son solde par type et par année ».
   *
   * Deux routes servent des soldes et ne rendent pas le même ensemble :
   * `GET /conges/soldes` rend le CATALOGUE des types actifs pour une année,
   * `GET /conges/solde` rend UN type pour UNE année. La fenêtre de demande
   * connaît son type : c'est la seconde qui la sert.
   *
   * Le contrôle les fait se contredire volontairement — la carte de tête dit
   * 25 attribués, la route par type en dit 30 — et regarde qui parle où. Avec
   * des chiffres identiques il passerait au vert quelle que soit la route
   * appelée, c'est-à-dire sans rien mesurer.
   */
  test("EX-CNG-09 — le contrôle de solde de la fenêtre vient de la route PAR TYPE, pas du catalogue de l'année", async ({
    page,
  }) => {
    await serveur(page, {
      session: CAMILLE,
      reponses: {
        ...reponses,
        "/api/parametrage/jours-ouvres": { corps: JOURS_OUVRES_SEMAINE },
        "/api/conges/solde": { corps: SOLDE_T1_2026 },
      },
    });
    await page.goto("/conges");

    // La carte de tête, elle, lit bien le catalogue : 25 attribués sur t1.
    await expect(page.getByText("Total 25")).toBeVisible();

    await page.getByRole("button", { name: "Nouvelle demande" }).click();
    await page.getByLabel("Type de congé").selectOption("t1");
    await page.getByLabel("Date de début").fill("2026-09-07");
    await page.getByLabel("Date de fin").fill("2026-09-11");

    const bloc = page.locator(".cb-year");
    await expect(bloc).toHaveCount(1);
    const ligne = (libelle: string) =>
      bloc.first().locator(".cb-line").filter({ hasText: libelle }).locator("b");

    /*
     * On vise la LIGNE, jamais le bloc : « 30,0 » et « 9,0 » sont les seuls
     * chiffres que le catalogue ne porte pas, et une assertion large les
     * trouverait ailleurs sur la page. Les trois lignes viennent de la même
     * réponse, donc les trois doivent basculer ensemble.
     */
    await expect(ligne("Attribués 2026")).toHaveText("30,0");
    await expect(ligne("Déjà utilisés")).toHaveText("21,0");
    await expect(ligne("Disponible")).toHaveText("9,0");
  });

  /**
   * `RG-CNG-29` — **le cas que le catalogue ne peut pas servir.**
   *
   * `GET /conges/soldes` boucle sur `leaveType where actif: true`. Un type
   * désactivé n'y figure donc pas — alors que `RG-CNG-29` conserve les congés
   * posés dessus et que `EX-CNG-05` les laisse modifier. La fenêtre cherchait
   * son type dans une liste qui ne le contenait plus, ne trouvait rien, et le
   * bloc « Contrôle du solde » **disparaissait entièrement** : l'agent
   * corrigeait ses dates à l'aveugle, pendant que `RG-CNG-21` continuait de
   * décider au serveur.
   */
  test("RG-CNG-29 — une demande sur un type DÉSACTIVÉ garde son contrôle de solde à la modification", async ({
    page,
  }) => {
    await serveur(page, {
      session: CAMILLE,
      reponses: {
        ...reponses,
        // `t3` n'est ni dans `TYPES_CONGE` ni dans `SOLDES` : le référentiel
        // actif et le catalogue de soldes l'ignorent tous les deux.
        "/api/conges": { corps: [DEMANDE_TYPE_DESACTIVE] },
        "/api/parametrage/jours-ouvres": { corps: JOURS_OUVRES_SEMAINE },
        "/api/conges/solde": { corps: SOLDE_T3_2026 },
      },
    });
    await page.goto("/conges");

    await page.getByRole("button", { name: "Modifier" }).click();
    await expect(page.getByText("Contrôle du solde")).toBeVisible();

    const bloc = page.locator(".cb-year");
    await expect(bloc).toHaveCount(1);
    const ligne = (libelle: string) =>
      bloc.first().locator(".cb-line").filter({ hasText: libelle }).locator("b");

    await expect(ligne("Attribués 2026")).toHaveText("6,0");
    await expect(ligne("Disponible")).toHaveText("5,0");
  });

  /**
   * `RG-CNG-08` / `RG-ORG-05` — **qui** validera, nommé.
   *
   * Le validateur n'est pas devinable depuis l'écran : trois branches le
   * déterminent — manager du service, à défaut responsable du département, à
   * défaut personne — et une délégation active (`RG-CNG-10`) peut y
   * substituer quelqu'un d'autre, à la date. La maquette le nomme depuis
   * l'origine (« soumise à validation par Fatou Berthier ») ; le produit
   * retombait sur « votre responsable », c'est-à-dire sur la formule qui
   * n'engage personne.
   */
  test("RG-CNG-08 / RG-ORG-05 — la fenêtre de demande NOMME le validateur que le serveur a déterminé", async ({
    page,
  }) => {
    await serveur(page, {
      session: CAMILLE,
      reponses: {
        ...reponses,
        "/api/parametrage/jours-ouvres": { corps: JOURS_OUVRES_SEMAINE },
        "/api/conges/solde": { corps: SOLDE_T1_2026 },
        "/api/conges/validateur": { corps: VALIDATEUR },
      },
    });
    await page.goto("/conges");

    await page.getByRole("button", { name: "Nouvelle demande" }).click();
    // `t1` exige une validation ; `t2` est auto-approuvé et n'en annonce aucune.
    await page.getByLabel("Type de congé").selectOption("t1");
    await page.getByLabel("Date de début").fill("2026-09-07");

    /*
     * L'assertion est bornée à la mention elle-même. « Fatou Berthier » figure
     * déjà sur chaque ligne de la liste, en colonne « Validateur » : la
     * chercher sur la page entière la trouverait avec ET sans le correctif.
     */
    const mention = page.locator(".alert-neutral");
    await expect(mention).toContainText(
      "Votre demande sera soumise à validation par Fatou Berthier.",
    );
    // Et plus la formule générique : la nommer OU la taire, pas les deux.
    await expect(mention).not.toContainText("votre responsable");
  });

  /**
   * Le cas de refus de la règle précédente, et il compte autant.
   *
   * `determinerValidateur` rend `null` quand ni le service ni le département
   * ne désignent quelqu'un : la demande ira alors à un détenteur de la
   * permission de gestion globale, que le serveur ne nomme pas. L'écran doit
   * retomber sur la formule générique — **inventer un nom serait pire que de
   * n'en donner aucun.**
   */
  test("RG-CNG-08 — sans validateur déterminé à cette date, la mention ne nomme personne", async ({
    page,
  }) => {
    await serveur(page, {
      session: CAMILLE,
      reponses: {
        ...reponses,
        "/api/parametrage/jours-ouvres": { corps: JOURS_OUVRES_SEMAINE },
        "/api/conges/solde": { corps: SOLDE_T1_2026 },
        "/api/conges/validateur": { corps: SANS_VALIDATEUR },
      },
    });
    await page.goto("/conges");

    await page.getByRole("button", { name: "Nouvelle demande" }).click();

    /*
     * La formule générique est aussi celle que la vue affichait AVANT d'appeler
     * la route : s'en tenir à elle ferait passer ce contrôle au vert sans que
     * rien n'ait été demandé au serveur — il ne mesurerait rien. On exige donc
     * l'appel lui-même, et sa date : `RG-CNG-08` se détermine À LA DATE,
     * puisqu'une délégation (`RG-CNG-10`) a un début et une fin.
     */
    const appel = page.waitForRequest(
      (r) => new URL(r.url()).pathname === "/api/conges/validateur",
    );
    await page.getByLabel("Type de congé").selectOption("t1");
    await page.getByLabel("Date de début").fill("2026-09-07");
    expect(new URL((await appel).url()).searchParams.get("date")).toBe("2026-09-07");

    const mention = page.locator(".alert-neutral");
    await expect(mention).toContainText(
      "Votre demande sera soumise à validation par votre responsable.",
    );
    // Aucun nom : le serveur n'en a pas donné, l'écran n'en fabrique pas.
    await expect(mention).not.toContainText("Fatou");
  });

  /*
   * ───────────────────────────────────────────────────────────────────────────
   * `EX-CNG-10`, `RG-CNG-24` — le sixième onglet : Soldes.
   *
   * `PUT /conges/soldes` existait, gardée et testée, et aucun écran ne
   * l'appelait : sur une instance neuve tous les soldes valaient zéro, donc
   * `RG-CNG-20` refusait toute demande. `cadrage/02` § vue 19 se contredisait,
   * et l'arbitrage y est désormais écrit — c'est la ligne « Variantes » qui
   * l'emporte, seule des deux à décrire ce que voit un détenteur de
   * `leaves:manage_balances`.
   * ───────────────────────────────────────────────────────────────────────────
   */
  test("EX-CNG-10 — l'onglet Soldes n'apparaît qu'avec `leaves:manage_balances`", async ({
    page,
  }) => {
    // Fatou valide et délègue : elle n'attribue pas. L'onglet n'est pas là.
    await serveur(page, { session: FATOU, reponses });
    await page.goto("/conges");
    const sections = page.getByRole("navigation", { name: "Sections des congés" });
    await expect(sections.getByRole("link", { name: "Soldes" })).toHaveCount(0);

    // Hugo administre : il en voit six, le sixième étant celui-ci.
    await serveur(page, { session: HUGO, reponses: reponsesSoldes });
    await page.goto("/conges");
    await expect(sections.getByRole("link")).toHaveCount(6);
    await expect(sections.getByRole("link", { name: "Soldes" })).toBeVisible();
  });

  test("EX-CNG-10 — attribuer des jours à UN AGENT compose `PUT /conges/soldes` avec sa version", async ({
    page,
  }) => {
    await serveur(page, { session: HUGO, reponses: reponsesSoldes });
    const envoi = page.waitForRequest(
      (r) => new URL(r.url()).pathname === "/api/conges/soldes" && r.method() === "PUT",
    );
    await page.goto("/conges");
    await ouvrirSoldes(page);
    // Un agent, donc l'allocation PROPRE — et sa version, telle que la lecture
    // la rend : `SOLDES[0].solde.propre.version` vaut 4.
    await page.getByLabel("Bénéficiaire").selectOption("u-autre");
    await page.getByLabel("Congés annuels", { exact: true }).fill("27");
    await page.getByRole("button", { name: "Enregistrer le solde de Congés annuels" }).click();

    expect((await envoi).postDataJSON()).toEqual({
      userId: "u-autre",
      typeId: "t1",
      annee: 2026,
      joursAttribues: 27,
      version: 4,
    });
    await expect(page.getByText("Le solde de Congés annuels est enregistré.")).toBeVisible();
  });

  test("RG-CNG-24 — le DÉFAUT GLOBAL est un cas nominal : `userId` part à `null`", async ({
    page,
  }) => {
    await serveur(page, { session: HUGO, reponses: reponsesSoldes });
    const envoi = page.waitForRequest(
      (r) => new URL(r.url()).pathname === "/api/conges/soldes" && r.method() === "PUT",
    );
    await page.goto("/conges");
    await ouvrirSoldes(page);
    // Le bénéficiaire par défaut est « Défaut global » : rien à choisir.
    await expect(page.getByLabel("Bénéficiaire")).toHaveValue("");
    await page.getByLabel("Congés annuels", { exact: true }).fill("22");
    await page.getByRole("button", { name: "Enregistrer le solde de Congés annuels" }).click();

    // `userId: null`, et la version du DÉFAUT GLOBAL — 2 —, pas celle de
    // l'allocation propre. Les deux ne se corrigent pas au même endroit.
    expect((await envoi).postDataJSON()).toEqual({
      userId: null,
      typeId: "t1",
      annee: 2026,
      joursAttribues: 22,
      version: 2,
    });
  });

  test("RG-CNG-24 — l'écran DIT si le chiffre vient de l'allocation propre ou du défaut global", async ({
    page,
  }) => {
    await serveur(page, { session: HUGO, reponses: reponsesSoldes });
    await page.goto("/conges");
    await ouvrirSoldes(page);
    await page.getByLabel("Bénéficiaire").selectOption("u-autre");

    // `SOLDES[0]` porte une allocation propre, `SOLDES[1]` n'en a pas.
    await expect(page.getByText("Allocation propre à cet agent.")).toBeVisible();
    await expect(
      page.getByText(
        "Aucune allocation propre : cet agent hérite du défaut global, soit 12,0 j. Enregistrer ici lui en crée une.",
      ),
    ).toBeVisible();
  });

  test("RG-CNG-23 — une allocation modifiée entre-temps se rend en message rédigé", async ({
    page,
  }) => {
    await serveur(page, { session: HUGO, reponses: reponsesSoldes });
    /*
     * Le harnais choisit sa réponse au CHEMIN seul : stubber `/api/conges/soldes`
     * en 409 couperait aussi la LECTURE, et l'onglet se rendrait vide — le test
     * mesurerait alors une page absente, pas un conflit. L'interception vise
     * donc le verbe, et laisse passer le reste par `fallback()`.
     */
    await page.route(
      (url) => url.pathname === "/api/conges/soldes",
      (route) =>
        route.request().method() === "PUT"
          ? route.fulfill({
              status: 409,
              contentType: "application/json",
              body: JSON.stringify({
                cle: "erreurs:allocationModifiee",
                message: "allocation_modifiee",
              }),
            })
          : route.fallback(),
    );
    await page.goto("/conges");
    await ouvrirSoldes(page);
    await page.getByLabel("Congés annuels", { exact: true }).fill("30");
    await page.getByRole("button", { name: "Enregistrer le solde de Congés annuels" }).click();

    // Le message est rédigé et actionnable, pas un code technique (`RG-GEN-03`).
    await expect(
      page.getByText("Le solde a changé depuis votre lecture. Rechargez la demande avant de valider."),
    ).toBeVisible();
  });

  /**
   * `RG-GEN-06` — « une action interdite est **masquée** ou désactivée avec
   * explication ».
   *
   * Ici, c'est **masquée**, et au grain le plus large : l'onglet entier. Un
   * profil sans `leaves:manage_balances` n'a rien à attribuer, donc rien à
   * comprendre — la variante « désactivée avec explication » sert quand
   * l'action a du sens mais pas maintenant, ce qui n'est pas ce cas.
   *
   * Le test dit exactement ce qu'il mesure : l'onglet n'est pas proposé. Il ne
   * prétend PAS mesurer l'infobulle d'`ActionProtegee`, que la commande porte
   * pourtant — cette branche-là est inatteignable depuis cette vue tant que
   * l'onglet est gardé par la même permission. Voir le compte rendu : c'est une
   * question remontée, pas un oubli.
   */
  test("RG-GEN-06 — sans `leaves:manage_balances`, l'onglet Soldes n'est pas proposé du tout", async ({
    page,
  }) => {
    // Le profil se construit à la main : aucun rôle du catalogue ne détient
    // `users:read` et `leaves:manage_types` sans `leaves:manage_balances`.
    await serveur(page, { session: HUGO_SANS_ATTRIBUTION, reponses: reponsesSoldes });
    await page.goto("/conges");
    const sections = page.getByRole("navigation", { name: "Sections des congés" });
    await expect(sections.getByRole("link", { name: "Soldes" })).toHaveCount(0);
    // Et les cinq autres restent : c'est bien l'onglet qui tombe, pas la vue.
    await expect(sections.getByRole("link")).toHaveCount(5);
  });

  test("RG-GEN-04 — le référentiel des types vide se rend rédigé, avec sa sortie", async ({
    page,
  }) => {
    await serveur(page, {
      session: HUGO,
      reponses: { ...reponsesSoldes, "/api/conges/types": { corps: [] } },
    });
    await page.goto("/conges");
    await page.getByRole("navigation", { name: "Sections des congés" }).getByRole("link", {
      name: "Types de congés",
    }).click();

    await expect(page.getByText("Aucun type de congé actif", { exact: true })).toBeVisible();
    await expect(
      page.getByText(
        "Le référentiel des types porte ce que les agents peuvent demander. Sans lui, aucune demande n'est possible.",
      ),
    ).toBeVisible();
    // La sortie : les types désactivés sont peut-être là, et on le propose.
    await expect(page.getByRole("button", { name: "Afficher les inactifs" })).toBeVisible();
  });

  test("RG-GEN-04 — l'onglet Soldes sans type actif se rend rédigé, avec sa sortie", async ({
    page,
  }) => {
    await serveur(page, {
      session: HUGO,
      reponses: { ...reponsesSoldes, "/api/conges/soldes": { corps: [] } },
    });
    await page.goto("/conges");
    await ouvrirSoldes(page);

    await expect(page.getByText("Aucun type de congé actif", { exact: true })).toBeVisible();
    await expect(
      page.getByText(
        "Il n'y a rien à attribuer tant que le référentiel des types est vide. Créez-en un dans l'onglet Types de congés.",
      ),
    ).toBeVisible();
  });

  /*
   * ───────────────────────────────────────────────────────────────────────────
   * `RG-GEN-07` — la version lue accompagne CHAQUE écriture de la vue 19.
   *
   * Aucune des six mutations ne la transmettait, alors que `GET /conges` la
   * rend sur chaque ligne depuis toujours. Le serveur ne l'exigeait pas non
   * plus : deux moitiés cohérentes entre elles et fausses ensemble, qu'aucune
   * boucle ne pouvait départager.
   * ───────────────────────────────────────────────────────────────────────────
   */
  test("RG-GEN-07 — l'approbation transmet la version LUE de la demande", async ({ page }) => {
    await serveur(page, {
      session: FATOU,
      reponses: { ...reponses, [`/api/conges/${DEMANDES[0].id}/approuver`]: { corps: {} } },
    });
    const envoi = page.waitForRequest(
      (r) => new URL(r.url()).pathname === `/api/conges/${DEMANDES[0].id}/approuver`,
    );
    await page.goto("/conges");
    await page.getByRole("navigation", { name: "Sections des congés" }).getByRole("link", {
      name: "À valider",
    }).click();
    await page.getByRole("button", { name: "Approuver", exact: true }).first().click();

    expect((await envoi).postDataJSON()).toEqual({ version: DEMANDES[0].version });
  });

  test("RG-GEN-07 — le refus transmet la version, en plus de son motif", async ({ page }) => {
    await serveur(page, {
      session: FATOU,
      reponses: { ...reponses, [`/api/conges/${DEMANDES[0].id}/refuser`]: { corps: {} } },
    });
    const envoi = page.waitForRequest(
      (r) => new URL(r.url()).pathname === `/api/conges/${DEMANDES[0].id}/refuser`,
    );
    await page.goto("/conges");
    await page.getByRole("navigation", { name: "Sections des congés" }).getByRole("link", {
      name: "À valider",
    }).click();
    await page.getByRole("button", { name: "Refuser", exact: true }).first().click();
    await page.getByLabel("Motif du refus").fill("Effectif insuffisant");
    await page.getByRole("button", { name: "Confirmer le refus" }).click();

    expect((await envoi).postDataJSON()).toEqual({
      motifRefus: "Effectif insuffisant",
      version: DEMANDES[0].version,
    });
  });

  test("RG-GEN-07 — la suppression porte la version en paramètre de requête", async ({ page }) => {
    await serveur(page, {
      session: CAMILLE,
      reponses: { ...reponses, [`/api/conges/${DEMANDES[0].id}`]: { corps: {} } },
    });
    const envoi = page.waitForRequest(
      (r) =>
        new URL(r.url()).pathname === `/api/conges/${DEMANDES[0].id}` && r.method() === "DELETE",
    );
    await page.goto("/conges");
    await page.getByRole("button", { name: "Supprimer", exact: true }).first().click();

    expect(new URL((await envoi).url()).searchParams.get("version")).toBe(
      String(DEMANDES[0].version),
    );
  });

  test("RG-GEN-07 — la demande d'annulation transmet la version du congé approuvé", async ({
    page,
  }) => {
    await serveur(page, {
      session: CAMILLE,
      reponses: { ...reponses, [`/api/conges/${DEMANDES[1].id}/annulation`]: { corps: {} } },
    });
    const envoi = page.waitForRequest(
      (r) => new URL(r.url()).pathname === `/api/conges/${DEMANDES[1].id}/annulation`,
    );
    await page.goto("/conges");
    await page.getByRole("button", { name: "Demander l'annulation" }).first().click();

    expect((await envoi).postDataJSON()).toEqual({ version: DEMANDES[1].version });
  });

  test("RG-GEN-07 — le traitement d'une annulation transmet la version, en plus de `accepte`", async ({
    page,
  }) => {
    await serveur(page, {
      session: FATOU,
      reponses: {
        ...reponses,
        "/api/conges": { corps: [DEMANDE_ANNULATION] },
        [`/api/conges/${DEMANDE_ANNULATION.id}/annulation/traiter`]: { corps: {} },
      },
    });
    const envoi = page.waitForRequest(
      (r) =>
        new URL(r.url()).pathname === `/api/conges/${DEMANDE_ANNULATION.id}/annulation/traiter`,
    );
    await page.goto("/conges");
    await page.getByRole("navigation", { name: "Sections des congés" }).getByRole("link", {
      name: "À valider",
    }).click();
    await page.getByRole("button", { name: "Accepter l'annulation" }).click();

    expect((await envoi).postDataJSON()).toEqual({
      accepte: true,
      version: DEMANDE_ANNULATION.version,
    });
  });

  test("RG-GEN-07 — la modification transmet la version : c'est le seul garde-fou d'une demande restée en attente", async ({
    page,
  }) => {
    await serveur(page, {
      session: CAMILLE,
      reponses: {
        ...reponses,
        "/api/parametrage/jours-ouvres": { corps: JOURS_OUVRES_SEMAINE },
        [`/api/conges/${DEMANDES[0].id}`]: { corps: {} },
      },
    });
    const envoi = page.waitForRequest(
      (r) =>
        new URL(r.url()).pathname === `/api/conges/${DEMANDES[0].id}` && r.method() === "PATCH",
    );
    await page.goto("/conges");
    await page.getByRole("button", { name: "Modifier", exact: true }).first().click();
    await page.getByLabel("Date de fin").fill("2026-09-10");
    await page.getByRole("button", { name: "Enregistrer" }).click();

    expect((await envoi).postDataJSON()).toMatchObject({ version: DEMANDES[0].version });
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
