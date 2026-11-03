import { Body, Controller, Get, Param, Post, Put, Query } from "@nestjs/common";
import { z } from "zod";
import {
  ETATS_ACTION_AGENT,
  ETATS_PASSAGE,
  enumDe,
  nouveauJetonSchema,
  nouveauPassageSchema,
  planSuiviSchema,
  reglagesAssistantSchema,
} from "@rationarium/contracts";
import { Demande, RequiertPermission, type ContexteDemande } from "../commun/permissions.garde.js";
import { valider } from "../commun/http.js";
import { ReglagesAssistantService } from "./reglages.service.js";
import { PlanificationAssistantService } from "./planification.service.js";
import { JetonsAgentService } from "./jetons.service.js";
import { SuivisService } from "./suivis.service.js";
import { PassagesService } from "./passages.service.js";
import { ActionsAgentService } from "./actions.service.js";

/**
 * M22 — l'assistant de suivi, côté interface (`docs/assistant/SPEC-PHASE-1.md § 13`).
 *
 * Tout ce qui n'est pas réglage répond « introuvable » quand le module est
 * désactivé (`RG-AST-01`). Les réglages restent lisibles et modifiables par
 * `assistant:configure` : sans eux, on ne pourrait pas activer le module.
 *
 * Jetons, passages et actions sont bornés au compte connecté : chacun ne voit
 * et ne défait que ce que ses propres agents ont fait.
 */
@Controller("assistant")
export class AssistantController {
  constructor(
    private readonly reglages: ReglagesAssistantService,
    private readonly planification: PlanificationAssistantService,
    private readonly jetons: JetonsAgentService,
    private readonly suivis: SuivisService,
    private readonly passages: PassagesService,
    private readonly actions: ActionsAgentService,
  ) {}

  // ── Réglages — EX-AST-01, EX-AST-05 ──────────────────────────────────────

  @Get("reglages")
  @RequiertPermission("assistant:configure")
  lireReglages() {
    return this.reglages.lire();
  }

  @Put("reglages")
  @RequiertPermission("assistant:configure")
  async enregistrerReglages(@Body() corps: unknown, @Demande() d: ContexteDemande) {
    const reglages = valider(reglagesAssistantSchema, corps);
    const enregistres = await this.reglages.enregistrer(reglages, d.userId);
    await this.planification.synchroniser();
    return enregistres;
  }

  // ── État ────────────────────────────────────────────────────────────────

  /** Ce que l'écran affiche en tête : l'agent joignable, le passage en cours. */
  @Get("etat")
  @RequiertPermission("assistant:use")
  async etat(@Demande() d: ContexteDemande) {
    const reglages = await this.reglages.exigerActif();
    const [agent, jetons, passages] = await Promise.all([
      this.jetons.agentJoignable(d.userId),
      this.jetons.lister(d.userId),
      this.passages.lister(d.userId, { limite: 1 }),
    ]);
    return {
      mode: reglages.mode,
      planification: reglages.planification,
      agent,
      jetonsValides: jetons.filter((j) => j.etat === "valide").length,
      dernierPassage: passages[0] ?? null,
    };
  }

  // ── Jetons — EX-AST-02 ──────────────────────────────────────────────────

  @Get("jetons")
  @RequiertPermission("assistant:use")
  async listerJetons(@Demande() d: ContexteDemande) {
    await this.reglages.exigerActif();
    return this.jetons.lister(d.userId);
  }

  @Post("jetons")
  @RequiertPermission("assistant:use")
  async creerJeton(@Body() corps: unknown, @Demande() d: ContexteDemande) {
    await this.reglages.exigerActif();
    return this.jetons.creer(d.userId, valider(nouveauJetonSchema, corps));
  }

  @Post("jetons/:id/revoquer")
  @RequiertPermission("assistant:use")
  async revoquerJeton(@Param("id") id: string, @Demande() d: ContexteDemande) {
    await this.reglages.exigerActif();
    return this.jetons.revoquer(d.userId, id);
  }

  // ── Plans de suivi — EX-AST-03 ──────────────────────────────────────────

  @Get("suivis/:projectId")
  @RequiertPermission("assistant:use")
  async lireSuivi(@Param("projectId") projectId: string, @Demande() d: ContexteDemande) {
    await this.reglages.exigerActif();
    return this.suivis.lire(projectId, d.perimetre, d.permissions);
  }

  @Put("suivis/:projectId")
  @RequiertPermission("assistant:use")
  async ecrireSuivi(@Param("projectId") projectId: string, @Body() corps: unknown, @Demande() d: ContexteDemande) {
    await this.reglages.exigerActif();
    const donnees = valider(planSuiviSchema.extend({ version: z.number().int().min(0).optional() }), corps);
    return this.suivis.ecrire(projectId, donnees, d.userId, d.permissions);
  }

  // ── Passages — EX-AST-04, EX-AST-09 ─────────────────────────────────────

  @Get("passages")
  @RequiertPermission("assistant:use")
  async listerPassages(@Query() requete: unknown, @Demande() d: ContexteDemande) {
    await this.reglages.exigerActif();
    const q = valider(
      z.object({ etat: enumDe(ETATS_PASSAGE).optional(), limite: z.coerce.number().int().min(1).max(200).optional() }),
      requete,
    );
    return this.passages.lister(d.userId, { etat: q.etat, limite: q.limite ?? 50 });
  }

  @Post("passages")
  @RequiertPermission("assistant:use")
  async lancerPassage(@Body() corps: unknown, @Demande() d: ContexteDemande) {
    await this.reglages.exigerActif();
    // Un corps vide vaut « tous les projets suivis ».
    const projectIds = valider(nouveauPassageSchema.optional(), corps)?.projectIds;
    return this.passages.creer(d.userId, "manuel", d.userId, projectIds ?? []);
  }

  @Get("passages/:id")
  @RequiertPermission("assistant:use")
  async passage(@Param("id") id: string, @Demande() d: ContexteDemande) {
    await this.reglages.exigerActif();
    return this.passages.detail(id, d.userId);
  }

  @Post("passages/:id/annuler")
  @RequiertPermission("assistant:use")
  async annulerPassage(@Param("id") id: string, @Demande() d: ContexteDemande) {
    await this.reglages.exigerActif();
    return this.passages.annuler(id, d.userId);
  }

  @Post("passages/:id/defaire")
  @RequiertPermission("assistant:use")
  async defairePassage(@Param("id") id: string, @Demande() d: ContexteDemande) {
    await this.reglages.exigerActif();
    return this.actions.defairePassage(id, d.userId);
  }

  // ── Actions — EX-AST-06, EX-AST-07 ──────────────────────────────────────

  @Get("actions")
  @RequiertPermission("assistant:use")
  async listerActions(@Query() requete: unknown, @Demande() d: ContexteDemande) {
    await this.reglages.exigerActif();
    const q = valider(
      z.object({
        passageId: z.uuid().optional(),
        projectId: z.uuid().optional(),
        etat: enumDe(ETATS_ACTION_AGENT).optional(),
        limite: z.coerce.number().int().min(1).max(500).optional(),
        avant: z.coerce.date().optional(),
      }),
      requete,
    );
    return this.actions.lister(d.userId, { ...q, limite: q.limite ?? 100 });
  }

  @Post("actions/:id/defaire")
  @RequiertPermission("assistant:use")
  async defaireAction(@Param("id") id: string, @Demande() d: ContexteDemande) {
    await this.reglages.exigerActif();
    return this.actions.defaire(id, d.userId);
  }
}
