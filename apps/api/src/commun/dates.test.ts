import { describe, expect, it } from "vitest";
import { debutDuJour, echeanceAujourdhui, echeanceDepassee } from "./dates.js";

/**
 * `RG-DSH-04` — « en retard » veut dire échéance DÉPASSÉE.
 *
 * Le défaut que ces cas gardent : les échéances sont des colonnes `@db.Date`,
 * donc à minuit UTC, et le code les comparait à `new Date()`, qui porte
 * l'heure. Une tâche due aujourd'hui était donc « en retard » dès la première
 * seconde de la journée — le seul jour où elle pouvait encore être tenue.
 *
 * Chaque cas fixe l'heure de la référence : à minuit, tout passait déjà ; ce
 * sont les heures de travail qui révélaient le défaut.
 */
describe("les échéances se comparent au JOUR, jamais à l'instant", () => {
  const jour = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
  const matin = new Date("2026-09-02T09:00:00.000Z");
  const soir = new Date("2026-09-02T23:59:59.000Z");

  it("RG-DSH-04 — une échéance d'AUJOURD'HUI n'est pas dépassée, à aucune heure", () => {
    expect(echeanceDepassee(jour("2026-09-02"), matin)).toBe(false);
    expect(echeanceDepassee(jour("2026-09-02"), soir)).toBe(false);
  });

  it("RG-DSH-04 — une échéance d'hier est dépassée", () => {
    expect(echeanceDepassee(jour("2026-09-01"), matin)).toBe(true);
  });

  it("RG-DSH-04 — une échéance à venir ne l'est pas", () => {
    expect(echeanceDepassee(jour("2026-09-03"), matin)).toBe(false);
  });

  it("une échéance absente n'est ni dépassée ni pour aujourd'hui", () => {
    expect(echeanceDepassee(null, matin)).toBe(false);
    expect(echeanceAujourdhui(null, matin)).toBe(false);
  });

  it("« aujourd'hui » et « dépassée » S'EXCLUENT : jamais les deux marques ensemble", () => {
    for (const iso of ["2026-09-01", "2026-09-02", "2026-09-03"]) {
      const d = jour(iso);
      expect(echeanceDepassee(d, matin) && echeanceAujourdhui(d, matin)).toBe(false);
    }
  });

  it("l'échéance du jour est reconnue quelle que soit l'heure de la référence", () => {
    expect(echeanceAujourdhui(jour("2026-09-02"), matin)).toBe(true);
    expect(echeanceAujourdhui(jour("2026-09-02"), soir)).toBe(true);
    expect(echeanceAujourdhui(jour("2026-09-03"), matin)).toBe(false);
  });

  it("debutDuJour ne modifie pas la date qu'on lui passe", () => {
    const reference = new Date("2026-09-02T09:00:00.000Z");
    debutDuJour(reference);
    expect(reference.toISOString()).toBe("2026-09-02T09:00:00.000Z");
  });
});
