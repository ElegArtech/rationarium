import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma.service.js";
import { AuditService } from "../commun/audit.service.js";
import { PerimetreService, type Perimetre } from "../commun/perimetre.service.js";
import type { StatutTache, Priorite, RoleRaci } from "@trame/contracts";

/**
 * Tâches — M6, vues 12, 16, 17. Criticité haute.
 *
 * Le module porte le parti pris n° 2 du cadrage : **le travail hors projet est
 * un objet de premier rang**. `RG-TSK-01` le dit sans ambiguïté — une tâche
 * peut ne pas avoir de projet, et c'est un cas nominal, pas une anomalie.
 * Traiter ce cas comme dégradé fausserait le planning et la mesure de charge.
 *
 * Trois mécaniques y sont délicates : le graphe de dépendances, le décalage en
 * cascade, et le glisser-déposer d'une tâche multi-assignée.
 */

export type EchecTache =
  | "dependance_circulaire"
  | "dependance_en_double"
  | "dependance_autre_projet"
  | "dependance_sur_soi"
  | "supprimee_avec_dependantes"
  | "raci_en_double"
  | "jalon_autre_projet"
  | "hors_projet_avec_jalon"
  | "multi_assignee_date"
  | "deja_assigne"
  | "introuvable"
  | "conflit_de_version";

export class ErreurTache extends Error {
  constructor(
    readonly code: EchecTache,
    readonly detail?: Record<string, unknown>,
  ) {
    super(code);
  }
}

