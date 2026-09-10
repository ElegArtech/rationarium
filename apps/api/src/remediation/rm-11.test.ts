import "reflect-metadata";
import { crc32 } from "node:zlib";
import { describe, expect, it } from "vitest";
import { creerXlsx } from "../rapports/xlsx.js";

function entreesLocales(archive: Buffer) {
  const sorties: Array<{ nom: string; contenu: Buffer; crc: number }> = [];
  let position = 0;
  while (archive.readUInt32LE(position) === 0x04034b50) {
    const crc = archive.readUInt32LE(position + 14);
    const taille = archive.readUInt32LE(position + 18);
    const tailleNom = archive.readUInt16LE(position + 26);
    const tailleExtra = archive.readUInt16LE(position + 28);
    const debutNom = position + 30;
    const debutContenu = debutNom + tailleNom + tailleExtra;
    sorties.push({
      nom: archive.subarray(debutNom, debutNom + tailleNom).toString("utf8"),
      contenu: archive.subarray(debutContenu, debutContenu + taille),
      crc,
    });
    position = debutContenu + taille;
  }
  return sorties;
}

describe("RM-11 — export Excel serveur", () => {
  it("EX-RPT-03 — produit un véritable paquet OOXML dont chaque entrée ZIP porte le bon CRC32", () => {
    const archive = creerXlsx([
      ["Projet", "Complétion"],
      ["Rénovation & écoles", 42],
    ], "Rapport");
    expect(archive.readUInt32LE(0)).toBe(0x04034b50);
    expect(archive.readUInt32LE(archive.byteLength - 22)).toBe(0x06054b50);

    const entrees = entreesLocales(archive);
    expect(entrees.map(({ nom }) => nom)).toEqual([
      "[Content_Types].xml",
      "_rels/.rels",
      "xl/workbook.xml",
      "xl/_rels/workbook.xml.rels",
      "xl/worksheets/sheet1.xml",
    ]);
    for (const entree of entrees) expect(crc32(entree.contenu)).toBe(entree.crc);
    const feuille = entrees.at(-1)?.contenu.toString("utf8") ?? "";
    expect(feuille).toContain("Rénovation &amp; écoles");
    expect(feuille).toContain('<c r="B2"><v>42</v></c>');
  });
});
