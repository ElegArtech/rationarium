import { Module } from "@nestjs/common";
import { NotificationsModule } from "../notifications/notifications.module.js";
import { AssistantController } from "./assistant.controller.js";
import { GuichetController } from "./guichet.controller.js";
import { ReglagesAssistantService } from "./reglages.service.js";
import { ExecutionInterneService } from "./execution-interne.service.js";
import { JetonsAgentService } from "./jetons.service.js";
import { SuivisService } from "./suivis.service.js";
import { ActionsAgentService } from "./actions.service.js";
import { PassagesService } from "./passages.service.js";
import { PlanificationAssistantService } from "./planification.service.js";

/**
 * M22 — assistant de suivi. `docs/assistant/SPEC-PHASE-1.md`.
 *
 * Un agent, sur le poste de l'utilisateur, met Rationarium à jour pour le
 * compte du propriétaire de son jeton. Le module n'appelle aucun service
 * extérieur (`RG-AST-20`) : il range les passages, sert le contexte, exécute
 * les actions par les routes existantes, et les rend défaisables.
 */
@Module({
  imports: [NotificationsModule],
  controllers: [AssistantController, GuichetController],
  providers: [
    ReglagesAssistantService,
    ExecutionInterneService,
    JetonsAgentService,
    SuivisService,
    ActionsAgentService,
    PassagesService,
    PlanificationAssistantService,
  ],
})
export class AssistantModule {}
