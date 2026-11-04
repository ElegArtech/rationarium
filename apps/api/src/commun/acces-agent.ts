import { createHash, randomBytes } from "node:crypto";
import type { PrismaService } from "../prisma.service.js";
import type { AuditService } from "./audit.service.js";

/**
 * M22 — les deux accès d'un agent de suivi.
 *
 * **Le jeton d'agent** (`RG-AST-02`). Il n'ouvre que les routes du guichet,
 * marquées `@Guichet()`, et y agit pour son propriétaire. Seule son empreinte
 * est en base ; le jeton lui-même n'est montré qu'à sa création.
 *
 * **L'appel interne.** Une action de l'agent n'a pas d'écriture à elle : elle
 * rejoue la route existante (`POST /taches`, `PATCH /projets/:id`…), dans le
 * même processus, avec l'identité du propriétaire. Les gardes, la validation,
 * le périmètre, les règles métier et l'audit sont donc exactement ceux d'une
 * saisie directe — c'est ce que la spécification promet, et c'est la seule
 * façon de le tenir sans recopier la logique de chaque route.
 *
 * L'identité de l'appel interne passe par un **ticket** : 256 bits tirés au
 * hasard, rangés dans cette mémoire le temps d'une seule requête, et retirés
 * dès qu'elle est servie. Un ticket ne quitte jamais le processus ; un en-tête
 * forgé de l'extérieur ne correspond à aucun ticket et la garde l'ignore.
 */

export const PREFIXE_JETON_AGENT = "rat_";
export const ENTETE_TICKET_INTERNE = "x-rationarium-interne";

export const engendrerJetonAgent = (): string =>
  PREFIXE_JETON_AGENT + randomBytes(32).toString("base64url");

export const empreinteJetonAgent = (jeton: string): string =>
  createHash("sha256").update(jeton).digest("hex");

export type AgentResolu = {
  readonly jetonId: string;
  readonly userId: string;
  readonly motDePasseAChanger: boolean;
  /** Vide : tous les types d'action (`RG-AST-05`). */
  readonly typesAutorises: readonly string[];
};

/**
 * Le dernier usage d'un jeton sert de témoin « agent joignable ». Il est écrit
 * au plus toutes les quinze secondes : l'attente longue d'un agent interroge le
 * guichet en continu, et une écriture par requête ne dirait rien de plus.
 */
const INTERVALLE_DERNIER_USAGE_MS = 15_000;

/** `RG-AST-02`, `RG-AST-03` — résout l'en-tête `Authorization: Bearer <jeton>`. */
export async function resoudreJetonAgent(
  prisma: PrismaService,
  audit: AuditService,
  entete: string | undefined,
): Promise<AgentResolu | null> {
  if (!entete?.startsWith("Bearer ")) return null;
  const jeton = entete.slice("Bearer ".length).trim();
  if (!jeton.startsWith(PREFIXE_JETON_AGENT) || jeton.length > 200) return null;

  const trouve = await prisma.agentJeton.findUnique({
    where: { empreinte: empreinteJetonAgent(jeton) },
    select: {
      id: true,
      userId: true,
      typesAutorises: true,
      expireLe: true,
      revoqueLe: true,
      dernierUsage: true,
      user: { select: { actif: true, motDePasseAChanger: true } },
    },
  });
  if (!trouve) return null;

  const maintenant = new Date();
  const motif = trouve.revoqueLe
    ? "revoque"
    : trouve.expireLe <= maintenant
      ? "expire"
      : !trouve.user.actif
        ? "proprietaire_inactif"
        : null;
  if (motif) {
    await audit.tracer({
      action: "agent_token.refused",
      typeEntite: "AgentJeton",
      entiteId: trouve.id,
      acteurId: trouve.userId,
      detail: { motif },
    });
    return null;
  }

  if (
    !trouve.dernierUsage ||
    maintenant.getTime() - trouve.dernierUsage.getTime() > INTERVALLE_DERNIER_USAGE_MS
  ) {
    await prisma.agentJeton.update({ where: { id: trouve.id }, data: { dernierUsage: maintenant } });
  }

  return {
    jetonId: trouve.id,
    userId: trouve.userId,
    motDePasseAChanger: trouve.user.motDePasseAChanger,
    typesAutorises: trouve.typesAutorises,
  };
}

// ── Tickets des appels internes ─────────────────────────────────────────────

const tickets = new Map<string, { userId: string; expire: number }>();

/** La durée de vie d'un ticket : celle d'une requête, avec de la marge. */
const DUREE_TICKET_MS = 60_000;

/** Émet un ticket pour un seul appel interne au nom de `userId`. */
export function emettreTicketInterne(userId: string): string {
  const ticket = randomBytes(32).toString("base64url");
  tickets.set(ticket, { userId, expire: Date.now() + DUREE_TICKET_MS });
  return ticket;
}

/** Retire un ticket. L'appelant le fait dès que la requête est servie. */
export function retirerTicketInterne(ticket: string): void {
  tickets.delete(ticket);
}

/** L'identité portée par un ticket valide, ou `null`. */
export function identiteDuTicket(valeur: string | string[] | undefined): string | null {
  if (typeof valeur !== "string") return null;
  const trouve = tickets.get(valeur);
  if (!trouve) return null;
  if (trouve.expire < Date.now()) {
    tickets.delete(valeur);
    return null;
  }
  return trouve.userId;
}
