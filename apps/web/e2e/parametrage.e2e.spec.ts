import { test, expect, type Locator, type Page } from "@playwright/test";
import { serveur, SESSION_LECTURE } from "./fixtures/projets.js";
import {
  SESSION_ACTIVITE,
  SESSION_CONFIG,
  SESSION_CONFIG_LECTURE,
  REGLAGES,
  REGLAGES_UN_JOUR,
  FERIES,
  FERIES_VIDE,
  VACANCES,
  ROLES,
  MATRICE_PERSONNALISE,
  MATRICE_SYSTEME,
  AUDIT,
  AUDIT_VIDE,
  FACETTES_AUDIT,
  PREDEFINIES,
  PREDEFINIES_AVEC_INACTIVE,
  JOUR_A_DECLARER,
  calendrierQuiRetient,
} from "./fixtures/parametrage.js";
import { SEMAINE } from "./fixtures/planning.js";

/**
 * L-37 — vues 31, 32, 33 et 34.
 *
 * Les points d'attention des briefs sont vérifiés tels qu'ils sont écrits :
 * « un paramètre à effet de bord lointain », « masquer les croisements
 * invalides plutôt que les afficher désactivés », « aucune action de
 * modification ni de suppression, même désactivée », « la prévisualisation en
 * langage naturel de la règle est indispensable ».
 */

/**
 * Un survol que `react-aria` reconnaît.
 *
 * `locator.hover()` fait apparaître le pointeur sur la cible d'un seul coup ;
 * `useHover` ignore ce premier événement et l'infobulle ne s'ouvre pas. On
 * arrive donc de l'extérieur, puis on bouge d'un pixel sur place — ce que fait
 * une vraie main. Sans cette précaution, un contrôle d'infobulle échoue sur le
 * geste, pas sur le produit.
 */
async function survoler(page: Page, cible: Locator) {
  const boite = await cible.boundingBox();
  if (!boite) throw new Error("la cible du survol n'a pas de boîte");
  const x = boite.x + boite.width / 2;
  const y = boite.y + boite.height / 2;
  await page.mouse.move(x - 40, y - 40);
  await page.mouse.move(x, y);
  await page.mouse.move(x + 1, y);
}

// ── Vue 31 ──────────────────────────────────────────────────────────────────

