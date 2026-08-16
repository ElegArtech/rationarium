import { describe, it, expect } from "vitest";
import {
  lundiDe,
  decaler,
  periodeDe,
  ajouterJours,
  indexer,
  COUCHES_PAR_DEFAUT,
  type Filtres,
} from "./grille.js";
import type { Planning } from "../../api/planning.js";

/**
 * L-20 — la logique de grille.
 *
 * Elle est testée sans rendu parce que ses erreurs sont **arithmétiques**, pas
 * visuelles : un dimanche rattaché à la mauvaise semaine, un 31 janvier qui
 * déborde sur mars, une demi-journée affichée trois jours de suite. Aucune ne
 * se voit sur une capture d'écran du cas nominal.
 */

const TOUT: Filtres = {
  statuts: new Set(["todo", "doing", "review", "done", "blocked"]),
  typesTache: new Set(["projet", "hors_projet"]),
  presence: new Set(["telework", "office"]),
  absences: new Set(["valide", "attente"]),
  evenements: new Set(["interne", "externe"]),
};

const jours = (debut: string, n: number) =>
  Array.from({ length: n }, (_, i) => ajouterJours(debut, i));

const vide: Planning = {
  periode: { debut: "2026-03-02", fin: "2026-03-08", jours: jours("2026-03-02", 7) },
  groupes: [],
  occupations: { taches: [], conges: [], teletravail: [], evenements: [], permanences: [] },
  trame: { joursChomes: [], vacances: [] },
  synthese: [],
};

describe("le calcul de période", () => {
  it("LE DIMANCHE APPARTIENT À LA SEMAINE QUI PRÉCÈDE — l'erreur d'un jour sur sept", () => {
    // 2026-03-08 est un dimanche. `getUTCDay()` y rend 0 : un calcul naïf le
    // rattacherait au lundi suivant.
    expect(lundiDe("2026-03-08")).toBe("2026-03-02");
    expect(lundiDe("2026-03-02")).toBe("2026-03-02");
    expect(lundiDe("2026-03-04")).toBe("2026-03-02");
  });

  it("une semaine fait sept jours, du lundi au dimanche", () => {
    expect(periodeDe("semaine", "2026-03-05")).toEqual({
      debut: "2026-03-02",
      fin: "2026-03-08",
    });
  });

  it("un mois va du 1er au dernier jour, février compris", () => {
    expect(periodeDe("mois", "2026-02-17")).toEqual({ debut: "2026-02-01", fin: "2026-02-28" });
    // 2028 est bissextile : le 29 existe.
    expect(periodeDe("mois", "2028-02-17")).toEqual({ debut: "2028-02-01", fin: "2028-02-29" });
  });

  it("LE 31 JANVIER + UN MOIS NE DÉBORDE PAS SUR MARS", () => {
    // `setMonth` sur un 31 donnerait le 3 mars. C'est le piège classique.
    expect(decaler("mois", "2026-01-31", 1)).toBe("2026-02-01");
    expect(decaler("mois", "2026-03-15", -1)).toBe("2026-02-01");
  });

  it("la navigation hebdomadaire avance d'une semaine pleine", () => {
    expect(decaler("semaine", "2026-03-02", 1)).toBe("2026-03-09");
    expect(decaler("semaine", "2026-03-02", -1)).toBe("2026-02-23");
  });
});

