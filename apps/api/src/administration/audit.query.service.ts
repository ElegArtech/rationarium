import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma.service.js";
import { AuditService } from "../commun/audit.service.js";

/**
 * Consultation du journal d'audit — M20, vue 33.
 *
 * **Lecture seule, par construction et pas par convention** : le rôle SQL
 * applicatif n'a ni `UPDATE` ni `DELETE` sur cette table (`RG-ADM-01`). Ce
 * service n'expose donc aucune écriture — il n'aurait pas les droits de le
 * faire, et c'est voulu.
 *
 * `RG-ADM-03` — la consultation exige une permission dédiée, **et l'accès
 * refusé est lui-même tracé**. Ce second point est traité par la garde
 * (`GardePermission`), qui s'exécute avant ce service : l'ordre importe, il
 * est décrit dans `cadrage/03 § 5.4`.
 */

export type FiltreAudit = {
  typeEntite?: string;
  entiteId?: string;
  acteurId?: string;
  action?: string;
  depuis?: Date;
  jusqua?: Date;
  systeme?: boolean;
};

@Injectable()
export class AuditQueryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * `EX-ADM-07`, `EX-ADM-08` — journal paginé, horodaté, filtrable.
   *
   * Pagination par curseur et non par décalage : sur cinq ans d'historique
   * partitionné, un `OFFSET` profond scanne tout ce qu'il saute. Le curseur
   * s'appuie sur l'index BRIN de l'horodatage.
   */
  async consulter(
    filtres: FiltreAudit,
    pagination: { curseur?: { horodatage: Date; id: string }; taille?: number } = {},
  ) {
    const taille = Math.min(pagination.taille ?? 50, 200);
    const clauses: Record<string, unknown>[] = [];

    if (filtres.typeEntite) clauses.push({ typeEntite: filtres.typeEntite });
    if (filtres.entiteId) clauses.push({ entiteId: filtres.entiteId });
    if (filtres.acteurId) clauses.push({ acteurId: filtres.acteurId });
    if (filtres.action) clauses.push({ action: { startsWith: filtres.action } });
    if (filtres.systeme !== undefined) clauses.push({ systeme: filtres.systeme });
    if (filtres.depuis) clauses.push({ horodatage: { gte: filtres.depuis } });
    if (filtres.jusqua) clauses.push({ horodatage: { lte: filtres.jusqua } });
    if (pagination.curseur) clauses.push({ horodatage: { lt: pagination.curseur.horodatage } });

    const entrees = await this.prisma.auditLog.findMany({
      where: clauses.length > 0 ? { AND: clauses } : {},
      orderBy: [{ horodatage: "desc" }],
      take: taille + 1,
    });

    const aSuivant = entrees.length > taille;
    const page = aSuivant ? entrees.slice(0, taille) : entrees;

    // Les acteurs sont résolus en une requête, pas une par ligne.
    const acteurIds = [...new Set(page.map((e) => e.acteurId).filter((x): x is string => !!x))];
    const acteurs = await this.prisma.user.findMany({
      where: { id: { in: acteurIds } },
      select: { id: true, prenom: true, nom: true },
    });
    const parId = new Map(acteurs.map((a) => [a.id, a]));

    return {
      entrees: page.map((e) => ({
        id: e.id,
        horodatage: e.horodatage,
        action: e.action,
        typeEntite: e.typeEntite,
        entiteId: e.entiteId,
        /**
         * `RG-ADM-09` — distinguer une action système d'une action humaine.
         * Un acteur supprimé laisse sa trace : l'entrée survit à la personne,
         * c'est le point d'un journal.
         */
        systeme: e.systeme,
        acteur: e.acteurId ? (parId.get(e.acteurId) ?? { id: e.acteurId, supprime: true }) : null,
        detail: e.detail,
      })),
      curseurSuivant: aSuivant
        ? { horodatage: page[page.length - 1]!.horodatage, id: page[page.length - 1]!.id }
        : null,
    };
  }

  /** Les valeurs présentes, pour peupler les filtres de la vue 33. */
  async facettes() {
    const [types, actions] = await Promise.all([
      this.prisma.auditLog.findMany({ distinct: ["typeEntite"], select: { typeEntite: true } }),
      this.prisma.auditLog.findMany({ distinct: ["action"], select: { action: true } }),
    ]);
    return {
      typesEntite: types.map((t) => t.typeEntite).sort(),
      actions: actions.map((a) => a.action).sort(),
    };
  }

  /**
   * Crée les partitions mensuelles à venir.
   *
   * Appelé par le traitement planifié. Sans partition pour le mois courant,
   * les écritures tomberaient dans la partition par défaut — ce qui fonctionne,
   * mais ferait perdre le bénéfice du détachement pour la rétention.
   */
  async preparerPartitions(moisAAvance = 3): Promise<string[]> {
    const crees: string[] = [];
    for (let i = 0; i <= moisAAvance; i++) {
      const mois = new Date();
      mois.setMonth(mois.getMonth() + i, 1);
      const iso = mois.toISOString().slice(0, 10);
      await this.prisma.$executeRawUnsafe(`SELECT creer_partition_audit('${iso}'::date)`);
      crees.push(iso.slice(0, 7));
    }
    await this.audit.tracer({
      action: "audit.partitions", typeEntite: "AuditLog", systeme: true, detail: { mois: crees },
    });
    return crees;
  }
}
