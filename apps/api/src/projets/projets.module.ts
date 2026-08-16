import { Module } from "@nestjs/common";
import { ProjetsService } from "./projets.service.js";
import { ProjetsController } from "./projets.controller.js";

@Module({
  controllers: [ProjetsController],
  providers: [ProjetsService],
  exports: [ProjetsService],
})
export class ProjetsModule {}
