/**
 * Les droits des tâches, **appréciés sur l'objet**, pas seulement sur la
 * permission.
 *
 * Une permission garde un geste ; elle ne dit pas sur quoi il porte. Le défaut
 * relevé en recette : la fiche n'exerçait que `peut("tasks:delete")`, le bouton
 * était actif sur une tâche qui n'était pas assignée à l'utilisateur, la
 * fenêtre de confirmation s'ouvrait, le geste partait, et le refus tombait
 * après coup en `403`. `RG-GEN-06` interdit exactement ce parcours.
 */

/** `RG-TSK-14` — la permission élargie, celle qui dit « toutes les tâches ». */
export const PERMISSION_TACHES_ELARGIE = "tasks:manage_any";

export const PERMISSION_SUPPRESSION_TACHE = "tasks:delete";

export type DecisionSuppression = "autorisee" | "masquee" | "reserveeAuxAssignes";

/**
 * `RG-TSK-14` — « Sans permission élargie, un utilisateur ne peut supprimer
 * que les tâches qui lui sont assignées. »
 *
 * Trois issues, et le choix entre les deux refus n'est pas cosmétique
 * (`RG-GEN-06`) : sans le geste, l'action n'a aucun sens pour ce profil et
 * disparaît ; avec le geste mais sur la tâche d'un autre, elle a du sens mais
 * pas ici — elle reste donc visible, désactivée, et **porte son motif**.
 *
 * C'est l'ordre du serveur (`TachesService.supprimer`) : permission, puis
 * `tasks:manage_any`, puis l'appartenance à la liste des assignés.
 */
export function decisionSuppressionTache(
  peut: (permission: string) => boolean,
  moiId: string,
  assignes: readonly string[],
): DecisionSuppression {
  if (!peut(PERMISSION_SUPPRESSION_TACHE)) return "masquee";
  if (peut(PERMISSION_TACHES_ELARGIE)) return "autorisee";
  return assignes.includes(moiId) ? "autorisee" : "reserveeAuxAssignes";
}