test.describe("Vue 31 — paramètres", () => {
  const reponses = {
    "/api/parametrage": { corps: REGLAGES },
    "/api/parametrage/feries": { corps: FERIES },
    "/api/parametrage/vacances": { corps: VACANCES },
  };

  test("chaque format se choisit sur un EXEMPLE, pas sur son code", async ({ page }) => {
    await serveur(page, { session: SESSION_CONFIG, reponses });
    await page.goto("/parametres");

    await expect(page.getByRole("heading", { name: "Paramètres", level: 1 })).toBeVisible();
    // « AAAA-MM-JJ » ne dit rien ; « 2025-12-31 » se lit.
    await expect(page.getByText("31/12/2025")).toBeVisible();
    await expect(page.getByText("2025-12-31")).toBeVisible();
    await expect(page.getByText("mercredi 31 décembre 2025")).toBeVisible();
    await expect(page.getByText("02:30 PM")).toBeVisible();
  });

  test("les modifications non enregistrées sont annoncées EN PERMANENCE", async ({ page }) => {
    await serveur(page, { session: SESSION_CONFIG, reponses });
    await page.goto("/parametres");

    // Rien tant que rien n'a bougé : le bandeau n'est pas décoratif.
    await expect(page.getByText("Vous avez des modifications non enregistrées.")).toHaveCount(0);

    await page.getByRole("button", { name: /12\/31\/2025/ }).click();
    await expect(page.getByText("Vous avez des modifications non enregistrées.")).toBeVisible();
    // Il survit au changement d'onglet : quatre onglets se remplissent en
    // plusieurs minutes, une alerte fugace n'y survivrait pas.
    await page.getByRole("link", { name: "Vacances scolaires" }).click();
    await expect(page.getByText("Vous avez des modifications non enregistrées.")).toBeVisible();

    await page.getByRole("button", { name: "Annuler les modifications" }).click();
    await expect(page.getByText("Vous avez des modifications non enregistrées.")).toHaveCount(0);
  });

  test("RG-PRM-02 — un férié OUVRÉ dit sa conséquence sur le décompte des congés", async ({
    page,
  }) => {
    await serveur(page, { session: SESSION_CONFIG, reponses });
    await page.goto("/parametres");
    await page.getByRole("link", { name: "Jours fériés" }).click();

    await expect(page.getByText("Lundi de Pentecôte")).toBeVisible();
    // La bascule porte son libellé, et l'indicateur dit ce que le réglage
    // change ailleurs : découvrir la conséquence sur un solde faux serait
    // l'apprentissage le plus cher possible.
    await expect(page.getByText("Compté travaillé")).toBeVisible();
    await expect(
      page.getByText("Comptés comme travaillés dans le décompte des congés"),
    ).toBeVisible();
    await expect(page.getByText("25/05/2026")).toBeVisible();
  });

  test("aucun férié : l'état vide dit par où sortir", async ({ page }) => {
    await serveur(page, {
      session: SESSION_CONFIG,
      reponses: { ...reponses, "/api/parametrage/feries": { corps: FERIES_VIDE } },
    });
    await page.goto("/parametres");
    await page.getByRole("link", { name: "Jours fériés" }).click();

    await expect(page.getByText(/Aucun jour férié déclaré pour \d{4}/)).toBeVisible();
    await expect(page.getByText(/Importez le calendrier officiel/)).toBeVisible();
    // RG-GEN-04 : l'état vide propose l'action, il ne la sous-entend pas.
    await expect(page.getByRole("button", { name: /Importer fériés FR/ })).toBeVisible();
  });

  test("RG-PRM-01 — le dernier jour visible refuse d'être ôté", async ({ page }) => {
    await serveur(page, {
      session: SESSION_CONFIG,
      reponses: { ...reponses, "/api/parametrage": { corps: REGLAGES_UN_JOUR } },
    });
    await page.goto("/parametres");
    await page
      .getByRole("navigation", { name: "Sections des paramètres" })
      .getByRole("link", { name: "Planning" })
      .click();

    await expect(page.getByRole("button", { name: /Mer/ })).toBeDisabled();
    await expect(page.getByRole("button", { name: /Jeu/ })).toBeEnabled();
    await expect(page.getByText("Au moins un jour doit rester sélectionné.")).toBeVisible();
  });

  test("la source des vacances distingue import officiel et saisie manuelle", async ({ page }) => {
    await serveur(page, { session: SESSION_CONFIG, reponses });
    await page.goto("/parametres");
    await page.getByRole("link", { name: "Vacances scolaires" }).click();

    await expect(page.getByText("Vacances de la Toussaint")).toBeVisible();
    // Les deux ne se corrigent pas de la même façon.
    await expect(page.getByText("Import officiel")).toBeVisible();
    await expect(page.getByText("Saisie manuelle")).toBeVisible();
    await expect(page.getByText("Zone B · 2026-2027").first()).toBeVisible();
  });

  /**
   * `M19 § Jours fériés` — « Créer […] un jour ».
   *
   * **Ce test ne regarde pas ce qui a été enregistré : il regarde l'effet.**
   * Le jour déclaré doit se voir là où les jours fériés COMPTENT — la trame de
   * fond du planning, qui vient du même calendrier au serveur —, pas seulement
   * dans la liste qui vient de le rendre. C'est le piège consigné de cette
   * vue, payé deux lots pleins : « un réglage qui s'enregistre n'est pas un
   * réglage qui s'applique ».
   *
   * Deux effets sont mesurés, et aucun n'est la persistance :
   *
   *   1. **Sur place** — les compteurs « Total », « Jours chômés » et
   *      « Jours ouvrés » suivent. Un compteur resté juste à côté d'une ligne
   *      neuve est le symptôme exact du réglage qui s'enregistre sans
   *      s'appliquer, et il exige la relecture du calendrier.
   *   2. **Ailleurs** — la trame de fond du planning grise le jour. C'est là
   *      que les jours fériés comptent.
   *
   * L'horloge est figée : sans elle, « aujourd'hui » se déplace, l'année par
   * défaut de l'onglet change au 31 décembre et le contrôle devient saisonnier.
   */
  test("M19 — un jour férié déclaré change LA TRAME DU PLANNING, pas seulement la liste", async ({
    page,
  }) => {
    await page.clock.setFixedTime(new Date("2026-08-12T09:00:00.000Z"));
    await serveur(page, { session: SESSION_CONFIG, reponses });
    const envoi = await calendrierQuiRetient(page, SEMAINE);

    // 1. Le planning d'abord : le jeudi 13 août n'est pas férié, il est en
    //    vacances scolaires. Sa cellule de bandeau le dit.
    await page.goto("/planning");
    const bandeau = page.locator(".pl-bandcell");
    // Cinq colonnes et non sept : `planning.visibleDays` vaut « 1,2,3,4,5 »
    // dans `REGLAGES`, donc du lundi au vendredi. La quatrième est le jeudi 13.
    await expect(bandeau).toHaveCount(5);
    await expect(bandeau.nth(3)).toHaveClass(/is-vac/);
    await expect(bandeau.nth(3)).not.toHaveClass(/is-ferie/);

    // 2. On déclare le jour depuis la vue 31, SANS recharger la page : c'est
    //    le cache déjà rempli du planning qu'on veut mettre en défaut.
    await page
      .getByRole("navigation", { name: "Navigation principale" })
      .getByRole("link", { name: "Paramètres" })
      .click();
    await page.getByRole("link", { name: "Jours fériés" }).click();
    // L'état d'avant, chiffré : quatre fériés, trois chômés.
    const compteur = (titre: string) =>
      page.locator(".kpi").filter({ hasText: titre }).locator(".kpi-val");
    await expect(compteur("Total jours fériés")).toHaveText("4");
    await expect(compteur("Jours chômés")).toHaveText("3");

    await page.getByRole("button", { name: "Ajouter un jour" }).click();
    await page.getByLabel("Date").fill(JOUR_A_DECLARER);
    await page.getByLabel("Libellé").fill("Fermeture exceptionnelle");
    await page.getByRole("button", { name: "Ajouter", exact: true }).click();

    // Les deux drapeaux à effet voyagent : sans eux, le serveur enregistre un
    // jour qui ne change rien.
    await expect.poll(() => envoi()).toMatchObject({
      date: JOUR_A_DECLARER,
      libelle: "Fermeture exceptionnelle",
      ouvre: false,
      recurrent: true,
    });
    // `exact` : la confirmation d'action reprend le libellé, et un `getByText`
    // nu résoudrait deux éléments — la ligne du calendrier et le message.
    await expect(page.getByText("Fermeture exceptionnelle", { exact: true })).toBeVisible();
    // L'effet sur place : les compteurs ont bougé, pas seulement la liste.
    await expect(compteur("Total jours fériés")).toHaveText("5");
    await expect(compteur("Jours chômés")).toHaveText("4");

    // 3. Retour au planning : la trame de fond a suivi.
    await page
      .getByRole("navigation", { name: "Navigation principale" })
      .getByRole("link", { name: "Planning" })
      .click();
    await expect(page.locator(".pl-bandcell").nth(3)).toHaveClass(/is-ferie/);
    await expect(page.locator(".pl-bandcell.is-ferie")).toHaveText(["Férié"]);
  });

  /**
   * `RG-PRM-01` — « un jour férié marqué *ouvré* compte comme jour travaillé
   * dans le décompte des congés ».
   *
   * Le brief nomme ce réglage « un paramètre à effet de bord lointain ». La
   * conséquence est donc dite au moment du geste, et le drapeau voyage : un
   * formulaire qui le laisserait tomber créerait un jour chômé là où on
   * demandait un jour travaillé, et le solde de congés s'en apercevrait seul.
   */
  test("RG-PRM-01 — un férié déclaré OUVRÉ dit sa conséquence et reste hors des jours chômés", async ({
    page,
  }) => {
    await page.clock.setFixedTime(new Date("2026-08-12T09:00:00.000Z"));
    await serveur(page, { session: SESSION_CONFIG, reponses });
    const envoi = await calendrierQuiRetient(page, SEMAINE);

    await page.goto("/parametres");
    await page.getByRole("link", { name: "Jours fériés" }).click();
    await page.getByRole("button", { name: "Ajouter un jour" }).click();

    // Tant que la case est décochée, l'avertissement n'existe pas : il n'est
    // pas décoratif.
    await expect(page.getByText("Conséquence sur le décompte des congés")).toHaveCount(0);
    await page.getByRole("checkbox", { name: "Jour ouvré" }).check();
    await expect(page.getByText("Conséquence sur le décompte des congés")).toBeVisible();
    await expect(page.getByText(/consommera un jour de plus/)).toBeVisible();

    await page.getByLabel("Date").fill(JOUR_A_DECLARER);
    await page.getByLabel("Libellé").fill("Journée de solidarité");
    await page.getByRole("button", { name: "Ajouter", exact: true }).click();

    await expect.poll(() => envoi()).toMatchObject({ ouvre: true });
    // Et l'effet : il compte au bloc « Jours ouvrés », pas aux chômés.
    await expect(page.getByText("Compté travaillé").nth(1)).toBeVisible();

    // Le planning ne le grise PAS : un férié travaillé n'est pas un jour chômé.
    await page
      .getByRole("navigation", { name: "Navigation principale" })
      .getByRole("link", { name: "Planning" })
      .click();
    await expect(page.locator(".pl-bandcell").nth(3)).not.toHaveClass(/is-ferie/);
  });

  /**
   * `RG-PRM-04` — « les dates de vacances scolaires sont cohérentes : fin
   * postérieure au début ».
   */
  test("RG-PRM-04 — une période dont la fin précède le début ne part pas", async ({ page }) => {
    let envoye = false;
    await serveur(page, { session: SESSION_CONFIG, reponses });
    await page.route(
      (url) => url.pathname === "/api/parametrage/vacances",
      (route) => {
        if (route.request().method() !== "POST") return route.fallback();
        envoye = true;
        return route.fulfill({ status: 201, contentType: "application/json", body: "{}" });
      },
    );
    await page.goto("/parametres");
    await page.getByRole("link", { name: "Vacances scolaires" }).click();
    await page.getByRole("button", { name: "Ajouter une période" }).click();

    await page.getByLabel("Libellé").fill("Vacances de printemps");
    await page.getByLabel("Début").fill("2027-04-26");
    await page.getByLabel("Fin").fill("2027-04-10");
    await page.getByLabel("Zone").fill("B");
    await page.getByLabel("Année scolaire").fill("2026-2027");

    await expect(
      page.getByText("La date de fin doit être postérieure à la date de début."),
    ).toBeVisible();
    await page.getByRole("button", { name: "Ajouter", exact: true }).click();
    // Le refus qui compte est celui du serveur ; celui-ci ÉVITE l'aller-retour.
    await expect.poll(() => envoye).toBe(false);

    // Corrigée, la période part — et porte sa zone, que la maquette n'avait pas.
    await page.getByLabel("Fin").fill("2027-04-30");
    await expect(
      page.getByText("La date de fin doit être postérieure à la date de début."),
    ).toHaveCount(0);
    await page.getByRole("button", { name: "Ajouter", exact: true }).click();
    await expect.poll(() => envoye).toBe(true);
  });

  test("sans droit d'écriture, la vue reste crédible : lecture sans boutons", async ({ page }) => {
    await serveur(page, { session: SESSION_CONFIG_LECTURE, reponses });
    await page.goto("/parametres");

    await expect(page.getByRole("heading", { name: "Paramètres", level: 1 })).toBeVisible();
    // RG-GEN-06 : une action interdite n'est pas proposée puis refusée.
    await expect(page.getByRole("button", { name: "Enregistrer" })).toHaveCount(0);
    await page.getByRole("link", { name: "Jours fériés" }).click();
    await expect(page.getByRole("button", { name: /Importer fériés FR/ })).toHaveCount(0);
    // Ni « Ajouter un jour » : elle est absente, pas grisée.
    await expect(page.getByRole("button", { name: "Ajouter un jour" })).toHaveCount(0);
    await page.getByRole("link", { name: "Vacances scolaires" }).click();
    await expect(page.getByRole("button", { name: "Ajouter une période" })).toHaveCount(0);
  });

  test("sans settings:read, l'accès est refusé — et le dit", async ({ page }) => {
    await serveur(page, { session: SESSION_LECTURE, reponses });
    await page.goto("/parametres");
    await expect(page.getByText("Permission requise")).toBeVisible();
  });
});

