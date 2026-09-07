import { describe, expect, it } from "vitest";
import { csvSante, langueDe, type LigneSanteExport } from "./rapports.service.js";

/**
 * `EX-RPT-03`, `RG-GEN-08` — **l'export du rapport est bilingue.**
 *
 * Le défaut constaté (exploration Inès T-5) : le fichier était identique en
 * `fr` et en `en`. Nom `rapport-2026-09-01.csv` dans les deux langues,
 * en-têtes techniques `projet,completion,taches_restantes,…`, et la colonne
 * `sante` portant les codes bruts `critical`, `warning`, `good` là où la vue,
 * juste au-dessus, écrit « Critique », « Attention », « Bon ». Un tableur dont
 * la première ligne dit `taches_en_retard` n'est pas un compte rendu.
 *
 * Le contrôle porte sur le TEXTE produit, sans base ni conteneur : c'est ce qui
 * manquait, l'export n'étant vérifiable jusqu'ici que par la suite
 * d'intégration.
 */
const LIGNE: LigneSanteExport = {
  nom: "Portail citoyen",
  completion: 46,
  restantes: 12,
  enRetard: 3,
  jalons: 5,
  jalonsAVenir: 2,
  dateFin: "2026-12-31",
  chef: { prenom: "Inès", nom: "Roux" },
  service: "Systèmes d'information",
  sante: "critical",
};

const premiereLigne = (csv: string) => csv.replace("﻿", "").split("\r\n")[0]!;
const lignes = (csv: string) => csv.replace("﻿", "").trimEnd().split("\r\n");

describe("EX-RPT-03 — l'export du rapport", () => {
  it("RG-GEN-08 — les en-têtes sont RÉDIGÉS, pas techniques", () => {
    const entetes = premiereLigne(csvSante([LIGNE], "fr"));
    expect(entetes).toContain("Tâches en retard");
    // Ce que le fichier disait avant : des noms de colonne de base de données.
    expect(entetes).not.toContain("taches_en_retard");
    expect(entetes).not.toContain("completion,");
  });

  it("RG-GEN-08 — le fichier anglais DIFFÈRE du fichier français", () => {
    // L'assertion qui porte le défaut : les deux étaient identiques, octet
    // pour octet. Un contrôle qui n'aurait vérifié que « le CSV se produit »
    // serait passé au vert avec et sans le correctif.
    expect(csvSante([LIGNE], "en")).not.toBe(csvSante([LIGNE], "fr"));
    expect(premiereLigne(csvSante([LIGNE], "en"))).toContain("Overdue tasks");
  });

  it("EX-RPT-03 — la colonne « santé » porte le LIBELLÉ de la vue, pas le code", () => {
    expect(lignes(csvSante([LIGNE], "fr"))[1]).toContain("Critique");
    expect(lignes(csvSante([LIGNE], "fr"))[1]).not.toContain("critical");
    expect(lignes(csvSante([LIGNE], "en"))[1]).toContain("Critical");
  });

  it("les trois états de santé sont tous nommés — aucun code ne passe", () => {
    const codes = (["good", "warning", "critical"] as const).map(
      (sante) => lignes(csvSante([{ ...LIGNE, sante }], "fr"))[1]!,
    );
    expect(codes.some((l) => l.includes("good"))).toBe(false);
    expect(codes.some((l) => l.includes("warning"))).toBe(false);
    expect(codes.some((l) => l.includes("critical"))).toBe(false);
  });

  it("le CSV échappe toujours ce qui casserait les colonnes", () => {
    const csv = csvSante([{ ...LIGNE, nom: 'Portail, "refonte"' }], "fr");
    expect(lignes(csv)[1]).toContain('"Portail, ""refonte"""');
  });

  it("le BOM reste en tête : sans lui Excel lit « ComplÃ©tion »", () => {
    expect(csvSante([LIGNE], "fr").startsWith("﻿")).toBe(true);
  });

  it("la langue déclarée est ramenée à ce que le module sait rendre", () => {
    expect(langueDe("en-GB")).toBe("en");
    expect(langueDe("fr-FR")).toBe("fr");
    // Une langue absente ou inconnue ne casse pas l'export : elle retombe sur
    // le français, comme le client.
    expect(langueDe(undefined)).toBe("fr");
    expect(langueDe("")).toBe("fr");
    expect(langueDe("de")).toBe("fr");
  });
});
