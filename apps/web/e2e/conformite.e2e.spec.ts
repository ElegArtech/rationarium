import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";

const RACINE = path.resolve(import.meta.dirname, "../../..");

/**
 * **Le contrôle du contrôle.**
 *
 * `CLAUDE.md` inscrit la conformité de rendu dans la définition de terminé de
 * chaque vue, et `pnpm ui:diff` est censé la tenir. Pendant tout un projet, il
 * ne l'a pas tenue : sa branche de comparaison affichait « la comparaison
 * s'active dès que la vue est portée » et **sortait avec le code 0**. Trente-
 * cinq vues ont été déclarées conformes sur la foi d'un contrôle vide, et les
 * cinq vues d'accès ont été livrées sans une seule règle de style.
 *
 * C'était la **troisième** occurrence du même piège dans ce dépôt — après la
 * suite de performance qui exécutait un projet Playwright sans fichier, et la
 * suite d'accessibilité qui balayait une liste de vues tenue à la main. Le
 * piège est toujours le même : *un contrôle qui n'a rien à mesurer réussit en
 * silence.*
 *
 * Ces tests-ci sont le garde-fou. Ils ne vérifient pas que la comparaison est
 * juste — c'est le travail du comparateur. Ils vérifient qu'elle **échoue
 * quand elle ne peut pas mesurer**, ce qui est la seule propriété qu'un
 * contrôle ne peut pas se permettre de perdre.
 */

test.describe("la boucle de conformité de rendu", () => {
  test("AUCUNE VUE N'ÉCHAPPE À LA BOUCLE SANS QUE CE SOIT ÉCRIT ICI", () => {
    /*
     * Le comparateur ne peut mesurer que les vues dont il connaît la route.
     * Une vue sans route n'est pas une vue conforme : c'est une vue **non
     * vérifiée**, et confondre les deux est exactement ce qui a permis de
     * déclarer trente-cinq vues conformes sans en mesurer une seule.
     *
     * La liste des exceptions est donc **énumérée, avec son motif**. Ajouter
     * une vue sans route fait rougir ce test, et non passer la vue sous
     * silence.
     */
    const manifeste = JSON.parse(
      readFileSync(path.join(RACINE, "design/etats.json"), "utf8"),
    ) as Record<string, unknown>;
    const routes = JSON.parse(
      readFileSync(path.join(RACINE, "design/routes.json"), "utf8"),
    ) as Record<string, string>;

    /** Vues sans route, et pourquoi. Toute entrée ici est une dette nommée. */
    const SANS_ROUTE: Record<string, string> = {
      "24": "fiche tiers — aucun tiers dans le jeu de données local",
      "26": "fiche client — aucun client dans le jeu de données local",
    };

    const sansRoute = Object.keys(manifeste).filter((v) => !routes[v]);
    expect(sansRoute.sort()).toEqual(Object.keys(SANS_ROUTE).sort());
  });

  test("`pnpm ui:diff` ne porte plus la branche qui sortait en zéro sans comparer", () => {
    /*
     * Une assertion sur le texte, et c'est délibéré : la phrase exacte est ce
     * qui a masqué le défaut pendant tout un projet. Qu'elle réapparaisse,
     * même dans une autre branche, doit faire rougir immédiatement.
     */
    const source = readFileSync(path.join(RACINE, "scripts/ui-diff.mjs"), "utf8");
    expect(source).not.toMatch(/La comparaison implémentation ↔ référence s'active/);
    // Et la délégation au comparateur réel est là.
    expect(source).toContain("ui-conformite.mjs");
  });

  test("le comparateur mesure ce qu'il annonce mesurer", () => {
    // Les quatre mesures nommées dans son en-tête existent dans son code. Un
    // en-tête qui promet plus que le code est une autre façon de rassurer à
    // tort.
    const source = readFileSync(path.join(RACINE, "scripts/ui-conformite.mjs"), "utf8");
    for (const mesure of ["manquantes", "inertes", "textesManquants", "reperes"]) {
      expect(source).toContain(mesure);
    }
    // Et il sort en 1 dès qu'il en trouve une.
    expect(source).toContain("process.exit(ecarts === 0 ? 0 : 1)");
  });
});
