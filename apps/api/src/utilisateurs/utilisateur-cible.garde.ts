import {
  applyDecorators,
  BadRequestException,
  ForbiddenException,
  Injectable,
  SetMetadata,
  UseGuards,
  type CanActivate,
  type ExecutionContext,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { z } from "zod";
import type { ContexteDemande } from "../commun/permissions.garde.js";
import { PerimetreService } from "../commun/perimetre.service.js";
import { PrismaService } from "../prisma.service.js";

const CLE = "rationarium:cible-utilisateur";
type Regle = { cible?: boolean; rattachements?: boolean; creation?: boolean };

/** La garde globale contrôle d'abord la permission ; celle-ci borne ensuite les cibles utilisateur. */
export const CibleUtilisateur = (regle: Regle) =>
  applyDecorators(SetMetadata(CLE, regle), UseGuards(GardeCibleUtilisateur));

@Injectable()
export class GardeCibleUtilisateur implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
    private readonly perimetres: PerimetreService,
  ) {}

  async canActivate(contexte: ExecutionContext) {
    const regle = this.reflector.get<Regle>(CLE, contexte.getHandler());
    const requete = contexte.switchToHttp().getRequest<{
      trame: ContexteDemande;
      params?: { id?: unknown };
      body?: Record<string, unknown>;
    }>();
    const d = requete.trame;
    if (d.perimetre.global) return true;

    const uuid = (valeur: unknown) => {
      const resultat = z.uuid().safeParse(valeur);
      if (!resultat.success) throw new BadRequestException({ cle: "erreurs:donneesInvalides" });
      return resultat.data;
    };
    const refuser = () => { throw new ForbiddenException({ cle: "erreurs:horsPerimetre" }); };

    if (regle.cible) {
      const id = uuid(requete.params?.id);
      const visible = await this.prisma.user.findFirst({
        where: { AND: [{ id }, this.perimetres.filtreUtilisateur(d.perimetre)] },
        select: { id: true },
      });
      if (!visible) refuser();
    }

    if (regle.rattachements) {
      const corps = requete.body ?? {};
      const departementBrut = corps["departementId"];
      const servicesBruts = corps["serviceIds"];
      const departementId = departementBrut === undefined || departementBrut === null
        ? null
        : uuid(departementBrut);
      if (servicesBruts !== undefined && !Array.isArray(servicesBruts)) {
        throw new BadRequestException({ cle: "erreurs:donneesInvalides" });
      }
      const serviceIds = (servicesBruts ?? []).map(uuid);

      if (regle.creation && departementId === null && serviceIds.length === 0) refuser();
      if (departementId && !d.perimetre.departements.has(departementId)) refuser();
      if (serviceIds.length > 0) {
        const trouves = await this.prisma.service.count({
          where: {
            id: { in: [...new Set(serviceIds)] },
            departementId: { in: [...d.perimetre.departements] },
          },
        });
        if (trouves !== new Set(serviceIds).size) refuser();
      }
    }
    return true;
  }
}
