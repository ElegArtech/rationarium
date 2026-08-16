import { hash, verify } from "@node-rs/argon2";
import { randomBytes, createHash, timingSafeEqual } from "node:crypto";

/**
 * Hachage des mots de passe — Argon2id, ADR-0008.
 *
 * Paramètres : ceux recommandés par l'OWASP pour Argon2id, choisis pour tenir
 * sur le matériel d'une collectivité sans dégrader le temps de connexion.
 */
const OPTIONS = {
  // Argon2id est la variante par défaut de @node-rs/argon2 ; la nommer
  // exigerait d'importer une énumération ambiante, incompatible avec
  // `verbatimModuleSyntax`. La valeur par défaut est celle qu'on veut.
  memoryCost: 19_456, // 19 Mio
  timeCost: 2,
  parallelism: 1,
} as const;

export const hacherMotDePasse = (clair: string): Promise<string> => hash(clair, OPTIONS);

export const verifierMotDePasse = async (empreinte: string, clair: string): Promise<boolean> => {
  try {
    return await verify(empreinte, clair, OPTIONS);
  } catch {
    return false;
  }
};

/**
 * Jeton opaque : 32 octets d'aléa, transmis en base64url, stocké haché.
 *
 * Le stockage haché n'est pas une précaution de style : une fuite de la table
 * des sessions ne doit pas donner les sessions elles-mêmes. Même raisonnement
 * que pour les mots de passe, appliqué aux porteurs de session.
 */
export const engendrerJeton = (): string => randomBytes(32).toString("base64url");

export const hacherJeton = (jeton: string): string =>
  createHash("sha256").update(jeton).digest("hex");

/**
 * Comparaison à temps constant, pour le jeton anti-CSRF à double soumission.
 * Une comparaison ordinaire fuit la position du premier octet divergent.
 */
export const comparerConstant = (a: string, b: string): boolean => {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
};
