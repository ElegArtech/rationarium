import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma.service.js";
import { AuditService } from "../commun/audit.service.js";
import { PerimetreService, type Perimetre } from "../commun/perimetre.service.js";

/**
 * Événements — M9, vue 18.
 *
 * Le module porte une mécanique de récurrence simple en apparence et
 * traîtresse à l'usage : une série a un **parent**, et l'arrêt de la
 * récurrence ne détruit que le futur.
 */

export type EchecEvenement =
  | "participant_en_double"
  | "horizon_depasse"
  | "pas_un_parent"
  | "plage_incomplete"
  | "horaires_incoherents"
  | "introuvable";

export class ErreurEvenement extends Error {
  constructor(
    readonly code: EchecEvenement,
    readonly detail?: Record<string, unknown>,
  ) {
    super(code);
  }
}

@Injectable()
export class EvenementsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly perimetres: PerimetreService,
  ) {}

  /** Horizon maximal de récurrence, en années — parti pris n° 3 : c'est un paramètre. */
  private async horizonAnnees(): Promise<number> {
    const reglage = await this.prisma.setting.findUnique({
      where: { cle: "events.horizonRecurrenceAnnees" },
    });
    return Number(reglage?.valeur ?? 2);
  }

  /**
   * `EX-EVT-03`, `EX-EVT-05` — créer un événement, éventuellement récurrent.
   *
   * `RG-EVT-02` — la date de fin de récurrence ne peut dépasser un horizon
   * maximal paramétré. Sans ce plafond, une récurrence hebdomadaire sans fin
   * engendrerait des milliers d'occurrences, et le planning deviendrait
   * illisible autant qu'inexploitable.
   */
  async creer(
    donnees: {
      titre: string; description?: string; date: Date;
      journeeEntiere?: boolean; heureDebut?: string | null; heureFin?: string | null;
      projectId?: string | null; interventionExterieure?: boolean;
      participantIds?: string[]; serviceIds?: string[];
      recurrence?: { frequenceSemaines: number; jourSemaine: number; jusqua: Date };
    },
    acteurId: string,
  ) {
    if (!donnees.journeeEntiere && donnees.heureDebut && donnees.heureFin) {
      if (donnees.heureFin <= donnees.heureDebut) throw new ErreurEvenement("horaires_incoherents");
    }

    if (donnees.recurrence) {
      const horizon = await this.horizonAnnees();
      const limite = new Date(donnees.date);
      limite.setUTCFullYear(limite.getUTCFullYear() + horizon);
      if (donnees.recurrence.jusqua > limite) {
        throw new ErreurEvenement("horizon_depasse", {
          horizonAnnees: horizon,
          limite: limite.toISOString().slice(0, 10),
        });
      }
    }

    // EX-EVT-04 — inviter des services entiers, dépliés à la création.
    const parServices = donnees.serviceIds?.length
      ? await this.prisma.userService.findMany({
          where: { serviceId: { in: donnees.serviceIds } },
          select: { userId: true },
        })
      : [];
    const participants = [
      ...new Set([...(donnees.participantIds ?? []), ...parServices.map((s) => s.userId)]),
    ];

    const base = {
      titre: donnees.titre,
      description: donnees.description ?? null,
      journeeEntiere: donnees.journeeEntiere ?? false,
      heureDebut: donnees.heureDebut ?? null,
      heureFin: donnees.heureFin ?? null,
      projectId: donnees.projectId ?? null,
      interventionExterieure: donnees.interventionExterieure ?? false,
    };

    const parent = await this.prisma.event.create({
      data: {
        ...base,
        date: donnees.date,
        recurrenceFrequence: donnees.recurrence?.frequenceSemaines ?? null,
        recurrenceJourSemaine: donnees.recurrence?.jourSemaine ?? null,
        recurrenceFin: donnees.recurrence?.jusqua ?? null,
        participants: { create: participants.map((userId) => ({ userId })) },
      },
    });

    let occurrences = 0;
    if (donnees.recurrence) {
      const dates: Date[] = [];
      const pas = donnees.recurrence.frequenceSemaines * 7 * 86_400_000;
      for (
        let d = new Date(donnees.date.getTime() + pas);
        d <= donnees.recurrence.jusqua;
        d = new Date(d.getTime() + pas)
      ) {
        dates.push(new Date(d));
      }
      for (const date of dates) {
        await this.prisma.event.create({
          data: {
            ...base,
            date,
            parentId: parent.id,
            participants: { create: participants.map((userId) => ({ userId })) },
          },
        });
      }
      occurrences = dates.length;
    }

    await this.audit.tracer({
      action: "event.create", typeEntite: "Event", entiteId: parent.id, acteurId,
      detail: { occurrences, participants: participants.length },
    });
    return { evenement: parent, occurrences };
  }

  /** `RG-EVT-01` — un même utilisateur ne peut être participant deux fois. */
  async ajouterParticipant(eventId: string, userId: string, acteurId: string) {
    const existe = await this.prisma.eventParticipant.findUnique({
      where: { eventId_userId: { eventId, userId } },
    });
    if (existe) throw new ErreurEvenement("participant_en_double");

    await this.prisma.eventParticipant.create({ data: { eventId, userId } });
    await this.audit.tracer({
      action: "event.participant_add", typeEntite: "Event", entiteId: eventId, acteurId,
      detail: { userId },
    });
  }

  async retirerParticipant(eventId: string, userId: string, acteurId: string) {
    await this.prisma.eventParticipant.delete({ where: { eventId_userId: { eventId, userId } } });
    await this.audit.tracer({
      action: "event.participant_remove", typeEntite: "Event", entiteId: eventId, acteurId,
      detail: { userId },
    });
  }

  /**
   * `EX-EVT-07`, `RG-EVT-03`, `RG-EVT-04` — arrêter une récurrence.
   *
   * Seul un événement **parent** peut voir sa récurrence arrêtée, et l'arrêt
   * **supprime les occurrences futures en conservant les passées**. Effacer
   * tout serait détruire de l'historique ; ne rien effacer laisserait des
   * réunions fantômes au calendrier.
   */
  async arreterRecurrence(eventId: string, aPartirDe: Date, acteurId: string) {
    const evenement = await this.prisma.event.findUnique({
      where: { id: eventId },
      select: { parentId: true, recurrenceFrequence: true },
    });
    if (!evenement) throw new ErreurEvenement("introuvable");
    if (evenement.parentId !== null || evenement.recurrenceFrequence === null) {
      throw new ErreurEvenement("pas_un_parent");
    }

    const { count } = await this.prisma.event.deleteMany({
      where: { parentId: eventId, date: { gte: aPartirDe } },
    });
    await this.prisma.event.update({
      where: { id: eventId },
      data: { recurrenceFin: aPartirDe, version: { increment: 1 } },
    });

    await this.audit.tracer({
      action: "event.recurrence_stop", typeEntite: "Event", entiteId: eventId, acteurId,
      detail: { occurrencesSupprimees: count },
    });
    return { supprimees: count };
  }

  /**
   * `EX-EVT-09`, `RG-EVT-05` — les événements d'une plage.
   *
   * Les paramètres de début et de fin sont **obligatoires** : une plage
   * ouverte ramènerait toute l'histoire de l'instance, ce qui n'est pas une
   * requête de calendrier mais un export déguisé.
   */
  async surPlage(
    perimetre: Perimetre,
    permissions: ReadonlySet<string>,
    debut: Date | null,
    fin: Date | null,
    filtres: { projectId?: string; userId?: string } = {},
  ) {
    if (!debut || !fin) throw new ErreurEvenement("plage_incomplete");

    const clauses: Record<string, unknown>[] = [{ date: { gte: debut, lte: fin } }];

    // Sans lecture élargie, on ne voit que les événements où l'on participe.
    if (!perimetre.global && !permissions.has("events:readAll")) {
      clauses.push({ participants: { some: { userId: perimetre.userId } } });
    }
    if (filtres.projectId) clauses.push({ projectId: filtres.projectId });
    if (filtres.userId) clauses.push({ participants: { some: { userId: filtres.userId } } });

    return this.prisma.event.findMany({
      where: { AND: clauses },
      orderBy: [{ date: "asc" }, { heureDebut: "asc" }],
      include: {
        project: { select: { id: true, nom: true } },
        participants: { include: { user: { select: { id: true, prenom: true, nom: true } } } },
      },
    });
  }
}
