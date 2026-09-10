import { Body, Controller, Get, Param, Patch, Post, Put, Query, UseInterceptors } from "@nestjs/common";
import { z } from "zod";
import { CalendrierService } from "./calendrier.service.js";
import { Demande, Public, RequiertPermission, type ContexteDemande } from "../commun/permissions.garde.js";
import { valider, dateSchema } from "../commun/http.js";
import {
  IntercepteurAuditParametrage,
  TraceParametrage,
} from "./audit-parametrage.interceptor.js";

/**
 * M19 — paramétrage : jours fériés, vacances scolaires, trame de fond. Vue 31.
 *
 * Ce module porte une responsabilité que le reste du produit consomme sans la
 * connaître : **définir ce qu'est un jour ouvré**. Le décompte des congés, la
 * génération des assignations et la trame du planning en dépendent.
 */

const plage = z.object({ debut: dateSchema, fin: dateSchema });

@Controller("parametrage")
export class ParametrageController {
  constructor(private readonly calendrier: CalendrierService) {}

  /** EX-PRM-03 — lecture anonyme des seuls réglages marqués publics. */
  @Get()
  @Public()
  reglages() {
    return this.calendrier.reglages();
  }

  /**
   * Enregistre les réglages **en bloc**.
   *
   * La vue 31 édite quatre onglets et enregistre d'un geste : une écriture
   * champ par champ laisserait l'application dans un état intermédiaire que
   * personne n'a choisi.
   */
  @Put()
  @RequiertPermission("settings:update")
  enregistrer(@Body() corps: unknown, @Demande() d: ContexteDemande) {
    const { reglages } = valider(
      z.object({ reglages: z.record(z.string(), z.string()) }),
      corps,
    );
    return this.calendrier.enregistrerReglages(reglages, d.userId);
  }

  @Get("feries")
  @RequiertPermission("holidays:read")
  feries(@Query("annee") annee: string) {
    return this.calendrier.joursFeries(valider(z.coerce.number().int(), annee));
  }

  @Get("vacances")
  @RequiertPermission("school_vacations:read")
  vacances(@Query() requete: unknown) {
    const q = valider(
      z.object({
        anneeScolaire: z.string().regex(/^\d{4}-\d{4}$/).optional(),
        zone: z.enum(["A", "B", "C"]).optional(),
      }),
      requete,
    );
    return this.calendrier.vacances(q.anneeScolaire, q.zone);
  }

  /**
   * La trame de fond du planning : week-ends, fériés, vacances scolaires.
   *
   * Lue avec `planning:read` et non avec `holidays:read` : c'est le planning
   * qui la consomme, et refuser la trame à quelqu'un qui a le droit de voir le
   * planning lui donnerait une grille sans repères.
   */
  @Get("trame")
  @RequiertPermission("planning:read")
  trame(@Query() requete: unknown) {
    const q = valider(plage.extend({ zone: z.string().max(10).optional() }), requete);
    return this.calendrier.trameDeFond(q.debut, q.fin, q.zone);
  }

  @Get("jours-ouvres")
  @RequiertPermission("planning:read")
  async joursOuvres(@Query() requete: unknown) {
    const q = valider(
      plage.extend({
        demiJourneeDebut: z.stringbool().optional(),
        demiJourneeFin: z.stringbool().optional(),
      }),
      requete,
    );
    const options = {
      ...(q.demiJourneeDebut === undefined ? {} : { demiJourneeDebut: q.demiJourneeDebut }),
      ...(q.demiJourneeFin === undefined ? {} : { demiJourneeFin: q.demiJourneeFin }),
    };
    return {
      jours: await this.calendrier.joursOuvres(q.debut, q.fin, options),
      parAnnee: await this.calendrier.repartitionParAnnee(q.debut, q.fin, options),
    };
  }

  @Post("feries")
  @RequiertPermission("holidays:create")
  declarerFerie(@Body() corps: unknown, @Demande() d: ContexteDemande) {
    const donnees = valider(
      z.object({
        date: dateSchema,
        libelle: z.string().min(1).max(120),
        type: z.string().max(20).optional(),
        ouvre: z.boolean().optional(),
        recurrent: z.boolean().optional(),
      }),
      corps,
    );
    return this.calendrier.declarerJourFerie(donnees, d.userId);
  }

  /**
   * `C1` — l'import est **calculé**, jamais téléchargé.
   *
   * Le réseau est fermé : une API de jours fériés serait inatteignable. Les
   * dates mobiles sont dérivées du comput de Pâques, en local.
   */
  @Post("feries/importer")
  @RequiertPermission("holidays:import")
  importerFeries(@Body() corps: unknown, @Demande() d: ContexteDemande) {
    const { annee } = valider(z.object({ annee: z.number().int().min(1970).max(2200) }), corps);
    return this.calendrier.importerJoursFeries(annee, d.userId);
  }

  @Patch("feries/:id")
  @RequiertPermission("holidays:update")
  @TraceParametrage("holiday.update", "Holiday")
  @UseInterceptors(IntercepteurAuditParametrage)
  modifierFerie(
    @Param("id") id: string,
    @Body() corps: unknown,
  ) {
    const donnees = valider(
      z.object({
        version: z.number().int().positive(),
        ouvre: z.boolean().optional(),
        recurrent: z.boolean().optional(),
      }).refine((valeur) => valeur.ouvre !== undefined || valeur.recurrent !== undefined),
      corps,
    );
    return this.calendrier.modifierJourFerie(id, donnees);
  }

  @Post("vacances/importer")
  @RequiertPermission("school_vacations:import")
  @TraceParametrage("school_vacation.import", "SchoolVacation")
  @UseInterceptors(IntercepteurAuditParametrage)
  importerVacances(@Body() corps: unknown) {
    const donnees = valider(
      z.object({
        anneeScolaire: z.string().regex(/^\d{4}-\d{4}$/),
        zone: z.enum(["A", "B", "C"]).optional(),
      }),
      corps,
    );
    return this.calendrier.importerVacances(donnees.anneeScolaire, donnees.zone);
  }

  @Post("vacances")
  @RequiertPermission("school_vacations:create")
  declarerVacances(@Body() corps: unknown, @Demande() d: ContexteDemande) {
    const donnees = valider(
      z.object({
        libelle: z.string().min(1).max(120),
        dateDebut: dateSchema,
        dateFin: dateSchema,
        zone: z.string().min(1).max(10),
        anneeScolaire: z.string().min(4).max(12),
      }).strict(),
      corps,
    );
    return this.calendrier.declarerVacances(donnees, d.userId);
  }
}
