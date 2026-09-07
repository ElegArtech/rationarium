import { describe, it, expect } from "vitest";
import { MODELES_ROLES, PERMISSIONS_GESTION_GLOBALE } from "@rationarium/contracts";
import { PerimetreService, type Perimetre } from "./perimetre.service.js";

/**
 * Le périmètre, éprouvé sans base — les prédicats et la résolution.
 *
 * `perimetre.int.test.ts` vérifie déjà que les prédicats FILTRENT réellement
 * en base. Ce qu'il ne pouvait pas voir tient à deux confusions de forme, que
 * seuls des ensembles observés directement révèlent :
 *
 *   - « je vois tout » et « mon périmètre est vide » étaient la même valeur ;
 *   - `domaine:manage_any` était lu comme « toute l'instance », alors qu'il ne
 *     dit que « des objets dont je ne suis pas le propriétaire ».
 */

const decor = {
  fatou: "11111111-1111-4111-8111-111111111111",
  deptA: "22222222-2222-4222-8222-222222222222",
  camille: "33333333-3333-4333-8333-333333333333",
  hugo: "44444444-4444-4444-8444-444444444444",
};

/**
 * Un Prisma factice qui rend exactement ce que `resoudre` interroge : Fatou est
 * rattachée au département A, dont Camille est le seul autre agent. Hugo est
 * ailleurs — il n'est rendu par aucune requête, donc il ne doit apparaître dans
 * aucun ensemble.
 */
const prismaFactice = () => ({
  user: {
    findUnique: async () => ({
      departementId: decor.deptA,
      services: [],
      directionsDirigees: [],
      departementsDiriges: [],
      servicesManages: [],
    }),
    findMany: async () => [{ id: decor.fatou }, { id: decor.camille }],
  },
  departement: { findMany: async () => [] },
});

const service = () => new PerimetreService(prismaFactice() as never);

const permissionsDuModele = (code: string): ReadonlySet<string> =>
  new Set(MODELES_ROLES.find((m) => m.code === code)?.permissions ?? []);

describe("RG-SCOPE-03 — un périmètre global reste NOMMABLE", () => {
  /*
   * Le nœud de C-02. `EX-PLN-05` — « Mon périmètre » resserre volontairement
   * quelqu'un qui a le droit de voir plus large. Le filtre intersecte avec
   * `perimetre.utilisateurs` : rendu vide, il vidait la grille au lieu de la
   * restreindre, et la manager n'y figurait même pas elle-même.
   */
  it("un porteur de gestion globale connaît son département et ses agents", async () => {
    const p = await service().resoudre(decor.fatou, new Set(["users:manage_any"]));
    expect(p.global).toBe(true);
    expect(p.departements.has(decor.deptA)).toBe(true);
    expect(p.utilisateurs.has(decor.fatou)).toBe(true);
    expect(p.utilisateurs.has(decor.camille)).toBe(true);
    expect(p.utilisateurs.has(decor.hugo)).toBe(false);
  });

  it("et ses prédicats ne filtrent toujours rien — le global reste global", async () => {
    const perimetres = service();
    const p = await perimetres.resoudre(decor.fatou, new Set(["users:manage_any"]));
    expect(perimetres.filtreUtilisateur(p)).toEqual({});
    expect(perimetres.filtreParAgent(p)).toEqual({});
    expect(perimetres.filtreDepartement(p)).toEqual({});
  });
});

describe("RG-SCOPE-01, RG-CNG-15 — l'encadrement ne donne pas la vue de l'instance", () => {
  /*
   * `POST /api/conges` pour un agent hors des services de Fatou rendait 201 :
   * `leaves:manage_any` la faisait passer en périmètre global, et
   * `CongesService` ne contrôle l'appartenance que `!perimetre.global`.
   */
  it("leaves:manage_any ne suffit pas à un périmètre global", async () => {
    const p = await service().resoudre(decor.fatou, new Set(["leaves:manage_any"]));
    expect(p.global).toBe(false);
    expect(p.utilisateurs.has(decor.hugo)).toBe(false);
  });

  it("telework:manage_any non plus", async () => {
    const p = await service().resoudre(decor.fatou, new Set(["telework:manage_any"]));
    expect(p.global).toBe(false);
  });

  it("le modèle MANAGER est borné à son périmètre organisationnel", async () => {
    const p = await service().resoudre(decor.fatou, permissionsDuModele("MANAGER"));
    expect(p.global).toBe(false);
    expect(p.utilisateurs.has(decor.hugo)).toBe(false);
  });

  it("les rôles qui lisent tous les comptes, eux, voient l'instance", async () => {
    for (const code of ["ADMIN", "HR_OFFICER", "PORTFOLIO_MANAGER", "CONTROLLER"]) {
      const p = await service().resoudre(decor.fatou, permissionsDuModele(code));
      expect(p.global, `${code} devrait voir l'instance`).toBe(true);
    }
  });

  it("la liste de gestion globale ne contient aucun manage_any de domaine métier", () => {
    for (const p of ["leaves:manage_any", "telework:manage_any", "events:manage_any"]) {
      expect(PERMISSIONS_GESTION_GLOBALE, p).not.toContain(p);
    }
  });
});

describe("RG-SCOPE-02, RG-TSK-01 — les tâches d'un projet qu'on mène", () => {
  const perimetreNu: Perimetre = {
    userId: decor.fatou,
    global: false,
    departements: new Set([decor.deptA]),
    utilisateurs: new Set([decor.fatou, decor.camille]),
    confidentiel: false,
  };

  /*
   * `filtreTache` ne connaissait que « assigné » et « membre du projet ». Le
   * chef d'un projet — qui le voit au portefeuille par `filtreMesProjets` — ne
   * voyait aucune de ses tâches tant qu'il n'était pas inscrit à sa propre
   * équipe. Trois prédicats décrivaient « mes projets » et se contredisaient.
   */
  it("le prédicat de tâche reprend celui des projets, sponsor compris", () => {
    const rendu = JSON.stringify(service().filtreTache(perimetreNu, new Set()));
    expect(rendu).toContain("chefId");
    expect(rendu).toContain("sponsorId");
    expect(rendu).toContain("createurId");
    expect(rendu).toContain("assignes");
  });

  it("RG-SCOPE-04 — la confidentialité reste exclue par-dessus", () => {
    const rendu = JSON.stringify(service().filtreTache(perimetreNu, new Set()));
    expect(rendu).toContain('"confidentielle":false');
  });
});
