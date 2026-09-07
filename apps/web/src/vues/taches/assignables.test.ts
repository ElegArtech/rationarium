import { describe, it, expect } from "vitest";
import { assignables, CHEMIN_ANNUAIRE, PERMISSION_ANNUAIRE, type Candidat } from "./assignables.js";

/**
 * `RG-TSK-15` — « Les assignés proposés sont en priorité les membres du
 * projet ; si le projet n'a pas de membre, tous les utilisateurs sont
 * proposés, et l'interface l'explique. »
 * `RG-GEN-06` — on ne demande pas ce qui sera refusé.
 * `RG-AUTH-05` — un compte désactivé ne se propose plus.
 *
 * Le défaut relevé en recette : la fenêtre de création appelle
 * `GET /utilisateurs`, gardé par `users:read`, refusé en `403` à un
 * contributeur. La liste des assignés était donc vide et muette, le repli de
 * `RG-TSK-15` inapplicable, et un `403` était journalisé à chaque ouverture.
 */
describe("RG-TSK-15 — les assignés proposés", () => {
  const moi = { id: "moi", prenom: "Camille", nom: "Roux" };
  const membre = { id: "m1", prenom: "Rémi", nom: "Chastagner" };
  const autre = { id: "a1", prenom: "Fatou", nom: "Diallo" };

  const base = {
    membres: [] as Candidat[],
    equipeChargee: true,
    annuaire: [] as Candidat[],
    annuaireLisible: true,
    moi,
  };

  it("dans un projet qui a des membres, ce sont eux", () => {
    const r = assignables({ ...base, projectId: "p1", membres: [membre], annuaire: [autre] });
    expect(r.candidats).toEqual([membre]);
    expect(r.indice).toBe("membresDuProjet");
  });

  it("projet sans membre : tous les utilisateurs, et l'interface le dit", () => {
    const r = assignables({ ...base, projectId: "p1", annuaire: [autre] });
    expect(r.candidats).toEqual([autre]);
    expect(r.indice).toBe("projetSansMembre");
    expect(r.alerte).toBe(true);
  });

  it("hors projet : tous les utilisateurs, sans alerte — c'est le cas nominal", () => {
    const r = assignables({ ...base, projectId: null, annuaire: [autre] });
    expect(r.candidats).toEqual([autre]);
    expect(r.indice).toBe("tousLesUtilisateurs");
    expect(r.alerte).toBe(false);
  });

  it("tant que l'équipe n'a pas répondu, on ne conclut pas au projet sans membre", () => {
    const r = assignables({ ...base, projectId: "p1", equipeChargee: false, annuaire: [autre] });
    expect(r.indice).toBe("membresDuProjet");
    expect(r.candidats).toEqual([]);
  });

  it("SANS L'ANNUAIRE, LA LISTE N'EST PLUS VIDE ET MUETTE — c'est le défaut relevé", () => {
    const r = assignables({ ...base, projectId: null, annuaireLisible: false });
    expect(r.candidats).toEqual([moi]);
    expect(r.indice).toBe("annuaireInaccessible");
    expect(r.alerte).toBe(true);
  });

  it("sans l'annuaire, les membres du projet restent proposés : le repli n'a pas lieu", () => {
    const r = assignables({
      ...base,
      projectId: "p1",
      membres: [membre],
      annuaireLisible: false,
    });
    expect(r.candidats).toEqual([membre]);
    expect(r.indice).toBe("membresDuProjet");
  });

  it("RG-AUTH-05 — l'annuaire est demandé ACTIF, le filtre est au serveur", () => {
    expect(CHEMIN_ANNUAIRE).toBe("/utilisateurs?actif=true");
  });

  it("la permission exercée est celle qui garde réellement la route", () => {
    expect(PERMISSION_ANNUAIRE).toBe("users:read");
  });
});
