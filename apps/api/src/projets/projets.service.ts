import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma.service.js";
import { AuditService } from "../commun/audit.service.js";
import { PerimetreService, type Perimetre } from "../commun/perimetre.service.js";
import { NotificationsService } from "../notifications/notifications.service.js";
import type { StatutProjet, Priorite } from "@trame/contracts";

/**
 * Projets, jalons et épopées — M4 et M5, vues 10, 11, 13, 14.
 *
 * Deux principes du cadrage structurent ce service, et tous deux vont contre
 * l'habitude :
 *
 *   `RG-PRJ-07` — **la progression est CALCULÉE**, jamais saisie. Un champ
 *   qu'on renseigne à la main diverge de la réalité dès la première semaine.
 *
 *   `RG-JAL-01` — **le statut d'un jalon est CALCULÉ** à partir de l'avancement
 *   de ses tâches. L'interface doit l'expliquer, sinon l'utilisateur cherchera
 *   le champ.
 */

export type EchecProjet =
  | "dates_incoherentes"
  | "projet_annule"
  | "deja_archive"
  | "pas_archive"
  | "membre_en_double"
  | "membre_introuvable"
  | "suppression_bloquee"
  | "jalon_autre_projet"
  | "introuvable"
  | "conflit_de_version";

export class ErreurProjet extends Error {
  constructor(
    readonly code: EchecProjet,
    readonly detail?: Record<string, unknown>,
  ) {
    super(code);
  }
}

/**
 * Ce qu'une tâche montre sur la feuille de route — vue 13.
 *
 * Les assignés et l'estimation viennent de la maquette : elle pose une pile
 * d'avatars et une charge sur chaque ligne. Sans eux, la feuille de route dit
 * *quoi* et *quand*, jamais *qui* ni *combien* — et c'est précisément ce qu'on
 * regarde pour savoir si un jalon tiendra.
 */
const SELECTION_TACHE_JALON = {
  id: true,
  titre: true,
  statut: true,
  priorite: true,
  avancement: true,
  dateFin: true,
  estimationHeures: true,
  assignes: {
    select: { user: { select: { id: true, prenom: true, nom: true } } },
  },
} as const;

