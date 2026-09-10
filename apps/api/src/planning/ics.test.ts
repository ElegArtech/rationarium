import { describe, it, expect } from "vitest";
import { genererIcs, analyserIcs, plier, deplier } from "./ics.js";

/**
 * `EX-PLN-15` — le format ICS.
 *
 * Ces tests portent sur les points où un lecteur strict rejette le fichier ou,
 * pire, l'accepte en décalant tout d'un jour. Aucun ne teste « ça produit du
 * texte » : ils testent ce qui se casse en silence.
 */

const ESTAMPILLE = new Date("2026-08-16T10:30:00.000Z");

const evenement = {
  uid: "evt-1@rationarium",
  titre: "Comité de pilotage",
  description: null,
  date: "2026-09-15",
  dateFin: "2026-09-15",
  journeeEntiere: false,
  heureDebut: "14:00",
  heureFin: "15:30",
};

describe("EX-PLN-15 — génération", () => {
  it("termine chaque ligne par CRLF — un lecteur strict rejette le fichier sinon", () => {
    const ics = genererIcs([evenement], ESTAMPILLE);
    expect(ics).toContain("BEGIN:VCALENDAR\r\n");
    // L'assertion qui porte : aucun LF nu.
    expect(/[^\r]\n/.test(ics)).toBe(false);
    expect(ics.endsWith("\r\n")).toBe(true);
  });

  it("LA FIN D'UNE JOURNÉE ENTIÈRE EST EXCLUSIVE — sinon tout décale d'un jour", () => {
    const ics = genererIcs(
      [{ ...evenement, journeeEntiere: true, heureDebut: null, heureFin: null }],
      ESTAMPILLE,
    );
    expect(ics).toContain("DTSTART;VALUE=DATE:20260915");
    // Un événement du 15 finit le 16. C'est la règle la plus facile à rater,
    // et elle ne se voit qu'en ouvrant le fichier dans un autre agenda.
    expect(ics).toContain("DTEND;VALUE=DATE:20260916");
  });

  it("un congé de plusieurs jours porte le lendemain de sa dernière journée", () => {
    const ics = genererIcs(
      [
        {
          ...evenement,
          date: "2026-07-01",
          dateFin: "2026-07-10",
          journeeEntiere: true,
          heureDebut: null,
          heureFin: null,
        },
      ],
      ESTAMPILLE,
    );
    expect(ics).toContain("DTSTART;VALUE=DATE:20260701");
    expect(ics).toContain("DTEND;VALUE=DATE:20260711");
  });

  it("un événement horaire porte ses deux horodatages", () => {
    const ics = genererIcs([evenement], ESTAMPILLE);
    expect(ics).toContain("DTSTART:20260915T140000");
    expect(ics).toContain("DTEND:20260915T153000");
  });

  it("échappe les quatre caractères de la RFC 5545", () => {
    const ics = genererIcs(
      [{ ...evenement, titre: "Réunion; budget, phase 1\\2", description: "Ligne 1\nLigne 2" }],
      ESTAMPILLE,
    );
    expect(ics).toContain("SUMMARY:Réunion\\; budget\\, phase 1\\\\2");
    expect(ics).toContain("DESCRIPTION:Ligne 1\\nLigne 2");
  });
});

describe("le pliage à 75 octets", () => {
  it("ne plie pas ce qui tient", () => {
    expect(plier("SUMMARY:court")).toBe("SUMMARY:court");
  });

  it("plie au-delà, et la continuation commence par une espace", () => {
    const plie = plier(`SUMMARY:${"a".repeat(200)}`);
    const lignes = plie.split("\r\n");
    expect(lignes.length).toBeGreaterThan(1);
    expect(lignes.slice(1).every((l) => l.startsWith(" "))).toBe(true);
  });

  it("COMPTE DES OCTETS, PAS DES CARACTÈRES — « é » en vaut deux", () => {
    // Couper au milieu d'un caractère multi-octet produirait une séquence
    // UTF-8 invalide, que le lecteur d'en face ne saurait pas réparer.
    const plie = plier(`SUMMARY:${"é".repeat(80)}`);
    for (const ligne of plie.split("\r\n")) {
      expect(new TextEncoder().encode(ligne).length).toBeLessThanOrEqual(75);
    }
    // Et rien ne s'est perdu au passage.
    expect(deplier(plie).join("")).toBe(`SUMMARY:${"é".repeat(80)}`);
  });

  it("plier puis déplier rend le texte d'origine", () => {
    const original = `DESCRIPTION:${"Un texte long ".repeat(20)}`;
    expect(deplier(plier(original)).join("")).toBe(original);
  });
});

