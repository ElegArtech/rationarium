import { describe, it, expect } from "vitest";

/**
 * **Une ancre brute dans une application à routeur RECHARGE tout le document.**
 *
 * Le piège est consigné dans `CLAUDE.md`, mesuré sur la barre latérale et
 * corrigé là, puis dans la coquille et les vues d'accès (`coquille/liens.test.ts`,
 * qui garde ce périmètre-là). **Il était resté dans les composants partagés** :
 * les deux sorties de `etats.tsx` — « retour à l'accueil » d'un accès refusé et
 * d'une adresse introuvable —, c'est-à-dire exactement les portes que
 * `RG-GEN-05` exige d'un état vide. Chaque clic relançait l'application
 * entière : le lot, la session, les réglages, le compteur de notifications.
 *
 * **Rien ne pouvait le voir** : l'URL change, la vue s'affiche, les parcours de
 * bout en bout passent. Ni le typage, ni `axe`, ni la conformité de rendu ne
 * regardent par où passe une navigation. D'où ce contrôle de forme, qui lit la
 * source plutôt que le rendu — pour attraper la prochaine occurrence, pas
 * celle-ci.
 */
const brut = import.meta.glob("./**/*.{ts,tsx}", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

/** La source, commentaires retirés — ils PARLENT du défaut. */
const sansCommentaires = (texte: string): string =>
  texte.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const sources = Object.entries(brut)
  .filter(([chemin]) => !/\.test\.tsx?$/.test(chemin))
  .map(([chemin, texte]) => ({ chemin, texte: sansCommentaires(texte) }));

/** Un `href` qui vise une route de l'application, et non une ancre ni une API. */
const interne = (valeur: string) =>
  !valeur.startsWith("#") && !valeur.startsWith("/api/") && !/^(https?:|mailto:|data:)/.test(valeur);

describe("une navigation interne passe par le routeur — composants partagés", () => {
  it("le contrôle a quelque chose à mesurer", () => {
    // Un contrôle qui ne mesure rien passe au vert : le piège est consigné
    // trois fois dans ce dépôt. On affirme donc d'abord la matière.
    expect(sources.length).toBeGreaterThanOrEqual(6);
    expect(sources.some((f) => f.chemin.endsWith("etats.tsx"))).toBe(true);
    expect(sources.some((f) => f.chemin.endsWith("Import.tsx"))).toBe(true);
  });

  it("aucune ancre `<a href>` ne vise une route", () => {
    // `download` est l'exception, et la seule : un modèle CSV ou un export
    // n'est pas une navigation, c'est un fichier que le navigateur récupère.
    const fautes: string[] = [];
    for (const { chemin, texte } of sources) {
      for (const balise of texte.matchAll(/<a\b((?:[^<>]|\n)*?)>/g)) {
        const attributs = balise[1] ?? "";
        if (/\bdownload\b/.test(attributs)) continue;
        const href = /href=(?:"([^"]*)"|\{`?([^}`]*)`?\})/.exec(attributs);
        if (!href) continue;
        const valeur = (href[1] ?? href[2] ?? "").trim();
        if (interne(valeur)) fautes.push(`${chemin} — <a href=${valeur}>`);
      }
    }
    expect(fautes).toEqual([]);
  });

  it("aucun composant de collection ne porte un `href` de route", () => {
    // `MenuItem href="/profil"` rend une ancre sans en avoir l'air : sans le
    // `RouterProvider` de react-aria, elle navigue nativement.
    const fautes = sources.flatMap(({ chemin, texte }) =>
      [...texte.matchAll(/<(MenuItem|ListBoxItem|GridListItem|Tab|Breadcrumb)\b[^>]*?href="([^"]*)"/g)]
        .filter((m) => interne(m[2] ?? ""))
        .map((m) => `${chemin} — <${m[1]} href="${m[2]}">`),
    );
    expect(fautes).toEqual([]);
  });

  it("aucune navigation ne passe par `window.location`", () => {
    const fautes = sources.flatMap(({ chemin, texte }) =>
      [...texte.matchAll(/window\.location\.(assign|replace|href\s*=)/g)].map(
        (m) => `${chemin} — window.location.${m[1]}`,
      ),
    );
    expect(fautes).toEqual([]);
  });
});
