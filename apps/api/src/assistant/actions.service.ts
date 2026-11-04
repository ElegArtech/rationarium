import { createHash } from "node:crypto";
import { Injectable } from "@nestjs/common";
import {
  JOURS_REFUS_ACTION_DEFAITE,
  actionAgentSchema,
  type ActionAgent,
  type Preuve,
  type ReglagesAssistant,
  type TypeActionAgent,
} from "@rationarium/contracts";
import type { Prisma } from "@rationarium/db";
import { PrismaService } from "../prisma.service.js";
import { AuditService } from "../commun/audit.service.js";
import type { AgentResolu } from "../commun/acces-agent.js";
import { ExecutionInterneService, type ReponseInterne } from "./execution-interne.service.js";
import { SuivisService } from "./suivis.service.js";
import {
  RECETTES,
  appelRetablissement,
  appelSuppression,
  champsTouches,
  lireEntite,
  projetDeLEntite,
  type Instantane,
  type TypeCible,
} from "./recettes.js";
import { refusAssistant } from "./erreurs.js";

const JOUR_MS = 86_400_000;

/** Les champs d'une charge qui désignent une entité, et peuvent porter une `@reference`. */
const CHAMPS_IDENTIFIANTS = ["projectId", "milestoneId", "taskId", "eventId"] as const;

export type Motif = {
  regle?: string;
  cle: string;
  message: string;
  statut: number;
  details?: unknown;
};

export type ResultatAction = {
  index: number;
  type: string;
  reference: string | null;
  etat: "effectuee" | "refusee";
  actionId: string;
  cibleType: TypeCible | null;
  cibleId: string | null;
  version: number | null;
  motif: Motif | null;
  /** `RG-AST-12` — l'action rejouée rend le résultat de sa première exécution. */
  rejouee: boolean;
};

type Passage = { id: string; proprietaireId: string };

class Refus extends Error {
  constructor(readonly motif: Motif) {
    super(motif.message);
  }
}

const refus = (statut: number, cle: string, message: string, regle?: string, details?: unknown): Refus =>
  new Refus({ statut, cle: `assistant:erreurs.${cle}`, message, ...(regle ? { regle } : {}), ...(details ? { details } : {}) });

