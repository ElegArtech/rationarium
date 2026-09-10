import { applyDecorators, BadRequestException, ForbiddenException, Injectable, SetMetadata, UseGuards, type CanActivate, type ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { ContexteDemande } from "./permissions.garde.js";
import { PrismaService } from "../prisma.service.js";
import { PerimetreService } from "./perimetre.service.js";

const CLE = "rationarium:cible-rh";
type RegleCible = {
  source: "query" | "body" | "regle" | "delegation" | "conge" | "temps";
  champ?: string;
  autrui: string[];
  ressources?: boolean;
  limiterPersonnel?: boolean;
};
export const CibleRH = (regle: RegleCible) => applyDecorators(SetMetadata(CLE, regle), UseGuards(GardeCibleRH));

/** RG-TLT-07, RG-CNG-15, RG-TMP-04/05 : permission dédiée puis cible active dans le périmètre. */
@Injectable()
export class GardeCibleRH implements CanActivate {
  constructor(private readonly reflector: Reflector, private readonly prisma: PrismaService, private readonly perimetres: PerimetreService) {}

  async canActivate(contexte: ExecutionContext) {
    const regle = this.reflector.get<RegleCible>(CLE, contexte.getHandler());
    const requete = contexte.switchToHttp().getRequest<{ trame: ContexteDemande; query: Record<string, unknown>; body?: Record<string, unknown>; params: { id?: string; taskId?: string } }>();
    const d = requete.trame;
    if (regle.limiterPersonnel && !regle.autrui.some((p) => d.permissions.has(p))) {
      const query = requete.query;
      if (query["aValider"] === "true") throw new ForbiddenException({ cle: "commun:droits.permissionRequise" });
      if (query["userId"] === undefined) query["userId"] = d.userId;
    }
    const entree = regle.source === "query" ? requete.query : requete.body ?? {};
    const id = requete.params.id ?? "";
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    for (const valeur of [requete.params.id, requete.params.taskId, entree["userId"], entree["delegantId"], entree["taskId"], entree["projectId"], entree["thirdPartyId"]]) {
      if (valeur !== undefined && valeur !== null && (typeof valeur !== "string" || !uuid.test(valeur))) throw new BadRequestException({ cle: "erreurs:donneesInvalides" });
    }
    let cible = entree[regle.champ ?? "userId"];
    if (regle.source === "regle") cible = (await this.prisma.teleworkRule.findUnique({ where: { id }, select: { userId: true } }))?.userId;
    if (regle.source === "delegation") cible = (await this.prisma.leaveDelegation.findUnique({ where: { id }, select: { delegantId: true } }))?.delegantId;
    if (regle.source === "conge") cible = (await this.prisma.leave.findUnique({ where: { id }, select: { userId: true } }))?.userId;
    if (regle.source === "temps") {
      const saisie = await this.prisma.timeEntry.findUnique({ where: { id }, select: { creeParId: true, userId: true } });
      cible = saisie?.creeParId ?? saisie?.userId;
    }
    if (typeof cible === "string" && cible !== d.userId) {
      if (!regle.autrui.some((p) => d.permissions.has(p))) throw new ForbiddenException({ cle: "commun:droits.permissionRequise" });
      const autorise = await this.prisma.user.findFirst({ where: { AND: [{ id: cible, actif: true }, this.perimetres.filtreUtilisateur(d.perimetre)] }, select: { id: true } });
      if (!autorise) throw new ForbiddenException({ cle: "erreurs:horsPerimetre" });
    }
    if (regle.ressources) {
      const thirdPartyId = entree["thirdPartyId"];
      if (thirdPartyId && !regle.autrui.some((p) => d.permissions.has(p))) throw new ForbiddenException({ cle: "commun:droits.permissionRequise" });
      const taskId = requete.params.taskId ?? entree["taskId"];
      const projectId = entree["projectId"];
      if (typeof taskId === "string") {
        const tache = await this.prisma.task.findFirst({ where: { AND: [{ id: taskId }, this.perimetres.filtreTache(d.perimetre, d.permissions)] }, select: { id: true } });
        if (!tache) throw new ForbiddenException({ cle: "erreurs:horsPerimetre" });
      }
      if (typeof projectId === "string") {
        const projet = await this.prisma.project.findFirst({ where: { AND: [{ id: projectId }, this.perimetres.filtreProjet(d.perimetre, d.permissions)] }, select: { id: true } });
        if (!projet) throw new ForbiddenException({ cle: "erreurs:horsPerimetre" });
      }
      if (typeof thirdPartyId === "string") {
        const lien = await this.prisma.projectThirdParty.findFirst({ where: { thirdPartyId, project: this.perimetres.filtreProjet(d.perimetre, d.permissions) }, select: { thirdPartyId: true } });
        if (!lien) throw new ForbiddenException({ cle: "erreurs:horsPerimetre" });
      }
    }
    return true;
  }
}
