import { Body, Controller, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { z } from "zod";
import {
  enumDe,
  DUREES_TACHE_PREDEFINIE,
  PERIODES_JOURNEE,
  TYPES_RECURRENCE,
} from "@trame/contracts";
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
   * `EX-ACT-02` — modifier une tâche prédéfinie, ou la désactiver.
   *
   * Une permanence dont l'horaire change devait jusqu'ici être RECRÉÉE, ce qui
   * détache ses assignations passées de leur libellé. La désactivation est
   * réversible et ne supprime rien : les assignations déjà posées restent,
   * elles ont eu lieu.
   */
  @Patch("taches/:id")
  @RequiertPermission("predefined_tasks:update")
  modifierTache(@Param("id") id: string, @Body() corps: unknown, @Demande() d: ContexteDemande) {
    const donnees = valider(
      z.object({
        nom: z.string().min(1).max(160).optional(),
        description: z.string().max(5000).nullish(),
        couleur: z.string().max(30).nullish(),
        icone: z.string().max(20).nullish(),
        dureeParDefaut: enumDe(DUREES_TACHE_PREDEFINIE).optional(),
        heureDebut: z.string().nullish(),
        heureFin: z.string().nullish(),
        teletravailAutorise: z.boolean().optional(),
        poids: z.number().min(0).optional(),
        actif: z.boolean().optional(),
      }),
      corps,
    );
    return this.activite.modifierTache(id, donnees, d.userId);
  }

  /**
   * `RG-ACT-08` — poser une règle de récurrence.
   *
   * Elles étaient LUES et exploitées par la génération ; rien ne permettait
   * d'en créer une. « Générer les assignations » n'avait donc jamais rien à
   * générer, et le catalogue montrait ses cartes de règle vides.
   *
   * **Le type suit désormais `TYPES_RECURRENCE`**, qui est ce que le moteur de
   * génération sait lire. Ce point d'entrée acceptait `daily`, `weekly` et
   * `monthly` : sur les trois, seul `weekly` était produit par le moteur. Une
   * règle mensuelle se créait donc avec succès et ne générait jamais rien,
   * sans la moindre erreur. Voir le commentaire du vocabulaire.
   */
  @Post("taches/:id/recurrences")
  @RequiertPermission("predefined_tasks:update")
  creerRecurrence(@Param("id") id: string, @Body() corps: unknown, @Demande() d: ContexteDemande) {
    const donnees = valider(
      z.object({
        type: enumDe(TYPES_RECURRENCE),
        frequence: z.number().int().min(1).max(52).optional(),
        jourSemaine: z.number().int().min(0).max(6).nullish(),
        jourMois: z.number().int().min(1).max(31).nullish(),
        ordinal: z.number().int().min(-1).max(5).nullish(),
        dateDebut: dateSchema,
        dateFin: dateSchema.nullish(),
      }),
      corps,
    );
    return this.activite.creerRecurrence(id, donnees, d.userId);
  }

  /** Une règle s'arrête sans s'effacer : ce qu'elle a engendré reste. */
  @Patch("recurrences/:id")
  @RequiertPermission("predefined_tasks:update")
  basculerRecurrence(@Param("id") id: string, @Body() corps: unknown, @Demande() d: ContexteDemande) {
    const { active } = valider(z.object({ active: z.boolean() }), corps);
    return this.activite.basculerRecurrence(id, active, d.userId);
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
