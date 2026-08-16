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
 * i18n-familles: auth:erreurs., erreurs:
 *
 * Les deux familles correspondent aux deux tables du serveur :
 * `auth/messages.ts` pour l'authentification, `commun/messages-metier.ts` pour
 * tout le reste. Le test `messages-metier.test.ts` garantit qu'aucun code
 * d'échec ne sort de la table ; le contrôle i18n garantit que la table a bien
 * sa traduction dans les deux langues. Les deux contrôles se complètent : le
 * premier voit ce que le serveur peut dire, le second ce que le client sait
 * afficher.
 */
export const messageErreur = (e: unknown, t: TFunction, repli: string): string => {
  if (!(e instanceof ErreurApi)) return repli;
  if (e.cle) {
    const traduit = t(e.cle, { defaultValue: "" });
    if (traduit) return traduit;
  }
  return e.message || repli;
};
