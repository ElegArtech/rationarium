import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma.service.js";
import { AuditService } from "../commun/audit.service.js";
import { PerimetreService, type Perimetre } from "../commun/perimetre.service.js";
import type { TypeActivite } from "@trame/contracts";

/**
 * Temps passé — M12, vue 21.
 *
 * L'objet du module est d'**objectiver la charge** : rapprocher le déclaré des
 * estimations. Deux règles en découlent, et toutes deux protègent la qualité
 * de la donnée plutôt que le confort de saisie.
 *
 * `RG-TMP-03` — l'acteur d'une saisie n'est pas modifiable après création : il
 * faut supprimer et recréer. Corriger l'acteur en place réécrirait l'histoire
 * de deux personnes à la fois.
 *
 * `RG-TMP-06` — une tâche terminée peut être close **sans déclaration**, et
 * cette validation est enregistrée pour distinguer « oublié » de « rien à
 * déclarer ». Sans cette trace, les deux cas seraient indiscernables.
 */

export type EchecTemps =
  | "rattachement_requis"
  | "acteur_ambigu"
  | "plafond_journalier"
  | "acteur_non_modifiable"
  | "hors_perimetre"
  | "introuvable";

export class ErreurTemps extends Error {
  constructor(
    readonly code: EchecTemps,
    readonly detail?: Record<string, unknown>,
  ) {
    super(code);
  }
}

