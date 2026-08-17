import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
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
    // Plus aucune : `scripts/donnees-vues-22-29.mjs` crée le tiers et le
    // client qui manquaient, et leurs routes sont déclarées.
    const SANS_ROUTE: Record<string, string> = {};

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

  test("L'ESPACE `acces` NE SERT QUE LES VUES 01 À 05 — l'invariant du cloisonnement", () => {
    /*
     * Le comparateur retire `acces` du catalogue des vues 06 et suivantes,
     * parce que le panneau de marque de la vue 01 rend une grille illustrative
     * — « Accueil · matin », « Astreinte », « Comité · EXT » — que les autres
     * maquettes réemploient comme décor. Ces chaînes sont de vrais libellés là,
     * et de la fiction partout ailleurs.
     *
     * Le cloisonnement ne vaut que si l'invariant tient. Il se VÉRIFIE ici, au
     * lieu de se supposer : qu'une vue de données charge un jour `acces` et le
     * comparateur cesserait de voir un vrai manque de libellé.
     */
    const fichiers = execSync(
      `grep -rl 'useTranslation("acces")' ${path.join(RACINE, "apps/web/src")} || true`,
      { encoding: "utf8" },
    )
      .split("\n")
      .filter(Boolean)
      .map((f) => path.relative(RACINE, f));

    expect(fichiers.length).toBeGreaterThan(0);
    for (const f of fichiers) {
      expect(f.startsWith("apps/web/src/routes/")).toBe(true);
    }
  });

  test("L'IDENTITÉ DE LA PERSONNE CONNECTÉE EST UNE DONNÉE, JAMAIS UN GABARIT", () => {
    /*
     * `.um-name` et `.um-role` portent la persona côté maquette — « Inès
     * Rocher », « Manager de service », « Direction » — et le compte réel côté
     * produit. Les comparer fait de chaque persona un écart bloquant.
     *
     * Mesuré : l'ajout d'un seul libellé de rôle au catalogue a fait
     * apparaître « Manager de service » comme écart sur VINGT ET UNE vues à la
     * fois, sans qu'une ligne de vue ait changé. Le bloc est exclu des deux
     * côtés ; l'oublier ferait revenir la vague entière.
     */
    const source = readFileSync(path.join(RACINE, "scripts/ui-conformite.mjs"), "utf8");
    for (const bloc of [".um-name", ".um-role", "#uname", "#urole"]) {
      expect(source).toContain(bloc);
    }
  });

  test("L'EXCLUSION D'INERTIE SE LIT SUR LA MAQUETTE, JAMAIS SUR UNE LISTE", () => {
    /*
     * Le comparateur ne compte plus comme inerte une classe que la maquette
     * pose sans la styler non plus — `row-more` en vue 27, simple crochet de
     * script. C'est juste : le contrôle cherche ce que le PRODUIT invente sans
     * règle derrière.
     *
     * Mais c'est aussi la porte la plus facile à élargir. Une liste d'exceptions
     * nommées y muselerait n'importe quel écart, une classe à la fois, sans que
     * rien ne rougisse — exactement la mécanique qui a laissé `ui:diff` sortir
     * en zéro pendant tout un projet.
     *
     * L'exclusion doit donc rester DÉRIVÉE de la maquette : elle se calcule sur
     * `maquette.definies`, et aucune classe n'y est écrite en dur.
     */
    const source = readFileSync(path.join(RACINE, "scripts/ui-conformite.mjs"), "utf8");
    expect(source).toContain("maquette.definies");

    const bloc = source.slice(
      source.indexOf("const inertesMaquette"),
      source.indexOf("// 3. Les textes"),
    );
    expect(bloc.length).toBeGreaterThan(0);
    // Aucune classe littérale dans le calcul : que des dérivations.
    expect(bloc).not.toMatch(/["'][a-z][a-z0-9-]*["']/);
  });
});
