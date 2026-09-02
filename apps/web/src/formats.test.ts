import { describe, it, expect, afterEach } from "vitest";
import {
  appliquerReglages,
  formaterDate,
  formaterHeure,
  formaterMois,
  premierJourSemaine,
  joursVisibles,
  numeroDeSemaine,
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

/**
 * L-20, vue 08 — l'en-tête de la vue Mois titre le MOIS, pas une plage.
 *
 * « Du 01/08/2026 au 31/08/2026 » dit la même chose que « Août 2026 » en trois
 * fois plus large, sur une barre d'outils qui débordait déjà. La maquette 08
 * titre le mois ; c'est ce que ce format rend.
 */
describe("Le mois d'un en-tête de planning", () => {
  it("porte la majuscule d'intitulé, que `Intl` ne met pas en français", () => {
    // `Intl` rend « août 2026 » : la minuscule est la règle en cours de
    // phrase, pas en tête d'un intitulé.
    expect(formaterMois("2026-08-01")).toBe("Août 2026");
  });

  it("nomme le mois du jour donné, pas le mois courant", () => {
    expect(formaterMois("2026-01-31")).toBe("Janvier 2026");
    expect(formaterMois("2026-12-01")).toBe("Décembre 2026");
  });

  it("ne se laisse pas déborder par le fuseau : le 1er reste dans son mois", () => {
    // Lu en heure locale, `2026-03-01T00:00:00Z` bascule en février à l'ouest
    // de Greenwich. Le formatage est ancré en UTC pour cette raison.
    expect(formaterMois("2026-03-01")).toBe("Mars 2026");
  });

  it("rend un tiret cadratin sur une valeur absente, comme les autres formats", () => {
    expect(formaterMois(null)).toBe("—");
    expect(formaterMois(undefined)).toBe("—");
  });
});

/**
 * `EX-RPT-13` — le numéro de semaine gradue les deux frises de Gantt.
 *
 * Le défaut qu'il portait ne se voyait qu'au passage d'année, sur une seule
 * graduation de l'année : c'est pourquoi il se contrôle ici, aux dates exactes
 * où il apparaissait, et non par un échantillon quelconque.
 */
describe("Le numéro de semaine ISO", () => {
  const semaine = (iso: string) => numeroDeSemaine(new Date(`${iso}T00:00:00.000Z`));

  it("ne saute aucun numéro au passage d'année", () => {
    // La semaine du 29 décembre 2025 porte le jeudi 1er janvier 2026 : elle
    // est la première de 2026, et non la cinquante-troisième de 2025. Le
    // calcul précédent rendait 53, puis 2 pour la suivante — sans jamais
    // écrire S1.
    expect(semaine("2025-12-29")).toBe(1);
    expect(semaine("2026-01-05")).toBe(2);
    expect(semaine("2026-01-12")).toBe(3);
  });

  it("rattache une semaine à l'année de son jeudi, dans les deux sens", () => {
    // 2024 comptait cinquante-deux semaines ; le 30 décembre 2024 ouvre donc
    // la première de 2025, dont le jeudi est le 2 janvier.
    expect(semaine("2024-12-30")).toBe(1);
    // À l'inverse, le 1er janvier 2027 est un vendredi : sa semaine a pour
    // jeudi le 31 décembre 2026, et reste la cinquante-troisième de 2026.
    expect(semaine("2027-01-01")).toBe(53);
  });

  it("donne le même numéro à tous les jours d'une même semaine", () => {
    const lundi = semaine("2026-06-01");
    for (const jour of ["2026-06-02", "2026-06-04", "2026-06-07"]) {
      expect(semaine(jour)).toBe(lundi);
    }
    expect(semaine("2026-06-08")).toBe(lundi + 1);
  });
});
