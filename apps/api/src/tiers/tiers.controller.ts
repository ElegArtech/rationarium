import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { z } from "zod";
import { enumDe, TYPES_TIERS } from "@rationarium/contracts";
import { TiersService } from "./tiers.service.js";
import { Demande, RequiertPermission, type ContexteDemande } from "../commun/permissions.garde.js";
import { valider } from "../commun/http.js";

/** M14 — tiers et clients. Vues 23 à 26. */

const contact = {
  contactNom: z.string().max(120).nullish(),
  contactEmail: z.email().nullish(),
  contactTelephone: z.string().max(40).nullish(),
  notes: z.string().max(5000).optional(),
};

@Controller("tiers")
export class TiersController {
  constructor(private readonly tiers: TiersService) {}

  @Get()
  @RequiertPermission("third_parties:read")
  lister(@Query() requete: unknown) {
    const filtres = valider(
      z.object({
        recherche: z.string().max(120).optional(),
        type: enumDe(TYPES_TIERS).optional(),
        archive: z.stringbool().optional(),
      }),
      requete,
    );
    return this.tiers.listerTiers(filtres);
  }

  @Get(":id")
  @RequiertPermission("third_parties:read")
  fiche(@Param("id") id: string) {
    return this.tiers.ficheTiers(id);
  }

  @Get(":id/impact")
  @RequiertPermission("third_parties:delete")
  impact(@Param("id") id: string) {
    return this.tiers.impactSuppressionTiers(id);
  }

  @Post()
  @RequiertPermission("third_parties:create")
  creer(@Body() corps: unknown, @Demande() d: ContexteDemande) {
    const donnees = valider(
      z.object({
        type: enumDe(TYPES_TIERS),
        organisation: z.string().max(160).nullish(),
        ...contact,
      }),
      corps,
    );
    return this.tiers.creerTiers(donnees, d.userId);
  }

  /**
   * `EX-TRS-02` — modifier un tiers, ou l'archiver.
   *
   * Corriger un numéro de téléphone imposait jusqu'ici de SUPPRIMER le tiers —
   * donc de rompre ses rattachements de projet et de perdre le temps déclaré
   * pour lui.
   */
  @Patch(":id")
  @RequiertPermission("third_parties:update")
  modifier(@Param("id") id: string, @Body() corps: unknown, @Demande() d: ContexteDemande) {
    const donnees = valider(
      z.object({
        type: enumDe(TYPES_TIERS).optional(),
        organisation: z.string().max(160).nullish(),
        actif: z.boolean().optional(),
        ...contact,
      }),
      corps,
    );
    return this.tiers.modifierTiers(id, donnees, d.userId);
  }

  @Delete(":id")
  @RequiertPermission("third_parties:delete")
  supprimer(@Param("id") id: string, @Demande() d: ContexteDemande) {
    return this.tiers.supprimerTiers(id, d.userId);
  }

  @Post("projets/:projectId/rattacher")
  @RequiertPermission("third_parties:assign")
  rattacher(
    @Param("projectId") projectId: string,
    @Body() corps: unknown,
    @Demande() d: ContexteDemande,
  ) {
    const { thirdPartyId } = valider(z.object({ thirdPartyId: z.uuid() }), corps);
    return this.tiers.rattacherAuProjet(projectId, thirdPartyId, d.userId);
  }

  /**
   * `RG-TRS-05` — un tiers ne s'assigne à une tâche que s'il est rattaché au
   * projet de cette tâche.
   *
   * Le contrôle est au service : assigner d'abord et rattacher ensuite
   * laisserait une intervention extérieure sur un projet qui l'ignore.
   */
  /** `EX-TRS-02` — les tiers qu'on peut encore assigner à cette tâche. */
  @Get("taches/:taskId/candidats")
  @RequiertPermission("third_parties:assign")
  candidatsPourTache(@Param("taskId") taskId: string) {
    return this.tiers.candidatsPourTache(taskId);
  }

  @Post("taches/:taskId/assigner")
  @RequiertPermission("third_parties:assign")
  assignerALaTache(
    @Param("taskId") taskId: string,
    @Body() corps: unknown,
    @Demande() d: ContexteDemande,
  ) {
    const { thirdPartyId } = valider(z.object({ thirdPartyId: z.uuid() }), corps);
    return this.tiers.assignerALaTache(taskId, thirdPartyId, d.userId);
  }
}

@Controller("clients")
export class ClientsController {
  constructor(private readonly tiers: TiersService) {}

  @Get()
  @RequiertPermission("clients:read")
  lister(@Query() requete: unknown) {
    const filtres = valider(
      z.object({
        recherche: z.string().max(120).optional(),
        actif: z.stringbool().optional(),
      }),
      requete,
    );
    return this.tiers.listerClients(filtres);
  }

  @Get(":id")
  @RequiertPermission("clients:read")
  fiche(@Param("id") id: string) {
    return this.tiers.ficheClient(id);
  }

  @Get(":id/impact")
  @RequiertPermission("clients:delete")
  impact(@Param("id") id: string) {
    return this.tiers.impactSuppressionClient(id);
  }

  @Post()
  @RequiertPermission("clients:create")
  creer(@Body() corps: unknown, @Demande() d: ContexteDemande) {
    const donnees = valider(
      z.object({
        nom: z.string().min(1).max(160),
        adresse: z.string().max(500).nullish(),
        ...contact,
      }),
      corps,
    );
    return this.tiers.creerClient(donnees, d.userId);
  }

  /**
   * `EX-CLI-02` — modifier un client, ou le rendre inactif.
   *
   * Corriger une adresse imposait jusqu'ici de supprimer le client, donc de
   * détacher les projets qui lui sont rattachés. L'inactivité est réversible
   * et n'efface rien.
   */
  @Patch(":id")
  @RequiertPermission("clients:update")
  modifierClient(@Param("id") id: string, @Body() corps: unknown, @Demande() d: ContexteDemande) {
    const donnees = valider(
      z.object({
        nom: z.string().min(1).max(160).optional(),
        adresse: z.string().max(300).nullish(),
        actif: z.boolean().optional(),
        ...contact,
      }),
      corps,
    );
    return this.tiers.modifierClient(id, donnees, d.userId);
  }

  @Delete(":id")
  @RequiertPermission("clients:delete")
  supprimer(@Param("id") id: string, @Demande() d: ContexteDemande) {
    return this.tiers.supprimerClient(id, d.userId);
  }

  /**
   * Les clients d'un projet, **remplacés en bloc**.
   *
   * La fiche projet édite la liste entière et l'enregistre d'un geste ; une
   * écriture incrémentale exposerait un état intermédiaire sans client.
   */
  @Post("projets/:projectId")
  @RequiertPermission("clients:update")
  rattacher(
    @Param("projectId") projectId: string,
    @Body() corps: unknown,
    @Demande() d: ContexteDemande,
  ) {
    const { clientIds } = valider(
      z.object({ clientIds: z.array(z.uuid()).max(50) }),
      corps,
    );
    return this.tiers.rattacherClients(projectId, clientIds, d.userId);
  }
}
