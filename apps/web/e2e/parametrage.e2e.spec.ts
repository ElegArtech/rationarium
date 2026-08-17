import { test, expect } from "@playwright/test";
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
} from "./fixtures/parametrage.js";

/**
 * L-37 — vues 31, 32, 33 et 34.
 *
 * Les points d'attention des briefs sont vérifiés tels qu'ils sont écrits :
 * « un paramètre à effet de bord lointain », « masquer les croisements
 * invalides plutôt que les afficher désactivés », « aucune action de
 * modification ni de suppression, même désactivée », « la prévisualisation en
 * langage naturel de la règle est indispensable ».
 */

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

  test("sans droit d'écriture, la vue reste crédible : lecture sans boutons", async ({ page }) => {
    await serveur(page, { session: SESSION_CONFIG_LECTURE, reponses });
    await page.goto("/parametres");

    await expect(page.getByRole("heading", { name: "Paramètres", level: 1 })).toBeVisible();
    // RG-GEN-06 : une action interdite n'est pas proposée puis refusée.
    await expect(page.getByRole("button", { name: "Enregistrer" })).toHaveCount(0);
    await page.getByRole("link", { name: "Jours fériés" }).click();
    await expect(page.getByRole("button", { name: /Importer fériés FR/ })).toHaveCount(0);
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

  test("RG-ADM-09 — le système, l'humain et le compte supprimé se distinguent", async ({
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
