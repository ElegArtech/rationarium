import { Body, Controller, Get, Post, Query } from "@nestjs/common";
import { z } from "zod";
import { enumDe, DUREES_TACHE_PREDEFINIE, PERIODES_JOURNEE } from "@trame/contracts";
import { ActiviteService } from "./activite.service.js";
import { Demande, RequiertPermission, type ContexteDemande } from "../commun/permissions.garde.js";
import { valider, dateSchema } from "../commun/http.js";

/** M8 — activité récurrente : catalogue, assignations, récurrences. Vue 34. */

const periode = enumDe(PERIODES_JOURNEE);

@Controller("activite")
export class ActiviteController {
  constructor(private readonly activite: ActiviteService) {}

  /** La grille d'activité : qui est de permanence, quand. Vue 09. */
  @Get("grille")
  @RequiertPermission("predefined_tasks:read")
  grille(@Demande() d: ContexteDemande, @Query() requete: unknown) {
    const q = valider(z.object({ debut: dateSchema, fin: dateSchema }), requete);
    return this.activite.grille(q.debut, q.fin, d.perimetre);
  }

  /** `EX-ACT-01` — le catalogue des tâches prédéfinies. Vue 34. */
  @Get("taches")
  @RequiertPermission("predefined_tasks:read")
  catalogue(@Query("inclureInactives") inclureInactives?: string) {
    return this.activite.catalogue(inclureInactives === "true");
  }

  @Post("taches")
  @RequiertPermission("predefined_tasks:create")
  creerTache(@Body() corps: unknown, @Demande() d: ContexteDemande) {
    const donnees = valider(
      z.object({
        nom: z.string().min(1).max(160),
        description: z.string().max(5000).optional(),
        couleur: z.string().max(30).optional(),
        icone: z.string().max(20).optional(),
        dureeParDefaut: enumDe(DUREES_TACHE_PREDEFINIE).optional(),
        heureDebut: z.string().nullish(),
        heureFin: z.string().nullish(),
        teletravailAutorise: z.boolean().optional(),
        poids: z.number().min(0).optional(),
      }),
      corps,
    );
    return this.activite.creerTache(donnees, d.userId);
  }

  /**
   * `RG-ACT-07` — l'inéligibilité est annoncée **avant** l'assignation.
   *
   * Congé posé, événement, permanence déjà tenue : la vue 34 grise les agents
   * concernés en disant pourquoi. Découvrir le conflit au moment de valider
   * obligerait à recommencer la sélection entière.
   */
  @Get("eligibilite")
  @RequiertPermission("predefined_tasks:assign")
  eligibilite(@Demande() d: ContexteDemande, @Query() requete: unknown) {
    const q = valider(
      z.object({ predefinedTaskId: z.uuid(), date: dateSchema, periode }),
      requete,
    );
    return this.activite.eligibilite(q.predefinedTaskId, q.date, q.periode, d.perimetre);
  }

  @Post("assignations")
  @RequiertPermission("predefined_tasks:assign")
  assigner(@Body() corps: unknown, @Demande() d: ContexteDemande) {
    const q = valider(
      z.object({
        predefinedTaskId: z.uuid(),
        userIds: z.array(z.uuid()).min(1).max(200),
        date: dateSchema,
        periode,
      }),
      corps,
    );
    return this.activite.assigner(
      q.predefinedTaskId,
      q.userIds,
      q.date,
      q.periode,
      d.userId,
      d.perimetre,
    );
  }

  @Post("generer")
  @RequiertPermission("predefined_tasks:generate")
  generer(@Body() corps: unknown, @Demande() d: ContexteDemande) {
    const q = valider(
      z.object({
        predefinedTaskId: z.uuid(),
        debut: dateSchema,
        fin: dateSchema,
        userIds: z.array(z.uuid()).min(1).max(200),
      }),
      corps,
    );
    return this.activite.genererDepuisRecurrences(
      q.predefinedTaskId,
      q.debut,
      q.fin,
      q.userIds,
      d.userId,
    );
  }

  /** `EX-ACT-09` — dire si la permanence a bien été tenue. */
  @Post("assignations/realisation")
  @RequiertPermission("predefined_tasks:update")
  declarerRealisation(@Body() corps: unknown, @Demande() d: ContexteDemande) {
    const q = valider(
      z.object({ assignationId: z.uuid(), realisee: z.boolean() }),
      corps,
    );
    return this.activite.declarerRealisation(q.assignationId, q.realisee, d.userId);
  }
}
