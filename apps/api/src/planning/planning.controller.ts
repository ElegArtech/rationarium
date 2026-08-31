import { Body, Controller, Get, Header, Patch, Post, Query } from "@nestjs/common";
import { z } from "zod";
import { PlanningService } from "./planning.service.js";
import { TachesService } from "../taches/taches.service.js";
import { TeletravailService } from "../teletravail/teletravail.service.js";
import { Demande, RequiertPermission, type ContexteDemande } from "../commun/permissions.garde.js";
import { valider, dateSchema } from "../commun/http.js";
import { enumDe, ETATS_TELETRAVAIL } from "@rationarium/contracts";

/**
 * M7 — le planning unifié. Vues 07, 08, 09.
 *
 * **Un seul point d'entrée de lecture** (`RG-PLN-01`). Les actions, elles,
 * restent chez les modules qui portent leurs règles : déplacer une tâche est
 * une affaire de tâches, basculer le télétravail une affaire de télétravail.
 * Le planning est un lieu de lecture et de geste, pas un second propriétaire
 * des règles — les dupliquer ici les ferait diverger au premier correctif.
 */

const plage = z.object({ debut: dateSchema, fin: dateSchema });

const filtres = z.object({
  services: z.string().optional(),
  departementId: z.uuid().optional(),
  ressourceId: z.uuid().optional(),
  monPerimetre: z.stringbool().optional(),
});

@Controller("planning")
export class PlanningController {
  constructor(
    private readonly planning: PlanningService,
    private readonly taches: TachesService,
    private readonly teletravail: TeletravailService,
  ) {}

  /** `EX-PLN-03`, `RG-PLN-01` — toute la période, en une sollicitation. */
  @Get()
  @RequiertPermission("planning:read")
  agreger(@Demande() d: ContexteDemande, @Query() requete: unknown) {
    const q = valider(plage.extend(filtres.shape), requete);
    return this.planning.agreger(
      q.debut,
      q.fin,
      {
        // Les services arrivent en liste séparée par des virgules : une chaîne
        // de requête n'a pas de type tableau, et l'inventer par répétition de
        // clé se lit moins bien qu'un découpage explicite.
        ...(q.services ? { services: q.services.split(",").filter(Boolean) } : {}),
        ...(q.departementId ? { departementId: q.departementId } : {}),
        ...(q.ressourceId ? { ressourceId: q.ressourceId } : {}),
        ...(q.monPerimetre === undefined ? {} : { monPerimetre: q.monPerimetre }),
      },
      d.perimetre,
      d.permissions,
    );
  }

  /** `EX-ACT-07`, `EX-PLN-01` — la grille d'activité et sa trame. Vue 09. */
  @Get("activite")
  @RequiertPermission("predefined_tasks:read")
  activite(@Demande() d: ContexteDemande, @Query() requete: unknown) {
    const q = valider(plage, requete);
    return this.planning.grilleActivite(q.debut, q.fin, d.perimetre);
  }

  /**
   * `EX-PLN-10` — déplacer une tâche depuis la grille.
   *
   * `RG-TSK-11` — une tâche multi-assignée ne change que d'assigné : déplacer
   * sa date depuis la ligne d'une personne la déplacerait pour tout le monde,
   * sans que l'auteur du geste le voie. Le service le refuse et le dit ; le
   * contrôleur ne fait que transmettre.
   */
  @Patch("taches/deplacer")
  @RequiertPermission("tasks:update")
  deplacer(@Body() corps: unknown, @Demande() d: ContexteDemande) {
    const donnees = valider(
      z.object({
        taskId: z.uuid(),
        nouvelleDate: dateSchema.optional(),
        nouvelAssigneId: z.uuid().optional(),
        ancienAssigneId: z.uuid().optional(),
      }),
      corps,
    );
    const { taskId, ...cible } = donnees;
    return this.taches.deplacerDepuisPlanning(taskId, cible, d.userId);
  }

  /**
   * `EX-PLN-09`, `RG-PLN-04` — basculer le télétravail depuis la cellule.
   *
   * La permission est exigée ici, et la cellule est en lecture seule à défaut
   * (`RG-GEN-06`) : le client masque par courtoisie, le serveur refuse.
   */
  @Patch("teletravail")
  @RequiertPermission("telework:create")
  basculerTeletravail(@Body() corps: unknown, @Demande() d: ContexteDemande) {
    const donnees = valider(
      z.object({
        userId: z.uuid(),
        date: dateSchema,
        etat: enumDe(ETATS_TELETRAVAIL),
      }),
      corps,
    );
    return this.teletravail.basculer(donnees.userId, donnees.date, donnees.etat, d.userId);
  }

  /**
   * `EX-PLN-15` — l'export ICS.
   *
   * Le type MIME et le nom de fichier sont posés ici : servi en
   * `application/json`, un calendrier s'ouvre dans un éditeur de texte au lieu
   * de l'agenda, et l'utilisateur conclut que la fonction ne marche pas.
   */
  @Get("ics")
  @RequiertPermission("planning:export_ics")
  @Header("Content-Type", "text/calendar; charset=utf-8")
  @Header("Content-Disposition", 'attachment; filename="planning.ics"')
  async exporter(@Demande() d: ContexteDemande, @Query() requete: unknown) {
    const q = valider(plage.extend(filtres.shape), requete);
    return this.planning.exporterIcs(
      q.debut,
      q.fin,
      {
        ...(q.services ? { services: q.services.split(",").filter(Boolean) } : {}),
        ...(q.monPerimetre === undefined ? {} : { monPerimetre: q.monPerimetre }),
      },
      d.perimetre,
      new Date(),
    );
  }

  /** `EX-PLN-15` — l'import ICS, qui rend compte de ce qu'il a fait. */
  @Post("ics")
  @RequiertPermission("planning:import_ics")
  importer(@Body() corps: unknown, @Demande() d: ContexteDemande) {
    const { contenu } = valider(
      z.object({ contenu: z.string().min(1).max(2_000_000) }),
      corps,
    );
    return this.planning.importerIcs(contenu, d.userId);
  }
}
