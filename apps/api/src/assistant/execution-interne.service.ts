import { Injectable } from "@nestjs/common";
import { HttpAdapterHost } from "@nestjs/core";
import type { FastifyInstance } from "fastify";
import {
  ENTETE_TICKET_INTERNE,
  emettreTicketInterne,
  retirerTicketInterne,
} from "../commun/acces-agent.js";

export type ReponseInterne = { statut: number; corps: unknown };

export type AppelInterne = {
  methode: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  /** Chemin sans le préfixe global : `/taches`, `/projets/:id`… */
  chemin: string;
  corps?: unknown;
};

/**
 * Rejoue une route de l'API, dans le processus, au nom d'un utilisateur.
 *
 * C'est le cœur de `RG-AST-04` : une action de l'agent ne contourne rien. Elle
 * traverse la garde globale (permission, puis périmètre), les gardes de cible,
 * la validation du corps, le service et son audit, exactement comme la même
 * saisie faite dans l'interface. Une règle ajoutée demain à une route
 * s'appliquera à l'agent sans qu'on y pense.
 *
 * L'identité passe par un ticket à usage unique (`acces-agent.ts`), retiré dès
 * que la requête est servie, qu'elle réussisse ou non.
 */
@Injectable()
export class ExecutionInterneService {
  constructor(private readonly hote: HttpAdapterHost) {}

  async appeler(userId: string, appel: AppelInterne): Promise<ReponseInterne> {
    const fastify = this.hote.httpAdapter.getInstance<FastifyInstance>();
    const ticket = emettreTicketInterne(userId);
    try {
      const reponse = await fastify.inject({
        method: appel.methode,
        url: `/api${appel.chemin}`,
        headers: { [ENTETE_TICKET_INTERNE]: ticket },
        ...(appel.corps === undefined ? {} : { payload: appel.corps as Record<string, unknown> }),
      });
      let corps: unknown = null;
      if (reponse.body) {
        try {
          corps = JSON.parse(reponse.body);
        } catch {
          corps = reponse.body;
        }
      }
      return { statut: reponse.statusCode, corps };
    } finally {
      retirerTicketInterne(ticket);
    }
  }
}
