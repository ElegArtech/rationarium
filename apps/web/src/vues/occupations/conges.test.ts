import { describe, it, expect } from "vitest";
import { ongletCourant, type Onglet } from "./Conges.js";

/**
 * Vue 19 — le recalage de l'onglet actif sur les droits.
 *
 * La règle se vérifie ici et nulle part ailleurs, et c'est délibéré. Le défaut
 * ne se manifeste que si les droits changent **pendant** la session : un
 * parcours de bout en bout qui rechargerait la page pour changer de profil
 * remonterait le composant, donc repartirait de l'onglet par défaut — il
 * passerait au vert avec ET sans le correctif. Un test qu'on n'a pas vu
 * échouer ne prouve pas ce qu'on croit.
 */
describe("RG-GEN-06 — l'onglet actif suit les droits", () => {
  const TOUS: Onglet[] = [
    "mesDemandes",
    "aValider",
    "toutes",
    "delegations",
    "types",
    "soldes",
  ];

  it("RG-GEN-06 — un onglet qui existe est conservé", () => {
    expect(ongletCourant(TOUS, "soldes")).toBe("soldes");
  });

  it("RG-GEN-06 — un onglet DISPARU retombe sur le premier existant, pas sur rien", () => {
    /*
     * Le cas réel : Hugo ouvre « Soldes », `leaves:manage_balances` lui est
     * retiré, la liste se recalcule. Sans recalage, `onglet` vaut encore
     * `soldes`, aucune des six conditions de rendu n'est vraie, et la vue perd
     * TOUS ses panneaux — sans erreur, sans message, sans que rien ne le dise.
     */
    expect(ongletCourant(["mesDemandes", "aValider"], "soldes")).toBe("mesDemandes");
  });

  it("RG-GEN-06 — le recalage vise le PREMIER onglet restant, pas un défaut codé en dur", () => {
    // Une liste qui ne contiendrait pas « Mes demandes » ne doit pas y renvoyer :
    // ce serait désigner à nouveau une section absente.
    expect(ongletCourant(["types", "soldes"], "aValider")).toBe("types");
  });

  it("RG-GEN-06 — une liste vide ne rend pas `undefined` : la vue garderait un onglet nul", () => {
    expect(ongletCourant([], "soldes")).toBe("mesDemandes");
  });
});
