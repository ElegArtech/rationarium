import { Injectable, Logger, type OnModuleInit } from "@nestjs/common";
import { FileService } from "../notifications/file.service.js";
import { ReglagesAssistantService } from "./reglages.service.js";
import { PassagesService } from "./passages.service.js";
import { JetonsAgentService } from "./jetons.service.js";

const PASSAGES = "assistant.passages";
const INTERRUPTION = "assistant.interruption";
const CONSERVATION = "assistant.conservation";

/**
 * Les trois traitements planifiés du module (`docs/assistant/SPEC-PHASE-1.md § 12`).
 *
 * `RG-AST-01` — aucun n'est déclaré quand le module est désactivé. Les réglages
 * changent à chaud : la planification est donc resynchronisée au démarrage et à
 * chaque enregistrement, et non posée une fois pour toutes. `RG-AST-16` tient
 * par `FileService.planifier`, dont le `singletonKey` ne laisse qu'une instance
 * exécuter chaque échéance.
 */
@Injectable()
export class PlanificationAssistantService implements OnModuleInit {
  private readonly journal = new Logger(PlanificationAssistantService.name);

  constructor(
    private readonly file: FileService,
    private readonly reglages: ReglagesAssistantService,
    private readonly passages: PassagesService,
    private readonly jetons: JetonsAgentService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.synchroniser();
  }

  async synchroniser(): Promise<void> {
    const reglages = await this.reglages.lire();
    if (reglages.mode === "desactive") {
      await Promise.all([PASSAGES, INTERRUPTION, CONSERVATION].map((n) => this.file.deplanifier(n)));
      return;
    }

    await this.file.planifier({ nom: INTERRUPTION, cron: "*/5 * * * *", traitement: () => this.interrompre() });
    await this.file.planifier({ nom: CONSERVATION, cron: "30 3 * * *", traitement: () => this.conserver() });
    if (reglages.planification) {
      await this.file.planifier({ nom: PASSAGES, cron: reglages.planification, traitement: () => this.planifierPassages() });
    } else {
      await this.file.deplanifier(PASSAGES);
    }
  }

  async planifierPassages(): Promise<void> {
    if (!(await this.reglages.actif())) return;
    const crees = await this.passages.creerPassagesPlanifies(await this.jetons.proprietairesAvecJetonValide());
    if (crees > 0) this.journal.log(`${crees} passage(s) planifié(s) créé(s)`);
  }

  async interrompre(): Promise<void> {
    if (!(await this.reglages.actif())) return;
    await this.passages.interrompreLesMuets();
  }

  async conserver(): Promise<void> {
    const { conservationJours } = await this.reglages.lire();
    await this.passages.purgerLesExtraits(conservationJours);
  }
}
