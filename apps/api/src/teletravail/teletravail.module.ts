import { Module } from "@nestjs/common";
import { TeletravailService } from "./teletravail.service.js";
import { TeletravailController } from "./teletravail.controller.js";

@Module({
  controllers: [TeletravailController],
  providers: [TeletravailService],
  exports: [TeletravailService],
})
export class TeletravailModule {}