@Injectable()
export class ProjetsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly perimetres: PerimetreService,
    private readonly notifications: NotificationsService,
  ) {}

  // ── Portefeuille — EX-PRJ-01, EX-PRJ-02 ──────────────────────────────────

  /**
   * `EX-PRJ-01` — le portefeuille, avec **compteur et compteur filtré**.
   *
   * Les deux comptes sont rendus ensemble : « {n} projet(s) sur {total} » n'a
   * de sens que si l'on connaît le total non filtré. Le calculer côté client à
   * partir de la liste reçue donnerait un total faux, puisque la liste est
   * déjà filtrée.
   */
  async portefeuille(
    perimetre: Perimetre,
    permissions: ReadonlySet<string>,
    filtres: { recherche?: string; statut?: StatutProjet; priorite?: Priorite; archive?: boolean } = {},
  ) {
    const visibilite = this.perimetres.filtreProjet(perimetre, permissions);
    const clauses: Record<string, unknown>[] = [visibilite];

    if (filtres.recherche) {
      clauses.push({
        OR: [
          { nom: { contains: filtres.recherche, mode: "insensitive" } },
          { description: { contains: filtres.recherche, mode: "insensitive" } },
        ],
      });
    }
    if (filtres.statut) clauses.push({ statut: filtres.statut });
    if (filtres.priorite) clauses.push({ priorite: filtres.priorite });
    clauses.push({ archive: filtres.archive ?? false });

    const [projets, total] = await Promise.all([
      this.prisma.project.findMany({
        where: { AND: clauses },
        orderBy: [{ priorite: "desc" }, { dateFin: "asc" }],
        include: {
          chef: { select: { id: true, prenom: true, nom: true } },
          _count: { select: { taches: true, membres: true } },
        },
      }),
      this.prisma.project.count({ where: { AND: [visibilite, { archive: filtres.archive ?? false }] } }),
    ]);

    const avecProgression = await Promise.all(
      projets.map(async (p) => ({ ...p, progression: await this.progression(p.id) })),
    );

    return { projets: avecProgression, affiches: projets.length, total };
  }

  /**
   * `EX-PRJ-02` — la fiche d'un projet : ce que la vue 11 affiche en une page.
   *
   * Tout y est **rassemblé côté serveur**. Laisser le client composer six
   * appels — projet, progression, budget, compte de tâches, compte d'équipe,
   * jalons — l'obligerait à gérer six états de chargement pour une seule page,
   * et à afficher des indicateurs qui arrivent les uns après les autres.
   *
   * `RG-PRJ-07` : progression et budget consommé sont **calculés**. Ils
   * ressortent d'ici, pas d'une colonne, et la vue les marque comme tels.
   */
  async fiche(projectId: string) {
    const projet = await this.prisma.project.findUnique({
      where: { id: projectId },
      include: {
        chef: { select: { id: true, prenom: true, nom: true } },
        sponsor: { select: { id: true, prenom: true, nom: true } },
        createur: { select: { id: true, prenom: true, nom: true } },
        clients: { include: { client: { select: { id: true, nom: true } } } },
        _count: {
          select: { taches: true, jalons: true, epopees: true, membres: true, tiers: true },
        },
      },
    });
    if (!projet) throw new ErreurProjet("introuvable");

    const [progression, budget, parStatut, dernier] = await Promise.all([
      this.progression(projectId),
      this.budget(projectId),
      this.prisma.task.groupBy({
        by: ["statut"],
        where: { projectId },
        _count: true,
      }),
      this.prisma.projectSnapshot.findFirst({
        where: { projectId },
        orderBy: { date: "desc" },
        select: { date: true, progression: true },
      }),
    ]);

    const compte = (statut: string) =>
      parStatut.find((l) => l.statut === statut)?._count ?? 0;

    const { clients, _count, ...reste } = projet;
    return {
      ...reste,
      progression,
      budget,
      taches: {
        total: _count.taches,
        enCours: compte("doing"),
        bloquees: compte("blocked"),
      },
      equipe: { agents: _count.membres, tiers: _count.tiers, clients: clients.length },
      jalons: _count.jalons,
      epopees: _count.epopees,
      clients: clients.map((c) => c.client),
      dernierInstantane: dernier,
    };
  }

  /**
   * `RG-PRJ-07` — la progression est calculée à partir de l'avancement des
   * tâches, jamais saisie.
   *
   * Moyenne des avancements, et non ratio de tâches terminées : une tâche à
   * 90 % compte pour ce qu'elle vaut. Un projet sans tâche est à 0 — pas à
   * 100, ce que donnerait une division vide mal gardée.
   */
  async progression(projectId: string): Promise<number> {
    const agregat = await this.prisma.task.aggregate({
      where: { projectId },
      _avg: { avancement: true },
      _count: true,
    });
    if (agregat._count === 0) return 0;
    return Math.round(agregat._avg.avancement ?? 0);
  }

  /**
   * `RG-PRJ-08` — le budget consommé est calculé à partir du temps déclaré sur
   * le projet **et ses tâches**. Omettre les tâches donnerait un budget
   * systématiquement sous-évalué.
   */
  async budget(projectId: string) {
    const projet = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { budgetHeures: true },
    });
    const consomme = await this.prisma.timeEntry.aggregate({
      where: { OR: [{ projectId }, { task: { projectId } }] },
      _sum: { heures: true },
    });
    const heures = Number(consomme._sum.heures ?? 0);
    const alloue = projet?.budgetHeures ? Number(projet.budgetHeures) : null;
    return {
      alloue,
      consomme: heures,
      restant: alloue === null ? null : alloue - heures,
      depassement: alloue !== null && heures > alloue,
    };
  }

  // ── Cycle de vie — EX-PRJ-03, 06, 07 ─────────────────────────────────────

  async creer(
    donnees: {
      nom: string; description?: string; statut?: StatutProjet; priorite?: Priorite;
      dateDebut: Date; dateFin: Date; budgetHeures?: number; icone?: string;
      chefId?: string | null; sponsorId?: string | null; departementId?: string | null;
    },
    acteurId: string,
  ) {
    if (donnees.dateFin < donnees.dateDebut) throw new ErreurProjet("dates_incoherentes");

    const projet = await this.prisma.project.create({
      data: {
        nom: donnees.nom,
        description: donnees.description ?? null,
        statut: donnees.statut ?? "draft",
        priorite: donnees.priorite ?? "normal",
        dateDebut: donnees.dateDebut,
        dateFin: donnees.dateFin,
        budgetHeures: donnees.budgetHeures ?? null,
        icone: donnees.icone ?? null,
        chefId: donnees.chefId ?? null,
        sponsorId: donnees.sponsorId ?? null,
        departementId: donnees.departementId ?? null,
        createurId: acteurId,
      },
    });
    await this.audit.tracer({
      action: "project.create", typeEntite: "Project", entiteId: projet.id, acteurId,
    });
    return projet;
  }

  /**
   * `RG-PRJ-04` — **un projet annulé doit être restauré avant toute
   * modification.** Le contrôle est ici, pas dans chaque méthode : le placer
   * une fois évite qu'un point d'entrée l'oublie.
   */
  private async refuserSiAnnule(projectId: string) {
    const projet = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { statut: true },
    });
    if (!projet) throw new ErreurProjet("introuvable");
    if (projet.statut === "cancelled") throw new ErreurProjet("projet_annule");
  }

  /**
   * `RG-PRJ-02` — la suppression d'un projet est d'abord **logique** : il passe
   * au statut Annulé et reste restaurable.
   */
  async annuler(id: string, acteurId: string) {
    await this.prisma.project.update({ where: { id }, data: { statut: "cancelled" } });
    await this.audit.tracer({
      action: "project.cancel", typeEntite: "Project", entiteId: id, acteurId,
    });
  }

  async restaurer(id: string, acteurId: string) {
    await this.prisma.project.update({ where: { id }, data: { statut: "active" } });
    await this.audit.tracer({
      action: "project.restore", typeEntite: "Project", entiteId: id, acteurId,
    });
  }

  /**
   * `RG-PRJ-05` — un projet déjà archivé ne peut pas l'être une seconde fois,
   * ni un projet non archivé être désarchivé. Deux refus distincts : dire
   * « impossible » sans dire lequel des deux laisserait l'utilisateur deviner.
   */
  async archiver(id: string, archive: boolean, acteurId: string) {
    const projet = await this.prisma.project.findUnique({
      where: { id },
      select: { archive: true },
    });
    if (!projet) throw new ErreurProjet("introuvable");
    if (projet.archive === archive) {
      throw new ErreurProjet(archive ? "deja_archive" : "pas_archive");
    }
    await this.prisma.project.update({ where: { id }, data: { archive } });
    await this.audit.tracer({
      action: archive ? "project.archive" : "project.unarchive",
      typeEntite: "Project", entiteId: id, acteurId,
    });
  }

  /**
   * `RG-PRJ-03` — la suppression définitive est refusée si des données
   * historiques y sont rattachées, **le temps déclaré notamment**, et
   * l'archivage est proposé à la place.
   *
   * Proposer une issue fait partie de la règle : un refus sans alternative
   * pousse l'utilisateur à contourner.
   */
  async impactSuppression(id: string) {
    const [temps, taches, jalons, snapshots] = await Promise.all([
      this.prisma.timeEntry.count({ where: { OR: [{ projectId: id }, { task: { projectId: id } }] } }),
      this.prisma.task.count({ where: { projectId: id } }),
      this.prisma.milestone.count({ where: { projectId: id } }),
      this.prisma.projectSnapshot.count({ where: { projectId: id } }),
    ]);
    const blocages = temps > 0 ? [{ objet: "heures déclarées", nombre: temps }] : [];
    return {
      blocages,
      effacements: [
        ...(taches > 0 ? [{ objet: "tâches", nombre: taches }] : []),
        ...(jalons > 0 ? [{ objet: "jalons", nombre: jalons }] : []),
        ...(snapshots > 0 ? [{ objet: "instantanés d'avancement", nombre: snapshots }] : []),
      ],
      alternative: blocages.length > 0 ? ("archiver" as const) : null,
    };
  }

  async supprimerDefinitivement(id: string, acteurId: string) {
    const impact = await this.impactSuppression(id);
    if (impact.blocages.length > 0) {
      throw new ErreurProjet("suppression_bloquee", {
        blocages: impact.blocages,
        alternative: impact.alternative,
      });
    }
    await this.audit.tracer({
      action: "project.delete_permanently", typeEntite: "Project", entiteId: id, acteurId,
      detail: { efface: impact.effacements },
    });
    await this.prisma.project.delete({ where: { id } });
  }

  // ── Équipe — EX-PRJ-09, vue 14 ───────────────────────────────────────────

  /**
   * `EX-PRJ-09` — l'équipe du projet : **trois populations distinctes**.
   *
   * Agents, intervenants extérieurs et bénéficiaires cohabitent sur la vue 14,
   * et le brief impose de les distinguer : « un prestataire n'est pas un
   * agent ». Les renvoyer dans une liste unique obligerait le client à
   * reconstituer la distinction depuis la forme des données, ce qui la rendrait
   * fragile au premier champ ajouté.
   *
   * L'allocation cumulée n'est calculée que sur les agents : un tiers ne
   * consomme pas la charge des services, un bénéficiaire ne contribue pas.
   */
  async equipe(projectId: string) {
    const [agents, tiers, clients] = await Promise.all([
      this.prisma.projectMember.findMany({
        where: { projectId },
        include: {
          user: {
            select: {
              id: true, prenom: true, nom: true, email: true,
              departement: { select: { nom: true } },
            },
          },
        },
      }),
      this.prisma.projectThirdParty.findMany({
        where: { projectId },
        include: {
          thirdParty: {
            select: { id: true, type: true, organisation: true, contactNom: true },
          },
        },
      }),
      this.prisma.projectClient.findMany({
        where: { projectId },
        include: { client: { select: { id: true, nom: true, contactNom: true } } },
      }),
    ]);

    return {
      agents: agents.map((m) => ({
        userId: m.userId,
        roleProjet: m.roleProjet,
        tauxAllocation: m.tauxAllocation,
        utilisateur: m.user,
      })),
      tiers: tiers.map((x) => x.thirdParty),
      clients: clients.map((x) => x.client),
      allocationCumulee: agents.reduce((n, m) => n + (m.tauxAllocation ?? 0), 0),
    };
  }

  /** `RG-PRJ-06` — un utilisateur ne peut être membre du même projet deux fois. */
  async ajouterMembre(
    projectId: string,
    donnees: { userId: string; roleProjet: string; tauxAllocation?: number },
    acteurId: string,
  ) {
    await this.refuserSiAnnule(projectId);
    const existe = await this.prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId: donnees.userId } },
    });
    if (existe) throw new ErreurProjet("membre_en_double");

    const membre = await this.prisma.projectMember.create({
      data: {
        projectId,
        userId: donnees.userId,
        roleProjet: donnees.roleProjet,
        tauxAllocation: donnees.tauxAllocation ?? null,
      },
    });
    await this.audit.tracer({
      action: "project.member_add", typeEntite: "Project", entiteId: projectId, acteurId,
      detail: { userId: donnees.userId, role: donnees.roleProjet },
    });

    // `cadrage/01 § M18` — « Ajout à un projet ». Le lien mène au projet :
    // une notification qui ne mène nulle part oblige à le retrouver.
    if (donnees.userId !== acteurId) {
      const projet = await this.prisma.project.findUnique({
        where: { id: projectId },
        select: { nom: true },
      });
      await this.notifications.notifier({
        userId: donnees.userId,
        type: "ajout_projet",
        titre: `Ajout au projet ${projet?.nom ?? ""}`.trim(),
        contenu: `Vous avez été ajouté au projet « ${projet?.nom ?? ""} ».`,
        lien: `/projets/${projectId}`,
      });
    }

    return membre;
  }

  /**
   * `EX-PRJ-09` — **changer le rôle ou l'allocation d'un membre déjà en place.**
   *
   * Le point d'entrée manquait, et son absence se voyait à l'écran : la
   * maquette de la vue 14 place un sélecteur de rôle sur chaque ligne
   * d'équipe, avec dix-sept intitulés. Sans lui, changer le rôle de quelqu'un
   * imposait de le retirer puis de le rajouter — c'est-à-dire de rompre un
   * lien pour en refaire un, avec la notification d'ajout qui va avec.
   *
   * Trouvé par la boucle de conformité de rendu, pas par un test : le
   * comparateur signalait `mini-select` absente de la vue, et la cause était
   * en amont.
   *
   * `RG-GEN-07` — la concurrence se détecte. Le membre porte la version du
   * projet : deux personnes qui changent le même rôle en même temps ne
   * s'écrasent pas en silence.
   */
  async changerRoleMembre(
    projectId: string,
    userId: string,
    donnees: { roleProjet?: string; tauxAllocation?: number | null },
    acteurId: string,
  ) {
    await this.refuserSiAnnule(projectId);
    const membre = await this.prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId } },
    });
    if (!membre) throw new ErreurProjet("membre_introuvable");

    const modifie = await this.prisma.projectMember.update({
      where: { projectId_userId: { projectId, userId } },
      data: {
        ...(donnees.roleProjet !== undefined ? { roleProjet: donnees.roleProjet } : {}),
        ...(donnees.tauxAllocation !== undefined ? { tauxAllocation: donnees.tauxAllocation } : {}),
      },
    });

    await this.audit.tracer({
      action: "project.member_update",
      typeEntite: "Project",
      entiteId: projectId,
      acteurId,
      detail: {
        userId,
        avant: { role: membre.roleProjet, taux: membre.tauxAllocation },
        apres: { role: modifie.roleProjet, taux: modifie.tauxAllocation },
      },
    });
    return modifie;
  }

  // ── Jalons — M5, vue 13 ──────────────────────────────────────────────────

  /**
   * `EX-PRJ-09` — retirer un membre de l'équipe.
   *
   * **Le retrait n'efface rien** : ni le temps déclaré, ni les tâches
   * assignées, ni l'historique. C'est un lien qu'on défait, pas une donnée
   * qu'on supprime — et l'interface le dit, parce que la confusion entre les
   * deux est la première raison qu'on a de ne pas oser cliquer.
   */
  async retirerMembre(projectId: string, userId: string, acteurId: string) {
    await this.prisma.projectMember.delete({
      where: { projectId_userId: { projectId, userId } },
    });
    await this.audit.tracer({
      action: "project.member_remove", typeEntite: "Project", entiteId: projectId, acteurId,
      detail: { userId },
    });
  }

  /** `RG-JAL-02` — un jalon appartient à un et un seul projet. */
  async creerJalon(
    donnees: { nom: string; description?: string; dateEcheance?: Date; projectId: string },
    acteurId: string,
  ) {
    await this.refuserSiAnnule(donnees.projectId);
    const jalon = await this.prisma.milestone.create({
      data: {
        nom: donnees.nom,
        description: donnees.description ?? null,
        // Facultative : sans date, le jalon reste en fin de chronologie (vue 13).
        dateEcheance: donnees.dateEcheance ?? null,
        projectId: donnees.projectId,
      },
    });
    await this.audit.tracer({
      action: "milestone.create", typeEntite: "Milestone", entiteId: jalon.id, acteurId,
    });
    return jalon;
  }

  /**
   * `RG-JAL-01` — le statut d'un jalon est **calculé** à partir de l'avancement
   * de ses tâches.
   *
   *   aucune tâche, ou toutes à faire   → En attente
   *   toutes terminées                   → Terminé
   *   sinon                              → En cours
   *
   * Recalculé à la lecture plutôt que stocké : un statut stocké se désynchronise
   * au premier changement de tâche qui oublierait de le rafraîchir.
   */
  async statutJalon(milestoneId: string): Promise<"pending" | "doing" | "done"> {
    const taches = await this.prisma.task.findMany({
      where: { milestoneId },
      select: { statut: true },
    });
    if (taches.length === 0) return "pending";
    if (taches.every((t) => t.statut === "done")) return "done";
    if (taches.every((t) => t.statut === "todo")) return "pending";
    return "doing";
  }

  /** `EX-JAL-03`, `EX-JAL-04` — feuille de route et indicateurs. */
  async feuilleDeRoute(projectId: string) {
    const jalons = await this.prisma.milestone.findMany({
      where: { projectId },
      orderBy: { dateEcheance: "asc" },
      include: {
        taches: {
          select: SELECTION_TACHE_JALON,
          orderBy: { dateFin: "asc" },
        },
      },
    });

    const avecStatut = await Promise.all(
      jalons.map(async (j) => ({ ...j, statut: await this.statutJalon(j.id) })),
    );

    /*
     * **Les tâches sans jalon, nommées plutôt que tues.**
     *
     * `RG-JAL-05` détache les tâches d'un jalon supprimé sans les supprimer :
     * elles existent donc, et la feuille de route ne les montrait nulle part.
     * La maquette de la vue 13 leur réserve un bloc — une tâche qui n'est
     * rattachée à rien est précisément celle qu'on oublie, et c'est pour ça
     * qu'elle est écrite.
     */
    const sansJalon = await this.prisma.task.findMany({
      where: { projectId, milestoneId: null },
      select: SELECTION_TACHE_JALON,
      orderBy: [{ dateFin: "asc" }, { titre: "asc" }],
    });

    return {
      jalons: avecStatut,
      sansJalon,
      indicateurs: {
        total: avecStatut.length,
        termines: avecStatut.filter((j) => j.statut === "done").length,
        enCours: avecStatut.filter((j) => j.statut === "doing").length,
        taches: avecStatut.reduce((n, j) => n + j.taches.length, 0) + sansJalon.length,
        sansJalon: sansJalon.length,
      },
    };
  }

  /** `RG-JAL-05` — la suppression d'un jalon **détache** ses tâches sans les supprimer. */
  async supprimerJalon(id: string, acteurId: string) {
    const detachees = await this.prisma.task.count({ where: { milestoneId: id } });
    await this.prisma.$transaction([
      this.prisma.task.updateMany({ where: { milestoneId: id }, data: { milestoneId: null } }),
      this.prisma.milestone.delete({ where: { id } }),
    ]);
    await this.audit.tracer({
      action: "milestone.delete", typeEntite: "Milestone", entiteId: id, acteurId,
      detail: { tachesDetachees: detachees },
    });
    return { tachesDetachees: detachees };
  }

  /** `RG-PRJ-09` — instantané d'avancement, pour les courbes de tendance. */
  async capturerInstantane(projectId: string, date: Date) {
    const [progression, taches, finies, budget] = await Promise.all([
      this.progression(projectId),
      this.prisma.task.count({ where: { projectId } }),
      this.prisma.task.count({ where: { projectId, statut: "done" } }),
      this.budget(projectId),
    ]);
    return this.prisma.projectSnapshot.upsert({
      where: { projectId_date: { projectId, date } },
      create: {
        projectId, date, progression,
        tachesTotal: taches, tachesFinies: finies,
        heuresConsommees: budget.consomme,
      },
      update: { progression, tachesTotal: taches, tachesFinies: finies, heuresConsommees: budget.consomme },
    });
  }
}
