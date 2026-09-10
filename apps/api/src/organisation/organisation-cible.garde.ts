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
import { PrismaService } from "../prisma.service.js";

const CLE = "rationarium:cible-organisation";
type Niveau = "direction" | "departement" | "service";
type Regle = { niveau?: Niveau | "parametre"; creation?: Niveau; rattachements?: boolean };

/** Permission globale d'abord, cible organisationnelle ensuite. */
export const CibleOrganisation = (regle: Regle) =>
  applyDecorators(SetMetadata(CLE, regle), UseGuards(GardeCibleOrganisation));

@Injectable()
export class GardeCibleOrganisation implements CanActivate {
  constructor(private readonly reflector: Reflector, private readonly prisma: PrismaService) {}

  async canActivate(contexte: ExecutionContext) {
    const regle = this.reflector.get<Regle>(CLE, contexte.getHandler());
    const requete = contexte.switchToHttp().getRequest<{
      trame: ContexteDemande;
      params?: { id?: unknown; niveau?: unknown };
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
    const departements = [...d.perimetre.departements];

    const directionVisible = async (id: string) => Boolean(await this.prisma.direction.findFirst({
      where: { id, departements: { some: { id: { in: departements } } } },
      select: { id: true },
    }));

    if (regle.niveau) {
      const id = uuid(requete.params?.id);
      let niveau = regle.niveau;
      if (niveau === "parametre") {
        const resultat = z.enum(["departement", "service"]).safeParse(requete.params?.niveau);
        if (!resultat.success) throw new BadRequestException({ cle: "erreurs:donneesInvalides" });
        niveau = resultat.data;
      }
      const visible = niveau === "direction"
        ? await directionVisible(id)
        : niveau === "departement"
          ? d.perimetre.departements.has(id)
          : Boolean(await this.prisma.service.findFirst({
              where: { id, departementId: { in: departements } },
              select: { id: true },
            }));
      if (!visible) refuser();
    }

    const corps = requete.body ?? {};
    if (regle.creation === "direction") refuser();
    if (regle.creation === "departement") {
      const directionId = corps["directionId"];
      if (directionId === undefined || directionId === null || !await directionVisible(uuid(directionId))) refuser();
    }
    if (regle.creation === "service") {
      const departementId = uuid(corps["departementId"]);
      if (!d.perimetre.departements.has(departementId)) refuser();
    }

    if (regle.rattachements) {
      const directionId = corps["directionId"];
      if (directionId !== undefined && directionId !== null && !await directionVisible(uuid(directionId))) refuser();
      const responsableId = corps["responsableId"] ?? corps["managerId"];
      if (responsableId !== undefined && responsableId !== null) {
        const visible = await this.prisma.user.findFirst({
          where: { AND: [{ id: uuid(responsableId) }, { id: { in: [...d.perimetre.utilisateurs] } }] },
          select: { id: true },
        });
        if (!visible) refuser();
      }
    }
    return true;
  }
}
