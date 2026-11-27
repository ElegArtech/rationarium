import { describe, it, expect } from "vitest";
import type { ActionAgent } from "../../api/assistant.js";
import { groupesParProjet } from "./LigneAction.js";
import {
  compteRenduValidation,
  creationsEnAttente,
  estCreationEnAttente,
  etatDeLaLigne,
  horsValidation,
  projetPropose,
} from "./validation.js";

/**
 * `RG-AST-21`, `RG-AST-22` — **la création d'un projet par l'agent attend la
 * validation de son propriétaire, et les actions qui la désignent attendent
 * avec elle.**
 *
 * Les jeux d'essai se calquent sur `actions.service.ts` : une création en
 * attente a `etat: "a_valider"`, `type: "projet_creer"`, `dependDeId: null`,
 * `cibleId: null` et `apres: null` ; ses dépendantes ont `dependDeId` = l'id
 * de l'action-projet, et `projectId` nul, puisque le projet n'existe pas.
 */
const action = (modif: Partial<ActionAgent>): ActionAgent => ({
  id: "a1",
  passageId: "p1",
  projectId: null,
  projetNom: null,
  type: "tache_creer",
  reference: null,
  cibleType: null,
  cibleId: null,
  charge: {},
  avant: null,
  apres: null,
  justification: "Le courriel du 2 novembre ouvre l'affaire.",
  preuves: [{ source: "courriel", reference: "<id@x>", date: "2026-11-02" }],
  etat: "a_valider",
  motifRefus: null,
  defaiteLe: null,
  defaitePar: null,
  dependDeId: null,
  decidePar: null,
  decideLe: null,
  creeLe: "2026-11-02T22:10:00.000Z",
  ...modif,
});

const projetA = action({
  id: "pa",
  type: "projet_creer",
  reference: "cdr",
  charge: { nom: "Conseil de discipline", dateDebut: "2026-08-14", dateFin: "2026-09-18" },
  creeLe: "2026-11-02T22:00:00.000Z",
});
const projetB = action({ id: "pb", type: "projet_creer", charge: { nom: "Tribune" }, creeLe: "2026-11-02T22:05:00.000Z" });
const jalonA = action({ id: "ja", type: "jalon_creer", dependDeId: "pa", charge: { projectId: "@cdr", nom: "Séance" }, creeLe: "2026-11-02T22:01:00.000Z" });
const tacheA = action({ id: "ta", type: "tache_creer", dependDeId: "pa", charge: { projectId: "@cdr", titre: "Envoyer la déclaration" }, creeLe: "2026-11-02T22:02:00.000Z" });
const effectuee = action({
  id: "e1",
  type: "tache_modifier",
  etat: "effectuee",
  projectId: "11111111-1111-4111-8111-111111111111",
  projetNom: "Refonte du portail",
  cibleType: "Task",
  cibleId: "22222222-2222-4222-8222-222222222222",
});

describe("RG-AST-21 — la racine d'une validation", () => {
  it("seule une création de projet en attente, qui ne dépend de rien, se valide", () => {
    expect(estCreationEnAttente(projetA)).toBe(true);
    expect(estCreationEnAttente(jalonA)).toBe(false);
    expect(estCreationEnAttente({ ...projetA, etat: "effectuee" })).toBe(false);
    expect(estCreationEnAttente({ ...projetA, etat: "rejetee" })).toBe(false);
  });
});

describe("RG-AST-22 — les dépendantes attendent avec leur projet", () => {
  // L'ordre du serveur : la plus récente d'abord.
  const lues = [projetB, tacheA, jalonA, projetA];

  it("chaque dépendante est rangée sous SA création, et sous aucune autre", () => {
    const creations = creationsEnAttente(lues);
    expect(creations.map((c) => c.projet.id)).toEqual(["pb", "pa"]);
    expect(creations.find((c) => c.projet.id === "pa")?.dependantes.map((d) => d.id)).toEqual(["ja", "ta"]);
    expect(creations.find((c) => c.projet.id === "pb")?.dependantes).toEqual([]);
  });

  it("les dépendantes suivent l'ordre de dépôt — celui de l'exécution à la validation", () => {
    // Lues de la plus récente à la plus ancienne, elles se montrent dans l'autre sens :
    // le jalon avant la tâche qui s'y rattache.
    const [, a] = creationsEnAttente(lues);
    expect(a?.dependantes.map((d) => d.type)).toEqual(["jalon_creer", "tache_creer"]);
  });

  it("une dépendante dont la création est absente n'est rattachée à rien", () => {
    expect(creationsEnAttente([tacheA, jalonA])).toEqual([]);
  });

  it("une dépendante déjà décidée ne revient pas dans l'attente", () => {
    const creations = creationsEnAttente([projetA, { ...jalonA, etat: "effectuee" }, tacheA]);
    expect(creations[0]?.dependantes.map((d) => d.id)).toEqual(["ta"]);
  });
});

