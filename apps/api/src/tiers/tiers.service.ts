import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma.service.js";
import { AuditService } from "../commun/audit.service.js";
import type { TypeTiers } from "@trame/contracts";

/**
 * Tiers et clients — M14, vues 23 à 26.
 *
 * Deux notions voisines qu'il ne faut pas confondre : un **tiers** est un
 * intervenant externe qui travaille sur les projets ; un **client** est un
 * bénéficiaire ou commanditaire. Le premier consomme du temps, le second en
 * reçoit le résultat.
 */

export type EchecTiers =
  | "contact_sur_personne_morale"
  | "tiers_archive"
  | "deja_rattache"
  | "non_rattache_au_projet"
  | "suppression_bloquee"
  | "client_inactif"
  | "introuvable";

export class ErreurTiers extends Error {
  constructor(
    readonly code: EchecTiers,
    readonly detail?: Record<string, unknown>,
  ) {
    super(code);
  }
}

@Injectable()
export class TiersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ── Tiers — EX-TRS-01 ────────────────────────────────────────────────────

  /** `RG-TRS-01` — un tiers de type *personne morale* ne porte pas de contact nommé. */
  async creerTiers(
    donnees: {
      type: TypeTiers; organisation?: string | null;
      contactNom?: string | null; contactEmail?: string | null; contactTelephone?: string | null;
      notes?: string;
    },
    acteurId: string,
  ) {
    if (donnees.type === "organisation" && donnees.contactNom) {
      throw new ErreurTiers("contact_sur_personne_morale");
    }
    const tiers = await this.prisma.thirdParty.create({
      data: {
        type: donnees.type,
        organisation: donnees.organisation ?? null,
        contactNom: donnees.contactNom ?? null,
        contactEmail: donnees.contactEmail ?? null,
        contactTelephone: donnees.contactTelephone ?? null,
        notes: donnees.notes ?? null,
      },
    });
    await this.audit.tracer({
      action: "third_party.create", typeEntite: "ThirdParty", entiteId: tiers.id, acteurId,
    });
    return tiers;
  }

  /** `RG-TRS-02` — un tiers archivé n'est plus assignable. */
  private async refuserSiArchive(thirdPartyId: string) {
    const tiers = await this.prisma.thirdParty.findUnique({
      where: { id: thirdPartyId },
      select: { actif: true },
    });
    if (!tiers) throw new ErreurTiers("introuvable");
    if (!tiers.actif) throw new ErreurTiers("tiers_archive");
  }

  /** `EX-TRS-02` — rattacher un tiers à un projet. `RG-TRS-03` — pas deux fois. */
  async rattacherAuProjet(projectId: string, thirdPartyId: string, acteurId: string) {
    await this.refuserSiArchive(thirdPartyId);
    const existe = await this.prisma.projectThirdParty.findUnique({
      where: { projectId_thirdPartyId: { projectId, thirdPartyId } },
    });
    if (existe) throw new ErreurTiers("deja_rattache");

    await this.prisma.projectThirdParty.create({ data: { projectId, thirdPartyId } });
    await this.audit.tracer({
      action: "third_party.attach_project", typeEntite: "ThirdParty", entiteId: thirdPartyId,
      acteurId, detail: { projectId },
    });
  }

  /**
   * `EX-TRS-02` — assigner un tiers à une tâche.
   *
   * `RG-TRS-04` — **assignable seulement s'il est rattaché à la tâche ou à son
   * projet parent.** La règle empêche qu'un prestataire apparaisse sur une
   * tâche d'un projet auquel il n'a jamais été associé — ce qui, dans le
   * planning, le rendrait visible sans qu'on sache pourquoi.
   */
  async assignerALaTache(taskId: string, thirdPartyId: string, acteurId: string) {
    await this.refuserSiArchive(thirdPartyId);

    const tache = await this.prisma.task.findUnique({
      where: { id: taskId },
      select: { projectId: true },
    });
    if (!tache) throw new ErreurTiers("introuvable");

    if (tache.projectId) {
      const rattache = await this.prisma.projectThirdParty.findUnique({
        where: { projectId_thirdPartyId: { projectId: tache.projectId, thirdPartyId } },
      });
      if (!rattache) throw new ErreurTiers("non_rattache_au_projet");
    }

    const existe = await this.prisma.taskThirdParty.findUnique({
      where: { taskId_thirdPartyId: { taskId, thirdPartyId } },
    });
    if (existe) throw new ErreurTiers("deja_rattache");

    await this.prisma.taskThirdParty.create({ data: { taskId, thirdPartyId } });
    await this.audit.tracer({
      action: "third_party.assign_task", typeEntite: "ThirdParty", entiteId: thirdPartyId,
      acteurId, detail: { taskId },
    });
  }

  /**
   * `EX-TRS-06`, `RG-TRS-05` — bilan d'impact **avant** suppression.
   *
   * Comme pour les utilisateurs et les projets : ce qui bloque et ce qui
   * s'efface sont distingués, et une alternative est proposée quand on refuse.
   */
  async impactSuppressionTiers(id: string) {
    const [temps, projets, taches] = await Promise.all([
      this.prisma.timeEntry.count({ where: { thirdPartyId: id } }),
      this.prisma.projectThirdParty.count({ where: { thirdPartyId: id } }),
      this.prisma.taskThirdParty.count({ where: { thirdPartyId: id } }),
    ]);
    const blocages = temps > 0 ? [{ objet: "heures déclarées", nombre: temps }] : [];
    return {
      blocages,
      effacements: [
        ...(projets > 0 ? [{ objet: "rattachements de projet", nombre: projets }] : []),
        ...(taches > 0 ? [{ objet: "assignations de tâche", nombre: taches }] : []),
      ],
      alternative: blocages.length > 0 ? ("archiver" as const) : null,
    };
  }

  async supprimerTiers(id: string, acteurId: string) {
    const impact = await this.impactSuppressionTiers(id);
    if (impact.blocages.length > 0) {
      throw new ErreurTiers("suppression_bloquee", {
        blocages: impact.blocages,
        alternative: impact.alternative,
      });
    }
    await this.audit.tracer({
      action: "third_party.delete", typeEntite: "ThirdParty", entiteId: id, acteurId,
    });
    await this.prisma.thirdParty.delete({ where: { id } });
  }

  /** `EX-TRS-03` — la fiche d'un tiers et ses rattachements. */
  async ficheTiers(id: string) {
    const tiers = await this.prisma.thirdParty.findUnique({
      where: { id },
      include: {
        projets: { include: { project: { select: { id: true, nom: true, statut: true } } } },
        taches: { include: { task: { select: { id: true, titre: true, statut: true } } } },
        _count: { select: { saisiesTemps: true } },
      },
    });
    if (!tiers) throw new ErreurTiers("introuvable");
    return {
      ...tiers,
      projets: tiers.projets.map((p) => p.project),
      taches: tiers.taches.map((t) => t.task),
      heuresDeclarees: tiers._count.saisiesTemps,
    };
  }

  // ── Clients — EX-TRS-04, EX-TRS-05 ───────────────────────────────────────

  async creerClient(
    donnees: {
      nom: string; contactNom?: string | null; contactEmail?: string | null;
      contactTelephone?: string | null; adresse?: string | null; notes?: string;
    },
    acteurId: string,
  ) {
    const client = await this.prisma.client.create({
      data: {
        nom: donnees.nom,
        contactNom: donnees.contactNom ?? null,
        contactEmail: donnees.contactEmail ?? null,
        contactTelephone: donnees.contactTelephone ?? null,
        adresse: donnees.adresse ?? null,
        notes: donnees.notes ?? null,
      },
    });
    await this.audit.tracer({
      action: "client.create", typeEntite: "Client", entiteId: client.id, acteurId,
    });
    return client;
  }

  /**
   * `EX-PRJ-10`, `RG-PRJ-10` — seuls les clients **actifs** sont rattachables,
   * et un client introuvable ou inactif produit une erreur **nommant les
   * entrées fautives**. Rattacher en silence ce qui existe et ignorer le reste
   * laisserait l'utilisateur croire que tout a été fait.
   */
  async rattacherClients(projectId: string, clientIds: string[], acteurId: string) {
    const clients = await this.prisma.client.findMany({
      where: { id: { in: clientIds } },
      select: { id: true, nom: true, actif: true },
    });

    const trouves = new Set(clients.map((c) => c.id));
    const introuvables = clientIds.filter((id) => !trouves.has(id));
    const inactifs = clients.filter((c) => !c.actif);

    if (introuvables.length > 0 || inactifs.length > 0) {
      throw new ErreurTiers("client_inactif", {
        introuvables,
        inactifs: inactifs.map((c) => c.nom),
      });
    }

    const deja = await this.prisma.projectClient.findMany({
      where: { projectId, clientId: { in: clientIds } },
      select: { clientId: true },
    });
    const dejaSet = new Set(deja.map((d) => d.clientId));
    const aCreer = clientIds.filter((id) => !dejaSet.has(id));

    await this.prisma.projectClient.createMany({
      data: aCreer.map((clientId) => ({ projectId, clientId })),
    });
    await this.audit.tracer({
      action: "client.attach_project", typeEntite: "Project", entiteId: projectId, acteurId,
      detail: { rattaches: aCreer.length, deja: dejaSet.size },
    });
    return { rattaches: aCreer.length, dejaRattaches: dejaSet.size };
  }

  /** `EX-TRS-05` — la fiche d'un client et ses projets. */
  async ficheClient(id: string) {
    const client = await this.prisma.client.findUnique({
      where: { id },
      include: {
        projets: {
          include: {
            project: { select: { id: true, nom: true, statut: true, dateDebut: true, dateFin: true } },
          },
        },
      },
    });
    if (!client) throw new ErreurTiers("introuvable");
    return { ...client, projets: client.projets.map((p) => p.project) };
  }

  async impactSuppressionClient(id: string) {
    const projets = await this.prisma.projectClient.count({ where: { clientId: id } });
    return {
      blocages: projets > 0 ? [{ objet: "projets rattachés", nombre: projets }] : [],
      effacements: [],
      alternative: projets > 0 ? ("desactiver" as const) : null,
    };
  }
}