// ── Vue 32 ──────────────────────────────────────────────────────────────────

test.describe("Vue 32 — rôles et permissions", () => {
  const reponses = {
    "/api/administration/roles": { corps: ROLES },
    "/api/administration/roles/r-agent/matrice": { corps: MATRICE_PERSONNALISE },
    "/api/administration/roles/r-admin/matrice": { corps: MATRICE_SYSTEME },
  };

  test("la liste distingue rôle système et rôle personnalisé", async ({ page }) => {
    await serveur(page, { session: SESSION_CONFIG, reponses });
    await page.goto("/roles");

    await expect(page.getByRole("heading", { name: "Gestion des rôles", level: 1 })).toBeVisible();
    await expect(page.getByText("Agent de projet")).toBeVisible();
    await expect(page.getByText("Système")).toBeVisible();
    await expect(page.getByText("Personnalisé")).toBeVisible();
  });

  /**
   * `EX-ADM-03` — « supprimer un rôle non système ».
   *
   * La vue créait, ouvrait et modifiait les permissions d'un rôle ; elle n'en
   * supprimait aucun. `DELETE /administration/roles/:id` existait depuis L-08 et
   * n'était appelée par personne — la maquette 32 pose pourtant le bouton dans le
   * même `.lv-acts`.
   */
  test("EX-ADM-03 — un rôle personnalisé se supprime, un rôle système non", async ({ page }) => {
    let supprime: string | null = null;
    await serveur(page, { session: SESSION_CONFIG, reponses });
    await page.route(
      (url) => /\/api\/administration\/roles\/[^/]+$/.test(url.pathname),
      (route) => {
        if (route.request().method() !== "DELETE") return route.fallback();
        supprime = new URL(route.request().url()).pathname.split("/").pop() ?? null;
        return route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
      },
    );
    await page.goto("/roles");

    const boutons = page.getByRole("button", { name: "Supprimer", exact: true });
    await expect(boutons).toHaveCount(2);
    // `RG-DROITS-02` — le rôle système est désactivé, par courtoisie, et dit pourquoi.
    await expect(boutons.nth(0)).toBeDisabled();
    await expect(boutons.nth(1)).toBeEnabled();
    // « Dit pourquoi » n'était pas tenu : l'infobulle était posée sur un bouton
    // nativement désactivé, qui ne reçoit aucun survol. Elle s'ouvre désormais.
    await survoler(page, boutons.nth(0));
    await expect(page.getByRole("tooltip")).toHaveText(
      "Les rôles système ne peuvent pas être supprimés.",
    );

    await boutons.nth(1).click();
    await expect.poll(() => supprime).toBe("r-agent");
  });

  /**
   * `EX-ADM-02` — « créer un rôle, **éventuellement à partir d'un modèle** ».
   *
   * `POST /administration/roles` existait depuis L-08 et n'était appelée par
   * personne : le produit ne savait créer aucun rôle hors des 26 posés par
   * l'amorçage. Le modèle est envoyé par son **code** ; c'est le serveur qui
   * recopie ses permissions, jamais le client (`RG-DROITS-03`).
   */
  test("EX-ADM-02 — un rôle se crée à partir d'un modèle, dont le code part au serveur", async ({
    page,
  }) => {
    let envoi: Record<string, unknown> | null = null;
    await serveur(page, { session: SESSION_CONFIG, reponses });
    await page.route(
      (url) => url.pathname === "/api/administration/roles",
      (route) => {
        if (route.request().method() !== "POST") return route.fallback();
        envoi = route.request().postDataJSON() as Record<string, unknown>;
        return route.fulfill({
          status: 201,
          contentType: "application/json",
          body: JSON.stringify({ id: "r-neuf", code: envoi.code, nom: envoi.nom }),
        });
      },
    );
    await page.goto("/roles");
    await page.getByRole("button", { name: "Créer un rôle" }).click();

    await page.getByLabel("Nom", { exact: false }).first().fill("Référent applicatif");
    await page.getByLabel("Code").fill("REFERENT_APPLICATIF");

    // Les 26 modèles viennent du contrat partagé, groupés par famille.
    await expect(page.getByRole("button", { name: /^ADMIN_DELEGATED/ })).toBeVisible();
    await page.getByRole("searchbox", { name: "Partir d'un modèle" }).fill("délégué");
    // La recherche porte sur le code ET la description, pas sur le seul code.
    await expect(page.getByRole("button", { name: /^ADMIN_DELEGATED/ })).toBeVisible();
    await page.getByRole("button", { name: /^ADMIN_DELEGATED/ }).click();
    await expect(page.getByText("Modèle retenu : ADMIN_DELEGATED")).toBeVisible();

    await page.getByRole("button", { name: "Créer le rôle" }).click();
    await expect.poll(() => envoi).toMatchObject({
      nom: "Référent applicatif",
      code: "REFERENT_APPLICATIF",
      depuisModele: "ADMIN_DELEGATED",
    });
  });

  /**
   * `RG-DROITS-01` — « un modèle est un point de départ, pas une contrainte ».
   * Créer sans modèle est donc un parcours légitime, et le serveur ne doit pas
   * recevoir de `depuisModele` fantôme.
   */
  test("RG-DROITS-01 — un rôle se crée SANS modèle, et rien de fantôme n'est envoyé", async ({
    page,
  }) => {
    let envoi: Record<string, unknown> | null = null;
    await serveur(page, { session: SESSION_CONFIG, reponses });
    await page.route(
      (url) => url.pathname === "/api/administration/roles",
      (route) => {
        if (route.request().method() !== "POST") return route.fallback();
        envoi = route.request().postDataJSON() as Record<string, unknown>;
        return route.fulfill({
          status: 201,
          contentType: "application/json",
          body: JSON.stringify({ id: "r-neuf", code: "SUR_MESURE", nom: "Sur mesure" }),
        });
      },
    );
    await page.goto("/roles");
    await page.getByRole("button", { name: "Créer un rôle" }).click();
    await page.getByLabel("Nom", { exact: false }).first().fill("Sur mesure");
    await page.getByLabel("Code").fill("SUR_MESURE");
    await expect(page.getByText("Aucun modèle : la matrice partira vide")).toBeVisible();
    await page.getByRole("button", { name: "Créer le rôle" }).click();

    await expect.poll(() => envoi).toEqual({ nom: "Sur mesure", code: "SUR_MESURE" });
  });

  /** Un code mal formé se dit à la saisie ; le refus reste au serveur. */
  test("EX-ADM-02 — un code hors format ne part pas, et la raison est écrite", async ({ page }) => {
    let envoye = false;
    await serveur(page, { session: SESSION_CONFIG, reponses });
    await page.route(
      (url) => url.pathname === "/api/administration/roles",
      (route) => {
        if (route.request().method() !== "POST") return route.fallback();
        envoye = true;
        return route.fulfill({ status: 201, contentType: "application/json", body: "{}" });
      },
    );
    await page.goto("/roles");
    await page.getByRole("button", { name: "Créer un rôle" }).click();
    await page.getByLabel("Nom", { exact: false }).first().fill("Référent");
    // Le champ met en capitales, mais le tiret n'est pas au format du serveur.
    await page.getByLabel("Code").fill("referent-applicatif");
    await page.getByRole("button", { name: "Créer le rôle" }).click();

    await expect(
      page.getByText("Le code s'écrit en capitales et soulignés, de deux à quarante caractères."),
    ).toBeVisible();
    await expect.poll(() => envoye).toBe(false);
  });

  /**
   * `EX-ADM-03` — « modifier un rôle ». `RG-DROITS-02` — « les rôles système
   * ne sont ni supprimables **ni renommables** ».
   *
   * La suppression suivait déjà ce motif : commande visible, désactivée, avec
   * son explication au survol. Le renommage le suit à la lettre — la moitié de
   * la règle qui manquait au produit.
   */
  test("EX-ADM-03, RG-DROITS-02 — un rôle personnalisé se renomme, un rôle système non", async ({
    page,
  }) => {
    let envoi: { chemin: string; corps: unknown } | null = null;
    await serveur(page, { session: SESSION_CONFIG, reponses });
    await page.route(
      (url) => /\/api\/administration\/roles\/[^/]+$/.test(url.pathname),
      (route) => {
        if (route.request().method() !== "PATCH") return route.fallback();
        envoi = {
          chemin: new URL(route.request().url()).pathname,
          corps: route.request().postDataJSON(),
        };
        return route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
      },
    );
    await page.goto("/roles");

    const boutons = page.getByRole("button", { name: "Renommer", exact: true });
    await expect(boutons).toHaveCount(2);
    // ADMIN est système : la commande existe, elle est refusée, et elle le dit.
    await expect(boutons.nth(0)).toBeDisabled();
    await expect(boutons.nth(1)).toBeEnabled();
    // Le motif est ATTEINT, pas seulement écrit dans la source. Il l'était : un
    // `<button disabled>` ne reçoit ni survol ni focus, donc son infobulle ne
    // s'ouvrait jamais — la commande était désactivée SANS explication.
    await survoler(page, boutons.nth(0));
    await expect(page.getByRole("tooltip")).toHaveText(
      "Les rôles système ne peuvent pas être renommés.",
    );

    // Le rôle personnalisé, lui, se renomme — et seul le NOM part : le code
    // identifie le rôle ailleurs, il ne se reprend pas.
    await boutons.nth(1).click();
    const champ = page.getByRole("dialog").getByLabel("Nom", { exact: false });
    await expect(champ).toHaveValue("Agent de projet");
    await champ.fill("Chef de projet");
    await page.getByRole("button", { name: "Enregistrer", exact: true }).click();

    await expect.poll(() => envoi).toEqual({
      chemin: "/api/administration/roles/r-agent",
      corps: { nom: "Chef de projet" },
    });
  });

  test("LES CROISEMENTS INVALIDES N'EXISTENT PAS — ils ne sont pas grisés", async ({ page }) => {
    await serveur(page, { session: SESSION_CONFIG, reponses });
    await page.goto("/roles");
    await page.getByRole("button", { name: "Ouvrir", exact: true }).nth(1).click();

    // On n'« approuve » pas un projet : aucune case, pas une case désactivée.
    // Une case désactivée laisserait croire à un droit qu'on n'a pas.
    await expect(page.getByRole("button", { name: /^Projets — Approuver/ })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^Tâches — Approuver/ })).toHaveCount(0);
    // Un congé, lui, s'approuve : la case existe et elle est accordée.
    const approbation = page.getByRole("button", { name: /^Congés — Approuver/ });
    await expect(approbation).toHaveCount(1);
    await expect(approbation).toHaveAttribute("aria-pressed", "true");

    // 4 modules × 5 actions = 20 cases possibles, 3 croisements inexistants.
    await expect(page.getByText("17 croisements valides sur 20 possibles")).toBeVisible();
  });

  test("l'écart au dernier enregistrement est montré AVANT d'enregistrer", async ({ page }) => {
    await serveur(page, { session: SESSION_CONFIG, reponses });
    await page.goto("/roles");
    await page.getByRole("button", { name: "Ouvrir", exact: true }).nth(1).click();

    const enregistrer = page.getByRole("button", { name: "Enregistrer les permissions" });
    await expect(enregistrer).toBeDisabled();

    await page.getByRole("button", { name: /^Projets — Supprimer/ }).click();
    await expect(page.getByText("+1 permission")).toBeVisible();
    await expect(page.getByText("−0 permission")).toBeVisible();
    await expect(enregistrer).toBeEnabled();

    // Retirer une permission détenue bascule l'autre compteur.
    await page.getByRole("button", { name: /^Congés — Approuver/ }).click();
    await expect(page.getByText("−1 permission")).toBeVisible();
  });

  test("un rôle système est en lecture seule, et dit comment le décliner", async ({ page }) => {
    await serveur(page, { session: SESSION_CONFIG, reponses });
    await page.goto("/roles");
    await page.getByRole("button", { name: "Ouvrir", exact: true }).first().click();

    await expect(page.getByText(/Dupliquez-le pour en créer une variante/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Enregistrer les permissions" })).toBeDisabled();
    await expect(page.getByRole("button", { name: /^Congés — Approuver/ })).toBeDisabled();
  });

  test("la couverture par module précède le détail", async ({ page }) => {
    await serveur(page, { session: SESSION_CONFIG, reponses });
    await page.goto("/roles");
    await page.getByRole("button", { name: "Ouvrir", exact: true }).nth(1).click();

    // 3 permissions détenues sur 4 croisements existants pour les projets.
    await expect(page.getByText("3/4")).toBeVisible();
    await expect(
      page.getByRole("progressbar", { name: "Couverture du module Projets" }),
    ).toBeVisible();
  });

  test("sans users:manage_roles, l'accès est refusé", async ({ page }) => {
    await serveur(page, { session: SESSION_LECTURE, reponses });
    await page.goto("/roles");
    await expect(page.getByText("Permission requise")).toBeVisible();
  });
});

