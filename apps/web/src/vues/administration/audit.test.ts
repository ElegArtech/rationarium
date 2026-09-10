import { describe, it, expect } from "vitest";
import { changements, vueDeLEntite } from "./Audit.js";
import fr from "../../locales/fr/administration.json";
import en from "../../locales/en/administration.json";

/**
 * Vue 33 — le journal d'audit se lit.
 *
 * Le défaut constaté (exploration Karim T-3) : la ligne rendait
 * « **user.update · user.update** » — libellé et code, tous deux bruts — parce
 * que vingt-sept actions journalisées par le serveur n'avaient aucun libellé
 * dans les deux catalogues, incomplets à l'identique. Et le panneau de détail
 * rendait le JSON tel quel : `{"apres":{…},"avant":{…}}`, deux objets entiers
 * dont un seul champ diffère.
 *
 * `EX-ADM-03`.
 */
describe("EX-ADM-03 — les champs modifiés se lisent", () => {
  it("le champ qui diffère est isolé des champs identiques", () => {
    expect(
      changements({
        avant: { nom: "Portail", statut: "active", roleId: "a" },
        apres: { nom: "Portail", statut: "done", roleId: "a" },
      }),
    ).toEqual([{ champ: "statut", avant: "active", apres: "done" }]);
  });

  it("un champ AJOUTÉ n'existe que dans « après » — il compte quand même", () => {
    // L'union des deux jeux de clés : n'en lire qu'un ferait disparaître la
    // moitié des écarts, ceux d'ajout ou ceux de retrait selon le côté choisi.
    expect(changements({ avant: {}, apres: { chefId: "x" } })).toEqual([
      { champ: "chefId", avant: "—", apres: "x" },
    ]);
    expect(changements({ avant: { chefId: "x" }, apres: {} })).toEqual([
      { champ: "chefId", avant: "x", apres: "—" },
    ]);
  });

  it("deux scalaires — le cas de `direction.update` — donnent une ligne sans nom de champ", () => {
    expect(changements({ avant: "Ancien nom", apres: "Nouveau nom" })).toEqual([
      { champ: "", avant: "Ancien nom", apres: "Nouveau nom" },
    ]);
  });

  it("un détail qui ne parle pas d'avant/après ne produit aucune ligne", () => {
    // Le bloc brut reste affiché dessous : on n'invente pas une comparaison
    // là où le serveur n'en a pas enregistré.
    expect(changements({ mois: 3 })).toEqual([]);
    expect(changements(null)).toEqual([]);
    expect(changements(undefined)).toEqual([]);
    expect(changements("texte")).toEqual([]);
    expect(changements([1, 2])).toEqual([]);
  });

  it("rien n'est annoncé quand rien n'a changé", () => {
    expect(changements({ avant: { nom: "A" }, apres: { nom: "A" } })).toEqual([]);
  });
});

/**
 * Le croisement mécanique qui a trouvé le défaut, gardé comme contrôle.
 *
 * Vingt-sept actions journalisées n'avaient aucun libellé — `user.update`,
 * `project.update`, `leave.balance_set`, les quatre
 * `predefined_task.recurrence_*`, `audit.partitions`… La ligne rendait alors
 * le code deux fois, une fois en guise de libellé et une fois en guise de code.
 *
 * La liste est fixée ici plutôt que relue dans `apps/api` : un test de
 * `apps/web` n'a pas de `node:fs` typé, et une liste écrite est une liste
 * qu'on voit vieillir. Une action serveur nouvelle sans libellé se rattrape au
 * croisement décrit dans le compte rendu du correctif.
 */
