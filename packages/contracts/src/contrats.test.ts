import { describe, it, expect } from "vitest";
import { VOCABULAIRES, PRIORITES, STATUTS_PROJET, STATUTS_CONGE } from "./vocabulaires.js";
import {
  PERMISSIONS,
  DOMAINES,
  NOMBRE_PERMISSIONS,
  estAuCatalogue,
  PERMISSIONS_GESTION_GLOBALE,
} from "./permissions.js";
import { MODELES_ROLES, NOMBRE_MODELES, modeleParCode } from "./roles.js";

describe("vocabulaires — cadrage/01 § 4.1", () => {
  it("§ 4.1 — priorité : quatre niveaux, conformes à l'arbitrage B1", () => {
    expect(PRIORITES.map((p) => p.code)).toEqual(["low", "normal", "high", "critical"]);
  });

  it("§ 4.1 — statut de projet : cinq valeurs, au libellé des maquettes", () => {
    expect(STATUTS_PROJET.map((s) => s.code)).toEqual([
      "draft",
      "active",
      "paused",
      "done",
      "cancelled",
    ]);
    expect(STATUTS_PROJET.find((s) => s.code === "paused")?.fr).toBe("Suspendu");
  });

  it("RG-CNG-01 — le statut de congé porte l'état transitoire d'annulation demandée", () => {
    expect(STATUTS_CONGE.map((s) => s.code)).toContain("cancellation_requested");
  });

  it("parti pris n° 5 — aucun doublon de code dans un vocabulaire", () => {
    for (const [nom, termes] of Object.entries(VOCABULAIRES)) {
      const codes = termes.map((t) => t.code);
      expect(new Set(codes).size, `doublon de code dans « ${nom} »`).toBe(codes.length);
    }
  });

  it("parti pris n° 5 — aucun doublon de libellé dans un vocabulaire", () => {
    for (const [nom, termes] of Object.entries(VOCABULAIRES)) {
      for (const langue of ["fr", "en"] as const) {
        const libelles = termes.map((t) => t[langue]);
        expect(new Set(libelles).size, `doublon de libellé ${langue} dans « ${nom} »`).toBe(
          libelles.length,
        );
      }
    }
  });

  it("RG-GEN-08 — chaque terme porte ses libellés français et anglais", () => {
    for (const [nom, termes] of Object.entries(VOCABULAIRES)) {
      for (const t of termes) {
        expect(t.fr.length, `libellé fr manquant dans « ${nom} »`).toBeGreaterThan(0);
        expect(t.en.length, `libellé en manquant dans « ${nom} »`).toBeGreaterThan(0);
      }
    }
  });
});

describe("catalogue de permissions — cadrage/01 § 3.2", () => {
  it("couvre les 24 domaines du cadrage", () => {
    expect(DOMAINES).toHaveLength(24);
    for (const d of DOMAINES) {
      expect(
        PERMISSIONS.some((p) => p.startsWith(`${d}:`)),
        `aucune permission pour le domaine « ${d} »`,
      ).toBe(true);
    }
  });

  it("respecte la nomenclature domaine:action, sans exception", () => {
    for (const p of PERMISSIONS) {
      expect(p, `nomenclature invalide : ${p}`).toMatch(/^[a-z_]+:[a-z_A-Z]+$/);
      const [domaine] = p.split(":");
      expect(DOMAINES, `domaine inconnu : ${domaine}`).toContain(domaine);
    }
  });

  it("ne contient aucun doublon", () => {
    expect(new Set(PERMISSIONS).size).toBe(PERMISSIONS.length);
  });

  it("le nombre de permissions ne dérive pas en silence", () => {
    // Le cadrage annonçait « ≈ 125 ». L'énumération dérivée en donne davantage :
    // voir la décision consignée en tête de permissions.ts. Ce test n'impose pas
    // une valeur juste, il impose qu'un changement de volume soit VU.
    expect(NOMBRE_PERMISSIONS).toBe(152);
  });

  it("RG-SCOPE-03 — les permissions de gestion globale appartiennent au catalogue", () => {
    for (const p of PERMISSIONS_GESTION_GLOBALE) {
      expect(estAuCatalogue(p), `hors catalogue : ${p}`).toBe(true);
    }
  });

  it("RG-DROITS-03 — une permission inventée n'est pas au catalogue", () => {
    expect(estAuCatalogue("projects:do_whatever")).toBe(false);
    expect(estAuCatalogue("inexistant:read")).toBe(false);
  });
});

