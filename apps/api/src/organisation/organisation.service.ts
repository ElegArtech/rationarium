import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma.service.js";
import { AuditService } from "../commun/audit.service.js";
import { PerimetreService, type Perimetre } from "../commun/perimetre.service.js";

/**
 * Structure organisationnelle — M2, `cadrage/01 § M2`.
 *
 * Trois niveaux : Direction → Département → Service.
 */

export type EchecOrganisation =
  | "direction_a_des_departements"
  | "service_hors_departement"
  | "nom_deja_pris"
  | "introuvable"
  | "conflit_de_version";

export class ErreurOrganisation extends Error {
  constructor(
    readonly code: EchecOrganisation,
    readonly detail?: Record<string, unknown>,
  ) {
    super(code);
  }
}

@Injectable()
export class OrganisationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly perimetres: PerimetreService,
  ) {}

  // ── Lecture ──────────────────────────────────────────────────────────────

  /**
   * `EX-ORG-04` — l'organisation sous forme d'arborescence dépliable.
   *
   * Le périmètre s'applique aux **départements** : une direction reste
   * visible si l'un de ses départements l'est, sinon elle disparaît. Une
   * direction vide affichée sans ses départements serait un aveu de ce qu'on
   * cache.
   */
  async arborescence(perimetre: Perimetre) {
    const filtreDept = this.perimetres.filtreDepartement(perimetre);

    const directions = await this.prisma.direction.findMany({
      orderBy: { nom: "asc" },
      include: {
        responsable: { select: { id: true, prenom: true, nom: true } },
        departements: {
          where: filtreDept,
          orderBy: { nom: "asc" },
          include: {
            responsable: { select: { id: true, prenom: true, nom: true } },
            services: {
              orderBy: { nom: "asc" },
              include: {
                manager: { select: { id: true, prenom: true, nom: true } },
                _count: { select: { membres: true } },
              },
            },
            _count: { select: { membres: true, services: true } },
          },
        },
      },
    });

    // RG-ORG-03 — un département peut exister hors direction. Il ne doit pas
    // disparaître de l'arborescence pour autant.
    const orphelins = await this.prisma.departement.findMany({
      where: { AND: [{ directionId: null }, filtreDept] },
      orderBy: { nom: "asc" },
      include: {
        responsable: { select: { id: true, prenom: true, nom: true } },
        services: {
          orderBy: { nom: "asc" },
          include: {
            manager: { select: { id: true, prenom: true, nom: true } },
            _count: { select: { membres: true } },
          },
        },
        _count: { select: { membres: true, services: true } },
      },
    });

    return {
      directions: directions.filter((d) => d.departements.length > 0 || perimetre.global),
      departementsSansDirection: orphelins,
    };
  }

  // ── Directions — EX-ORG-01 ───────────────────────────────────────────────

  async creerDirection(donnees: { nom: string; description?: string; responsableId?: string | null }, acteurId: string) {
    await this.refuserNomEnDouble("direction", donnees.nom);
    const direction = await this.prisma.direction.create({
      data: {
        nom: donnees.nom,
        description: donnees.description ?? null,
        responsableId: donnees.responsableId ?? null,
      },
    });
    await this.audit.tracer({
      action: "direction.create", typeEntite: "Direction", entiteId: direction.id, acteurId,
    });
    return direction;
  }

  /**
   * `EX-ORG-02` — **renommer une direction, un département, un service**, ou
   * changer son responsable.
   *
   * Les trois niveaux se créaient et se supprimaient ; aucun ne se modifiait.
   * La maquette 29 pose « Modifier » sur les trois — et corriger une faute
   * dans un nom de service imposait de le supprimer, donc d'en détacher les
   * agents et de perdre leur rattachement.
   *
   * `RG-ORG-04` — le nom reste unique à son niveau, à la modification comme à
   * la création. Sans ce contrôle ici, il suffisait de créer puis de renommer
   * pour fabriquer deux directions homonymes.
   */
  async renommer(
    niveau: "direction" | "departement" | "service",
    id: string,
    donnees: { nom?: string; description?: string | null; responsableId?: string | null },
    acteurId: string,
  ) {
    const table =
      niveau === "direction"
        ? this.prisma.direction
        : niveau === "departement"
          ? this.prisma.departement
          : this.prisma.service;

    const avant = await (table as { findUnique: (a: unknown) => Promise<{ nom: string } | null> })
      .findUnique({ where: { id } });
    if (!avant) throw new ErreurOrganisation("introuvable");
    /*
     * `RG-ORG-04` — le nom reste unique à son niveau. Le service en est exclu :
     * son unicité est portée par le couple (département, nom), deux
     * départements pouvant légitimement avoir chacun leur « Accueil ».
     */
    if (donnees.nom && donnees.nom !== avant.nom && niveau !== "service") {
      await this.refuserNomEnDouble(niveau, donnees.nom);
    }

    const modifie = await (
      table as { update: (a: unknown) => Promise<{ id: string; nom: string }> }
    ).update({
      where: { id },
      data: { ...donnees, version: { increment: 1 } },
    });

    await this.audit.tracer({
      action: `${niveau}.update`,
      typeEntite: niveau === "direction" ? "Direction" : niveau === "departement" ? "Departement" : "Service",
      entiteId: id,
      acteurId,
      detail: { avant: avant.nom, apres: modifie.nom },
    });
    return modifie;
  }

  /**
   * `RG-ORG-01` — une direction ne peut être supprimée tant que des
   * départements y sont rattachés. **L'utilisateur est invité à les détacher
   * au préalable** : le refus nomme les blocages, il ne dit pas seulement non.
   */
  async supprimerDirection(id: string, acteurId: string) {
    const rattaches = await this.prisma.departement.findMany({
      where: { directionId: id },
      select: { id: true, nom: true },
    });
    if (rattaches.length > 0) {
      throw new ErreurOrganisation("direction_a_des_departements", {
        departements: rattaches.map((d) => d.nom),
      });
    }
    await this.prisma.direction.delete({ where: { id } });
    await this.audit.tracer({ action: "direction.delete", typeEntite: "Direction", entiteId: id, acteurId });
  }

  // ── Départements — EX-ORG-02 ─────────────────────────────────────────────

  async creerDepartement(
    donnees: { nom: string; description?: string; directionId?: string | null; responsableId?: string | null },
    acteurId: string,
  ) {
    await this.refuserNomEnDouble("departement", donnees.nom);
    const departement = await this.prisma.departement.create({
      data: {
        nom: donnees.nom,
        description: donnees.description ?? null,
        directionId: donnees.directionId ?? null,
        responsableId: donnees.responsableId ?? null,
      },
    });
    await this.audit.tracer({
      action: "departement.create", typeEntite: "Departement", entiteId: departement.id, acteurId,
    });
    return departement;
  }

  /**
   * Impact d'une suppression de département, à présenter AVANT de confirmer.
   *
   * `RG-ORG-02` — supprimer un département supprime les services qu'il
   * contient, et **l'utilisateur en est averti explicitement**. Un `ON DELETE
   * CASCADE` silencieux satisferait la base et trahirait la règle : ce qui est
   * exigé, c'est l'avertissement.
   */
  async impactSuppressionDepartement(id: string) {
    const departement = await this.prisma.departement.findUnique({
      where: { id },
      include: {
        services: { select: { id: true, nom: true } },
        _count: { select: { membres: true } },
      },
    });
    if (!departement) throw new ErreurOrganisation("introuvable");
    return {
      nom: departement.nom,
      servicesSupprimes: departement.services.map((s) => s.nom),
      agentsDetaches: departement._count.membres,
    };
  }

  async supprimerDepartement(id: string, acteurId: string) {
    const impact = await this.impactSuppressionDepartement(id);
    await this.prisma.departement.delete({ where: { id } });
    await this.audit.tracer({
      action: "departement.delete",
      typeEntite: "Departement",
      entiteId: id,
      acteurId,
      detail: impact as unknown as Record<string, unknown>,
    });
    return impact;
  }

  // ── Services — EX-ORG-03 ─────────────────────────────────────────────────

  /** `RG-ORG-03` — un service ne peut exister hors département. */
  async creerService(
    donnees: { nom: string; description?: string; departementId: string; managerId?: string | null },
    acteurId: string,
  ) {
    const departement = await this.prisma.departement.findUnique({
      where: { id: donnees.departementId },
      select: { id: true },
    });
    if (!departement) throw new ErreurOrganisation("service_hors_departement");

    const service = await this.prisma.service.create({
      data: {
        nom: donnees.nom,
        description: donnees.description ?? null,
        departementId: donnees.departementId,
        managerId: donnees.managerId ?? null,
      },
    });
    await this.audit.tracer({
      action: "service.create", typeEntite: "Service", entiteId: service.id, acteurId,
    });
    return service;
  }

  // ── Statistiques — EX-ORG-06 ─────────────────────────────────────────────

  async statistiques(id: string, niveau: "departement" | "service") {
    if (niveau === "departement") {
      const d = await this.prisma.departement.findUnique({
        where: { id },
        include: { _count: { select: { membres: true, services: true } } },
      });
      if (!d) throw new ErreurOrganisation("introuvable");
      return { effectif: d._count.membres, services: d._count.services };
    }
    const s = await this.prisma.service.findUnique({
      where: { id },
      include: { _count: { select: { membres: true } } },
    });
    if (!s) throw new ErreurOrganisation("introuvable");
    return { effectif: s._count.membres, services: 0 };
  }

  // ── Concurrence — RG-GEN-07 ──────────────────────────────────────────────

  /**
   * Mise à jour avec contrôle de version.
   *
   * `RG-GEN-07` — les conflits d'édition concurrente sont **détectés et
   * refusés**, jamais écrasés silencieusement. La version lue accompagne
   * l'écriture ; un écart signifie qu'un autre a écrit entre-temps.
   */
  async mettreAJour<T extends "direction" | "departement" | "service">(
    type: T,
    id: string,
    version: number,
    donnees: Record<string, unknown>,
    acteurId: string,
  ) {
    const table = this.prisma[type] as {
      updateMany: (a: unknown) => Promise<{ count: number }>;
      findUnique: (a: unknown) => Promise<{ version: number } | null>;
    };

    const { count } = await table.updateMany({
      where: { id, version },
      data: { ...donnees, version: { increment: 1 } },
    });

    if (count === 0) {
      const actuel = await table.findUnique({ where: { id } });
      if (!actuel) throw new ErreurOrganisation("introuvable");
      throw new ErreurOrganisation("conflit_de_version", {
        versionLue: version,
        versionActuelle: actuel.version,
      });
    }

    await this.audit.tracer({
      action: `${type}.update`,
      typeEntite: type.charAt(0).toUpperCase() + type.slice(1),
      entiteId: id,
      acteurId,
    });
  }

  private async refuserNomEnDouble(type: "direction" | "departement", nom: string) {
    const existe =
      type === "direction"
        ? await this.prisma.direction.findUnique({ where: { nom }, select: { id: true } })
        : await this.prisma.departement.findUnique({ where: { nom }, select: { id: true } });
    if (existe) throw new ErreurOrganisation("nom_deja_pris", { nom });
  }
}
