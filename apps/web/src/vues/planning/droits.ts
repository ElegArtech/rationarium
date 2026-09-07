/**
 * Les droits du planning, **appréciés cellule par cellule**.
 *
 * Ils vivent à part parce qu'ils se testent sans rendu, et parce que le défaut
 * qu'ils corrigent était exactement celui d'une décision prise à l'échelle de
 * la vue là où la règle porte sur la ligne : la bascule de télétravail était
 * offerte sur la cellule de tout le monde, et le serveur répondait `403` après
 * coup — ce que `RG-GEN-06` interdit en toutes lettres.
 */

/** `RG-TLT-07` — agir sur le télétravail d'autrui exige une permission dédiée. */
export const PERMISSION_TELETRAVAIL_AUTRUI = "telework:manage_any";

/** L'écriture de télétravail, quelle que soit la cible. */
export const PERMISSION_TELETRAVAIL = "telework:create";

/**
 * `RG-PLN-04`, `RG-TLT-07` — qui peut basculer le lieu de qui.
 *
 * Deux conditions, dans l'ordre où le serveur les applique
 * (`apps/api/src/planning/planning.controller.ts`, puis
 * `TeletravailService.basculer`) : la permission de l'action, **puis** le
 * droit de viser quelqu'un d'autre que soi. Le client n'a rien à décider de
 * plus, et surtout rien de moins.
 */
export function teletravailModifiablePar(
  peut: (permission: string) => boolean,
  moiId: string,
  cibleId: string,
): boolean {
  if (!peut(PERMISSION_TELETRAVAIL)) return false;
  if (cibleId === moiId) return true;
  return peut(PERMISSION_TELETRAVAIL_AUTRUI);
}
