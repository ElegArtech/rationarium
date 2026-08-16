import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query } from "@nestjs/common";
import { z } from "zod";
import { enumDe, STATUTS_TACHE, PRIORITES, ROLES_RACI } from "@trame/contracts";
import { TachesService } from "./taches.service.js";
import { Demande, RequiertPermission, type ContexteDemande } from "../commun/permissions.garde.js";
import { valider, dateSchema } from "../commun/http.js";

/** M6 — tâches, sous-tâches, dépendances, RACI, kanban. Vues 12, 16, 17. */

@Controller("taches")
export class TachesController {
  constructor(private readonly taches: TachesService) {}

  /**
   * `EX-TSK-01` — la liste, bornée au périmètre.
   *
   * `RG-SCOPE-04` : les tâches confidentielles sont exclues sauf permission
   * explicite. C'est le service qui l'applique, à partir des permissions
   * qu'on lui passe — pas un filtre ajouté après la requête.
   */
  @Get()
  @RequiertPermission("tasks:read")
  lister(@Demande() d: ContexteDemande, @Query() requete: unknown) {
    const filtres = valider(
      z.object({
        projectId: z.uuid().optional(),
        horsProjet: z.stringbool().optional(),
        statut: enumDe(STATUTS_TACHE).optional(),
        priorite: enumDe(PRIORITES).optional(),
        enRetard: z.stringbool().optional(),
        assigneId: z.uuid().optional(),
      }),
      requete,
    );
    return this.taches.lister(d.perimetre, d.permissions, filtres);
  }

  /** `EX-TSK-20` — les tâches sans projet ni jalon, que personne ne regarde. */
  @Get("orphelines")
  @RequiertPermission("tasks:read")
  orphelines(@Demande() d: ContexteDemande) {
    return this.taches.orphelines(d.perimetre, d.permissions);
  }

  /** `EX-TSK-13` — la fiche complète. Vue 17. */
  @Get(":id")
  @RequiertPermission("tasks:read")
  fiche(@Param("id") id: string) {
    return this.taches.fiche(id);
  }

  @Post()
  @RequiertPermission("tasks:create")
  creer(@Body() corps: unknown, @Demande() d: ContexteDemande) {
    const donnees = valider(
      z.object({
        titre: z.string().min(1).max(200),
        description: z.string().max(10000).optional(),
        projectId: z.uuid().nullish(),
        milestoneId: z.uuid().nullish(),
        epicId: z.uuid().nullish(),
        statut: enumDe(STATUTS_TACHE).optional(),
        priorite: enumDe(PRIORITES).optional(),
        dateDebut: dateSchema.nullish(),
        dateFin: dateSchema.nullish(),
        estimationHeures: z.number().min(0).optional(),
        confidentielle: z.boolean().optional(),
        interventionExterieure: z.boolean().optional(),
        assigneIds: z.array(z.uuid()).optional(),
        serviceIds: z.array(z.uuid()).optional(),
      }),
      corps,
    );
    return this.taches.creer(donnees, d.userId);
  }

  /**
   * `RG-GEN-07` — la modification transmet la **version lue**.
   *
   * Un écart lève un conflit et se traduit en 409 : la concurrence est
   * détectée, jamais écrasée. C'est ce qui interdit le « dernier arrivé
   * gagne ».
   */
  @Patch(":id")
  @RequiertPermission("tasks:update")
  modifier(@Param("id") id: string, @Body() corps: unknown, @Demande() d: ContexteDemande) {
    const donnees = valider(
      z.object({
        version: z.number().int().min(1),
        titre: z.string().min(1).max(200).optional(),
        description: z.string().max(10000).nullish(),
        statut: enumDe(STATUTS_TACHE).optional(),
        priorite: enumDe(PRIORITES).optional(),
        dateDebut: dateSchema.nullish(),
        dateFin: dateSchema.nullish(),
        estimationHeures: z.number().min(0).nullish(),
        avancement: z.number().int().min(0).max(100).optional(),
      }),
      corps,
    );
    return this.taches.modifier(id, donnees, d.userId);
  }

  @Delete(":id")
  @RequiertPermission("tasks:delete")
  supprimer(@Param("id") id: string, @Demande() d: ContexteDemande) {
    return this.taches.supprimer(id, d.userId);
  }

  // ── Sous-tâches — EX-TSK-09 ──────────────────────────────────────────────

  @Post(":id/sous-taches")
  @RequiertPermission("tasks:update")
  ajouterSousTache(@Param("id") id: string, @Body() corps: unknown, @Demande() d: ContexteDemande) {
    const { libelle } = valider(z.object({ libelle: z.string().min(1).max(300) }), corps);
    return this.taches.ajouterSousTache(id, libelle, d.userId);
  }

