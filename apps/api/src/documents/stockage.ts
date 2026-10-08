import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * Le magasin de contenus des pièces jointes — `EX-DOC-01`, `EX-DOC-02`.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * DÉFAUT TROUVÉ EN RECETTE (P-53). **Aucun octet n'était stocké nulle part.**
 * `joindre` recevait le contenu, en calculait l'empreinte, écrivait la ligne
 * de métadonnées — et jetait le tampon. `telecharger` rendait donc l'objet
 * Prisma en JSON, augmenté du chemin de stockage interne : le navigateur
 * quittait l'application pour afficher un objet, et la réponse divulguait
 * l'adresse physique du fichier. Un document qu'on ne peut pas récupérer
 * n'est pas joint ; `EX-DOC-02` promet de le télécharger.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `C14` — l'adressage se fait **par empreinte, jamais par nom d'origine** :
 * deux fichiers homonymes ne s'écrasent pas, et un nom hostile ne peut pas
 * s'échapper du volume. Le nom d'origine est une métadonnée d'affichage.
 *
 * La racine est **paramétrée**, jamais devinée. Reste
 * ouverte la question du magasin définitif (volume sauvegardé avec la base,
 * ou magasin objet compatible S3) : ce module tient la première branche, la
 * plus simple, et l'isole derrière trois fonctions pour que la seconde ne
 * touche que ce fichier.
 */

/** La racine par défaut, relative au répertoire de travail du serveur. */
export const RACINE_PAR_DEFAUT = "var/documents";

/**
 * La racine du magasin.
 *
 * `RATIONARIUM_DOCUMENTS` **vide** vaut absente. Compose déclare ses
 * variables avec `${X:-}` : elles arrivent toujours *définies*, vides quand
 * elles ne sont pas renseignées, et un `??` ne ferait pas la différence. Le
 * dépôt a déjà payé ce piège sur le mot de passe du premier administrateur.
 */
export function racineStockage(): string {
  const declaree = process.env["RATIONARIUM_DOCUMENTS"]?.trim();
  return declaree ? path.resolve(declaree) : path.resolve(process.cwd(), RACINE_PAR_DEFAUT);
}

/**
 * Une empreinte n'est **sûre** que si elle est hexadécimale.
 *
 * Elle vient de la base, et rien n'y garantit qu'elle a été calculée par nous
 * — un jeu de données peut y écrire ce qu'il veut, `recette-f3` par exemple.
 * Un point ou une barre oblique dans cette chaîne sortirait du volume au
 * moment de composer le chemin : le contrôle est ici, une fois, plutôt que
 * dans chaque appelant.
 */
export function empreinteSure(empreinte: string): boolean {
  return /^[0-9a-f]{8,128}$/.test(empreinte);
}

/** `ab/cd/abcdef…` — deux niveaux de répartition, aucun nom d'origine. */
export function cheminDeStockage(empreinte: string): string {
  return `${empreinte.slice(0, 2)}/${empreinte.slice(2, 4)}/${empreinte}`;
}

/**
 * Écrit un contenu. Idempotent : deux dépôts du même fichier écrivent le même
 * octet au même endroit, ce qui est exactement ce que l'adressage par
 * empreinte promet.
 */
export async function ecrireContenu(empreinte: string, contenu: Buffer): Promise<void> {
  if (!empreinteSure(empreinte)) return;
  const cible = path.join(racineStockage(), cheminDeStockage(empreinte));
  await mkdir(path.dirname(cible), { recursive: true });
  await writeFile(cible, contenu);
}

/**
 * Lit un contenu, ou `null` s'il n'est pas là.
 *
 * `null` n'est pas une erreur d'exploitation : une ligne de métadonnées peut
 * exister sans son contenu — c'est le cas de tout document posé avant que ce
 * magasin n'existe, et de ceux que les jeux de données écrivent directement
 * en base. L'appelant en fait un « introuvable », pas un 500.
 */
export async function lireContenu(empreinte: string): Promise<Buffer | null> {
  if (!empreinteSure(empreinte)) return null;
  try {
    return await readFile(path.join(racineStockage(), cheminDeStockage(empreinte)));
  } catch {
    return null;
  }
}

/**
 * L'en-tête `Content-Disposition` d'une pièce jointe.
 *
 * Deux formes, et les deux sont nécessaires : `filename` en ASCII pour les
 * clients anciens, `filename*` en UTF-8 pour tous les autres. Un nom de
 * fichier peut porter un accent, une virgule, un guillemet — le premier
 * champ les remplace, le second les encode.
 */
export function dispositionPieceJointe(nom: string): string {
  const ascii = nom.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(nom)}`;
}

/**
 * `EX-DOC-01` — **la forme d'un type de contenu déclaré.** `type/sous-type`,
 * en caractères de jeton (RFC 6838), sans paramètre ni caractère de contrôle.
 *
 * Le type arrivait en chaîne libre et repartait tel quel en `Content-Type` :
 * un retour chariot y faisait tomber le téléchargement en 500 (Fastify refuse
 * l'en-tête), et rien n'empêchait d'y écrire ce qu'on voulait.
 */
export const FORME_TYPE_MIME = /^[a-z0-9][a-z0-9!#$&^_.+-]{0,62}\/[a-z0-9][a-z0-9!#$&^_.+-]{0,62}$/i;

/**
 * Les types qu'un téléchargement sert **tels quels**. Tout autre type part en
 * `application/octet-stream`.
 *
 * Une liste blanche, pas une liste noire : `text/javascript`, `text/html` ou
 * `image/svg+xml` servis depuis l'origine de l'application sont un script de
 * même origine, et l'on ne peut pas énumérer tout ce qu'un navigateur
 * exécute. Ce sont les documents de travail courants — bureautique, PDF,
 * images matricielles, texte —, rien qui s'exécute.
 */
const TYPES_SERVIS = new Set([
  "application/pdf",
  "application/rtf",
  "application/zip",
  "application/json",
  "application/msword",
  "application/vnd.ms-excel",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.oasis.opendocument.text",
  "application/vnd.oasis.opendocument.spreadsheet",
  "application/vnd.oasis.opendocument.presentation",
  "application/vnd.oasis.opendocument.graphics",
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "text/plain",
  "text/csv",
  "text/markdown",
]);

/** Le `Content-Type` effectivement servi pour un type enregistré. */
export function typeMimeServi(enregistre: string): string {
  const type = enregistre.trim().toLowerCase();
  return TYPES_SERVIS.has(type) ? type : "application/octet-stream";
}
