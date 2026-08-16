import { Module } from "@nestjs/common";
import { RolesService } from "./roles.service.js";
import { AuditQueryService } from "./audit.query.service.js";
import { AdministrationController } from "./administration.controller.js";

@Module({
  controllers: [AdministrationController],
  providers: [RolesService, AuditQueryService],
  exports: [RolesService, AuditQueryService],
})
export class AdministrationModule {}
