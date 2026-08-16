import { Controller, Get, Header, Query, Res } from "@nestjs/common";
import type { FastifyReply } from "fastify";
import { z } from "zod";
import { RapportsService, type Periode } from "./rapports.service.js";
import { Demande, RequiertPermission, type ContexteDemande } from "../commun/permissions.garde.js";
import { valider } from "../commun/http.js";

/**
 * M17 — rapports et analytics. Vue 30, et le Gantt de la vue 15.
 *
 * `RG-RPT-01` — tout passe par `reports:read`, et le périmètre est appliqué
 * dans le service. Un agrégat n'a pas l'air de divulguer, mais « 47 tâches en
 * retard » sur un portefeuille qu'on n'a pas le droit de voir en dit déjà trop.
 */

const filtres = z.object({
  periode: z.enum(["semaine", "mois", "trimestre", "annee"]).default("mois"),
  projets: z.string().optional(),
  responsables: z.string().optional(),
});

const listeDe = (valeur: string | undefined) =>
  valeur ? valeur.split(",").filter(Boolean) : undefined;

@Controller("rapports")
export class RapportsController {
  constructor(private readonly rapports: RapportsService) {}

  /** `EX-RPT-04` à `EX-RPT-12` — tous les modules d'analyse, en un appel. */
  @Get()
  @RequiertPermission("reports:read")
  vueEnsemble(@Demande() d: ContexteDemande, @Query() requete: unknown) {
    const q = valider(filtres, requete);
    return this.rapports.vueEnsemble(
      lire(q),
      d.perimetre,
      d.permissions,
      new Date(),
    );
  }

  /** `EX-RPT-11` — le Gantt portefeuille. */
  @Get("gantt")
  @RequiertPermission("reports:read")
  gantt(@Demande() d: ContexteDemande, @Query() requete: unknown) {
    const q = valider(filtres, requete);
    return this.rapports.gantt(lire(q), d.perimetre, d.permissions, new Date());
  }

  /**
   * `EX-RPT-03` — l'export.
   *
   * Le type MIME et le nom de fichier sont posés par la réponse : servi en
   * JSON, un CSV s'ouvre dans un éditeur de texte au lieu du tableur, et
   * l'utilisateur conclut que la fonction ne marche pas.
   */
  @Get("export")
  @RequiertPermission("reports:export")
  @Header("Cache-Control", "no-store")
  async exporter(
    @Demande() d: ContexteDemande,
    @Query() requete: unknown,
    @Res() reponse: FastifyReply,
  ) {
    const q = valider(filtres.extend({ format: z.enum(["json", "csv"]).default("csv") }), requete);
    const fichier = await this.rapports.exporter(
      q.format,
      lire(q),
      d.perimetre,
      d.permissions,
      new Date(),
      d.userId,
    );
    return reponse
      .header("Content-Type", fichier.type)
      .header("Content-Disposition", `attachment; filename="${fichier.nom}"`)
      .send(fichier.contenu);
  }
}

function lire(q: {
  periode: Periode;
  projets?: string | undefined;
  responsables?: string | undefined;
}) {
  return {
    periode: q.periode,
    ...(listeDe(q.projets) ? { projets: listeDe(q.projets)! } : {}),
    ...(listeDe(q.responsables) ? { responsables: listeDe(q.responsables)! } : {}),
  };
}
