import { createHash } from "node:crypto";
import { ecrireContenu, lireContenu } from "../documents/stockage.js";

export type TypeAvatar = "image/jpeg" | "image/png" | "image/webp";

const estPng = (contenu: Buffer): boolean =>
  contenu.length >= 8 && contenu.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));

const estJpeg = (contenu: Buffer): boolean =>
  contenu.length >= 4 && contenu[0] === 0xff && contenu[1] === 0xd8 &&
  contenu[contenu.length - 2] === 0xff && contenu[contenu.length - 1] === 0xd9;

const estWebp = (contenu: Buffer): boolean =>
  contenu.length >= 12 && contenu.toString("ascii", 0, 4) === "RIFF" &&
  contenu.toString("ascii", 8, 12) === "WEBP";

/**
 * `RG-AUTH-09` — le format se lit dans les octets, jamais dans le nom ou le
 * `Content-Type` annoncé par le navigateur. Renommer un exécutable en `.png`
 * ne doit pas en faire une image acceptée.
 */
export function detecterTypeAvatar(contenu: Buffer): TypeAvatar | null {
  if (estPng(contenu)) return "image/png";
  if (estJpeg(contenu)) return "image/jpeg";
  if (estWebp(contenu)) return "image/webp";
  return null;
}

/**
 * Dépose l'image dans le magasin de documents existant, adressé par SHA-256.
 * Le schéma possède déjà `User.avatarFichier` : aucune migration n'est
 * nécessaire et aucun nom fourni par le client ne devient un chemin.
 */
export async function stockerAvatar(contenu: Buffer): Promise<string> {
  const empreinte = createHash("sha256").update(contenu).digest("hex");
  await ecrireContenu(empreinte, contenu);
  return empreinte;
}

export async function lireAvatar(empreinte: string): Promise<Buffer | null> {
  return lireContenu(empreinte);
}
