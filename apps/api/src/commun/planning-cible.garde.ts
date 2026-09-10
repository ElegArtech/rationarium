import { applyDecorators, BadRequestException, ForbiddenException, Injectable, SetMetadata, UseGuards, type CanActivate, type ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { z } from "zod";
import { PrismaService } from "../prisma.service.js";
import { PerimetreService } from "./perimetre.service.js";
import type { ContexteDemande } from "./permissions.garde.js";

const CLE = "rationarium:cibles-planning";
type Mode = "evenement" | "activite" | "realisation" | "deplacement";
export const CiblesPlanning = (mode: Mode) => applyDecorators(SetMetadata(CLE, mode), UseGuards(GardeCiblesPlanning));

/** RG-SCOPE-02 : la garde globale a vérifié la permission avant toute cible. */
@Injectable()
export class GardeCiblesPlanning implements CanActivate {
  constructor(private readonly reflector: Reflector, private readonly prisma: PrismaService, private readonly perimetres: PerimetreService) {}

  async canActivate(contexte: ExecutionContext) {
    const mode = this.reflector.get<Mode>(CLE, contexte.getHandler());
    const req = contexte.switchToHttp().getRequest<{ trame: ContexteDemande; body?: Record<string, unknown>; params?: { id?: string } }>();
    const d = req.trame;
    const b = req.body ?? {};
    const uuid = (v: unknown) => {
      const r = z.uuid().safeParse(v);
      if (!r.success) throw new BadRequestException({ cle: "erreurs:donneesInvalides" });
      return r.data;
    };
    const liste = (v: unknown) => {
      if (v === undefined) return [];
      if (!Array.isArray(v)) throw new BadRequestException({ cle: "erreurs:donneesInvalides" });
      return v.map(uuid);
    };
    const refuser = () => { throw new ForbiddenException({ cle: "erreurs:horsPerimetre" }); };
    const ids = mode === "activite" ? liste(b["userIds"]) : mode === "evenement" ? liste(b["participantIds"]) : [];
    if (mode === "evenement" && b["userId"] !== undefined) ids.push(uuid(b["userId"]));
    if (mode === "deplacement") {
      for (const champ of ["nouvelAssigneId", "ancienAssigneId"]) if (b[champ] !== undefined) ids.push(uuid(b[champ]));
      const t = await this.prisma.task.findFirst({ where: { AND: [{ id: uuid(req.params?.id ?? b["taskId"]) }, this.perimetres.filtreTache(d.perimetre, d.permissions)] }, select: { id: true } });
      if (!t) refuser();
    }
    if (mode === "realisation") {
      const a = await this.prisma.predefinedTaskAssignment.findUnique({ where: { id: uuid(b["assignationId"]) }, select: { userId: true } });
      if (!a) refuser();
      if (a) ids.push(a.userId);
    }
    if (mode === "evenement") {
      const services = liste(b["serviceIds"]);
      if (services.length) {
        const visibles = await this.prisma.service.count({ where: { id: { in: [...new Set(services)] }, ...(d.perimetre.global ? {} : { departementId: { in: [...d.perimetre.departements] } }) } });
        if (visibles !== new Set(services).size) refuser();
        const membres = await this.prisma.userService.findMany({ where: { serviceId: { in: services }, user: { actif: true } }, select: { userId: true } });
        ids.push(...membres.map((m) => m.userId));
      }
      if (b["projectId"] !== undefined && b["projectId"] !== null) {
        const p = await this.prisma.project.findFirst({ where: { AND: [{ id: uuid(b["projectId"]) }, this.perimetres.filtreProjet(d.perimetre, d.permissions)] }, select: { id: true } });
        if (!p) refuser();
      }
    }
    if (ids.length) {
      const visibles = await this.prisma.user.count({ where: { AND: [{ id: { in: [...new Set(ids)] }, actif: true }, this.perimetres.filtreUtilisateur(d.perimetre)] } });
      if (visibles !== new Set(ids).size) refuser();
    }
    return true;
  }
}
