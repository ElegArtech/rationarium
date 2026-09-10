import { Module } from "@nestjs/common";
import { OrganisationService } from "./organisation.service.js";
import { OrganisationController } from "./organisation.controller.js";
import { GardeCibleOrganisation } from "./organisation-cible.garde.js";

@Module({
  controllers: [OrganisationController],
  providers: [OrganisationService, GardeCibleOrganisation],
  exports: [OrganisationService],
})
export class OrganisationModule {}