/** JSON à clés triées : deux charges équivalentes ont la même empreinte. */
const stable = (v: unknown): string => {
  if (Array.isArray(v)) return `[${v.map(stable).join(",")}]`;
  if (v && typeof v === "object") {
    return `{${Object.keys(v)
      .sort()
      .filter((k) => (v as Record<string, unknown>)[k] !== undefined)
      .map((k) => `${JSON.stringify(k)}:${stable((v as Record<string, unknown>)[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(v);
};

const empreinteDe = (type: string, charge: unknown): string =>
  createHash("sha256").update(`${type}\n${stable(charge)}`).digest("hex");

/** Le motif d'un refus rendu par une route rejouée : sa clé et sa phrase, telles quelles. */
const motifDeReponse = (r: ReponseInterne): Motif => {
  const corps = (r.corps ?? {}) as { cle?: unknown; message?: unknown; details?: unknown };
  return {
    statut: r.statut,
    cle: typeof corps.cle === "string" ? corps.cle : "erreurs:inattendue",
    message: typeof corps.message === "string" ? corps.message : "L'écriture a été refusée.",
    ...(corps.details !== undefined ? { details: corps.details } : {}),
  };
};

const json = (v: unknown): Prisma.InputJsonValue => (v ?? null) as Prisma.InputJsonValue;

/**
 * Exécute les actions de l'agent et les défait (`docs/assistant/SPEC-PHASE-1.md § 10 et 11`).
 *
 * Une action effectuée l'est immédiatement, par la route existante, au nom du
 * propriétaire du jeton (`RG-AST-04`). Elle laisse au journal son état avant et
 * après, sa justification et ses preuves : c'est ce qui permet de la relire et
 * de la défaire, et ce qui remplace toute validation préalable.
 */
@Injectable()
export class ActionsAgentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly execution: ExecutionInterneService,
    private readonly suivis: SuivisService,
  ) {}

  // ── Exécution ─────────────────────────────────────────────────────────────

  async executerLot(
    passage: Passage,
    agent: AgentResolu,
    actions: unknown[],
    reglages: ReglagesAssistant,
  ): Promise<ResultatAction[]> {
    // Les références déclarées par les lots précédents du même passage restent
    // valables : un agent peut créer un projet dans un lot et ses tâches dans le suivant.
    const references = new Map<string, { cible: TypeCible; id: string }>();
    for (const a of await this.prisma.agentAction.findMany({
      where: { passageId: passage.id, etat: "effectuee", reference: { not: null }, cibleId: { not: null } },
      select: { reference: true, cibleType: true, cibleId: true },
    })) {
      references.set(a.reference!, { cible: a.cibleType as TypeCible, id: a.cibleId! });
    }
    let deja = await this.prisma.agentAction.count({ where: { passageId: passage.id } });

    const resultats: ResultatAction[] = [];
    for (const [index, brute] of actions.entries()) {
      if (deja >= reglages.actionsParPassage) {
        resultats.push(
          await this.consignerRefus(passage, agent, index, brute, refus(
            429,
            "plafondActions",
            `Le passage a atteint le plafond de ${reglages.actionsParPassage} actions fixé par le paramétrage.`,
          )),
        );
        continue;
      }
      deja++;
      resultats.push(await this.executerUne(passage, agent, index, brute, reglages, references));
    }
    return resultats;
  }

  private async executerUne(
    passage: Passage,
    agent: AgentResolu,
    index: number,
    brute: unknown,
    reglages: ReglagesAssistant,
    references: Map<string, { cible: TypeCible; id: string }>,
  ): Promise<ResultatAction> {
    // 1. La forme. `RG-AST-07` : justification et preuves sont exigées ici.
    const lue = actionAgentSchema.safeParse(brute);
    if (!lue.success) {
      const surPreuves = lue.error.issues.some((i) => i.path[0] === "preuves" || i.path[0] === "justification");
      const regleDuChamp = lue.error.issues
        .map((i) => /\((RG-AST-\d+)\)/.exec(i.message)?.[1])
        .find(Boolean);
      return this.consignerRefus(passage, agent, index, brute, refus(
        400,
        "actionInvalide",
        "L'action est incomplète ou mal formée.",
        regleDuChamp ?? (surPreuves ? "RG-AST-07" : undefined),
        lue.error.issues.map((i) => ({ champ: i.path.join("."), message: i.message })),
      ));
    }
    const action = lue.data;

    try {
      // 2. `RG-AST-05` — le jeton peut être borné à certains types.
      if (agent.typesAutorises.length > 0 && !agent.typesAutorises.includes(action.type)) {
        throw refus(403, "typeNonAutorise", "Ce jeton n'autorise pas ce type d'action.", "RG-AST-05");
      }
      if (action.reference && references.has(action.reference)) {
        throw refus(400, "referenceEnDouble", `La référence « ${action.reference} » est déjà déclarée dans ce passage.`, "RG-AST-10");
      }

      // 3. `RG-AST-10` — les références locales se résolvent ; rien ne se rapproche par libellé.
      const charge = this.resoudreReferences(action.charge as Record<string, unknown>, references);

      // 4. `RG-AST-12` — rejeu et action défaite.
      const empreinte = empreinteDe(action.type, charge);
      const rejouee = await this.prisma.agentAction.findFirst({
        where: { passageId: passage.id, empreinte, etat: "effectuee" },
        select: { id: true, cibleType: true, cibleId: true, versionApres: true, reference: true },
      });
      if (rejouee) {
        return {
          index,
          type: action.type,
          reference: rejouee.reference,
          etat: "effectuee",
          actionId: rejouee.id,
          cibleType: rejouee.cibleType as TypeCible | null,
          cibleId: rejouee.cibleId,
          version: rejouee.versionApres,
          motif: null,
          rejouee: true,
        };
      }
      const defaite = await this.prisma.agentAction.findFirst({
        where: {
          proprietaireId: passage.proprietaireId,
          empreinte,
          etat: "defaite",
          defaiteLe: { gt: new Date(Date.now() - JOURS_REFUS_ACTION_DEFAITE * JOUR_MS) },
        },
        select: { id: true },
      });
      if (defaite) {
        throw refus(409, "actionDefaite", "Cette action a été défaite par son propriétaire : elle n'est pas refaite.", "RG-AST-12", {
          actionDefaite: defaite.id,
        });
      }

      // 5. Les règles du suivi.
      this.exigerReglesDuSuivi(action, charge, reglages);

      // 6. L'exécution, par la route existante.
      return await this.appliquer(passage, agent, index, action, charge, empreinte, references);
    } catch (e) {
      if (e instanceof Refus) return this.consignerRefus(passage, agent, index, action, e);
      throw e;
    }
  }

  private resoudreReferences(
    charge: Record<string, unknown>,
    references: Map<string, { cible: TypeCible; id: string }>,
  ): Record<string, unknown> {
    const resolue = { ...charge };
    for (const champ of CHAMPS_IDENTIFIANTS) {
      const valeur = resolue[champ];
      if (typeof valeur !== "string" || !valeur.startsWith("@")) continue;
      const trouvee = references.get(valeur.slice(1));
      if (!trouvee) {
        throw refus(400, "referenceInconnue", `La référence « ${valeur} » ne désigne aucune entité créée dans ce passage.`, "RG-AST-10", {
          champ,
        });
      }
      resolue[champ] = trouvee.id;
    }
    return resolue;
  }

  private exigerReglesDuSuivi(action: ActionAgent, charge: Record<string, unknown>, reglages: ReglagesAssistant): void {
    // `RG-AST-08` — une tâche de projet est rattachée à un jalon de ce projet.
    if (action.type === "tache_creer" && reglages.jalonObligatoire && charge["projectId"] && !charge["milestoneId"]) {
      throw refus(422, "jalonObligatoire", "Une tâche créée dans un projet doit être rattachée à un jalon de ce projet.", "RG-AST-08");
    }
    if (action.type === "tache_modifier" && reglages.jalonObligatoire && charge["milestoneId"] === null) {
      throw refus(422, "jalonObligatoire", "Une tâche de projet ne peut pas être détachée de son jalon.", "RG-AST-08");
    }
    // `RG-AST-09` — un projet commence à la date d'une de ses preuves.
    if (action.type === "projet_creer") {
      const debut = String(charge["dateDebut"]);
      const attestee = action.preuves.some((p: Preuve) => p.date.slice(0, 10) === debut);
      if (!attestee) {
        throw refus(
          422,
          "debutNonAtteste",
          "La date de début d'un projet doit être celle de l'une des preuves de l'action : la date du passage n'en est pas une.",
          "RG-AST-09",
        );
      }
    }
  }

  private async appliquer(
    passage: Passage,
    agent: AgentResolu,
    index: number,
    action: ActionAgent,
    charge: Record<string, unknown>,
    empreinte: string,
    references: Map<string, { cible: TypeCible; id: string }>,
  ): Promise<ResultatAction> {
    const recette = RECETTES[action.type];
    const proprietaire = passage.proprietaireId;

    // L'état d'avant, pour une modification.
    let avant: Instantane | null = null;
    let cibleId: string | null = null;
    if (!recette.creation) {
      cibleId = String(charge[recette.champCible!]);
      const entite = await lireEntite(this.prisma, recette.cible, cibleId);
      if (!entite && recette.cible !== "ProjetSuivi") {
        throw refus(404, "cibleIntrouvable", "L'entité visée par l'action n'existe pas.", "RG-AST-10");
      }
      const touches = champsTouches(recette.cible, charge, recette.champCible);
      avant = entite
        ? Object.fromEntries(touches.map((c) => [c, entite[c] ?? null]))
        : { consigne: null, sources: [], silenceJours: null, actif: false };
    }

    // Ce que l'agent ouvre revient à son propriétaire : il en devient le chef,
    // quand ses droits le lui permettent. Nommer un chef est gouverné par
    // `projects:manage_members` (`RG-SCOPE-02`) ; sans ce droit, il reste le
    // créateur du projet, donc rattaché à lui (`RG-TSK-03`).
    const aEcrire = { ...charge };
    if (action.type === "projet_creer" && aEcrire["chefId"] === undefined) {
      if ((await this.permissionsDe(proprietaire)).has("projects:manage_members")) aEcrire["chefId"] = proprietaire;
    }

    const reponse = await this.execution.appeler(proprietaire, recette.appel(aEcrire, proprietaire));
    if (reponse.statut >= 400) {
      const motif = motifDeReponse(reponse);
      // `RG-AST-06` — un conflit de version se nomme : l'agent relit avant de réessayer.
      throw new Refus(reponse.statut === 409 ? { ...motif, regle: motif.regle ?? "RG-AST-06" } : motif);
    }

    if (recette.creation) {
      cibleId = recette.creee?.(reponse.corps) ?? null;
      if (!cibleId) throw new Error(`réponse sans identifiant pour ${action.type}`);
    }

    // Le plan de suivi joint à un projet créé : le propriétaire vient d'en devenir le chef.
    if (action.type === "projet_creer" && action.charge.suivi) {
      const permissions = await this.permissionsDe(proprietaire);
      await this.suivis.ecrire(cibleId!, action.charge.suivi, proprietaire, permissions);
    }

    const apres = await lireEntite(this.prisma, recette.cible, cibleId!);
    const versionApres = typeof apres?.["version"] === "number" ? (apres["version"] as number) : null;
    const projectId =
      recette.projet(charge, cibleId) ?? (await projetDeLEntite(this.prisma, recette.cible, cibleId!));

    const consignee = await this.prisma.agentAction.create({
      data: {
        passageId: passage.id,
        jetonId: agent.jetonId,
        proprietaireId: proprietaire,
        projectId: await this.projetExistant(projectId),
        type: action.type,
        reference: action.reference ?? null,
        cibleType: recette.cible,
        cibleId,
        charge: json(charge),
        ...(avant === null ? {} : { avant: json(avant) }),
        ...(apres === null ? {} : { apres: json(apres) }),
        versionApres,
        justification: action.justification,
        preuves: json(action.preuves),
        empreinte,
        etat: "effectuee",
      },
      select: { id: true },
    });
    if (action.reference) references.set(action.reference, { cible: recette.cible, id: cibleId! });

    // `RG-AST-17` — la route rejouée a tracé l'écriture au nom du propriétaire ;
    // cette entrée dit qu'elle venait de l'agent, et de quel passage.
    await this.audit.tracer({
      action: "agent.action",
      typeEntite: recette.cible,
      entiteId: cibleId,
      acteurId: proprietaire,
      detail: { actionId: consignee.id, type: action.type, passageId: passage.id, jetonId: agent.jetonId },
    });

    return {
      index,
      type: action.type,
      reference: action.reference ?? null,
      etat: "effectuee",
      actionId: consignee.id,
      cibleType: recette.cible,
      cibleId,
      version: versionApres,
      motif: null,
      rejouee: false,
    };
  }

  private async consignerRefus(
    passage: Passage,
    agent: AgentResolu,
    index: number,
    brute: unknown,
    e: Refus,
  ): Promise<ResultatAction> {
    const a = (brute ?? {}) as Partial<Record<"type" | "reference" | "justification" | "charge" | "preuves", unknown>>;
    const type = typeof a.type === "string" ? a.type.slice(0, 60) : "inconnu";
    const charge = a.charge ?? null;
    const projectId =
      charge && typeof charge === "object" && typeof (charge as Record<string, unknown>)["projectId"] === "string"
        ? ((charge as Record<string, unknown>)["projectId"] as string)
        : null;
    const consignee = await this.prisma.agentAction.create({
      data: {
        passageId: passage.id,
        jetonId: agent.jetonId,
        proprietaireId: passage.proprietaireId,
        projectId: await this.projetExistant(projectId),
        type,
        reference: typeof a.reference === "string" ? a.reference.slice(0, 40) : null,
        charge: json(charge),
        justification: typeof a.justification === "string" ? a.justification.slice(0, 2000) : "",
        preuves: json(Array.isArray(a.preuves) ? a.preuves.slice(0, 10) : []),
        empreinte: empreinteDe(type, charge),
        etat: "refusee",
        motifRefus: json(e.motif),
      },
      select: { id: true },
    });
    return {
      index,
      type,
      reference: typeof a.reference === "string" ? a.reference : null,
      etat: "refusee",
      actionId: consignee.id,
      cibleType: null,
      cibleId: null,
      version: null,
      motif: e.motif,
      rejouee: false,
    };
  }

  /** Un identifiant de projet n'entre au journal que s'il désigne un projet existant. */
  private async projetExistant(id: string | null): Promise<string | null> {
    if (!id || !/^[0-9a-f-]{36}$/i.test(id)) return null;
    const p = await this.prisma.project.findUnique({ where: { id }, select: { id: true } });
    return p?.id ?? null;
  }

  private async permissionsDe(userId: string): Promise<ReadonlySet<string>> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { role: { select: { permissions: { select: { permission: true } } } } },
    });
    return new Set(user?.role?.permissions.map((p) => p.permission) ?? []);
  }

  // ── Défaire ───────────────────────────────────────────────────────────────

  /**
   * `EX-AST-07`, `RG-AST-18` — défaire une action, au nom de qui défait.
   *
   * Une création défaite supprime l'entité, selon les règles de suppression de
   * cette entité. Une modification défaite rétablit l'état d'avant. Dans les
   * deux cas, l'entité ne doit pas avoir changé depuis l'action : défaire
   * écraserait sinon le travail de quelqu'un (`RG-GEN-07`).
   */
  async defaire(actionId: string, userId: string) {
    const action = await this.prisma.agentAction.findFirst({
      where: { id: actionId, proprietaireId: userId },
      select: {
        id: true, type: true, etat: true, cibleType: true, cibleId: true,
        avant: true, apres: true, versionApres: true, passageId: true,
      },
    });
    if (!action) throw refusAssistant(404, "actionIntrouvable", "Cette action de l'agent n'existe pas.");
    if (action.etat !== "effectuee") {
      throw refusAssistant(409, "actionNonDefaisable", "Seule une action effectuée peut être défaite.");
    }
    const recette = RECETTES[action.type as TypeActionAgent];
    const cible = action.cibleType as TypeCible;
    const actuelle = await lireEntite(this.prisma, cible, action.cibleId!);

    if (!this.inchangee(actuelle, action.apres as Instantane | null, action.versionApres)) {
      throw refusAssistant(
        409,
        "modifieeDepuis",
        "L'élément a changé depuis l'action de l'agent : défaire écraserait ces changements. Corrigez-le directement.",
        { regle: "RG-AST-18" },
      );
    }

    const version = typeof actuelle?.["version"] === "number" ? (actuelle["version"] as number) : null;
    const appel = recette.creation
      ? appelSuppression(cible, action.cibleId!, version)
      : appelRetablissement(cible, action.cibleId!, (action.avant ?? {}) as Instantane, version);
    if (!appel) throw refusAssistant(409, "actionNonDefaisable", "Cette action ne peut pas être défaite.");

    const reponse = await this.execution.appeler(userId, appel);
    if (reponse.statut >= 400) {
      const motif = motifDeReponse(reponse);
      throw refusAssistant(reponse.statut, "defaireRefuse", motif.message, { motif });
    }

    await this.prisma.agentAction.update({
      where: { id: action.id },
      data: { etat: "defaite", defaiteParId: userId, defaiteLe: new Date() },
    });
    await this.audit.tracer({
      action: "agent.action.undo",
      typeEntite: cible,
      entiteId: action.cibleId,
      acteurId: userId,
      detail: { actionId: action.id, type: action.type, passageId: action.passageId },
    });
    return { actionId: action.id, etat: "defaite" as const };
  }

  /** Défait les actions encore défaisables d'un passage, de la plus récente à la plus ancienne. */
  async defairePassage(passageId: string, userId: string) {
    const passage = await this.prisma.agentPassage.findFirst({ where: { id: passageId, proprietaireId: userId }, select: { id: true } });
    if (!passage) throw refusAssistant(404, "passageIntrouvable", "Ce passage de l'agent n'existe pas.");
    const actions = await this.prisma.agentAction.findMany({
      where: { passageId, etat: "effectuee" },
      orderBy: { creeLe: "desc" },
      select: { id: true },
    });
    const defaites: string[] = [];
    const restees: { actionId: string; message: string }[] = [];
    for (const { id } of actions) {
      try {
        await this.defaire(id, userId);
        defaites.push(id);
      } catch (e) {
        const corps = (e as { getResponse?: () => unknown }).getResponse?.() as { message?: string } | undefined;
        restees.push({ actionId: id, message: corps?.message ?? String(e) });
      }
    }
    return { defaites, restees };
  }

  private inchangee(actuelle: Instantane | null, apres: Instantane | null, versionApres: number | null): boolean {
    if (!actuelle) return false;
    if (versionApres !== null) return actuelle["version"] === versionApres;
    if (!apres) return false;
    return Object.keys(apres).every((c) => stable(actuelle[c]) === stable(apres[c]));
  }

  // ── Lecture ───────────────────────────────────────────────────────────────

  /** `EX-AST-06` — les actions de ses agents, par passage ou par projet. */
  async lister(
    userId: string,
    filtres: { passageId?: string | undefined; projectId?: string | undefined; etat?: string | undefined; limite: number; avant?: Date | undefined },
  ) {
    const actions = await this.prisma.agentAction.findMany({
      where: {
        proprietaireId: userId,
        ...(filtres.passageId ? { passageId: filtres.passageId } : {}),
        ...(filtres.projectId ? { projectId: filtres.projectId } : {}),
        ...(filtres.etat ? { etat: filtres.etat as "effectuee" | "refusee" | "defaite" } : {}),
        ...(filtres.avant ? { creeLe: { lt: filtres.avant } } : {}),
      },
      orderBy: { creeLe: "desc" },
      take: filtres.limite,
      select: {
        id: true, passageId: true, projectId: true, type: true, reference: true, cibleType: true, cibleId: true,
        charge: true, avant: true, apres: true, justification: true, preuves: true, etat: true, motifRefus: true,
        defaiteLe: true, creeLe: true,
        project: { select: { nom: true } },
        defaitePar: { select: { prenom: true, nom: true } },
      },
    });
    return actions.map(({ project, defaitePar, ...a }) => ({
      ...a,
      projetNom: project?.nom ?? null,
      defaitePar: defaitePar ? `${defaitePar.prenom} ${defaitePar.nom}` : null,
    }));
  }
}
