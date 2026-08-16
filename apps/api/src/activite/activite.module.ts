import { Module } from "@nestjs/common";
import { ActiviteService } from "./activite.service.js";
import { ActiviteController } from "./activite.controller.js";

@Module({
  controllers: [ActiviteController],
  providers: [ActiviteService],
  exports: [ActiviteService],
})
export class ActiviteModule {}
