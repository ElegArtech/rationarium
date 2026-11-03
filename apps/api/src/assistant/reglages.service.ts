import { Injectable } from "@nestjs/common";
import {
  PREFIXE_REGLAGES_ASSISTANT,
  REGLAGES_ASSISTANT_DEFAUT,
  reglagesAssistantSchema,
  type ReglagesAssistant,
} from "@rationarium/contracts";
import { PrismaService } from "../prisma.service.js";
import { AuditService } from "../commun/audit.service.js";
import { moduleIntrouvable } from "./erreurs.js";

const CLES = Object.keys(REGLAGES_ASSISTANT_DEFAUT) as (keyof ReglagesAssistant)[];

/**
 * Les réglages du module (`docs/assistant/SPEC-PHASE-1.md § 7`).
 *
 * Ils vivent dans `settings`, sous le préfixe `assistant.`, **jamais publics** :
 * le paramétrage général ne les lit ni ne les écrit, et ils ne passent que par
 * `GET/PUT /assistant/reglages`, gardés par `assistant:configure`.
 *
 * Une valeur illisible en base retombe sur son défaut, clé par clé. Une
 * réglage corrompu ne doit pas faire tomber le module entier — et surtout pas
 * l'activer : le défaut de `mode` est `desactive` (`RG-AST-01`).
 */
@Injectable()
export class ReglagesAssistantService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async lire(): Promise<ReglagesAssistant> {
    const lignes = await this.prisma.setting.findMany({
      where: { cle: { startsWith: PREFIXE_REGLAGES_ASSISTANT } },
      select: { cle: true, valeur: true },
    });
    const brut: Record<string, unknown> = { ...REGLAGES_ASSISTANT_DEFAUT };
    for (const { cle, valeur } of lignes) {
      const nom = cle.slice(PREFIXE_REGLAGES_ASSISTANT.length) as keyof ReglagesAssistant;
      if (!CLES.includes(nom)) continue;
      const candidat = { ...brut, [nom]: decoder(nom, valeur) };
      if (reglagesAssistantSchema.safeParse(candidat).success) brut[nom] = candidat[nom];
    }
    return reglagesAssistantSchema.parse(brut);
  }

  async actif(): Promise<boolean> {
    return (await this.lire()).mode !== "desactive";
  }

  /** `RG-AST-01` — désactivé, le module répond « introuvable ». */
  async exigerActif(): Promise<ReglagesAssistant> {
    const reglages = await this.lire();
    if (reglages.mode === "desactive") throw moduleIntrouvable();
    return reglages;
  }

  async enregistrer(reglages: ReglagesAssistant, acteurId: string): Promise<ReglagesAssistant> {
    const avant = await this.lire();
    await this.prisma.$transaction(
      CLES.map((nom) =>
        this.prisma.setting.upsert({
          where: { cle: PREFIXE_REGLAGES_ASSISTANT + nom },
          create: { cle: PREFIXE_REGLAGES_ASSISTANT + nom, valeur: String(reglages[nom]), public: false },
          update: { valeur: String(reglages[nom]), public: false, version: { increment: 1 } },
        }),
      ),
    );
    await this.audit.tracer({
      action: "settings.update",
      typeEntite: "Setting",
      entiteId: "assistant",
      acteurId,
      detail: { avant, apres: reglages },
    });
    return this.lire();
  }
}

const decoder = (nom: keyof ReglagesAssistant, valeur: string): unknown => {
  switch (nom) {
    case "jalonObligatoire":
      return valeur === "true" ? true : valeur === "false" ? false : valeur;
    case "conservationJours":
    case "actionsParPassage":
      return Number(valeur);
    default:
      return valeur;
  }
};
