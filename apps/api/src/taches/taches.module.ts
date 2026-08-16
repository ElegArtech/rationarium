import { Module } from "@nestjs/common";
import { TachesService } from "./taches.service.js";
import { TachesController } from "./taches.controller.js";

@Module({
  controllers: [TachesController],
  providers: [TachesService],
  exports: [TachesService],
})
export class TachesModule {}
