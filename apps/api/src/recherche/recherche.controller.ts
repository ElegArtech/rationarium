import { Controller, Get, Query } from "@nestjs/common";
import { z } from "zod";
import { Demande, RequiertUnePermissionParmi, type ContexteDemande } from "../commun/permissions.garde.js";
import { valider } from "../commun/http.js";
import { RechercheService } from "./recherche.service.js";

@Controller("recherche")
export class RechercheController {
  constructor(private readonly recherche: RechercheService) {}

  /** D-RM-07 — permission d'abord, puis prédicats de périmètre dans le service. */
  @Get()
  @RequiertUnePermissionParmi("projects:read", "tasks:read")
  rechercher(@Query() requete: unknown, @Demande() demande: ContexteDemande) {
    const { terme } = valider(
      z.object({
        // D-RM-07 : une saisie vide ne lance pas de recherche. La borne haute
        // suit les autres recherches textuelles du serveur.
        terme: z.string().trim().min(1, "Saisissez un terme à rechercher.").max(120),
      }).strict(),
      requete,
    );
    return this.recherche.rechercher(terme, demande.perimetre, demande.permissions);
  }
}
