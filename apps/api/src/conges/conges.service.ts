import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma.service.js";
import { AuditService } from "../commun/audit.service.js";
import { PerimetreService, type Perimetre } from "../commun/perimetre.service.js";
import { CalendrierService } from "../parametrage/calendrier.service.js";
import { NotificationsService } from "../notifications/notifications.service.js";
import type { DemiJournee } from "@rationarium/contracts";

/**
 * Congés — M10, vue 19. **Le module le plus riche en règles du cadrage** :
 * trente-deux `RG-CNG`, et la criticité la plus haute avec l'authentification.
 *
 * Trois familles de règles s'y croisent, et c'est leur croisement qui est
 * délicat :
 *
 *   **Cycle de vie** (`RG-CNG-01` à `07`) — un graphe d'états dont chaque
 *   transition a ses conditions. Un congé approuvé ne s'annule pas
 *   directement : il passe par une demande d'annulation.
 *
 *   **Validation** (`RG-CNG-08` à `15`) — qui décide, et à quelles conditions.
 *   La délégation est **cantonnée au département du demandeur**, ce qui est la
 *   règle la plus facile à implémenter de travers.
 *
 *   **Décompte et soldes** (`RG-CNG-16` à `24`) — le solde est recontrôlé à
 *   l'approbation, pas seulement au dépôt.
 */

export type EchecConge =
  | "type_inactif"
  | "chevauchement"
  | "solde_insuffisant"
  | "statut_incompatible"
  | "auto_validation_interdite"
  | "hors_perimetre"
  | "collaborateur_inactif"
  | "pas_son_conge"
  | "delegue_inactif"
  | "allocation_modifiee"
  | "introuvable";

export class ErreurConge extends Error {
  constructor(
    readonly code: EchecConge,
    readonly detail?: Record<string, unknown>,
  ) {
    super(code);
  }
}

export type Solde = {
  annee: number;
  attribues: number;
  consommes: number;
  engages: number;
  disponibles: number;
};

