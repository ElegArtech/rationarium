import { Injectable } from "@nestjs/common";
import { JOURS_VIE_JETON, SECONDES_AGENT_JOIGNABLE } from "@rationarium/contracts";
import { PrismaService } from "../prisma.service.js";
import { AuditService } from "../commun/audit.service.js";
import { empreinteJetonAgent, engendrerJetonAgent } from "../commun/acces-agent.js";
import { refusAssistant } from "./erreurs.js";

const JOUR_MS = 86_400_000;

/**
 * `EX-AST-02` — les jetons d'agent d'un utilisateur.
 *
 * Un jeton appartient à son propriétaire et à lui seul : la liste, la création
 * et la révocation sont bornées à `userId`, sans permission « sur autrui ». Le
 * jeton n'existe en clair que dans la réponse de création (`RG-AST-02`).
 */
@Injectable()
export class JetonsAgentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async lister(userId: string) {
    const jetons = await this.prisma.agentJeton.findMany({
      where: { userId },
      orderBy: { creeLe: "desc" },
      select: {
        id: true,
        libelle: true,
        typesAutorises: true,
        creeLe: true,
        expireLe: true,
        dernierUsage: true,
        revoqueLe: true,
      },
    });
    const maintenant = Date.now();
    return jetons.map((j) => ({
      ...j,
      etat: j.revoqueLe ? "revoque" : j.expireLe.getTime() <= maintenant ? "expire" : "valide",
    }));
  }

  async creer(
    userId: string,
    donnees: { libelle: string; typesAutorises?: string[] | undefined; joursValidite?: number | undefined },
  ) {
    const jeton = engendrerJetonAgent();
    const cree = await this.prisma.agentJeton.create({
      data: {
        userId,
        libelle: donnees.libelle,
        empreinte: empreinteJetonAgent(jeton),
        typesAutorises: donnees.typesAutorises ?? [],
        expireLe: new Date(Date.now() + (donnees.joursValidite ?? JOURS_VIE_JETON) * JOUR_MS),
      },
      select: { id: true, libelle: true, typesAutorises: true, creeLe: true, expireLe: true },
    });
    await this.audit.tracer({
      action: "agent_token.create",
      typeEntite: "AgentJeton",
      entiteId: cree.id,
      acteurId: userId,
      detail: { libelle: cree.libelle, typesAutorises: cree.typesAutorises },
    });
    // Le jeton en clair ne figure qu'ici. Il ne se relit plus jamais.
    return { ...cree, jeton };
  }

  /** `RG-AST-03` — la révocation prend effet à la requête suivante. */
  async revoquer(userId: string, id: string) {
    const jeton = await this.prisma.agentJeton.findFirst({ where: { id, userId }, select: { id: true, revoqueLe: true } });
    if (!jeton) throw refusAssistant(404, "jetonIntrouvable", "Ce jeton d'agent n'existe pas.");
    if (jeton.revoqueLe) return { id, revoqueLe: jeton.revoqueLe };
    const revoque = await this.prisma.agentJeton.update({
      where: { id },
      data: { revoqueLe: new Date() },
      select: { id: true, revoqueLe: true },
    });
    await this.audit.tracer({ action: "agent_token.revoke", typeEntite: "AgentJeton", entiteId: id, acteurId: userId });
    return revoque;
  }

  /** Un agent est joignable s'il a interrogé le guichet il y a moins d'une minute. */
  async agentJoignable(userId: string): Promise<{ joignable: boolean; dernierContact: Date | null }> {
    const dernier = await this.prisma.agentJeton.findFirst({
      where: { userId, revoqueLe: null, dernierUsage: { not: null } },
      orderBy: { dernierUsage: "desc" },
      select: { dernierUsage: true },
    });
    const date = dernier?.dernierUsage ?? null;
    return {
      joignable: date !== null && Date.now() - date.getTime() < SECONDES_AGENT_JOIGNABLE * 1000,
      dernierContact: date,
    };
  }

  /** Les propriétaires d'au moins un jeton valide : ceux que la planification sert. */
  async proprietairesAvecJetonValide(): Promise<string[]> {
    const lignes = await this.prisma.agentJeton.findMany({
      where: { revoqueLe: null, expireLe: { gt: new Date() }, user: { actif: true } },
      distinct: ["userId"],
      select: { userId: true },
    });
    return lignes.map((l) => l.userId);
  }
}
