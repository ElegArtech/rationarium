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
  | "portee_requise"
  | "portee_sans_serie"
  | "date_non_propageable"
  | "conflit_de_version"
  | "hors_perimetre"
  | "introuvable";

export class ErreurEvenement extends Error {
  constructor(
    readonly code: EchecEvenement,
    readonly detail?: Record<string, unknown>,
  ) {
    super(code);
  }
}

/**
 * `RG-EVT-07` — la portée d'un geste porté sur une série.
 *
 * Le vocabulaire est fermé et il n'a que deux valeurs, parce que la question
 * posée à l'utilisateur n'en a que deux : « cette occurrence » ou « celle-ci et
 * les suivantes ». Une troisième — « toute la série, passé compris » — n'existe
 * pas : c'est exactement ce que `RG-EVT-04` refuse depuis `EX-EVT-07`.
 */
export type PorteeEvenement = "occurrence" | "serie";

@Injectable()
export class EvenementsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly perimetres: PerimetreService,
  ) {}

  /**
   * Le prédicat de périmètre des événements — **une seule définition**, celle
   * que la lecture et l'écriture partagent.
   *
   * Le dépôt a déjà payé deux fonctions qui lisaient la même table avec deux
   * prédicats différents (`joursFeries` / `joursChomes`) : chacune avait ses
   * tests, tous verts, et elles se contredisaient. Ici l'enjeu est pire qu'un
   * affichage — un périmètre d'écriture plus large que le périmètre de lecture
   * laisserait modifier ce qu'on n'a pas le droit de voir. D'où le partage.
   *
   * Rend `null` quand rien ne borne : périmètre global (`RG-SCOPE-03`) ou
   * lecture élargie. Sinon, la participation est la seule attache d'un
   * événement à une personne — la table n'a pas de colonne de créateur.
   */
  private clauseVisibilite(
    perimetre: Perimetre,
    permissions: ReadonlySet<string>,
  ): Record<string, unknown> | null {
    if (perimetre.global || permissions.has("events:readAll")) return null;
    return { participants: { some: { userId: perimetre.userId } } };
  }

  /**
   * Charge un événement **après** l'avoir confronté au périmètre.
   *
   * `cadrage/03 § 5.4` — permission d'abord (la garde de la route l'a déjà
   * exigée), périmètre ensuite. « Introuvable » et « hors périmètre » sont
   * distingués : les confondre priverait l'utilisateur de l'information qui lui
   * dit à qui s'adresser.
   */
  private async chargerVisible(
    eventId: string,
    perimetre: Perimetre,
    permissions: ReadonlySet<string>,
  ) {
    const evenement = await this.prisma.event.findUnique({
      where: { id: eventId },
      select: {
        id: true, date: true, version: true, parentId: true, journeeEntiere: true,
        heureDebut: true, heureFin: true, titre: true,
        recurrenceFrequence: true, recurrenceJourSemaine: true, recurrenceFin: true,
      },
    });
    if (!evenement) throw new ErreurEvenement("introuvable");

    const clause = this.clauseVisibilite(perimetre, permissions);
    if (clause) {
      const visible = await this.prisma.event.findFirst({
        where: { AND: [{ id: eventId }, clause] },
        select: { id: true },
      });
      if (!visible) throw new ErreurEvenement("hors_perimetre");
    }
    return evenement;
  }

  /**
   * `RG-EVT-07` — la portée est **obligatoire sur une série, interdite hors
   * série**.
   *
   * Les deux refus tiennent la même exigence, prise par ses deux bouts. Le
   * brief de la vue 18 demande que « la distinction entre modifier une
   * occurrence et modifier toute la série soit explicite au moment de l'action,
   * pas découverte après coup » : un serveur qui choisirait une portée par
   * défaut laisserait un client sauter la question, et l'utilisateur
   * découvrirait l'effet après coup — précisément ce que le brief refuse.
   * Symétriquement, accepter une portée sur un événement isolé donnerait raison
   * à un client qui croit agir sur une série inexistante.
   */
  private porteeExigee(
    evenement: { parentId: string | null; recurrenceFrequence: number | null },
    demandee: PorteeEvenement | undefined,
  ): PorteeEvenement | null {
    const serie = evenement.parentId !== null || evenement.recurrenceFrequence !== null;
    if (serie && demandee === undefined) throw new ErreurEvenement("portee_requise");
    if (!serie && demandee !== undefined) throw new ErreurEvenement("portee_sans_serie");
    return demandee ?? null;
  }

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

  /**
   * `EX-EVT-06`, `RG-EVT-07`, `RG-GEN-07` — modifier un événement.
   *
   * Trois choses s'y jouent, dans cet ordre :
   *
   *   1. **le périmètre**, avant toute lecture de contenu ;
   *   2. **la portée**, exigée dès que l'événement appartient à une série ;
   *   3. **la version**, réclamée atomiquement dans la clause `where` — jamais
   *      relue puis comparée, ce qui rouvrirait la fenêtre entre les deux.
   *
   * `RG-EVT-07` — la portée `serie` ne touche que l'occurrence visée **et les
   * suivantes**. Les occurrences antérieures restent telles quelles : ce sont
   * des réunions déjà tenues, et réécrire leur titre réécrirait l'histoire de
   * ceux qui y étaient. C'est la même borne que `RG-EVT-04`.
   */
  async modifier(
    eventId: string,
    donnees: {
      version: number;
      portee?: PorteeEvenement;
      titre?: string;
      description?: string | null;
      date?: Date;
      journeeEntiere?: boolean;
      heureDebut?: string | null;
      heureFin?: string | null;
      projectId?: string | null;
      interventionExterieure?: boolean;
    },
    acteurId: string,
    perimetre: Perimetre,
    permissions: ReadonlySet<string>,
  ) {
    const avant = await this.chargerVisible(eventId, perimetre, permissions);
    const portee = this.porteeExigee(avant, donnees.portee);

    /*
     * La cohérence des horaires se contrôle sur l'état RÉSULTANT, jamais sur le
     * seul corps reçu : ne changer que `heureFin` pour la faire passer avant
     * une `heureDebut` déjà en base est licite requête par requête, et interdit
     * en résultat.
     */
    const journeeEntiere = donnees.journeeEntiere ?? avant.journeeEntiere;
    const heureDebut = donnees.heureDebut !== undefined ? donnees.heureDebut : avant.heureDebut;
    const heureFin = donnees.heureFin !== undefined ? donnees.heureFin : avant.heureFin;
    if (!journeeEntiere && heureDebut && heureFin && heureFin <= heureDebut) {
      throw new ErreurEvenement("horaires_incoherents");
    }

    /*
     * `RG-EVT-07` — la date est la seule chose qu'une série ne propage pas :
     * elle est ce qui DISTINGUE deux occurrences. Poser la même date sur toutes
     * les effondrerait en un tas de doublons le même jour. Le refus est explicite
     * plutôt que silencieux : ignorer le champ ferait croire à une modification
     * appliquée.
     */
    if (portee === "serie" && donnees.date !== undefined) {
      throw new ErreurEvenement("date_non_propageable");
    }

    const champs = {
      ...(donnees.titre !== undefined ? { titre: donnees.titre } : {}),
      ...(donnees.description !== undefined ? { description: donnees.description } : {}),
      ...(donnees.date !== undefined ? { date: donnees.date } : {}),
      ...(donnees.journeeEntiere !== undefined ? { journeeEntiere: donnees.journeeEntiere } : {}),
      ...(donnees.heureDebut !== undefined ? { heureDebut: donnees.heureDebut } : {}),
      ...(donnees.heureFin !== undefined ? { heureFin: donnees.heureFin } : {}),
      ...(donnees.projectId !== undefined ? { projectId: donnees.projectId } : {}),
      ...(donnees.interventionExterieure !== undefined
        ? { interventionExterieure: donnees.interventionExterieure }
        : {}),
    };

    const touchees = await this.prisma.$transaction(async (tx) => {
      // `RG-GEN-07` — la version fait partie du `where`. Un écart ne met à jour
      // aucune ligne : la concurrence est DÉTECTÉE, jamais écrasée.
      const { count } = await tx.event.updateMany({
        where: { id: eventId, version: donnees.version },
        data: { ...champs, version: { increment: 1 } },
      });
      if (count === 0) {
        throw new ErreurEvenement("conflit_de_version", {
          attendue: avant.version,
          recue: donnees.version,
        });
      }
      if (portee !== "serie") return 1;

      const parentId = avant.parentId ?? avant.id;
      const suite = await tx.event.updateMany({
        where: {
          OR: [{ id: parentId }, { parentId }],
          date: { gte: avant.date },
          id: { not: eventId },
        },
        data: { ...champs, version: { increment: 1 } },
      });
      return 1 + suite.count;
    });

    await this.audit.tracer({
      action: "event.update", typeEntite: "Event", entiteId: eventId, acteurId,
      detail: { portee: portee ?? "evenement_isole", occurrencesTouchees: touchees },
    });
    return this.prisma.event.findUniqueOrThrow({ where: { id: eventId } });
  }

  /**
   * `EX-EVT-06`, `RG-EVT-07`, `RG-GEN-07` — supprimer un événement.
   *
   * ══════════════════════════════════════════════════════════════════════════
   * LE PIÈGE DE CE MODULE, et il est en base : le schéma déclare
   * `parent Event? @relation("Serie", onDelete: Cascade)`. **Supprimer le
   * parent d'une série efface toute la série, le passé compris** — une seule
   * ligne détruite, et douze réunions déjà tenues disparaissent de l'historique
   * de ceux qui y étaient. C'est exactement ce que `RG-EVT-04` refuse pour
   * l'arrêt de récurrence, revenu par la porte de la suppression.
   *
   * La parade n'est pas de refuser de supprimer un parent — ce serait rendre la
   * première occurrence d'une série indestructible. C'est de **promouvoir** la
   * plus ancienne occurrence conservée au rang de parent avant de détruire
   * l'ancien : la cascade n'a alors plus rien à emporter.
   * ══════════════════════════════════════════════════════════════════════════
   */
  async supprimer(
    eventId: string,
    donnees: { version: number; portee?: PorteeEvenement },
    acteurId: string,
    perimetre: Perimetre,
    permissions: ReadonlySet<string>,
  ) {
    const avant = await this.chargerVisible(eventId, perimetre, permissions);
    const portee = this.porteeExigee(avant, donnees.portee);

    const supprimees = await this.prisma.$transaction(async (tx) => {
      /*
       * `RG-GEN-07` d'abord, et par un incrément de version plutôt que par une
       * relecture : c'est la seule écriture qui verrouille la ligne
       * atomiquement. La ligne sera détruite juste après ; l'incrément ne sert
       * qu'à faire échouer un appelant dont la lecture est périmée.
       */
      const { count } = await tx.event.updateMany({
        where: { id: eventId, version: donnees.version },
        data: { version: { increment: 1 } },
      });
      if (count === 0) {
        throw new ErreurEvenement("conflit_de_version", {
          attendue: avant.version,
          recue: donnees.version,
        });
      }

      const parentId = avant.parentId ?? avant.id;
      const membres = await tx.event.findMany({
        where: { OR: [{ id: parentId }, { parentId }] },
        orderBy: { date: "asc" },
        select: {
          id: true, date: true,
          recurrenceFrequence: true, recurrenceJourSemaine: true, recurrenceFin: true,
        },
      });

      // `RG-EVT-07` — « toute la série » signifie *à partir d'ici*. La borne est
      // la date de l'occurrence visée, celle-là même que `RG-EVT-04` emploie.
      const cibles =
        portee === "serie" ? membres.filter((m) => m.date >= avant.date) : [{ id: avant.id }];
      const aSupprimer = new Set(cibles.map((c) => c.id));
      const survivants = membres.filter((m) => !aSupprimer.has(m.id));

      // La promotion : voir l'encadré ci-dessus. Sans elle, la cascade emporte
      // le passé.
      const parent = membres.find((m) => m.id === parentId);
      if (aSupprimer.has(parentId) && survivants.length > 0) {
        const [nouveau, ...rattaches] = survivants as [
          (typeof survivants)[number],
          ...(typeof survivants)[number][],
        ];
        await tx.event.update({
          where: { id: nouveau.id },
          data: {
            parentId: null,
            recurrenceFrequence: parent?.recurrenceFrequence ?? null,
            recurrenceJourSemaine: parent?.recurrenceJourSemaine ?? null,
            recurrenceFin: parent?.recurrenceFin ?? null,
            version: { increment: 1 },
          },
        });
        if (rattaches.length > 0) {
          await tx.event.updateMany({
            where: { id: { in: rattaches.map((r) => r.id) } },
            data: { parentId: nouveau.id, version: { increment: 1 } },
          });
        }
      }

      const { count: detruites } = await tx.event.deleteMany({
        where: { id: { in: [...aSupprimer] } },
      });

      /*
       * La série qui survit déclare sa nouvelle fin, comme `arreterRecurrence` :
       * sans cela, une regénération future recréerait ce qu'on vient de
       * supprimer, et le panneau de détail annoncerait des occurrences qui
       * n'existent plus.
       */
      if (portee === "serie" && !aSupprimer.has(parentId)) {
        await tx.event.update({
          where: { id: parentId },
          data: { recurrenceFin: avant.date, version: { increment: 1 } },
        });
      }
      return detruites;
    });

    await this.audit.tracer({
      action: "event.delete", typeEntite: "Event", entiteId: eventId, acteurId,
      detail: { portee: portee ?? "evenement_isole", supprimees, titre: avant.titre },
    });
    return { supprimees };
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
  async arreterRecurrence(
    eventId: string,
    aPartirDe: Date,
    acteurId: string,
    perimetre: Perimetre,
    permissions: ReadonlySet<string>,
  ) {
    // Le périmètre manquait ici : la route exigeait `events:update` et n'a
    // jamais confronté l'événement au périmètre de l'appelant. Écrire sur ce
    // qu'on n'a pas le droit de lire est un défaut de cloisonnement, pas une
    // omission — corrigé en L-42, avec le même prédicat que la lecture.
    const evenement = await this.chargerVisible(eventId, perimetre, permissions);
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
    // Le prédicat est celui que l'écriture emploie aussi : une définition, pas
    // deux — voir `clauseVisibilite`.
    const visibilite = this.clauseVisibilite(perimetre, permissions);
    if (visibilite) clauses.push(visibilite);
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
