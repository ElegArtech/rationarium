type StatutJalon = "pending" | "doing" | "done";

/**
 * Le strict nécessaire du client Prisma, pour servir aussi bien le service
 * étendu que le client d'une transaction (leurs types diffèrent ailleurs).
 */
interface ClientJalon {
  task: {
    findMany(args: { where: { milestoneId: string }; select: { statut: true } }): PromiseLike<{ statut: string }[]>;
  };
  milestone: {
    findMany(args: { where: { projectId: string }; select: { id: true } }): PromiseLike<{ id: string }[]>;
    updateMany(args: { where: { id: string; statut: { not: StatutJalon } }; data: { statut: StatutJalon } }): PromiseLike<unknown>;
  };
}

/**
 * `RG-JAL-01` — le statut d'un jalon qui porte des tâches suit ses tâches, et
 * il est ENREGISTRÉ, pas seulement recalculé à l'affichage :
 *
 *   toutes terminées      → Terminé
 *   toutes à faire        → En attente
 *   sinon                 → En cours
 *
 * Le calcul à la lecture laissait la colonne `Milestone.statut` à « en
 * attente » : tout ce qui lit la base sans passer par la feuille de route —
 * l'assistant de suivi, un export, une requête — voyait un jalon dépassé dont
 * toutes les tâches étaient closes, et personne ne pouvait le clore puisque le
 * geste manuel est refusé aux jalons qui portent des tâches. Le statut est
 * donc tenu à jour à chaque écriture qui change le statut d'une tâche ou son
 * rattachement : terminer la dernière tâche termine le jalon, rouvrir une
 * tâche rouvre le jalon.
 *
 * `RG-JAL-06` — un jalon SANS TÂCHE garde sa marque manuelle. Avec
 * `rouvrirSiVide`, un jalon qui vient de perdre sa dernière tâche est remis
 * en attente : son statut calculé ne doit pas survivre comme une marque.
 */
export async function synchroniserStatutJalons(
  client: ClientJalon,
  ids: readonly (string | null | undefined)[],
  { rouvrirSiVide = false }: { rouvrirSiVide?: boolean } = {},
): Promise<void> {
  const uniques = [...new Set(ids.filter((id): id is string => typeof id === "string" && id !== ""))];
  for (const id of uniques) {
    const taches = await client.task.findMany({ where: { milestoneId: id }, select: { statut: true } });
    let statut: StatutJalon;
    if (taches.length === 0) {
      if (!rouvrirSiVide) continue;
      statut = "pending";
    } else if (taches.every((t) => t.statut === "done")) statut = "done";
    else if (taches.every((t) => t.statut === "todo")) statut = "pending";
    else statut = "doing";
    await client.milestone.updateMany({ where: { id, statut: { not: statut } }, data: { statut } });
  }
}

/** Tous les jalons d'un projet qui portent des tâches — après un import. */
export async function synchroniserJalonsDuProjet(client: ClientJalon, projectId: string): Promise<void> {
  const jalons = await client.milestone.findMany({ where: { projectId }, select: { id: true } });
  await synchroniserStatutJalons(client, jalons.map((j) => j.id));
}
