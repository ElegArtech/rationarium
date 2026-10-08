import { describe, it, expect } from "vitest";
import { versChampCsv } from "./reversibilite.js";

/**
 * `RG-IMP-08` — le CSV de réversibilité s'ouvre dans un tableur : une cellule
 * texte n'y devient jamais une formule. Le JSONL, qui sert à la restauration,
 * n'est pas concerné et reste fidèle.
 */
describe("RG-IMP-08 — le CSV de réversibilité neutralise les formules", () => {
  it("une cellule TEXTE qui commence par = + - @ ou une tabulation reçoit une apostrophe", () => {
    expect(versChampCsv('=HYPERLINK("http://x","y")')).toBe(`"'=HYPERLINK(""http://x"",""y"")"`);
    expect(versChampCsv("+33 1 00")).toBe("'+33 1 00");
    expect(versChampCsv("-moins")).toBe("'-moins");
    expect(versChampCsv("@SOMME(A1)")).toBe("'@SOMME(A1)");
    expect(versChampCsv("\tcache")).toBe("'\tcache");
    // Une apostrophe déjà là devant un déclencheur en reçoit une de plus :
    // sans elle, la donnée `'=x` ressortirait identique à la valeur `=x`.
    expect(versChampCsv("'=x")).toBe("''=x");
  });

  it("un nombre n'est pas une formule : il n'est pas touché", () => {
    expect(versChampCsv(-5)).toBe("-5");
    expect(versChampCsv(12.5)).toBe("12.5");
  });

  it("un séparateur reste encadré, sans décalage de colonnes", () => {
    expect(versChampCsv("Dupont;Martin")).toBe('"Dupont;Martin"');
    expect(versChampCsv("a,b")).toBe('"a,b"');
    expect(versChampCsv("texte ordinaire")).toBe("texte ordinaire");
    expect(versChampCsv(null)).toBe("");
  });
});
