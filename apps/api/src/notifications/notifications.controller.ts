import { Controller, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { z } from "zod";
import { NotificationsService } from "./notifications.service.js";
import { Demande, Personnel, type ContexteDemande } from "../commun/permissions.garde.js";
import { valider } from "../commun/http.js";

/**
 * M18 — les notifications. Coquille applicative (cloche de l'en-tête).
 *
 * Toutes les routes sont `@Personnel()` : une notification appartient à son
 * destinataire et à personne d'autre. Les vingt-quatre domaines de permissions
 * de `cadrage/01 § 3.2` n'en comportent pas pour elles, et en inventer un
 * serait pire — le contrôle est le `userId` de la session, présent dans chaque
 * requête et vérifié par un test.
 */
@Controller("notifications")
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  /** `EX-NTF-01` — ses notifications, avec le compteur de non-lues. */
  @Get()
  @Personnel()
  lister(@Demande() d: ContexteDemande, @Query() requete: unknown) {
    const q = valider(
      z.object({
        nonLues: z.stringbool().optional(),
        limite: z.coerce.number().int().min(1).max(200).optional(),
      }),
      requete,
    );
    return this.notifications.lister(d.userId, {
      ...(q.nonLues === undefined ? {} : { nonLuesSeulement: q.nonLues }),
      ...(q.limite === undefined ? {} : { limite: q.limite }),
    });
  }

  /** `EX-NTF-02` — marquer une notification comme lue. */
  @Patch(":id")
  @Personnel()
  marquerLue(@Param("id") id: string, @Demande() d: ContexteDemande) {
    return this.notifications.marquerLue(d.userId, id);
  }

  /** `EX-NTF-03` — tout marquer comme lu. */
  @Post("tout-lu")
  @Personnel()
  toutMarquerLu(@Demande() d: ContexteDemande) {
    return this.notifications.toutMarquerLu(d.userId);
  }
}
