import { Module } from "@nestjs/common";
import { ImportsService } from "./imports.service.js";
import { ImportsController } from "./imports.controller.js";

/** M21 — imports et exports. */
@Module({
  controllers: [ImportsController],
  providers: [ImportsService],
  exports: [ImportsService],
})
export class ImportsModule {}
