/**
 * `RG-TSK-15` — **d'où viennent les assignés proposés.**
 *
 * > « Les assignés proposés sont en priorité les membres du projet ; si le
 * > projet n'a pas de membre, tous les utilisateurs sont proposés, et
 * > l'interface l'explique. »
 *
 * Deux défauts constatés en recette tenaient à ce que la règle était écrite en
 * ligne, deux fois, dans deux fenêtres :
 *
 * 1. le repli sur « tous les utilisateurs » appelle `GET /utilisateurs`, que
 *    la garde `users:read` refuse en `403` à un contributeur. La liste était
 *    donc **vide et muette**, et une erreur était journalisée à chaque
 *    ouverture — ce que `RG-GEN-06` interdit : on ne demande pas ce qui sera
 *    refusé ;
 * 2. l'annuaire rendait aussi les comptes désactivés, que `RG-AUTH-05` exclut
 *    de toute assignation.
 *
 * Le second se règle à la source (`?actif=true`, cf. `CHEMIN_ANNUAIRE`). Le
 * premier n'a pas de réponse dans le cadrage : `RG-TSK-15` ne dit rien du cas
 * où l'annuaire n'est pas lisible. À défaut, on propose **la seule personne
 * que le client connaisse sans le lire — l'utilisateur lui-même** : c'est le
 * cas d'usage courant d'une tâche hors projet, le serveur l'accepte, et la
 * phrase d'indice dit pourquoi la liste s'arrête là. La question remonte.
 */

export type Candidat = { id: string; prenom: string; nom: string };

/**
 * L'annuaire des assignables.
 *
 * `RG-AUTH-05` — un compte désactivé ne se voit plus proposé nulle part. Le
 * filtre est posé **au serveur** : `GET /utilisateurs` sait le faire, et une
 * liste tronquée après coup laisserait un compte désactivé traverser toute
 * autre lecture de la même clé de cache.
 */
export const CHEMIN_ANNUAIRE = "/utilisateurs?actif=true";

/** La permission qui garde `GET /utilisateurs` (`UtilisateursController`). */
export const PERMISSION_ANNUAIRE = "users:read";

export type Indice =
  | "membresDuProjet"
  | "projetSansMembre"
  | "tousLesUtilisateurs"
  | "annuaireInaccessible";

export function assignables({
  projectId,
  membres,
  equipeChargee,
  annuaire,
  annuaireLisible,
  moi,
}: {
  projectId: string | null;
  membres: Candidat[];
  /** Vrai quand la réponse de l'équipe est arrivée : sans elle, on ne conclut pas. */
  equipeChargee: boolean;
  annuaire: Candidat[];
  annuaireLisible: boolean;
  moi: Candidat;
}): { candidats: Candidat[]; indice: Indice; alerte: boolean } {
  if (projectId && !equipeChargee) {
    return { candidats: membres, indice: "membresDuProjet", alerte: false };
  }
  if (projectId && membres.length > 0) {
    return { candidats: membres, indice: "membresDuProjet", alerte: false };
  }

  // Le repli de `RG-TSK-15` : hors projet, ou projet sans aucun membre.
  const indice: Indice = projectId ? "projetSansMembre" : "tousLesUtilisateurs";
  if (annuaireLisible) {
    return { candidats: annuaire, indice, alerte: projectId !== null };
  }
  return { candidats: [moi], indice: "annuaireInaccessible", alerte: true };
}
