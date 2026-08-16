import { Module } from "@nestjs/common";
import { ParametrageModule } from "../parametrage/parametrage.module.js";
import { CongesService } from "./conges.service.js";
import { CongesController } from "./conges.controller.js";

/**
 * Les congés dépendent du calendrier : le décompte en jours ouvrés suppose de
 * savoir ce qu'est un jour ouvré, et cette notion préexiste au module congés.
 */
@Module({
  imports: [ParametrageModule],
  controllers: [CongesController],
  providers: [CongesService],
  exports: [CongesService],
})
export class CongesModule {}