describe("EX-PLN-03 — l'indexation des occupations", () => {
  it("une tâche qui court sur trois jours occupe les trois cellules", () => {
    const index = indexer(
      {
        ...vide,
        occupations: {
          ...vide.occupations,
          taches: [
            {
              id: "t1", titre: "Note", statut: "doing", priorite: "normal", avancement: 0,
              dateDebut: "2026-03-03", dateFin: "2026-03-05", heureDebut: null, heureFin: null,
              interventionExterieure: false, project: null, assignes: ["u1"],
              horsProjet: true, multiAssignee: false,
            },
          ],
        },
      },
      COUCHES_PAR_DEFAUT,
      TOUT,
    );

    expect(index.get("u1|2026-03-03")?.occupations).toHaveLength(1);
    expect(index.get("u1|2026-03-04")?.occupations).toHaveLength(1);
    expect(index.get("u1|2026-03-05")?.occupations).toHaveLength(1);
    expect(index.get("u1|2026-03-06")).toBeUndefined();
  });

  it("EX-PLN-06 — une couche éteinte retire ses occupations, pas les autres", () => {
    const donnees: Planning = {
      ...vide,
      occupations: {
        ...vide.occupations,
        taches: [
          {
            id: "t1", titre: "Projet", statut: "doing", priorite: "normal", avancement: 0,
            dateDebut: "2026-03-03", dateFin: "2026-03-03", heureDebut: null, heureFin: null,
            interventionExterieure: false, project: { id: "p", nom: "P", icone: null },
            assignes: ["u1"], horsProjet: false, multiAssignee: false,
          },
          {
            id: "t2", titre: "Hors projet", statut: "doing", priorite: "normal", avancement: 0,
            dateDebut: "2026-03-03", dateFin: "2026-03-03", heureDebut: null, heureFin: null,
            interventionExterieure: false, project: null, assignes: ["u1"],
            horsProjet: true, multiAssignee: false,
          },
        ],
      },
    };

    const sansHorsProjet = indexer(
      donnees,
      { ...COUCHES_PAR_DEFAUT, tachesHorsProjet: false },
      TOUT,
    );
    const restantes = sansHorsProjet.get("u1|2026-03-03")?.occupations ?? [];
    expect(restantes).toHaveLength(1);
    expect(restantes[0]?.genre === "tache" && restantes[0].tache.id).toBe("t1");
  });

  it("EX-PLN-07 — la légende filtre par statut", () => {
    const donnees: Planning = {
      ...vide,
      occupations: {
        ...vide.occupations,
        taches: [
          {
            id: "t1", titre: "Terminée", statut: "done", priorite: "normal", avancement: 100,
            dateDebut: "2026-03-03", dateFin: "2026-03-03", heureDebut: null, heureFin: null,
            interventionExterieure: false, project: null, assignes: ["u1"],
            horsProjet: true, multiAssignee: false,
          },
        ],
      },
    };

    const sansTerminees = indexer(donnees, COUCHES_PAR_DEFAUT, {
      ...TOUT,
      statuts: new Set(["todo", "doing"]),
    });
    expect(sansTerminees.get("u1|2026-03-03")).toBeUndefined();
  });

  it("UNE DEMI-JOURNÉE N'EST UNE DEMI QU'AUX EXTRÉMITÉS du congé", () => {
    const index = indexer(
      {
        ...vide,
        occupations: {
          ...vide.occupations,
          conges: [
            {
              id: "c1", userId: "u1", dateDebut: "2026-03-02", dateFin: "2026-03-04",
              statut: "approved", demiJourneeDebut: "afternoon", demiJourneeFin: "morning",
              type: { id: "ct", nom: "CA", couleur: null, icone: null },
            },
          ],
        },
      },
      COUCHES_PAR_DEFAUT,
      TOUT,
    );

    expect(index.get("u1|2026-03-02")?.demiJournee).toBe("afternoon");
    // Le jour du milieu est PLEIN : trois demi-journées seraient un contresens.
    expect(index.get("u1|2026-03-03")?.demiJournee).toBeNull();
    expect(index.get("u1|2026-03-04")?.demiJournee).toBe("morning");
  });

  it("RG-TLT-02 — « non déclaré » n'est pas un lieu choisi, il ne s'affiche pas", () => {
    const index = indexer(
      {
        ...vide,
        occupations: {
          ...vide.occupations,
          teletravail: [
            { id: "w1", userId: "u1", date: "2026-03-02", etat: "undeclared", issuDeRegle: false, version: 1 },
            { id: "w2", userId: "u1", date: "2026-03-03", etat: "office", issuDeRegle: false, version: 1 },
          ],
        },
      },
      COUCHES_PAR_DEFAUT,
      TOUT,
    );

    expect(index.get("u1|2026-03-02")).toBeUndefined();
    expect(index.get("u1|2026-03-03")?.lieu?.etat).toBe("office");
  });

  it("le congé recouvre la cellule SANS effacer ce qu'elle contenait", () => {
    const index = indexer(
      {
        ...vide,
        occupations: {
          ...vide.occupations,
          taches: [
            {
              id: "t1", titre: "Note", statut: "doing", priorite: "normal", avancement: 0,
              dateDebut: "2026-03-03", dateFin: "2026-03-03", heureDebut: null, heureFin: null,
              interventionExterieure: false, project: null, assignes: ["u1"],
              horsProjet: true, multiAssignee: false,
            },
          ],
          conges: [
            {
              id: "c1", userId: "u1", dateDebut: "2026-03-03", dateFin: "2026-03-03",
              statut: "pending", demiJourneeDebut: null, demiJourneeFin: null,
              type: { id: "ct", nom: "CA", couleur: null, icone: null },
            },
          ],
        },
      },
      COUCHES_PAR_DEFAUT,
      TOUT,
    );

    const cellule = index.get("u1|2026-03-03");
    expect(cellule?.conge?.statut).toBe("pending");
    // La carte de détail de la vue Mois montre encore la tâche : le congé la
    // masque à l'écran, il ne la supprime pas de la lecture.
    expect(cellule?.occupations).toHaveLength(1);
  });

  it("RG-PLN-07 — sans permanences, l'index n'en invente pas", () => {
    const index = indexer(
      { ...vide, occupations: { ...vide.occupations, permanences: null } },
      COUCHES_PAR_DEFAUT,
      TOUT,
    );
    expect(index.size).toBe(0);
  });
});
