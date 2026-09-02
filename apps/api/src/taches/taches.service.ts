import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma.service.js";
import { AuditService } from "../commun/audit.service.js";
import { PerimetreService, type Perimetre } from "../commun/perimetre.service.js";
import { NotificationsService } from "../notifications/notifications.service.js";
import type { StatutTache, Priorite, RoleRaci } from "@rationarium/contracts";
import { debutDuJour, echeanceAujourdhui, echeanceDepassee } from "../commun/dates.js";

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
  | "dates_incoherentes"
  | "horaires_incoherents"
  | "droit_de_creation_manquant"
  | "pas_membre_du_projet"
  | "suppression_reservee_aux_assignes"
  | "introuvable"
  | "hors_perimetre"
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
    private readonly notifications: NotificationsService,
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
      // Le DÉBUT du jour : `dateFin` est une colonne `Date`, donc à minuit, et
      // comparée à l'heure courante le filtre ramassait tout le travail dû
      // aujourd'hui. Voir `commun/dates.ts`.
      clauses.push({ dateFin: { lt: debutDuJour(new Date()) }, statut: { not: "done" } });
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
      enRetard: echeanceDepassee(t.dateFin, maintenant) && t.statut !== "done",
      /** Due aujourd'hui : le dernier jour où elle peut encore être tenue. */
      pourAujourdhui: echeanceAujourdhui(t.dateFin, maintenant) && t.statut !== "done",
      /** Parti pris n° 2 : le hors-projet est nommé, pas laissé vide. */
      horsProjet: t.projectId === null,
    }));
  }

  // ── Création — EX-TSK-04, EX-TSK-05, EX-TSK-06 ───────────────────────────

  /**
   * `RG-TSK-03` — **être membre du projet, ou détenir la gestion globale.**
   *
   * « Membre » se lit ici comme partout ailleurs dans le produit
   * (`RG-SCOPE-02`, `filtreMesProjets`) : créateur, chef, sponsor ou membre.
   * Une seconde définition, plus étroite, divergerait au premier ajout de rôle
   * et rendrait visible en lecture ce qui serait refusé en écriture.
   *
   * La gestion globale est celle de `PERMISSIONS_GESTION_GLOBALE` pour les deux
   * domaines en cause : qui gère toutes les tâches, ou tous les projets,
   * n'appartient à aucun et les mène tous.
   */
  private async exigerAppartenance(
    projectId: string,
    acteurId: string,
    permissions: ReadonlySet<string>,
  ) {
    if (permissions.has("tasks:manage_any") || permissions.has("projects:manage_any")) return;
    const mien = await this.prisma.project.findFirst({
      where: { AND: [{ id: projectId }, this.perimetres.filtreMesProjets(acteurId)] },
      select: { id: true },
    });
    if (!mien) throw new ErreurTache("pas_membre_du_projet");
  }

  /**
   * `RG-JAL-06` — rattacher une tâche à un jalon EFFACE la marque posée à la
   * main sur lui.
   *
   * Un jalon sans tâche se marque « atteint » à la main, faute d'avancement à
   * calculer. Dès qu'une tâche l'accompagne, `RG-JAL-01` reprend la main — et
   * la marque doit disparaître, pas dormir sous le calcul : conservée, elle
   * reparaîtrait au premier détachement, et le jalon redeviendrait « atteint »
   * sans que personne n'ait rien fait.
   *
   * Écrite ici plutôt qu'appelée sur `ProjetsService` : l'inverse créerait un
   * cycle entre les deux modules pour deux lignes de Prisma. La règle est
   * énoncée une fois, au cadrage, et les deux endroits qui la tiennent la
   * citent.
   */
  private async reprendreLeCalculDuJalon(milestoneId: string | null | undefined) {
    if (!milestoneId) return;
    await this.prisma.milestone.updateMany({
      where: { id: milestoneId, statut: "done" },
      data: { statut: "pending" },
    });
  }
  /**
   * `EX-TSK-04` — créer une tâche, **avec ses horaires**.
   *
   * `heureDebut` / `heureFin` existent au schéma et sont lues par le planning
   * depuis toujours ; aucune écriture ne les remplissait — ni ici, ni dans la
   * modification, ni dans les schémas Zod. Deux colonnes mortes en écriture et
   * vivantes en lecture : un créneau de réunion était insaisissable, et Zod
   * retirait le champ **en silence** à qui l'envoyait.
   *
   * `RG-TSK-02` puis `RG-TSK-03` — **permission d'abord, appartenance ensuite**,
   * dans cet ordre. La garde de route ouvre à qui détient l'un des deux droits
   * de création ; c'est ici qu'on décide lequel le corps reçu appelle
   * réellement, puisque c'est la PRÉSENCE de `projectId` qui tranche.
   */
  async creer(
    donnees: {
      titre: string; description?: string;
      projectId?: string | null; milestoneId?: string | null; epicId?: string | null;
      statut?: StatutTache; priorite?: Priorite;
      dateDebut?: Date | null; dateFin?: Date | null;
      heureDebut?: string | null; heureFin?: string | null;
      estimationHeures?: number; confidentielle?: boolean;
      /**
       * `EX-TSK-08` — le pourcentage d'avancement, accepté DÈS LA CRÉATION.
       *
       * Il ne l'était pas, et il figurait pourtant dans `tacheSchema`, le
       * contrat exporté : la clé traversait la validation du contrôleur, où
       * Zod la retirait sans rien dire, puis n'existait plus ici. Un projet
       * chargé avec son historique affichait donc zéro pour cent, puisque
       * `RG-PRJ-07` moyenne un champ que rien n'écrivait.
       */
      avancement?: number;
      interventionExterieure?: boolean;
      assigneIds?: string[]; serviceIds?: string[];
    },
    acteurId: string,
    permissions: ReadonlySet<string>,
  ) {
    /*
     * `RG-TSK-02` — deux droits distincts, et c'est l'ABSENCE de `projectId`
     * qui appelle le second. La route n'exigeait que `tasks:create` : douze
     * modèles de rôles détiennent `tasks:create_standalone` sans lui et ne
     * pouvaient donc RIEN créer, tandis qu'un porteur de `tasks:create` seul
     * créait des tâches hors projet sans en avoir le droit. Le motif est celui
     * de `champs-gouvernes.ts`, pris à l'envers.
     */
    const requise = donnees.projectId ? "tasks:create" : "tasks:create_standalone";
    if (!permissions.has(requise)) {
      throw new ErreurTache("droit_de_creation_manquant", { permission: requise });
    }

    /*
     * `RG-TSK-03` — « créer une tâche dans un projet exige d'en être membre,
     * sauf permission de gestion globale. » Rien ne le contrôlait : un agent
     * sans aucun lien avec le projet y créait une tâche sans erreur.
     */
    if (donnees.projectId) {
      await this.exigerAppartenance(donnees.projectId, acteurId, permissions);
    }

    if (donnees.dateDebut && donnees.dateFin && donnees.dateFin < donnees.dateDebut) {
      throw new ErreurTache("dates_incoherentes");
    }
    // `EX-TSK-04` — la même cohérence que `EvenementsService.creer` applique
    // déjà à ses créneaux : une fin qui ne suit pas son début n'est pas une
    // plage, c'est une saisie inversée.
    if (donnees.heureDebut && donnees.heureFin && donnees.heureFin <= donnees.heureDebut) {
      throw new ErreurTache("horaires_incoherents");
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
    /*
     * La règle nomme « un jalon **ou une épopée** du même projet », et seul le
     * jalon était contrôlé. L'épopée passait parce que rien ne pouvait en
     * créer une — `EX-JAL-07` n'était pas porté. Le trou s'ouvrait à la minute
     * où la première épopée existerait.
     */
    if (donnees.projectId && donnees.epicId) {
      const epopee = await this.prisma.epic.findUnique({
        where: { id: donnees.epicId },
        select: { projectId: true },
      });
      if (!epopee || epopee.projectId !== donnees.projectId) {
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
        heureDebut: donnees.heureDebut ?? null,
        heureFin: donnees.heureFin ?? null,
        estimationHeures: donnees.estimationHeures ?? null,
        // Absent du corps, il vaut zéro — la même valeur que le défaut de la
        // colonne, écrite ici pour que les deux ne puissent pas diverger.
        avancement: donnees.avancement ?? 0,
        confidentielle: donnees.confidentielle ?? false,
        interventionExterieure: donnees.interventionExterieure ?? false,
        assignes: {
          create: assignes.map((userId, i) => ({ userId, porteur: i === 0 })),
        },
      },
    });

    // `RG-JAL-06` — le jalon reçoit une tâche : le calcul reprend la main.
    await this.reprendreLeCalculDuJalon(donnees.milestoneId);

    await this.audit.tracer({
      action: "task.create", typeEntite: "Task", entiteId: tache.id, acteurId,
      detail: { horsProjet: !donnees.projectId, assignes: assignes.length },
    });

    // `cadrage/01 § M18` — « Nouvelle tâche assignée ». On ne se notifie pas
    // soi-même : celui qui crée la tâche vient de la voir.
    await this.notifications.notifierPlusieurs(
      assignes.filter((id) => id !== acteurId),
      {
        type: "tache_assignee",
        titre: `Nouvelle tâche : ${tache.titre}`,
        contenu: `La tâche « ${tache.titre} » vous a été assignée.`,
        lien: `/taches/${tache.id}`,
      },
    );

    return tache;
  }

  // ── Dépendances — EX-TSK-10 à EX-TSK-13 ──────────────────────────────────

  /**
   * `EX-TSK-13` — la fiche d'une tâche : tout ce que la vue 17 affiche.
   *
   * C'est la vue la plus dense en objets liés du produit : sous-tâches,
   * dépendances dans les deux sens, RACI, commentaires, documents, tiers. Les
   * charger en un appel n'est pas une optimisation — c'est la seule façon
   * d'éviter que la page se remplisse par morceaux, chacun avec son propre
   * clignotement.
   */
  async fiche(taskId: string, perimetre: Perimetre, permissions: ReadonlySet<string>) {
    const tache = await this.prisma.task.findUnique({
      where: { id: taskId },
      include: {
        project: { select: { id: true, nom: true, icone: true } },
        milestone: { select: { id: true, nom: true } },
        epic: { select: { id: true, nom: true } },
        assignes: {
          select: { userId: true, porteur: true, user: { select: { prenom: true, nom: true } } },
        },
        sousTaches: { orderBy: { ordre: "asc" } },
        raci: {
          select: { userId: true, role: true, user: { select: { prenom: true, nom: true } } },
        },
        tiers: {
          select: {
            thirdParty: { select: { id: true, organisation: true, contactNom: true } },
          },
        },
        commentaires: {
          orderBy: { creeLe: "asc" },
          include: { auteur: { select: { id: true, prenom: true, nom: true } } },
        },
        documents: {
          orderBy: { creeLe: "desc" },
          select: {
            id: true, nom: true, tailleOctets: true, typeMime: true, creeLe: true,
            auteur: { select: { prenom: true, nom: true } },
          },
        },
      },
    });
    if (!tache) throw new ErreurTache("introuvable");

    /*
     * `RG-SCOPE-04` — permission PUIS périmètre. La fiche n'avait que la
     * première : `tasks:read` suffisait à lire N'IMPORTE QUELLE tâche par son
     * identifiant, confidentielle comprise. Le cloisonnement se contournait
     * donc par une URL devinée, et aucune boucle ne pouvait le voir puisque
     * les listes, elles, filtrent correctement.
     *
     * « Hors périmètre » et non « introuvable » : le message est celui du
     * catalogue partagé, et il ne renseigne pas sur l'existence de la ligne.
     */
    const lisible = await this.prisma.task.findFirst({
      where: { AND: [{ id: taskId }, this.perimetres.filtreTache(perimetre, permissions)] },
      select: { id: true },
    });
    if (!lisible) throw new ErreurTache("hors_perimetre");

    const [liens, incoherences] = await Promise.all([
      this.dependances(taskId, perimetre, permissions),
      this.incoherences(taskId),
    ]);

    /*
     * **Une permission garde une route, pas un champ** — ici sur une relation
     * EMBARQUÉE. `GET /documents/commentaires/fil` exige `comments:read` ;
     * cette fiche-ci, gardée par `tasks:read`, rendait le même fil. Un compte
     * porteur de `tasks:read` sans `comments:read` lisait donc tous les
     * commentaires du produit par l'autre porte.
     *
     * Le fil est ABSENT de la réponse, pas vide : un tableau vide dirait « il
     * n'y a pas de commentaire », ce qui est faux, et l'écran ne pourrait pas
     * faire la différence entre « rien à lire » et « pas le droit de lire ».
     */
    const { commentaires, ...reste } = tache;
    const maintenant = new Date();
    return {
      ...reste,
      ...(permissions.has("comments:read") ? { commentaires } : {}),
      tiers: tache.tiers.map((x) => x.thirdParty),
      dependances: liens,
      incoherences,
      enRetard: echeanceDepassee(tache.dateFin, maintenant) && tache.statut !== "done",
      /** Due aujourd'hui : le dernier jour où elle peut encore être tenue. */
      pourAujourdhui: echeanceAujourdhui(tache.dateFin, maintenant) && tache.statut !== "done",
      /** Parti pris n° 2 : le hors-projet est nommé, pas laissé vide. */
      horsProjet: tache.projectId === null,
    };
  }

  /**
   * `EX-TSK-08` — modifier une tâche. `EX-TSK-15` — l'y rattacher ou l'en
   * détacher a posteriori.
   *
   * `RG-GEN-07` — **la version lue est transmise et recontrôlée.** Sans elle,
   * deux personnes qui éditent la même tâche produisent un « dernier arrivé
   * gagne » silencieux : celui qui enregistre en second efface le travail du
   * premier sans que personne ne le sache.
   */
  async modifier(
    taskId: string,
    donnees: {
      version: number;
      titre?: string;
      description?: string | null;
      statut?: StatutTache;
      priorite?: Priorite;
      dateDebut?: Date | null;
      dateFin?: Date | null;
      estimationHeures?: number | null;
      avancement?: number;
      /*
       * `RG-SCOPE-04` — la confidentialité se change APRÈS COUP. Elle n'était
       * acceptée qu'à la création : une tâche devenue sensible ne pouvait plus
       * le devenir, et une tâche marquée par erreur restait invisible pour
       * toujours à ceux qui n'ont pas la permission de lecture confidentielle.
       */
      confidentielle?: boolean;
      /*
       * `RG-JAL-03` — le rattachement se change APRÈS COUP, lui aussi. Il
       * n'était accepté qu'à la création : une tâche créée sans jalon ne
       * pouvait plus en recevoir un, et la feuille de route montrait un bloc
       * « sans jalon » que rien ne permettait de vider. `null` détache.
       */
      milestoneId?: string | null;
      epicId?: string | null;
      /*
       * `EX-TSK-15` — **rattacher ou détacher une tâche d'un projet a
       * posteriori.** Le verbe du milieu manquait : `projectId` n'était accepté
       * qu'à la création, la modification le retirait en silence, et l'appelant
       * croyait avoir rattaché. Une tâche née hors projet le restait pour
       * toujours ; une tâche de projet ne pouvait pas en sortir. `null` détache.
       */
      projectId?: string | null;
      /** `EX-TSK-04` — les horaires se corrigent, comme les dates. */
      heureDebut?: string | null;
      heureFin?: string | null;
    },
    acteurId: string,
    permissions: ReadonlySet<string>,
  ) {
    const { version, ...champs } = donnees;
    const avant = await this.prisma.task.findUnique({
      where: { id: taskId },
      select: {
        version: true, statut: true, avancement: true, projectId: true,
        heureDebut: true, heureFin: true,
      },
    });
    if (!avant) throw new ErreurTache("introuvable");
    if (avant.version !== version) {
      throw new ErreurTache("conflit_de_version", { attendue: avant.version, recue: version });
    }

    if (champs.dateDebut && champs.dateFin && champs.dateFin < champs.dateDebut) {
      throw new ErreurTache("dates_incoherentes");
    }

    /*
     * `EX-TSK-04` — la cohérence porte sur l'état RÉSULTANT, pas sur le corps
     * reçu : ne changer QUE l'heure de fin doit être confronté à l'heure de
     * début déjà en base, sinon la règle ne tiendrait que sur les saisies
     * complètes. `undefined` laisse en place, `null` efface.
     */
    const heureDebut = champs.heureDebut !== undefined ? champs.heureDebut : avant.heureDebut;
    const heureFin = champs.heureFin !== undefined ? champs.heureFin : avant.heureFin;
    if (heureDebut && heureFin && heureFin <= heureDebut) {
      throw new ErreurTache("horaires_incoherents");
    }

    /*
     * `EX-TSK-15` — le projet RÉSULTANT, et non celui d'avant. Trois questions
     * s'enchaînent, dans cet ordre : à quel projet la tâche appartiendra-t-elle,
     * ai-je le droit de l'y mettre (`RG-TSK-03`), et que devient son
     * rattachement fin (`RG-JAL-03`, `RG-JAL-04`).
     */
    const projetResultant = champs.projectId !== undefined ? champs.projectId : avant.projectId;
    const projetChange =
      champs.projectId !== undefined && (champs.projectId ?? null) !== avant.projectId;

    /*
     * `RG-SCOPE-02` — changer le projet d'une tâche change QUI LA VOIT. C'est
     * le même geste que d'y créer une tâche : `RG-TSK-03` s'y applique donc à
     * l'identique, sur le projet d'ARRIVÉE. Détacher n'exige rien de plus — on
     * retire une tâche d'un ensemble, on n'en ouvre aucun.
     */
    if (projetChange && projetResultant) {
      await this.exigerAppartenance(projetResultant, acteurId, permissions);
    }

    /*
     * `RG-JAL-04` — **une tâche détachée traîne son jalon.** Détacher sans
     * détacher le jalon et l'épopée produit exactement l'état que la règle
     * interdit ; changer de projet sans les détacher produit celui
     * qu'interdit `RG-JAL-03`. On les efface donc d'office dès que le projet
     * bouge — sauf si la même requête en désigne d'autres, qui seront alors
     * confrontés au projet d'arrivée comme n'importe quels autres.
     */
    if (projetChange) {
      if (champs.milestoneId === undefined) champs.milestoneId = null;
      if (champs.epicId === undefined) champs.epicId = null;
    }

    // `RG-JAL-04` puis `RG-JAL-03`, sur l'état RÉSULTANT : une tâche hors projet
    // ne se rattache à rien, et ce à quoi elle se rattache est de son projet.
    if (champs.milestoneId || champs.epicId) {
      if (!projetResultant) throw new ErreurTache("hors_projet_avec_jalon");
      if (champs.milestoneId) {
        const jalon = await this.prisma.milestone.findUnique({
          where: { id: champs.milestoneId },
          select: { projectId: true },
        });
        if (!jalon || jalon.projectId !== projetResultant) {
          throw new ErreurTache("jalon_autre_projet");
        }
      }
      if (champs.epicId) {
        const epopee = await this.prisma.epic.findUnique({
          where: { id: champs.epicId },
          select: { projectId: true },
        });
        if (!epopee || epopee.projectId !== projetResultant) {
          throw new ErreurTache("jalon_autre_projet");
        }
      }
    }

    const misAJour = await this.prisma.task.update({
      where: { id: taskId, version },
      data: { ...champs, version: { increment: 1 } },
    });

    // `RG-JAL-06` — idem au rattachement après coup.
    await this.reprendreLeCalculDuJalon(champs.milestoneId);

    await this.audit.tracer({
      action: "task.update", typeEntite: "Task", entiteId: taskId, acteurId,
      detail: { champs: Object.keys(champs) },
    });
    return misAJour;
  }

  // ── Sous-tâches — EX-TSK-09 ──────────────────────────────────────────────

  /**
   * L'ordre d'une sous-tâche est **explicite**, pas déduit de la date de
   * création : la vue 17 les réordonne au glisser-déposer, et un ordre implicite
   * ne survivrait pas au premier déplacement.
   */
  async ajouterSousTache(taskId: string, libelle: string, acteurId: string) {
    const dernier = await this.prisma.subtask.aggregate({
      where: { taskId },
      _max: { ordre: true },
    });
    const sousTache = await this.prisma.subtask.create({
      data: { taskId, libelle, ordre: (dernier._max.ordre ?? -1) + 1 },
    });
    await this.audit.tracer({
      action: "task.subtask_create", typeEntite: "Task", entiteId: taskId, acteurId,
    });
    return sousTache;
  }

  async basculerSousTache(id: string, fait: boolean) {
    return this.prisma.subtask.update({ where: { id }, data: { fait } });
  }

  async supprimerSousTache(id: string) {
    await this.prisma.subtask.delete({ where: { id } });
  }

  /**
   * Réordonner les sous-tâches, **en une transaction**.
   *
   * L'unicité `(taskId, ordre)` est posée en base : écrire les nouveaux rangs
   * un par un violerait la contrainte dès le premier échange. Les rangs sont
   * donc décalés hors plage, puis réécrits.
   *
   * `RG-GEN-07` — **l'ordre voyage entier, donc il s'écrase entier.** Deux
   * personnes qui réordonnent la même liste depuis deux fenêtres poseraient
   * sinon un ordre que ni l'une ni l'autre n'a voulu. La version lue est donc
   * exigée, et confrontée en base.
   */
  async reordonnerSousTaches(taskId: string, idsOrdonnes: string[], version: number) {
    const tache = await this.prisma.task.findUnique({
      where: { id: taskId },
      select: { version: true },
    });
    if (!tache) throw new ErreurTache("introuvable");
    if (tache.version !== version) {
      throw new ErreurTache("conflit_de_version", { attendue: tache.version, recue: version });
    }

    try {
      await this.prisma.$transaction([
        ...idsOrdonnes.map((id, i) =>
          this.prisma.subtask.update({ where: { id, taskId }, data: { ordre: -1 - i } }),
        ),
        ...idsOrdonnes.map((id, i) =>
          this.prisma.subtask.update({ where: { id, taskId }, data: { ordre: i } }),
        ),
        this.prisma.task.update({
          where: { id: taskId, version },
          data: { version: { increment: 1 } },
        }),
      ]);
    } catch (e) {
      if ((e as { code?: string }).code === "P2025") {
        throw new ErreurTache("conflit_de_version", { attendue: tache.version, recue: version });
      }
      throw e;
    }
    return this.prisma.subtask.findMany({ where: { taskId }, orderBy: { ordre: "asc" } });
  }

  /** `EX-TSK-11` — retirer une dépendance. */
  async retirerDependance(taskId: string, prerequisId: string, acteurId: string) {
    await this.prisma.taskDependency.delete({
      where: { taskId_prerequisId: { taskId, prerequisId } },
    });
    await this.audit.tracer({
      action: "task.dependency_remove", typeEntite: "Task", entiteId: taskId, acteurId,
      detail: { prerequisId },
    });
  }

  /** `EX-TSK-14` — retirer un rôle RACI. */
  async retirerRaci(taskId: string, userId: string, role: RoleRaci, acteurId: string) {
    await this.prisma.taskRaci.delete({
      where: { taskId_userId_role: { taskId, userId, role } },
    });
    await this.audit.tracer({
      action: "task.raci_remove", typeEntite: "Task", entiteId: taskId, acteurId,
      detail: { userId, role },
    });
  }

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

  /**
   * `RG-TSK-04`, vu depuis l'autre bout — **tout ce qui dépend de `taskId`**,
   * directement ou non.
   *
   * C'est exactement l'ensemble des tâches qu'on ne peut PAS poser en prérequis
   * de `taskId` : si `X` dépend déjà de `taskId`, ajouter « `taskId` dépend de
   * `X` » referme le cycle.
   *
   * ──────────────────────────────────────────────────────────────────────────
   * **Pourquoi ce sens de parcours, et pas `fermeraitUnCycle` par candidat.**
   *
   * `fermeraitUnCycle` remonte le graphe DEPUIS un prérequis donné : il répond
   * pour un candidat, et il faut le rejouer pour le suivant. Filtrer N
   * candidats ainsi coûterait N parcours, chacun de plusieurs requêtes — sur un
   * projet un peu fourni, des centaines d'allers-retours pour ouvrir une
   * fenêtre, et une lenteur qui grandit avec le projet sans qu'aucune boucle ne
   * la voie.
   *
   * Le graphe est cantonné au projet (`RG-TSK-06`) : une seule fermeture
   * transitive DESCENDANTE depuis la tâche courante donne l'ensemble interdit
   * en entier. Le nombre de requêtes suit alors la **profondeur** du graphe,
   * pas le nombre de candidats — la même mécanique que `apercuCascade`, qui
   * descend déjà par `prerequisId: { in: front }`.
   * ──────────────────────────────────────────────────────────────────────────
   */
  private async dependantesTransitives(taskId: string): Promise<Set<string>> {
    const vus = new Set<string>();
    let front = [taskId];

    while (front.length > 0) {
      const liens = await this.prisma.taskDependency.findMany({
        where: { prerequisId: { in: front } },
        select: { taskId: true },
      });
      const suivants = liens.map((l) => l.taskId).filter((id) => id !== taskId && !vus.has(id));
      suivants.forEach((id) => vus.add(id));
      front = suivants;
    }
    return vus;
  }

  /**
   * `EX-TSK-10` — **les tâches qu'on peut poser en prérequis de celle-ci.**
   *
   * Sans elle, la fenêtre « Modifier les dépendances » de la vue 17 n'avait
   * rien à afficher : le serveur savait poser et retirer un lien, jamais dire
   * lesquels étaient posables. Le bouton est resté désactivé plusieurs lots
   * durant, avec un motif exact — et un motif exact ne fait pas une
   * fonctionnalité.
   *
   * Les cinq refus que `ajouterDependance` prononce EN AVAL sont appliqués ici
   * EN AMONT, dans le même ordre : proposer un choix qui sera refusé au clic
   * est une promesse qu'on ne tient pas.
   *
   *   1. soi-même                      — `taskId` est retiré de l'ensemble
   *   2. introuvable                   — la tâche courante doit exister
   *   3. autre projet  (`RG-TSK-06`)   — `projectId` identique, `null` compris
   *   4. déjà liée     (`RG-TSK-05`)   — les prérequis actuels sont retirés
   *   5. cycle         (`RG-TSK-04`)   — la fermeture transitive descendante
   *
   * ──────────────────────────────────────────────────────────────────────────
   * `RG-SCOPE-04` — **ici, une tâche hors périmètre est EXCLUE, pas masquée.**
   *
   * Ce n'est pas la règle de `dependances()`, et il ne faut pas y recopier son
   * `masquer()`. Là-bas l'entrée demeure sans son titre, parce que la retirer
   * fausserait le compte annoncé — « Dépend de (2) » avec une seule ligne. Ici
   * on dresse une liste de choix : proposer une ligne anonyme qu'on ne peut pas
   * nommer ne serait pas un cloisonnement, ce serait une case à cocher sans
   * objet.
   * ──────────────────────────────────────────────────────────────────────────
   */
  async candidatsDependance(
    taskId: string,
    perimetre: Perimetre,
    permissions: ReadonlySet<string>,
  ) {
    const visible = this.perimetres.filtreTache(perimetre, permissions);

    const tache = await this.prisma.task.findUnique({
      where: { id: taskId },
      select: { projectId: true, dateDebut: true },
    });
    if (!tache) throw new ErreurTache("introuvable");

    // Permission PUIS périmètre : la permission est tenue par la garde, le
    // périmètre l'est ici — on ne dresse pas la liste des voisins d'une tâche
    // qu'on n'a pas le droit de lire.
    const lisible = await this.prisma.task.findFirst({
      where: { AND: [{ id: taskId }, visible] },
      select: { id: true },
    });
    if (!lisible) throw new ErreurTache("hors_perimetre");

    const [interdits, dejaLiees] = await Promise.all([
      this.dependantesTransitives(taskId),
      this.prisma.taskDependency.findMany({ where: { taskId }, select: { prerequisId: true } }),
    ]);

    const exclus = [...new Set([taskId, ...interdits, ...dejaLiees.map((d) => d.prerequisId)])];

    const candidats = await this.prisma.task.findMany({
      where: {
        AND: [
          visible,
          // `RG-TSK-06` — le même projet, et `null === null` : deux tâches hors
          // projet se lient entre elles, comme `ajouterDependance` le permet.
          { projectId: tache.projectId },
          { id: { notIn: exclus } },
        ],
      },
      orderBy: [{ dateFin: "asc" }, { titre: "asc" }],
      select: { id: true, titre: true, statut: true, dateFin: true },
    });

    /*
     * `EX-TSK-12` — le conflit de dates est annoncé AVANT que le lien soit
     * posé. La maquette 17 le porte sur la ligne (`.dep-warn`) et le compte en
     * pied de fenêtre : découvrir après coup qu'on vient de créer une
     * incohérence obligerait à défaire.
     */
    return candidats.map((c) => ({
      ...c,
      conflit: tache.dateDebut !== null && c.dateFin !== null && c.dateFin > tache.dateDebut,
    }));
  }

  /**
   * `EX-TSK-10` — **fixer l'ensemble des prérequis d'une tâche, en un geste.**
   *
   * La fenêtre de la vue 17 enregistre une sélection, pas une suite d'ajouts et
   * de retraits : `saveDeps` pose l'ensemble. Même parti pris que
   * `PUT :id/assignes` et `PUT :id/sous-taches/ordre` — une pose par
   * différence, depuis deux écrans ouverts en même temps, laisserait un état
   * que personne n'a voulu.
   *
   * Les cinq refus de `ajouterDependance` s'appliquent à l'ensemble, et **rien
   * n'est écrit tant que l'ensemble entier n'est pas valide** : accepter les
   * lignes saines et refuser les autres laisserait l'utilisateur devant une
   * sélection à moitié enregistrée, sans savoir laquelle.
   *
   * ──────────────────────────────────────────────────────────────────────────
   * **Un lien vers une tâche hors périmètre n'est ni ajouté, ni RETIRÉ.**
   *
   * `candidatsDependance` ne le propose pas et `dependances()` ne le nomme
   * pas : l'utilisateur ne peut donc pas le renvoyer dans sa sélection. Une
   * pose d'ensemble naïve le supprimerait au premier enregistrement — une
   * écriture destructrice sur une donnée que l'auteur du geste n'a jamais vue,
   * et dont rien ne l'avertirait. Les liens invisibles sont donc conservés tels
   * quels : la sélection ne fait autorité que sur ce qu'elle a pu montrer.
   * ──────────────────────────────────────────────────────────────────────────
   *
   * `RG-GEN-07` — la version lue est transmise et recontrôlée. Le contrôle est
   * **doublé dans la clause `where`** de la mise à jour, donc arbitré par la
   * base : deux fenêtres qui enregistrent ensemble ne peuvent pas se recouvrir
   * en silence. `PUT :id/assignes` ne le fait pas encore ; c'est un écart de ce
   * module, pas un modèle à suivre.
   */
  async definirDependances(
    taskId: string,
    prerequisIds: string[],
    version: number,
    acteurId: string,
    perimetre: Perimetre,
    permissions: ReadonlySet<string>,
  ) {
    const visible = this.perimetres.filtreTache(perimetre, permissions);

    const tache = await this.prisma.task.findUnique({
      where: { id: taskId },
      select: { projectId: true, version: true },
    });
    if (!tache) throw new ErreurTache("introuvable");

    const lisible = await this.prisma.task.findFirst({
      where: { AND: [{ id: taskId }, visible] },
      select: { id: true },
    });
    if (!lisible) throw new ErreurTache("hors_perimetre");

    if (tache.version !== version) {
      throw new ErreurTache("conflit_de_version", { attendue: tache.version, recue: version });
    }

    // 1. Soi-même.
    if (prerequisIds.includes(taskId)) throw new ErreurTache("dependance_sur_soi");

    // `RG-TSK-05` — le doublon, dans une pose d'ensemble, est un identifiant
    // répété. L'unicité `(taskId, prerequisId)` le refuserait en base, mais
    // après un premier `create` — donc au milieu de l'écriture.
    if (new Set(prerequisIds).size !== prerequisIds.length) {
      throw new ErreurTache("dependance_en_double");
    }

    // 2. Introuvable, puis hors périmètre : deux lectures, parce que les deux
    // situations ne se disent pas de la même façon à qui les rencontre.
    const demandees = await this.prisma.task.findMany({
      where: { id: { in: prerequisIds } },
      select: { id: true, projectId: true },
    });
    if (demandees.length !== prerequisIds.length) throw new ErreurTache("introuvable");

    const nommables = await this.prisma.task.findMany({
      where: { AND: [{ id: { in: prerequisIds } }, visible] },
      select: { id: true },
    });
    if (nommables.length !== prerequisIds.length) throw new ErreurTache("hors_perimetre");

    // 3. `RG-TSK-06` — le même projet, `null` compris.
    if (demandees.some((d) => d.projectId !== tache.projectId)) {
      throw new ErreurTache("dependance_autre_projet");
    }

    /*
     * 5. `RG-TSK-04` — **un seul parcours pour tout l'ensemble.**
     *
     * Les arêtes posées sortent toutes du MÊME sommet, `taskId`. Un chemin de
     * retour vers `taskId` n'en emprunte donc aucune : il n'existe que dans le
     * graphe déjà en place. Vérifier chaque candidat contre la fermeture
     * transitive descendante préexistante est donc exact pour l'ensemble — et
     * les retraits, qui ne portent eux aussi que sur les arêtes sortantes de
     * `taskId`, ne changent pas cette fermeture.
     */
    const interdits = await this.dependantesTransitives(taskId);
    const cyclique = prerequisIds.find((id) => interdits.has(id));
    if (cyclique) throw new ErreurTache("dependance_circulaire", { prerequisId: cyclique });

    const actuels = (
      await this.prisma.taskDependency.findMany({
        where: { taskId },
        select: { prerequisId: true },
      })
    ).map((d) => d.prerequisId);
    const visiblesActuels = new Set(
      (
        await this.prisma.task.findMany({
          where: { AND: [{ id: { in: actuels } }, visible] },
          select: { id: true },
        })
      ).map((t) => t.id),
    );

    const voulus = new Set(prerequisIds);
    const aRetirer = actuels.filter((id) => visiblesActuels.has(id) && !voulus.has(id));
    const aAjouter = prerequisIds.filter((id) => !actuels.includes(id));

    try {
      await this.prisma.$transaction([
        ...(aRetirer.length > 0
          ? [
              this.prisma.taskDependency.deleteMany({
                where: { taskId, prerequisId: { in: aRetirer } },
              }),
            ]
          : []),
        ...(aAjouter.length > 0
          ? [
              this.prisma.taskDependency.createMany({
                data: aAjouter.map((prerequisId) => ({ taskId, prerequisId })),
              }),
            ]
          : []),
        /*
         * `RG-GEN-07` doublé en base : la version est dans le `where`. Si une
         * autre fenêtre a enregistré entre la lecture et ici, la ligne ne
         * correspond plus, Prisma lève `P2025`, et toute la transaction est
         * défaite — les liens compris.
         */
        this.prisma.task.update({
          where: { id: taskId, version },
          data: { version: { increment: 1 } },
        }),
      ]);
    } catch (e) {
      if ((e as { code?: string }).code === "P2025") {
        throw new ErreurTache("conflit_de_version", { attendue: tache.version, recue: version });
      }
      throw e;
    }

    /*
     * `cadrage/01 § M20` — le journal garde le vocabulaire des gestes unitaires
     * (`task.dependency_add` / `_remove`). Une action « ensemble défini » ne
     * dirait pas ce qui a bougé, et c'est ce qu'on relit dans un journal.
     */
    for (const prerequisId of aRetirer) {
      await this.audit.tracer({
        action: "task.dependency_remove", typeEntite: "Task", entiteId: taskId, acteurId,
        detail: { prerequisId },
      });
    }
    for (const prerequisId of aAjouter) {
      await this.audit.tracer({
        action: "task.dependency_add", typeEntite: "Task", entiteId: taskId, acteurId,
        detail: { prerequisId },
      });
    }

    return { version: version + 1, ajoutees: aAjouter, retirees: aRetirer };
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
  /**
   * `RG-TSK-04` — les deux sens d'une dépendance.
   *
   * **Ce point d'entrée n'avait AUCUN périmètre.** Il vérifiait la permission
   * `tasks:read` et rendait ensuite le titre de n'importe quelle tâche liée,
   * fût-elle confidentielle ou hors du périmètre du lecteur. `RG-SCOPE-04` est
   * précisément la règle « la plus facile à rater » — et elle l'a été ici,
   * dans le seul point d'entrée qui nomme des tâches qu'on n'a pas demandées.
   *
   * Une entrée hors périmètre n'est pas RETIRÉE : elle reste visible sans son
   * titre. La retirer changerait le compte annoncé — « Dépend de (3) » avec
   * deux lignes — et laisserait croire à un défaut d'affichage. La maquette 17
   * traite déjà ce cas : l'entrée demeure, atténuée (`is-gone`).
   */
  async dependances(taskId: string, perimetre: Perimetre, permissions: ReadonlySet<string>) {
    const visible = this.perimetres.filtreTache(perimetre, permissions);

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

    /*
     * Une seconde lecture, bornée au périmètre, dit lesquelles sont
     * nommables. Deux requêtes plutôt qu'une jointure filtrée : le filtre doit
     * porter sur la TÂCHE liée, pas sur la dépendance, et il faut connaître
     * les deux ensembles pour distinguer « absente » de « invisible ».
     */
    const ids = [...depend.map((d) => d.prerequisId), ...bloque.map((d) => d.taskId)];
    const nommables = new Set(
      (
        await this.prisma.task.findMany({
          where: { AND: [{ id: { in: ids } }, visible] },
          select: { id: true },
        })
      ).map((t) => t.id),
    );

    /*
     * La forme reste la MÊME, nommable ou non : seuls les champs identifiants
     * passent à `null`. Une forme qui change selon le droit obligerait chaque
     * appelant à connaître la règle de cloisonnement — et le premier qui
     * l'oublierait afficherait « undefined » au lieu de rien.
     */
    const masquer = <T extends { id: string; titre: string; statut: string }>(t: T) =>
      nommables.has(t.id)
        ? { ...t, lisible: true as const }
        : { id: t.id, titre: null, statut: null, lisible: false as const };

    return {
      dependDe: depend.map((d) => masquer(d.prerequis)),
      bloque: bloque.map((d) => masquer(d.task)),
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
   *
   * `RG-TSK-14` — « sans permission élargie, un utilisateur ne peut supprimer
   * que les tâches qui lui sont assignées. » La signature ne le permettait pas :
   * elle ne recevait ni permissions ni périmètre, donc elle ne décidait rien, et
   * tout détenteur de `tasks:delete` supprimait n'importe quelle tâche de
   * l'instance — hors de son périmètre comprise.
   *
   * L'ordre est celui de la maison : **permission d'abord** (la garde de route
   * a exigé `tasks:delete`), **périmètre ensuite** (la tâche est-elle seulement
   * lisible ?), et la règle propre à la suppression en dernier. Le refus de
   * périmètre ne renseigne pas sur l'existence de la ligne.
   */
  async supprimer(
    taskId: string,
    acteurId: string,
    perimetre: Perimetre,
    permissions: ReadonlySet<string>,
  ) {
    const lisible = await this.prisma.task.findFirst({
      where: { AND: [{ id: taskId }, this.perimetres.filtreTache(perimetre, permissions)] },
      select: { id: true },
    });
    if (!lisible) throw new ErreurTache("hors_perimetre");

    /*
     * La permission élargie est `tasks:manage_any` : c'est celle que
     * `PERMISSIONS_GESTION_GLOBALE` nomme pour ce domaine, et la seule du
     * catalogue qui dise « toutes les tâches ». `tasks:delete` ne dit que « le
     * geste de supprimer » — c'est justement la distinction que la règle pose.
     */
    if (!permissions.has("tasks:manage_any")) {
      const sienne = await this.prisma.taskAssignee.findUnique({
        where: { taskId_userId: { taskId, userId: acteurId } },
        select: { taskId: true },
      });
      if (!sienne) throw new ErreurTache("suppression_reservee_aux_assignes");
    }

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
  /**
   * `EX-TSK-06` — **fixer la liste des assignés d'une tâche.**
   *
   * Elle n'existait pas. On pouvait assigner à la création, et déplacer une
   * assignation par glisser-déposer depuis le planning — mais pas ajouter ni
   * retirer quelqu'un depuis la fiche, que la maquette 17 dessine pourtant
   * avec sa liste et son bouton d'ajout. Trouvé par le portage de la vue, pas
   * par un test.
   *
   * Le **porteur** est le premier de la liste : la maquette le distingue, et
   * `RG-TSK-11` s'appuie sur la notion — une tâche multi-assignée ne change
   * que d'assigné, jamais de date.
   *
   * La liste est posée **en entier**, jamais par différence : un ajout et un
   * retrait simultanés depuis deux écrans laisseraient sinon un état que
   * personne n'a voulu.
   */
  async definirAssignes(
    taskId: string,
    userIds: string[],
    version: number,
    acteurId: string,
  ): Promise<{ assignes: string[]; version: number }> {
    const tache = await this.prisma.task.findUnique({
      where: { id: taskId },
      select: { id: true, titre: true, version: true },
    });
    if (!tache) throw new ErreurTache("introuvable");

    /*
     * `RG-GEN-07` — **la liste voyage entière, donc elle s'écrase entière.**
     * C'est précisément le geste que « dernier arrivé gagne » rend dangereux :
     * deux personnes qui composent la même liste depuis deux fenêtres
     * s'effacent mutuellement, sans qu'aucune ne le sache, et le résultat n'est
     * l'intention de personne. La version lue est donc exigée, comme partout
     * ailleurs dans le module — elle manquait ici et sur l'ordre des
     * sous-tâches, les deux seules poses d'ensemble qui ne l'avaient pas.
     */
    if (tache.version !== version) {
      throw new ErreurTache("conflit_de_version", { attendue: tache.version, recue: version });
    }

    const uniques = [...new Set(userIds)];
    const connus = await this.prisma.user.count({ where: { id: { in: uniques } } });
    if (connus !== uniques.length) throw new ErreurTache("introuvable");

    const avant = await this.prisma.taskAssignee.findMany({
      where: { taskId },
      select: { userId: true },
    });

    try {
      await this.prisma.$transaction([
        this.prisma.taskAssignee.deleteMany({ where: { taskId } }),
        ...uniques.map((userId, i) =>
          this.prisma.taskAssignee.create({ data: { taskId, userId, porteur: i === 0 } }),
        ),
        /*
         * `RG-GEN-07` doublé en base, comme sur les dépendances : la version
         * est dans le `where`. Une écriture concurrente glissée entre la
         * lecture et ici ne correspond plus, `P2025` remonte, et toute la
         * transaction est défaite — les assignations comprises.
         */
        this.prisma.task.update({
          where: { id: taskId, version },
          data: { version: { increment: 1 } },
        }),
      ]);
    } catch (e) {
      if ((e as { code?: string }).code === "P2025") {
        throw new ErreurTache("conflit_de_version", { attendue: tache.version, recue: version });
      }
      throw e;
    }

    await this.audit.tracer({
      action: "task.assignees_set",
      typeEntite: "Task",
      entiteId: taskId,
      acteurId,
      detail: { avant: avant.map((a) => a.userId), apres: uniques },
    });

    /*
     * `cadrage/01 § M18` — on ne prévient que les ARRIVANTS, et jamais
     * soi-même. Renotifier ceux qui étaient déjà là ferait du bruit à chaque
     * réordonnancement, et le bruit finit par masquer le signal.
     */
    const anciens = new Set(avant.map((a) => a.userId));
    for (const userId of uniques) {
      if (anciens.has(userId) || userId === acteurId) continue;
      await this.notifications.notifier({
        userId,
        type: "tache_assignee",
        titre: `Nouvelle tâche assignée — ${tache.titre}`,
        contenu: `La tâche « ${tache.titre} » vous a été assignée.`,
        lien: `/taches/${taskId}`,
      });
    }

    return { assignes: uniques, version: version + 1 };
  }

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
