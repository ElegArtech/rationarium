import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { z } from "zod";
import { heure } from "@rationarium/contracts";
import { EvenementsService } from "./evenements.service.js";
import { Demande, RequiertPermission, type ContexteDemande } from "../commun/permissions.garde.js";
import { valider, dateSchema } from "../commun/http.js";

/** M9 — événements et récurrences. Vue 18. */

@Controller("evenements")
export class EvenementsController {
  constructor(private readonly evenements: EvenementsService) {}

  /**
   * Les événements d'une plage, bornés au périmètre.
   *
   * Les bornes sont nullables : le service traite « depuis toujours » et
   * « jusqu'à la fin » sans que le client ait à inventer des dates sentinelles.
   */
  @Get()
  @RequiertPermission("events:read")
  surPlage(@Demande() d: ContexteDemande, @Query() requete: unknown) {
    const q = valider(
      z.object({
        debut: dateSchema.nullish(),
        fin: dateSchema.nullish(),
        projectId: z.uuid().optional(),
        userId: z.uuid().optional(),
      }),
      requete,
    );
    const filtres = {
      ...(q.projectId ? { projectId: q.projectId } : {}),
      ...(q.userId ? { userId: q.userId } : {}),
    };
    return this.evenements.surPlage(d.perimetre, d.permissions, q.debut ?? null, q.fin ?? null, filtres);
  }

  @Post()
  @RequiertPermission("events:create")
  creer(@Body() corps: unknown, @Demande() d: ContexteDemande) {
    const donnees = valider(
      z.object({
        titre: z.string().min(1).max(200),
        description: z.string().max(10000).optional(),
        date: dateSchema,
        journeeEntiere: z.boolean().optional(),
        heureDebut: heure.nullish(),
        heureFin: heure.nullish(),
        projectId: z.uuid().nullish(),
        interventionExterieure: z.boolean().optional(),
        participantIds: z.array(z.uuid()).optional(),
        serviceIds: z.array(z.uuid()).optional(),
        recurrence: z
          .object({
            frequenceSemaines: z.number().int().min(1).max(52),
            jourSemaine: z.number().int().min(0).max(6),
            jusqua: dateSchema,
          })
          .optional(),
      }),
      corps,
    );
    return this.evenements.creer(donnees, d.userId);
  }

  /**
   * `EX-EVT-06` — modifier un événement.
   *
   * Le schéma est celui de la création, tous champs optionnels, **plus deux
   * champs qui ne sont pas des données** :
   *
   *   - `version`, obligatoire — `RG-GEN-07`. Sans elle, l'écriture serait
   *     « dernier arrivé gagne », et deux personnes corrigeant le même horaire
   *     s'effaceraient mutuellement sans qu'aucune ne le sache.
   *   - `portee`, obligatoire dès que l'événement appartient à une série —
   *     `RG-EVT-07`. Le service la refuse par ses deux bouts : absente sur une
   *     série, présente hors série.
   *
   * Les participants n'y figurent pas : ils ont leurs propres points d'entrée
   * (`EX-EVT-08`). Les paramètres de récurrence non plus — les changer
   * régénérerait la série, ce qui est un autre geste que « modifier ».
   */
  @Patch(":id")
  @RequiertPermission("events:update")
  modifier(@Param("id") id: string, @Body() corps: unknown, @Demande() d: ContexteDemande) {
    const donnees = valider(
      z.object({
        version: z.number().int().min(1),
        portee: z.enum(["occurrence", "serie"]).optional(),
        titre: z.string().min(1).max(200).optional(),
        description: z.string().max(10000).nullish(),
        date: dateSchema.optional(),
        journeeEntiere: z.boolean().optional(),
        heureDebut: heure.nullish(),
        heureFin: heure.nullish(),
        projectId: z.uuid().nullish(),
        interventionExterieure: z.boolean().optional(),
      }),
      corps,
    );
    return this.evenements.modifier(id, donnees, d.userId, d.perimetre, d.permissions);
  }

  /**
   * `EX-EVT-06` — supprimer un événement.
   *
   * `version` et `portee` voyagent en paramètres de requête et non en corps :
   * un corps sur un `DELETE` est licite mais mal traité par la moitié des
   * intermédiaires, et le reste du produit n'en envoie aucun. `version` y est
   * l'exact équivalent d'un `If-Match` — la lecture sur laquelle l'appelant
   * fonde sa suppression.
   */
  @Delete(":id")
  @RequiertPermission("events:delete")
  supprimer(@Param("id") id: string, @Query() requete: unknown, @Demande() d: ContexteDemande) {
    const q = valider(
      z.object({
        version: z.coerce.number().int().min(1),
        portee: z.enum(["occurrence", "serie"]).optional(),
      }),
      requete,
    );
    return this.evenements.supprimer(id, q, d.userId, d.perimetre, d.permissions);
  }

  @Post(":id/participants")
  @RequiertPermission("events:update")
  ajouterParticipant(@Param("id") id: string, @Body() corps: unknown, @Demande() d: ContexteDemande) {
    const { userId } = valider(z.object({ userId: z.uuid() }), corps);
    return this.evenements.ajouterParticipant(id, userId, d.userId);
  }

  @Delete(":id/participants/:userId")
  @RequiertPermission("events:update")
  retirerParticipant(
    @Param("id") id: string,
    @Param("userId") userId: string,
    @Demande() d: ContexteDemande,
  ) {
    return this.evenements.retirerParticipant(id, userId, d.userId);
  }

  /**
   * `RG-EVT-06` — arrêter une série **à partir d'une date**, sans toucher au
   * passé.
   *
   * Supprimer la série entière effacerait des occurrences déjà tenues, qui
   * figurent dans l'historique de gens qui y étaient. On coupe, on n'efface pas.
   */
  @Post(":id/arreter")
  @RequiertPermission("events:update")
  arreterRecurrence(@Param("id") id: string, @Body() corps: unknown, @Demande() d: ContexteDemande) {
    const { aPartirDe } = valider(z.object({ aPartirDe: dateSchema }), corps);
    return this.evenements.arreterRecurrence(id, aPartirDe, d.userId, d.perimetre, d.permissions);
  }
}
