import { describe, expect, it } from "vitest";
import { attenduA } from "./rapports.service.js";

/**
 * `EX-RPT-04` — l'avancement **attendu**, au prorata de la durée écoulée.
 *
 * Le panneau s'intitule « Avancement réel et attendu » et sa légende décrit un
 * repère vertical depuis le portage de la vue 30. Le repère n'était jamais
 * dessiné, faute que le serveur calcule l'attendu : une légende sans son
 * marqueur ne devient rouge nulle part. Ces cas fixent la fonction qui manquait.
 */
describe("attenduA — EX-RPT-04", () => {
  const j = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

  it("rend 0 avant le début du projet : il n'y a rien à attendre", () => {
    expect(attenduA(j("2026-06-01"), j("2026-12-31"), j("2026-01-01"))).toBe(0);
    expect(attenduA(j("2026-06-01"), j("2026-12-31"), j("2026-06-01"))).toBe(0);
  });

  it("rend 100 à la date de fin et au-delà : le projet devait être terminé", () => {
    expect(attenduA(j("2026-01-01"), j("2026-06-30"), j("2026-06-30"))).toBe(100);
    expect(attenduA(j("2026-01-01"), j("2026-06-30"), j("2026-12-31"))).toBe(100);
  });

  it("rend la moitié à mi-parcours", () => {
    expect(attenduA(j("2026-01-01"), j("2026-01-11"), j("2026-01-06"))).toBe(50);
  });

  it("arrondit au point de pourcentage, comme la barre qu'il positionne", () => {
    expect(attenduA(j("2026-01-01"), j("2026-01-04"), j("2026-01-02"))).toBe(33);
  });

  /*
   * Une durée nulle ou inversée existe en base : `dateDebut` et `dateFin` sont
   * saisies, rien n'impose l'ordre. Une division par zéro y produirait `NaN`,
   * donc un `left: NaN%` que le navigateur ignore en silence — le repère
   * disparaîtrait sans qu'aucune boucle ne le voie.
   */
  it("ne divise jamais par zéro sur un projet d'un seul jour", () => {
    expect(attenduA(j("2026-03-02"), j("2026-03-02"), j("2026-03-02"))).toBe(100);
    expect(attenduA(j("2026-03-02"), j("2026-03-02"), j("2026-03-01"))).toBe(0);
  });
});
