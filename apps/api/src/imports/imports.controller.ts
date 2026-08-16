import { Body, Controller, Get, Header, Param, Post, Query, Res } from "@nestjs/common";
import type { FastifyReply } from "fastify";
import { z } from "zod";
import { ImportsService, TYPES_IMPORT } from "./imports.service.js";
import { Demande, RequiertPermission, type ContexteDemande } from "../commun/permissions.garde.js";
import { valider } from "../commun/http.js";

/**
 * M21 — imports et exports.
 *
 * **Deux points d'entrée par import, jamais un.** `apercu` ne touche à rien,
 * `executer` écrit : c'est `RG-IMP-03` rendu structurel. Un seul point d'entrée
 * avec un drapeau « simulation » aurait la même signature pour deux
 * comportements de nature opposée, et l'oubli du drapeau aurait des
 * conséquences irréversibles.
 */

const typeImport = z.enum(TYPES_IMPORT);
const corpsFichier = z.object({ contenu: z.string().min(1).max(20_000_000) });

@Controller("imports")
export class ImportsController {
  constructor(private readonly imports: ImportsService) {}

  /** `RG-IMP-02` — le modèle téléchargeable, avec sa ligne d'exemple. */
  @Get("modele")
  @RequiertPermission("tasks:import")
  @Header("Content-Type", "text/csv; charset=utf-8")
  modele(@Query("type") type: string, @Res() reponse: FastifyReply) {
    const t = valider(typeImport, type);
    return reponse
      .header("Content-Disposition", `attachment; filename="modele-${t}.csv"`)
      .send(this.imports.modele(t));
  }

  /** `RG-IMP-03` — la prévisualisation. **Aucune écriture.** */
  @Post("apercu")
  @RequiertPermission("tasks:import")
  apercu(@Query("type") type: string, @Body() corps: unknown) {
    const t = valider(typeImport, type);
    const { contenu } = valider(corpsFichier, corps);
    return this.imports.analyser(t, contenu);
  }

  @Post("utilisateurs")
  @RequiertPermission("users:import")
  importerUtilisateurs(@Body() corps: unknown, @Demande() d: ContexteDemande) {
    const { contenu } = valider(corpsFichier, corps);
    return this.imports.importerUtilisateurs(contenu, d.userId);
  }

  /** Les volumes que le mode Remplacer va supprimer, avant de le faire. */
  @Get("projet/:id/volumes")
  @RequiertPermission("tasks:import")
  volumes(@Param("id") id: string) {
    return this.imports.volumesRemplacement(id);
  }

  /** `RG-IMP-05`, `RG-IMP-06` — l'import projet complet. */
  @Post("projet/:id")
  @RequiertPermission("tasks:import")
  importerProjet(@Param("id") id: string, @Body() corps: unknown, @Demande() d: ContexteDemande) {
    const donnees = valider(
      corpsFichier.extend({ mode: z.enum(["ajouter", "remplacer"]).default("ajouter") }),
      corps,
    );
    return this.imports.importerProjet(id, donnees.contenu, donnees.mode, d.userId);
  }

  @Get("export/projet/:id/taches")
  @RequiertPermission("tasks:export")
  @Header("Content-Type", "text/csv; charset=utf-8")
  async exporterTaches(@Param("id") id: string, @Res() reponse: FastifyReply) {
    return reponse
      .header("Content-Disposition", `attachment; filename="taches-${id}.csv"`)
      .send(await this.imports.exporterTaches(id));
  }

  @Get("export/projet/:id/jalons")
  @RequiertPermission("tasks:export")
  @Header("Content-Type", "text/csv; charset=utf-8")
  async exporterJalons(@Param("id") id: string, @Res() reponse: FastifyReply) {
    return reponse
      .header("Content-Disposition", `attachment; filename="jalons-${id}.csv"`)
      .send(await this.imports.exporterJalons(id));
  }

  @Get("export/competences")
  @RequiertPermission("skills:export")
  @Header("Content-Type", "text/csv; charset=utf-8")
  async exporterCompetences(@Res() reponse: FastifyReply) {
    return reponse
      .header("Content-Disposition", 'attachment; filename="competences.csv"')
      .send(await this.imports.exporterCompetences());
  }
}
