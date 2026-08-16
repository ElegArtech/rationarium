import { describe, it, expect } from "vitest";
import { decisionAction } from "./action-protegee.js";

/**
 * RG-GEN-06 — « Une action interdite est masquée ou désactivée avec
 * explication — jamais proposée puis refusée. »
 *
 * La décision se vérifie sans monter de DOM. Le rendu est exercé ailleurs.
 */
describe("RG-GEN-06 — action interdite", () => {
  const avec = (...p: string[]) => new Set(p);

  it("laisse passer quand la permission est détenue", () => {
    expect(decisionAction("projects:create", avec("projects:create"))).toBe("autorisee");
  });

  it("masque quand l'action n'a aucun sens pour ce profil", () => {
    expect(decisionAction("audit:read", avec(), "masquer")).toBe("masquee");
  });

  it("désactive par défaut — l'utilisateur doit comprendre pourquoi", () => {
    expect(decisionAction("leaves:approve", avec())).toBe("desactivee");
  });

  it("ne propose jamais puis ne refuse : aucune décision n'est « proposer »", () => {
    const toutes = [
      decisionAction("x:y", avec()),
      decisionAction("x:y", avec(), "masquer"),
      decisionAction("x:y", avec("x:y")),
    ];
    expect(new Set(toutes)).toEqual(new Set(["desactivee", "masquee", "autorisee"]));
  });

  it("la permission voisine ne suffit pas — liste blanche stricte, RG-DROITS-03", () => {
    expect(decisionAction("projects:manage_any", avec("projects:read"))).toBe("desactivee");
  });
});
