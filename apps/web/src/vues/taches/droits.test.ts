import { describe, it, expect } from "vitest";
import { decisionSuppressionTache } from "./droits.js";

/**
 * `RG-TSK-14` — « Sans permission élargie, un utilisateur ne peut supprimer
 * que les tâches qui lui sont assignées. »
 * `RG-GEN-06` — « Une action interdite est masquée ou désactivée avec
 * explication — jamais proposée puis refusée. »
 *
 * Le défaut relevé en recette : la fiche n'exerçait que `peut("tasks:delete")`.
 * Sur une tâche non assignée, le bouton était actif, la fenêtre de
 * confirmation s'ouvrait, le geste partait, et le refus tombait après coup
 * en `403`.
 */
describe("RG-TSK-14 — supprimer une tâche qui n'est pas la sienne", () => {
  const avec = (...p: string[]) => (x: string) => p.includes(x);
  const MOI = "11111111-1111-4111-8111-111111111111";
  const AUTRE = "22222222-2222-4222-8222-222222222222";

  it("sans le geste, la commande n'a aucun sens ici : elle disparaît", () => {
    expect(decisionSuppressionTache(avec(), MOI, [MOI])).toBe("masquee");
  });

  it("assigné, on supprime la sienne", () => {
    expect(decisionSuppressionTache(avec("tasks:delete"), MOI, [MOI])).toBe("autorisee");
  });

  it("NON ASSIGNÉ, LA COMMANDE EST INERTE — c'est le défaut relevé", () => {
    expect(decisionSuppressionTache(avec("tasks:delete"), MOI, [AUTRE])).toBe(
      "reserveeAuxAssignes",
    );
  });

  it("une tâche sans aucun assigné n'est celle de personne", () => {
    expect(decisionSuppressionTache(avec("tasks:delete"), MOI, [])).toBe("reserveeAuxAssignes");
  });

  it("la permission élargie passe outre l'assignation", () => {
    expect(decisionSuppressionTache(avec("tasks:delete", "tasks:manage_any"), MOI, [AUTRE])).toBe(
      "autorisee",
    );
  });

  it("la permission élargie ne dispense pas du geste", () => {
    expect(decisionSuppressionTache(avec("tasks:manage_any"), MOI, [AUTRE])).toBe("masquee");
  });

  it("être l'un des assignés suffit", () => {
    expect(decisionSuppressionTache(avec("tasks:delete"), MOI, [AUTRE, MOI])).toBe("autorisee");
  });
});
