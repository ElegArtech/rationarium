import { test, expect, type Page } from "@playwright/test";
import { serveur } from "./fixtures/projets.js";
import { SESSION_ADMIN, UTILISATEURS } from "./fixtures/administration.js";

/**
 * L-24 — la fenêtre d'import.
 *
 * **Trois temps, toujours** : choisir, prévisualiser, exécuter. Les contrôles
 * portent sur ce qui distingue un import utilisable d'un import dangereux —
 * la prévisualisation avant écriture, le compte rendu en trois familles, et le
 * tout-ou-rien du mode Remplacer.
 */

const SESSION_IMPORT = {
  ...SESSION_ADMIN,
  permissions: [...SESSION_ADMIN.permissions, "users:import", "tasks:import", "tasks:export"],
};

const APERCU_OK = {
  lignes: [
    { email: "ana@exemple.fr", login: "ana", password: "s", firstName: "Ana", lastName: "Berger" },
    { email: "bob@exemple.fr", login: "bob", password: "s", firstName: "Bob", lastName: "Costa" },
  ],
  total: 2,
  erreurs: [],
};

const APERCU_AVEC_ERREURS = {
  lignes: APERCU_OK.lignes,
  total: 2,
  erreurs: [{ ligne: 3, message: "colonne « email » vide" }],
};

const RENDU = { importes: 1, ignores: 1, erreurs: [] as { ligne: number; message: string }[] };

const FICHIER =
  "email;login;password;firstName;lastName\n" +
  "ana@exemple.fr;ana;s;Ana;Berger\n" +
  "bob@exemple.fr;bob;s;Bob;Costa\n";

async function choisirFichier(page: Page) {
  await page.getByLabel("Fichier CSV").setInputFiles({
    name: "utilisateurs.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(FICHIER, "utf8"),
  });
}

test.describe("Vue 27 — import d'utilisateurs", () => {
  const reponses = {
    "/api/utilisateurs": { corps: UTILISATEURS },
    "/api/imports/apercu?type=utilisateurs": { corps: APERCU_OK },
    "/api/imports/utilisateurs": { corps: RENDU },
  };

  test("RG-IMP-02 — le format est documenté ET le modèle téléchargeable", async ({ page }) => {
    await serveur(page, { session: SESSION_IMPORT, reponses });
    await page.goto("/utilisateurs");
    await page.getByRole("button", { name: "Importer CSV" }).click();

    await expect(page.getByText("Format attendu")).toBeVisible();
    // Le format colonne par colonne : sans lui, on devine, et on se trompe.
    await expect(page.getByText(/email · login · password/)).toBeVisible();
    await expect(page.getByRole("link", { name: "Télécharger le modèle CSV" })).toHaveAttribute(
      "href",
      "/api/imports/modele?type=utilisateurs",
    );
  });

  test("RG-IMP-03 — LA PRÉVISUALISATION PRÉCÈDE TOUJOURS L'EXÉCUTION", async ({ page }) => {
    const appels: string[] = [];
    await serveur(page, { session: SESSION_IMPORT, reponses });
    page.on("request", (r) => {
      if (r.url().includes("/api/imports/")) appels.push(r.url());
    });

    await page.goto("/utilisateurs");
    await page.getByRole("button", { name: "Importer CSV" }).click();
    await choisirFichier(page);

    await expect(page.getByText("2 lignes détectées")).toBeVisible();
    // Rien n'a encore été écrit : le seul appel est celui de l'aperçu.
    expect(appels.filter((u) => u.includes("/imports/utilisateurs"))).toHaveLength(0);
    await expect(page.getByText("ana@exemple.fr")).toBeVisible();
  });

  test("RG-IMP-04 — le compte rendu distingue TROIS familles", async ({ page }) => {
    await serveur(page, { session: SESSION_IMPORT, reponses });
    await page.goto("/utilisateurs");
    await page.getByRole("button", { name: "Importer CSV" }).click();
    await choisirFichier(page);
    // « Importer CSV » de la barre d'outils et « Importer » de la fenêtre :
    // on vise celui de la fenêtre, par correspondance exacte.
    await page.getByRole("button", { name: "Importer", exact: true }).click();

    // Fondre les doublons dans les erreurs ferait paniquer sur un rejeu.
    await expect(page.getByText("1 importé")).toBeVisible();
    await expect(page.getByText("1 ignoré")).toBeVisible();
    await expect(page.getByText("0 en erreur")).toBeVisible();
    await expect(page.getByText(/rejouer un fichier ne crée pas de doublon/)).toBeVisible();
  });

  test("une erreur porte SON NUMÉRO DE LIGNE — sinon il faut tout relire", async ({ page }) => {
    await serveur(page, {
      session: SESSION_IMPORT,
      reponses: {
        ...reponses,
        "/api/imports/apercu?type=utilisateurs": { corps: APERCU_AVEC_ERREURS },
      },
    });
    await page.goto("/utilisateurs");
    await page.getByRole("button", { name: "Importer CSV" }).click();
    await choisirFichier(page);

    await expect(page.getByText("1 erreur détectée")).toBeVisible();
    // Le numéro est le seul repère retrouvable dans un tableur.
    await expect(page.getByText(/Ligne 3 — colonne « email » vide/)).toBeVisible();
  });

  test("sans users:import, le bouton n'est pas proposé", async ({ page }) => {
    await serveur(page, { session: SESSION_ADMIN, reponses });
    await page.goto("/utilisateurs");
    await expect(page.getByRole("button", { name: "Importer CSV" })).toHaveCount(0);
  });
});

