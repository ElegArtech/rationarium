import { champRefuse, CHAMPS_GOUVERNES_PROJET } from "../commun/champs-gouvernes.js";
import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma.service.js";
import { AuditService } from "../commun/audit.service.js";
import { PerimetreService, type Perimetre } from "../commun/perimetre.service.js";
import { NotificationsService } from "../notifications/notifications.service.js";
import type { StatutProjet, Priorite } from "@rationarium/contracts";

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
  | "jalon_calcule"
  | "epopee_en_double"
  | "introuvable"
  | "conflit_de_version"
  | "hors_perimetre"
  | "champ_hors_permission";

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
  /*
   * `RG-GEN-07` — la version lue accompagne l'écriture.
   *
   * La maquette 13 rend le statut de chaque tâche **modifiable en ligne**
   * (`select.mini-select`), et `cadrage/02` le confirme : « Chaque tâche
   * affiche titre, statut modifiable en ligne, assignés, estimation ». Sans la
   * version ici, le client n'aurait rien à opposer à une écriture concurrente
   * et ne pourrait modifier qu'en « dernier arrivé gagne » — interdit.
   */
  version: true,
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
    filtres: {
      recherche?: string;
      statut?: StatutProjet;
      priorite?: Priorite;
      archive?: boolean;
      mesProjets?: boolean;
    } = {},
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
    /*
     * « Mes projets » se **cumule** avec la visibilité, il ne la remplace pas :
     * un resserrement de lecture ne peut pas élargir ce qu'on a le droit de
     * voir. Pour qui n'a pas de droit global, les deux prédicats coïncident et
     * le bouton ne change rien — ce qui est la lecture attendue.
     */
    if (filtres.mesProjets) clauses.push(this.perimetres.filtreMesProjets(perimetre.userId));
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
   * `RG-SCOPE-02` — le périmètre sur la lecture d'UN projet.
   *
   * **Quatre lectures de projet ne le contrôlaient pas du tout.** `fiche`,
   * `budget`, `equipe` et `feuilleDeRoute` ne prenaient qu'un identifiant :
   * quiconque détient `projects:read` — c'est-à-dire tout agent — obtenait
   * n'importe quel projet de l'instance en devinant son identifiant, avec son
   * budget, son équipe nominative et sa feuille de route. Le portefeuille, lui,
   * filtrait bien (`filtreProjet`), ce qui rendait le trou invisible : la liste
   * ne montrait que ce qu'on avait le droit de voir, et l'adresse directe
   * montrait tout. Un audit qui regarde la liste conclut que le cloisonnement
   * tient.
   *
   * Le refus distingue **introuvable** et **hors périmètre** : le premier dit
   * que rien n'existe, le second qu'on n'y a pas droit, et confondre les deux
   * empêcherait un chef de projet de comprendre pourquoi son lien ne s'ouvre
   * pas. Le renseignement rendu par la distinction — « ce projet existe » — est
   * celui que le portefeuille donne déjà par son compteur de total.
   */
  private async exigerVisible(
    projectId: string,
    perimetre: Perimetre,
    permissions: ReadonlySet<string>,
  ) {
    const projet = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true },
    });
    if (!projet) throw new ErreurProjet("introuvable");

    const visible = await this.prisma.project.findFirst({
      where: { AND: [{ id: projectId }, this.perimetres.filtreProjet(perimetre, permissions)] },
      select: { id: true },
    });
    if (!visible) throw new ErreurProjet("hors_perimetre");
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
  async fiche(
    projectId: string,
    perimetre: Perimetre,
    permissions: ReadonlySet<string>,
  ) {
    await this.exigerVisible(projectId, perimetre, permissions);

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
      this.calculerBudget(projectId),
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
  async budget(
    projectId: string,
    perimetre: Perimetre,
    permissions: ReadonlySet<string>,
  ) {
    await this.exigerVisible(projectId, perimetre, permissions);
    return this.calculerBudget(projectId);
  }

  /*
   * Le calcul nu, sans contrôle : il sert la fiche et l'instantané, qui ont
   * déjà vérifié le périmètre pour leur propre compte. Le séparer évite qu'un
   * appel interne ait à se fabriquer un périmètre — c'est-à-dire à en inventer
   * un plus large que celui de l'appelant.
   */
  private async calculerBudget(projectId: string) {

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
    permissions: ReadonlySet<string>,
  ) {
    /*
     * `RG-SCOPE-02` — **la même règle qu'à la modification, et pour la même
     * raison.** Nommer un chef ou un sponsor donne la visibilité du projet ;
     * c'est un geste d'appartenance, gouverné par `projects:manage_members`.
     *
     * Cette moitié-ci n'avait pas été alignée : `PATCH /projets/:id` refusait
     * `chefId` à qui n'a que `projects:update`, et `POST /projets` l'acceptait
     * de qui n'a que `projects:create`. Le même champ, la même règle, deux
     * réponses selon le verbe — donc une règle qu'un relecteur croit tenue
     * après avoir vérifié la mauvaise moitié. Fermer une porte et laisser la
     * fenêtre.
     *
     * **Un seul modèle de rôle est concerné** : `PORTFOLIO_MANAGER`, seul à
     * détenir `projects:create` sans `projects:manage_members`. Il ne perd
     * rien de cohérent : il ne pouvait DÉJÀ pas changer le chef d'un projet
     * existant, donc il pouvait seulement en nommer un mauvais sans jamais
     * pouvoir le corriger. Aucun écran n'envoie ces champs à la création à ce
     * jour — la fenêtre de la vue 10 ne les pose pas —, donc l'alignement ne
     * retire aucune capacité exercée. Rendre à ce rôle le pouvoir de nommer un
     * chef se fait en lui donnant `projects:manage_members`, pas en rouvrant
     * un trou dans la règle de champ.
     */
    const refuse = champRefuse(donnees, CHAMPS_GOUVERNES_PROJET, permissions);
    if (refuse) throw new ErreurProjet("champ_hors_permission", refuse);

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
   * `EX-PRJ-05` — **modifier un projet.**
   *
   * L'exigence est au cadrage et la maquette 11 pose le bouton « Modifier »
   * sur la fiche. Aucune route ne l'a jamais servi : corriger une date de fin
   * ou un chef de projet était impossible sans supprimer le projet, donc sans
   * perdre ses tâches, ses jalons et son équipe.
   *
   * Troisième occurrence du même trou après `EX-ORG-02` et `EX-CLI-02` : une
   * exigence « créer, modifier, supprimer » livrée sans son verbe du milieu.
   * La chaîne de traçabilité était vraie dans le sens descendant ; rien ne
   * vérifiait qu'un verbe déclaré soit atteignable.
   *
   * `RG-PRJ-04` — un projet annulé se restaure avant d'être modifié. Le
   * changement de statut est la seule exception : sans elle, restaurer serait
   * lui-même refusé.
   *
   * `RG-GEN-07` — la version lue conditionne l'écriture.
   */
  async modifier(
    id: string,
    donnees: {
      nom?: string; description?: string | null; statut?: StatutProjet; priorite?: Priorite;
      dateDebut?: Date; dateFin?: Date; budgetHeures?: number | null; icone?: string | null;
      chefId?: string | null; sponsorId?: string | null; departementId?: string | null;
      version: number;
    },
    acteurId: string,
    permissions: ReadonlySet<string>,
  ) {
    /*
     * `RG-SCOPE-02` — chef et sponsor VOIENT le projet du seul fait d'être
     * nommés. Les écrire est donc un geste d'appartenance, gouverné par
     * `projects:manage_members` comme l'ajout d'un membre — et non par
     * `projects:update`, qui garde la route.
     */
    const refuse = champRefuse(donnees, CHAMPS_GOUVERNES_PROJET, permissions);
    if (refuse) throw new ErreurProjet("champ_hors_permission", refuse);

    const avant = await this.prisma.project.findUnique({ where: { id } });
    if (!avant) throw new ErreurProjet("introuvable");
    if (avant.statut === "cancelled" && donnees.statut === undefined) {
      throw new ErreurProjet("projet_annule");
    }

    /*
     * Les dates se contrôlent sur l'état RÉSULTANT, jamais sur le seul corps
     * reçu : ne changer que `dateFin` pour la faire passer avant un `dateDebut`
     * déjà en base est licite requête par requête, et interdit en résultat.
     */
    const debut = donnees.dateDebut ?? avant.dateDebut;
    const fin = donnees.dateFin ?? avant.dateFin;
    if (fin < debut) throw new ErreurProjet("dates_incoherentes");

    const { count } = await this.prisma.project.updateMany({
      where: { id, version: donnees.version },
      data: {
        ...(donnees.nom !== undefined ? { nom: donnees.nom } : {}),
        ...(donnees.description !== undefined ? { description: donnees.description } : {}),
        ...(donnees.statut !== undefined ? { statut: donnees.statut } : {}),
        ...(donnees.priorite !== undefined ? { priorite: donnees.priorite } : {}),
        ...(donnees.dateDebut !== undefined ? { dateDebut: donnees.dateDebut } : {}),
        ...(donnees.dateFin !== undefined ? { dateFin: donnees.dateFin } : {}),
        ...(donnees.budgetHeures !== undefined ? { budgetHeures: donnees.budgetHeures } : {}),
        ...(donnees.icone !== undefined ? { icone: donnees.icone } : {}),
        ...(donnees.chefId !== undefined ? { chefId: donnees.chefId } : {}),
        ...(donnees.sponsorId !== undefined ? { sponsorId: donnees.sponsorId } : {}),
        ...(donnees.departementId !== undefined ? { departementId: donnees.departementId } : {}),
        version: { increment: 1 },
      },
    });
    if (count === 0) throw new ErreurProjet("conflit_de_version");

    await this.audit.tracer({
      action: "project.update",
      typeEntite: "Project",
      entiteId: id,
      acteurId,
      detail: { avant: avant.nom },
    });
    return this.prisma.project.findUniqueOrThrow({ where: { id } });
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
  async impactSuppression(
    id: string,
    perimetre: Perimetre,
    permissions: ReadonlySet<string>,
  ) {
    // L'impact CHIFFRE le contenu du projet — tâches, jalons, heures. C'est
    // une lecture du projet, et elle en hérite le périmètre.
    await this.exigerVisible(id, perimetre, permissions);
    return this.calculerImpact(id);
  }

  /* Le calcul nu : la suppression définitive l'appelle après avoir vérifié
   * ses propres droits, et n'a pas à se fabriquer un périmètre pour cela. */
  private async calculerImpact(id: string) {
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
    const impact = await this.calculerImpact(id);
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
  async equipe(
    projectId: string,
    perimetre: Perimetre,
    permissions: ReadonlySet<string>,
  ) {
    await this.exigerVisible(projectId, perimetre, permissions);

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

    /*
     * `RG-JAL-06` — un jalon SANS TÂCHE n'a rien à calculer.
     *
     * Le calcul le laissait « en attente » pour toujours, échéance tenue
     * comprise : un jalon de cadrage, de comité ou de livraison contractuelle
     * n'a parfois aucune tâche dans l'outil, et restait donc éternellement
     * ouvert sur la feuille de route. C'est le seul cas où la colonne
     * `Milestone.statut` est LUE — ailleurs elle est ignorée, et le calcul de
     * `RG-JAL-01` prime sans exception.
     *
     * Deux états suffisent ici : marqué ou non. « En cours » ne veut rien dire
     * sur un jalon qui ne porte aucun travail.
     */
    if (taches.length === 0) {
      const jalon = await this.prisma.milestone.findUnique({
        where: { id: milestoneId },
        select: { statut: true },
      });
      return jalon?.statut === "done" ? "done" : "pending";
    }

    if (taches.every((t) => t.statut === "done")) return "done";
    if (taches.every((t) => t.statut === "todo")) return "pending";
    return "doing";
  }

  /**
   * `EX-JAL-02`, `RG-JAL-06` — marquer un jalon sans tâche comme atteint, ou
   * le rouvrir.
   *
   * **Le geste refuse un jalon qui porte des tâches**, et le dit : là, le
   * statut se calcule, et forcer une valeur ferait diverger l'affichage du
   * travail réel. C'est la borne qui rend l'exception compatible avec
   * `RG-JAL-01` plutôt que contradictoire.
   */
  async marquerJalon(
    id: string,
    atteint: boolean,
    version: number,
    acteurId: string,
  ) {
    const jalon = await this.prisma.milestone.findUnique({
      where: { id },
      select: { projectId: true, _count: { select: { taches: true } } },
    });
    if (!jalon) throw new ErreurProjet("introuvable");
    await this.refuserSiAnnule(jalon.projectId);
    if (jalon._count.taches > 0) throw new ErreurProjet("jalon_calcule");

    const { count } = await this.prisma.milestone.updateMany({
      where: { id, version },
      data: { statut: atteint ? "done" : "pending", version: { increment: 1 } },
    });
    if (count === 0) throw new ErreurProjet("conflit_de_version");

    await this.audit.tracer({
      action: "milestone.update", typeEntite: "Milestone", entiteId: id, acteurId,
      detail: { marque: atteint ? "done" : "pending" },
    });
    return this.prisma.milestone.findUniqueOrThrow({ where: { id } });
  }

  /**
   * `RG-JAL-06` — rattacher une tâche à un jalon EFFACE la marque posée.
   *
   * Sans cela, la marque serait conservée en sommeil sous le calcul, et
   * reparaîtrait au premier détachement — un jalon soudain « atteint » sans
   * que personne n'ait rien fait. Elle est donc effacée au moment où le calcul
   * reprend la main.
   *
   * Appelée par tout ce qui rattache : la création d'une tâche, sa
   * modification, l'import CSV.
   */
  async reprendreLeCalcul(milestoneId: string) {
    await this.prisma.milestone.updateMany({
      where: { id: milestoneId, statut: "done" },
      data: { statut: "pending" },
    });
  }

  /** `EX-JAL-03`, `EX-JAL-04` — feuille de route et indicateurs. */
  async feuilleDeRoute(
    projectId: string,
    perimetre: Perimetre,
    permissions: ReadonlySet<string>,
  ) {
    await this.exigerVisible(projectId, perimetre, permissions);

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

  /**
   * `EX-JAL-01` — modifier un jalon.
   *
   * Le geste manquait : le jalon se créait et se supprimait, il ne se corrigeait
   * pas. Une date d'échéance qui bouge — c'est le cas courant sur une feuille de
   * route — obligeait à supprimer le jalon, donc à détacher ses tâches
   * (`RG-JAL-05`) et à les rattacher une à une.
   *
   * `RG-JAL-02` tient toujours : le projet n'est pas modifiable ici, un jalon
   * appartient à un et un seul projet.
   */
  async modifierJalon(
    id: string,
    donnees: {
      nom?: string;
      description?: string | null;
      dateEcheance?: Date | null;
      version: number;
    },
    acteurId: string,
  ) {
    const avant = await this.prisma.milestone.findUnique({ where: { id } });
    if (!avant) throw new ErreurProjet("introuvable");
    await this.refuserSiAnnule(avant.projectId);

    const { count } = await this.prisma.milestone.updateMany({
      where: { id, version: donnees.version },
      data: {
        ...(donnees.nom !== undefined ? { nom: donnees.nom } : {}),
        ...(donnees.description !== undefined ? { description: donnees.description } : {}),
        ...(donnees.dateEcheance !== undefined ? { dateEcheance: donnees.dateEcheance } : {}),
        version: { increment: 1 },
      },
    });
    if (count === 0) throw new ErreurProjet("conflit_de_version");

    await this.audit.tracer({
      action: "milestone.update", typeEntite: "Milestone", entiteId: id, acteurId,
    });
    return this.prisma.milestone.findUniqueOrThrow({ where: { id } });
  }

  // ── Épopées — `EX-JAL-07` ─────────────────────────────────────────────────
  //
  // L'épopée existait en base, au catalogue de permissions et dans le formulaire
  // de tâche — et nulle part ailleurs. Aucun service, aucune route : le champ
  // `epicId` d'une tâche ne pouvait donc JAMAIS être renseigné, puisque rien ne
  // permettait de créer l'épopée à laquelle le rattacher.

  /** `EX-JAL-07` — les épopées d'un projet, avec le nombre de tâches de chacune. */
  async epopees(projectId: string, perimetre: Perimetre, permissions: ReadonlySet<string>) {
    // Les épopées d'un projet sont une lecture DU projet : elles héritent de
    // son périmètre, comme sa feuille de route et son équipe.
    await this.exigerVisible(projectId, perimetre, permissions);
    const epopees = await this.prisma.epic.findMany({
      where: { projectId },
      orderBy: { nom: "asc" },
      include: { _count: { select: { taches: true } } },
    });
    return epopees.map(({ _count, ...e }) => ({ ...e, taches: _count.taches }));
  }

  /**
   * `EX-JAL-07` — créer une épopée.
   *
   * Le nom est unique par projet (contrainte `@@unique([projectId, nom])`) :
   * deux regroupements thématiques homonymes dans le même projet ne
   * distinguent rien. Le doublon se rend en message rédigé, pas en code
   * PostgreSQL.
   */
  async creerEpopee(
    donnees: { nom: string; description?: string; projectId: string },
    acteurId: string,
  ) {
    await this.refuserSiAnnule(donnees.projectId);
    const doublon = await this.prisma.epic.findUnique({
      where: { projectId_nom: { projectId: donnees.projectId, nom: donnees.nom } },
      select: { id: true },
    });
    if (doublon) throw new ErreurProjet("epopee_en_double", { nom: donnees.nom });

    const epopee = await this.prisma.epic.create({
      data: {
        nom: donnees.nom,
        description: donnees.description ?? null,
        projectId: donnees.projectId,
      },
    });
    await this.audit.tracer({
      action: "epic.create", typeEntite: "Epic", entiteId: epopee.id, acteurId,
    });
    return epopee;
  }

  /** `EX-JAL-07` — modifier une épopée. Le projet ne change pas. */
  async modifierEpopee(
    id: string,
    donnees: { nom?: string; description?: string | null; version: number },
    acteurId: string,
  ) {
    const avant = await this.prisma.epic.findUnique({ where: { id } });
    if (!avant) throw new ErreurProjet("introuvable");
    await this.refuserSiAnnule(avant.projectId);

    if (donnees.nom !== undefined && donnees.nom !== avant.nom) {
      const doublon = await this.prisma.epic.findUnique({
        where: { projectId_nom: { projectId: avant.projectId, nom: donnees.nom } },
        select: { id: true },
      });
      if (doublon) throw new ErreurProjet("epopee_en_double", { nom: donnees.nom });
    }

    const { count } = await this.prisma.epic.updateMany({
      where: { id, version: donnees.version },
      data: {
        ...(donnees.nom !== undefined ? { nom: donnees.nom } : {}),
        ...(donnees.description !== undefined ? { description: donnees.description } : {}),
        version: { increment: 1 },
      },
    });
    if (count === 0) throw new ErreurProjet("conflit_de_version");

    await this.audit.tracer({
      action: "epic.update", typeEntite: "Epic", entiteId: id, acteurId,
    });
    return this.prisma.epic.findUniqueOrThrow({ where: { id } });
  }

  /**
   * `EX-JAL-07` — supprimer une épopée.
   *
   * Elle **détache** ses tâches sans les supprimer, comme `RG-JAL-05` l'impose
   * au jalon : le regroupement disparaît, le travail reste. Le schéma pose déjà
   * `onDelete: SetNull` sur `Task.epic` ; on compte quand même les tâches avant
   * pour pouvoir le DIRE — un détachement muet est ce qui inquiète.
   */
  async supprimerEpopee(id: string, acteurId: string) {
    const avant = await this.prisma.epic.findUnique({ where: { id } });
    if (!avant) throw new ErreurProjet("introuvable");

    const detachees = await this.prisma.task.count({ where: { epicId: id } });
    await this.prisma.epic.delete({ where: { id } });
    await this.audit.tracer({
      action: "epic.delete", typeEntite: "Epic", entiteId: id, acteurId,
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
      this.calculerBudget(projectId),
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

  /**
   * `EX-PRJ-13` — **l'historique** des instantanés d'un projet, en entier.
   *
   * Deux verbes à l'exigence, un seul était servi. La seule lecture existante
   * était `tendance()` (M17, rapports) : elle moyenne `progression` par date
   * sur un LOT de projets et **jette** `tachesTotal`, `tachesFinies` et
   * `heuresConsommees`. Elle répond à « comment vont les projets », pas à
   * « où en était CE projet le 12 mars ».
   *
   * Ordre du cloisonnement : la garde a exigé `reports:read` ; le périmètre se
   * vérifie ici, et sur le PROJET, pas sur les instantanés. Le filtre de
   * `RG-SCOPE-02` s'écrit sur `Project` — le rejouer sur `ProjectSnapshot`
   * demanderait de le réécrire à travers la relation, donc de le dédoubler.
   *
   * Un projet hors périmètre est refusé, jamais rendu vide : une liste vide
   * ferait croire à un projet sans historique, ce qui n'est pas la même chose
   * et n'appelle pas la même conduite.
   *
   * L'ordre est **chronologique décroissant** : la vue lit d'abord le point le
   * plus récent, et un historique long ne fait pas descendre le plus utile.
   */
  async instantanes(
    projectId: string,
    perimetre: Perimetre,
    permissions: ReadonlySet<string>,
  ) {
    await this.exigerVisible(projectId, perimetre, permissions);

    return this.prisma.projectSnapshot.findMany({
      where: { projectId },
      orderBy: { date: "desc" },
    });
  }

  /**
   * `RG-PRJ-09` — la capture **périodique**, celle que la règle demande.
   *
   * Jusqu'ici le bouton « Capturer un instantané » de la vue 11 était le SEUL
   * producteur d'instantanés du produit : une instance que personne ne
   * pensait à cliquer gardait une courbe de tendance vide à jamais, et
   * l'historique de `EX-PRJ-13` n'aurait rien eu à montrer. Une règle tenue
   * par un geste humain quotidien n'est pas tenue.
   *
   * Le lot est **borné aux projets vivants** : archivés et annulés n'avancent
   * plus, et en capturer la ligne chaque nuit ferait grossir la table d'un
   * point identique par jour et par projet mort.
   *
   * **Aucun échec de projet n'arrête le lot.** Un instantané raté sur un
   * projet est un trou dans une courbe ; le même échec propagé arrêterait la
   * capture de tous les suivants, et le trou deviendrait une panne. Le compte
   * rendu dit les deux nombres — c'est ce qu'on lit dans le journal pour
   * savoir si la nuit s'est bien passée.
   */
  async capturerInstantanesDuJour(instant: Date) {
    /*
     * **Le JOUR, jamais l'instant.** La colonne est `@db.Date` et la clé
     * d'unicité est `(projet, date)` : passer l'heure du déclenchement ferait
     * dépendre l'idempotence d'un arrondi que le pilote décide, pas nous. Un
     * rejeu manuel après un échec doit rafraîchir la ligne du jour, jamais en
     * empiler une seconde.
     */
    const date = new Date(
      Date.UTC(instant.getUTCFullYear(), instant.getUTCMonth(), instant.getUTCDate()),
    );

    const projets = await this.prisma.project.findMany({
      where: { archive: false, statut: { not: "cancelled" } },
      select: { id: true },
    });

    let captures = 0;
    const echecs: string[] = [];
    for (const p of projets) {
      try {
        await this.capturerInstantane(p.id, date);
        captures += 1;
      } catch {
        echecs.push(p.id);
      }
    }
    return { captures, echecs };
  }
}
