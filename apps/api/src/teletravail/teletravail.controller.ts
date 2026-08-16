import { Body, Controller, Get, Post, Query } from "@nestjs/common";
import { z } from "zod";
import { enumDe, ETATS_TELETRAVAIL } from "@trame/contracts";
import { TeletravailService } from "./teletravail.service.js";
import { Demande, RequiertPermission, type ContexteDemande } from "../commun/permissions.garde.js";
import { valider, dateSchema } from "../commun/http.js";

/** M11 — télétravail : déclaration, règles récurrentes, vue équipe. Vue 20. */

@Controller("teletravail")
export class TeletravailController {
  constructor(private readonly teletravail: TeletravailService) {}

  @Get()
  @RequiertPermission("telework:read")
  planning(@Demande() d: ContexteDemande, @Query() requete: unknown) {
    const q = valider(
      z.object({ userId: z.uuid().optional(), debut: dateSchema, fin: dateSchema }),
      requete,
    );
    return this.teletravail.planning(q.userId ?? d.userId, q.debut, q.fin);
  }

  /** `EX-TLT-05` — qui est sur site aujourd'hui, qui est à distance. */
  @Get("equipe")
  @RequiertPermission("telework:read_team")
  equipe(@Demande() d: ContexteDemande, @Query("date") date?: string) {
    return this.teletravail.equipeALaDate(d.perimetre, date ? valider(dateSchema, date) : new Date());
  }

  @Get("statistiques")
  @RequiertPermission("telework:read")
  statistiques(@Demande() d: ContexteDemande, @Query() requete: unknown) {
    const q = valider(
      z.object({ userId: z.uuid().optional(), annee: z.coerce.number().int() }),
      requete,
    );
    return this.teletravail.statistiques(q.userId ?? d.userId, q.annee);
  }

  /**
   * `EX-TLT-01` — basculer un jour.
   *
   * Un seul point d'entrée pour poser **et** retirer : l'état est passé en
   * clair. Deux verbes séparés inviteraient à un « retirer » sur un jour qui
   * n'a jamais été posé, cas qui n'a pas de sens à formuler.
   */
  @Post()
  @RequiertPermission("telework:create")
  basculer(@Body() corps: unknown, @Demande() d: ContexteDemande) {
    const q = valider(
      z.object({
        userId: z.uuid().optional(),
        date: dateSchema,
        etat: enumDe(ETATS_TELETRAVAIL),
      }),
      corps,
    );
    return this.teletravail.basculer(q.userId ?? d.userId, q.date, q.etat, d.userId);
  }

  // ── Règles récurrentes — EX-TLT-03 ───────────────────────────────────────

  /**
   * L'aperçu d'une règle **avant** de la créer.
   *
   * « Tous les mardis jusqu'en décembre » représente une trentaine de jours :
   * les montrer d'abord évite de découvrir après coup qu'on a posé du
   * télétravail sur trois semaines de congés.
   */
  @Post("regles/apercu")
  @RequiertPermission("telework:manage_rules")
  apercu(@Body() corps: unknown) {
    const regle = valider(
      z.object({
        jourSemaine: z.number().int().min(0).max(6),
        dateDebut: dateSchema,
        dateFin: dateSchema.nullish(),
      }),
      corps,
    );
    return this.teletravail.apercuRegle(regle);
  }

  @Post("regles")
  @RequiertPermission("telework:manage_rules")
  creerRegle(@Body() corps: unknown, @Demande() d: ContexteDemande) {
    const donnees = valider(
      z.object({
        userId: z.uuid().optional(),
        jourSemaine: z.number().int().min(0).max(6),
        dateDebut: dateSchema,
        dateFin: dateSchema.nullish(),
      }),
      corps,
    );
    return this.teletravail.creerRegle({ ...donnees, userId: donnees.userId ?? d.userId }, d.userId);
  }

  @Post("generer")
  @RequiertPermission("telework:generate")
  generer(@Body() corps: unknown, @Demande() d: ContexteDemande) {
    const q = valider(
      z.object({ userId: z.uuid().optional(), debut: dateSchema, fin: dateSchema }),
      corps,
    );
    return this.teletravail.generer(q.userId ?? d.userId, q.debut, q.fin, d.userId);
  }
}