describe("EX-PLN-15 — lecture", () => {
  const calendrier = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "BEGIN:VEVENT",
    "UID:abc-123",
    "DTSTART;VALUE=DATE:20261012",
    "DTEND;VALUE=DATE:20261013",
    "SUMMARY:Formation RGAA",
    "END:VEVENT",
    "BEGIN:VEVENT",
    "UID:def-456",
    "DTSTART;TZID=Europe/Paris:20261013T090000",
    "DTEND;TZID=Europe/Paris:20261013T103000",
    "SUMMARY:Point d'équipe\\; hebdomadaire",
    "DESCRIPTION:Ordre du jour\\nBudget",
    "X-PROPRIETE-INCONNUE:on ignore",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");

  it("lit les deux formes de date, et distingue journée entière et horaire", () => {
    const { evenements } = analyserIcs(calendrier);
    expect(evenements).toHaveLength(2);
    expect(evenements[0]).toMatchObject({
      titre: "Formation RGAA",
      date: "2026-10-12",
      journeeEntiere: true,
      heureDebut: null,
    });
    expect(evenements[1]).toMatchObject({
      date: "2026-10-13",
      journeeEntiere: false,
      heureDebut: "09:00",
      heureFin: "10:30",
    });
  });

  it("déséchappe le texte lu", () => {
    const { evenements } = analyserIcs(calendrier);
    expect(evenements[1]?.titre).toBe("Point d'équipe; hebdomadaire");
    expect(evenements[1]?.description).toBe("Ordre du jour\nBudget");
  });

  it("TOLÉRANT À LA LECTURE : une propriété inconnue n'invalide pas l'événement", () => {
    // Les calendriers du monde réel arrivent avec des paramètres inattendus.
    // Refuser le fichier entier pour une ligne inconnue serait pire qu'inutile.
    expect(analyserIcs(calendrier).ignores).toBe(0);
  });

  it("mais un VEVENT sans titre ou sans date N'EST PAS un événement, et le compte le dit", () => {
    const bancal = [
      "BEGIN:VCALENDAR",
      "BEGIN:VEVENT",
      "UID:sans-titre",
      "DTSTART;VALUE=DATE:20261012",
      "END:VEVENT",
      "BEGIN:VEVENT",
      "SUMMARY:Sans date",
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");

    const lu = analyserIcs(bancal);
    expect(lu.evenements).toHaveLength(0);
    // Un import muet laisserait chercher pourquoi deux rendez-vous manquent.
    expect(lu.ignores).toBe(2);
  });

  it("lit un fichier plié, y compris au milieu d'un mot", () => {
    const long = "Séminaire annuel des directions et des services de la collectivité";
    const genere = genererIcs([{ ...evenement, titre: long }], ESTAMPILLE);
    expect(analyserIcs(genere).evenements[0]?.titre).toBe(long);
  });

  it("un aller-retour complet conserve l'événement", () => {
    const genere = genererIcs([evenement], ESTAMPILLE);
    const relu = analyserIcs(genere).evenements[0];
    expect(relu).toMatchObject({
      uid: "evt-1@rationarium",
      titre: "Comité de pilotage",
      date: "2026-09-15",
      heureDebut: "14:00",
      heureFin: "15:30",
    });
  });

  it("un fichier vide ou hors sujet ne produit rien, sans lever", () => {
    expect(analyserIcs("").evenements).toEqual([]);
    expect(analyserIcs("n'importe quoi").evenements).toEqual([]);
  });
});

describe("EX-PLN-15 — aucune altération silencieuse des horaires importés", () => {
  it.each([
    ["DTSTART;TZID=America/New_York:20260910T080000", "DTEND;TZID=America/New_York:20260910T090000", "fuseau_non_pris_en_charge"],
    ["DTSTART;VALUE=DATE:20260910garbage", "", "date_invalide"],
    ["DTSTART:20260910T080000", "", "incomplet"],
  ])("EX-PLN-15 — rejette explicitement %s", (debut, fin, motif) => {
    const lu = analyserIcs(["BEGIN:VCALENDAR", "BEGIN:VEVENT", "SUMMARY:Horaire externe", debut, fin, "END:VEVENT", "END:VCALENDAR"].join("\n"));
    expect(lu.evenements).toEqual([]); expect(lu.ignores).toBe(1);
    expect(lu.erreurs).toMatchObject([{ motif }]);
  });
});

it.each([
  ["20260910T080000Z", "20260910T090000Z", "2026-09-10", "10:00", "11:00"],
  ["20260110T080000Z", "20260110T090000Z", "2026-01-10", "09:00", "10:00"],
  ["20260910T230000Z", "20260910T233000Z", "2026-09-11", "01:00", "01:30"],
])("EX-PLN-15 — convertit UTC vers Paris sans perdre le jour : %s", (debut, fin, date, heureDebut, heureFin) => {
  const lu = analyserIcs(`BEGIN:VCALENDAR\nBEGIN:VEVENT\nSUMMARY:UTC\nDTSTART:${debut}\nDTEND:${fin}\nEND:VEVENT\nEND:VCALENDAR`);
  expect(lu.ignores).toBe(0); expect(lu.evenements).toMatchObject([{ date, heureDebut, heureFin }]);
});
