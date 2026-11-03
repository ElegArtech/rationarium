import { describe, it, expect } from "vitest";
import { STATUTS_PROJET, STATUTS_TACHE, type Terme } from "@rationarium/contracts";
import {
  cheminDeLaCible,
  ecarts,
  estCreation,
  lienSur,
  nomDeLaCible,
  stable,
  texteValeur,
  type ContexteValeur,
} from "./difference.js";
import { groupesParProjet } from "./LigneAction.js";
import type { ActionAgent } from "../../api/assistant.js";

/**
 * `docs/assistant/SPEC-PHASE-1.md § 11` — **la différence avant → après se lit
 * champ par champ**, et c'est sur elle qu'on décide de défaire.
 *
 * Les instantanés sont ceux que `actions.service.ts` écrit réellement :
 * `avant` ne porte que les champs touchés (`champsTouches`), `apres` l'entité
 * entière relue par `lireEntite` — dates en `AAAA-MM-JJ`, `version` compris.
 */
describe("EX-AST-06 — ce qui a changé, et seulement ce qui a changé", () => {
  it("une modification isole le champ qui diffère des champs identiques", () => {
    const r = ecarts(
      { statut: "doing", avancement: 40, titre: "Rédiger la note" },
      { statut: "done", avancement: 100, titre: "Rédiger la note", version: 4 },
    );
    expect(r.creation).toBe(false);
    expect(r.lignes).toEqual([
      { champ: "statut", avant: "doing", apres: "done" },
      { champ: "avancement", avant: 40, apres: 100 },
    ]);
  });

  it("`version` n'est jamais un changement à montrer — c'est le verrou, pas la donnée", () => {
    expect(ecarts({ version: 1, nom: "A" }, { version: 2, nom: "A" }).lignes).toEqual([]);
  });

  it("`apres` est l'entité ENTIÈRE : un champ que l'action n'a pas touché n'est pas un changement", () => {
    // Ce que le serveur écrit pour `tache_modifier { statut }` : `avant` réduit
    // aux champs touchés, `apres` relu en entier. L'union des clés ferait
    // paraître le titre, le projet et les dates comme « ajoutés ».
    const r = ecarts(
      { statut: "doing", avancement: 40 },
      { projectId: "p", titre: "Rédiger la note", statut: "done", avancement: 100, dateFin: "2026-11-30", version: 5 },
    );
    expect(r.lignes.map((l) => l.champ)).toEqual(["statut", "avancement"]);
  });

  it("un champ touché qui passe de vide à rempli compte, et l'inverse aussi", () => {
    expect(ecarts({ dateFin: null }, { dateFin: "2026-12-01", titre: "x" }).lignes).toEqual([
      { champ: "dateFin", avant: null, apres: "2026-12-01" },
    ]);
    expect(ecarts({ description: "x" }, { description: null }).lignes).toEqual([
      { champ: "description", avant: "x", apres: null },
    ]);
  });

  it("un champ absent et un champ vidé disent la même chose — pas de faux écart", () => {
    expect(ecarts({ milestoneId: null }, {}).lignes).toEqual([]);
  });

  it("deux listes de sources identiques, sérialisées dans deux ordres de clés, ne diffèrent pas", () => {
    const a = { sources: [{ type: "courriel", designation: "tag:x" }] };
    const b = { sources: [{ designation: "tag:x", type: "courriel" }] };
    expect(ecarts(a, b).lignes).toEqual([]);
    expect(stable(a.sources)).toBe(stable(b.sources));
  });

  it("une création rend l'état créé, sans ses champs vides, ses identifiants ni sa version", () => {
    const r = ecarts(null, {
      projectId: "11111111-1111-4111-8111-111111111111",
      nom: "Refonte",
      description: "",
      milestoneId: null,
      dateDebut: "2026-08-14",
      version: 1,
    });
    expect(r.creation).toBe(true);
    expect(r.lignes.map((l) => l.champ)).toEqual(["nom", "dateDebut"]);
  });

  it("une action refusée n'a rien écrit : aucune ligne", () => {
    expect(ecarts(null, null)).toEqual({ creation: false, lignes: [] });
  });

  it("le nom de l'entité passe avant son état : ordre de lecture stable", () => {
    const r = ecarts(
      { dateFin: "2026-01-01", titre: "A", statut: "todo" },
      { dateFin: "2026-02-01", titre: "B", statut: "doing" },
    );
    expect(r.lignes.map((l) => l.champ)).toEqual(["titre", "statut", "dateFin"]);
  });
});

