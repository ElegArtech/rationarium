import { describe, it, expect } from "vitest";
import { commandesEcriture, reglagesQueLaRemiseChange } from "./Parametres.js";

/**
 * Vue 31 — les commandes d'écriture, et la remise aux valeurs par défaut.
 *
 * Deux défauts constatés au même endroit.
 *
 * **Emplacement 8, défaut 5** — la barre « modifications non enregistrées »
 * offrait « Enregistrer » sans garde de permission, alors que la même commande
 * était masquée dans la barre d'outils par `settings:update`. Un porteur de
 * `settings:read` seul ne voyait rien en haut, puis voyait le bouton
 * apparaître dès sa première saisie ; le clic rendait
 * `403 PUT /api/parametrage`. Deux endroits, une seule règle appliquée —
 * `RG-GEN-06` interdit exactement cela : proposer puis refuser.
 *
 * **P-131** — « Réinitialiser » ramenait TOUS les réglages aux valeurs par
 * défaut d'un seul clic, sans fenêtre de confirmation (`EX-PRM-02`).
 */
describe("RG-GEN-06 — les commandes d'écriture de la vue 31", () => {
  it("sans `settings:update`, AUCUNE commande d'écriture n'est proposée", () => {
    const c = commandesEcriture(false);
    expect(c.enregistrer).toBe(false);
    expect(c.reinitialiser).toBe(false);
  });

  it("avec `settings:update`, les deux commandes sont proposées", () => {
    const c = commandesEcriture(true);
    expect(c.enregistrer).toBe(true);
    expect(c.reinitialiser).toBe(true);
  });

  it("les deux endroits qui enregistrent lisent la MÊME décision", () => {
    /*
     * C'est l'assertion qui porte le défaut : la barre d'outils et le bandeau
     * « modifications non enregistrées » posaient chacun leur condition, et
     * l'une des deux avait été oubliée. Une règle qui dépend de la vigilance
     * de chaque appel n'en est pas une.
     */
    expect(commandesEcriture(false).enregistrer).toBe(commandesEcriture(false).reinitialiser);
    expect(commandesEcriture(true).enregistrer).toBe(commandesEcriture(true).reinitialiser);
  });
});

describe("EX-PRM-02 — la confirmation nomme ce que la remise changerait", () => {
  const DEFAUT = {
    "display.dateFormat": "JJ/MM/AAAA",
    "display.timeFormat": "24h",
    "display.locale": "fr-FR",
    "display.firstDayOfWeek": "1",
    "planning.visibleDays": "1,2,3,4,5",
  };

  it("un brouillon déjà par défaut ne changerait rien", () => {
    expect(reglagesQueLaRemiseChange(DEFAUT)).toEqual([]);
  });

  it("un brouillon vide ne changerait rien non plus", () => {
    // Un réglage absent vaut son défaut : l'annoncer comme « à remettre »
    // ferait craindre une perte qui n'aura pas lieu.
    expect(reglagesQueLaRemiseChange({})).toEqual([]);
  });

  it("seuls les réglages RÉELLEMENT modifiés sont annoncés", () => {
    expect(
      reglagesQueLaRemiseChange({ ...DEFAUT, "display.locale": "en-US" }),
    ).toEqual(["display.locale"]);
  });

  it("la liste couvre tous les réglages que la remise touche", () => {
    const tout = Object.fromEntries(
      Object.keys(DEFAUT).map((cle) => [cle, "valeur-differente"]),
    );
    expect(reglagesQueLaRemiseChange(tout).sort()).toEqual(Object.keys(DEFAUT).sort());
  });

  it("un réglage hors du champ de la remise n'est jamais annoncé", () => {
    // « Réinitialiser » ne touche que les réglages d'affichage et de planning ;
    // annoncer autre chose promettrait une remise qui n'aura pas lieu.
    expect(reglagesQueLaRemiseChange({ ...DEFAUT, "autre.reglage": "x" })).toEqual([]);
  });
});
