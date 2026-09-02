import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma.service.js";
import { PlanningService } from "../planning/planning.service.js";
import { TempsService } from "../temps/temps.service.js";
import type { Perimetre } from "../commun/perimetre.service.js";
import { echeanceAujourdhui, echeanceDepassee } from "../commun/dates.js";

/**
 * M16 — le tableau de bord. Vue 06.
 *
 * **La vue la plus consultée du produit**, et la seule que certains ouvrent.
 * Le brief l'exige « complète en un écran, sans défilement » pour un
 * contributeur, et « digne quand tous les compteurs sont à zéro » pour une
 * direction : ce sont deux contraintes opposées que le serveur doit servir avec
 * la même charge utile.
 *
 * Tout ce que ce service rend est **la donnée de la personne connectée**. Il
 * n'y a pas de périmètre à appliquer sur ses propres tâches — mais il y en a un
 * sur l'extrait de planning, qui montre autre chose que soi.
 */

export type EchecTableau = "limite_todos" | "introuvable";

export class ErreurTableau extends Error {
  constructor(
    readonly code: EchecTableau,
    readonly detail?: Record<string, unknown>,
  ) {
    super(code);
  }
}

/** `RG-DSH-01` — le plafond est paramétré, pas gravé. */
const CLE_LIMITE = "dashboard.todoLimit";
const LIMITE_PAR_DEFAUT = 20;

const jour = (d: Date): string => d.toISOString().slice(0, 10);

