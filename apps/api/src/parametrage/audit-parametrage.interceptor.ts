import {
  Injectable,
  SetMetadata,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { FastifyRequest } from "fastify";
import { mergeMap, type Observable } from "rxjs";
import { AuditService } from "../commun/audit.service.js";
import type { ContexteDemande } from "../commun/permissions.garde.js";
import {
  META_AUDIT_IMPORT_SCOLAIRE,
  type ResultatImportScolaire,
} from "./calendrier.service.js";

const CLE_AUDIT_PARAMETRAGE = "parametrage:audit";

type DeclarationAudit = {
  action: string;
  typeEntite: string;
};

/** Déclare une écriture M20 ; l'intercepteur est l'unique auteur de sa trace. */
export const TraceParametrage = (action: string, typeEntite: string) =>
  SetMetadata(CLE_AUDIT_PARAMETRAGE, { action, typeEntite } satisfies DeclarationAudit);

@Injectable()
export class IntercepteurAuditParametrage implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly audit: AuditService,
  ) {}

  intercept(contexte: ExecutionContext, suivant: CallHandler): Observable<unknown> {
    const declaration = this.reflector.get<DeclarationAudit>(
      CLE_AUDIT_PARAMETRAGE,
      contexte.getHandler(),
    );
    if (!declaration) return suivant.handle();

    const requete = contexte.switchToHttp().getRequest<FastifyRequest & {
      trame: ContexteDemande;
      params?: Record<string, string>;
      body?: Record<string, unknown>;
    }>();

    return suivant.handle().pipe(mergeMap(async (resultat: unknown) => {
      const resultatIdentifie = resultat as { id?: string } | undefined;
      const corps = requete.body ?? {};
      const entiteId = resultatIdentifie?.id ?? requete.params?.["id"] ??
        ([corps["anneeScolaire"], corps["zone"]].filter(Boolean).join(":") || undefined);
      const importScolaire = (resultat as ResultatImportScolaire | undefined)
        ?.[META_AUDIT_IMPORT_SCOLAIRE];
      const detail = importScolaire ?? (
        declaration.action === "holiday.update"
          ? {
              versionRecue: corps["version"],
              versionResultante: resultatIdentifie && "version" in resultatIdentifie
                ? (resultatIdentifie as { version: number }).version
                : undefined,
              ...(corps["ouvre"] === undefined ? {} : { ouvre: corps["ouvre"] }),
              ...(corps["recurrent"] === undefined ? {} : { recurrent: corps["recurrent"] }),
            }
          : undefined
      );
      await this.audit.tracer({
        action: declaration.action,
        typeEntite: declaration.typeEntite,
        acteurId: requete.trame.userId,
        ...(entiteId ? { entiteId } : {}),
        ...(detail ? { detail } : {}),
      });
      return resultat;
    }));
  }
}
