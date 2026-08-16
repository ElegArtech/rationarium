import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import fs from "node:fs";
import path from "node:path";

/**
 * Ligne de base RGAA sur les maquettes gelées.
 *
 * Ce contrôle porte sur la RÉFÉRENCE, pas encore sur l'application. Son objet
 * est d'établir ce que la cible garantit déjà et ce qu'elle ne garantit pas,
 * AVANT que le portage ne commence : un défaut d'accessibilité découvert dans
 * la référence en vague 6 se serait propagé dans trente-cinq vues.
 *
 * Le panneau de revue est exclu : il est hors produit.
 */

const RACINE = path.resolve(import.meta.dirname, "../../..");
const MANIFESTE = JSON.parse(
  fs.readFileSync(path.join(RACINE, "design/etats.json"), "utf8"),
) as Record<string, { fichier: string; titre: string }>;

/**
 * Cliquet. La référence gelée porte des manquements connus, relevés le
 * 2026-08-16 et consignés en `mockups/GEL.md`, écart 7. Ils seront corrigés au
 * portage — la maquette n'est pas modifiée, elle est référence visuelle.
 *
 * Ce contrôle tolère donc le connu et refuse le NOUVEAU. Sans cliquet il
 * resterait rouge en permanence, et un contrôle en permanence rouge n'est plus
 * lu : il devient du décor. La liste ne doit que décroître.
 */
const CONNUS: Record<string, string[]> = JSON.parse(
  fs.readFileSync(path.join(RACINE, "design/a11y-baseline.json"), "utf8"),
);

for (const [vue, meta] of Object.entries(MANIFESTE)) {
  for (const theme of ["clair", "sombre"] as const) {
    test(`vue ${vue} — ${meta.titre} — thème ${theme}`, async ({ page }) => {
      // Le thème est posé AVANT le premier rendu, et non après le chargement :
      // basculer la classe une fois la page peinte laisse axe mesurer, par
      // moments, la palette claire. Un contrôle qui échoue une fois sur vingt
      // n'est plus lu — il devient du décor.
      if (theme === "sombre") {
        await page.addInitScript(() => {
          document.addEventListener("DOMContentLoaded", () =>
            document.documentElement.classList.add("dark"),
          );
          document.documentElement.classList.add("dark");
        });
      }
      await page.goto("file://" + path.join(RACINE, meta.fichier));
      await page.waitForLoadState("load");

      const resultat = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
        .exclude("#review")
        .analyze();

      const tolerees = CONNUS[`${vue}-${theme}`] ?? [];
      const graves = resultat.violations
        .filter((v) => v.impact === "critical" || v.impact === "serious")
        .filter((v) => !tolerees.includes(v.id));

      if (graves.length) {
        console.log(
          `\nvue ${vue} (${theme}) — ${graves.length} violation(s) :\n` +
            graves
              .map(
                (v) =>
                  `  · [${v.impact}] ${v.id} — ${v.help}\n` +
                  v.nodes.slice(0, 3).map((n) => `      ${n.target.join(" ")}`).join("\n"),
              )
              .join("\n"),
        );
      }

      expect(
        graves.map((v) => v.id),
        `violations NOUVELLES sur la vue ${vue} en thème ${theme} (les connues sont dans design/a11y-baseline.json)`,
      ).toEqual([]);
    });
  }
}
