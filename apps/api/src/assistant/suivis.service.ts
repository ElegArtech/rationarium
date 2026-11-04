import { Injectable } from "@nestjs/common";
import { planSuiviSchema, type PlanSuivi } from "@rationarium/contracts";
import { PrismaService } from "../prisma.service.js";
import { AuditService } from "../commun/audit.service.js";
import { PerimetreService, type Perimetre } from "../commun/perimetre.service.js";
import { exigerPorteurDuProjet } from "../projets/projets.service.js";
import { refusAssistant } from "./erreurs.js";

const PLAN_VIDE = { consigne: null, sources: [], silenceJours: null, actif: false, version: 0 };

/**
 * `EX-AST-03` — le plan de suivi d'un projet.
 *
 * Le lire exige de voir le projet ; le modifier exige de le porter
 * (`RG-PRJ-13`) : c'est la même condition que pour modifier le projet, parce
 * que le plan décide de ce que l'agent écrira dans ce projet.
 */
@Injectable()
export class SuivisService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly perimetres: PerimetreService,
  ) {}

  async lire(projectId: string, perimetre: Perimetre, permissions: ReadonlySet<string>) {
    const visible = await this.prisma.project.findFirst({
      where: { id: projectId, ...this.perimetres.filtreProjet(perimetre, permissions) },
      select: { id: true },
    });
    if (!visible) throw refusAssistant(404, "projetIntrouvable", "Ce projet est introuvable ou hors de votre périmètre.");
    const plan = await this.prisma.projetSuivi.findUnique({
      where: { projectId },
      select: { consigne: true, sources: true, silenceJours: true, actif: true, version: true },
    });
    return { projectId, ...(plan ?? PLAN_VIDE) };
  }

  /**
   * Crée ou remplace le plan. `version` est exigée dès qu'un plan existe
   * (`RG-GEN-07`) : deux personnes qui règlent le même plan ne s'écrasent pas.
   */
  async ecrire(
    projectId: string,
    donnees: PlanSuivi & { version?: number | undefined },
    acteurId: string,
    permissions: ReadonlySet<string>,
  ) {
    await exigerPorteurDuProjet(this.prisma, projectId, acteurId, permissions);
    const plan = planSuiviSchema.parse({
      consigne: donnees.consigne,
      sources: donnees.sources,
      silenceJours: donnees.silenceJours,
      actif: donnees.actif,
    });
    const existant = await this.prisma.projetSuivi.findUnique({ where: { projectId }, select: { version: true } });

    if (existant) {
      if (donnees.version === undefined || donnees.version !== existant.version) {
        throw refusAssistant(409, "conflitVersion", "Le plan de suivi a été modifié entre-temps. Rechargez-le avant de l'enregistrer.", {
          versionActuelle: existant.version,
        });
      }
      const maj = await this.prisma.projetSuivi.updateMany({
        where: { projectId, version: existant.version },
        data: {
          ...(plan.consigne !== undefined ? { consigne: plan.consigne } : {}),
          ...(plan.sources !== undefined ? { sources: plan.sources } : {}),
          ...(plan.silenceJours !== undefined ? { silenceJours: plan.silenceJours } : {}),
          ...(plan.actif !== undefined ? { actif: plan.actif } : {}),
          version: { increment: 1 },
        },
      });
      if (maj.count === 0) {
        throw refusAssistant(409, "conflitVersion", "Le plan de suivi a été modifié entre-temps. Rechargez-le avant de l'enregistrer.");
      }
    } else {
      await this.prisma.projetSuivi.create({
        data: {
          projectId,
          consigne: plan.consigne ?? null,
          sources: plan.sources ?? [],
          silenceJours: plan.silenceJours ?? null,
          actif: plan.actif ?? true,
        },
      });
    }

    await this.audit.tracer({
      action: "project_followup.update",
      typeEntite: "ProjetSuivi",
      entiteId: projectId,
      acteurId,
      detail: { plan },
    });
    const ecrit = await this.prisma.projetSuivi.findUniqueOrThrow({
      where: { projectId },
      select: { consigne: true, sources: true, silenceJours: true, actif: true, version: true },
    });
    return { projectId, ...ecrit };
  }
}
