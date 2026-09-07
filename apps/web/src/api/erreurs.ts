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

/**
 * Le suffixe de la variante chiffrée d'un message de refus.
 *
 * `erreurs:soldeInsuffisant` dit qu'on dépasse ;
 * `erreurs:soldeInsuffisant_detail` dit **de combien**, en interpolant le
 * détail que le serveur a calculé. Le suffixe n'est pas un contexte i18next :
 * la variante est cherchée explicitement, et l'absence de traduction retombe
 * sur le message nu. Ajouter la variante à un catalogue suffit donc à faire
 * parler un refus, sans toucher ni au serveur ni à la vue qui l'affiche.
 */
const SUFFIXE_DETAIL = "_detail";

/**
 * Les valeurs interpolables d'un détail.
 *
 * Un détail peut porter un objet — `{conflit: {...}}` — que l'interpolation ne
 * saurait rendre. On ne passe donc que ce qui s'affiche : nombres, chaînes,
 * booléens. Le reste est écarté silencieusement plutôt que de rendre
 * « [object Object] » au milieu d'une phrase.
 */
const interpolables = (detail: Record<string, unknown>): Record<string, string | number> => {
  const sortie: Record<string, string | number> = {};
  for (const [cle, valeur] of Object.entries(detail)) {
    if (typeof valeur === "number" || typeof valeur === "string") sortie[cle] = valeur;
  }
  return sortie;
};

export const messageErreur = (e: unknown, t: TFunction, repli: string): string => {
  if (!(e instanceof ErreurApi)) return repli;
  if (e.cle) {
    /*
     * **Le chiffre d'abord.** `RG-GEN-03` demande un message actionnable :
     * « votre solde ne couvre pas cette demande » oblige l'agent à aller
     * recompter ailleurs pour ajuster sa demande, alors que le serveur a
     * calculé l'écart et l'a transporté jusqu'ici.
     */
    if (e.detail) {
      const chiffre = t(`${e.cle}${SUFFIXE_DETAIL}`, {
        ...interpolables(e.detail),
        defaultValue: "",
      });
      if (chiffre) return chiffre;
    }
    const traduit = t(e.cle, { defaultValue: "" });
    if (traduit) return traduit;
  }
  return e.message || repli;
};
