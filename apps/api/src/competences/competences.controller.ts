import { Body, Controller, Delete, Get, Param, Post, Put, Query } from "@nestjs/common";
import { z } from "zod";
import { enumDe, CATEGORIES_COMPETENCE, NIVEAUX_COMPETENCE } from "@rationarium/contracts";
import { CompetencesService } from "./competences.service.js";
import { Demande, RequiertPermission, type ContexteDemande } from "../commun/permissions.garde.js";
import { valider } from "../commun/http.js";

/** M13 — compétences : référentiel, matrice, écarts. Vue 22. */

@Controller("competences")
export class CompetencesController {
  constructor(private readonly competences: CompetencesService) {}

  /**
   * `EX-CMP-04` — la matrice agents × compétences, et ses écarts.
   *
   * L'écart — effectif requis contre détenteurs au niveau attendu — est
   * calculé par le service. Le laisser au client obligerait chaque vue à
   * refaire le calcul, et le premier oubli passerait inaperçu.
   */
  @Get("matrice")
  @RequiertPermission("skills:manage_matrix")
  matrice(@Demande() d: ContexteDemande, @Query() requete: unknown) {
    const filtres = valider(
      z.object({ categorie: enumDe(CATEGORIES_COMPETENCE).optional() }),
      requete,
    );
    return this.competences.matrice(d.perimetre, filtres);
  }

  /** `EX-CMP-01` — le référentiel des compétences. */
  @Get()
  @RequiertPermission("skills:read")
  referentiel(@Query() requete: unknown) {
    const filtres = valider(
      z.object({
        categorie: enumDe(CATEGORIES_COMPETENCE).optional(),
        recherche: z.string().max(120).optional(),
      }),
      requete,
    );
    return this.competences.referentiel(filtres);
  }

  /** `EX-CMP-05` — qui détient cette compétence, au moins à ce niveau. */
  @Get(":id/detenteurs")
  @RequiertPermission("skills:read")
  detenteurs(
    @Param("id") id: string,
    @Demande() d: ContexteDemande,
    @Query("niveauMinimum") niveau?: string,
  ) {
    const minimum = niveau ? valider(enumDe(NIVEAUX_COMPETENCE), niveau) : undefined;
    return this.competences.detenteurs(id, d.perimetre, minimum);
  }

  @Get("export")
  @RequiertPermission("skills:export")
  async exporter(@Demande() d: ContexteDemande) {
    return { csv: await this.competences.exporterMatrice(d.perimetre) };
  }

  @Post()
  @RequiertPermission("skills:create")
  creer(@Body() corps: unknown, @Demande() d: ContexteDemande) {
    const donnees = valider(
      z.object({
        nom: z.string().min(1).max(120),
        categorie: enumDe(CATEGORIES_COMPETENCE),
        description: z.string().max(2000).optional(),
        effectifRequis: z.number().int().min(0).optional(),
      }),
      corps,
    );
    return this.competences.creer(donnees, d.userId);
  }

  @Delete(":id")
  @RequiertPermission("skills:delete")
  supprimer(@Param("id") id: string, @Demande() d: ContexteDemande) {
    return this.competences.supprimer(id, d.userId);
  }

  /**
   * Le niveau d'un agent sur une compétence, **posé en une écriture**.
   *
   * `PUT` et non `POST` : le geste est idempotent. Rejouer la même évaluation
   * ne doit pas empiler des lignes.
   */
  @Put("agents/:userId/:skillId")
  @RequiertPermission("skills:manage_matrix")
  definirNiveau(
    @Param("userId") userId: string,
    @Param("skillId") skillId: string,
    @Body() corps: unknown,
    @Demande() d: ContexteDemande,
  ) {
    const { niveau } = valider(z.object({ niveau: enumDe(NIVEAUX_COMPETENCE) }), corps);
    return this.competences.definirNiveau(userId, skillId, niveau, d.userId);
  }

  @Delete("agents/:userId/:skillId")
  @RequiertPermission("skills:manage_matrix")
  retirer(
    @Param("userId") userId: string,
    @Param("skillId") skillId: string,
    @Demande() d: ContexteDemande,
  ) {
    return this.competences.retirerCompetence(userId, skillId, d.userId);
  }
}
