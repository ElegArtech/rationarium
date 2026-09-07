import { describe, it, expect } from "vitest";
import { adressePlanning, lirePlanning, type EtatPlanning } from "./adresse.js";
import { COUCHES_PAR_DEFAUT } from "./grille.js";

/**
 * `EX-PLN-01` — « Basculer entre trois vues : Semaine, Mois, Activité. »
 *
 * Le défaut relevé en recette : après cinq « Semaine suivante » (12/10), le
 * passage en Mois affichait « Septembre 2026 », et le filtre de service posé
 * en Semaine revenait à « Tous les services ». Tout l'état était en `useState`
 * local dans chaque page — donc rien ne survivait au changement de mode, et
 * une période filtrée n'avait pas d'adresse.
 */
const AUJOURDHUI = "2026-09-07";

const etat = (p: Partial<EtatPlanning> = {}): EtatPlanning => ({
  ancre: AUJOURDHUI,
  services: [],
  departementId: "",
  recherche: "",
  monPerimetre: false,
  couches: COUCHES_PAR_DEFAUT,
  ...p,
});

describe("EX-PLN-01 — la période et les filtres voyagent dans l'adresse", () => {
  it("LA PÉRIODE SURVIT AU CHANGEMENT DE MODE — c'est le défaut relevé", () => {
    const adresse = adressePlanning(etat({ ancre: "2026-10-12" }), AUJOURDHUI);
    expect(adresse["ancre"]).toBe("2026-10-12");
    expect(lirePlanning(adresse, AUJOURDHUI).ancre).toBe("2026-10-12");
  });

  it("LE FILTRE DE SERVICE AUSSI", () => {
    const adresse = adressePlanning(etat({ services: ["s1", "s2"] }), AUJOURDHUI);
    expect(lirePlanning(adresse, AUJOURDHUI).services).toEqual(["s1", "s2"]);
  });

  it("l'aller-retour rend l'état intact", () => {
    const source = etat({
      ancre: "2026-10-12",
      services: ["s1"],
      departementId: "d4",
      recherche: "chastagner",
      monPerimetre: true,
      couches: { ...COUCHES_PAR_DEFAUT, evenements: false },
    });
    expect(lirePlanning(adressePlanning(source, AUJOURDHUI), AUJOURDHUI)).toEqual(source);
  });

  it("une adresse par défaut est VIDE : elle se lit et se transmet", () => {
    expect(adressePlanning(etat(), AUJOURDHUI)).toEqual({});
  });

  it("une adresse vide rend l'état par défaut", () => {
    expect(lirePlanning({}, AUJOURDHUI)).toEqual(etat());
  });

  it("une ancre qui n'est pas une date est ignorée, pas appliquée", () => {
    expect(lirePlanning({ ancre: "n'importe quoi" }, AUJOURDHUI).ancre).toBe(AUJOURDHUI);
    expect(lirePlanning({ ancre: 12 }, AUJOURDHUI).ancre).toBe(AUJOURDHUI);
  });

  /*
   * `Number("")` vaut zéro : la leçon consignée du réglage des jours visibles.
   * Le filtre porte sur la CHAÎNE, jamais sur une valeur convertie.
   */
  it("une liste de services vide ou trouée ne fabrique pas d'identifiant", () => {
    expect(lirePlanning({ services: "" }, AUJOURDHUI).services).toEqual([]);
    expect(lirePlanning({ services: "s1,,  ,s2" }, AUJOURDHUI).services).toEqual(["s1", "s2"]);
  });

  it("toutes les couches éteintes se distinguent de l'absence de paramètre", () => {
    const toutesEteintes = {
      disponibilites: false,
      activites: false,
      tachesProjet: false,
      tachesHorsProjet: false,
      evenements: false,
    };
    const adresse = adressePlanning(etat({ couches: toutesEteintes }), AUJOURDHUI);
    expect(adresse["couches"]).toBe("");
    expect(lirePlanning(adresse, AUJOURDHUI).couches).toEqual(toutesEteintes);
    expect(lirePlanning({}, AUJOURDHUI).couches).toEqual(COUCHES_PAR_DEFAUT);
  });
});
