import { describe, it, expect } from "vitest";
import { teletravailModifiablePar } from "./droits.js";

/**
 * `RG-PLN-04` — « Le basculement du télétravail depuis le planning exige la
 * permission correspondante ; à défaut, la cellule est en lecture seule et
 * l'indique. »
 * `RG-TLT-07` — « Agir sur le télétravail d'autrui exige une permission
 * dédiée. »
 * `RG-GEN-06` — une action interdite n'est jamais proposée puis refusée.
 *
 * Le défaut relevé en recette : un contributeur se voyait offrir la bascule
 * sur la cellule de **tous** les agents — trente-trois bascules sur trente-huit
 * visaient autrui, actives et cliquables, et le clic rendait `403`. Le droit
 * était apprécié par la seule permission, jamais par le périmètre.
 */
describe("RG-PLN-04, RG-TLT-07 — la bascule de télétravail, personne par personne", () => {
  const avec = (...p: string[]) => (x: string) => p.includes(x);

  const MOI = "11111111-1111-4111-8111-111111111111";
  const AUTRUI = "22222222-2222-4222-8222-222222222222";

  it("sans la permission d'écriture, personne — pas même soi", () => {
    expect(teletravailModifiablePar(avec(), MOI, MOI)).toBe(false);
  });

  it("avec la seule permission d'écriture, soi-même", () => {
    expect(teletravailModifiablePar(avec("telework:create"), MOI, MOI)).toBe(true);
  });

  it("AVEC LA SEULE PERMISSION D'ÉCRITURE, PAS AUTRUI — c'est le défaut relevé", () => {
    expect(teletravailModifiablePar(avec("telework:create"), MOI, AUTRUI)).toBe(false);
  });

  it("avec la permission dédiée, autrui", () => {
    expect(
      teletravailModifiablePar(avec("telework:create", "telework:manage_any"), MOI, AUTRUI),
    ).toBe(true);
  });

  it("la permission dédiée ne dispense pas de celle de l'action", () => {
    expect(teletravailModifiablePar(avec("telework:manage_any"), MOI, AUTRUI)).toBe(false);
  });

  it("lire l'équipe ne donne pas d'écrire dessus", () => {
    expect(
      teletravailModifiablePar(avec("telework:create", "telework:read_team"), MOI, AUTRUI),
    ).toBe(false);
  });
});