describe("§ 13 — une attente ne s'affiche pas en double dans les groupes par projet", () => {
  it("la création et ses dépendantes portées par la section « À valider » quittent la liste", () => {
    const liste = [tacheA, effectuee, jalonA, projetA];
    const visibles = horsValidation(liste, creationsEnAttente(liste));
    expect(visibles.map((a) => a.id)).toEqual(["e1"]);
    // Le seul groupe restant est celui du projet existant : aucun « Hors projet » fantôme.
    expect(groupesParProjet(visibles).map((g) => g.projectId)).toEqual(["11111111-1111-4111-8111-111111111111"]);
  });

  it("une attente que la section ne porte pas reste visible — mieux vaut une fois que jamais", () => {
    // La lecture des attentes a échoué : aucune création n'est portée.
    const liste = [tacheA, projetA, effectuee];
    expect(horsValidation(liste, []).map((a) => a.id)).toEqual(["ta", "pa", "e1"]);
  });

  it("une action rejetée ou validée reste dans la liste, où elle dit sa décision", () => {
    const rejetee = { ...projetA, etat: "rejetee" as const, decidePar: "Alexandre Berge", decideLe: "2026-11-03T08:00:00.000Z" };
    const liste = [rejetee, { ...jalonA, etat: "rejetee" as const }, effectuee];
    expect(horsValidation(liste, creationsEnAttente(liste))).toHaveLength(3);
  });
});

describe("le projet proposé, lu dans la charge", () => {
  it("nom, dates, statut et plan de suivi", () => {
    const p = projetPropose({
      nom: "Conseil de discipline",
      statut: "active",
      dateDebut: "2026-08-14",
      dateFin: "2026-09-18",
      suivi: {
        consigne: "Suivre le fil du CDR.",
        sources: [{ type: "courriel", designation: "from:cdr@exemple.fr", libelle: "Courriel du CDR" }],
        silenceJours: 14,
      },
    });
    expect(p).toMatchObject({ nom: "Conseil de discipline", statut: "active", dateDebut: "2026-08-14", dateFin: "2026-09-18" });
    expect(p.suivi?.sources).toHaveLength(1);
    expect(p.suivi?.silenceJours).toBe(14);
  });

  it("une charge inattendue ne fait pas tomber l'écran où l'on décide", () => {
    expect(projetPropose(null)).toMatchObject({ nom: null, suivi: null });
    expect(projetPropose({ nom: 3, suivi: { sources: [{ type: "courriel" }, "x"] } }).suivi?.sources).toEqual([]);
  });
});

describe("le compte rendu d'une validation", () => {
  const creation = { projet: projetA, dependantes: [jalonA, tacheA] };

  it("le projet créé mène à sa fiche ; chaque dépendante dit son sort, motif compris", () => {
    const motif = { cle: "assistant:erreurs.jalonObligatoire", message: "Une tâche doit être rattachée à un jalon.", statut: 422, regle: "RG-AST-08" };
    const r = compteRenduValidation(
      {
        projet: { actionId: "pa", etat: "effectuee", cibleId: "33333333-3333-4333-8333-333333333333", motif: null },
        dependantes: [
          { actionId: "ja", etat: "effectuee", cibleId: "44444444-4444-4444-8444-444444444444", motif: null },
          { actionId: "ta", etat: "refusee", cibleId: null, motif },
        ],
      },
      creation,
    );
    expect(r.projet).toMatchObject({ effectuee: true, cibleId: "33333333-3333-4333-8333-333333333333", nom: "Conseil de discipline" });
    expect(r.dependantes).toEqual([
      { actionId: "ja", type: "jalon_creer", nom: "Séance", effectuee: true, motif: null },
      { actionId: "ta", type: "tache_creer", nom: "Envoyer la déclaration", effectuee: false, motif },
    ]);
  });

  it("un projet refusé n'a pas de fiche, et sa dépendante inconnue est rendue sans nom", () => {
    const r = compteRenduValidation(
      {
        projet: { actionId: "pa", etat: "refusee", cibleId: "x", motif: { cle: "erreurs:x", message: "Refus.", statut: 403 } },
        dependantes: [{ actionId: "inconnue", etat: "refusee", cibleId: null, motif: null }],
      },
      creation,
    );
    expect(r.projet.cibleId).toBeNull();
    expect(r.projet.motif?.message).toBe("Refus.");
    expect(r.dependantes[0]).toMatchObject({ type: null, nom: null, effectuee: false });
  });
});

describe("l'état de la ligne d'action", () => {
  it("en attente : rien à défaire, la ligne dit qu'elle attend", () => {
    expect(etatDeLaLigne(projetA)).toEqual({ defaisable: false, attente: true, decision: null });
  });

  it("rejetée : rien à défaire, la ligne dit qui a rejeté et quand", () => {
    expect(etatDeLaLigne({ etat: "rejetee", decidePar: "Alexandre Berge", decideLe: "2026-11-03T08:00:00.000Z" })).toEqual({
      defaisable: false,
      attente: false,
      decision: { nature: "rejetee", qui: "Alexandre Berge", quand: "2026-11-03T08:00:00.000Z" },
    });
  });

  it("validée puis effectuée : défaisable comme toute action, et la validation reste dite", () => {
    const e = etatDeLaLigne({ etat: "effectuee", decidePar: "Alexandre Berge", decideLe: "2026-11-03T08:00:00.000Z" });
    expect(e.defaisable).toBe(true);
    expect(e.decision?.nature).toBe("validee");
  });

  it("validée mais refusée par sa route : la décision reste, rien à défaire", () => {
    const e = etatDeLaLigne({ etat: "refusee", decidePar: "Alexandre Berge", decideLe: "2026-11-03T08:00:00.000Z" });
    expect(e).toMatchObject({ defaisable: false, decision: { nature: "validee" } });
  });

  it("une action écrite directement n'a pas de mention de décision", () => {
    expect(etatDeLaLigne({ etat: "effectuee", decidePar: null, decideLe: null })).toEqual({
      defaisable: true,
      attente: false,
      decision: null,
    });
    expect(etatDeLaLigne({ etat: "defaite", decidePar: null, decideLe: null }).defaisable).toBe(false);
  });
});
