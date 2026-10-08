import type { PrismaService } from "../prisma.service.js";
import type { PerimetreService } from "./perimetre.service.js";

/**
 * `tasks:assign_any_user` — les personnes qu'un acteur n'a PAS le droit de
 * charger d'une tâche, parmi `userIds`.
 *
 * La règle vit ici une fois, parce qu'elle a deux portes : la tâche créée ou
 * modifiée une à une (`TachesService.exigerAssignables`), et la tâche importée
 * par fichier (`ImportsService`). La seconde l'a ignorée jusqu'au 2026-10-08 :
 * une colonne `assigneeEmail` chargeait n'importe quel compte de l'instance.
 *
 * Sans `tasks:assign_any_user` ni `tasks:manage_any`, est assignable :
 *   - soi-même ;
 *   - une personne du périmètre ORGANISATIONNEL de l'acteur (`RG-SCOPE-01`) ;
 *   - pour une tâche de projet, une personne rattachée au projet
 *     (`RG-SCOPE-02` : créateur, chef, sponsor, membre).
 */
export async function nonAssignables(
  prisma: PrismaService,
  perimetres: PerimetreService,
  userIds: readonly string[],
  projectId: string | null,
  acteurId: string,
  permissions: ReadonlySet<string>,
): Promise<Set<string>> {
  if (permissions.has("tasks:assign_any_user") || permissions.has("tasks:manage_any")) return new Set();
  let restants = [...new Set(userIds)].filter((id) => id !== acteurId);
  if (restants.length === 0) return new Set();

  const perimetre = await perimetres.resoudre(acteurId, permissions);
  restants = restants.filter((id) => !perimetre.utilisateurs.has(id));
  if (restants.length > 0 && projectId) {
    const projet = await prisma.project.findUnique({
      where: { id: projectId },
      select: {
        createurId: true, chefId: true, sponsorId: true,
        membres: { where: { userId: { in: restants } }, select: { userId: true } },
      },
    });
    const rattaches = new Set<string | null>([
      projet?.createurId ?? null, projet?.chefId ?? null, projet?.sponsorId ?? null,
      ...(projet?.membres ?? []).map((m) => m.userId),
    ]);
    restants = restants.filter((id) => !rattaches.has(id));
  }
  return new Set(restants);
}
