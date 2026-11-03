import { describe, it, expect } from "vitest";
import { planSuiviSchema } from "@rationarium/contracts";
import { brouillonDuPlan, corpsDuPlan } from "./SuiviAgent.js";
import { PERMISSION_DE_L_ONGLET } from "./Fiche.js";

/**
 * Fiche projet › Suivi — `EX-AST-03`.
 *
 * **Le raccord entre la lecture et l'écriture**, et rien d'autre : le corps
 * composé depuis ce que `GET /assistant/suivis/:projectId` rend doit être
 * accepté par le schéma de `PUT` (`planSuiviSchema` + `version`). Deux moitiés
 * justes qui ne se raccordent pas, c'est la famille de défauts la plus coûteuse
 * du dépôt.
 */
const PLAN_VIDE = { projectId: "p", consigne: null, sources: [], silenceJours: null, actif: false, version: 0 };

describe("EX-AST-03 — le plan de suivi se lit, s'édite et se renvoie", () => {
  it("un plan qui n'existe pas encore naît ACTIF — c'est ce que le serveur pose à la création", () => {
    expect(brouillonDuPlan(PLAN_VIDE).actif).toBe(true);
    expect(brouillonDuPlan({ ...PLAN_VIDE, version: 3, actif: false }).actif).toBe(false);
  });

  it("le corps composé depuis la lecture passe le schéma d'écriture, version comprise", () => {
    const lu = {
      projectId: "p",
      consigne: "Suivre la séance du CDR.",
      sources: [{ type: "courriel" as const, designation: "tag:cdr", libelle: "Courriel du CDR" }],
      silenceJours: 14,
      actif: true,
      version: 2,
    };
    const { corps } = corpsDuPlan(brouillonDuPlan(lu), lu.version);
    expect(corps).not.toBeNull();
    const { version, ...plan } = corps!;
    expect(version).toBe(2);
    expect(planSuiviSchema.safeParse(plan).success).toBe(true);
  });

  it("un libellé vide n'est pas envoyé : le contrat le veut ABSENT, pas vide", () => {
    const b = { ...brouillonDuPlan(PLAN_VIDE), sources: [{ type: "depot" as const, designation: " org/depot ", libelle: "  " }] };
    const { corps } = corpsDuPlan(b, 0);
    expect(corps?.sources).toEqual([{ type: "depot", designation: "org/depot" }]);
  });

  it("une source sans désignation est signalée sur SA ligne, et rien n'est envoyé", () => {
    const b = {
      ...brouillonDuPlan(PLAN_VIDE),
      sources: [
        { type: "courriel" as const, designation: "tag:x", libelle: "" },
        { type: "page" as const, designation: "   ", libelle: "" },
      ],
    };
    const r = corpsDuPlan(b, 0);
    expect(r.corps).toBeNull();
    expect(r.erreurs.sources).toEqual([1]);
  });

  it("`Number(\"\")` vaut zéro : un seuil vide vaut « jamais », pas « zéro jour »", () => {
    expect(corpsDuPlan({ ...brouillonDuPlan(PLAN_VIDE), silenceJours: "" }, 0).corps?.silenceJours).toBeNull();
    expect(corpsDuPlan({ ...brouillonDuPlan(PLAN_VIDE), silenceJours: "0" }, 0).erreurs.silence).toBe(true);
    expect(corpsDuPlan({ ...brouillonDuPlan(PLAN_VIDE), silenceJours: "366" }, 0).erreurs.silence).toBe(true);
    expect(corpsDuPlan({ ...brouillonDuPlan(PLAN_VIDE), silenceJours: "30" }, 0).corps?.silenceJours).toBe(30);
  });

  it("une consigne vidée s'efface, elle ne s'enregistre pas en chaîne vide", () => {
    expect(corpsDuPlan({ ...brouillonDuPlan(PLAN_VIDE), consigne: "   " }, 0).corps?.consigne).toBeNull();
  });
});

describe("RG-GEN-06 — l'onglet Suivi est gardé par la permission de sa route", () => {
  it("`assistant:use` garde `GET /assistant/suivis/:projectId`", () => {
    expect(PERMISSION_DE_L_ONGLET.suivi).toBe("assistant:use");
  });
});
