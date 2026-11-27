import { Injectable } from "@nestjs/common";
import {
  ETATS_PASSAGE_ACTIFS,
  JOURS_REFUS_ACTION_DEFAITE,
  MINUTES_SANS_SIGNE_DE_VIE,
  SECONDES_ATTENTE_PASSAGE,
  type BilanPassage,
  type EtatPassage,
} from "@rationarium/contracts";
import type { Prisma } from "@rationarium/db";
import { PrismaService } from "../prisma.service.js";
import { AuditService } from "../commun/audit.service.js";
import { PerimetreService } from "../commun/perimetre.service.js";
import { NotificationsService } from "../notifications/notifications.service.js";
import { refusAssistant } from "./erreurs.js";

const JOUR_MS = 86_400_000;
/** Une tâche close depuis moins de trente jours reste au contexte : l'agent sait qu'elle est faite. */
const JOURS_TACHES_CLOSES = 30;

const ACTIFS: EtatPassage[] = [...ETATS_PASSAGE_ACTIFS];

const jour = (d: Date | null | undefined): string | null => (d ? d.toISOString().slice(0, 10) : null);

/** Une violation de l'index unique partiel : un passage actif existe déjà (`RG-AST-15`). */
const estDoublonActif = (e: unknown): boolean =>
  typeof e === "object" && e !== null && (e as { code?: unknown }).code === "P2002";

/**
 * Les passages de l'agent (`docs/assistant/SPEC-PHASE-1.md § 10 et 12`).
 *
 * Un passage naît en attente, à l'heure planifiée ou à la main. L'agent du
 * poste le prend, donne signe de vie, puis le termine avec son bilan. Le serveur
 * ne fait jamais le travail lui-même : il range, il sert le contexte, il notifie.
 */