// ── Vue 33 ──────────────────────────────────────────────────────────────────

test.describe("Vue 33 — journal d'audit", () => {
  const reponses = {
    "/api/administration/audit": { corps: AUDIT },
    "/api/administration/audit/facettes": { corps: FACETTES_AUDIT },
  };

  test("AUCUNE AFFORDANCE D'ÉCRITURE N'EXISTE, même désactivée", async ({ page }) => {
    await serveur(page, { session: SESSION_CONFIG, reponses });
    await page.goto("/audit");
    await expect(page.getByRole("heading", { name: "Journal d'audit", level: 1 })).toBeVisible();

    // C'est l'assertion centrale de cette vue : l'absence totale, pas la
    // désactivation. Elle porte sur TOUS les boutons de la page, pas sur
    // ceux d'une ligne — un bouton d'écriture ajouté ailleurs échouerait ici.
    const ecriture = page
      .getByRole("button")
      .filter({ hasText: /Supprimer|Modifier|Créer|Enregistrer|Éditer|Archiver/ });
    await expect(ecriture).toHaveCount(0);
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });

  test("la garantie de lecture seule est ÉNONCÉE, pas devinée", async ({ page }) => {
    await serveur(page, { session: SESSION_CONFIG, reponses });
    await page.goto("/audit");

    await expect(page.getByText("Registre en lecture seule")).toBeVisible();
    await expect(page.getByText(/n'a que les droits de lecture et d'insertion/)).toBeVisible();
  });

  test("EX-ADM-09 — le système, l'humain et le compte supprimé se distinguent", async ({
    page,
  }) => {
    await serveur(page, { session: SESSION_CONFIG, reponses });
    await page.goto("/audit");

    // Le nom est visé DANS LE CONTENU : depuis que la coquille affiche
    // l'identité de la personne connectée — comme la maquette le demande —,
    // « Hugo Nguyen » figure aussi dans le menu utilisateur. Un `getByText`
    // nu attrape les deux et échoue en mode strict.
    await expect(page.locator("#contenu").getByText("Hugo Nguyen")).toBeVisible();
    await expect(page.getByText("Système", { exact: true })).toBeVisible();
    // L'entrée survit à la personne : c'est le point d'un journal.
    await expect(page.getByText("Compte supprimé")).toBeVisible();
  });

  test("l'action est traduite ET son code reste lisible", async ({ page }) => {
    await serveur(page, { session: SESSION_CONFIG, reponses });
    await page.goto("/audit");

    /*
     * Le libellé paraît DEUX fois : dans la ligne du journal et dans la
     * liste déroulante de filtre, que la vue a gagnée. On vise la ligne —
     * `getByText` nu résoudrait deux éléments et ferait échouer le contrôle
     * sur une ambiguïté, pas sur un défaut.
     */
    await expect(page.locator("span.au-lab", { hasText: "Congé approuvé" })).toBeVisible();
    // Le code brut sert au support, la traduction sert à la lecture.
    // Le code apparaît aussi dans la liste déroulante de filtre, qui est
    // repliée : on vise la ligne du journal, pas l'option.
    await expect(page.locator("span.au-code", { hasText: "leave.approve" })).toBeVisible();
    await expect(page.getByText("Assignations générées")).toBeVisible();
  });

  test("la pagination est par curseur, et sait où elle commence", async ({ page }) => {
    await serveur(page, { session: SESSION_CONFIG, reponses });
    await page.goto("/audit");

    await expect(page.getByRole("button", { name: "Précédent" })).toBeDisabled();
    await expect(page.getByText("Page 1")).toBeVisible();
    await page.getByRole("button", { name: "Suivant" }).click();
    await expect(page.getByText("Page 2")).toBeVisible();
    await expect(page.getByRole("button", { name: "Précédent" })).toBeEnabled();
  });

  test("un filtre sans résultat a son propre état vide", async ({ page }) => {
    await serveur(page, {
      session: SESSION_CONFIG,
      reponses: { ...reponses, "/api/administration/audit": { corps: AUDIT_VIDE } },
    });
    await page.goto("/audit");

    await expect(page.getByText("Aucun événement", { exact: true })).toBeVisible();
    await expect(page.getByText("Aucun événement ne correspond aux filtres actifs.")).toBeVisible();
    // « Réinitialiser » et « Réinitialiser les filtres » cohabitent : sans
    // `exact`, le sélecteur en trouve deux et échoue sur l'ambiguïté.
    await expect(
      page.getByRole("button", { name: "Réinitialiser", exact: true }),
    ).toBeVisible();
  });

  test("sans audit:read, l'accès est refusé — et ce refus est lui-même tracé", async ({ page }) => {
    await serveur(page, { session: SESSION_LECTURE, reponses });
    await page.goto("/audit");
    await expect(page.getByText("Permission requise")).toBeVisible();
  });
});

