import { describe, it, expect } from "vitest";

/**
 * `RG-GEN-06` — « une action interdite n'est jamais proposée puis refusée ».
 *
 * Les défauts constatés : l'import de jalons de la vue 13 était masqué par
 * `tasks:import` quand `POST /imports/projet/:id/jalons` exige
 * `milestones:import` ; l'import de compétences de la vue 25 était masqué par
 * `skills:create` quand `POST /imports/competences` exige `skills:import`.
 *
 * **Les deux moitiés du même défaut, et la seconde est la pire** : un porteur
 * de `milestones:import` seul ne voyait jamais le bouton — la fonction lui
 * était retirée en silence —, et un porteur de `tasks:import` seul le voyait
 * puis prenait un 403. Une garde de courtoisie qui n'est pas celle de la route
 * ne rend pas le produit prudent, elle le rend faux dans les deux sens.
 *
 * **Ce que ce contrôle lit.** La table de vérité est celle du serveur :
 * `PERMISSION_PAR_TYPE` d'`apps/api/src/imports/imports.controller.ts`. Elle
 * est recopiée ici parce que le paquet web ne lit pas les sources de l'API ;
 * la recopie est vérifiée par `surface-http.test.ts` côté serveur, et une
 * dérive se verrait au premier import refusé. Le type demandé, lui, est lu
 * dans la source de la vue — `<FenetreImport type="…">` —, donc jamais
 * supposé.
 */

/** `apps/api/src/imports/imports.controller.ts` — `PERMISSION_PAR_TYPE`. */
const PERMISSION_PAR_TYPE: Record<string, string> = {
  utilisateurs: "users:import",
  taches: "tasks:import",
  jalons: "milestones:import",
  projet: "tasks:import",
  conges: "leaves:import",
  competences: "skills:import",
};

const brut = import.meta.glob(
  "../{administration,referentiels,rapports,tableau,projets}/**/*.tsx",
  { query: "?raw", import: "default", eager: true },
) as Record<string, string>;

const sansCommentaires = (texte: string): string =>
  texte.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const sources = Object.entries(brut)
  .filter(([chemin]) => !/\.test\.tsx?$/.test(chemin))
  .map(([chemin, texte]) => ({ chemin, texte: sansCommentaires(texte) }));

/** Les vues qui ouvrent une fenêtre d'import, avec le type qu'elles demandent. */
const importeuses = sources.flatMap(({ chemin, texte }) =>
  [...texte.matchAll(/<FenetreImport[\s\S]{0,200}?type="([a-z]+)"/g)].map((m) => ({
    chemin,
    type: m[1] ?? "",
    texte,
  })),
);

describe("RG-GEN-06 — la garde du client est celle de la route", () => {
  it("le contrôle a quelque chose à mesurer", () => {
    // Un contrôle qui n'a rien à mesurer doit échouer, jamais réussir en
    // silence. Trois vues de ce périmètre importent : 13, 25 et 27.
    expect(importeuses.length).toBeGreaterThanOrEqual(3);
    expect(importeuses.some((x) => x.type === "jalons")).toBe(true);
    expect(importeuses.some((x) => x.type === "competences")).toBe(true);
  });

  it("chaque type demandé est connu du serveur", () => {
    for (const { chemin, type } of importeuses) {
      expect(PERMISSION_PAR_TYPE[type], `${chemin} — type d'import inconnu : ${type}`).toBeTruthy();
    }
  });

  it("LA VUE MASQUE SUR LA PERMISSION QUE LA ROUTE EXIGE", () => {
    const fautes = importeuses
      .filter(({ type, texte }) => !texte.includes(`peut("${PERMISSION_PAR_TYPE[type]}")`))
      .map(
        ({ chemin, type }) =>
          `${chemin} — import « ${type} » : la route exige ${PERMISSION_PAR_TYPE[type]}, la vue ne le lit nulle part`,
      );
    expect(fautes).toEqual([]);
  });
});
