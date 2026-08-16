import { Module, type OnModuleInit } from "@nestjs/common";
import { NotificationsService } from "./notifications.service.js";
import { NotificationsController } from "./notifications.controller.js";
import { FileService } from "./file.service.js";
import { CourrielService } from "./courriel.service.js";

/**
 * M18 — notifications, courriel, travaux planifiés.
 *
 * Le module **planifie** son travail quotidien à l'initialisation
 * (`RG-NTF-01`), avec le verrou d'instance unique de `pg-boss` (`RG-NTF-02`).
 * L'heure est configurable : une collectivité qui ouvre à 8 h n'a pas les
 * mêmes usages qu'un service d'astreinte.
 */
@Module({
  controllers: [NotificationsController],
  providers: [NotificationsService, FileService, CourrielService],
  exports: [NotificationsService, FileService],
})
export class NotificationsModule implements OnModuleInit {
  constructor(
    private readonly file: FileService,
    private readonly notifications: NotificationsService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.file.planifier({
      nom: "notifications.alertes-echeance",
      // Par défaut à 7 h, dans le fuseau de l'organisation.
      cron: process.env["TRAME_CRON_ALERTES"] ?? "0 7 * * *",
      traitement: async () => {
        await this.notifications.alertesEcheance(new Date());
      },
    });
  }
}
