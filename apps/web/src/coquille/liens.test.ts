import { describe, it, expect } from "vitest";

/**
 * **Une ancre brute dans une application à routeur RECHARGE tout le document.**
 *
 * Le piège est consigné dans `CLAUDE.md` depuis qu'il a été mesuré sur la barre
 * latérale — un repère posé sur `window` avant le clic ne survivait pas. Il a
 * été corrigé là, et il est resté ailleurs : le titre d'une notification
 * (`Notifications.tsx`), l'entrée « Mon profil » du menu utilisateur (un
 * `MenuItem href`, qui ne ressemble pas à une ancre et en est une), les neuf
 * liens des cinq vues d'accès, la sortie de session du profil.
 *
 * **Rien ne pouvait le voir** : l'URL change, la vue s'affiche, les parcours de
 * bout en bout passent. Ni le typage, ni `axe`, ni la conformité de rendu ne
 * regardent par où passe une navigation. D'où ce contrôle de forme, qui lit la
 * source plutôt que le rendu — la seule façon d'attraper la prochaine
 * occurrence au lieu de celle-ci.
 *
 * **Portée : la coquille et les vues d'accès.** C'est le périmètre du
 * correctif. Quinze autres ancres internes vivent dans `composants/` et
 * `vues/`, plus quatre `window.location.assign` après suppression ; elles sont
 * signalées au compte rendu, pas corrigées ici — un correcteur qui écrase le
 * fichier d'un autre coûte plus qu'il ne rapporte.
 */

/*
 * La source est lue par `import.meta.glob` et non par `node:fs` : le paquet
 * web ne déclare pas les types de Node, et un test qui les importerait
 * casserait `pnpm typecheck` sans rien apprendre de plus.
 */
const brut = import.meta.glob("../{coquille,routes}/**/*.{ts,tsx}", {
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

describe("une navigation interne passe par le routeur", () => {
  it("le contrôle a quelque chose à mesurer", () => {
    // Un contrôle qui ne mesure rien passe au vert : troisième fois dans ce
    // dépôt. On affirme donc d'abord la matière.
    expect(sources.length).toBeGreaterThanOrEqual(8);
    expect(sources.some((f) => f.chemin.endsWith("Notifications.tsx"))).toBe(true);
    expect(sources.some((f) => f.chemin.endsWith("connexion.tsx"))).toBe(true);
  });

  it("aucune ancre `<a href>` ne vise une route", () => {
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
    // La seule exception légitime serait une sortie DÉLIBÉRÉE de l'application
    // — expiration de session, où l'on veut tout perdre. Elle vit dans
    // `api/client.ts`, pas dans une vue, et porte son motif.
    const fautes = sources
      .filter(({ chemin }) => !chemin.endsWith("client.ts"))
      .flatMap(({ chemin, texte }) =>
        [...texte.matchAll(/window\.location\.(assign|replace|href\s*=)/g)].map(
          (m) => `${chemin} — window.location.${m[1]}`,
        ),
      );
    expect(fautes).toEqual([]);
  });
});
