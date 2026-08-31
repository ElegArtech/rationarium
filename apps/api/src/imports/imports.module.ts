import { Module } from "@nestjs/common";
import { CongesModule } from "../conges/conges.module.js";
import { ImportsService } from "./imports.service.js";
import { ImportsController } from "./imports.controller.js";

/**
 * M21 — imports et exports.
 *
 * L'import de congés dépend du module congés, et non l'inverse : le dépôt d'un
 * congé (`RG-CNG-16` à `27`) préexiste à l'idée d'en importer une liste. Le
 * réécrire ici en produirait une seconde version, qui divergerait au premier
 * amendement du décompte ou du contrôle de solde.
 */
@Module({
  imports: [CongesModule],
  controllers: [ImportsController],
  providers: [ImportsService],
  exports: [ImportsService],
})
export class ImportsModule {}
