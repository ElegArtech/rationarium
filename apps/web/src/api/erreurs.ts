import type { TFunction } from "i18next";
import { ErreurApi } from "./client.js";

/**
 * Message affichable d'une erreur d'API.
 *
 * **Le serveur envoie une clé, le client la traduit.** RG-GEN-08 exige que
 * toute chaîne visible soit traduisible ; un serveur qui renverrait du texte
 * français figé rendrait l'anglais impossible.
 *
 * Le `message` du serveur sert de repli si la clé est inconnue du catalogue —
 * cas qui doit rester théorique, et que `pnpm i18n:check` empêche d'exister.
 *
 * Les clés arrivent ici à l'exécution, donc invisibles à l'analyse statique.
 * On les déclare, plutôt que d'affaiblir le contrôle :
 *
 * i18n-familles: auth:erreurs.
 */
export const messageErreur = (e: unknown, t: TFunction, repli: string): string => {
  if (!(e instanceof ErreurApi)) return repli;
  if (e.cle) {
    const traduit = t(e.cle, { defaultValue: "" });
    if (traduit) return traduit;
  }
  return e.message || repli;
};