test.describe("Vue 12 — import projet complet", () => {
  const PROJET = {
    id: "p1", nom: "Portail citoyen", description: null, statut: "active", priorite: "high",
    icone: "◆", dateDebut: "2026-01-01", dateFin: "2026-12-31", budgetHeures: 400,
    archive: false, version: 1,
    createur: null, chef: null, sponsor: null, departement: null,
    progression: 40, sante: "good",
    budget: { alloue: 400, consomme: 0, restant: 400, depassement: false },
    taches: { total: 2, parStatut: {} }, jalons: 1,
    equipe: { agents: 0, tiers: 0, clients: 0 },
    instantanes: 0, documents: 0, commentaires: 0,
  };

  const reponses = {
    "/api/projets/p1": { corps: PROJET },
    "/api/taches": { corps: [] },
    "/api/imports/projet/p1/volumes": { corps: { jalons: 1, taches: 2, sousTaches: 3 } },
    "/api/imports/apercu?type=projet": { corps: { lignes: [], total: 0, erreurs: [] } },
  };

  test("LES DEUX MODES SONT PRÉSENTÉS CÔTE À CÔTE, avec leur conséquence", async ({ page }) => {
    await serveur(page, { session: SESSION_IMPORT, reponses });
    await page.goto("/projets/p1/taches");
    await page.getByRole("button", { name: "Import projet (jalons + tâches)" }).click();

    // « Remplacer » n'a pas de sens sans savoir ce qu'il remplace.
    await expect(
      page.getByText("Conserve les jalons et tâches existants, ajoute le contenu du fichier."),
    ).toBeVisible();
    await expect(
      page.getByText(/Supprime les jalons, tâches et sous-tâches existants/),
    ).toBeVisible();
  });

  test("RG-GEN-01 — le mode Remplacer CHIFFRE ce qu'il va supprimer", async ({ page }) => {
    await serveur(page, { session: SESSION_IMPORT, reponses });
    await page.goto("/projets/p1/taches");
    await page.getByRole("button", { name: "Import projet (jalons + tâches)" }).click();
    await page.getByRole("radio", { name: /Remplacer/ }).check();

    // Un « êtes-vous sûr ? » sans chiffres ne permet pas de décider.
    await expect(page.getByText("Action irréversible :")).toBeVisible();
    await expect(
      page.getByText("1 jalon(s), 2 tâche(s) et 3 sous-tâche(s) seront supprimés."),
    ).toBeVisible();
  });

  test("le remplacement exige une confirmation explicite", async ({ page }) => {
    await serveur(page, { session: SESSION_IMPORT, reponses });
    await page.goto("/projets/p1/taches");
    await page.getByRole("button", { name: "Import projet (jalons + tâches)" }).click();
    await page.getByRole("radio", { name: /Remplacer/ }).check();
    await page.getByLabel("Fichier CSV").setInputFiles({
      name: "projet.csv",
      mimeType: "text/csv",
      buffer: Buffer.from("rowType;name;dueDate\n", "utf8"),
    });

    // Tant que la case n'est pas cochée, l'action reste hors de portée.
    await expect(page.getByRole("button", { name: "Importer", exact: true })).toBeDisabled();
    await page.getByRole("checkbox", { name: /remplacer le contenu du projet/ }).check();
    await expect(page.getByRole("button", { name: "Importer", exact: true })).toBeEnabled();
  });

  test("RG-IMP-06 — UN FICHIER EN ERREUR BLOQUE LE REMPLACEMENT, et le dit", async ({ page }) => {
    await serveur(page, {
      session: SESSION_IMPORT,
      reponses: {
        ...reponses,
        "/api/imports/apercu?type=projet": {
          corps: { lignes: [], total: 1, erreurs: [{ ligne: 2, message: "colonne « rowType » vide" }] },
        },
      },
    });
    await page.goto("/projets/p1/taches");
    await page.getByRole("button", { name: "Import projet (jalons + tâches)" }).click();
    await page.getByRole("radio", { name: /Remplacer/ }).check();
    await page.getByLabel("Fichier CSV").setInputFiles({
      name: "projet.csv",
      mimeType: "text/csv",
      buffer: Buffer.from("rowType;name;dueDate\n;;\n", "utf8"),
    });

    await expect(
      page.getByText(/en mode Remplacer, rien ne sera supprimé ni importé/),
    ).toBeVisible();
    await page.getByRole("checkbox", { name: /remplacer le contenu du projet/ }).check();
    // La case cochée ne débloque rien : c'est le fichier qui bloque.
    await expect(page.getByRole("button", { name: "Importer", exact: true })).toBeDisabled();
  });

  test("l'export des tâches est proposé à côté de l'import", async ({ page }) => {
    await serveur(page, { session: SESSION_IMPORT, reponses });
    await page.goto("/projets/p1/taches");

    await expect(page.getByRole("link", { name: "Exporter les tâches" })).toHaveAttribute(
      "href",
      "/api/imports/export/projet/p1/taches",
    );
  });
});

