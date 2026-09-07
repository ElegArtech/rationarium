import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { serveur, SESSION } from "./fixtures/projets.js";

/**
 * La politique de sécurité du contenu, exercée.
 *
 * **Pourquoi ce fichier existe.** Le serveur d'aperçu ne pose aucun en-tête
 * CSP : la politique ne vit que dans `deploiement/Caddyfile`, donc elle ne
 * s'applique nulle part avant la production. Une violation ne se découvrait
 * qu'en ouvrant la console de l'instance déployée — c'est ainsi qu'a été trouvé
 * l'avertissement permanent de la sonde `new Function` de Zod, sur du code
 * minifié et sans cause lisible.
 *
 * **La politique est LUE, jamais recopiée.** Un contrôle qui porterait sa
 * propre copie de la CSP mesurerait une politique de son cru : il resterait
 * vert pendant qu'on resserre celle du déploiement, ce qui est exactement
 * l'inverse de son objet. On l'extrait du `Caddyfile`, et l'extraction elle-même
 * est affirmée — un contrôle qui n'a rien à mesurer doit échouer, pas passer.
 */

const CADDYFILE = path.resolve(import.meta.dirname, "../../../deploiement/Caddyfile");

/** La CSP du déploiement, telle qu'elle sera servie. */
const politique = (): string => {
  const source = readFileSync(CADDYFILE, "utf8");
  const trouvee = /Content-Security-Policy\s+"([^"]+)"/.exec(source);
  if (!trouvee?.[1]) {
    throw new Error(
      `Aucune directive Content-Security-Policy dans ${CADDYFILE}. ` +
        "Le contrôle n'a rien à mesurer : c'est un échec, pas un succès.",
    );
  }
  return trouvee[1];
};

test("C7 — le client ne viole pas la CSP du déploiement, pas une seule fois", async ({ page }) => {
  const csp = politique();
  expect(csp).toContain("default-src 'self'");
  // Le sujet du contrôle : la politique ne concède PAS l'évaluation dynamique.
  expect(csp).not.toContain("unsafe-eval");

  /*
   * Les violations se relèvent dans la page. `securitypolicyviolation` est le
   * seul témoin fidèle : une violation dont l'exception est rattrapée — le cas
   * de la sonde de Zod — ne produit ni erreur de page, ni requête échouée, ni
   * message que Playwright puisse voir autrement.
   */
  await page.addInitScript(() => {
    const journal: string[] = [];
    (globalThis as unknown as { __violations: string[] }).__violations = journal;
    document.addEventListener("securitypolicyviolation", (e) => {
      journal.push(`${e.violatedDirective} · ${e.blockedURI || e.sourceFile || "?"}`);
    });
  });

  /*
   * La politique se pose sur le DOCUMENT, et sur lui seul : une CSP est le
   * contrat d'un document, et l'en-tête d'une sous-ressource ne la modifie
   * pas. Intercepter tout le reste ne rendrait pas le contrôle plus strict —
   * seulement instable, chaque module rejoué exposant `route.fulfill` à une
   * réponse déjà libérée quand la navigation le devance.
   */
  await page.route(
    (url) => url.pathname === "/" || !url.pathname.includes("."),
    async (route) => {
      if (route.request().resourceType() !== "document") return route.fallback();
      const reponse = await route.fetch();
      return route.fulfill({
        response: reponse,
        headers: { ...reponse.headers(), "content-security-policy": csp },
      });
    },
  );

  await serveur(page, { session: SESSION });
  await page.goto("/profil");
  await expect(page.locator(".side")).toBeVisible();

  const violations = await page.evaluate(
    () => (globalThis as unknown as { __violations: string[] }).__violations,
  );
  expect(violations).toEqual([]);
});
