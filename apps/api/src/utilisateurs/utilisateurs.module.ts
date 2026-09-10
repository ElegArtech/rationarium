import { Module } from "@nestjs/common";
import { UtilisateursService } from "./utilisateurs.service.js";
import { UtilisateursController } from "./utilisateurs.controller.js";
import { GardeCibleUtilisateur } from "./utilisateur-cible.garde.js";

@Module({
  controllers: [UtilisateursController],
  providers: [UtilisateursService, GardeCibleUtilisateur],
  exports: [UtilisateursService],
})
export class UtilisateursModule {}
