import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { z } from "zod";
import { enumDe, STATUTS_PROJET, PRIORITES } from "@rationarium/contracts";
import { ProjetsService } from "./projets.service.js";
import { Demande, RequiertPermission, type ContexteDemande } from "../commun/permissions.garde.js";
import { valider, dateSchema } from "../commun/http.js";

/** M4, M5 — projets, jalons, équipe, feuille de route. Vues 10, 11, 13, 14. */

@Controller("projets")
export class ProjetsController {
  constructor(private readonly projets: ProjetsService) {}

  /** `EX-PRJ-01` — le portefeuille, borné au périmètre. Vue 10. */
  @Get()
  @RequiertPermission("projects:read")
  portefeuille(@Demande() d: ContexteDemande, @Query() requete: unknown) {
    const filtres = valider(
      z.object({
        recherche: z.string().max(120).optional(),
        statut: enumDe(STATUTS_PROJET).optional(),
        priorite: enumDe(PRIORITES).optional(),
        archive: z.stringbool().optional(),
        /* Maquette 10 — « Mes projets ». Un resserrement de lecture, pas un
           droit : le périmètre s'applique de toute façon en amont. */
        mesProjets: z.stringbool().optional(),
      }),
      requete,
    );
    return this.projets.portefeuille(d.perimetre, d.permissions, filtres);
  }

  /** `EX-PRJ-02` — la fiche complète. Vue 11. */
  @Get(":id")
  @RequiertPermission("projects:read")
  fiche(@Param("id") id: string) {
    return this.projets.fiche(id);
  }

  @Get(":id/budget")
  @RequiertPermission("projects:read")
  budget(@Param("id") id: string) {
    return this.projets.budget(id);
  }

  @Get(":id/feuille-de-route")
  @RequiertPermission("milestones:read")
  feuilleDeRoute(@Param("id") id: string) {
    return this.projets.feuilleDeRoute(id);
  }

  @Post()
  @RequiertPermission("projects:create")
  creer(@Body() corps: unknown, @Demande() d: ContexteDemande) {
    const donnees = valider(
      z.object({
        nom: z.string().min(1).max(160),
        description: z.string().max(5000).optional(),
        statut: enumDe(STATUTS_PROJET).optional(),
        priorite: enumDe(PRIORITES).optional(),
        dateDebut: dateSchema,
        dateFin: dateSchema,
        budgetHeures: z.number().min(0).optional(),
        icone: z.string().max(20).optional(),
        chefId: z.uuid().nullish(),
        sponsorId: z.uuid().nullish(),
        departementId: z.uuid().nullish(),
      }),
      corps,
    );
    return this.projets.creer(donnees, d.userId);
  }

  /**
   * `EX-PRJ-05` — modifier un projet.
   *
   * L'exigence est au cadrage, la maquette 11 pose le bouton, et aucune route
   * ne l'a jamais servi : corriger une date de fin imposait de supprimer le
   * projet, donc d'en perdre les tâches, les jalons et l'équipe.
   *
   * Tous les champs sont facultatifs sauf `version` : la fiche enregistre bloc
   * par bloc, et exiger l'objet entier ferait écraser par une valeur relue ce
   * qu'une autre personne vient d'écrire — un « dernier arrivé gagne » déguisé
   * en formulaire.
   */
  @Patch(":id")
  @RequiertPermission("projects:update")
  modifier(@Param("id") id: string, @Body() corps: unknown, @Demande() d: ContexteDemande) {
    const donnees = valider(
      z.object({
        nom: z.string().min(1).max(160).optional(),
        description: z.string().max(5000).nullish(),
        statut: enumDe(STATUTS_PROJET).optional(),
        priorite: enumDe(PRIORITES).optional(),
        dateDebut: dateSchema.optional(),
        dateFin: dateSchema.optional(),
        budgetHeures: z.number().min(0).nullish(),
        icone: z.string().max(20).nullish(),
        chefId: z.uuid().nullish(),
        sponsorId: z.uuid().nullish(),
        departementId: z.uuid().nullish(),
        version: z.number().int().positive(),
      }),
      corps,
    );
    return this.projets.modifier(id, donnees, d.userId, d.permissions);
  }

  /**
   * `RG-GEN-10` — trois gestes distincts, trois points d'entrée : annuler,
   * archiver, supprimer définitivement. Le premier est réversible par
   * `restaurer`, le deuxième aussi, le troisième non — et c'est pourquoi il
   * porte sa propre permission et un aperçu d'impact préalable.
   */
  @Post(":id/annuler")
  @RequiertPermission("projects:update")
  annuler(@Param("id") id: string, @Demande() d: ContexteDemande) {
    return this.projets.annuler(id, d.userId);
  }

  @Post(":id/restaurer")
  @RequiertPermission("projects:update")
  restaurer(@Param("id") id: string, @Demande() d: ContexteDemande) {
    return this.projets.restaurer(id, d.userId);
  }

  @Post(":id/archiver")
  @RequiertPermission("projects:archive")
  archiver(@Param("id") id: string, @Body() corps: unknown, @Demande() d: ContexteDemande) {
    const { archive } = valider(z.object({ archive: z.boolean() }), corps);
    return this.projets.archiver(id, archive, d.userId);
  }

  @Get(":id/impact")
  @RequiertPermission("projects:delete")
  impact(@Param("id") id: string) {
    return this.projets.impactSuppression(id);
  }

