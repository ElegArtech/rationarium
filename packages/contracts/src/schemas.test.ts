import { describe, it, expect } from "vitest";
import {
  motDePasse, dateMetier, tacheSchema, demandeCongeSchema, saisieTempsSchema,
  tiersSchema, tachePredefinieSchema, evenementSchema, decisionCongeSchema,
  plagePlanningSchema, projetSchema, inscriptionSchema,
} from "./schemas.js";

describe("primitives métier", () => {
  it("RG-AUTH-06 — la politique de mot de passe exige ses quatre critères", () => {
    expect(motDePasse.safeParse("Abcdef1!").success).toBe(true);
    expect(motDePasse.safeParse("abcdef1!").success).toBe(false); // pas de majuscule
    expect(motDePasse.safeParse("Abcdefg!").success).toBe(false); // pas de chiffre
    expect(motDePasse.safeParse("Abcdefg1").success).toBe(false); // pas de spécial
    expect(motDePasse.safeParse("Ab1!").success).toBe(false);     // trop court
  });

  it("ADR-0010 — une date métier refuse un instant", () => {
    expect(dateMetier.safeParse("2026-09-01").success).toBe(true);
    expect(dateMetier.safeParse("2026-09-01T00:00:00Z").success).toBe(false);
    expect(dateMetier.safeParse("01/09/2026").success).toBe(false);
  });
});

describe("cohérence des périodes", () => {
  it("RG-PRJ-01 — refuse un projet dont la fin précède le début", () => {
    const base = { nom: "P", dateDebut: "2026-06-01", dateFin: "2026-05-01" };
    expect(projetSchema.safeParse(base).success).toBe(false);
    expect(projetSchema.safeParse({ ...base, dateFin: "2026-07-01" }).success).toBe(true);
  });

  it("RG-TLT-06 — une plage interrogée ne peut excéder 366 jours", () => {
    expect(plagePlanningSchema.safeParse({ dateDebut: "2026-01-01", dateFin: "2026-12-31" }).success).toBe(true);
    expect(plagePlanningSchema.safeParse({ dateDebut: "2026-01-01", dateFin: "2027-06-01" }).success).toBe(false);
  });
});

describe("tâches", () => {
  it("RG-TSK-01 — une tâche sans projet est un cas nominal", () => {
    expect(tacheSchema.safeParse({ titre: "Réunion transverse" }).success).toBe(true);
  });

  it("RG-JAL-04 — une tâche hors projet ne se rattache pas à un jalon", () => {
    const r = tacheSchema.safeParse({
      titre: "T", milestoneId: "0b8b8e4e-1f9e-4f6e-9c3a-1a2b3c4d5e6f",
    });
    expect(r.success).toBe(false);
  });

  it("RG-TSK-08 — la date de fin ne précède pas la date de début", () => {
    expect(tacheSchema.safeParse({ titre: "T", dateDebut: "2026-06-10", dateFin: "2026-06-01" }).success).toBe(false);
  });
});

describe("congés", () => {
  const type = "0b8b8e4e-1f9e-4f6e-9c3a-1a2b3c4d5e6f";

  it("RG-CNG-28 — la date de fin ne précède pas la date de début", () => {
    expect(demandeCongeSchema.safeParse({ typeId: type, dateDebut: "2026-09-10", dateFin: "2026-09-01" }).success).toBe(false);
  });

  it("RG-CNG-18 — la demi-journée simple ne vaut que pour un congé d'un jour", () => {
    const surUnJour = { typeId: type, dateDebut: "2026-09-01", dateFin: "2026-09-01", demiJourneeDebut: "morning", demiJourneeFin: "morning" };
    expect(demandeCongeSchema.safeParse(surUnJour).success).toBe(true);
    const surUnJourIncoherent = { ...surUnJour, demiJourneeFin: "afternoon" };
    expect(demandeCongeSchema.safeParse(surUnJourIncoherent).success).toBe(false);
  });

  it("RG-CNG-17 — sur plusieurs jours, les deux demi-journées peuvent différer", () => {
    expect(demandeCongeSchema.safeParse({
      typeId: type, dateDebut: "2026-09-01", dateFin: "2026-09-05",
      demiJourneeDebut: "afternoon", demiJourneeFin: "morning",
    }).success).toBe(true);
  });

  it("EX-CNG-05 — un refus sans motif est invalide", () => {
    expect(decisionCongeSchema.safeParse({ decision: "approve" }).success).toBe(true);
    expect(decisionCongeSchema.safeParse({ decision: "refuse" }).success).toBe(false);
    expect(decisionCongeSchema.safeParse({ decision: "refuse", motifRefus: "Effectif insuffisant" }).success).toBe(true);
  });
});

describe("temps, tiers, activité, événements", () => {
  const id = "0b8b8e4e-1f9e-4f6e-9c3a-1a2b3c4d5e6f";

  it("RG-TMP-01 — une saisie référence au minimum une tâche ou un projet", () => {
    expect(saisieTempsSchema.safeParse({ date: "2026-09-01", heures: 3 }).success).toBe(false);
    expect(saisieTempsSchema.safeParse({ date: "2026-09-01", heures: 3, projectId: id }).success).toBe(true);
  });

  it("RG-TRS-01 — une personne morale ne porte pas de contact nommé", () => {
    expect(tiersSchema.safeParse({ type: "organisation", organisation: "X", contactNom: "Jean" }).success).toBe(false);
    expect(tiersSchema.safeParse({ type: "organisation", organisation: "X" }).success).toBe(true);
    expect(tiersSchema.safeParse({ type: "individual", contactNom: "Jean" }).success).toBe(true);
  });

  it("RG-ACT-02 — une tâche « créneau horaire » exige ses horaires", () => {
    expect(tachePredefinieSchema.safeParse({ nom: "Astreinte", dureeParDefaut: "time_slot" }).success).toBe(false);
    expect(tachePredefinieSchema.safeParse({
      nom: "Astreinte", dureeParDefaut: "time_slot", heureDebut: "08:00", heureFin: "18:00",
    }).success).toBe(true);
  });

  it("un événement qui n'occupe pas la journée entière porte ses horaires cohérents", () => {
    expect(evenementSchema.safeParse({ titre: "R", date: "2026-09-01" }).success).toBe(false);
    expect(evenementSchema.safeParse({ titre: "R", date: "2026-09-01", journeeEntiere: true }).success).toBe(true);
    expect(evenementSchema.safeParse({
      titre: "R", date: "2026-09-01", heureDebut: "14:00", heureFin: "10:00",
    }).success).toBe(false);
  });

  it("les mots de passe divergents sont refusés à l'inscription", () => {
    const base = { prenom: "A", nom: "B", email: "a@b.fr", login: "abc", motDePasse: "Abcdef1!" };
    expect(inscriptionSchema.safeParse({ ...base, confirmation: "Abcdef1!" }).success).toBe(true);
    expect(inscriptionSchema.safeParse({ ...base, confirmation: "Autre1!X" }).success).toBe(false);
  });
});
