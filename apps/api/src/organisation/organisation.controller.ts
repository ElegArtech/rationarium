import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { z } from "zod";
import { OrganisationService } from "./organisation.service.js";
import { Demande, RequiertPermission, type ContexteDemande } from "../commun/permissions.garde.js";
import { valider } from "../commun/http.js";
import { CibleOrganisation } from "./organisation-cible.garde.js";

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
   * `EX-ORG-05` — **filtrer la vue par département**, et la chercher.
   *
   * Le périmètre est passé au service, pas appliqué après coup : filtrer le
   * résultat côté contrôleur laisserait la requête ramener ce que l'appelant
   * n'a pas le droit de voir. Le filtre de `EX-ORG-05` prend le même chemin,
   * pour la même raison plus une seconde : l'arborescence a deux racines, et
   * le filtre qui vivait dans la vue n'en couvrait qu'une.
   */
  @Get()
  @RequiertPermission("directions:read")
  arborescence(@Demande() d: ContexteDemande, @Query() requete: unknown) {
    const filtres = valider(
      z.object({
        departementId: z.uuid().optional(),
        recherche: z.string().max(120).optional(),
      }),
      requete,
    );
    return this.organisation.arborescence(d.perimetre, filtres);
  }

  @Get("statistiques/:niveau/:id")
  @RequiertPermission("departments:read")
  @CibleOrganisation({ niveau: "parametre" })
  statistiques(@Param("niveau") niveau: string, @Param("id") id: string) {
    const n = valider(z.enum(["departement", "service"]), niveau);
    return this.organisation.statistiques(id, n);
  }

  // ── Directions ───────────────────────────────────────────────────────────

  @Post("directions")
  @RequiertPermission("directions:create")
  @CibleOrganisation({ creation: "direction", rattachements: true })
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
  @Patch("directions/:id")
  @RequiertPermission("directions:update")
  @CibleOrganisation({ niveau: "direction", rattachements: true })
  modifierDirection(@Param("id") id: string, @Body() corps: unknown, @Demande() d: ContexteDemande) {
    const donnees = valider(modificationNoeud, corps);
    return this.organisation.renommer("direction", id, donnees, d.userId);
  }

  @Patch("departements/:id")
  @RequiertPermission("departments:update")
  @CibleOrganisation({ niveau: "departement", rattachements: true })
  modifierDepartement(@Param("id") id: string, @Body() corps: unknown, @Demande() d: ContexteDemande) {
    const donnees = valider(
      modificationNoeud.extend({ directionId: z.uuid().nullable().optional() }),
      corps,
    );
    return this.organisation.renommer("departement", id, donnees, d.userId);
  }

  @Patch("services/:id")
  @RequiertPermission("services:update")
  @CibleOrganisation({ niveau: "service", rattachements: true })
  modifierService(@Param("id") id: string, @Body() corps: unknown, @Demande() d: ContexteDemande) {
    const donnees = valider(modificationNoeud, corps);
    return this.organisation.renommer("service", id, donnees, d.userId);
  }

  @Delete("directions/:id")
  @RequiertPermission("directions:delete")
  @CibleOrganisation({ niveau: "direction" })
  supprimerDirection(@Param("id") id: string, @Demande() d: ContexteDemande) {
    return this.organisation.supprimerDirection(id, d.userId);
  }

  @Get("directions/:id/impact")
  @RequiertPermission("directions:delete")
  @CibleOrganisation({ niveau: "direction" })
  impactDirection(@Param("id") id: string) {
    return this.organisation.impactSuppressionDirection(id);
  }

  // ── Départements ─────────────────────────────────────────────────────────

  @Post("departements")
  @RequiertPermission("departments:create")
  @CibleOrganisation({ creation: "departement", rattachements: true })
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
  @CibleOrganisation({ niveau: "departement" })
  impactDepartement(@Param("id") id: string) {
    return this.organisation.impactSuppressionDepartement(id);
  }

  @Delete("departements/:id")
  @RequiertPermission("departments:delete")
  @CibleOrganisation({ niveau: "departement" })
  supprimerDepartement(@Param("id") id: string, @Demande() d: ContexteDemande) {
    return this.organisation.supprimerDepartement(id, d.userId);
  }

  // ── Services ─────────────────────────────────────────────────────────────

  @Post("services")
  @RequiertPermission("services:create")
  @CibleOrganisation({ creation: "service", rattachements: true })
  creerService(@Body() corps: unknown, @Demande() d: ContexteDemande) {
    const donnees = valider(
      identite.extend({ departementId: z.uuid(), managerId: z.uuid().nullish() }),
      corps,
    );
    return this.organisation.creerService(donnees, d.userId);
  }

  /**
   * `EX-ORG-03` — l'impact d'une suppression de service, **avant** de la faire.
   * Même discipline que pour un département : le compte de ce qui sera détaché
   * précède la confirmation.
   */
  @Get("services/:id/impact")
  @RequiertPermission("services:delete")
  @CibleOrganisation({ niveau: "service" })
  impactService(@Param("id") id: string) {
    return this.organisation.impactSuppressionService(id);
  }

  @Delete("services/:id")
  @RequiertPermission("services:delete")
  @CibleOrganisation({ niveau: "service" })
  supprimerService(@Param("id") id: string, @Demande() d: ContexteDemande) {
    return this.organisation.supprimerService(id, d.userId);
  }
}

const modificationNoeud = z.object({
  version: z.number().int().positive(),
  nom: z.string().min(1).max(160).optional(),
  description: z.string().max(2000).nullish(),
  responsableId: z.uuid().nullable().optional(),
}).strict();
