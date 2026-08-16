import { Body, Controller, Delete, Get, Param, Patch, Post } from "@nestjs/common";
import { z } from "zod";
import { OrganisationService } from "./organisation.service.js";
import { Demande, RequiertPermission, type ContexteDemande } from "../commun/permissions.garde.js";
import { valider } from "../commun/http.js";

/** M2 — structure organisationnelle. Vue 29. */

const identite = z.object({
  nom: z.string().min(1).max(120),
  description: z.string().max(2000).optional(),
});

@Controller("organisation")
export class OrganisationController {
  constructor(private readonly organisation: OrganisationService) {}

  /**
   * `EX-ORG-01` — l'arborescence complète, bornée au périmètre.
   *
   * Le périmètre est passé au service, pas appliqué après coup : filtrer le
   * résultat côté contrôleur laisserait la requête ramener ce que l'appelant
   * n'a pas le droit de voir.
   */
  @Get()
  @RequiertPermission("directions:read")
  arborescence(@Demande() d: ContexteDemande) {
    return this.organisation.arborescence(d.perimetre);
  }

  @Get("statistiques/:niveau/:id")
  @RequiertPermission("departments:read")
  statistiques(@Param("niveau") niveau: string, @Param("id") id: string) {
    const n = valider(z.enum(["departement", "service"]), niveau);
    return this.organisation.statistiques(id, n);
  }

  // ── Directions ───────────────────────────────────────────────────────────

  @Post("directions")
  @RequiertPermission("directions:create")
  creerDirection(@Body() corps: unknown, @Demande() d: ContexteDemande) {
    const donnees = valider(
      identite.extend({ responsableId: z.uuid().nullish() }),
      corps,
    );
    return this.organisation.creerDirection(donnees, d.userId);
  }

  /**
   * `EX-ORG-02` — renommer l'un des trois niveaux, ou changer son responsable.
   *
   * Corriger une faute dans un nom de service imposait jusqu'ici de le
   * SUPPRIMER, donc d'en détacher les agents.
   */
  @Patch(":niveau/:id")
  @RequiertPermission("departments:update")
  renommer(
    @Param("niveau") niveau: string,
    @Param("id") id: string,
    @Body() corps: unknown,
    @Demande() d: ContexteDemande,
  ) {
    const cible = valider(
      z.enum(["directions", "departements", "services"]),
      niveau,
    );
    const donnees = valider(
      z.object({
        nom: z.string().min(1).max(160).optional(),
        description: z.string().max(2000).nullish(),
        responsableId: z.uuid().nullable().optional(),
      }),
      corps,
    );
    const singulier = cible === "directions" ? "direction" : cible === "departements" ? "departement" : "service";
    return this.organisation.renommer(singulier, id, donnees, d.userId);
  }

  @Delete("directions/:id")
  @RequiertPermission("directions:delete")
  supprimerDirection(@Param("id") id: string, @Demande() d: ContexteDemande) {
    return this.organisation.supprimerDirection(id, d.userId);
  }

  // ── Départements ─────────────────────────────────────────────────────────

  @Post("departements")
  @RequiertPermission("departments:create")
  creerDepartement(@Body() corps: unknown, @Demande() d: ContexteDemande) {
    const donnees = valider(
      identite.extend({ directionId: z.uuid().nullish(), responsableId: z.uuid().nullish() }),
      corps,
    );
    return this.organisation.creerDepartement(donnees, d.userId);
  }

  /**
   * `RG-ORG-04` — l'impact avant la suppression.
   *
   * Le point d'entrée existe séparément parce que la vue 29 montre le compte
   * de ce qui sera détaché **avant** de demander confirmation. Supprimer
   * d'abord et prévenir ensuite n'est pas une option.
   */
  @Get("departements/:id/impact")
  @RequiertPermission("departments:delete")
  impactDepartement(@Param("id") id: string) {
    return this.organisation.impactSuppressionDepartement(id);
  }

  @Delete("departements/:id")
  @RequiertPermission("departments:delete")
  supprimerDepartement(@Param("id") id: string, @Demande() d: ContexteDemande) {
    return this.organisation.supprimerDepartement(id, d.userId);
  }

  // ── Services ─────────────────────────────────────────────────────────────

  @Post("services")
  @RequiertPermission("services:create")
  creerService(@Body() corps: unknown, @Demande() d: ContexteDemande) {
    const donnees = valider(
      identite.extend({ departementId: z.uuid(), managerId: z.uuid().nullish() }),
      corps,
    );
    return this.organisation.creerService(donnees, d.userId);
  }
}
