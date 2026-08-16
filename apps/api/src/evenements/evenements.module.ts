import { Module } from "@nestjs/common";
import { EvenementsService } from "./evenements.service.js";
import { EvenementsController } from "./evenements.controller.js";

@Module({
  controllers: [EvenementsController],
  providers: [EvenementsService],
  exports: [EvenementsService],
})
export class EvenementsModule {}
