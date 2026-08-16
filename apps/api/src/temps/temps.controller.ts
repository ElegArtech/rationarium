import { Body, Controller, Delete, Get, Param, Post, Query } from "@nestjs/common";
import { z } from "zod";
import { enumDe, TYPES_ACTIVITE } from "@trame/contracts";
import { TempsService } from "./temps.service.js";
import { Demande, RequiertPermission, type ContexteDemande } from "../commun/permissions.garde.js";
import { valider, dateSchema } from "../commun/http.js";

/** M12 — temps passé : saisie, plafond, rapports. Vue 21. */

@Controller("temps")
export class TempsController {
  constructor(private readonly temps: TempsService) {}

  @Get()
  @RequiertPermission("time_tracking:read")
  lister(@Demande() d: ContexteDemande, @Query() requete: unknown) {
    const filtres = valider(
      z.object({
        userId: z.uuid().optional(),
        projectId: z.uuid().optional(),
        debut: dateSchema.optional(),
        fin: dateSchema.optional(),
      }),
      requete,
    );
    return this.temps.lister(d.perimetre, d.permissions, filtres);
  }

  /** `EX-TMP-07` — l'agrégat par agent, par projet ou par type d'activité. */
  @Get("rapport")
  @RequiertPermission("time_tracking:read_team")
  rapport(@Demande() d: ContexteDemande, @Query() requete: unknown) {
    const q = valider(
      z.object({
        axe: z.enum(["agent", "projet", "type"]),
        debut: dateSchema,
        fin: dateSchema,
      }),
      requete,
    );
    return this.temps.rapport(d.perimetre, q.axe, { debut: q.debut, fin: q.fin });
  }

  /** `EX-TMP-06` — les tâches terminées sans temps déclaré ni renoncement. */
  @Get("non-declarees")
  @RequiertPermission("time_tracking:read")
  nonDeclarees(@Demande() d: ContexteDemande) {
    return this.temps.tachesNonDeclarees(d.userId);
  }

  /**
   * `RG-TMP-07` — ce qui a déjà été déclaré sur la tâche, **tous
   * contributeurs confondus**.
   *
   * C'est le « tous confondus » qui compte : savoir que quelqu'un d'autre a
   * déjà déclaré évite les doubles saisies sur une tâche partagée.
   */
  @Get("contexte/:taskId")
  @RequiertPermission("time_tracking:read")
  contexte(@Param("taskId") taskId: string) {
    return this.temps.contexteSaisieRapide(taskId);
  }

  @Post()
  @RequiertPermission("time_tracking:create")
  saisir(@Body() corps: unknown, @Demande() d: ContexteDemande) {
    const donnees = valider(
      z.object({
        userId: z.uuid().nullish(),
        thirdPartyId: z.uuid().nullish(),
        date: dateSchema,
        heures: z.number().positive().max(24),
        typeActivite: enumDe(TYPES_ACTIVITE).optional(),
        projectId: z.uuid().nullish(),
        taskId: z.uuid().nullish(),
        description: z.string().max(2000).optional(),
      }),
      corps,
    );
    // Sans acteur nommé, la saisie est la sienne. Le service refusera si les
    // deux acteurs sont donnés, ou aucun.
    const acteurDonne = donnees.userId ?? donnees.thirdPartyId;
    return this.temps.saisir(acteurDonne ? donnees : { ...donnees, userId: d.userId }, d.userId);
  }

  @Delete(":id")
  @RequiertPermission("time_tracking:delete")
  supprimer(@Param("id") id: string, @Demande() d: ContexteDemande) {
    return this.temps.supprimer(id, d.userId);
  }

  /**
   * `RG-TMP-06` — clore une tâche terminée en déclarant qu'il n'y a **rien à
   * déclarer**.
   *
   * La validation est enregistrée, et c'est tout l'objet du point d'entrée :
   * sans elle, la tâche ressortirait indéfiniment dans la liste des oublis et
   * la liste finirait ignorée.
   */
  @Post("renoncement/:taskId")
  @RequiertPermission("time_tracking:validate_without_entry")
  renoncer(@Param("taskId") taskId: string, @Demande() d: ContexteDemande) {
    return this.temps.validerSansDeclaration(taskId, d.userId, d.userId);
  }
}
