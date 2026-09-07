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

/*
 * `conflit_de_version` — `RG-GEN-07`, sur les écritures du CYCLE DE VIE d'une
 * demande. `allocation_modifiee` porte le même sens pour les ALLOCATIONS
 * (`RG-CNG-23`) ; les deux ne se confondent pas, parce qu'ils ne disent pas
 * quoi recharger : l'un renvoie au solde attribué, l'autre à la demande.
 *
 * `code_deja_pris` — `EX-CNG-13`, sur le code d'un type de congé, qui est
 * unique. Le refus le NOMME plutôt que de laisser la contrainte parler : la
 * traduction générique de `P2002` dit qu'une entrée identique existe, sans
 * dire lequel des dix champs corriger.
 *
 * Le commentaire est AU-DESSUS de l'union, pas dedans : `messages-metier.test.ts`
 * lit ces unions à l'expression rationnelle, et un commentaire intercalé lui
 * fait perdre la déclaration entière — les onze codes passent alors pour morts.
 * Vérifié une seconde fois le 2026-09-07, en le payant.
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
  | "conflit_de_version"
  | "code_deja_pris"
  | "introuvable";

export class ErreurConge extends Error {
  constructor(
    readonly code: EchecConge,
    readonly detail?: Record<string, unknown>,
  ) {
    super(code);
  }
}

/**
 * Une allocation telle qu'elle est stockée — sa valeur et **sa version**.
 *
 * `PUT /conges/soldes` exige la version dès qu'une allocation existe
 * (`RG-CNG-23`). Sans elle dans la lecture, aucune requête d'écriture n'est
 * composable : c'est le piège de `profil()` consigné dans `CLAUDE.md`, où un
 * champ manquant à la lecture rend l'écriture impossible et fait conclure à
 * tort que la route n'existe pas.
 */
export type AllocationLue = { jours: number; version: number };

