import { describe, it, expect } from "vitest";
import { navigationVisible, NAVIGATION } from "./navigation.js";
import { modeleParCode, estAuCatalogue } from "@rationarium/contracts";

const permissionsDe = (code: string) =>
  new Set(modeleParCode(code)!.permissions);

describe("§ B — navigation par droits", () => {
  it("toute permission citée par la navigation existe au catalogue", () => {
    for (const g of NAVIGATION) {
      for (const e of g.entrees) {
        expect(estAuCatalogue(e.permission), `${e.cle} → ${e.permission}`).toBe(true);
      }
    }
  });

  it("RG-GEN-06 — les entrées sans droit ne sont pas affichées, pas désactivées", () => {
    const vide = navigationVisible(new Set());
    expect(vide).toEqual([]);
  });

  it("un groupe dont toutes les entrées disparaissent disparaît lui aussi", () => {
    const seulPlanning = navigationVisible(new Set(["planning:read"]));
    expect(seulPlanning.map((g) => g.cle)).toEqual(["pilotage"]);
    expect(seulPlanning[0]!.entrees.map((e) => e.cle)).toEqual(["tableauDeBord", "planning"]);
  });

  it("Camille, contributrice — 8 entrées, exactement celles de la maquette", () => {
    const vue = navigationVisible(permissionsDe("PROJECT_CONTRIBUTOR"));
    const entrees = vue.flatMap((g) => g.entrees.map((e) => e.cle));
    expect(entrees).toEqual([
      "tableauDeBord", "planning",
      "projetsListe", "taches", "evenements",
      "conges", "teletravail", "tempsPasse",
    ]);
    // Le brief est explicite : ni Administration, ni Rapports, ni Utilisateurs.
    expect(vue.map((g) => g.cle)).not.toContain("administration");
  });

  it("Fatou, manager — 12 entrées, dont Rapports, Utilisateurs et Départements", () => {
    const vue = navigationVisible(permissionsDe("MANAGER"));
    const entrees = vue.flatMap((g) => g.entrees.map((e) => e.cle));
    expect(entrees).toHaveLength(12);
    expect(entrees).toContain("rapports");
    expect(entrees).toContain("utilisateurs");
    expect(entrees).toContain("departements");
    expect(entrees).toContain("competences");
    expect(entrees).not.toContain("journalAudit");
  });

  it("Karim, administrateur — les 18 entrées", () => {
    const vue = navigationVisible(permissionsDe("ADMIN"));
    const total = vue.reduce((n, g) => n + g.entrees.length, 0);
    expect(total).toBe(18);
    expect(total).toBe(NAVIGATION.reduce((n, g) => n + g.entrees.length, 0));
    expect(vue.map((g) => g.cle)).toContain("administration");
  });

  it("Hugo, RH — voit les congés, pas l'administration", () => {
    const vue = navigationVisible(permissionsDe("HR_OFFICER"));
    const entrees = vue.flatMap((g) => g.entrees.map((e) => e.cle));
    expect(entrees).toContain("conges");
    expect(entrees).toContain("teletravail");
    expect(entrees).not.toContain("journalAudit");
  });

  it("un prestataire externe ne voit ni congés ni annuaire", () => {
    const vue = navigationVisible(permissionsDe("EXTERNAL_PRESTATAIRE"));
    const entrees = vue.flatMap((g) => g.entrees.map((e) => e.cle));
    expect(entrees).not.toContain("conges");
    expect(entrees).not.toContain("teletravail");
    expect(entrees).not.toContain("utilisateurs");
    expect(entrees).toContain("taches");
  });
});
