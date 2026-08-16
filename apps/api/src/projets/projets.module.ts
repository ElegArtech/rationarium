import { Module } from "@nestjs/common";
import { NotificationsModule } from "../notifications/notifications.module.js";
import { ProjetsService } from "./projets.service.js";
import { ProjetsController } from "./projets.controller.js";

@Module({
  imports: [NotificationsModule],
  controllers: [ProjetsController],
  providers: [ProjetsService],
  exports: [ProjetsService],
})
export class ProjetsModule {}