export type Solde = {
  annee: number;
  attribues: number;
  consommes: number;
  engages: number;
  disponibles: number;
  /**
   * D'où vient `attribues` — `RG-CNG-24`.
   *
   * L'écran doit pouvoir le dire : une allocation propre et un défaut global
   * **ne se corrigent pas au même endroit**, et corriger le mauvais des deux
   * ne change rien de visible pour l'agent concerné.
   */
  origine: "propre" | "global" | "aucune";
  /** L'allocation propre à l'agent, si elle existe. */
  propre: AllocationLue | null;
  /** Le défaut global du type pour cette année, si défini. */
  global: AllocationLue | null;
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

    /*
     * `RG-CNG-23` / `RG-GEN-07` — la version est EXIGÉE dès qu'une allocation
     * existe.
     *
     * Elle était facultative : `donnees.version !== undefined` laissait passer
     * l'appelant qui l'omettait, et le contrôleur la déclarait `optional()`.
     * Un gestionnaire qui ne l'envoyait pas écrasait en silence l'écriture
     * concurrente d'un autre — « dernier arrivé gagne », rentré par la porte de
     * l'option. Le test de concurrence existant ne pouvait pas le voir : il
     * transmet toujours la version.
     *
     * Une protection qui ne protège que celui qui y pense n'en est pas une.
     * L'absence de version sur une allocation existante est donc traitée comme
     * un conflit, pas comme une dispense.
     */
    if (existante && existante.version !== donnees.version) {
      throw new ErreurConge("allocation_modifiee", {
        attendue: existante.version,
        recue: donnees.version ?? null,
      });
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
        select: { joursAttribues: true, version: true },
      }),
      this.prisma.leaveBalance.findFirst({
        where: { userId: null, typeId, annee },
        select: { joursAttribues: true, version: true },
      }),
    ]);

    const lue = (a: { joursAttribues: unknown; version: number } | null): AllocationLue | null =>
      a === null ? null : { jours: Number(a.joursAttribues), version: a.version };

    const attribues = Number(propre?.joursAttribues ?? global?.joursAttribues ?? 0);
    /* `RG-CNG-24` — l'allocation propre l'emporte sur le défaut global. Dire
       laquelle des deux a servi, c'est dire où va la correction. */
    const origine: Solde["origine"] = propre ? "propre" : global ? "global" : "aucune";

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
      origine,
      propre: lue(propre),
      global: lue(global),
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
  /**
   * `RG-CNG-08` — le validateur, avec de quoi le NOMMER.
   *
   * `determinerValidateur` rend un identifiant, et la route qui l'expose est
   * gardée par `leaves:read`. Le seul annuaire du produit, `GET /utilisateurs`,
   * l'est par `users:read`, qu'un agent ordinaire n'a pas : **le client qui a
   * le droit d'appeler la route n'avait pas le droit de traduire sa réponse**,
   * et la fenêtre de demande retombait sur une formule générique dès que
   * l'agent n'avait aucune demande antérieure où retrouver le nom.
   *
   * L'identité rendue ici est celle d'UNE personne, déjà déterminée par la
   * règle — ce n'est pas une ouverture de l'annuaire.
   */
  async validateurNomme(userId: string, aLaDate: Date) {
    const validateurId = await this.determinerValidateur(userId, aLaDate);
    if (!validateurId) return { validateurId: null, validateur: null };
    const validateur = await this.prisma.user.findUnique({
      where: { id: validateurId },
      select: { id: true, prenom: true, nom: true },
    });
    return { validateurId, validateur };
  }

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

    /*
     * 3. À défaut, un détenteur de la permission de gestion globale.
     *
     * **Le troisième échelon de `RG-CNG-08` n'existait pas.** La fonction
     * s'arrêtait au responsable de département et rendait `null` ; `deposer`
     * créait alors la demande avec `validateurId: null`, et `lister` filtrant
     * « à valider » sur `validateurId = acteur`, cette demande n'apparaissait
     * **chez personne**. Elle retenait du solde engagé, n'atteignait jamais un
     * décideur, et rien ne le signalait ni à l'agent ni à l'administration.
     * Le cas s'atteint dès qu'un département neuf n'a pas encore de
     * responsable.
     *
     * Le choix est déterministe — le plus anciennement créé, à égalité le plus
     * petit identifiant — pour qu'un même dépôt rejoué désigne le même
     * validateur. Un `findFirst` sans ordre rendrait la file d'attente
     * dépendante du plan d'exécution de PostgreSQL.
     */
    if (!validateur) {
      const global = await this.prisma.user.findFirst({
        where: {
          actif: true,
          role: { permissions: { some: { permission: "leaves:manage_any" } } },
        },
        orderBy: [{ creeLe: "asc" }, { id: "asc" }],
        select: { id: true },
      });
      validateur = global?.id ?? null;
    }

    if (!validateur) return null;

    // 4. Délégation active — CANTONNÉE au département du demandeur.
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
      /*
       * `RG-GEN-08` — le corps voyage en **paramètres**, pas en phrase
       * française. Il se compose à la LECTURE, dans la langue du lecteur
       * (`notifications/libelles.ts`) : une phrase figée à l'émission ne se
       * rattrape jamais au changement de langue.
       *
       * `EX-CNG-01`, `RG-NTF-01` — **et le lien ouvre l'onglet où la demande
       * attend.** Il pointait `/conges`, donc « Mes demandes », où le
       * validateur ne trouvait rien : la notification annonçait une décision à
       * prendre et menait à un écran qui ne la montre pas. L'onglet est un
       * état d'adresse, porté par le fragment (vue 19).
       */
      await this.notifications.notifier({
        userId: validateur,
        type: "conge_a_valider",
        params: { jours: String(joursOuvres) },
        lien: "/conges#aValider",
      });
    }

    return conge;
  }

  /**
   * `RG-CNG-15` — déclarer pour autrui exige la permission dédiée **et** que
   * le collaborateur relève de ses services. Un collaborateur inactif ou hors
   * périmètre est refusé.
   *
   * ──────────────────────────────────────────────────────────────────────────
   * **La règle dit « ses services » ; le contrôle lisait « son département ».**
   *
   * `perimetre.utilisateurs` est bâti sur les DÉPARTEMENTS du périmètre
   * (`RG-SCOPE-01`) : c'est la bonne granularité pour lire une liste, ce n'est
   * pas celle que `RG-CNG-15` demande pour écrire au nom de quelqu'un. Un
   * manager de service pouvait donc déposer un congé — directement approuvé
   * par `RG-CNG-14`, donc consommant le solde d'autrui — pour n'importe quel
   * agent d'un autre service du même département. Mesuré : une requête forgée
   * sur un agent hors des services de la manager rendait `201`.
   *
   * Les deux contrôles cohabitent, et c'est délibéré : le périmètre reste la
   * borne extérieure, l'appartenance au service est la borne intérieure que la
   * règle nomme. Le second ne rend pas le premier inutile — il le resserre.
   *
   * `RG-SCOPE-03` — une gestion globale court-circuite l'un comme l'autre.
   * ──────────────────────────────────────────────────────────────────────────
   */
  async verifierDeclarationPourAutrui(
    collaborateurId: string,
    perimetre: Perimetre,
    permissions: ReadonlySet<string>,
  ) {
    if (!permissions.has("leaves:declare_for_other")) {
      throw new ErreurConge("hors_perimetre");
    }
    if (!perimetre.global) {
      if (!perimetre.utilisateurs.has(collaborateurId)) {
        throw new ErreurConge("hors_perimetre");
      }
      /*
       * « Ses services » : ceux dont il est le manager, et ceux dont il est
       * membre. Les deux comptent — un référent qui déclare pour un collègue
       * de son propre service relève bien de la règle, et la limiter à
       * l'encadrement en ferait une autre.
       */
      const dansSesServices = await this.prisma.user.findFirst({
        where: {
          id: collaborateurId,
          services: {
            some: {
              service: {
                OR: [
                  { managerId: perimetre.userId },
                  { membres: { some: { userId: perimetre.userId } } },
                ],
              },
            },
          },
        },
        select: { id: true },
      });
      if (!dansSesServices) throw new ErreurConge("hors_perimetre");
    }
    const collaborateur = await this.prisma.user.findUnique({
      where: { id: collaborateurId },
      select: { actif: true },
    });
    if (!collaborateur?.actif) throw new ErreurConge("collaborateur_inactif");
  }

  // ── Concurrence — RG-GEN-07 ──────────────────────────────────────────────

  /**
   * `RG-GEN-07` — la version lue est transmise, et un écart lève.
   *
   * **Le contrôle de statut ne remplace pas celui-ci.** Il attrape la
   * concurrence qui change l'état — deux validateurs qui approuvent la même
   * demande —, jamais celle qui n'en change pas : deux personnes qui corrigent
   * les dates d'une demande restée `pending` passaient toutes les deux, et la
   * seconde écrasait la première en silence. C'est exactement le « dernier
   * arrivé gagne » que le contrat interdit.
   */
  private verifierVersion(lue: { version: number }, transmise: number) {
    if (lue.version !== transmise) {
      throw new ErreurConge("conflit_de_version", {
        attendue: lue.version,
        recue: transmise,
      });
    }
  }

  /**
   * `C15` — le même contrôle, doublé en base.
   *
   * `verifierVersion` lit puis compare : entre les deux, une écriture reste
   * possible. La version est donc AUSSI dans le `where` de l'écriture, et
   * Prisma lève `P2025` quand la ligne ne correspond plus. Sans cette
   * traduction, ce cas-là sortirait en 500 — une concurrence détectée mais
   * rendue illisible, ce qui vaut à peine mieux que non détectée.
   */
  private async ecrireSurVersion<T>(version: number, geste: () => Promise<T>): Promise<T> {
    try {
      return await geste();
    } catch (e) {
      if ((e as { code?: string }).code === "P2025") {
        throw new ErreurConge("conflit_de_version", { attendue: null, recue: version });
      }
      throw e;
    }
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
  async approuver(
    congeId: string,
    acteurId: string,
    permissions: ReadonlySet<string>,
    version: number,
  ) {
    const conge = await this.prisma.leave.findUnique({
      where: { id: congeId },
      include: { repartitions: true },
    });
    if (!conge) throw new ErreurConge("introuvable");

    // RG-CNG-02 — seules les demandes en attente peuvent être approuvées.
    if (conge.statut !== "pending") {
      throw new ErreurConge("statut_incompatible", { statut: conge.statut });
    }

    this.verifierVersion(conge, version);

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

        /* `C15` — `RG-GEN-07` doublée en base : la version est dans le `where`.
           Le contrôle ci-dessus lit hors transaction ; celui-ci est atomique. */
        const { count } = await tx.leave.updateMany({
          where: { id: congeId, version },
          data: {
            statut: "approved",
            decideLe: new Date(),
            autoValide: sienne,
            version: { increment: 1 },
          },
        });
        if (count === 0) {
          throw new ErreurConge("conflit_de_version", { attendue: null, recue: version });
        }
      },
      { isolationLevel: "RepeatableRead" },
    );

    await this.audit.tracer({
      action: "leave.approve", typeEntite: "Leave", entiteId: congeId, acteurId,
      detail: { agent: conge.userId, autoValide: sienne },
    });

    // `RG-NTF-03`, seconde face : s'auto-approuver ne s'annonce pas à soi-même.
    if (!sienne) {
      /*
       * `RG-GEN-08` — paramètres, pas phrase. `decision` distingue les deux
       * faces du même type : `cadrage/01 § M18` n'en énonce qu'un, « Décision
       * sur votre demande de congé », et le corps porte laquelle.
       *
       * `RG-NTF-01` — le destinataire est le DEMANDEUR : son congé est dans
       * « Mes demandes », pas dans « À valider ».
       */
      await this.notifications.notifier({
        userId: conge.userId,
        type: "conge_decide",
        params: { decision: "approuve" },
        lien: "/conges#mesDemandes",
      });
    }
  }

  /** `EX-CNG-05` — refuser, **avec motif**. */
  async refuser(congeId: string, motifRefus: string, acteurId: string, version: number) {
    const conge = await this.prisma.leave.findUnique({ where: { id: congeId } });
    if (!conge) throw new ErreurConge("introuvable");
    if (conge.statut !== "pending") {
      throw new ErreurConge("statut_incompatible", { statut: conge.statut });
    }
    this.verifierVersion(conge, version);

    await this.ecrireSurVersion(version, () =>
      this.prisma.leave.update({
        where: { id: congeId, version },
        data: { statut: "refused", motifRefus, decideLe: new Date(), version: { increment: 1 } },
      }),
    );
    await this.audit.tracer({
      action: "leave.refuse", typeEntite: "Leave", entiteId: congeId, acteurId,
      detail: { agent: conge.userId },
    });

    /*
     * Le motif voyage avec la notification : « refusée » sans raison oblige à
     * aller la chercher, et c'est la première question qu'on se pose. Il voyage
     * désormais en **paramètre** (`RG-GEN-08`) — le motif reste dans la langue
     * où son auteur l'a écrit, ce qui est juste : c'est une citation, pas une
     * chaîne du produit ; la phrase qui l'entoure, elle, se rend dans la langue
     * du lecteur.
     */
    await this.notifications.notifier({
      userId: conge.userId,
      type: "conge_decide",
      params: { decision: "refuse", motif: motifRefus },
      lien: "/conges#mesDemandes",
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
  async demanderAnnulation(congeId: string, acteurId: string, version: number) {
    const conge = await this.prisma.leave.findUnique({ where: { id: congeId } });
    if (!conge) throw new ErreurConge("introuvable");
    if (conge.userId !== acteurId) throw new ErreurConge("pas_son_conge");
    // RG-CNG-05 — seules les demandes approuvées.
    if (conge.statut !== "approved") {
      throw new ErreurConge("statut_incompatible", { statut: conge.statut });
    }
    this.verifierVersion(conge, version);

    await this.ecrireSurVersion(version, () =>
      this.prisma.leave.update({
        where: { id: congeId, version },
        data: { statut: "cancellation_requested", version: { increment: 1 } },
      }),
    );
    await this.audit.tracer({
      action: "leave.cancellation_request", typeEntite: "Leave", entiteId: congeId, acteurId,
    });
  }

  /**
   * `EX-CNG-07` — accepter ou refuser une demande d'annulation.
   * `RG-CNG-06` — seules les demandes approuvées ou en annulation demandée
   * peuvent être annulées.
   */
  async traiterAnnulation(
    congeId: string,
    accepte: boolean,
    acteurId: string,
    version: number,
  ) {
    const conge = await this.prisma.leave.findUnique({ where: { id: congeId } });
    if (!conge) throw new ErreurConge("introuvable");
    if (conge.statut !== "cancellation_requested") {
      throw new ErreurConge("statut_incompatible", { statut: conge.statut });
    }
    this.verifierVersion(conge, version);

    await this.ecrireSurVersion(version, () =>
      this.prisma.leave.update({
        where: { id: congeId, version },
        // Refusée, la demande d'annulation rend le congé à son état approuvé.
        data: { statut: accepte ? "cancelled" : "approved", version: { increment: 1 } },
      }),
    );
    await this.audit.tracer({
      action: accepte ? "leave.cancel" : "leave.cancellation_refused",
      typeEntite: "Leave", entiteId: congeId, acteurId,
    });
  }

  /** `RG-CNG-03` — seules les demandes en attente ou refusées peuvent être supprimées. */
  async supprimer(congeId: string, acteurId: string, version: number) {
    const conge = await this.prisma.leave.findUnique({ where: { id: congeId } });
    if (!conge) throw new ErreurConge("introuvable");
    if (conge.statut !== "pending" && conge.statut !== "refused") {
      throw new ErreurConge("statut_incompatible", { statut: conge.statut });
    }
    this.verifierVersion(conge, version);
    await this.audit.tracer({
      action: "leave.delete", typeEntite: "Leave", entiteId: congeId, acteurId,
    });
    /* `C15` — la version est dans le `where` de la suppression : une demande
       modifiée entre la lecture et le geste n'est pas effacée en silence. */
    const { count } = await this.prisma.leave.deleteMany({ where: { id: congeId, version } });
    if (count === 0) {
      throw new ErreurConge("conflit_de_version", { attendue: null, recue: version });
    }
  }

  // ── Modification — EX-CNG-03 ─────────────────────────────────────────────

  /**
   * `RG-CNG-02`, `RG-CNG-27` — modifier une demande en attente, sans créer de
   * chevauchement.
   *
   * `RG-GEN-07` — **c'est ici que la version compte le plus.** Les transitions
   * d'état sont gardées par leur statut : deux approbations concurrentes se
   * détectent parce que la seconde ne trouve plus `pending`. Une modification
   * ne change pas le statut : deux personnes qui corrigent la même demande
   * restée en attente passaient toutes les deux, et la seconde écrasait la
   * première sans que rien ne le dise.
   */
  async modifier(
    congeId: string,
    donnees: {
      dateDebut: Date; dateFin: Date;
      demiJourneeDebut?: DemiJournee | null; demiJourneeFin?: DemiJournee | null;
      motif?: string;
      version: number;
    },
    acteurId: string,
  ) {
    const conge = await this.prisma.leave.findUnique({ where: { id: congeId } });
    if (!conge) throw new ErreurConge("introuvable");
    if (conge.statut !== "pending") {
      throw new ErreurConge("statut_incompatible", { statut: conge.statut });
    }
    this.verifierVersion(conge, donnees.version);

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

    await this.ecrireSurVersion(donnees.version, () =>
      this.prisma.$transaction([
        this.prisma.leaveYearAllocation.deleteMany({ where: { leaveId: congeId } }),
        this.prisma.leave.update({
          // `C15` — la version double le contrôle en base, dans la transaction
          // qui réécrit aussi la répartition par année.
          where: { id: congeId, version: donnees.version },
          data: {
            dateDebut: donnees.dateDebut,
            dateFin: donnees.dateFin,
            demiJourneeDebut: donnees.demiJourneeDebut ?? null,
            demiJourneeFin: donnees.demiJourneeFin ?? null,
            joursOuvres: repartition.reduce((n, p) => n + p.jours, 0),
            motif: donnees.motif ?? null,
            version: { increment: 1 },
            repartitions: {
              create: repartition.map((p) => ({ annee: p.annee, jours: p.jours })),
            },
          },
        }),
      ]),
    );

    await this.audit.tracer({
      action: "leave.update", typeEntite: "Leave", entiteId: congeId, acteurId,
    });
  }

  // ── Référentiel des types — EX-CNG-13 ────────────────────────────────────

  /**
   * Un type, par son identifiant.
   *
   * Sert au contrôleur à savoir s'il a affaire à un type **système** avant de
   * choisir le schéma d'entrée que `RG-CNG-30` impose. C'est une lecture de
   * plus, sur une table de référentiel de quelques lignes ; l'alternative
   * — deviner le schéma puis refuser après coup — rendrait le message
   * d'erreur générique là où la règle nomme cinq champs.
   */
  async typeDeConge(typeId: string) {
    const type = await this.prisma.leaveType.findUnique({ where: { id: typeId } });
    if (!type) throw new ErreurConge("introuvable");
    return type;
  }

  /**
   * `EX-CNG-13` — **créer** un type de congé.
   *
   * Le référentiel se lisait et se supprimait ; il ne se créait ni ne se
   * modifiait. L'état vide de la vue 19 invitait pourtant à « en créer un dans
   * l'onglet Types de congés » — une sortie que rien ne permettait
   * d'emprunter. Cinquième occurrence dans ce dépôt de la famille « le verbe
   * manque », après `EX-ORG-02`, `EX-ORG-03`, `EX-CLI-02` et `EX-PRJ-05`.
   *
   * `systeme` n'est **pas** un champ d'entrée : il marque ce que le produit
   * fournit, et un type créé à la main n'en est pas. L'ouvrir permettrait de
   * fabriquer un type que `RG-CNG-30` rendrait ensuite immodifiable.
   */
  async creerType(
    donnees: {
      code: string; nom: string;
      description?: string; icone?: string; couleur?: string;
      remunere: boolean; validationRequise: boolean;
      limiteAnnuelle?: number | null;
      ordre: number; actif: boolean;
    },
    acteurId: string,
  ) {
    const code = donnees.code.toUpperCase();
    const pris = await this.prisma.leaveType.findUnique({
      where: { code },
      select: { id: true },
    });
    // Le refus est NOMMÉ ici plutôt que laissé à la contrainte d'unicité : la
    // traduction de `P2002` dit « une entrée identique existe déjà », ce qui
    // ne dit pas quel champ corriger.
    if (pris) throw new ErreurConge("code_deja_pris", { code });

    const type = await this.prisma.leaveType.create({
      data: {
        code,
        nom: donnees.nom,
        description: donnees.description ?? null,
        icone: donnees.icone ?? null,
        couleur: donnees.couleur ?? null,
        remunere: donnees.remunere,
        validationRequise: donnees.validationRequise,
        limiteAnnuelle: donnees.limiteAnnuelle ?? null,
        ordre: donnees.ordre,
        actif: donnees.actif,
      },
    });
    await this.audit.tracer({
      action: "leave_type.create", typeEntite: "LeaveType", entiteId: type.id, acteurId,
      detail: { code: type.code, nom: type.nom },
    });
    return { ...type, limiteAnnuelle: type.limiteAnnuelle === null ? null : Number(type.limiteAnnuelle) };
  }

  /**
   * `EX-CNG-13` — **modifier** un type de congé.
   *
   * `RG-CNG-30` — sur un type système, seuls nom, description, icône, couleur
   * et exigence de validation sont modifiables. La règle est refusée **au
   * contrôleur**, champ par champ, parce que c'est là qu'un message peut se
   * poser sous le champ fautif ; elle est **tenue ici**, parce qu'une règle du
   * domaine qui ne vit qu'à la frontière HTTP tombe au premier autre
   * appelant. Le second contrôle n'est pas un doublon : c'est le seul qui
   * survive à l'import, à l'amorçage ou à un futur point d'entrée.
   *
   * `RG-GEN-07` — la version lue accompagne l'écriture, et le conflit est
   * détecté dans le `where` de la mise à jour : lire puis écrire laisserait
   * une fenêtre entre les deux.
   */
  async modifierType(
    typeId: string,
    donnees: {
      code?: string; nom?: string;
      description?: string | null; icone?: string | null; couleur?: string | null;
      remunere?: boolean; validationRequise?: boolean;
      limiteAnnuelle?: number | null;
      ordre?: number; actif?: boolean;
      version: number;
    },
    acteurId: string,
  ) {
    const avant = await this.typeDeConge(typeId);

    const data: Record<string, unknown> = { version: { increment: 1 } };
    const poser = (champ: string, valeur: unknown) => {
      if (valeur !== undefined) data[champ] = valeur;
    };
    poser("nom", donnees.nom);
    poser("description", donnees.description);
    poser("icone", donnees.icone);
    poser("couleur", donnees.couleur);
    poser("validationRequise", donnees.validationRequise);

    if (!avant.systeme) {
      poser("remunere", donnees.remunere);
      poser("limiteAnnuelle", donnees.limiteAnnuelle);
      poser("ordre", donnees.ordre);
      poser("actif", donnees.actif);

      if (donnees.code !== undefined) {
        const code = donnees.code.toUpperCase();
        if (code !== avant.code) {
          const pris = await this.prisma.leaveType.findUnique({
            where: { code },
            select: { id: true },
          });
          if (pris) throw new ErreurConge("code_deja_pris", { code });
        }
        data["code"] = code;
      }
    }

    const { count } = await this.prisma.leaveType.updateMany({
      where: { id: typeId, version: donnees.version },
      data,
    });
    if (count === 0) {
      throw new ErreurConge("conflit_de_version", {
        attendue: avant.version,
        recue: donnees.version,
      });
    }

    await this.audit.tracer({
      action: "leave_type.update", typeEntite: "LeaveType", entiteId: typeId, acteurId,
      detail: { champs: Object.keys(data).filter((c) => c !== "version"), systeme: avant.systeme },
    });

    const apres = await this.prisma.leaveType.findUniqueOrThrow({ where: { id: typeId } });
    return { ...apres, limiteAnnuelle: apres.limiteAnnuelle === null ? null : Number(apres.limiteAnnuelle) };
  }

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

  /**
   * `EX-CNG-01` — la liste des congés, bornée au périmètre.
   *
   * **`RG-CNG-09` — « À valider » ne contient pas ses propres demandes.** Un
   * validateur dont le validateur désigné est lui-même — le cas normal du
   * responsable de service, que `determinerValidateur` remonte à son
   * supérieur seulement s'il en trouve un — voyait sa propre demande dans son
   * onglet, « Approuver » et « Refuser » actifs. Le serveur refusait ensuite,
   * en `auto_validation_interdite` : la commande était offerte pour être
   * refusée, ce que `RG-GEN-06` interdit précisément.
   *
   * L'exclusion est **conditionnelle**, comme la règle : qui détient
   * `leaves:self_approve` peut légitimement s'auto-valider, et sa demande doit
   * donc rester dans sa liste. Une exclusion inconditionnelle rendrait cette
   * permission inutilisable par l'écran qui l'exerce.
   *
   * Elle porte sur `aValider` **seulement**. La liste ordinaire montre bien
   * ses propres congés : c'est la même route, et c'est le filtre qui change de
   * question.
   */
  async lister(
    perimetre: Perimetre,
    filtres: { userId?: string; aValider?: boolean; statut?: string; annee?: number } = {},
    acteurId?: string,
    permissions: ReadonlySet<string> = new Set(),
  ) {
    const clauses: Record<string, unknown>[] = [this.perimetres.filtreParAgent(perimetre)];

    if (filtres.userId) clauses.push({ userId: filtres.userId });
    if (filtres.statut) clauses.push({ statut: filtres.statut });
    if (filtres.aValider && acteurId) {
      clauses.push({ validateurId: acteurId, statut: { in: ["pending", "cancellation_requested"] } });
      if (!permissions.has("leaves:self_approve")) {
        clauses.push({ NOT: { userId: acteurId } });
      }
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