describe("la valeur se lit, elle ne se décode pas", () => {
  const libelle = (code: string, vocabulaire: readonly Terme<string>[]) =>
    vocabulaire.find((t) => t.code === code)?.fr ?? code;
  const ctx = (cible: ContexteValeur["cible"]): ContexteValeur => ({
    cible,
    libelle,
    formaterDate: (v) => `date(${v})`,
    oui: "oui",
    non: "non",
    vide: "—",
    pourcent: (n) => `${n} %`,
    nombre: (n) => String(n).replace(".", ","),
  });

  it("le libellé d'un statut dépend de l'entité : `done` n'est pas le même mot partout", () => {
    const tache = STATUTS_TACHE.find((s) => s.code === "done")?.fr;
    const projet = STATUTS_PROJET.find((s) => s.code === "done")?.fr;
    expect(texteValeur("statut", "done", ctx("Task"))).toBe(tache);
    expect(texteValeur("statut", "done", ctx("Project"))).toBe(projet);
  });

  it("une date passe par le format réglé, un booléen se dit, un vide aussi", () => {
    expect(texteValeur("dateEcheance", "2026-11-30", ctx("Milestone"))).toBe("date(2026-11-30)");
    expect(texteValeur("actif", false, ctx("ProjetSuivi"))).toBe("non");
    expect(texteValeur("description", null, ctx("Task"))).toBe("—");
    expect(texteValeur("description", "", ctx("Task"))).toBe("—");
  });

  it("l'avancement est un pourcentage ; un nombre ordinaire suit la région réglée", () => {
    expect(texteValeur("avancement", 55, ctx("Task"))).toBe("55 %");
    expect(texteValeur("heures", 1.5, ctx("TimeEntry"))).toBe("1,5");
  });

  it("des sources se lisent par leur type et leur nom, jamais en JSON", () => {
    const rendu = texteValeur(
      "sources",
      [
        { type: "courriel", designation: "tag:cdr", libelle: "Courriel du CDR" },
        { type: "depot", designation: "ElegArtech/rationarium" },
      ],
      ctx("ProjetSuivi"),
    );
    expect(rendu).toBe("Courriel · Courriel du CDR ; Dépôt de code · ElegArtech/rationarium");
    expect(rendu).not.toContain("{");
  });

  it("un texte très long est coupé : la ligne n'est pas la fiche", () => {
    const rendu = texteValeur("description", "x".repeat(1000), ctx("Task"));
    expect(rendu.length).toBeLessThanOrEqual(300);
    expect(rendu.endsWith("…")).toBe(true);
  });
});

/** Une action telle que `GET /assistant/actions` la rend (`actions.service.ts`, `lister`). */
const action = (modif: Partial<ActionAgent>): ActionAgent => ({
  id: "a1",
  passageId: "p1",
  projectId: "11111111-1111-4111-8111-111111111111",
  projetNom: "Refonte du portail",
  type: "tache_modifier",
  reference: null,
  cibleType: "Task",
  cibleId: "22222222-2222-4222-8222-222222222222",
  charge: {},
  avant: { statut: "doing" },
  apres: { statut: "done", titre: "Rédiger la note" },
  justification: "Le courriel du 2 novembre clôt le sujet.",
  preuves: [{ source: "courriel", reference: "<id@x>", date: "2026-11-02" }],
  etat: "effectuee",
  motifRefus: null,
  defaiteLe: null,
  defaitePar: null,
  creeLe: "2026-11-02T22:10:00.000Z",
  ...modif,
});