@Injectable()
export class CongesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly perimetres: PerimetreService,
    private readonly calendrier: CalendrierService,
    private readonly notifications: NotificationsService,
  ) {}

  // ── Soldes — RG-CNG-20, RG-CNG-24 ────────────────────────────────────────

  /**
   * `RG-CNG-20` — le solde disponible est :
   *   jours attribués − jours consommés (approuvés) − jours engagés (en attente).
   *
   * Les **engagés** comptent : une demande en attente réserve son solde. Sans
   * cela, un agent pourrait déposer dix demandes couvrant chacune la totalité
   * de son droit, et toutes passeraient le contrôle de dépôt.
   *
   * `RG-CNG-24` — un solde peut être défini par agent, ou globalement par
   * défaut. L'allocation propre à l'agent l'emporte sur le défaut global.
   */
  /**
   * `RG-CNG-24` — **attribuer des jours**, par agent ou globalement.
   *
   * Rien ne les attribuait. `leaveBalance` n'était lue nulle part ailleurs
   * qu'ici : ni route, ni import, ni amorçage n'écrivait une seule ligne. Sur
   * une instance neuve, `attribues` valait donc zéro pour tout le monde, et
   * `RG-CNG-20` refusait **toute** demande de congé — le module entier était
   * inutilisable, sans qu'aucun contrôle ne le dise, parce que chaque test
   * fabriquait son allocation avant de commencer.
   *
   * `userId` à `null` définit le **défaut global** ; une allocation propre à
   * l'agent l'emporte sur lui, comme le dit la règle.
   *
   * `RG-GEN-07` — la version transmise est celle qu'on a lue. Un écart lève
   * plutôt que d'écraser : deux gestionnaires qui attribuent le même solde en
   * même temps ne doivent pas se marcher dessus en silence.
   */
  async attribuerSolde(
    donnees: {
      userId: string | null;
      typeId: string;
      annee: number;
      joursAttribues: number;
      version?: number;
    },
    acteurId: string,
  ) {
    const type = await this.prisma.leaveType.findUnique({
      where: { id: donnees.typeId },
      select: { id: true, actif: true, nom: true },
    });
    if (!type) throw new ErreurConge("introuvable");
    if (!type.actif) throw new ErreurConge("type_inactif");

    const existante = donnees.userId
      ? await this.prisma.leaveBalance.findUnique({
          where: {
            userId_typeId_annee: {
              userId: donnees.userId,
              typeId: donnees.typeId,
              annee: donnees.annee,
            },
          },
        })
      : await this.prisma.leaveBalance.findFirst({
          where: { userId: null, typeId: donnees.typeId, annee: donnees.annee },
        });

    if (existante && donnees.version !== undefined && existante.version !== donnees.version) {
      throw new ErreurConge("allocation_modifiee");
    }

    const solde = existante
      ? await this.prisma.leaveBalance.update({
          where: { id: existante.id },
          data: { joursAttribues: donnees.joursAttribues, version: { increment: 1 } },
        })
      : await this.prisma.leaveBalance.create({
          data: {
            userId: donnees.userId,
            typeId: donnees.typeId,
            annee: donnees.annee,
            joursAttribues: donnees.joursAttribues,
          },
        });

    await this.audit.tracer({
      action: "leave.balance_set",
      typeEntite: "LeaveBalance",
      entiteId: solde.id,
      acteurId,
      detail: {
        userId: donnees.userId,
        type: type.nom,
        annee: donnees.annee,
        avant: existante ? Number(existante.joursAttribues) : null,
        apres: donnees.joursAttribues,
      },
    });
    return solde;
  }

  async solde(userId: string, typeId: string, annee: number): Promise<Solde> {
    const [propre, global] = await Promise.all([
      this.prisma.leaveBalance.findUnique({
        where: { userId_typeId_annee: { userId, typeId, annee } },
        select: { joursAttribues: true },
      }),
      this.prisma.leaveBalance.findFirst({
        where: { userId: null, typeId, annee },
        select: { joursAttribues: true },
      }),
    ]);

    const attribues = Number(propre?.joursAttribues ?? global?.joursAttribues ?? 0);

    const parts = await this.prisma.leaveYearAllocation.findMany({
      where: {
        annee,
        leave: { userId, typeId, statut: { in: ["approved", "pending", "cancellation_requested"] } },
      },
      select: { jours: true, leave: { select: { statut: true } } },
    });

    const consommes = parts
      .filter((p) => p.leave.statut !== "pending")
      .reduce((n, p) => n + Number(p.jours), 0);
    const engages = parts
      .filter((p) => p.leave.statut === "pending")
      .reduce((n, p) => n + Number(p.jours), 0);

    return {
      annee,
      attribues,
      consommes,
      engages,
      disponibles: attribues - consommes - engages,
    };
  }

  /**
   * `RG-CNG-21` — un solde insuffisant bloque, **avec un message chiffré** :
   * jours demandés, disponibles, manquants, pour l'année concernée.
   *
   * Le détail n'est pas décoratif : « solde insuffisant » sans chiffres oblige
   * l'agent à aller les chercher ailleurs pour ajuster sa demande.
   */
  private async controlerSolde(
    userId: string,
    typeId: string,
    repartition: { annee: number; jours: number }[],
    exclureCongeId?: string,
  ) {
    for (const part of repartition) {
      const s = await this.solde(userId, typeId, part.annee);

      // Une modification recompte sans son propre engagement précédent.
      let disponibles = s.disponibles;
      if (exclureCongeId) {
        const ancien = await this.prisma.leaveYearAllocation.findUnique({
          where: { leaveId_annee: { leaveId: exclureCongeId, annee: part.annee } },
          select: { jours: true },
        });
        disponibles += Number(ancien?.jours ?? 0);
      }

      if (part.jours > disponibles) {
        throw new ErreurConge("solde_insuffisant", {
          annee: part.annee,
          demandes: part.jours,
          disponibles,
          manquants: Number((part.jours - disponibles).toFixed(1)),
        });
      }
    }
  }

  // ── Chevauchement — RG-CNG-25 à 27 ───────────────────────────────────────

  /**
   * Le chevauchement est **doublé en base** par une contrainte d'exclusion
   * GiST (L-02). Ce contrôle applicatif existe pour produire le message
   * métier rédigé ; la base garantit qu'aucune concurrence ne le contourne.
   */
  private async refuserChevauchement(
    userId: string,
    debut: Date,
    fin: Date,
    exclureId?: string,
  ) {
    const conflit = await this.prisma.leave.findFirst({
      where: {
        userId,
        statut: { in: ["pending", "approved", "cancellation_requested"] },
        dateDebut: { lte: fin },
        dateFin: { gte: debut },
        ...(exclureId ? { id: { not: exclureId } } : {}),
      },
      select: { id: true, dateDebut: true, dateFin: true, statut: true },
    });
    if (conflit) throw new ErreurConge("chevauchement", { conflit });
  }

  // ── Validateur — RG-CNG-08, RG-CNG-10 ────────────────────────────────────

  /**
   * `RG-CNG-08` — le validateur est déterminé **à la création** : manager du
   * service, à défaut responsable du département, à défaut un détenteur de la
   * permission de gestion globale.
   *
   * `RG-CNG-10` — une délégation active substitue le délégué au délégant, et
   * **la recherche de délégation est cantonnée au département du demandeur**.
   *
   * C'est la règle la plus facile à implémenter de travers : un délégué
   * désigné par le manager du département B ne doit **jamais** devenir
   * validateur pour un agent du département A. Une délégation lue sans ce
   * cantonnement ouvrirait la validation des congés d'un département à
   * quelqu'un qui n'y a aucun rôle.
   */
  async determinerValidateur(userId: string, aLaDate: Date): Promise<string | null> {
    const agent = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        departementId: true,
        services: { select: { service: { select: { managerId: true, departementId: true } } } },
      },
    });
    if (!agent) throw new ErreurConge("introuvable");

    // 1. Manager d'un de ses services.
    const manager = agent.services.map((s) => s.service.managerId).find((id): id is string => !!id);

    // 2. À défaut, responsable de son département.
    let validateur = manager ?? null;
    if (!validateur && agent.departementId) {
      const dept = await this.prisma.departement.findUnique({
        where: { id: agent.departementId },
        select: { responsableId: true },
      });
      validateur = dept?.responsableId ?? null;
    }

    if (!validateur) return null;

    // 3. Délégation active — CANTONNÉE au département du demandeur.
    //
    // Un agent sans département ne peut cantonner personne : aucune délégation
    // ne s'applique, et le validateur d'origine garde la main. C'est le choix
    // prudent — l'inverse ouvrirait la validation à n'importe quel délégué.
    if (!agent.departementId) return validateur;
    const departementId = agent.departementId;

    const delegation = await this.prisma.leaveDelegation.findFirst({
      where: {
        delegantId: validateur,
        active: true,
        dateDebut: { lte: aLaDate },
        dateFin: { gte: aLaDate },
        // Le délégué doit relever du même département que le demandeur.
        delegue: {
          actif: true,
          OR: [
            { departementId },
            { services: { some: { service: { departementId } } } },
          ],
        },
      },
      select: { delegueId: true },
    });

    return delegation?.delegueId ?? validateur;
  }

  // ── Dépôt — EX-CNG-02 ────────────────────────────────────────────────────

  async deposer(
    donnees: {
      userId: string; typeId: string;
      dateDebut: Date; dateFin: Date;
      demiJourneeDebut?: DemiJournee | null; demiJourneeFin?: DemiJournee | null;
      motif?: string;
    },
    acteurId: string,
  ) {
    const type = await this.prisma.leaveType.findUnique({
      where: { id: donnees.typeId },
      select: { actif: true, validationRequise: true, nom: true },
    });
    if (!type) throw new ErreurConge("introuvable");
    // RG-CNG-29 — un type désactivé n'est plus sélectionnable.
    if (!type.actif) throw new ErreurConge("type_inactif", { type: type.nom });

    await this.refuserChevauchement(donnees.userId, donnees.dateDebut, donnees.dateFin);

    const repartition = await this.calendrier.repartitionParAnnee(
      donnees.dateDebut,
      donnees.dateFin,
      {
        demiJourneeDebut: Boolean(donnees.demiJourneeDebut),
        demiJourneeFin: Boolean(donnees.demiJourneeFin),
      },
    );
    const joursOuvres = repartition.reduce((n, p) => n + p.jours, 0);

    await this.controlerSolde(donnees.userId, donnees.typeId, repartition);

    /**
     * `RG-CNG-13` — un type sans validation requise est approuvé
     * automatiquement.
     * `RG-CNG-14` — un congé déclaré par un manager pour un collaborateur est
     * directement approuvé : le manager est validateur de fait, et l'action est
     * tracée à son nom.
     */
    const pourAutrui = donnees.userId !== acteurId;
    const approuveDirectement = !type.validationRequise || pourAutrui;
    const validateur = approuveDirectement
      ? acteurId
      : await this.determinerValidateur(donnees.userId, donnees.dateDebut);

    const conge = await this.prisma.leave.create({
      data: {
        userId: donnees.userId,
        typeId: donnees.typeId,
        dateDebut: donnees.dateDebut,
        dateFin: donnees.dateFin,
        demiJourneeDebut: donnees.demiJourneeDebut ?? null,
        demiJourneeFin: donnees.demiJourneeFin ?? null,
        joursOuvres,
        statut: approuveDirectement ? "approved" : "pending",
        motif: donnees.motif ?? null,
        validateurId: validateur,
        decideLe: approuveDirectement ? new Date() : null,
        repartitions: { create: repartition.map((p) => ({ annee: p.annee, jours: p.jours })) },
      },
    });

    await this.audit.tracer({
      action: approuveDirectement ? "leave.create_approved" : "leave.create",
      typeEntite: "Leave", entiteId: conge.id, acteurId,
      detail: {
        agent: donnees.userId, jours: joursOuvres,
        pourAutrui, autoApprouve: !type.validationRequise,
      },
    });

    /*
     * `RG-NTF-03` — **un congé auto-approuvé ne déclenche pas de notification
     * de validation.** Il n'y a personne à prévenir : la décision est déjà
     * prise. Envoyer quand même produirait une demande de validation pour un
     * congé validé, et le validateur chercherait ce qu'il doit faire.
     *
     * L'envoi est APRÈS la transaction, et il ne peut pas la faire échouer :
     * `notifier` écrit en base puis met le courriel en file (`RG-NTF-04`).
     */
    if (!approuveDirectement && validateur) {
      await this.notifications.notifier({
        userId: validateur,
        type: "conge_a_valider",
        titre: "Demande de congé à valider",
        contenu: `Une demande de congé de ${joursOuvres} jour(s) attend votre décision.`,
        lien: "/conges",
      });
    }

    return conge;
  }

  /**
   * `RG-CNG-15` — déclarer pour autrui exige la permission dédiée **et** que
   * le collaborateur relève de ses services. Un collaborateur inactif ou hors
   * périmètre est refusé.
   */
  async verifierDeclarationPourAutrui(
    collaborateurId: string,
    perimetre: Perimetre,
    permissions: ReadonlySet<string>,
  ) {
    if (!permissions.has("leaves:declare_for_other")) {
      throw new ErreurConge("hors_perimetre");
    }
    if (!perimetre.global && !perimetre.utilisateurs.has(collaborateurId)) {
      throw new ErreurConge("hors_perimetre");
    }
    const collaborateur = await this.prisma.user.findUnique({
      where: { id: collaborateurId },
      select: { actif: true },
    });
    if (!collaborateur?.actif) throw new ErreurConge("collaborateur_inactif");
  }

  // ── Décision — EX-CNG-05 ─────────────────────────────────────────────────

  /**
   * `RG-CNG-22` — **le contrôle de solde est rejoué au moment de
   * l'approbation.** Si le solde est devenu insuffisant entre-temps,
   * l'approbation est refusée.
   *
   * `RG-CNG-23` — si l'allocation a été modifiée pendant le traitement,
   * l'opération est refusée et l'utilisateur invité à recommencer, **plutôt
   * que d'écrire contre une réalité différente**.
   *
   * D'où la transaction en `RepeatableRead` avec verrou sur la ligne
   * d'allocation, prescrite par `cadrage/03 § 5.3`.
   */
  async approuver(congeId: string, acteurId: string, permissions: ReadonlySet<string>) {
    const conge = await this.prisma.leave.findUnique({
      where: { id: congeId },
      include: { repartitions: true },
    });
    if (!conge) throw new ErreurConge("introuvable");

    // RG-CNG-02 — seules les demandes en attente peuvent être approuvées.
    if (conge.statut !== "pending") {
      throw new ErreurConge("statut_incompatible", { statut: conge.statut });
    }

    // RG-CNG-09 — nul n'approuve sa propre demande, sauf permission explicite.
    const sienne = conge.userId === acteurId;
    if (sienne && !permissions.has("leaves:self_approve")) {
      throw new ErreurConge("auto_validation_interdite");
    }

    await this.prisma.$transaction(
      async (tx) => {
        // Verrou sur les allocations concernées : une modification concurrente
        // du droit annuel bloquera ici plutôt que de passer inaperçue.
        const annees = conge.repartitions.map((r) => r.annee);
        await tx.$queryRawUnsafe(
          `SELECT id FROM leave_balances
           WHERE "typeId" = $1 AND annee = ANY($2::int[])
             AND ("userId" = $3 OR "userId" IS NULL)
           FOR UPDATE`,
          conge.typeId,
          annees,
          conge.userId,
        );

        // Le solde est recompté SANS l'engagement de cette demande : elle est
        // en attente, donc déjà comptée en « engagés ».
        for (const part of conge.repartitions) {
          const s = await this.solde(conge.userId, conge.typeId, part.annee);
          const disponiblesHorsDemande = s.disponibles + Number(part.jours);
          if (Number(part.jours) > disponiblesHorsDemande) {
            throw new ErreurConge("solde_insuffisant", {
              annee: part.annee,
              demandes: Number(part.jours),
              disponibles: disponiblesHorsDemande,
              manquants: Number((Number(part.jours) - disponiblesHorsDemande).toFixed(1)),
            });
          }
        }

        await tx.leave.update({
          where: { id: congeId },
          data: {
            statut: "approved",
            decideLe: new Date(),
            autoValide: sienne,
            version: { increment: 1 },
          },
        });
      },
      { isolationLevel: "RepeatableRead" },
    );

    await this.audit.tracer({
      action: "leave.approve", typeEntite: "Leave", entiteId: congeId, acteurId,
      detail: { agent: conge.userId, autoValide: sienne },
    });

    // `RG-NTF-03`, seconde face : s'auto-approuver ne s'annonce pas à soi-même.
    if (!sienne) {
      await this.notifications.notifier({
        userId: conge.userId,
        type: "conge_decide",
        titre: "Votre demande de congé est approuvée",
        contenu: "Votre demande de congé a été approuvée.",
        lien: "/conges",
      });
    }
  }

  /** `EX-CNG-05` — refuser, **avec motif**. */
  async refuser(congeId: string, motifRefus: string, acteurId: string) {
    const conge = await this.prisma.leave.findUnique({ where: { id: congeId } });
    if (!conge) throw new ErreurConge("introuvable");
    if (conge.statut !== "pending") {
      throw new ErreurConge("statut_incompatible", { statut: conge.statut });
    }

    await this.prisma.leave.update({
      where: { id: congeId },
      data: { statut: "refused", motifRefus, decideLe: new Date(), version: { increment: 1 } },
    });
    await this.audit.tracer({
      action: "leave.refuse", typeEntite: "Leave", entiteId: congeId, acteurId,
      detail: { agent: conge.userId },
    });

    // Le motif voyage avec la notification : « refusée » sans raison oblige à
    // aller la chercher, et c'est la première question qu'on se pose.
    await this.notifications.notifier({
      userId: conge.userId,
      type: "conge_decide",
      titre: "Votre demande de congé est refusée",
      contenu: `Votre demande de congé a été refusée. Motif : ${motifRefus}`,
      lien: "/conges",
    });
  }

  // ── Annulation — RG-CNG-04 à 07 ──────────────────────────────────────────

  /**
   * `RG-CNG-04` — **un congé approuvé ne peut pas être annulé directement par
   * son titulaire** : il passe par une demande d'annulation soumise à
   * validation.
   *
   * `RG-CNG-07` — on ne demande l'annulation que de ses propres congés.
   */
  async demanderAnnulation(congeId: string, acteurId: string) {
    const conge = await this.prisma.leave.findUnique({ where: { id: congeId } });
    if (!conge) throw new ErreurConge("introuvable");
    if (conge.userId !== acteurId) throw new ErreurConge("pas_son_conge");
    // RG-CNG-05 — seules les demandes approuvées.
    if (conge.statut !== "approved") {
      throw new ErreurConge("statut_incompatible", { statut: conge.statut });
    }

    await this.prisma.leave.update({
      where: { id: congeId },
      data: { statut: "cancellation_requested", version: { increment: 1 } },
    });
    await this.audit.tracer({
      action: "leave.cancellation_request", typeEntite: "Leave", entiteId: congeId, acteurId,
    });
  }

  /**
   * `EX-CNG-07` — accepter ou refuser une demande d'annulation.
   * `RG-CNG-06` — seules les demandes approuvées ou en annulation demandée
   * peuvent être annulées.
   */
  async traiterAnnulation(congeId: string, accepte: boolean, acteurId: string) {
    const conge = await this.prisma.leave.findUnique({ where: { id: congeId } });
    if (!conge) throw new ErreurConge("introuvable");
    if (conge.statut !== "cancellation_requested") {
      throw new ErreurConge("statut_incompatible", { statut: conge.statut });
    }

    await this.prisma.leave.update({
      where: { id: congeId },
      // Refusée, la demande d'annulation rend le congé à son état approuvé.
      data: { statut: accepte ? "cancelled" : "approved", version: { increment: 1 } },
    });
    await this.audit.tracer({
      action: accepte ? "leave.cancel" : "leave.cancellation_refused",
      typeEntite: "Leave", entiteId: congeId, acteurId,
    });
  }

  /** `RG-CNG-03` — seules les demandes en attente ou refusées peuvent être supprimées. */
  async supprimer(congeId: string, acteurId: string) {
    const conge = await this.prisma.leave.findUnique({ where: { id: congeId } });
    if (!conge) throw new ErreurConge("introuvable");
    if (conge.statut !== "pending" && conge.statut !== "refused") {
      throw new ErreurConge("statut_incompatible", { statut: conge.statut });
    }
    await this.audit.tracer({
      action: "leave.delete", typeEntite: "Leave", entiteId: congeId, acteurId,
    });
    await this.prisma.leave.delete({ where: { id: congeId } });
  }

  // ── Modification — EX-CNG-03 ─────────────────────────────────────────────

  /** `RG-CNG-02`, `RG-CNG-27` — modifier une demande en attente, sans créer de chevauchement. */
  async modifier(
    congeId: string,
    donnees: {
      dateDebut: Date; dateFin: Date;
      demiJourneeDebut?: DemiJournee | null; demiJourneeFin?: DemiJournee | null;
      motif?: string;
    },
    acteurId: string,
  ) {
    const conge = await this.prisma.leave.findUnique({ where: { id: congeId } });
    if (!conge) throw new ErreurConge("introuvable");
    if (conge.statut !== "pending") {
      throw new ErreurConge("statut_incompatible", { statut: conge.statut });
    }

    await this.refuserChevauchement(conge.userId, donnees.dateDebut, donnees.dateFin, congeId);

    const repartition = await this.calendrier.repartitionParAnnee(
      donnees.dateDebut,
      donnees.dateFin,
      {
        demiJourneeDebut: Boolean(donnees.demiJourneeDebut),
        demiJourneeFin: Boolean(donnees.demiJourneeFin),
      },
    );
    await this.controlerSolde(conge.userId, conge.typeId, repartition, congeId);

    await this.prisma.$transaction([
      this.prisma.leaveYearAllocation.deleteMany({ where: { leaveId: congeId } }),
      this.prisma.leave.update({
        where: { id: congeId },
        data: {
          dateDebut: donnees.dateDebut,
          dateFin: donnees.dateFin,
          demiJourneeDebut: donnees.demiJourneeDebut ?? null,
          demiJourneeFin: donnees.demiJourneeFin ?? null,
          joursOuvres: repartition.reduce((n, p) => n + p.jours, 0),
          motif: donnees.motif ?? null,
          version: { increment: 1 },
          repartitions: { create: repartition.map((p) => ({ annee: p.annee, jours: p.jours })) },
        },
      }),
    ]);

    await this.audit.tracer({
      action: "leave.update", typeEntite: "Leave", entiteId: congeId, acteurId,
    });
  }

  // ── Référentiel des types — EX-CNG-13 ────────────────────────────────────

  /**
   * `RG-CNG-30` — un type système n'est pas supprimable ; seuls son nom, sa
   * description, son icône, sa couleur et son exigence de validation sont
   * modifiables.
   *
   * `RG-CNG-31` — un type utilisé par des congés est **désactivé** plutôt que
   * supprimé, et l'utilisateur est averti du nombre de congés concernés.
   */
  async supprimerType(typeId: string, acteurId: string) {
    const type = await this.prisma.leaveType.findUnique({
      where: { id: typeId },
      include: { _count: { select: { conges: true } } },
    });
    if (!type) throw new ErreurConge("introuvable");

    if (type.systeme || type._count.conges > 0) {
      await this.prisma.leaveType.update({ where: { id: typeId }, data: { actif: false } });
      await this.audit.tracer({
        action: "leave_type.deactivate", typeEntite: "LeaveType", entiteId: typeId, acteurId,
        detail: { motif: type.systeme ? "systeme" : "utilise", conges: type._count.conges },
      });
      return { desactive: true, conges: type._count.conges, systeme: type.systeme };
    }

    await this.prisma.leaveType.delete({ where: { id: typeId } });
    await this.audit.tracer({
      action: "leave_type.delete", typeEntite: "LeaveType", entiteId: typeId, acteurId,
    });
    return { desactive: false, conges: 0, systeme: false };
  }

  // ── Délégations — EX-CNG-11, EX-CNG-12 ───────────────────────────────────

  /** `RG-CNG-11` — l'utilisateur délégué doit être actif. */
  async creerDelegation(
    donnees: { delegantId: string; delegueId: string; dateDebut: Date; dateFin: Date },
    acteurId: string,
  ) {
    const delegue = await this.prisma.user.findUnique({
      where: { id: donnees.delegueId },
      select: { actif: true },
    });
    if (!delegue?.actif) throw new ErreurConge("delegue_inactif");

    const delegation = await this.prisma.leaveDelegation.create({ data: donnees });
    await this.audit.tracer({
      action: "delegation.create", typeEntite: "LeaveDelegation", entiteId: delegation.id, acteurId,
    });
    return delegation;
  }

  /**
   * `EX-CNG-16` — le catalogue des types, avec leur usage.
   *
   * Le compte d'utilisations n'est pas décoratif : `RG-CNG-17` refuse la
   * suppression d'un type employé et le désactive à la place. Afficher le
   * nombre AVANT le geste évite de découvrir la règle en la heurtant.
   */
  async typesDeConge(inclureInactifs = false) {
    const types = await this.prisma.leaveType.findMany({
      where: inclureInactifs ? {} : { actif: true },
      orderBy: [{ ordre: "asc" }, { nom: "asc" }],
      include: { _count: { select: { conges: true } } },
    });
    return types.map((t) => ({
      ...t,
      limiteAnnuelle: t.limiteAnnuelle === null ? null : Number(t.limiteAnnuelle),
      utilisations: t._count.conges,
    }));
  }

  /**
   * `EX-CNG-13` — tous les soldes d'une personne pour une année.
   *
   * « Le solde disponible est l'information la plus attendue au moment de la
   * demande : il ne doit pas être à chercher » (`cadrage/02`, vue 19). Il est
   * donc servi en bloc, pas type par type — une vue qui ferait six appels
   * afficherait six compteurs qui apparaissent l'un après l'autre.
   */
  async soldes(userId: string, annee: number) {
    const types = await this.prisma.leaveType.findMany({
      where: { actif: true },
      orderBy: [{ ordre: "asc" }, { nom: "asc" }],
    });
    return Promise.all(
      types.map(async (type) => ({
        type: {
          id: type.id, code: type.code, nom: type.nom,
          couleur: type.couleur, icone: type.icone,
          validationRequise: type.validationRequise,
        },
        solde: await this.solde(userId, type.id, annee),
      })),
    );
  }

  /** `EX-CNG-19` — les délégations, dans les deux sens. */
  async delegations(userId: string) {
    const personne = { select: { id: true, prenom: true, nom: true } };
    const [donnees, recues] = await Promise.all([
      this.prisma.leaveDelegation.findMany({
        where: { delegantId: userId },
        orderBy: { dateDebut: "desc" },
        include: { delegue: personne },
      }),
      this.prisma.leaveDelegation.findMany({
        where: { delegueId: userId },
        orderBy: { dateDebut: "desc" },
        include: { delegant: personne },
      }),
    ]);
    return { donnees, recues };
  }

  /** `RG-CNG-12` — seul le délégant, ou un administrateur, peut désactiver une délégation. */
  async desactiverDelegation(id: string, acteurId: string, permissions: ReadonlySet<string>) {
    const delegation = await this.prisma.leaveDelegation.findUnique({ where: { id } });
    if (!delegation) throw new ErreurConge("introuvable");

    const estDelegant = delegation.delegantId === acteurId;
    const estAdmin = permissions.has("leaves:manage_delegations");
    if (!estDelegant && !estAdmin) throw new ErreurConge("hors_perimetre");

    await this.prisma.leaveDelegation.update({ where: { id }, data: { active: false } });
    await this.audit.tracer({
      action: "delegation.deactivate", typeEntite: "LeaveDelegation", entiteId: id, acteurId,
    });
  }

  // ── Consultation — EX-CNG-01 ─────────────────────────────────────────────

  async lister(
    perimetre: Perimetre,
    filtres: { userId?: string; aValider?: boolean; statut?: string; annee?: number } = {},
    acteurId?: string,
  ) {
    const clauses: Record<string, unknown>[] = [this.perimetres.filtreParAgent(perimetre)];

    if (filtres.userId) clauses.push({ userId: filtres.userId });
    if (filtres.statut) clauses.push({ statut: filtres.statut });
    if (filtres.aValider && acteurId) {
      clauses.push({ validateurId: acteurId, statut: { in: ["pending", "cancellation_requested"] } });
    }
    if (filtres.annee) clauses.push({ repartitions: { some: { annee: filtres.annee } } });

    return this.prisma.leave.findMany({
      where: { AND: clauses },
      orderBy: { dateDebut: "desc" },
      include: {
        type: { select: { id: true, nom: true, couleur: true, icone: true } },
        user: { select: { id: true, prenom: true, nom: true } },
        validateur: { select: { id: true, prenom: true, nom: true } },
        repartitions: true,
      },
    });
  }
}
