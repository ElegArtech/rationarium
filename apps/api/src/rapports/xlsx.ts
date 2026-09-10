import { crc32 } from "node:zlib";

type EntreeZip = { chemin: string; contenu: Buffer };

const xml = (valeur: unknown): string => String(valeur ?? "")
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&apos;");

const colonne = (index: number): string => {
  let n = index + 1;
  let sortie = "";
  while (n > 0) {
    n -= 1;
    sortie = String.fromCharCode(65 + (n % 26)) + sortie;
    n = Math.floor(n / 26);
  }
  return sortie;
};

const cellule = (valeur: string | number, ligne: number, index: number): string => {
  const reference = `${colonne(index)}${ligne}`;
  return typeof valeur === "number" && Number.isFinite(valeur)
    ? `<c r="${reference}"><v>${valeur}</v></c>`
    : `<c r="${reference}" t="inlineStr"><is><t xml:space="preserve">${xml(valeur)}</t></is></c>`;
};

/** Feuille OOXML minimale, avec valeurs numériques réellement numériques. */
const feuille = (lignes: readonly (readonly (string | number)[])[]): Buffer => {
  const corps = lignes.map((ligne, index) =>
    `<row r="${index + 1}">${ligne.map((v, colonneIndex) => cellule(v, index + 1, colonneIndex)).join("")}</row>`,
  ).join("");
  return Buffer.from(
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    `<sheetData>${corps}</sheetData></worksheet>`,
  );
};

const entreeLocale = (entree: EntreeZip): Buffer => {
  const nom = Buffer.from(entree.chemin, "utf8");
  const entete = Buffer.alloc(30);
  entete.writeUInt32LE(0x04034b50, 0);
  entete.writeUInt16LE(20, 4);
  entete.writeUInt16LE(0x0800, 6);
  entete.writeUInt16LE(0, 8);
  entete.writeUInt32LE(crc32(entree.contenu), 14);
  entete.writeUInt32LE(entree.contenu.byteLength, 18);
  entete.writeUInt32LE(entree.contenu.byteLength, 22);
  entete.writeUInt16LE(nom.byteLength, 26);
  return Buffer.concat([entete, nom, entree.contenu]);
};

const entreeCentrale = (entree: EntreeZip, decalage: number): Buffer => {
  const nom = Buffer.from(entree.chemin, "utf8");
  const entete = Buffer.alloc(46);
  entete.writeUInt32LE(0x02014b50, 0);
  entete.writeUInt16LE(20, 4);
  entete.writeUInt16LE(20, 6);
  entete.writeUInt16LE(0x0800, 8);
  entete.writeUInt16LE(0, 10);
  entete.writeUInt32LE(crc32(entree.contenu), 16);
  entete.writeUInt32LE(entree.contenu.byteLength, 20);
  entete.writeUInt32LE(entree.contenu.byteLength, 24);
  entete.writeUInt16LE(nom.byteLength, 28);
  entete.writeUInt32LE(decalage, 42);
  return Buffer.concat([entete, nom]);
};

/** ZIP « store » déterministe : aucune dépendance, aucun téléchargement. */
function zip(entrees: readonly EntreeZip[]): Buffer {
  const locales: Buffer[] = [];
  const centrales: Buffer[] = [];
  let decalage = 0;
  for (const entree of entrees) {
    const locale = entreeLocale(entree);
    locales.push(locale);
    centrales.push(entreeCentrale(entree, decalage));
    decalage += locale.byteLength;
  }
  const central = Buffer.concat(centrales);
  const fin = Buffer.alloc(22);
  fin.writeUInt32LE(0x06054b50, 0);
  fin.writeUInt16LE(entrees.length, 8);
  fin.writeUInt16LE(entrees.length, 10);
  fin.writeUInt32LE(central.byteLength, 12);
  fin.writeUInt32LE(decalage, 16);
  return Buffer.concat([...locales, central, fin]);
}

/** `EX-RPT-03` — un vrai classeur XLSX OOXML, pas un CSV renommé. */
export function creerXlsx(
  lignes: readonly (readonly (string | number)[])[],
  nomFeuille: string,
): Buffer {
  const entrees: EntreeZip[] = [
    {
      chemin: "[Content_Types].xml",
      contenu: Buffer.from(
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
        `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
        `<Default Extension="xml" ContentType="application/xml"/>` +
        `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
        `<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>` +
        `</Types>`,
      ),
    },
    {
      chemin: "_rels/.rels",
      contenu: Buffer.from(
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
        `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>` +
        `</Relationships>`,
      ),
    },
    {
      chemin: "xl/workbook.xml",
      contenu: Buffer.from(
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
        `<sheets><sheet name="${xml(nomFeuille)}" sheetId="1" r:id="rId1"/></sheets></workbook>`,
      ),
    },
    {
      chemin: "xl/_rels/workbook.xml.rels",
      contenu: Buffer.from(
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
        `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>` +
        `</Relationships>`,
      ),
    },
    { chemin: "xl/worksheets/sheet1.xml", contenu: feuille(lignes) },
  ];
  return zip(entrees);
}