// ── Vue 34 ──────────────────────────────────────────────────────────────────

test.describe("Vue 34 — tâches prédéfinies", () => {
  const reponses = {
    "/api/activite/taches": { corps: PREDEFINIES },
    "/api/activite/taches?inclureInactives=true": { corps: PREDEFINIES_AVEC_INACTIVE },
  };

  test("LA RÈGLE SE LIT EN UNE PHRASE, pas en champs", async ({ page }) => {
    await serveur(page, { session: SESSION_CONFIG, reponses });
    await page.goto("/taches-predefinies");

    await expect(
      page.getByRole("heading", { name: "Tâches prédéfinies", level: 1 }),
    ).toBeVisible();
    // « type: weekly, frequence: 1, jourSemaine: 2 » ne se relit pas.
    await expect(page.getByText("Chaque mardi")).toBeVisible();
    await expect(page.getByText("Le 31 de chaque mois")).toBeVisible();
    await expect(page.getByText("Le 3e mardi de chaque mois")).toBeVisible();
    // La règle porte sa fenêtre d'application.
    /*
     * « À partir du » est un LIBELLÉ DE FORMULAIRE dans la maquette 34, pas la
     * phrase d'une carte de règle : celle-ci dit « sans date de fin » quand la
     * règle n'en a pas. Le contrôle consacrait un rendu que la maquette ne
     * montre nulle part.
     */
    await expect(page.getByText("sans date de fin").first()).toBeVisible();
    // La carte de règle porte sa BORNE DE FIN, pas un intervalle : la maquette
    // met la date de début dans le formulaire, jamais dans la phrase.
    await expect(page.getByText("jusqu'au 31/12/2026").first()).toBeVisible();
  });

  test("RG-ACT-04 — le 31 dit ce qu'il devient dans un mois qui n'en a pas", async ({ page }) => {
    await serveur(page, { session: SESSION_CONFIG, reponses });
    await page.goto("/taches-predefinies");

    await expect(
      page.getByText("Si le jour n'existe pas, l'assignation est ramenée au dernier jour du mois."),
    ).toBeVisible();
  });

  test("le poids est doublé de son libellé — un chiffre seul ne dit rien", async ({ page }) => {
    await serveur(page, { session: SESSION_CONFIG, reponses });
    await page.goto("/taches-predefinies");

    await expect(page.getByText("Lourde", { exact: true })).toBeVisible();
    await expect(page.getByText("Légère", { exact: true })).toBeVisible();
    // La jauge elle-même s'annonce, elle n'est pas qu'un ornement.
    await expect(page.getByRole("img", { name: "Poids 4 sur 5 — Lourde" })).toBeVisible();
  });

  test("RG-ACT-02 — un créneau montre ses horaires sans ouvrir la fiche", async ({ page }) => {
    await serveur(page, { session: SESSION_CONFIG, reponses });
    await page.goto("/taches-predefinies");

    // Le nom apparaît deux fois : au catalogue et sous la phrase de règle.
    await expect(page.getByText("Permanence accueil").first()).toBeVisible();
    // La maquette sépare les horaires par une FLÈCHE (`t.h1 + ' → ' + t.h2`),
    // pas par un tiret. Le contrôle figeait l'ancien rendu.
    await expect(page.getByText("08:30 → 12:30")).toBeVisible();
    // « Demi-journée » paraît deux fois : en pastille de la tâche et dans la
    // phrase de sa règle. `exact` vise la pastille.
    await expect(page.getByText("Demi-journée", { exact: true })).toBeVisible();
    await expect(page.getByText("Sur site")).toBeVisible();
  });

  test("RG-ACT-05 — une tâche désactivée reste au catalogue, avec ses assignations", async ({
    page,
  }) => {
    // Session AVEC écriture : sans `predefined_tasks:update`, `RG-GEN-06`
    // masque les commandes et la fenêtre qui porte le compte n'existe pas.
    await serveur(page, { session: SESSION_ACTIVITE, reponses });
    await page.goto("/taches-predefinies");

    // Absente tant qu'on ne la demande pas…
    await expect(page.getByText("Astreinte week-end")).toHaveCount(0);
    await page.getByRole("checkbox", { name: "Afficher les inactives" }).check();

    // …et retrouvée avec ses 118 assignations passées : la faire disparaître
    // les rattacherait à un objet introuvable.
    await expect(page.getByText("Astreinte week-end")).toBeVisible();
    await expect(page.getByText("Inactive", { exact: true }).first()).toBeVisible();
    /*
     * Le compte d'assignations n'est plus une colonne : la maquette 34 nomme
     * la septième « Actions », et la colonne « Assignations » avait été
     * inventée. Le chiffre se lit désormais là où il DÉCIDE — dans la fenêtre
     * de désactivation, qui dit ce qu'elle conserve (`RG-ACT-05`).
     */
    await page.getByRole("button", { name: "Réactiver" }).first().click();
    await expect(page.getByRole("dialog").getByText(/118/)).toBeVisible();
  });

  test("sans predefined_tasks:read, l'accès est refusé", async ({ page }) => {
    await serveur(page, { session: SESSION_LECTURE, reponses });
    await page.goto("/taches-predefinies");
    await expect(page.getByText("Permission requise")).toBeVisible();
  });
});

