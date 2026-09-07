import { describe, it, expect } from "vitest";
import {
  adressePortefeuille,
  lirePortefeuille,
  retourAuPortefeuille,
  PORTEFEUILLE_VIDE,
} from "./adresse.js";

/**
 * `EX-PRJ-02` — filtrer le portefeuille. `RG-GEN-04` — un écran explique ce
 * qu'il montre.
 *
 * Le défaut relevé en recette : un filtre posé sur « Actif », un projet
 * ouvert, « ← Retour aux projets », et la liste revenait à « Tous les
 * statuts » **sans le dire** — le compteur « n sur total » redevenait
 * « total » sans qu'aucun geste l'ait demandé.
 */
describe("EX-PRJ-02 — les filtres du portefeuille voyagent dans l'adresse", () => {
  it("l'aller-retour rend les filtres intacts", () => {
    const source = { recherche: "voirie", statut: "active", priorite: "high", mesProjets: true };
    expect(lirePortefeuille(adressePortefeuille(source))).toEqual(source);
  });

  it("une adresse par défaut est VIDE : la liste non filtrée n'en porte pas", () => {
    expect(adressePortefeuille(PORTEFEUILLE_VIDE)).toEqual({});
    expect(lirePortefeuille({})).toEqual(PORTEFEUILLE_VIDE);
  });

  it("LE STATUT SURVIT AU DÉTOUR PAR LA FICHE — c'est le défaut relevé", () => {
    const adresse = adressePortefeuille({ ...PORTEFEUILLE_VIDE, statut: "active" });
    // La fiche reçoit l'adresse en la traversant, puis la rend au retour.
    expect(retourAuPortefeuille(adresse)).toEqual(adresse);
    expect(lirePortefeuille(retourAuPortefeuille(adresse)).statut).toBe("active");
  });

  it("la fiche ne renvoie QUE ce qui appartient au portefeuille", () => {
    expect(retourAuPortefeuille({ statut: "active", onglet: "jalons", projet: "p1" })).toEqual({
      statut: "active",
    });
  });

  it("une valeur qui n'est pas une chaîne est ignorée, jamais appliquée", () => {
    expect(lirePortefeuille({ statut: 3 }).statut).toBe("");
    expect(retourAuPortefeuille({ statut: 3, q: "" })).toEqual({});
  });
});
