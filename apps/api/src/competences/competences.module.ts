import { Module } from "@nestjs/common";
import { CompetencesService } from "./competences.service.js";
import { CompetencesController } from "./competences.controller.js";

@Module({
  controllers: [CompetencesController],
  providers: [CompetencesService],
  exports: [CompetencesService],
})
export class CompetencesModule {}