const ACTIONS_TRACEES = [
  "audit.partitions", "client.update", "departement.update", "direction.update",
  "epic.create", "epic.update", "epic.delete", "event.update", "event.delete",
  "leave.balance_set", "leave_type.create", "leave_type.update", "milestone.update",
  "predefined_task.update", "predefined_task.recurrence_add",
  "predefined_task.recurrence_update", "predefined_task.recurrence_toggle",
  "predefined_task.recurrence_delete", "project.update", "project.member_update",
  "service.update", "service.delete", "task.assignees_set", "telework.rule_update",
  "telework.rule_delete", "third_party.update", "user.update", "report.export",
  // Quelques-unes qui étaient déjà couvertes : le contrôle doit rester vrai
  // pour l'ensemble, pas seulement pour ce qu'on vient d'ajouter.
  "user.create", "project.create", "leave.approve", "auth.login_success",
];

describe("EX-ADM-03 — chaque action journalisée porte un libellé, dans les deux langues", () => {
  it("affirme qu'il y a quelque chose à mesurer", () => {
    // Un contrôle qui n'a rien à mesurer doit échouer, jamais réussir en
    // silence : le dépôt a payé trois fois cette leçon.
    expect(ACTIONS_TRACEES.length).toBeGreaterThan(25);
  });

  for (const action of ACTIONS_TRACEES) {
    const cle = `action_${action.replaceAll(".", "_")}`;
    it(`« ${action} » a un libellé FR et EN`, () => {
      const audit = fr.audit as Record<string, string>;
      const auditEn = en.audit as Record<string, string>;
      expect(audit[cle], `manque en fr : ${cle}`).toBeTruthy();
      expect(auditEn[cle], `manque en en : ${cle}`).toBeTruthy();
      // Un libellé qui recopie le code ne libelle rien : c'est exactement ce
      // que la ligne affichait, « user.update · user.update ».
      expect(audit[cle]).not.toBe(action);
      expect(auditEn[cle]).not.toBe(action);
    });
  }
});

/**
 * `EX-ADM-03` — **l'entité tracée s'atteint quand elle a une vue.**
 *
 * Le reste constaté de l'exploration Karim T-3 : le champ ENTITÉ du panneau de
 * détail rendait un UUID nu. Karim voyait qu'un projet avait changé, jamais
 * lequel, et n'avait aucun moyen d'aller le regarder.
 *
 * Le NOM, lui, n'est pas dans la trace : le serveur ne joint aucun libellé, et
 * l'inventer au client demanderait une requête par ligne. C'est la moitié qui
 * reste — remontée, pas comblée ici.
 */
describe("EX-ADM-03 — le champ ENTITÉ mène à l'entité", () => {
  const ID = "cdb5aaa8-3b1f-4f2a-9a4c-0b7e2f1d5c33";

  it("les trois types qui ont une vue mènent à leur vue", () => {
    expect(vueDeLEntite("User", ID)).toBe("utilisateur");
    expect(vueDeLEntite("Project", ID)).toBe("projet");
    expect(vueDeLEntite("Task", ID)).toBe("tache");
  });

  it("un type sans vue reste un texte, jamais un lien mort", () => {
    // Un réglage, un jour férié, un type de congé : le produit n'a pas d'écran
    // qui s'ouvre sur leur identifiant. Un lien y vaudrait moins qu'un texte.
    expect(vueDeLEntite("Setting", ID)).toBe(null);
    expect(vueDeLEntite("Holiday", ID)).toBe(null);
    expect(vueDeLEntite("AuditLog", ID)).toBe(null);
  });

  it("UN REFUS TRACÉ NE PORTE PAS D'IDENTIFIANT — il porte une route", () => {
    // `RG-ADM-03` fait tracer l'accès refusé par la garde : `typeEntite` vaut
    // alors `Endpoint` et `entiteId` « GET /api/administration/audit ». Suivre
    // cela comme un identifiant fabriquerait une adresse absurde.
    expect(vueDeLEntite("Endpoint", "GET /api/administration/audit")).toBe(null);
    expect(vueDeLEntite("User", "u1")).toBe(null);
    expect(vueDeLEntite("Project", "")).toBe(null);
  });
});
