import { test, expect, type Page } from "@playwright/test";

/**
 * Le socle applicatif, exercé dans un vrai navigateur.
 *
 * **Pourquoi le serveur est simulé ici, alors que la règle est de ne jamais
 * simuler.** La règle vise la base de données : les contraintes d'intégrité de
 * ce produit vivent en SQL, et un simulacre ne les exécute pas. Ici, l'objet du
 * test est le **routage et la session côté client** — quelle vue s'affiche pour
 * quel état de session. Le serveur réel est déjà couvert par 282 tests
 * d'intégration ; le rebrancher n'ajouterait qu'une source de lenteur et de
 * bruit à un test qui ne l'interroge pas.
 *
 * Ce qui est vérifié, et qu'aucune boucle ne voyait jusqu'ici : que
 * l'application **démarre**. Le typage et la construction passent sur un
 * routeur qui ne monte pas.
 */

const SESSION = {
  id: "11111111-1111-4111-8111-111111111111",
  prenom: "Camille",
  nom: "Roussel",
  email: "camille.roussel@exemple.fr",
  login: "camille.roussel",
  avatarFichier: null,
  avatarPredefini: null,
  langue: "fr",
  theme: "auto",
  derniereConnexion: "2026-08-15T08:12:00.000Z",
  /*
   * `EX-AUTH-09` — le profil dit désormais le rattachement organisationnel.
   * Le jeu d'essai avait pris du retard sur le contrat : sans ces trois
   * champs, la coquille tombait et VINGT-SIX contrôles de bout en bout
   * échouaient sur des symptômes qui ne ressemblaient pas à leur cause.
   */
  departement: "Numérique et données",
  services: ["Études et projets"],
  membreDepuis: "2024-03-01T00:00:00.000Z",
  role: { code: "ENCADREMENT", nom: "Encadrement" },
  permissions: [
    "planning:read",
    "projects:read",
    "tasks:read",
    "leaves:read",
    "telework:read",
    "time_tracking:read",
    "users:read",
  ],
  motDePasseAChanger: false,
};

/** Installe une session, ou son absence, avant le chargement de la page. */
async function serveur(page: Page, reponse: { statut: number; corps?: unknown }) {
  await page.route("**/api/auth/me", (route) =>
    route.fulfill({
      status: reponse.statut,
      contentType: "application/json",
      body: JSON.stringify(
        reponse.corps ?? { cle: "auth:erreurs.sessionRequise", message: "Session requise" },
      ),
    }),
  );
}

test.describe("Le socle démarre", () => {
  test("une session valide affiche la coquille et la vue", async ({ page }) => {
    await serveur(page, { statut: 200, corps: SESSION });
    await page.goto("/profil");

    await expect(page.getByRole("navigation", { name: /navigation principale/i })).toBeVisible();
    // La navigation est filtrée par les droits : sept permissions de lecture,
    // pas d'administration. RG-GEN-06 — on ne propose pas ce qui sera refusé.
    await expect(page.getByRole("link", { name: "Journal d'audit" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Projets", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });

  test("sans session, on est renvoyé sur la connexion — en gardant la destination", async ({
    page,
  }) => {
    await serveur(page, { statut: 401 });
    await page.goto("/profil");

    await expect(page).toHaveURL(/\/connexion\?suite=%2Fprofil/);
    // La destination est portée par l'adresse : un lien partagé aboutit après
    // identification, au lieu de retomber sur l'accueil.
    await expect(page.getByLabel(/identifiant/i)).toBeVisible();
  });

  test("EX-AUTH-07 — un mot de passe à changer court-circuite tout le reste", async ({ page }) => {
    await serveur(page, { statut: 200, corps: { ...SESSION, motDePasseAChanger: true } });
    await page.goto("/profil");

    await expect(page).toHaveURL(/\/mot-de-passe-impose/);
    // Hors coquille : lui montrer la navigation l'inviterait à aller ailleurs
    // pour être renvoyé ici.
    await expect(page.getByRole("navigation", { name: /navigation principale/i })).toHaveCount(0);
  });

  test("une adresse inconnue rend un état vide avec sa sortie — RG-GEN-04", async ({ page }) => {
    await serveur(page, { statut: 200, corps: SESSION });
    await page.goto("/cette-page-nexiste-pas");

    await expect(page.getByText(/ne correspond à aucune page/i)).toBeVisible();
    await expect(page.getByRole("link", { name: /retour à l'accueil/i })).toBeVisible();
  });

  test("l'accueil sert le tableau de bord — il ne renvoie plus ailleurs", async ({ page }) => {
    // Il redirigeait vers le profil tant que la vue 06 n'était pas portée.
    // Depuis L-21, c'est la page la plus consultée du produit qui est à la
    // racine, et l'adresse ne bouge plus.
    await serveur(page, { statut: 200, corps: SESSION });
    await page.goto("/");

    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("navigation", { name: /navigation principale/i })).toBeVisible();
  });
});

test.describe("Le socle est bilingue et bithématique", () => {
  test("le basculement de langue change les libellés sans recharger", async ({ page }) => {
    await serveur(page, { statut: 200, corps: SESSION });
    await page.goto("/profil");

    await expect(page.getByRole("link", { name: "Tâches" })).toBeVisible();
    // La page profil porte désormais elle aussi un groupe « Langue » — celui
    // des préférences, que la maquette 35 y dessine. On vise celui de la barre
    // d'en-tête.
    await page
      .locator(".topbar")
      .getByRole("group", { name: /langue/i })
      .getByRole("button", { name: "EN" })
      .click();
    await expect(page.getByRole("link", { name: "Tasks" })).toBeVisible();
  });

  test("le thème sombre s'applique au document", async ({ page }) => {
    await serveur(page, { statut: 200, corps: SESSION });
    await page.goto("/profil");

    /*
     * La bascule de l'en-tête est celle de la maquette : UN bouton, étiqueté
     * par sa cible. Le menu à trois entrées qui la remplaçait ne figure dans
     * aucune maquette ; les trois états — dont « automatique », qu'exige
     * `cadrage/01 § 7` — vivent au profil, dans le groupe segmenté de la
     * maquette 35.
     */
    await page.locator(".topbar").getByRole("button", { name: "Thème sombre" }).click();
    await expect(page.locator("html")).toHaveClass(/dark/);

    // Et le troisième état reste atteignable, là où il a sa place.
    await expect(
      page.getByRole("group", { name: /thème/i }).getByRole("button", { name: "Automatique" }),
    ).toBeVisible();
  });
});