@Injectable()
export class PassagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly perimetres: PerimetreService,
    private readonly notifications: NotificationsService,
  ) {}

  /** `EX-AST-04` — créer un passage. `RG-AST-15` : un seul actif par propriétaire. */
  async creer(
    proprietaireId: string,
    declenchement: "planifie" | "manuel",
    demandeurId: string | null,
    projectIds: string[] = [],
  ) {
    const actif = await this.prisma.agentPassage.findFirst({
      where: { proprietaireId, etat: { in: ACTIFS } },
      select: { id: true },
    });
    if (actif) {
      throw refusAssistant(409, "passageActif", "Un passage de l'agent est déjà en cours ou en attente.", {
        regle: "RG-AST-15",
        passageId: actif.id,
      });
    }
    try {
      const passage = await this.prisma.agentPassage.create({
        data: { proprietaireId, declenchement, demandeurId, projectIds },
      });
      if (demandeurId) {
        await this.audit.tracer({
          action: "agent_run.create",
          typeEntite: "AgentPassage",
          entiteId: passage.id,
          acteurId: demandeurId,
          detail: { declenchement },
        });
      }
      return passage;
    } catch (e) {
      if (estDoublonActif(e)) {
        throw refusAssistant(409, "passageActif", "Un passage de l'agent est déjà en cours ou en attente.", { regle: "RG-AST-15" });
      }
      throw e;
    }
  }

  /**
   * Attend jusqu'à `attendre` secondes un passage en attente du propriétaire.
   * L'attente ne coûte qu'une lecture par seconde, et l'agent du poste ne
   * consomme rien pendant ce temps.
   */
  async suivant(proprietaireId: string, attendre: number) {
    const limite = Date.now() + Math.min(attendre, SECONDES_ATTENTE_PASSAGE) * 1000;
    for (;;) {
      const passage = await this.prisma.agentPassage.findFirst({
        where: { proprietaireId, etat: "en_attente" },
        orderBy: { creeLe: "asc" },
      });
      if (passage || Date.now() >= limite) return { passage: passage ?? null };
      await new Promise((r) => setTimeout(r, 1000));
    }
  }

  async prendre(id: string, proprietaireId: string, jetonId: string) {
    const maintenant = new Date();
    const pris = await this.prisma.agentPassage.updateMany({
      where: { id, proprietaireId, etat: "en_attente" },
      data: { etat: "prise", jetonId, priseLe: maintenant, signeDeVie: maintenant },
    });
    if (pris.count === 0) {
      await this.exigerDuProprietaire(id, proprietaireId);
      throw refusAssistant(409, "passageDejaPris", "Ce passage a déjà été pris en charge, ou n'est plus en attente.");
    }
    return this.prisma.agentPassage.findUniqueOrThrow({ where: { id } });
  }

  /** Un passage pris par ce jeton, et encore en cours. */
  async exigerEnCours(id: string, proprietaireId: string) {
    const passage = await this.exigerDuProprietaire(id, proprietaireId);
    if (passage.etat !== "prise" && passage.etat !== "en_cours") {
      throw refusAssistant(409, "passageClos", "Ce passage n'est plus en cours.", { etat: passage.etat });
    }
    return passage;
  }

  async signeDeVie(id: string, libelle?: string) {
    return this.prisma.agentPassage.update({
      where: { id },
      data: { etat: "en_cours", signeDeVie: new Date(), ...(libelle ? { progression: libelle } : {}) },
    });
  }

  /** `EX-AST-08` — terminer, puis notifier le propriétaire. */
  async finir(id: string, proprietaireId: string, etat: "terminee" | "echec", bilan?: BilanPassage, erreur?: string) {
    await this.exigerEnCours(id, proprietaireId);
    const passage = await this.prisma.agentPassage.update({
      where: { id },
      data: {
        etat,
        finLe: new Date(),
        signeDeVie: new Date(),
        ...(bilan ? { bilan: bilan as Prisma.InputJsonValue } : {}),
        erreur: erreur ?? null,
      },
    });
    await this.notifierFin(passage.id);
    return passage;
  }

  async annuler(id: string, proprietaireId: string) {
    const annule = await this.prisma.agentPassage.updateMany({
      where: { id, proprietaireId, etat: { in: ACTIFS } },
      data: { etat: "annulee", finLe: new Date() },
    });
    if (annule.count === 0) {
      await this.exigerDuProprietaire(id, proprietaireId);
      throw refusAssistant(409, "passageClos", "Ce passage n'est plus en cours.");
    }
    await this.audit.tracer({ action: "agent_run.cancel", typeEntite: "AgentPassage", entiteId: id, acteurId: proprietaireId });
    return this.prisma.agentPassage.findUniqueOrThrow({ where: { id } });
  }

  private async exigerDuProprietaire(id: string, proprietaireId: string) {
    const passage = await this.prisma.agentPassage.findFirst({ where: { id, proprietaireId } });
    if (!passage) throw refusAssistant(404, "passageIntrouvable", "Ce passage de l'agent n'existe pas.");
    return passage;
  }

  // ── Notifications ─────────────────────────────────────────────────────────

  /**
   * Un passage sans action ni point ouvert ne notifie rien : il n'y a rien à
   * voir. Un échec ou une interruption notifie toujours.
   */
  private async notifierFin(id: string) {
    const passage = await this.prisma.agentPassage.findUniqueOrThrow({
      where: { id },
      select: { id: true, proprietaireId: true, etat: true, bilan: true, erreur: true },
    });
    const lien = `/assistant?passage=${passage.id}`;
    if (passage.etat === "echec" || passage.etat === "interrompue") {
      await this.notifications.notifier({
        userId: passage.proprietaireId,
        type: "assistant_passage_echec",
        params: { etat: passage.etat, erreur: (passage.erreur ?? "").slice(0, 300) },
        lien,
      });
      return;
    }
    const [effectuees, refusees, aValider] = await Promise.all([
      this.prisma.agentAction.count({ where: { passageId: id, etat: { in: ["effectuee", "defaite"] } } }),
      this.prisma.agentAction.count({ where: { passageId: id, etat: "refusee" } }),
      this.prisma.agentAction.count({ where: { passageId: id, etat: "a_valider", type: "projet_creer", dependDeId: null } }),
    ]);
    const pointsOuverts = ((passage.bilan as BilanPassage | null)?.pointsOuverts ?? []).length;
    if (effectuees + refusees + pointsOuverts + aValider === 0) return;
    await this.notifications.notifier({
      userId: passage.proprietaireId,
      type: "assistant_passage",
      params: {
        effectuees: String(effectuees),
        refusees: String(refusees),
        pointsOuverts: String(pointsOuverts),
        aValider: String(aValider),
      },
      lien,
    });
  }

  // ── Contexte ──────────────────────────────────────────────────────────────

  /**
   * Ce que l'agent doit savoir pour travailler sans conjecture
   * (`docs/assistant/SPEC-PHASE-1.md § 10`).
   *
   * `RG-AST-14` — rien de ce que le propriétaire ne peut lire : les projets
   * passent par son filtre de périmètre, les tâches par le sien, qui exclut les
   * tâches confidentielles sans `tasks:read_confidential`.
   */
  async contexte(passageId: string, proprietaireId: string, permissions: ReadonlySet<string>) {
    const passage = await this.exigerDuProprietaire(passageId, proprietaireId);
    const perimetre = await this.perimetres.resoudre(proprietaireId, permissions);
    const filtreProjet = this.perimetres.filtreProjet(perimetre, permissions);
    const filtreTache = this.perimetres.filtreTache(perimetre, permissions);

    const portee: Prisma.ProjectWhereInput =
      passage.projectIds.length > 0
        ? { id: { in: passage.projectIds } }
        : { suivi: { is: { actif: true } } };

    const projets = await this.prisma.project.findMany({
      where: { AND: [filtreProjet, portee, { archive: false }] },
      orderBy: { nom: "asc" },
      select: {
        id: true, nom: true, description: true, statut: true, priorite: true,
        dateDebut: true, dateFin: true, chefId: true, version: true,
        suivi: { select: { consigne: true, sources: true, silenceJours: true, actif: true, version: true } },
        jalons: {
          orderBy: { dateEcheance: "asc" },
          select: { id: true, nom: true, description: true, dateEcheance: true, statut: true, version: true },
        },
      },
    });
    const ids = projets.map((p) => p.id);
    const depuis = new Date(Date.now() - JOURS_TACHES_CLOSES * JOUR_MS);
    const aujourdhui = new Date(new Date().toISOString().slice(0, 10));

    const [taches, evenements, autres, actions, dernier, proprietaire] = await Promise.all([
      this.prisma.task.findMany({
        where: {
          AND: [
            filtreTache,
            { projectId: { in: ids } },
            { OR: [{ statut: { not: "done" } }, { modifieLe: { gte: depuis } }] },
          ],
        },
        orderBy: [{ dateFin: "asc" }, { titre: "asc" }],
        select: {
          id: true, projectId: true, milestoneId: true, titre: true, description: true, statut: true,
          priorite: true, avancement: true, dateDebut: true, dateFin: true, version: true,
          assignes: { select: { userId: true } },
        },
      }),
      this.prisma.event.findMany({
        where: { projectId: { in: ids }, date: { gte: new Date(aujourdhui.getTime() - 7 * JOUR_MS) } },
        orderBy: { date: "asc" },
        take: 500,
        select: { id: true, projectId: true, titre: true, date: true, journeeEntiere: true, heureDebut: true, heureFin: true, version: true },
      }),
      // Les projets visibles et non suivis : de quoi ne pas recréer un projet qui existe.
      this.prisma.project.findMany({
        where: { AND: [filtreProjet, { id: { notIn: ids } }, { archive: false }, { statut: { not: "cancelled" } }] },
        orderBy: { nom: "asc" },
        take: 500,
        select: { id: true, nom: true, statut: true, dateDebut: true, dateFin: true },
      }),
      this.prisma.agentAction.findMany({
        where: {
          proprietaireId,
          creeLe: { gte: new Date(Date.now() - JOURS_REFUS_ACTION_DEFAITE * JOUR_MS) },
        },
        orderBy: { creeLe: "desc" },
        take: 1000,
        select: { id: true, type: true, etat: true, projectId: true, cibleId: true, justification: true, empreinte: true, creeLe: true },
      }),
      this.prisma.agentPassage.findFirst({
        where: { proprietaireId, etat: "terminee" },
        orderBy: { finLe: "desc" },
        select: { finLe: true },
      }),
      this.prisma.user.findUniqueOrThrow({ where: { id: proprietaireId }, select: { id: true, prenom: true, nom: true } }),
    ]);

    return {
      passage: { id: passage.id, declenchement: passage.declenchement, creeLe: passage.creeLe },
      aujourdhui: jour(aujourdhui),
      proprietaire,
      dernierPassageTermine: dernier?.finLe ?? null,
      projets: projets.map((p) => ({
        ...p,
        dateDebut: jour(p.dateDebut),
        dateFin: jour(p.dateFin),
        jalons: p.jalons.map((j) => ({ ...j, dateEcheance: jour(j.dateEcheance) })),
        taches: taches
          .filter((t) => t.projectId === p.id)
          .map(({ assignes, ...t }) => ({
            ...t,
            dateDebut: jour(t.dateDebut),
            dateFin: jour(t.dateFin),
            assigneIds: assignes.map((a) => a.userId),
          })),
        evenements: evenements.filter((e) => e.projectId === p.id).map((e) => ({ ...e, date: jour(e.date) })),
      })),
      autresProjets: autres.map((p) => ({ ...p, dateDebut: jour(p.dateDebut), dateFin: jour(p.dateFin) })),
      actionsRecentes: actions,
    };
  }

  /** Les temps déjà déclarés par le propriétaire : l'agent n'impute pas deux fois le même travail. */
  async temps(proprietaireId: string, du: Date, au: Date) {
    const saisies = await this.prisma.timeEntry.findMany({
      where: { userId: proprietaireId, date: { gte: du, lte: au } },
      orderBy: { date: "asc" },
      select: { id: true, date: true, heures: true, typeActivite: true, projectId: true, taskId: true, description: true },
    });
    return saisies.map((s) => ({ ...s, date: jour(s.date), heures: Number(s.heures) }));
  }

  // ── Historique ────────────────────────────────────────────────────────────

  /** `EX-AST-09` — l'historique des passages, avec le décompte de leurs actions. */
  async lister(proprietaireId: string, filtres: { etat?: string | undefined; limite: number }) {
    const passages = await this.prisma.agentPassage.findMany({
      where: { proprietaireId, ...(filtres.etat ? { etat: filtres.etat as EtatPassage } : {}) },
      orderBy: { creeLe: "desc" },
      take: filtres.limite,
    });
    const decomptes = await this.prisma.agentAction.groupBy({
      by: ["passageId", "etat"],
      where: { passageId: { in: passages.map((p) => p.id) } },
      _count: { _all: true },
    });
    return passages.map((p) => {
      const de = (etat: string) => decomptes.find((d) => d.passageId === p.id && d.etat === etat)?._count._all ?? 0;
      return {
        ...p,
        actions: {
          effectuees: de("effectuee"),
          refusees: de("refusee"),
          defaites: de("defaite"),
          aValider: de("a_valider"),
          rejetees: de("rejetee"),
        },
      };
    });
  }

  /** `RG-AST-21` — le nombre de créations de projet qui attendent leur propriétaire. */
  async creationsAValider(proprietaireId: string): Promise<number> {
    return this.prisma.agentAction.count({
      where: { proprietaireId, etat: "a_valider", type: "projet_creer", dependDeId: null },
    });
  }

  async detail(id: string, proprietaireId: string) {
    return this.exigerDuProprietaire(id, proprietaireId);
  }

  // ── Traitements planifiés ─────────────────────────────────────────────────

  /** `RG-AST-15` — un passage pris sans signe de vie depuis trente minutes est interrompu. */
  async interrompreLesMuets(): Promise<number> {
    const seuil = new Date(Date.now() - MINUTES_SANS_SIGNE_DE_VIE * 60_000);
    const muets = await this.prisma.agentPassage.findMany({
      where: { etat: { in: ["prise", "en_cours"] }, signeDeVie: { lt: seuil } },
      select: { id: true },
    });
    for (const { id } of muets) {
      const r = await this.prisma.agentPassage.updateMany({
        where: { id, etat: { in: ["prise", "en_cours"] } },
        data: { etat: "interrompue", finLe: new Date() },
      });
      if (r.count > 0) await this.notifierFin(id);
    }
    return muets.length;
  }

  /** `EX-AST-05` — un passage planifié pour chaque propriétaire qui n'en a pas d'actif. */
  async creerPassagesPlanifies(proprietaires: string[]): Promise<number> {
    let crees = 0;
    for (const proprietaireId of proprietaires) {
      try {
        await this.creer(proprietaireId, "planifie", null);
        crees++;
      } catch {
        // Un passage déjà actif n'est pas une panne : le prochain créneau le rattrapera.
      }
    }
    return crees;
  }

  /**
   * `RG-AST-19` — les extraits des preuves échues sont effacés. La source, la
   * référence et la date restent : l'action reste lisible, son contenu ne
   * s'attarde pas.
   */
  async purgerLesExtraits(conservationJours: number): Promise<number> {
    const seuil = new Date(Date.now() - conservationJours * JOUR_MS);
    const actions = await this.prisma.$executeRaw`
      UPDATE "agent_actions"
         SET "preuves" = (SELECT COALESCE(jsonb_agg(p - 'extrait'), '[]'::jsonb) FROM jsonb_array_elements("preuves") p)
       WHERE "creeLe" < ${seuil}
         AND jsonb_typeof("preuves") = 'array'
         AND jsonb_path_exists("preuves", '$[*].extrait')`;
    const passages = await this.prisma.$executeRaw`
      UPDATE "agent_passages"
         SET "bilan" = jsonb_set("bilan", '{pointsOuverts}', (
               SELECT COALESCE(jsonb_agg(
                 CASE WHEN jsonb_typeof(po->'preuves') = 'array'
                      THEN jsonb_set(po, '{preuves}', (SELECT COALESCE(jsonb_agg(p - 'extrait'), '[]'::jsonb) FROM jsonb_array_elements(po->'preuves') p))
                      ELSE po END), '[]'::jsonb)
                 FROM jsonb_array_elements("bilan"->'pointsOuverts') po))
       WHERE "creeLe" < ${seuil}
         AND jsonb_typeof("bilan"->'pointsOuverts') = 'array'
         AND jsonb_path_exists("bilan", '$.pointsOuverts[*].preuves[*].extrait')`;
    return actions + passages;
  }
}
