import { describe, it, expect } from "vitest";
import { vueCourante } from "./Teletravail.js";

/**
 * Vue 20 — l'affichage courant, recalé sur les droits.
 *
 * `EX-TLT-07` réserve la lecture du télétravail de l'équipe à
 * `telework:read_team`, et `RG-TLT-07` en fait une permission dédiée. La vue
 * offrait « Vue équipe » **sans garde**, à côté d'un bouton voisin correctement
 * gardé : la commande était active, cliquable, sans explication, et le clic ne
 * menait qu'au panneau « Vue réservée à l'encadrement ». Le cloisonnement
 * serveur tenait — aucun nom d'autre agent n'était rendu — mais `RG-GEN-06`
 * interdit de proposer ce qui sera refusé.
 *
 * La bascule est désormais masquée. Ce que ce test tient, c'est l'autre moitié :
 * l'affichage qui reste quand la bascule s'en va. Le cas ne se produit qu'en
 * cours de session, et aucun parcours de bout en bout ne sait le fabriquer —
 * recharger la page remonterait le composant, donc repartirait de « moi ».
 */
describe("EX-TLT-07, RG-TLT-07 — la vue équipe suit les droits", () => {
  it("RG-GEN-06 — sans `telework:read_team`, la vue équipe n'est pas affichée", () => {
    expect(vueCourante("equipe", false)).toBe("moi");
  });

  it("EX-TLT-07 — avec la permission, la vue équipe s'ouvre", () => {
    expect(vueCourante("equipe", true)).toBe("equipe");
  });

  it("RG-GEN-06 — son propre planning n'est jamais recalé", () => {
    // Le recalage ne vise qu'une vue interdite : il ne doit pas déplacer
    // quelqu'un qui regarde ce qu'il a le droit de regarder.
    expect(vueCourante("moi", false)).toBe("moi");
    expect(vueCourante("moi", true)).toBe("moi");
  });
});