test.describe("Vue 19 — import de congés", () => {
  /**
   * L-43. Le brief de la vue 19 liste « Importer CSV » dans ses actions et la
   * maquette porte le bouton (`#btn-import`, `chip-btn`) — il n'était branché
   * sur rien. Ces contrôles portent sur ce que le serveur ne peut pas dire :
   * que le bouton existe, qu'il ouvre la fenêtre partagée sur le bon type, et
   * que le compte rendu montre les IGNORÉS de `RG-CNG-32` comme des ignorés.
   */
  const SESSION_RH = {
    ...SESSION_ADMIN,
    permissions: [...SESSION_ADMIN.permissions, "leaves:read", "leaves:create", "leaves:import"],
  };

  const APERCU_CONGES = {
    lignes: [
      {
        userEmail: "ana@exemple.fr", leaveTypeName: "Congés annuels",
        startDate: "2026-03-02", endDate: "2026-03-06", halfDay: "", comment: "",
      },
      {
        userEmail: "bob@exemple.fr", leaveTypeName: "Congés annuels",
        startDate: "2026-05-11", endDate: "2026-05-13", halfDay: "", comment: "",
      },
    ],
    total: 2,
    erreurs: [],
  };

  const FICHIER_CONGES =
    "userEmail;leaveTypeName;startDate;endDate;halfDay;comment\n" +
    "ana@exemple.fr;Congés annuels;2026-03-02;2026-03-06;;\n" +
    "bob@exemple.fr;Congés annuels;2026-05-11;2026-05-13;;\n";

  const reponses = {
    "/api/conges/soldes": { corps: [] },
    "/api/conges": { corps: [] },
    "/api/imports/apercu?type=conges": { corps: APERCU_CONGES },
    // `RG-CNG-32` — le chevauchement revient en IGNORÉ, jamais en erreur.
    "/api/imports/conges": { corps: { importes: 2, ignores: 1, erreurs: [] } },
  };

  async function ouvrirLImport(page: Page) {
    await page.goto("/conges");
    await page.getByRole("button", { name: "Importer CSV" }).click();
  }

  test("EX-CNG-14 — le bouton d'import ouvre la fenêtre sur le format des congés", async ({
    page,
  }) => {
    await serveur(page, { session: SESSION_RH, reponses });
    await ouvrirLImport(page);

    await expect(page.getByText("Format attendu")).toBeVisible();
    // Le format colonne par colonne : sans lui, on devine, et on se trompe.
    await expect(page.getByText(/userEmail · leaveTypeName · startDate/)).toBeVisible();
    await expect(page.getByRole("link", { name: "Télécharger le modèle CSV" })).toHaveAttribute(
      "href",
      "/api/imports/modele?type=conges",
    );
  });

  test("RG-CNG-32 — le compte rendu montre les IGNORÉS comme des ignorés", async ({ page }) => {
    await serveur(page, { session: SESSION_RH, reponses });
    await ouvrirLImport(page);
    await page.getByLabel("Fichier CSV").setInputFiles({
      name: "conges.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(FICHIER_CONGES, "utf8"),
    });
    await expect(page.getByText("2 lignes détectées")).toBeVisible();

    // « Importer CSV » dans la barre d'outils, « Importer » dans la fenêtre :
    // on vise celui de la fenêtre, par correspondance exacte.
    await page.getByRole("button", { name: "Importer", exact: true }).click();

    await expect(page.getByText("2 importés")).toBeVisible();
    // Un chevauchement rangé dans les erreurs ferait paniquer sur un fichier
    // dont deux tiers sont entrés.
    await expect(page.getByText("1 ignoré")).toBeVisible();
    await expect(page.getByText("0 en erreur")).toBeVisible();
  });

  test("RG-GEN-06 — sans leaves:import, le bouton n'est pas proposé", async ({ page }) => {
    const sansImport = {
      ...SESSION_RH,
      permissions: SESSION_RH.permissions.filter((p) => p !== "leaves:import"),
    };
    await serveur(page, { session: sansImport, reponses });
    await page.goto("/conges");

    await expect(page.getByRole("button", { name: "Importer CSV" })).toHaveCount(0);
    // Le contrôle reste au serveur ; ici on vérifie qu'on ne PROPOSE pas ce
    // qui sera refusé — et que la vue n'a pas disparu pour autant.
    await expect(page.getByRole("heading", { name: "Gestion des congés" })).toBeVisible();
  });
});
