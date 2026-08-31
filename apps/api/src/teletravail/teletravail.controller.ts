import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { z } from "zod";
import { enumDe, ETATS_TELETRAVAIL } from "@rationarium/contracts";
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
    return this.teletravail.statistiques(q.userId ?? d.userId, q.annee, d.userId, d.permissions);
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
    return this.teletravail.basculer(q.userId ?? d.userId, q.date, q.etat, d.userId, d.permissions);
  }

  // ── Règles récurrentes — EX-TLT-03 ───────────────────────────────────────

  @Get("regles")
  @RequiertPermission("telework:read")
  regles(@Demande() d: ContexteDemande, @Query("userId") userId?: string) {
    return this.teletravail.regles(userId ?? d.userId);
  }

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
    return this.teletravail.creerRegle(
      { ...donnees, userId: donnees.userId ?? d.userId },
      d.userId,
      d.permissions,
    );
  }

  /**
   * `EX-TLT-04` — **modifier une règle, l'activer ou la désactiver.**
   *
   * L'exigence énumère quatre facettes ; « actif » était la quatrième et ne
   * s'écrivait nulle part. Le point d'entrée manquait, tout simplement : une
   * règle posée était définitive, et une faute de jour se corrigeait en
   * supprimant… ce qui n'existait pas non plus.
   *
   * `version` est **obligatoire** (`RG-GEN-07`) : la vue lit la règle, renvoie
   * la version qu'elle a lue, et le serveur refuse si quelqu'un a écrit entre
   * les deux.
   */
  @Patch("regles/:id")
  @RequiertPermission("telework:manage_rules")
  modifierRegle(@Param("id") id: string, @Body() corps: unknown, @Demande() d: ContexteDemande) {
    const donnees = valider(
      z.object({
        version: z.number().int().min(1),
        jourSemaine: z.number().int().min(0).max(6).optional(),
        dateDebut: dateSchema.optional(),
        // `null` efface la borne, l'absence la laisse en place : une règle
        // bornée doit pouvoir se rouvrir.
        dateFin: dateSchema.nullish(),
        active: z.boolean().optional(),
      }),
      corps,
    );
    return this.teletravail.modifierRegle(id, donnees, d.userId, d.permissions);
  }

  /**
   * `EX-TLT-04` — supprimer une règle.
   *
   * Elle ne retire pas les jours déjà générés : ce sont des déclarations
   * posées, pas une projection de la règle. Désactiver est le geste
   * réversible ; supprimer retire la règle, jamais l'historique.
   */
  @Delete("regles/:id")
  @RequiertPermission("telework:manage_rules")
  supprimerRegle(@Param("id") id: string, @Demande() d: ContexteDemande) {
    return this.teletravail.supprimerRegle(id, d.userId, d.permissions);
  }

  @Post("generer")
  @RequiertPermission("telework:generate")
  generer(@Body() corps: unknown, @Demande() d: ContexteDemande) {
    const q = valider(
      z.object({ userId: z.uuid().optional(), debut: dateSchema, fin: dateSchema }),
      corps,
    );
    return this.teletravail.generer(q.userId ?? d.userId, q.debut, q.fin, d.userId, d.permissions);
  }
}