/**
 * `EX-ACT-04` — modifier et supprimer une règle de récurrence, à l'écran.
 *
 * Les deux commandes de la vue 34 ont vécu **désactivées**, derrière un motif
 * exact : le serveur savait poser une règle et l'arrêter, il ne savait ni la
 * réécrire ni l'effacer. Le motif était vrai et la commande n'en restait pas
 * moins inerte — c'est la moitié serveur qui manquait.
 */
test.describe("Vue 34 — la règle de récurrence se corrige et s'efface", () => {
  const reponses = {
    "/api/activite/taches": { corps: PREDEFINIES },
    "/api/activite/taches?inclureInactives=true": { corps: PREDEFINIES_AVEC_INACTIVE },
  };

  /** Le journal de ce qui part vers une règle : la méthode et le corps. */
  async function journal(page: Page) {
    const envois: { methode: string; corps: unknown }[] = [];
    await page.route(
      (url) => /\/api\/activite\/recurrences\//.test(url.pathname),
      (route) => {
        const m = route.request().method();
        if (m === "GET") return route.fallback();
        envois.push({ methode: m, corps: route.request().postDataJSON() ?? null });
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: m === "DELETE" ? '{"assignationsConservees":42}' : "{}",
        });
      },
    );
    return envois;
  }

  /*
   * Le « Modifier » d'une RÈGLE, pas celui d'une tâche.
   *
   * `getByRole("button", { name: "Modifier" }).first()` attrape celui de la
   * ligne de tâche, qui ouvre « Modifier la tâche prédéfinie » — et un premier
   * jet de ces contrôles est passé au vert sur cette fenêtre-là, en croyant
   * mesurer la règle. Le geste se vise dans sa carte.
   */
  const carte = (page: Page) => page.locator(".rule-card").first();

  test("EX-ACT-04 — « Modifier » OUVRE la règle sur SES valeurs, elle n'est plus inerte", async ({
    page,
  }) => {
    await serveur(page, { session: SESSION_ACTIVITE, reponses });
    await page.goto("/taches-predefinies");

    await carte(page).getByRole("button", { name: "Modifier" }).click();
    const fenetre = page.getByRole("dialog", { name: "Modifier la règle" });
    await expect(fenetre).toBeVisible();
    // La fenêtre est amorcée sur la règle, pas vide : une modification qui
    // s'ouvre vierge efface ce qu'on venait corriger.
    await expect(fenetre.getByText("Chaque mardi")).toBeVisible();
  });

  test("EX-ACT-04, RG-GEN-07 — enregistrer part en PATCH avec la version lue", async ({ page }) => {
    await serveur(page, { session: SESSION_ACTIVITE, reponses });
    const envois = await journal(page);
    await page.goto("/taches-predefinies");

    await carte(page).getByRole("button", { name: "Modifier" }).click();
    await page
      .getByRole("dialog", { name: "Modifier la règle" })
      .getByRole("button", { name: "Enregistrer" })
      .click();

    await expect.poll(() => envois.length).toBe(1);
    expect(envois[0]?.methode).toBe("PATCH");
    expect(envois[0]?.corps).toMatchObject({ version: 1, type: "weekly" });
  });

  test("EX-ACT-04 — la tâche portée par une règle existante NE SE CHANGE PAS", async ({ page }) => {
    /*
     * Une règle qui changerait de tâche serait une autre règle, et les
     * assignations déjà engendrées resteraient sur l'ancienne.
     */
    await serveur(page, { session: SESSION_ACTIVITE, reponses });
    await page.goto("/taches-predefinies");

    await carte(page).getByRole("button", { name: "Modifier" }).click();
    const fenetre = page.getByRole("dialog", { name: "Modifier la règle" });
    await expect(fenetre.getByLabel("Tâche prédéfinie", { exact: true })).toBeDisabled();
  });

  test("EX-ACT-04 — la suppression DIT ce qu'elle ne supprime pas, puis part en DELETE", async ({
    page,
  }) => {
    await serveur(page, { session: SESSION_ACTIVITE, reponses });
    const envois = await journal(page);
    await page.goto("/taches-predefinies");

    await carte(page).getByRole("button", { name: "Supprimer" }).click();
    // La promesse AVANT le bouton rouge : c'est elle qui lève l'inquiétude.
    await expect(
      page.getByText("Les assignations déjà engendrées ne sont pas supprimées."),
    ).toBeVisible();

    await page.getByRole("button", { name: "Supprimer la règle", exact: true }).click();
    await expect.poll(() => envois.length).toBe(1);
    expect(envois[0]?.methode).toBe("DELETE");
    await expect(page.getByText("Règle supprimée, 42 assignations conservées.")).toBeVisible();
  });

  test("RG-GEN-06 — sans predefined_tasks:update, ni Modifier ni Supprimer", async ({ page }) => {
    await serveur(page, { session: SESSION_CONFIG, reponses });
    await page.goto("/taches-predefinies");

    // La liste des règles reste lisible : masquer la structure ferait croire
    // qu'il n'y a pas de règle.
    await expect(page.getByText("Chaque mardi")).toBeVisible();
    await expect(carte(page).getByRole("button", { name: "Modifier" })).toHaveCount(0);
    await expect(carte(page).getByRole("button", { name: "Supprimer" })).toHaveCount(0);
  });
});