describe("l'entité visée, et le chemin qui y mène", () => {
  it("le nom vient de l'état d'après, sinon d'avant, sinon de la charge", () => {
    expect(nomDeLaCible(action({}))).toBe("Rédiger la note");
    expect(nomDeLaCible(action({ apres: null, avant: null, charge: { nom: "Nouveau projet" } }))).toBe("Nouveau projet");
    expect(nomDeLaCible(action({ apres: null, avant: null, charge: {} }))).toBeNull();
  });

  it("une tâche mène à sa fiche, un jalon au jalonnement de son projet, un plan à l'onglet Suivi", () => {
    expect(cheminDeLaCible(action({}))).toBe("/taches/22222222-2222-4222-8222-222222222222");
    expect(cheminDeLaCible(action({ cibleType: "Milestone", type: "jalon_modifier" }))).toBe(
      "/projets/11111111-1111-4111-8111-111111111111/jalons",
    );
    expect(
      cheminDeLaCible(action({ cibleType: "ProjetSuivi", type: "suivi_modifier", cibleId: "11111111-1111-4111-8111-111111111111" })),
    ).toBe("/projets/11111111-1111-4111-8111-111111111111/suivi");
  });

  it("RG-AST-18 — une création DÉFAITE a supprimé son entité : aucun lien sous son nom", () => {
    expect(cheminDeLaCible(action({ type: "tache_creer", etat: "defaite", avant: null }))).toBeNull();
    expect(cheminDeLaCible(action({ type: "projet_creer", cibleType: "Project", etat: "defaite" }))).toBeNull();
  });

  it("une MODIFICATION défaite a rétabli son entité, qui existe toujours : le lien demeure", () => {
    expect(cheminDeLaCible(action({ etat: "defaite" }))).toBe("/taches/22222222-2222-4222-8222-222222222222");
  });

  it("une action refusée n'a rien écrit : aucun lien sous le nom qu'elle demandait", () => {
    expect(cheminDeLaCible(action({ etat: "refusee", cibleId: null, cibleType: null }))).toBeNull();
  });

  it("les six types qui créent leur entité sont reconnus — c'est ce qui change la confirmation", () => {
    for (const type of ["projet_creer", "jalon_creer", "tache_creer", "evenement_creer", "temps_saisir", "commentaire_ajouter"]) {
      expect(estCreation(type), type).toBe(true);
    }
    for (const type of ["projet_modifier", "jalon_modifier", "tache_modifier", "evenement_modifier", "suivi_modifier"]) {
      expect(estCreation(type), type).toBe(false);
    }
  });
});

describe("§ 15 — une preuve écrite par l'agent ne mène qu'à une adresse sûre", () => {
  it("http, https et mailto deviennent un lien", () => {
    expect(lienSur("https://github.com/ElegArtech/rationarium/commit/abc")).toBe(
      "https://github.com/ElegArtech/rationarium/commit/abc",
    );
    expect(lienSur("mailto:cdr@exemple.fr")).toBe("mailto:cdr@exemple.fr");
  });

  it("`javascript:` est une URL valide pour le contrat, et n'est JAMAIS un lien ici", () => {
    expect(lienSur("javascript:alert(1)")).toBeNull();
    expect(lienSur("JavaScript:alert(1)")).toBeNull();
    expect(lienSur("data:text/html,<script>alert(1)</script>")).toBeNull();
  });

  it("une adresse illisible ou absente ne fabrique rien", () => {
    expect(lienSur("pas une adresse")).toBeNull();
    expect(lienSur(undefined)).toBeNull();
    expect(lienSur("")).toBeNull();
  });
});

describe("§ 13 — les actions se groupent par projet", () => {
  it("un groupe par projet, dans l'ordre de la plus récente action, et les actions hors projet à part", () => {
    const groupes = groupesParProjet([
      action({ id: "1", projectId: "p-b", projetNom: "B" }),
      action({ id: "2", projectId: "p-a", projetNom: "A" }),
      action({ id: "3", projectId: "p-b", projetNom: "B" }),
      action({ id: "4", projectId: null, projetNom: null }),
    ]);
    expect(groupes.map((g) => g.projetNom)).toEqual(["B", "A", null]);
    expect(groupes[0]?.actions.map((a) => a.id)).toEqual(["1", "3"]);
  });
});
