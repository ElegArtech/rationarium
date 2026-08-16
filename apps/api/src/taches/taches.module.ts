import { Module } from "@nestjs/common";
import { NotificationsModule } from "../notifications/notifications.module.js";
import { TachesService } from "./taches.service.js";
import { TachesController } from "./taches.controller.js";

@Module({
  imports: [NotificationsModule],
  controllers: [TachesController],
  providers: [TachesService],
  exports: [TachesService],
})
export class TachesModule {}