  @Delete(":id")
  @RequiertPermission("projects:delete")
  supprimer(@Param("id") id: string, @Demande() d: ContexteDemande) {
    return this.projets.supprimerDefinitivement(id, d.userId);
  }

  // ── Équipe — vue 14 ──────────────────────────────────────────────────────

  @Get(":id/equipe")
  @RequiertPermission("projects:read")
  equipe(@Param("id") id: string) {
    return this.projets.equipe(id);
  }

  @Post(":id/membres")
  @RequiertPermission("projects:manage_members")
  ajouterMembre(@Param("id") id: string, @Body() corps: unknown, @Demande() d: ContexteDemande) {
    const donnees = valider(
      z.object({
        userId: z.uuid(),
        roleProjet: z.string().min(1).max(60),
        tauxAllocation: z.number().min(0).max(100).optional(),
      }),
      corps,
    );
    return this.projets.ajouterMembre(id, donnees, d.userId);
  }

  /**
   * `EX-PRJ-09` — changer le rôle ou l'allocation d'un membre en place.
   *
   * Sans ce point d'entrée, la seule façon de corriger un rôle était de
   * retirer la personne puis de la rajouter : un lien rompu pour être refait,
   * avec sa notification d'ajout. La vue 14 pose pourtant un sélecteur de rôle
   * sur chaque ligne.
   */
  @Patch(":id/membres/:userId")
  @RequiertPermission("projects:manage_members")
  changerRoleMembre(
    @Param("id") id: string,
    @Param("userId") userId: string,
    @Body() corps: unknown,
    @Demande() d: ContexteDemande,
  ) {
    const donnees = valider(
      z.object({
        roleProjet: z.string().min(1).max(60).optional(),
        tauxAllocation: z.number().min(0).max(100).nullable().optional(),
      }),
      corps,
    );
    return this.projets.changerRoleMembre(id, userId, donnees, d.userId);
  }

  @Delete(":id/membres/:userId")
  @RequiertPermission("projects:manage_members")
  retirerMembre(
    @Param("id") id: string,
    @Param("userId") userId: string,
    @Demande() d: ContexteDemande,
  ) {
    return this.projets.retirerMembre(id, userId, d.userId);
  }

  // ── Jalons — vue 13 ──────────────────────────────────────────────────────

  @Post(":id/jalons")
  @RequiertPermission("milestones:create")
  creerJalon(@Param("id") id: string, @Body() corps: unknown, @Demande() d: ContexteDemande) {
    const donnees = valider(
      z.object({
        nom: z.string().min(1).max(160),
        description: z.string().max(5000).optional(),
        dateEcheance: dateSchema,
      }),
      corps,
    );
    return this.projets.creerJalon({ ...donnees, projectId: id }, d.userId);
  }

  @Delete("jalons/:id")
  @RequiertPermission("milestones:delete")
  supprimerJalon(@Param("id") id: string, @Demande() d: ContexteDemande) {
    return this.projets.supprimerJalon(id, d.userId);
  }

  /** `EX-JAL-01` — modifier un jalon. Le geste manquait : on ne pouvait que créer et supprimer. */
  @Patch("jalons/:id")
  @RequiertPermission("milestones:update")
  modifierJalon(@Param("id") id: string, @Body() corps: unknown, @Demande() d: ContexteDemande) {
    const donnees = valider(
      z.object({
        nom: z.string().min(1).max(160).optional(),
        description: z.string().max(5000).nullish(),
        dateEcheance: dateSchema.nullish(),
        version: z.int().positive(),
      }),
      corps,
    );
    return this.projets.modifierJalon(id, donnees, d.userId);
  }

  // ── Épopées — vue 13, `EX-JAL-07` ────────────────────────────────────────

  @Get(":id/epopees")
  @RequiertPermission("epics:read")
  epopees(@Param("id") id: string) {
    return this.projets.epopees(id);
  }

  @Post(":id/epopees")
  @RequiertPermission("epics:create")
  creerEpopee(@Param("id") id: string, @Body() corps: unknown, @Demande() d: ContexteDemande) {
    const donnees = valider(
      z.object({
        nom: z.string().min(1).max(160),
        description: z.string().max(5000).optional(),
      }),
      corps,
    );
    return this.projets.creerEpopee({ ...donnees, projectId: id }, d.userId);
  }

  @Patch("epopees/:id")
  @RequiertPermission("epics:update")
  modifierEpopee(@Param("id") id: string, @Body() corps: unknown, @Demande() d: ContexteDemande) {
    const donnees = valider(
      z.object({
        nom: z.string().min(1).max(160).optional(),
        description: z.string().max(5000).nullish(),
        version: z.int().positive(),
      }),
      corps,
    );
    return this.projets.modifierEpopee(id, donnees, d.userId);
  }

  @Delete("epopees/:id")
  @RequiertPermission("epics:delete")
  supprimerEpopee(@Param("id") id: string, @Demande() d: ContexteDemande) {
    return this.projets.supprimerEpopee(id, d.userId);
  }

  /**
   * `EX-PRJ-14` — figer l'avancement à une date.
   *
   * L'instantané est **écrit**, pas recalculé à la demande : un Gantt de suivi
   * compare le réel à ce qui était prévu *à l'époque*. Recalculer effacerait
   * précisément ce qu'on cherche à voir.
   */
  @Post(":id/instantane")
  @RequiertPermission("reports:read")
  instantane(@Param("id") id: string, @Body() corps: unknown) {
    const { date } = valider(z.object({ date: dateSchema }), corps);
    return this.projets.capturerInstantane(id, date);
  }
}
