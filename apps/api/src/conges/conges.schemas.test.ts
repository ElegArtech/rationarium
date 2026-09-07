import { describe, expect, it } from "vitest";
import { demandeCongeSchema } from "@rationarium/contracts";
import {
  depotSchema,
  modificationSchema,
  modificationTypeSchema,
  modificationTypeSystemeSchema,
} from "./conges.schemas.js";

/**
 * **Le schéma de route qui perd les règles du contrat.**
 *
 * `POST /api/conges` avec `dateFin < dateDebut` traversait la validation, la
 * couche de service et le client Prisma pour mourir sur la contrainte
 * `leaves_periode_coherente` : PostgreSQL rend `23514`, Prisma le remonte en
 * `P2039` que rien ne mappe, et l'agent lisait « Une erreur inattendue est
 * survenue ». `RG-CNG-28` avait pourtant une phrase à dire, et le contrat la
 * porte depuis toujours.
 *
 * `schemas-ecriture.test.ts` tient déjà la moitié voisine du problème — les
 * **clés** d'un schéma de route qui divergent du contrat. Il ne pouvait pas
 * voir celui-ci : un `refine` est une règle **inter-champs**, il ne porte
 * aucune clé, et les deux schémas avaient rigoureusement les mêmes.
 *
 * D'où ce contrôle-ci, qui ne compare pas des formes mais des **verdicts** :
 * pour chaque cas, le contrat et la route doivent dire la même chose, et le
 * dire avec la même phrase. Un `refine` ajouté au contrat et oublié à la
 * route le fait tomber.
 */

const TYPE = "0b8b8e4e-1f9e-4f6e-9c3a-1a2b3c4d5e6f";

/** Un cas se formule une fois, en chaînes ; la route les convertit en `Date`. */
const CAS: { nom: string; regle: string; charge: Record<string, unknown>; valide: boolean }[] = [
  {
    nom: "une période cohérente est acceptée",
    regle: "RG-CNG-28",
    charge: { typeId: TYPE, dateDebut: "2026-09-01", dateFin: "2026-09-05" },
    valide: true,
  },
  {
    nom: "la fin précède le début",
    regle: "RG-CNG-28",
    charge: { typeId: TYPE, dateDebut: "2026-09-10", dateFin: "2026-09-01" },
    valide: false,
  },
  {
    nom: "un seul jour, deux demi-journées qui se contredisent",
    regle: "RG-CNG-18",
    charge: {
      typeId: TYPE,
      dateDebut: "2026-09-01",
      dateFin: "2026-09-01",
      demiJourneeDebut: "morning",
      demiJourneeFin: "afternoon",
    },
    valide: false,
  },
  {
    nom: "un seul jour, deux demi-journées d'accord",
    regle: "RG-CNG-18",
    charge: {
      typeId: TYPE,
      dateDebut: "2026-09-01",
      dateFin: "2026-09-01",
      demiJourneeDebut: "morning",
      demiJourneeFin: "morning",
    },
    valide: true,
  },
  {
    nom: "plusieurs jours, les demi-journées peuvent différer",
    regle: "RG-CNG-17",
    charge: {
      typeId: TYPE,
      dateDebut: "2026-09-01",
      dateFin: "2026-09-05",
      demiJourneeDebut: "afternoon",
      demiJourneeFin: "morning",
    },
    valide: true,
  },
];

describe("POST /conges — le schéma de route dit ce que dit le contrat", () => {
  it("l'inventaire n'est pas vide : les deux verdicts sont exercés", () => {
    // Un contrôle qui n'a rien à mesurer doit échouer, jamais réussir en silence.
    expect(CAS.some((c) => c.valide)).toBe(true);
    expect(CAS.some((c) => !c.valide)).toBe(true);
  });

  for (const cas of CAS) {
    it(`${cas.regle} — ${cas.nom}`, () => {
      const parLeContrat = demandeCongeSchema.safeParse(cas.charge);
      const parLaRoute = depotSchema.safeParse(cas.charge);

      expect(parLeContrat.success, "le contrat lui-même a changé d'avis").toBe(cas.valide);
      expect(
        parLaRoute.success,
        `la route ${parLaRoute.success ? "accepte" : "refuse"} ce que le contrat ${parLeContrat.success ? "accepte" : "refuse"}`,
      ).toBe(cas.valide);

      if (cas.valide) return;
      // `RG-GEN-03` — le refus porte une phrase, pas un code. La même que le
      // contrat : deux formulations pour une règle, c'est une règle de plus.
      const phrase = (r: { success: boolean; error?: { issues: { message: string }[] } }) =>
        r.error ? r.error.issues.map((i) => i.message).sort() : [];
      expect(phrase(parLaRoute)).toEqual(phrase(parLeContrat));
    });
  }
});

