import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import { z } from "zod";
import {
  SECONDES_ATTENTE_PASSAGE,
  finPassageSchema,
  lotActionsSchema,
  nouveauPassageSchema,
  progressionPassageSchema,
} from "@rationarium/contracts";
import {
  AgentDemande,
  Demande,
  Guichet,
  RequiertPermission,
  type ContexteDemande,
} from "../commun/permissions.garde.js";
import type { AgentResolu } from "../commun/acces-agent.js";
import { valider, dateSchema } from "../commun/http.js";
import { bornerPlage } from "../commun/plage.js";
import { PrismaService } from "../prisma.service.js";
import { ReglagesAssistantService } from "./reglages.service.js";
import { PassagesService } from "./passages.service.js";
import { ActionsAgentService } from "./actions.service.js";

/**
 * M22 — le guichet des agents (`docs/assistant/SPEC-PHASE-1.md § 10`).
 *
 * Toutes les routes sont `@Guichet()` : elles n'acceptent que le jeton d'agent,
 * et agissent pour son propriétaire (`RG-AST-02`). Toutes exigent
 * `assistant:use` du propriétaire : un compte qui perd ce droit coupe ses
 * agents sans qu'on ait à révoquer leurs jetons.
 */
@Controller("agent/v1")
export class GuichetController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reglages: ReglagesAssistantService,
    private readonly passages: PassagesService,
    private readonly actions: ActionsAgentService,
  ) {}

  @Get("etat")
  @Guichet()
  @RequiertPermission("assistant:use")
  async etat(@AgentDemande() agent: AgentResolu) {
    const reglages = await this.reglages.exigerActif();
    const [proprietaire, actif] = await Promise.all([
      this.prisma.user.findUniqueOrThrow({ where: { id: agent.userId }, select: { id: true, prenom: true, nom: true } }),
      this.prisma.agentPassage.findFirst({
        where: { proprietaireId: agent.userId, etat: { in: ["en_attente", "prise", "en_cours"] } },
        select: { id: true, etat: true },
      }),
    ]);
    return {
      proprietaire,
      mode: reglages.mode,
      jalonObligatoire: reglages.jalonObligatoire,
      typesAutorises: agent.typesAutorises,
      passageActif: actif,
    };
  }

  /** Attente longue : rend le premier passage en attente, ou `null` à l'échéance. */
  @Get("passages/suivant")
  @Guichet()
  @RequiertPermission("assistant:use")
  async suivant(@AgentDemande() agent: AgentResolu, @Query() requete: unknown) {
    await this.reglages.exigerActif();
    const { attendre } = valider(
      z.object({ attendre: z.coerce.number().int().min(0).max(SECONDES_ATTENTE_PASSAGE).optional() }),
      requete,
    );
    return this.passages.suivant(agent.userId, attendre ?? SECONDES_ATTENTE_PASSAGE);
  }

  @Post("passages")
  @Guichet()
  @RequiertPermission("assistant:use")
  async creer(@AgentDemande() agent: AgentResolu, @Body() corps: unknown) {
    await this.reglages.exigerActif();
    // Un corps vide vaut « tous les projets suivis ».
    const projectIds = valider(nouveauPassageSchema.optional(), corps)?.projectIds;
    return this.passages.creer(agent.userId, "manuel", agent.userId, projectIds ?? []);
  }

  @Post("passages/:id/prise")
  @Guichet()
  @RequiertPermission("assistant:use")
  async prendre(@Param("id") id: string, @AgentDemande() agent: AgentResolu) {
    await this.reglages.exigerActif();
    return this.passages.prendre(id, agent.userId, agent.jetonId);
  }

  @Post("passages/:id/progression")
  @Guichet()
  @RequiertPermission("assistant:use")
  async progression(@Param("id") id: string, @AgentDemande() agent: AgentResolu, @Body() corps: unknown) {
    await this.reglages.exigerActif();
    const { libelle } = valider(progressionPassageSchema, corps);
    await this.passages.exigerEnCours(id, agent.userId);
    const passage = await this.passages.signeDeVie(id, libelle);
    return { id: passage.id, etat: passage.etat, progression: passage.progression };
  }

  @Get("passages/:id/contexte")
  @Guichet()
  @RequiertPermission("assistant:use")
  async contexte(@Param("id") id: string, @AgentDemande() agent: AgentResolu, @Demande() d: ContexteDemande) {
    await this.reglages.exigerActif();
    return this.passages.contexte(id, agent.userId, d.permissions);
  }

  @Get("passages/:id/temps")
  @Guichet()
  @RequiertPermission("assistant:use")
  async temps(@Param("id") id: string, @AgentDemande() agent: AgentResolu, @Query() requete: unknown) {
    await this.reglages.exigerActif();
    await this.passages.detail(id, agent.userId);
    const q = valider(z.object({ du: dateSchema, au: dateSchema }), requete);
    // RG-ROB-02 — une plage bornée, et pas plus d'un an.
    bornerPlage({ debut: q.du, fin: q.au });
    return { saisies: await this.passages.temps(agent.userId, q.du, q.au) };
  }

  /** `RG-AST-04` — chaque action est exécutée tout de suite ; la réponse dit ce qui a été fait. */
  @Post("passages/:id/actions")
  @Guichet()
  @RequiertPermission("assistant:use")
  async agir(@Param("id") id: string, @AgentDemande() agent: AgentResolu, @Body() corps: unknown) {
    const reglages = await this.reglages.exigerActif();
    const { actions } = valider(lotActionsSchema, corps);
    const passage = await this.passages.exigerEnCours(id, agent.userId);
    await this.passages.signeDeVie(id);
    const resultats = await this.actions.executerLot(passage, agent, actions, reglages);
    await this.passages.signeDeVie(id);
    return {
      resultats,
      effectuees: resultats.filter((r) => r.etat === "effectuee").length,
      refusees: resultats.filter((r) => r.etat === "refusee").length,
    };
  }

  @Post("passages/:id/fin")
  @Guichet()
  @RequiertPermission("assistant:use")
  async fin(@Param("id") id: string, @AgentDemande() agent: AgentResolu, @Body() corps: unknown) {
    await this.reglages.exigerActif();
    const { etat, bilan, erreur } = valider(finPassageSchema, corps);
    return this.passages.finir(id, agent.userId, etat, bilan, erreur);
  }
}