@Injectable()
export class TempsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly perimetres: PerimetreService,
  ) {}

  /** Plafond d'heures journalier — parti pris n° 3 : c'est un paramètre. */
  private async plafondJournalier(): Promise<number> {
    const reglage = await this.prisma.setting.findUnique({
      where: { cle: "time_tracking.plafondJournalier" },
    });
    return Number(reglage?.valeur ?? 12);
  }

  /**
   * `EX-TMP-03` — saisir du temps.
   *
   * `RG-TMP-01` — une saisie référence au minimum une tâche ou un projet.
   * `RG-TMP-02` — le total d'une même journée ne peut dépasser un plafond ; le
   * dépassement est refusé **avec le total constaté et le plafond**. Refuser
   * sans dire combien on a déjà déclaré oblige l'agent à recompter.
   */
  async saisir(
    donnees: {
      userId?: string | null; thirdPartyId?: string | null;
      date: Date; heures: number; typeActivite?: TypeActivite;
      projectId?: string | null; taskId?: string | null; description?: string;
    },
    acteurId: string,
  ) {
    if (!donnees.projectId && !donnees.taskId) throw new ErreurTemps("rattachement_requis");

    const aUnAgent = Boolean(donnees.userId);
    const aUnTiers = Boolean(donnees.thirdPartyId);
    if (aUnAgent === aUnTiers) throw new ErreurTemps("acteur_ambigu");

    if (donnees.userId) {
      const plafond = await this.plafondJournalier();
      const deja = await this.prisma.timeEntry.aggregate({
        where: { userId: donnees.userId, date: donnees.date },
        _sum: { heures: true },
      });
      const total = Number(deja._sum.heures ?? 0) + donnees.heures;
      if (total > plafond) {
        throw new ErreurTemps("plafond_journalier", {
          dejaDeclare: Number(deja._sum.heures ?? 0),
          demande: donnees.heures,
          total,
          plafond,
        });
      }
    }

    const saisie = await this.prisma.timeEntry.create({
      data: {
        userId: donnees.userId ?? null,
        thirdPartyId: donnees.thirdPartyId ?? null,
        date: donnees.date,
        heures: donnees.heures,
        typeActivite: donnees.typeActivite ?? "development",
        projectId: donnees.projectId ?? null,
        taskId: donnees.taskId ?? null,
        description: donnees.description ?? null,
      },
    });

    await this.audit.tracer({
      action: "time_entry.create", typeEntite: "TimeEntry", entiteId: saisie.id, acteurId,
      detail: {
        pour: donnees.userId ?? donnees.thirdPartyId,
        pourAutrui: donnees.userId !== undefined && donnees.userId !== acteurId,
        heures: donnees.heures,
      },
    });
    return saisie;
  }

  /**
   * `RG-TMP-03` — l'acteur n'est pas modifiable. La méthode existe pour porter
   * le refus explicitement : sans elle, un appelant pourrait croire qu'une
   * mise à jour partielle est possible et découvrir l'inverse en production.
   */
  async modifierActeur(): Promise<never> {
    throw new ErreurTemps("acteur_non_modifiable");
  }

  async supprimer(id: string, acteurId: string) {
    await this.audit.tracer({
      action: "time_entry.delete", typeEntite: "TimeEntry", entiteId: id, acteurId,
    });
    await this.prisma.timeEntry.delete({ where: { id } });
  }

  /**
   * `EX-TMP-01`, `EX-TMP-02` — consulter ses saisies avec cumul.
   *
   * `RG-TMP-05` — filtrer sur un autre utilisateur exige une permission
   * dédiée. Le contrôle est ici, pas seulement dans l'interface.
   */
  async lister(
    perimetre: Perimetre,
    permissions: ReadonlySet<string>,
    filtres: { userId?: string; projectId?: string; debut?: Date; fin?: Date } = {},
  ) {
    const surAutrui = filtres.userId !== undefined && filtres.userId !== perimetre.userId;
    if (surAutrui && !permissions.has("time_tracking:readAll") && !permissions.has("time_tracking:read_team")) {
      throw new ErreurTemps("hors_perimetre");
    }

    const clauses: Record<string, unknown>[] = [];
    clauses.push(
      surAutrui || permissions.has("time_tracking:readAll")
        ? this.perimetres.filtreParAgent(perimetre)
        : { userId: perimetre.userId },
    );
    if (filtres.userId) clauses.push({ userId: filtres.userId });
    if (filtres.projectId) clauses.push({ projectId: filtres.projectId });
    if (filtres.debut) clauses.push({ date: { gte: filtres.debut } });
    if (filtres.fin) clauses.push({ date: { lte: filtres.fin } });

    const [saisies, plafondJournalier] = await Promise.all([
      this.prisma.timeEntry.findMany({
        where: { AND: clauses },
        orderBy: { date: "desc" },
        include: {
          project: { select: { id: true, nom: true } },
          task: { select: { id: true, titre: true } },
          user: { select: { id: true, prenom: true, nom: true } },
          thirdParty: { select: { id: true, organisation: true, contactNom: true } },
        },
      }),
      this.plafondJournalier(),
    ]);

    return {
      saisies,
      cumul: {
        entrees: saisies.length,
        heures: saisies.reduce((n, s) => n + Number(s.heures), 0),
        /*
         * **Le plafond voyage avec le cumul.**
         *
         * `cadrage/01 § parti-pris 3` — une limite fonctionnelle est un
         * paramètre d'administration, jamais une valeur figée. Or il n'est pas
         * exposé par `GET /parametrage`, qui ne rend que les réglages publics
         * (« la table porte aussi des limites internes… qu'un écran de
         * préférences n'a pas à exposer ») : la vue 21 en gardait donc une
         * COPIE en dur, qui ne bougeait pas quand l'exploitant changeait le
         * réglage. Le serveur refusait au-delà de 8 pendant que la vue traçait
         * une jauge sur 12, sans jamais annoncer de dépassement.
         *
         * Le rendre ici n'expose rien de plus que ce que le refus de saisie
         * annonce déjà (`RG-TMP-02` : « refusé avec le total constaté et le
         * plafond »), et supprime la seule valeur métier écrite en dur côté
         * client.
         */
        plafondJournalier,
      },
    };
  }

  /**
   * `EX-TMP-07` — rapport par agent, par projet, ou personnel.
   *
   * L'agrégation est faite en base et non en mémoire : sur cinq ans
   * d'historique, ramener toutes les lignes pour les additionner côté serveur
   * serait un budget de performance dépensé pour rien.
   */
  async rapport(
    perimetre: Perimetre,
    axe: "agent" | "projet" | "type",
    fenetre: { debut: Date; fin: Date },
  ) {
    const base = {
      AND: [
        this.perimetres.filtreParAgent(perimetre),
        { date: { gte: fenetre.debut, lte: fenetre.fin } },
      ],
    };

    if (axe === "agent") {
      const lignes = await this.prisma.timeEntry.groupBy({
        by: ["userId"],
        where: base,
        _sum: { heures: true },
        _count: true,
      });
      const agents = await this.prisma.user.findMany({
        where: { id: { in: lignes.map((l) => l.userId).filter((x): x is string => !!x) } },
        select: { id: true, prenom: true, nom: true },
      });
      const parId = new Map(agents.map((a) => [a.id, a]));
      return lignes.map((l) => ({
        cle: l.userId,
        libelle: l.userId ? `${parId.get(l.userId)?.prenom ?? ""} ${parId.get(l.userId)?.nom ?? ""}`.trim() : "Tiers",
        heures: Number(l._sum.heures ?? 0),
        entrees: l._count,
      }));
    }

    if (axe === "projet") {
      const lignes = await this.prisma.timeEntry.groupBy({
        by: ["projectId"],
        where: base,
        _sum: { heures: true },
        _count: true,
      });
      const projets = await this.prisma.project.findMany({
        where: { id: { in: lignes.map((l) => l.projectId).filter((x): x is string => !!x) } },
        select: { id: true, nom: true },
      });
      const parId = new Map(projets.map((p) => [p.id, p.nom]));
      return lignes.map((l) => ({
        cle: l.projectId,
        // Parti pris n° 2 : le hors-projet est nommé, jamais laissé vide.
        libelle: l.projectId ? (parId.get(l.projectId) ?? "") : "Hors projet",
        heures: Number(l._sum.heures ?? 0),
        entrees: l._count,
      }));
    }

    const lignes = await this.prisma.timeEntry.groupBy({
      by: ["typeActivite"],
      where: base,
      _sum: { heures: true },
      _count: true,
    });
    return lignes.map((l) => ({
      cle: l.typeActivite,
      libelle: l.typeActivite,
      heures: Number(l._sum.heures ?? 0),
      entrees: l._count,
    }));
  }

  /**
   * `EX-TMP-06`, `RG-TMP-06` — clore une tâche terminée **sans déclaration**.
   *
   * La validation est enregistrée : c'est ce qui distingue « oublié » de
   * « rien à déclarer ». Sans cette trace, la liste des tâches non déclarées
   * ressortirait indéfiniment et finirait ignorée.
   */
  async validerSansDeclaration(taskId: string, userId: string, acteurId: string) {
    await this.prisma.taskTimeWaiver.upsert({
      where: { taskId_userId: { taskId, userId } },
      create: { taskId, userId },
      update: {},
    });
    await this.audit.tracer({
      action: "time_entry.waived", typeEntite: "Task", entiteId: taskId, acteurId,
      detail: { userId },
    });
  }

  /** `EX-TMP-06` — les tâches terminées sans temps déclaré ni validation. */
  async tachesNonDeclarees(userId: string) {
    const validees = await this.prisma.taskTimeWaiver.findMany({
      where: { userId },
      select: { taskId: true },
    });
    return this.prisma.task.findMany({
      where: {
        statut: "done",
        assignes: { some: { userId } },
        saisiesTemps: { none: {} },
        id: { notIn: validees.map((v) => v.taskId) },
      },
      orderBy: { dateFin: "desc" },
      select: { id: true, titre: true, dateFin: true, project: { select: { nom: true } } },
    });
  }

  /**
   * `RG-TMP-07` — la saisie rapide indique si du temps a déjà été déclaré sur
   * la tâche, **tous contributeurs confondus**.
   *
   * Le « tous confondus » est le point : savoir que quelqu'un d'autre a déjà
   * déclaré évite les doubles saisies sur une tâche partagée.
   */
  async contexteSaisieRapide(taskId: string) {
    const agregat = await this.prisma.timeEntry.aggregate({
      where: { taskId },
      _sum: { heures: true },
      _count: true,
    });
    const contributeurs = await this.prisma.timeEntry.groupBy({
      by: ["userId"],
      where: { taskId },
    });
    return {
      heuresDeclarees: Number(agregat._sum.heures ?? 0),
      entrees: agregat._count,
      contributeurs: contributeurs.length,
    };
  }
}
