import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

/**
 * Accessibilité de l'**application**, par opposition aux maquettes gelées.
 *
 * Le contrôle voisin établit ce que la référence garantit ; celui-ci vérifie
 * que le portage ne l'a pas perdu. Les deux sont nécessaires : une maquette
 * accessible portée en composants inaccessibles passerait le premier sans
 * broncher.
 *
 * **Aucun cliquet ici.** La tolérance de `maquettes.a11y.spec.ts` existe parce
 * qu'on ne modifie pas la référence gelée ; le code, lui, se corrige. Une
 * violation grave sur une vue portée est un échec, pas un avertissement
 * (`.claude/rules/tests.md`).
 *
 * Chaque vue est passée dans **les deux thèmes** : le contraste change avec le
 * thème, et un seul des deux ne prouve rien.
 */

import { PROJET, LIGNE_PROJET, ROUTE, EQUIPE, serveur } from "./fixtures/projets.js";

/** Les vues portées à ce jour, et l'état de session qu'elles supposent. */
const VUES: { nom: string; chemin: string; session: "valide" | "absente" }[] = [
  { nom: "01 — connexion", chemin: "/connexion", session: "absente" },
  { nom: "02 — inscription", chemin: "/inscription", session: "absente" },
  { nom: "03 — mot de passe oublié", chemin: "/mot-de-passe-oublie", session: "absente" },
  { nom: "04 — réinitialisation", chemin: "/reinitialisation?jeton=exemple", session: "absente" },
  { nom: "35 — mon profil, dans la coquille", chemin: "/profil", session: "valide" },
  { nom: "10 — portefeuille de projets", chemin: "/projets", session: "valide" },
  { nom: "11 — fiche projet", chemin: `/projets/${PROJET.id}`, session: "valide" },
  { nom: "13 — jalons", chemin: `/projets/${PROJET.id}/jalons`, session: "valide" },
  { nom: "14 — équipe", chemin: `/projets/${PROJET.id}/equipe`, session: "valide" },
  { nom: "adresse inconnue", chemin: "/adresse-inexistante", session: "valide" },
];

async function preparer(page: Page, session: "valide" | "absente", theme: "clair" | "sombre") {
  if (session === "valide") {
    await serveur(page, {
      reponses: {
        "/api/projets": { corps: { projets: [LIGNE_PROJET], affiches: 1, total: 1 } },
        [`/api/projets/${PROJET.id}`]: { corps: PROJET },
        "/feuille-de-route": { corps: ROUTE },
        "/equipe": { corps: EQUIPE },
      },
    });
  } else {
    await page.route(
      (url) => url.pathname.startsWith("/api/"),
      (route) =>
        route.fulfill({
          status: 401,
          contentType: "application/json",
          body: JSON.stringify({ cle: "auth:erreurs.sessionRequise", message: "Session requise" }),
        }),
    );
  }
  // Le thème est mémorisé avant le premier rendu : l'appliquer après ferait
  // mesurer axe sur la palette claire pendant un instant.
  await page.addInitScript((t: string) => {
    window.localStorage.setItem("trame.theme", t);
  }, theme === "sombre" ? "sombre" : "clair");
}

for (const vue of VUES) {
  for (const theme of ["clair", "sombre"] as const) {
    test(`${vue.nom} — thème ${theme}`, async ({ page }) => {
      await preparer(page, vue.session, theme);
      await page.goto(vue.chemin);
      await page.waitForLoadState("networkidle");

      const resultat = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
        .analyze();

      const graves = resultat.violations.filter(
        (v) => v.impact === "critical" || v.impact === "serious",
      );

      if (graves.length) {
        console.log(
          `\n${vue.nom} (${theme}) — ${graves.length} violation(s) :\n` +
            graves
              .map(
                (v) =>
                  `  · [${v.impact}] ${v.id} — ${v.help}\n` +
                  v.nodes
                    .slice(0, 3)
                    .map((n) => `      ${n.target.join(" ")}`)
                    .join("\n"),
              )
              .join("\n"),
        );
      }
      expect(graves.map((v) => v.id)).toEqual([]);
    });
  }
}
