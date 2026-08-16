import { describe, it, expect } from "vitest";
import { RequiertPermission } from "./permissions.garde.js";

/**
 * La garde elle-même se vérifie en intégration ; ce test-ci porte sur le
 * décorateur, qui échoue au DÉMARRAGE plutôt qu'à l'exécution.
 *
 * Motif : un point d'entrée qui exigerait une permission inexistante serait
 * inaccessible à tous, en silence. Un défaut silencieux vaut moins qu'un
 * démarrage refusé.
 */
describe("RG-DROITS-03 — liste blanche stricte, dès la déclaration", () => {
  it("accepte une permission du catalogue", () => {
    expect(() => RequiertPermission("leaves:approve")).not.toThrow();
  });

  it("refuse une permission inventée, au démarrage", () => {
    expect(() => RequiertPermission("leaves:approuver")).toThrow(/hors catalogue/);
    expect(() => RequiertPermission("inexistant:read")).toThrow(/hors catalogue/);
  });
});
