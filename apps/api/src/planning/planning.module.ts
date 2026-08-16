import { Module } from "@nestjs/common";
import { PlanningService } from "./planning.service.js";
import { PlanningController } from "./planning.controller.js";
import { ParametrageModule } from "../parametrage/parametrage.module.js";
import { TachesModule } from "../taches/taches.module.js";
import { TeletravailModule } from "../teletravail/teletravail.module.js";
import { ActiviteModule } from "../activite/activite.module.js";

/**
 * M7 — le planning unifié.
 *
 * Ce module **importe** les trois modules dont il consomme les règles plutôt
 * que de les réécrire : le calendrier pour la trame de fond, les tâches pour
 * le déplacement, le télétravail pour la bascule. C'est ce qui garantit qu'une
 * correction de `RG-TSK-11` vaut aussi depuis le planning.
 */
@Module({
  imports: [ParametrageModule, TachesModule, TeletravailModule, ActiviteModule],
  controllers: [PlanningController],
  providers: [PlanningService],
  exports: [PlanningService],
})
export class PlanningModule {}
