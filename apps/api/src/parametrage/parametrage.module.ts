import { Module } from "@nestjs/common";
import { CalendrierService } from "./calendrier.service.js";
import { ParametrageController } from "./parametrage.controller.js";

@Module({
  controllers: [ParametrageController],
  providers: [CalendrierService],
  exports: [CalendrierService],
})
export class ParametrageModule {}