@Injectable()
export class TableauService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly planning: PlanningService,
    private readonly temps: TempsService,
  ) {}

  /**
   * `EX-DSH-01` à `EX-DSH-07` — tout le tableau de bord, en un appel.
   *
   * Même raison qu'au planning : sept blocs chargés séparément se remplissent
   * dans un ordre imprévisible, et la page la plus consultée du produit
   * clignoterait à chaque ouverture.
   */
  async accueil(
    userId: string,
    perimetre: Perimetre,
    permissions: ReadonlySet<string>,
    aujourdhui: Date,
  ) {
    const debutSemaine = new Date(aujourdhui);
    // Lundi de la semaine courante. `getUTCDay()` rend 0 le dimanche : le
    // décalage `(j + 6) % 7` le rattache à la semaine qui précède.
    debutSemaine.setUTCDate(
      debutSemaine.getUTCDate() - ((debutSemaine.getUTCDay() + 6) % 7),
    );
    const finSemaine = new Date(debutSemaine);
    finSemaine.setUTCDate(finSemaine.getUTCDate() + 6);

    const [indicateurs, aVenir, nonDeclarees, todos, projets, extrait] = await Promise.all([
      this.indicateurs(userId, aujourdhui),
      this.tachesAVenir(userId, aujourdhui),
      this.tachesNonDeclarees(userId),
      this.todos(userId),
      this.projets(userId),
      // `EX-DSH-03` — l'extrait de planning est celui de la personne : le
      // filtre par ressource le réduit à sa seule ligne, sans réécrire
      // l'agrégat du planning ni ses règles de périmètre.
      this.planning.agreger(
        debutSemaine,
        finSemaine,
        { ressourceId: userId },
        perimetre,
        permissions,
      ),
    ]);

    return { indicateurs, taches: { aVenir, nonDeclarees }, todos, projets, planning: extrait };
  }

  /**
   * `EX-DSH-02` — quatre indicateurs, et **chacun porte son dénominateur**.
   *
   * « 3 projets actifs » ne dit rien ; « 3 sur 7 » situe. Le brief impose les
   * sous-titres : « sur {n} projets », « sur {n} tâches », « {n} % complétées »,
   * « Échéance dépassée ».
   */
  private async indicateurs(userId: string, aujourdhui: Date) {
    const [projetsTotal, projetsActifs, taches] = await Promise.all([
      this.prisma.project.count({
        where: { OR: [{ chefId: userId }, { membres: { some: { userId } } }] },
      }),
      this.prisma.project.count({
        where: {
          archive: false,
          statut: "active",
          OR: [{ chefId: userId }, { membres: { some: { userId } } }],
        },
      }),
      this.prisma.task.findMany({
        where: { assignes: { some: { userId } } },
        select: { statut: true, dateFin: true },
      }),
    ]);

    const total = taches.length;
    const terminees = taches.filter((t) => t.statut === "done").length;
    const enCours = taches.filter((t) => t.statut === "doing" || t.statut === "review").length;

    // `RG-DSH-04` — en retard : échéance DÉPASSÉE ET pas terminée. Une tâche
    // finie hier n'est pas en retard, elle est finie ; une tâche due
    // aujourd'hui ne l'est pas non plus, elle est due — `echeanceDepassee`
    // compare le jour, quand `dateFin < aujourdhui` comparait l'instant et
    // mettait en retard, dès minuit, tout ce qui restait à faire du jour.
    const enRetard = taches.filter(
      (t) => t.statut !== "done" && echeanceDepassee(t.dateFin, aujourdhui),
    ).length;

    return {
      projets: { actifs: projetsActifs, total: projetsTotal },
      tachesEnCours: { valeur: enCours, total },
      tachesTerminees: {
        valeur: terminees,
        // Un pourcentage sur zéro tâche vaut zéro, pas NaN : la vue doit
        // rester digne quand tous les compteurs sont à zéro.
        pourcentage: total === 0 ? 0 : Math.round((terminees / total) * 100),
      },
      tachesEnRetard: enRetard,
    };
  }

  /** `EX-DSH-05` — ses tâches à venir, avec de quoi agir sans changer de page. */
  private async tachesAVenir(userId: string, aujourdhui: Date) {
    const taches = await this.prisma.task.findMany({
      where: { assignes: { some: { userId } }, statut: { not: "done" } },
      select: {
        id: true, titre: true, statut: true, priorite: true,
        dateDebut: true, dateFin: true, estimationHeures: true, version: true,
        project: { select: { id: true, nom: true, icone: true } },
        // La saisie rapide doit dire si du temps a DÉJÀ été déclaré, tous
        // contributeurs confondus : saisir deux fois trois heures parce que
        // le collègue l'avait fait est l'erreur que cette information évite.
        saisiesTemps: { select: { heures: true } },
      },
      orderBy: [{ dateFin: "asc" }, { creeLe: "asc" }],
      take: 12,
    });

    return taches.map((t) => ({
      id: t.id,
      titre: t.titre,
      statut: t.statut,
      priorite: t.priorite,
      dateDebut: t.dateDebut ? jour(t.dateDebut) : null,
      dateFin: t.dateFin ? jour(t.dateFin) : null,
      estimationHeures: t.estimationHeures ? Number(t.estimationHeures) : null,
      version: t.version,
      project: t.project,
      enRetard: echeanceDepassee(t.dateFin, aujourdhui),
      // Due aujourd'hui : ni en retard, ni silencieuse. C'est le seul jour où
      // la personne peut encore la tenir, et l'écran doit le dire — mais
      // autrement que par le rouge du retard.
      pourAujourdhui: echeanceAujourdhui(t.dateFin, aujourdhui),
      heuresDeclarees: t.saisiesTemps.reduce((n, s) => n + Number(s.heures), 0),
    }));
  }

  /**
   * `EX-DSH-06` — terminées sans temps déclaré.
   *
   * La règle vit dans M12 et **y reste** : `tachesNonDeclarees` exclut déjà les
   * tâches validées sans déclaration (`EX-TMP-06`). La réécrire ici en
   * oublierait la moitié, et les deux listes divergeraient au premier
   * correctif.
   */
  private async tachesNonDeclarees(userId: string) {
    const taches = await this.temps.tachesNonDeclarees(userId);
    return taches.map((t) => ({
      id: t.id,
      titre: t.titre,
      dateFin: t.dateFin ? jour(t.dateFin) : null,
      projet: t.project?.nom ?? null,
    }));
  }

  /**
   * `EX-DSH-07` — ses projets, tels qu'il les retrouve d'un clic.
   *
   * Chaque ligne porte sa **progression** : la maquette 06 dessine une jauge
   * sous le nom du projet, et sans elle la liste ne dit que « ces projets
   * existent ». `RG-PRJ-07` la définit une fois pour toutes — moyenne des
   * avancements de tâches, jamais ratio de tâches terminées : une tâche à
   * 90 % compte pour ce qu'elle vaut.
   *
   * Un seul `groupBy` pour les huit projets : une agrégation par ligne
   * rejouerait la même requête huit fois sur la page la plus consultée du
   * produit.
   */
  private async projets(userId: string) {
    const projets = await this.prisma.project.findMany({
      where: {
        archive: false,
        OR: [{ chefId: userId }, { membres: { some: { userId } } }],
      },
      select: {
        id: true, nom: true, statut: true, icone: true, dateFin: true,
        _count: { select: { taches: true } },
      },
      orderBy: { dateFin: "asc" },
      take: 8,
    });

    const avancements = await this.prisma.task.groupBy({
      by: ["projectId"],
      where: { projectId: { in: projets.map((p) => p.id) } },
      _avg: { avancement: true },
    });
    const parProjet = new Map(
      avancements.map((a) => [a.projectId, Math.round(a._avg.avancement ?? 0)]),
    );

    // Un projet sans tâche est à 0, pas à 100 : c'est ce que donnerait une
    // moyenne vide mal gardée, et la jauge annoncerait un projet fini.
    return projets.map((p) => ({ ...p, progression: parProjet.get(p.id) ?? 0 }));
  }

  // ── To-do — `EX-DSH-04`, `RG-DSH-01` à `RG-DSH-03` ────────────────────────

  /**
   * `RG-DSH-03` — les complétées sont **regroupées à part**, avec leur compte.
   *
   * Mêlées aux autres, elles allongent la liste sans rien y ajouter ; supprimées
   * d'office, elles feraient perdre la trace de ce qu'on vient de faire.
   */
  async todos(userId: string) {
    const [lignes, limite] = await Promise.all([
      this.prisma.todo.findMany({
        where: { userId },
        orderBy: [{ ordre: "asc" }, { creeLe: "asc" }],
      }),
      this.limiteTodos(),
    ]);

    const actives = lignes.filter((t) => !t.fait);
    const faites = lignes.filter((t) => t.fait);

    return {
      actives,
      faites,
      limite,
      // `RG-DSH-01` — l'atteinte de la limite est **signalée**, pas subie au
      // moment où le champ refuse la saisie sans dire pourquoi.
      limiteAtteinte: lignes.length >= limite,
    };
  }

  private async limiteTodos(): Promise<number> {
    const reglage = await this.prisma.setting.findUnique({ where: { cle: CLE_LIMITE } });
    const lue = Number(reglage?.valeur);
    return Number.isFinite(lue) && lue > 0 ? lue : LIMITE_PAR_DEFAUT;
  }

  /** `RG-DSH-01` — le plafond est vérifié **au serveur**, pas à la saisie. */
  async ajouterTodo(userId: string, libelle: string) {
    const [compte, limite] = await Promise.all([
      this.prisma.todo.count({ where: { userId } }),
      this.limiteTodos(),
    ]);
    if (compte >= limite) throw new ErreurTableau("limite_todos", { limite });

    const dernier = await this.prisma.todo.findFirst({
      where: { userId },
      orderBy: { ordre: "desc" },
      select: { ordre: true },
    });

    return this.prisma.todo.create({
      data: { userId, libelle, ordre: (dernier?.ordre ?? 0) + 1 },
    });
  }

  /**
   * `RG-DSH-02` — une to-do se modifie par double-clic, donc en place.
   *
   * L'identifiant **et** le propriétaire sont dans la clause : une to-do est
   * strictement privée, et une mise à jour qui ne filtrerait que sur `id`
   * laisserait modifier celle d'autrui à qui devine un identifiant.
   */
  async modifierTodo(userId: string, id: string, donnees: { libelle?: string; fait?: boolean }) {
    const resultat = await this.prisma.todo.updateMany({
      where: { id, userId },
      data: donnees,
    });
    if (resultat.count === 0) throw new ErreurTableau("introuvable");
    return this.prisma.todo.findUniqueOrThrow({ where: { id } });
  }

  async supprimerTodo(userId: string, id: string) {
    const resultat = await this.prisma.todo.deleteMany({ where: { id, userId } });
    if (resultat.count === 0) throw new ErreurTableau("introuvable");
    return { supprime: true };
  }
}
