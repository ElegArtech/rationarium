import { Logger, Module, type OnModuleInit } from "@nestjs/common";
import { NotificationsModule } from "../notifications/notifications.module.js";
import { FileService } from "../notifications/file.service.js";
import { ProjetsService } from "./projets.service.js";
import { ProjetsController } from "./projets.controller.js";

/**
 * M4, M5 — projets, jalons, épopées, équipe.
 *
 * **`RG-PRJ-09` — l'instantané d'avancement est capturé PÉRIODIQUEMENT.** La
 * règle le dit, et rien ne l'exécutait : le bouton de la vue 11 était le seul
 * producteur d'instantanés du produit. Une instance en exploitation gardait
 * donc une courbe de tendance vide, et l'historique de `EX-PRJ-13` n'aurait
 * rien eu à montrer — un écran correct devant une table restée vide.
 *
 * `RG-NTF-02` — `singletonKey` de `pg-boss` fait le verrou d'instance unique :
 * deux exemplaires de l'application déclarent le même travail, un seul
 * l'exécute. C'est `FileService.planifier` qui le pose.
 *
 * L'heure est configurable comme celle des alertes d'échéance. Par défaut 23 h,
 * dans le fuseau de l'organisation : l'instantané doit clore la journée
 * travaillée, pas la couper. Capturer à 7 h daterait du jour J un avancement
 * qui est celui de la veille au soir.
 */
@Module({
  imports: [NotificationsModule],
  controllers: [ProjetsController],
  providers: [ProjetsService],
  exports: [ProjetsService],
})
export class ProjetsModule implements OnModuleInit {
  private readonly journal = new Logger(ProjetsModule.name);

  constructor(
    private readonly file: FileService,
    private readonly projets: ProjetsService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.file.planifier({
      nom: "projets.instantanes",
      cron: process.env["RATIONARIUM_CRON_INSTANTANES"] ?? "0 23 * * *",
      traitement: async () => {
        const bilan = await this.projets.capturerInstantanesDuJour(new Date());
        this.journal.log(
          `instantanés : ${bilan.captures} capturé(s), ${bilan.echecs.length} en échec.`,
        );
      },
    });
  }
}
