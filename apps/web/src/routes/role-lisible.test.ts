import { describe, it, expect } from "vitest";

/**
 * **Le rôle se lit par son NOM ; le code reste au survol.**
 *
 * Exploration Karim T-2 : quatre rendus d'une même donnée dans le même
 * produit, dont un seul illisible. La vue 27 rend « Contributeur projet », le
 * suivi individuel rend « Contributeur projet », la vue 32 rend les deux — et
 * la vue 35, sur son propre profil, rendait `CHEF_DE_PROJET`. Le code est
 * l'identifiant que l'audit et les imports manipulent ; ce n'est pas ce qu'on
 * lit sur sa fiche.
 *
 * La table `roles` porte `nom` à côté de `code`, et `routeur.tsx` transmet les
 * deux. Le défaut tenait à l'ordre : `roleCode || role` prend le code dès
 * qu'il existe, c'est-à-dire toujours.
 *
 * **Rien ne pouvait le voir** : les deux champs sont des chaînes, le typage
 * les tient pour interchangeables, la vue s'affiche, `axe` ne réclame rien.
 * Ce contrôle lit la source — la seule façon d'attraper la prochaine
 * occurrence de la forme, pas celle-ci.
 */

/* `import.meta.glob` et non `node:fs` : le paquet web ne type pas Node. */
const brut = import.meta.glob("./**/*.tsx", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

/** La source, commentaires retirés — ils PARLENT du défaut, ils ne le sont pas. */
const sansCommentaires = (texte: string): string =>
  texte.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const sources = Object.entries(brut)
  .filter(([chemin]) => !/\.test\.tsx?$/.test(chemin))
  .map(([chemin, texte]) => ({ chemin, texte: sansCommentaires(texte) }));

const profil = sources.find((f) => f.chemin.endsWith("profil.tsx"));

describe("le rôle affiché est son nom, pas son code interne", () => {
  it("le contrôle a quelque chose à mesurer", () => {
    // Un contrôle qui n'a rien à mesurer doit échouer, jamais réussir en
    // silence : le dépôt a payé quatre fois cette leçon.
    expect(profil, "routes/profil.tsx introuvable").toBeDefined();
    expect(profil?.texte).toContain("roleCode");
  });

  it("AUCUNE VUE NE PRÉFÈRE LE CODE AU NOM", () => {
    // C'est le défaut, mot pour mot : `roleCode || role`. Il vivait deux fois
    // dans le même fichier — le bandeau et la fiche —, et corriger l'une des
    // deux aurait laissé l'autre.
    const fautes = sources.flatMap(({ chemin, texte }) =>
      [...texte.matchAll(/roleCode\s*\|\|\s*(?:utilisateur\.)?role\b/g)].map(
        () => `${chemin} — le code du rôle passe avant son nom`,
      ),
    );
    expect(fautes).toEqual([]);
  });

  it("le profil rend le nom, avec le code en repli — un compte peut n'avoir pas de rôle", () => {
    const deux = [...(profil?.texte ?? "").matchAll(/utilisateur\.role\s*\|\|\s*utilisateur\.roleCode/g)];
    // Deux endroits : la pastille du bandeau et la ligne « Rôle » de la fiche.
    expect(deux).toHaveLength(2);
  });

  it("le code reste joignable au survol — il sert à l'audit et aux imports", () => {
    expect(profil?.texte).toMatch(/title=\{utilisateur\.roleCode \|\| undefined\}/);
  });
});
