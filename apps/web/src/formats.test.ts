import { describe, it, expect, afterEach } from "vitest";
import {
  appliquerReglages,
  formaterDate,
  formaterHeure,
  premierJourSemaine,
  joursVisibles,
} from "./formats.js";

/**
 * L-28 — `RG-GEN-09` : les formats **suivent le paramétrage global**.
 *
 * La vue 31 offrait cinq formats de date et trois d'heure ; ils étaient
 * enregistrés, relus, affichés, et **n'agissaient nulle part**. Un contrôle qui
 * vérifie qu'un réglage s'enregistre ne dit rien de ce qui compte : qu'il
 * change quelque chose.
 */

afterEach(() => appliquerReglages({}));

describe("Les cinq formats de date", () => {
  const date = "2026-03-01";

  it("JJ/MM/AAAA par défaut", () => {
    expect(formaterDate(date)).toBe("01/03/2026");
  });

  it("AAAA-MM-JJ — l'ordre ISO", () => {
    appliquerReglages({ "display.dateFormat": "AAAA-MM-JJ" });
    expect(formaterDate(date)).toBe("2026-03-01");
  });

  it("MM/JJ/AAAA — L'ORDRE AMÉRICAIN, qui inverse jour et mois", () => {
    appliquerReglages({ "display.dateFormat": "MM/JJ/AAAA" });
    // C'est le format le plus dangereux du lot : « 03/01 » se lit 3 janvier
    // ou 1er mars selon le lecteur. Le proposer impose de le rendre juste.
    expect(formaterDate(date)).toBe("03/01/2026");
  });

  it("J Mois AAAA — la forme longue", () => {
    appliquerReglages({ "display.dateFormat": "J Mois AAAA" });
    expect(formaterDate(date)).toBe("1 mars 2026");
  });

  it("Jour J Mois AAAA — avec le jour de la semaine", () => {
    appliquerReglages({ "display.dateFormat": "Jour J Mois AAAA" });
    expect(formaterDate(date)).toContain("dimanche");
  });

  it("un format inconnu retombe sur le défaut plutôt que de rendre vide", () => {
    appliquerReglages({ "display.dateFormat": "n'importe quoi" });
    expect(formaterDate(date)).toBe("01/03/2026");
  });

  it("UNE DATE MÉTIER N'A PAS DE FUSEAU — le 1er mars le reste partout", () => {
    // `new Date("2026-03-01T00:00:00")` lu à Tahiti devient le 28 février.
    appliquerReglages({ "display.dateFormat": "AAAA-MM-JJ" });
    expect(formaterDate("2026-03-01")).toBe("2026-03-01");
  });
});

describe("Les trois formats d'heure", () => {
  it("24 heures par défaut", () => {
    expect(formaterHeure("14:30")).toBe("14:30");
  });

  it("24 heures avec secondes", () => {
    appliquerReglages({ "display.timeFormat": "24h-secondes" });
    expect(formaterHeure("14:30")).toBe("14:30:00");
    expect(formaterHeure("14:30:45")).toBe("14:30:45");
  });

  it("12 heures, avec son suffixe", () => {
    appliquerReglages({ "display.timeFormat": "12h" });
    expect(formaterHeure("14:30")).toBe("02:30 PM");
  });

  it("MINUIT ET MIDI — les deux cas que le format 12 heures rate", () => {
    appliquerReglages({ "display.timeFormat": "12h" });
    // 00:00 n'est pas « 00:00 AM », et 12:00 n'est pas « 00:00 PM ».
    expect(formaterHeure("00:00")).toBe("12:00 AM");
    expect(formaterHeure("12:00")).toBe("12:00 PM");
  });

  it("une valeur absente ou illisible ne produit pas « NaN:NaN »", () => {
    expect(formaterHeure(null)).toBe("—");
    expect(formaterHeure("")).toBe("—");
    expect(formaterHeure("bonjour")).toBe("bonjour");
  });
});

describe("Les réglages de planning", () => {
  it("le premier jour de la semaine se lit, et se borne", () => {
    expect(premierJourSemaine()).toBe(1);
    appliquerReglages({ "display.firstDayOfWeek": "0" });
    expect(premierJourSemaine()).toBe(0);
    // Une valeur hors des deux seules possibles retombe sur lundi.
    appliquerReglages({ "display.firstDayOfWeek": "9" });
    expect(premierJourSemaine()).toBe(1);
  });

  it("les jours visibles se lisent, et ne sont jamais vides", () => {
    expect([...joursVisibles()].sort()).toEqual([1, 2, 3, 4, 5]);
    appliquerReglages({ "planning.visibleDays": "" });
    expect([...joursVisibles()].sort()).toEqual([1, 2, 3, 4, 5]);
    appliquerReglages({ "planning.visibleDays": "0,6" });
    expect([...joursVisibles()].sort()).toEqual([0, 6]);
  });
});
