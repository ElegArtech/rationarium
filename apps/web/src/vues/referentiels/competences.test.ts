import { describe, it, expect } from "vitest";
import { vuesCompetences, vueCourante, type Vue } from "./Competences.js";

/**
 * Vue 22 — les onglets suivent les droits.
 *
 * `EX-CMP-01` à `EX-CMP-10` : le référentiel des compétences se lit avec
 * `skills:read`, que porte le socle de tout compte actif ; la matrice agents ×
 * compétences exige `skills:manage_matrix`, que presque personne n'a.
 *
 * Le défaut constaté (P-105 à P-108, quatre parcours, huit exécutions) : les
 * trois onglets se rendaient sous un `requete.isSuccess` unique, celui de
 * `GET /competences/matrice`. Un 403 sur cette route rendait donc « Le
 * chargement a échoué — Permission requise » sur les TROIS onglets, y compris
 * « Référentiel », que l'utilisateur a le droit de lire. La vue entière était
 * morte pour tout compte qui n'administre pas la matrice.
 *
 * Le contrôle porte sur la décision, pas sur le rendu : c'est elle qui portait
 * le défaut, et un parcours de bout en bout qui rechargerait la page pour
 * changer de profil repartirait de l'onglet par défaut.
 */
describe("EX-CMP-01 — la vue 22 sans `skills:manage_matrix`", () => {
  const TOUS: Vue[] = ["parUtilisateur", "referentiel", "matrice"];

  it("EX-CMP-01 — sans manage_matrix, le référentiel reste accessible", () => {
    expect(vuesCompetences(false)).toContain("referentiel");
  });

  it("RG-GEN-06 — sans manage_matrix, la matrice n'est pas proposée", () => {
    // Ni « Matrice » ni « Par utilisateur » : les deux lisent la même route.
    expect(vuesCompetences(false)).not.toContain("matrice");
    expect(vuesCompetences(false)).not.toContain("parUtilisateur");
  });

  it("EX-CMP-04 — avec manage_matrix, les trois onglets sont là", () => {
    expect(vuesCompetences(true)).toEqual(TOUS);
  });

  it("EX-CMP-01 — l'onglet par défaut « matrice » retombe sur le référentiel", () => {
    /*
     * Le cas réel : la vue s'ouvre sur « matrice » — c'est l'onglet par défaut
     * du composant. Sans recalage, un porteur de `skills:read` seul arrive sur
     * une section qui n'existe pas pour lui et n'a plus AUCUN panneau à
     * l'écran, sans erreur, sans message.
     */
    expect(vueCourante(vuesCompetences(false), "matrice")).toBe("referentiel");
  });

  it("EX-CMP-01 — un onglet accessible n'est jamais déplacé", () => {
    expect(vueCourante(vuesCompetences(true), "matrice")).toBe("matrice");
    expect(vueCourante(vuesCompetences(true), "referentiel")).toBe("referentiel");
    expect(vueCourante(vuesCompetences(false), "referentiel")).toBe("referentiel");
  });
});