  @Patch("sous-taches/:sousTacheId")
  @RequiertPermission("tasks:update")
  basculerSousTache(@Param("sousTacheId") sousTacheId: string, @Body() corps: unknown) {
    const { fait } = valider(z.object({ fait: z.boolean() }), corps);
    return this.taches.basculerSousTache(sousTacheId, fait);
  }

  @Delete("sous-taches/:sousTacheId")
  @RequiertPermission("tasks:update")
  supprimerSousTache(@Param("sousTacheId") sousTacheId: string) {
    return this.taches.supprimerSousTache(sousTacheId);
  }

  /** L'ordre complet est transmis : réordonner n'est pas déplacer d'un cran. */
  @Put(":id/sous-taches/ordre")
  @RequiertPermission("tasks:update")
  reordonner(@Param("id") id: string, @Body() corps: unknown) {
    const { ids } = valider(z.object({ ids: z.array(z.uuid()).max(200) }), corps);
    return this.taches.reordonnerSousTaches(id, ids);
  }

  // ── Dépendances — RG-TSK-04 ──────────────────────────────────────────────

  @Get(":id/dependances")
  @RequiertPermission("tasks:read")
  dependances(@Param("id") id: string) {
    return this.taches.dependances(id);
  }

  @Get(":id/incoherences")
  @RequiertPermission("tasks:read")
  incoherences(@Param("id") id: string) {
    return this.taches.incoherences(id);
  }

  @Post(":id/dependances")
  @RequiertPermission("tasks:manage_dependencies")
  ajouterDependance(@Param("id") id: string, @Body() corps: unknown, @Demande() d: ContexteDemande) {
    const { prerequisId } = valider(z.object({ prerequisId: z.uuid() }), corps);
    return this.taches.ajouterDependance(id, prerequisId, d.userId);
  }

  /**
   * `EX-TSK-12` — l'aperçu de la cascade **avant** de la déclencher.
   *
   * Décaler une tâche décale ses dépendantes, et les leurs. Montrer la liste
   * de ce qui bougera est ce qui distingue une action assumée d'un dégât
   * collatéral.
   */
  @Get(":id/cascade")
  @RequiertPermission("tasks:manage_dependencies")
  apercuCascade(@Param("id") id: string, @Query("jours") jours: string) {
    return this.taches.apercuCascade(id, valider(z.coerce.number().int(), jours));
  }

  @Post(":id/cascade")
  @RequiertPermission("tasks:manage_dependencies")
  decaler(@Param("id") id: string, @Body() corps: unknown, @Demande() d: ContexteDemande) {
    const { jours } = valider(z.object({ jours: z.number().int() }), corps);
    return this.taches.decalerEnCascade(id, jours, d.userId);
  }

  // ── RACI ─────────────────────────────────────────────────────────────────

  @Delete(":id/dependances/:prerequisId")
  @RequiertPermission("tasks:manage_dependencies")
  retirerDependance(
    @Param("id") id: string,
    @Param("prerequisId") prerequisId: string,
    @Demande() d: ContexteDemande,
  ) {
    return this.taches.retirerDependance(id, prerequisId, d.userId);
  }

  @Post(":id/raci")
  @RequiertPermission("tasks:manage_raci")
  attribuerRaci(@Param("id") id: string, @Body() corps: unknown, @Demande() d: ContexteDemande) {
    const { userId, role } = valider(
      z.object({ userId: z.uuid(), role: enumDe(ROLES_RACI) }),
      corps,
    );
    return this.taches.attribuerRaci(id, userId, role, d.userId);
  }

  @Delete(":id/raci/:userId/:role")
  @RequiertPermission("tasks:manage_raci")
  retirerRaci(
    @Param("id") id: string,
    @Param("userId") userId: string,
    @Param("role") role: string,
    @Demande() d: ContexteDemande,
  ) {
    return this.taches.retirerRaci(id, userId, valider(enumDe(ROLES_RACI), role), d.userId);
  }

  /**
   * `RG-TSK-11` — déplacer une tâche depuis le planning.
   *
   * Le geste change **la date, ou l'assigné, ou les deux** selon la colonne et
   * la ligne d'arrivée. Sur une tâche multi-assignée, l'ancien assigné doit
   * être nommé : sans lui, on ne saurait pas lequel des trois a bougé.
   */
  @Post(":id/deplacer")
  @RequiertPermission("tasks:update")
  deplacer(@Param("id") id: string, @Body() corps: unknown, @Demande() d: ContexteDemande) {
    const cible = valider(
      z.object({
        nouvelleDate: dateSchema.optional(),
        nouvelAssigneId: z.uuid().optional(),
        ancienAssigneId: z.uuid().optional(),
      }),
      corps,
    );
    return this.taches.deplacerDepuisPlanning(id, cible, d.userId);
  }
}
