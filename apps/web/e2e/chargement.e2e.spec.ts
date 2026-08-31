import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * `RG-GEN-05` — « **Toute** vue de données dispose d'un état de chargement
 * explicite. »
 *
 * **Pourquoi ce fichier existe, et pourquoi ce n'est pas un test mais un
 * dispositif.** La règle porte un quantificateur universel : un test nommé
 * prouverait le chargement d'UNE vue, pas la règle. Ce qui la tient est un
 * balayage — et un balayage ne vaut que s'il **affirme son inventaire**.
 *
 * Ce dépôt a payé **quatre fois** un contrôle qui passait au vert en ne mesurant
 * rien : `pnpm perf` sur un projet Playwright vide, `pnpm ui:diff` dont la
 * branche de comparaison sortait en 0, la suite d'accessibilité sur une liste de
 * vues tenue à la main, et `ui:diff` de nouveau. La suite d'accessibilité a été
 * corrigée en **dérivant** sa couverture de l'inventaire gelé ; celle-ci fait
 * pareil : elle lit `design/routes.json` et échoue si l'inventaire maigrit.
 *
 * **La méthode.** Toute réponse d'API est retenue indéfiniment, sauf la session
 * — sans elle la coquille ne rend rien. Chaque vue de données doit alors montrer
 * son état de chargement. C'est un montage générique : il ne connaît aucune
 * fixture, donc rien ne peut le faire passer par accident.
 */

const ROUTES: Record<string, string> = JSON.parse(
  readFileSync(path.resolve(import.meta.dirname, "../../../design/routes.json"), "utf8"),
);

/**
 * Les vues qui n'attendent AUCUNE donnée, et qui n'ont donc pas d'état de
 * chargement à montrer. Chacune porte sa raison : c'est l'idiome des autres
 * garde-fous de la vague 7 — une exception peut exister, elle ne peut pas
 * exister en silence.
 */
const SANS_CHARGEMENT: Record<string, string> = {
  "01": "Connexion — formulaire pur : aucune lecture avant la soumission.",
  "02": "Inscription — formulaire pur, comme la connexion : rien n'est lu d'abord.",
  "03": "Mot de passe oublié — formulaire pur : la demande précède toute lecture.",
  "04": "Réinitialisation — formulaire pur, le jeton vient de l'adresse.",
  "05": "Mot de passe imposé — formulaire pur, la session est déjà là.",
  "35": "Mon profil — tout vient de la session, déjà chargée quand la vue rend.",
};

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
  departement: "Numérique et données",
  services: ["Études et projets"],
  membreDepuis: "2024-03-01T00:00:00.000Z",
  role: { code: "ADMIN", nom: "Administrateur" },
  // Toutes les permissions : une vue masquée par courtoisie ne montrerait pas
  // son chargement, et le balayage conclurait à tort.
  permissions: [
    "planning:read", "planning:read_team", "projects:read", "projects:readAll",
    "tasks:read", "tasks:readAll", "leaves:read", "leaves:read_team",
    "telework:read", "telework:read_team", "time_tracking:read",
    "time_tracking:read_team", "users:read", "users:readAll",
    "users:read_individual_tracking", "users:manage_roles",
    "users:manage_permissions", "skills:read", "third_parties:read",
    "clients:read", "events:read", "reports:read", "audit:read",
    "settings:read", "holidays:read", "predefined_tasks:read",
    "departments:read", "directions:read", "services:read", "milestones:read",
    "documents:read", "comments:read",
  ],
  motDePasseAChanger: false,
  version: 1,
};

const aBalayer = Object.entries(ROUTES).filter(([n]) => !(n in SANS_CHARGEMENT));

test.describe("RG-GEN-05 — toute vue de données montre qu'elle charge", () => {
  test("l'inventaire est DÉRIVÉ, et il n'a pas maigri", () => {
    /*
     * Sans cette garde, un `routes.json` tronqué ou un filtre trop large ferait
     * passer la suite en ne balayant rien. C'est le piège que ce dépôt a payé
     * quatre fois — et la seule raison pour laquelle ce fichier commence par là.
     */
    expect(Object.keys(ROUTES).length).toBe(35);
    expect(aBalayer.length).toBe(29);
    // Une exclusion de plus DOIT se remarquer : le compte est écrit ici aussi.
    expect(Object.keys(SANS_CHARGEMENT).length).toBe(6);
    for (const [numero, raison] of Object.entries(SANS_CHARGEMENT)) {
      expect(ROUTES[numero], `la vue ${numero} n'existe plus dans l'inventaire`).toBeDefined();
      expect(raison.length, `la vue ${numero} est exclue sans raison écrite`).toBeGreaterThan(20);
    }
  });

  for (const [numero, chemin] of aBalayer) {
    test(`RG-GEN-05 — vue ${numero} annonce son chargement`, async ({ page }) => {
      await page.route(
        (url) => url.pathname.startsWith("/api/"),
        async (route) => {
          const chemin = new URL(route.request().url()).pathname;
          if (chemin === "/api/auth/me") {
            return route.fulfill({
              status: 200,
              contentType: "application/json",
              body: JSON.stringify(SESSION),
            });
          }
          // Retenue indéfiniment : la vue reste dans son état de chargement.
          // On n'y répond jamais — le test se termine avant, et Playwright
          // ferme la page.
          return new Promise(() => {});
        },
      );

      await page.goto(chemin);

      // `Chargement` rend un `role="status"` avec `aria-live="polite"` : c'est
      // l'annonce elle-même qu'on vérifie, pas une classe décorative. Une vue
      // qui afficherait un squelette muet ne tiendrait pas la règle.
      await expect(page.locator(".etat-chargement[role='status']").first()).toBeVisible({
        timeout: 10_000,
      });
    });
  }
});