@Injectable()
export class TachesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly perimetres: PerimetreService,
  ) {}

  // ── Lecture ──────────────────────────────────────────────────────────────

  /**
   * `EX-TSK-03` — filtrer par projet, priorité, retard, et **isoler les tâches
   * hors projet**.
   *
   * `RG-TSK-12` — une tâche est *en retard* si sa date de fin est dépassée et
   * son statut n'est pas Terminé. Calculé, jamais stocké : un drapeau stocké
   * serait faux dès le lendemain.
   */
  async lister(
    perimetre: Perimetre,
    permissions: ReadonlySet<string>,
    filtres: {
      projectId?: string;
      horsProjet?: boolean;
      statut?: StatutTache;
      priorite?: Priorite;
      enRetard?: boolean;
      assigneId?: string;
    } = {},
  ) {
    const clauses: Record<string, unknown>[] = [this.perimetres.filtreTache(perimetre, permissions)];

    if (filtres.projectId) clauses.push({ projectId: filtres.projectId });
    if (filtres.horsProjet) clauses.push({ projectId: null });
    if (filtres.statut) clauses.push({ statut: filtres.statut });
    if (filtres.priorite) clauses.push({ priorite: filtres.priorite });
    if (filtres.assigneId) clauses.push({ assignes: { some: { userId: filtres.assigneId } } });
    if (filtres.enRetard) {
      clauses.push({ dateFin: { lt: new Date() }, statut: { not: "done" } });
    }

    const taches = await this.prisma.task.findMany({
      where: { AND: clauses },
      orderBy: [{ dateFin: "asc" }, { priorite: "desc" }],
      include: {
        project: { select: { id: true, nom: true, icone: true } },
        milestone: { select: { id: true, nom: true } },
        assignes: { select: { userId: true, porteur: true, user: { select: { prenom: true, nom: true } } } },
        _count: { select: { sousTaches: true, dependances: true } },
      },
    });

    const maintenant = new Date();
    return taches.map((t) => ({
      ...t,
      enRetard: t.dateFin !== null && t.dateFin < maintenant && t.statut !== "done",
      /** Parti pris n° 2 : le hors-projet est nommé, pas laissé vide. */
      horsProjet: t.projectId === null,
    }));
  }

  // ── Création — EX-TSK-04, EX-TSK-05, EX-TSK-06 ───────────────────────────

  async creer(
    donnees: {
      titre: string; description?: string;
      projectId?: string | null; milestoneId?: string | null; epicId?: string | null;
      statut?: StatutTache; priorite?: Priorite;
      dateDebut?: Date | null; dateFin?: Date | null;
      estimationHeures?: number; confidentielle?: boolean;
      interventionExterieure?: boolean;
      assigneIds?: string[]; serviceIds?: string[];
    },
    acteurId: string,
  ) {
    if (donnees.dateDebut && donnees.dateFin && donnees.dateFin < donnees.dateDebut) {
      throw new ErreurTache("conflit_de_version");
    }

    // RG-JAL-04 — une tâche hors projet ne se rattache ni à un jalon ni à une
    // épopée. Contrôlé au serveur : une requête forgée doit échouer.
    if (!donnees.projectId && (donnees.milestoneId || donnees.epicId)) {
      throw new ErreurTache("hors_projet_avec_jalon");
    }
    // RG-JAL-03 — jalon et épopée appartiennent au MÊME projet que la tâche.
    if (donnees.projectId && donnees.milestoneId) {
      const jalon = await this.prisma.milestone.findUnique({
        where: { id: donnees.milestoneId },
        select: { projectId: true },
      });
      if (!jalon || jalon.projectId !== donnees.projectId) {
        throw new ErreurTache("jalon_autre_projet");
      }
    }

    // EX-TSK-06 — inviter des services entiers : les membres sont dépliés à la
    // création, pas conservés comme lien vers le service. Un service dont
    // l'effectif change ne doit pas réassigner rétroactivement une tâche.
    const parServices = donnees.serviceIds?.length
      ? await this.prisma.userService.findMany({
          where: { serviceId: { in: donnees.serviceIds } },
          select: { userId: true },
        })
      : [];
    const assignes = [
      ...new Set([...(donnees.assigneIds ?? []), ...parServices.map((s) => s.userId)]),
    ];

    const tache = await this.prisma.task.create({
      data: {
        titre: donnees.titre,
        description: donnees.description ?? null,
        projectId: donnees.projectId ?? null,
        milestoneId: donnees.milestoneId ?? null,
        epicId: donnees.epicId ?? null,
        statut: donnees.statut ?? "todo",
        priorite: donnees.priorite ?? "normal",
        dateDebut: donnees.dateDebut ?? null,
        dateFin: donnees.dateFin ?? null,
        estimationHeures: donnees.estimationHeures ?? null,
        confidentielle: donnees.confidentielle ?? false,
        interventionExterieure: donnees.interventionExterieure ?? false,
        assignes: {
          create: assignes.map((userId, i) => ({ userId, porteur: i === 0 })),
        },
      },
    });

    await this.audit.tracer({
      action: "task.create", typeEntite: "Task", entiteId: tache.id, acteurId,
      detail: { horsProjet: !donnees.projectId, assignes: assignes.length },
    });
    return tache;
  }

  // ── Dépendances — EX-TSK-10 à EX-TSK-13 ──────────────────────────────────

  /**
   * `RG-TSK-04` — **une dépendance circulaire est refusée.**
   *
   * Le contrôle ne se limite pas au cycle immédiat (A→B→A) : il remonte tout
   * le graphe. Un cycle de longueur 5 est aussi bloquant qu'un cycle de
   * longueur 2, et bien plus difficile à voir à l'œil.
   *
   * Parcours en largeur depuis le prérequis : si la tâche qu'on veut rendre
   * dépendante est déjà atteignable, ajouter le lien fermerait le cycle.
   */
  private async fermeraitUnCycle(taskId: string, prerequisId: string): Promise<boolean> {
    const vus = new Set<string>([prerequisId]);
    let front = [prerequisId];

    while (front.length > 0) {
      const liens = await this.prisma.taskDependency.findMany({
        where: { taskId: { in: front } },
        select: { prerequisId: true },
      });
      const suivants = liens.map((l) => l.prerequisId).filter((id) => !vus.has(id));
      if (suivants.includes(taskId)) return true;
      suivants.forEach((id) => vus.add(id));
      front = suivants;
    }
    return false;
  }

  async ajouterDependance(taskId: string, prerequisId: string, acteurId: string) {
    if (taskId === prerequisId) throw new ErreurTache("dependance_sur_soi");

    const [tache, prerequis] = await Promise.all([
      this.prisma.task.findUnique({ where: { id: taskId }, select: { projectId: true } }),
      this.prisma.task.findUnique({ where: { id: prerequisId }, select: { projectId: true } }),
    ]);
    if (!tache || !prerequis) throw new ErreurTache("introuvable");

    // RG-TSK-06 — deux tâches liées appartiennent au même projet.
    if (tache.projectId !== prerequis.projectId) throw new ErreurTache("dependance_autre_projet");

    // RG-TSK-05 — une dépendance en doublon est refusée.
    const existe = await this.prisma.taskDependency.findUnique({
      where: { taskId_prerequisId: { taskId, prerequisId } },
    });
    if (existe) throw new ErreurTache("dependance_en_double");

    if (await this.fermeraitUnCycle(taskId, prerequisId)) {
      throw new ErreurTache("dependance_circulaire");
    }

    await this.prisma.taskDependency.create({ data: { taskId, prerequisId } });
    await this.audit.tracer({
      action: "task.dependency_add", typeEntite: "Task", entiteId: taskId, acteurId,
      detail: { prerequisId },
    });
  }

  /** `EX-TSK-11` — ce dont une tâche dépend, et ce qu'elle bloque. */
  async dependances(taskId: string) {
    const [depend, bloque] = await Promise.all([
      this.prisma.taskDependency.findMany({
        where: { taskId },
        include: { prerequis: { select: { id: true, titre: true, statut: true, dateFin: true } } },
      }),
      this.prisma.taskDependency.findMany({
        where: { prerequisId: taskId },
        include: { task: { select: { id: true, titre: true, statut: true, dateDebut: true } } },
      }),
    ]);
    return {
      dependDe: depend.map((d) => d.prerequis),
      bloque: bloque.map((d) => d.task),
    };
  }

  /**
   * `EX-TSK-12` — incohérences de dates induites par les dépendances.
   *
   * Une tâche ne devrait pas commencer avant la fin de ce dont elle dépend.
   * Le produit **signale** au lieu d'interdire : le cadrage propose un
   * décalage en cascade, il n'impose pas la contrainte.
   */
  async incoherences(taskId: string) {
    const tache = await this.prisma.task.findUnique({
      where: { id: taskId },
      select: { dateDebut: true },
    });
    if (!tache?.dateDebut) return [];

    const liens = await this.prisma.taskDependency.findMany({
      where: { taskId },
      include: { prerequis: { select: { id: true, titre: true, dateFin: true } } },
    });

    return liens
      .filter((l) => l.prerequis.dateFin !== null && l.prerequis.dateFin > tache.dateDebut!)
      .map((l) => ({
        prerequis: l.prerequis,
        jours: Math.ceil(
          (l.prerequis.dateFin!.getTime() - tache.dateDebut!.getTime()) / 86_400_000,
        ),
      }));
  }

  /**
   * `EX-TSK-13`, `RG-TSK-09` — décaler en cascade les tâches dépendantes.
   *
   * Le nombre de tâches touchées est rendu **avant** l'exécution : le cadrage
   * exige que l'utilisateur se voie proposer le décalage « avec leur nombre ».
   * Décaler sans annoncer l'ampleur serait une action destructrice silencieuse.
   */
  async apercuCascade(taskId: string, jours: number): Promise<{ id: string; titre: string }[]> {
    const touchees: { id: string; titre: string }[] = [];
    const vus = new Set<string>([taskId]);
    let front = [taskId];

    while (front.length > 0) {
      const liens = await this.prisma.taskDependency.findMany({
        where: { prerequisId: { in: front } },
        include: { task: { select: { id: true, titre: true } } },
      });
      const suivants = liens.map((l) => l.task).filter((t) => !vus.has(t.id));
      suivants.forEach((t) => {
        vus.add(t.id);
        touchees.push(t);
      });
      front = suivants.map((t) => t.id);
    }
    return jours === 0 ? [] : touchees;
  }

  async decalerEnCascade(taskId: string, jours: number, acteurId: string) {
    const touchees = await this.apercuCascade(taskId, jours);
    const ids = [taskId, ...touchees.map((t) => t.id)];

    const taches = await this.prisma.task.findMany({
      where: { id: { in: ids } },
      select: { id: true, dateDebut: true, dateFin: true },
    });

    await this.prisma.$transaction(
      taches.map((t) =>
        this.prisma.task.update({
          where: { id: t.id },
          data: {
            dateDebut: t.dateDebut ? new Date(t.dateDebut.getTime() + jours * 86_400_000) : null,
            dateFin: t.dateFin ? new Date(t.dateFin.getTime() + jours * 86_400_000) : null,
            version: { increment: 1 },
          },
        }),
      ),
    );

    await this.audit.tracer({
      action: "task.cascade_shift", typeEntite: "Task", entiteId: taskId, acteurId,
      detail: { jours, tachesTouchees: touchees.length },
    });
    return { decalees: ids.length, touchees };
  }

  /**
   * `RG-TSK-07` — une tâche dont d'autres dépendent ne peut pas être
   * supprimée ; **la liste des dépendantes est affichée**.
   */
  async supprimer(taskId: string, acteurId: string) {
    const dependantes = await this.prisma.taskDependency.findMany({
      where: { prerequisId: taskId },
      include: { task: { select: { id: true, titre: true } } },
    });
    if (dependantes.length > 0) {
      throw new ErreurTache("supprimee_avec_dependantes", {
        dependantes: dependantes.map((d) => d.task.titre),
      });
    }
    await this.audit.tracer({
      action: "task.delete", typeEntite: "Task", entiteId: taskId, acteurId,
    });
    await this.prisma.task.delete({ where: { id: taskId } });
  }

  // ── RACI — EX-TSK-14 ─────────────────────────────────────────────────────

  /** `RG-TSK-10` — un même utilisateur ne porte pas deux fois le même rôle RACI. */
  async attribuerRaci(taskId: string, userId: string, role: RoleRaci, acteurId: string) {
    const existe = await this.prisma.taskRaci.findUnique({
      where: { taskId_userId_role: { taskId, userId, role } },
    });
    if (existe) throw new ErreurTache("raci_en_double");

    await this.prisma.taskRaci.create({ data: { taskId, userId, role } });
    await this.audit.tracer({
      action: "task.raci_add", typeEntite: "Task", entiteId: taskId, acteurId,
      detail: { userId, role },
    });
  }

  // ── Planning — RG-TSK-11 ─────────────────────────────────────────────────

  /**
   * `RG-TSK-11` — **une tâche multi-assignée ne peut pas voir sa date modifiée
   * par glisser-déposer.** Le glisser-déposer d'une tâche multi-assignée ne
   * change QUE l'assigné.
   *
   * Le motif est net : déplacer la date depuis la ligne d'une personne
   * changerait la date pour tout le monde, sans que l'auteur du geste le voie.
   * Le refus est donc un refus de conception, pas une limite technique.
   */
  async deplacerDepuisPlanning(
    taskId: string,
    cible: { nouvelleDate?: Date; nouvelAssigneId?: string; ancienAssigneId?: string },
    acteurId: string,
  ): Promise<{ dateModifiee: boolean; assigneModifie: boolean; avertissement?: string }> {
    const assignes = await this.prisma.taskAssignee.findMany({
      where: { taskId },
      select: { userId: true },
    });
    const multiAssignee = assignes.length > 1;

    let dateModifiee = false;
    let assigneModifie = false;

    if (cible.nouvelAssigneId) {
      // RG-PLN-06 — l'assignation d'un agent déjà affecté est refusée.
      if (assignes.some((a) => a.userId === cible.nouvelAssigneId)) {
        throw new ErreurTache("deja_assigne");
      }
      if (cible.ancienAssigneId) {
        await this.prisma.taskAssignee.delete({
          where: { taskId_userId: { taskId, userId: cible.ancienAssigneId } },
        });
      }
      await this.prisma.taskAssignee.create({
        data: { taskId, userId: cible.nouvelAssigneId },
      });
      assigneModifie = true;
    }

    if (cible.nouvelleDate) {
      if (multiAssignee) {
        // La date n'est PAS modifiée. Si un changement d'assigné a eu lieu, il
        // reste acquis — c'est exactement ce que dit la règle.
        return {
          dateModifiee: false,
          assigneModifie,
          avertissement: assigneModifie ? "multi_assignee_assigne_seul" : "multi_assignee_date",
        };
      }
      const tache = await this.prisma.task.findUniqueOrThrow({
        where: { id: taskId },
        select: { dateDebut: true, dateFin: true },
      });
      const duree =
        tache.dateDebut && tache.dateFin ? tache.dateFin.getTime() - tache.dateDebut.getTime() : 0;
      await this.prisma.task.update({
        where: { id: taskId },
        data: {
          dateDebut: cible.nouvelleDate,
          dateFin: new Date(cible.nouvelleDate.getTime() + duree),
          version: { increment: 1 },
        },
      });
      dateModifiee = true;
    }

    await this.audit.tracer({
      action: "task.planning_move", typeEntite: "Task", entiteId: taskId, acteurId,
      detail: { dateModifiee, assigneModifie },
    });
    return { dateModifiee, assigneModifie };
  }

  /** `EX-TSK-19` — les tâches orphelines : ni projet, ni assigné. */
  async orphelines(perimetre: Perimetre, permissions: ReadonlySet<string>) {
    return this.prisma.task.findMany({
      where: {
        AND: [
          this.perimetres.filtreTache(perimetre, permissions),
          { projectId: null },
          { assignes: { none: {} } },
        ],
      },
      orderBy: { creeLe: "desc" },
    });
  }

  /** `EX-TSK-20` — ses tâches terminées sans temps déclaré. */
  async terminesSansTemps(userId: string) {
    return this.prisma.task.findMany({
      where: {
        statut: "done",
        assignes: { some: { userId } },
        saisiesTemps: { none: {} },
      },
      orderBy: { dateFin: "desc" },
      select: { id: true, titre: true, dateFin: true, project: { select: { nom: true } } },
    });
  }
}