describe("modèles de rôles — cadrage/01 § 3.2", () => {
  it("les 26 modèles annoncés existent", () => {
    expect(NOMBRE_MODELES).toBe(26);
  });

  it("couvre les neuf familles, avec les effectifs du cadrage", () => {
    const attendu: Record<string, number> = {
      Administration: 2,
      Management: 4,
      "Conduite de projet": 3,
      Contribution: 3,
      RH: 2,
      Transverse: 4,
      Informatique: 2,
      Observation: 3,
      Restreints: 3,
    };
    const constate: Record<string, number> = {};
    for (const m of MODELES_ROLES) constate[m.famille] = (constate[m.famille] ?? 0) + 1;
    expect(constate).toEqual(attendu);
  });

  it("les codes attendus par le cadrage sont tous présents", () => {
    const attendus = [
      "ADMIN", "ADMIN_DELEGATED",
      "PORTFOLIO_MANAGER", "MANAGER", "MANAGER_PROJECT_FOCUS", "MANAGER_HR_FOCUS",
      "PROJECT_LEAD", "PROJECT_LEAD_JUNIOR", "TECHNICAL_LEAD",
      "PROJECT_CONTRIBUTOR", "PROJECT_CONTRIBUTOR_LIGHT", "FUNCTIONAL_REFERENT",
      "HR_OFFICER", "HR_OFFICER_LIGHT",
      "THIRD_PARTY_MANAGER", "CONTROLLER", "BUDGET_ANALYST", "DATA_ANALYST",
      "IT_SUPPORT", "IT_INFRASTRUCTURE",
      "OBSERVER_FULL", "OBSERVER_PROJECTS_ONLY", "OBSERVER_HR_ONLY",
      "BASIC_USER", "EXTERNAL_PRESTATAIRE", "STAGIAIRE_ALTERNANT",
    ];
    for (const code of attendus) {
      expect(modeleParCode(code), `modèle manquant : ${code}`).toBeDefined();
    }
  });

  it("RG-DROITS-03 — aucun modèle ne référence une permission hors catalogue", () => {
    for (const m of MODELES_ROLES) {
      for (const p of m.permissions) {
        expect(estAuCatalogue(p), `${m.code} référence une permission hors catalogue : ${p}`).toBe(
          true,
        );
      }
    }
  });

  it("aucun modèle ne contient de permission en double", () => {
    for (const m of MODELES_ROLES) {
      expect(new Set(m.permissions).size, `doublon dans ${m.code}`).toBe(m.permissions.length);
    }
  });

  it("RG-DROITS-02 — les rôles système sont marqués comme tels", () => {
    const systeme = MODELES_ROLES.filter((m) => m.systeme).map((m) => m.code);
    expect(systeme).toEqual([
      "ADMIN",
      "ADMIN_DELEGATED",
      "PORTFOLIO_MANAGER",
      "MANAGER",
      "PROJECT_LEAD",
      "PROJECT_CONTRIBUTOR",
      "HR_OFFICER",
      "BASIC_USER",
    ]);
  });

  it("ADMIN détient l'intégralité du catalogue", () => {
    expect(modeleParCode("ADMIN")?.permissions).toHaveLength(NOMBRE_PERMISSIONS);
  });

  it("ADMIN_DELEGATED ne peut ni gouverner les droits ni lire le journal d'audit", () => {
    const p = modeleParCode("ADMIN_DELEGATED")!.permissions;
    expect(p).not.toContain("users:manage_roles");
    expect(p).not.toContain("users:manage_permissions");
    expect(p).not.toContain("users:delete_permanently");
    expect(p.some((x) => x.startsWith("audit:"))).toBe(false);
  });

  it("les observateurs n'écrivent jamais", () => {
    const ecriture = /:(create|update|delete|manage_|approve|assign|import|generate|archive|reset|deactivate)/;
    for (const code of ["OBSERVER_FULL", "OBSERVER_PROJECTS_ONLY", "OBSERVER_HR_ONLY"]) {
      const p = modeleParCode(code)!.permissions;
      expect(p.filter((x) => ecriture.test(x)), `${code} détient une permission d'écriture`).toEqual(
        [],
      );
    }
  });

  it("IT_SUPPORT ne gouverne pas les rôles — la limite entre support et administration", () => {
    const p = modeleParCode("IT_SUPPORT")!.permissions;
    expect(p).toContain("users:reset_password");
    expect(p).not.toContain("users:manage_roles");
    expect(p).not.toContain("users:manage_permissions");
  });

  it("EXTERNAL_PRESTATAIRE n'accède ni aux congés, ni au télétravail, ni à l'annuaire", () => {
    const p = modeleParCode("EXTERNAL_PRESTATAIRE")!.permissions;
    expect(p.some((x) => x.startsWith("leaves:"))).toBe(false);
    expect(p.some((x) => x.startsWith("telework:"))).toBe(false);
    expect(p.some((x) => x.startsWith("users:"))).toBe(false);
  });

  it("CONTROLLER lit le journal d'audit et n'agit sur les données de personne", () => {
    const p = modeleParCode("CONTROLLER")!.permissions;
    expect(p).toContain("audit:read");

    // Un contrôleur reste un agent : il pose ses propres congés, déclare son
    // temps. Ce qu'il ne doit jamais avoir, c'est le pouvoir d'agir sur les
    // données d'autrui — c'est ce qui rend son observation crédible.
    const surAutrui = p.filter((x) =>
      /:(manage_any|approve|self_approve|declare_for_other|manage_roles|manage_permissions|deactivate|delete_permanently|reset_password|manage_balances|manage_types)$/.test(
        x,
      ),
    );
    expect(surAutrui).toEqual([]);
  });

  it("tout modèle non système reste composable — RG-DROITS-01", () => {
    // Un modèle est un point de départ : aucun ne doit être vide ni figé.
    for (const m of MODELES_ROLES) {
      expect(m.permissions.length, `${m.code} est vide`).toBeGreaterThan(0);
    }
  });
});
