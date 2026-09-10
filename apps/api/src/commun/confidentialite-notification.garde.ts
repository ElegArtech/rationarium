import type { PrismaService } from "../prisma.service.js";
import { PerimetreService } from "./perimetre.service.js";

/** Les routes internes émises par les trois notifications de tâche. */
const identifiantTache = (lien: string): string | null => {
  const id = lien.slice("/taches/".length);
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id) ? id : null;
};

/** RG-SCOPE-04 — droits actuels du destinataire, jamais ceux de l'émetteur. */
export class ConfidentialiteNotificationGarde {
  private static async visibles(prisma: PrismaService, userId: string, ids: string[]) {
    const destinataire = await prisma.user.findUnique({
      where: { id: userId },
      select: { role: { select: { permissions: { select: { permission: true } } } } },
    });
    const droits = new Set(destinataire?.role?.permissions.map((p) => p.permission) ?? []);
    // Même permission que GET /taches/:id, puis même prédicat de périmètre.
    if (!droits.has("tasks:read")) return [];
    const perimetres = new PerimetreService(prisma);
    const perimetre = await perimetres.resoudre(userId, droits);
    return prisma.task.findMany({
      where: { AND: [{ id: { in: ids } }, perimetres.filtreTache(perimetre, droits)] },
      select: { id: true },
    });
  }

  static async autorise(prisma: PrismaService, userId: string, lien?: string | null) {
    if (!lien?.startsWith("/taches/")) return true;
    const id = identifiantTache(lien);
    return id !== null && (await this.visibles(prisma, userId, [id])).length === 1;
  }

  /** Suppression, retrait du périmètre et révocation masquent également le stock. */
  static async filtre(prisma: PrismaService, userId: string) {
    const notifications = await prisma.notification.findMany({
      where: { userId, lien: { startsWith: "/taches/" } }, select: { lien: true },
    });
    const ids = notifications.flatMap((n) => {
      const id = identifiantTache(n.lien!);
      return id ? [id] : [];
    });
    const visibles = ids.length > 0 ? await this.visibles(prisma, userId, [...new Set(ids)]) : [];
    return { OR: [
      { lien: null },
      { NOT: { lien: { startsWith: "/taches/" } } },
      { lien: { in: visibles.map((t) => `/taches/${t.id}`) } },
    ] };
  }
}
