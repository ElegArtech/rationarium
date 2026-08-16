import { Module } from "@nestjs/common";
import { TableauService } from "./tableau.service.js";
import { TableauController } from "./tableau.controller.js";
import { PlanningModule } from "../planning/planning.module.js";
import { TempsModule } from "../temps/temps.module.js";

/**
 * M16 — le tableau de bord.
 *
 * Il **compose** deux modules plutôt que de refaire leur travail : le planning
 * pour l'extrait personnel, le temps pour les tâches non déclarées. C'est ce
 * qui garantit qu'une correction de `RG-PLN-02` ou de `EX-TMP-06` vaut aussi
 * sur la page d'accueil.
 */
@Module({
  imports: [PlanningModule, TempsModule],
  controllers: [TableauController],
  providers: [TableauService],
  exports: [TableauService],
})
export class TableauModule {}
