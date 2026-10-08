import { describe, it, expect } from "vitest";
import { parse } from "csv-parse/sync";
import { csvMatrice } from "./competences.service.js";

/**
 * `EX-CMP-08`, `RG-IMP-08` — l'export de la matrice des compétences.
 *
 * Il était assemblé par `join(";")`, sans guillemets ni neutralisation : un
 * point-virgule dans un nom décalait les colonnes, et un prénom saisi comme
 * une formule s'exécutait à l'ouverture dans le tableur.
 */
const matrice = {
  colonnes: [{ nom: "Cartographie;SIG" }, { nom: "+Budget" }],
  lignes: [
    {
      agent: { prenom: '=HYPERLINK("http://exemple.invalid","clic")', nom: "Dupont;Martin" },
      niveaux: ["expert", null],
    },
    { agent: { prenom: "Inès", nom: "Roche" }, niveaux: [null, "beginner"] },
  ],
};

describe("EX-CMP-08, RG-IMP-08 — la matrice exportée se relit sans décalage ni formule", () => {
  const relire = () => parse(csvMatrice(matrice), { delimiter: ";" }) as string[][];

  it("chaque ligne garde exactement ses colonnes, point-virgule compris", () => {
    const lignes = relire();
    expect(lignes).toHaveLength(3);
    for (const ligne of lignes) expect(ligne).toHaveLength(3);
    expect(lignes[0]).toEqual(["Agent", "Cartographie;SIG", "'+Budget"]);
    expect(lignes[2]).toEqual(["Inès Roche", "", "beginner"]);
  });

  it("une cellule qui commence par un déclencheur de formule est neutralisée", () => {
    const lignes = relire();
    expect(lignes[1]![0]).toBe(`'=HYPERLINK("http://exemple.invalid","clic") Dupont;Martin`);
    expect(lignes[1]![1]).toBe("expert");
    expect(lignes[1]![2]).toBe("");
  });
});
