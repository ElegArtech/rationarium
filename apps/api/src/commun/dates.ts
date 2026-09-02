/**
 * Comparaisons d'échéance — le jour, jamais l'instant.
 *
 * DÉFAUT TROUVÉ À L'USAGE. Les échéances sont des colonnes `@db.Date` : elles
 * reviennent de la base à **minuit UTC**. Les comparer à `new Date()`, qui
 * porte l'heure courante, rend « en retard » toute tâche due AUJOURD'HUI dès
 * la première seconde de la journée — un rouge d'alerte sur du travail qui
 * n'est pas encore dû, et le seul jour où la personne peut encore agir.
 *
 * Le défaut vivait à trois endroits, écrit trois fois de la même façon : les
 * indicateurs et la liste du tableau de bord, le bandeau d'alerte et la santé
 * des projets des rapports. Il ne s'agit donc pas d'un oubli mais d'un piège
 * de forme — `dateFin < reference` a l'air juste — et c'est pourquoi la
 * comparaison est nommée ici plutôt que corrigée sur place.
 */

/** Le début du jour d'un instant, en UTC — l'échelle des colonnes `@db.Date`. */
export function debutDuJour(instant: Date): Date {
  const d = new Date(instant);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

/**
 * L'échéance est-elle DÉPASSÉE ? Aujourd'hui ne l'est pas.
 *
 * Le statut n'entre pas ici : « terminé » se filtre au cas par cas, et les
 * appelants ne l'expriment pas tous de la même façon.
 */
export function echeanceDepassee(echeance: Date | null, reference: Date): boolean {
  return echeance !== null && echeance.getTime() < debutDuJour(reference).getTime();
}

/** L'échéance tombe-t-elle aujourd'hui ? C'est un signal, pas une alerte. */
export function echeanceAujourdhui(echeance: Date | null, reference: Date): boolean {
  return echeance !== null && echeance.getTime() === debutDuJour(reference).getTime();
}
