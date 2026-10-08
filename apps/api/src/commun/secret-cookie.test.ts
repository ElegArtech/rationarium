import { describe, it, expect } from "vitest";
import { secretDesCookies, SECRET_DE_DEVELOPPEMENT } from "./secret-cookie.js";

/**
 * Le secret de session ne retombe jamais sur la valeur publiée du dépôt en
 * production. La variable VIDE est le cas qui compte : c'est ainsi que Compose
 * transmet une variable non renseignée, et `??` la laissait passer.
 */
describe("COOKIE_SECRET — pas de secret par défaut en production", () => {
  it("en production, une variable ABSENTE arrête le démarrage", () => {
    expect(() => secretDesCookies({ NODE_ENV: "production" })).toThrow(/COOKIE_SECRET/);
  });

  it("en production, une variable VIDE ou blanche arrête aussi le démarrage", () => {
    expect(() => secretDesCookies({ NODE_ENV: "production", COOKIE_SECRET: "" })).toThrow(/COOKIE_SECRET/);
    expect(() => secretDesCookies({ NODE_ENV: "production", COOKIE_SECRET: "   " })).toThrow(/COOKIE_SECRET/);
  });

  it("en production, un secret renseigné est employé tel quel", () => {
    expect(secretDesCookies({ NODE_ENV: "production", COOKIE_SECRET: "a1b2c3" })).toBe("a1b2c3");
  });

  /*
   * Le contrôle qui compte est celui qui ASSEMBLE l'application : une
   * fonction juste que `main.ts` n'appellerait pas ne protégerait rien.
   */
  it("l'application assemblée refuse de démarrer en production avec COOKIE_SECRET vide", async () => {
    const { creerApplication } = await import("../main.js");
    const avant = { NODE_ENV: process.env["NODE_ENV"], COOKIE_SECRET: process.env["COOKIE_SECRET"] };
    process.env["NODE_ENV"] = "production";
    process.env["COOKIE_SECRET"] = "";
    try {
      await expect(creerApplication()).rejects.toThrow(/COOKIE_SECRET/);
    } finally {
      process.env["NODE_ENV"] = avant.NODE_ENV;
      if (avant.COOKIE_SECRET === undefined) delete process.env["COOKIE_SECRET"];
      else process.env["COOKIE_SECRET"] = avant.COOKIE_SECRET;
    }
  }, 60_000);

  it("hors production, le repli de développement demeure", () => {
    expect(secretDesCookies({ NODE_ENV: "test" })).toBe(SECRET_DE_DEVELOPPEMENT);
    expect(secretDesCookies({ COOKIE_SECRET: "" })).toBe(SECRET_DE_DEVELOPPEMENT);
  });
});
