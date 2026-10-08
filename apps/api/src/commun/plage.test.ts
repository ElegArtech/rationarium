import { describe, it, expect } from "vitest";
import { HttpException } from "@nestjs/common";
import { bornerPlage, joursCouverts, MAX_JOURS_PLAGE } from "./plage.js";

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

const refus = (f: () => unknown): { statut: number; corps: unknown } => {
  try {
    f();
  } catch (e) {
    if (e instanceof HttpException) return { statut: e.getStatus(), corps: e.getResponse() };
    throw e;
  }
  throw new Error("aucun refus");
};

describe("RG-ROB-02 — la borne d'une plage de dates", () => {
  it("RG-ROB-02 — une année bissextile entière tient dans la borne, un jour de plus non", () => {
    expect(joursCouverts(d("2028-01-01"), d("2028-12-31"))).toBe(366);
    expect(() => bornerPlage({ debut: d("2028-01-01"), fin: d("2028-12-31") })).not.toThrow();
    const r = refus(() => bornerPlage({ debut: d("2028-01-01"), fin: d("2029-01-01") }));
    expect(r).toEqual({
      statut: 400,
      corps: expect.objectContaining({
        cle: "erreurs:periodeTropEtendue",
        detail: { maxJours: MAX_JOURS_PLAGE },
      }) as unknown,
    });
  });

  it("RG-ROB-02 — fin < debut est refusée en 400 erreurs:datesIncoherentes ; un seul jour passe", () => {
    expect(refus(() => bornerPlage({ debut: d("2026-03-02"), fin: d("2026-03-01") }))).toEqual({
      statut: 400,
      corps: expect.objectContaining({ cle: "erreurs:datesIncoherentes" }) as unknown,
    });
    expect(() => bornerPlage({ debut: d("2026-03-01"), fin: d("2026-03-01") })).not.toThrow();
  });

  it("RG-ROB-02 — une borne absente n'est pas contrôlée ici (plage_incomplete reste au service)", () => {
    expect(() => bornerPlage({ debut: d("1970-01-01") })).not.toThrow();
    expect(() => bornerPlage({ debut: null, fin: d("9999-12-31") })).not.toThrow();
  });

  it("RG-ROB-02 — la borne se passe par appel", () => {
    expect(() => bornerPlage({ debut: d("2026-01-01"), fin: d("2027-12-31") }, 3 * 366)).not.toThrow();
  });
});
