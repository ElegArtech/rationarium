import { Module } from "@nestjs/common";
import { RapportsService } from "./rapports.service.js";
import { RapportsController } from "./rapports.controller.js";

/** M17 — rapports et analytics. Vues 15 et 30. */
@Module({
  controllers: [RapportsController],
  providers: [RapportsService],
  exports: [RapportsService],
})
export class RapportsModule {}
