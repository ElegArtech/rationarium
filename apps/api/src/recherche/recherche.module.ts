import { Module } from "@nestjs/common";
import { RechercheController } from "./recherche.controller.js";
import { RechercheService } from "./recherche.service.js";

@Module({
  controllers: [RechercheController],
  providers: [RechercheService],
})
export class RechercheModule {}
