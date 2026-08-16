import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { VOCABULAIRES } from "@trame/contracts";

/**
 * Le contrat et la base disent-ils la même chose ?
 *
 * C'est le contrôle qui aurait évité l'arbitrage B1 : sur ce projet, deux
 * documents de cadrage portaient des vocabulaires divergents — priorité à six
 * niveaux contre quatre — et l'écart n'a été vu qu'au moment d'écrire
 * l'énumération en base. Ici, la divergence échoue au premier `pnpm test`.
 */

const SCHEMA = fs.readFileSync(
  path.join(import.meta.dirname, "..", "prisma", "schema.prisma"),
  "utf8",
);

/** Les blocs `enum` du schéma, sous forme nom → valeurs. */
const enumsPrisma = (): Record<string, string[]> => {
  const out: Record<string, string[]> = {};
  for (const m of SCHEMA.matchAll(/enum\s+(\w+)\s*\{([^}]*)\}/g)) {
    out[m[1]!] = m[2]!
      .split("\n")
      .map((l) => l.replace(/\/\/.*$/, "").trim())
      .filter(Boolean);
  }
  return out;
};

/** Correspondance vocabulaire → énumération Prisma. */
const CORRESPONDANCE: Record<string, string> = {
  statutProjet: "StatutProjet",
  statutTache: "StatutTache",
  statutJalon: "StatutJalon",
  priorite: "Priorite",
  roleRaci: "RoleRaci",
  statutConge: "StatutConge",
  demiJournee: "DemiJournee",
  periodeJournee: "PeriodeJournee",
  etatTeletravail: "EtatTeletravail",
  typeActivite: "TypeActivite",
  categorieCompetence: "CategorieCompetence",
  niveauCompetence: "NiveauCompetence",
  typeTiers: "TypeTiers",
  dureeTachePredefinie: "DureeTachePredefinie",
};

describe("cohérence @trame/contracts ↔ schéma Prisma", () => {
  const prisma = enumsPrisma();

  for (const [vocabulaire, nomPrisma] of Object.entries(CORRESPONDANCE)) {
    it(`${vocabulaire} — mêmes valeurs, même ordre, que l'énumération ${nomPrisma}`, () => {
      const attendu = VOCABULAIRES[vocabulaire as keyof typeof VOCABULAIRES].map((t) => t.code);
      expect(prisma[nomPrisma], `énumération ${nomPrisma} absente du schéma`).toBeDefined();
      expect(prisma[nomPrisma]).toEqual(attendu);
    });
  }

  it("aucune énumération du schéma n'échappe à la correspondance", () => {
    // Une énumération en base sans vocabulaire correspondant est une seconde
    // vérité : c'est exactement ce que le parti pris n° 4 interdit.
    const declarees = Object.keys(prisma).sort();
    const couvertes = Object.values(CORRESPONDANCE).sort();
    expect(declarees).toEqual(couvertes);
  });
});
