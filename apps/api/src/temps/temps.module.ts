import { Module } from "@nestjs/common";
import { TempsService } from "./temps.service.js";
import { TempsController } from "./temps.controller.js";

@Module({
  controllers: [TempsController],
  providers: [TempsService],
  exports: [TempsService],
})
export class TempsModule {}
