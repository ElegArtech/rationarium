import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { CalendrierService } from "./calendrier.service.js";
import { ParametrageController } from "./parametrage.controller.js";
import { IntercepteurAuditParametrage } from "./audit-parametrage.interceptor.js";

@Module({
  imports: [AuthModule],
  controllers: [ParametrageController],
  providers: [CalendrierService, IntercepteurAuditParametrage],
  exports: [CalendrierService],
})
export class ParametrageModule {}
