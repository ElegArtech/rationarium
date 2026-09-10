import { describe, expect, it } from "vitest";
import { languePublique } from "./langue-publique.js";

describe("EX-PRM-03 — langue publique de l'organisation", () => {
  it("déduit la langue de la région globale quand aucune préférence locale n'existe", () => {
    expect(languePublique({ "display.locale": "fr-FR" }, null)).toBe("fr");
    expect(languePublique({ "display.locale": "en-US" }, null)).toBe("en");
  });

  it("préserve une préférence de langue déjà choisie sur l'appareil", () => {
    expect(languePublique({ "display.locale": "en-US" }, "fr")).toBeNull();
    expect(languePublique({ "display.locale": "fr-FR" }, "en")).toBeNull();
  });
});
