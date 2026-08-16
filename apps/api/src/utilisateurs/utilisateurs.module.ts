import { Module } from "@nestjs/common";
import { UtilisateursService } from "./utilisateurs.service.js";
import { UtilisateursController } from "./utilisateurs.controller.js";

@Module({
  controllers: [UtilisateursController],
  providers: [UtilisateursService],
  exports: [UtilisateursService],
})
export class UtilisateursModule {}
