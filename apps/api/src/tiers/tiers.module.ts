import { Module } from "@nestjs/common";
import { TiersService } from "./tiers.service.js";
import { TiersController } from "./tiers.controller.js";
import { ClientsController } from "./tiers.controller.js";

@Module({
  controllers: [TiersController, ClientsController],
  providers: [TiersService],
  exports: [TiersService],
})
export class TiersModule {}