describe("PATCH /conges/:id — la correction porte les mêmes règles", () => {
  it("RG-CNG-28 — une période incohérente est refusée avant la base", () => {
    const r = modificationSchema.safeParse({
      dateDebut: "2026-09-10",
      dateFin: "2026-09-01",
      version: 1,
    });
    expect(r.success).toBe(false);
    expect(r.success ? [] : r.error.issues.map((i) => i.message)).toContain(
      "La date de fin doit être postérieure ou égale à la date de début.",
    );
  });

  it("RG-GEN-07 — la version reste obligatoire", () => {
    expect(
      modificationSchema.safeParse({ dateDebut: "2026-09-01", dateFin: "2026-09-05" }).success,
    ).toBe(false);
  });
});

describe("PATCH /conges/types/:id — RG-CNG-30, cinq champs et pas un de plus", () => {
  /**
   * La règle nomme ce qui est modifiable sur un type **système** : nom,
   * description, icône, couleur, exigence de validation. Le contrôleur choisit
   * le schéma d'après le type qu'il vient de lire ; c'est ce qui permet au
   * refus de se poser **sous le champ fautif** plutôt que de rendre un
   * « certaines informations sont mal formées » qui oblige à chercher lequel
   * des dix est en cause (`RG-GEN-03`, `cadrage/02`).
   */
  const cinqOuverts = {
    nom: "Congés payés",
    description: "Le droit annuel",
    icone: "sun",
    couleur: "#112233",
    validationRequise: false,
    version: 1,
  };

  it("RG-CNG-30 — les cinq champs ouverts passent", () => {
    expect(modificationTypeSystemeSchema.safeParse(cinqOuverts).success).toBe(true);
  });

  for (const [champ, valeur] of Object.entries({
    code: "AUTRE",
    remunere: false,
    limiteAnnuelle: 99,
    ordre: 42,
    actif: false,
  })) {
    it(`RG-CNG-30 — « ${champ} » est refusé sur un type système, et le refus le NOMME`, () => {
      const r = modificationTypeSystemeSchema.safeParse({ ...cinqOuverts, [champ]: valeur });
      expect(r.success).toBe(false);
      const issues = r.success ? [] : r.error.issues;
      // Le chemin porte le champ : c'est lui qui place le message sous le bon
      // libellé. Un refus global passerait cette assertion à côté.
      expect(issues.map((i) => i.path.join("."))).toContain(champ);
      expect(issues.find((i) => i.path.join(".") === champ)?.message).toMatch(
        /fourni avec le produit/,
      );
    });
  }

  it("RG-CNG-30 — un type ORDINAIRE laisse les dix champs ouverts", () => {
    /*
     * Le pendant, sans lequel la restriction pourrait être posée partout : ce
     * qui distingue les deux schémas est le drapeau `systeme`, pas la nature
     * du champ.
     */
    expect(
      modificationTypeSchema.safeParse({
        ...cinqOuverts,
        code: "AUTRE",
        remunere: false,
        limiteAnnuelle: 99,
        ordre: 42,
        actif: false,
      }).success,
    ).toBe(true);
  });

  it("RG-GEN-07 — la version accompagne la modification d'un type", () => {
    expect(modificationTypeSchema.safeParse({ nom: "X" }).success).toBe(false);
    expect(modificationTypeSystemeSchema.safeParse({ nom: "X" }).success).toBe(false);
  });
});
