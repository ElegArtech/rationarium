import "reflect-metadata";
import { HttpException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { MODELES_ROLES } from "@rationarium/contracts";
import { CLE_PERMISSION } from "../commun/permissions.garde.js";
import { PerimetreService, type Perimetre } from "../commun/perimetre.service.js";
import { RechercheController } from "../recherche/recherche.controller.js";
import { RechercheService } from "../recherche/recherche.service.js";

const perimetre = (partiel: Partial<Perimetre> = {}): Perimetre => ({
  userId: "acteur",
  global: false,
  departements: new Set(["departement-visible"]),
  utilisateurs: new Set(["acteur"]),
  confidentiel: false,
  ...partiel,
});

describe("RM-13 — recherche globale serveur", () => {
  it("D-RM-07 — groupe un projet et une tâche autorisés avec leurs destinations", async () => {
    const prisma = {
      project: { findMany: vi.fn().mockResolvedValue([{ id: "projet-1", nom: "Portail agent" }]) },
      task: {
        findMany: vi.fn().mockResolvedValue([{
          id: "tache-1",
          titre: "Maquette du portail",
          project: { id: "projet-1", nom: "Portail agent" },
        }]),
      },
    };
    const filtres = {
      filtreProjet: vi.fn().mockReturnValue({ visibleProjet: true }),
      filtreTache: vi.fn().mockReturnValue({ visibleTache: true }),
    };
    const service = new RechercheService(prisma as never, filtres as never);

    await expect(service.rechercher(
      " portail ",
      perimetre(),
      new Set(["projects:read", "tasks:read"]),
    )).resolves.toEqual({
      terme: "portail",
      total: 2,
      projets: [{ id: "projet-1", nom: "Portail agent", destination: "/projets/projet-1" }],
      taches: [{
        id: "tache-1",
        titre: "Maquette du portail",
        destination: "/taches/tache-1",
        projet: { id: "projet-1", nom: "Portail agent" },
      }],
    });
  });

  it("RG-SCOPE-02 — injecte le périmètre projet dans la requête, sans filtrage après lecture", async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const service = new RechercheService(
      { project: { findMany }, task: { findMany: vi.fn() } } as never,
      new PerimetreService({} as never),
    );
    await service.rechercher("secret", perimetre(), new Set(["projects:read"]));
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        AND: [
          { OR: [
            { createurId: "acteur" },
            { chefId: "acteur" },
            { sponsorId: "acteur" },
            { membres: { some: { userId: "acteur" } } },
          ] },
          { nom: { contains: "secret", mode: "insensitive" } },
        ],
      },
    }));
  });

  it("RG-SCOPE-04 — exclut les tâches confidentielles sans permission explicite", async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const service = new RechercheService(
      { project: { findMany: vi.fn() }, task: { findMany } } as never,
      new PerimetreService({} as never),
    );
    await service.rechercher("confidentiel", perimetre(), new Set(["tasks:read"]));
    expect(findMany.mock.calls[0]?.[0].where.AND[0]).toEqual({
      AND: [
        {
          OR: [
            { assignes: { some: { userId: "acteur" } } },
            { project: {
              OR: [
                { createurId: "acteur" },
                { chefId: "acteur" },
                { sponsorId: "acteur" },
                { membres: { some: { userId: "acteur" } } },
              ],
            } },
          ],
        },
        { confidentielle: false },
      ],
    });
  });

  it("RG-SCOPE-04 — tasks:read_confidential conserve les tâches permises par le périmètre", async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const service = new RechercheService(
      { project: { findMany: vi.fn() }, task: { findMany } } as never,
      new PerimetreService({} as never),
    );
    await service.rechercher(
      "confidentiel",
      perimetre({ confidentiel: true }),
      new Set(["tasks:read", "tasks:read_confidential"]),
    );
    expect(JSON.stringify(findMany.mock.calls[0]?.[0].where)).not.toContain("confidentielle");
  });

  it("RG-DROITS-03 — un droit de lecture d'une famille n'ouvre jamais l'autre famille", async () => {
    const projets = vi.fn().mockResolvedValue([]);
    const taches = vi.fn().mockResolvedValue([]);
    const service = new RechercheService(
      { project: { findMany: projets }, task: { findMany: taches } } as never,
      { filtreProjet: vi.fn().mockReturnValue({}), filtreTache: vi.fn().mockReturnValue({}) } as never,
    );
    await service.rechercher("portail", perimetre(), new Set(["tasks:read"]));
    expect(projets).not.toHaveBeenCalled();
    expect(taches).toHaveBeenCalledOnce();
  });

  it("RG-DROITS-03 — la route exige projects:read ou tasks:read dans la garde", () => {
    const permissions = Reflect.getMetadata(
      CLE_PERMISSION,
      RechercheController.prototype.rechercher,
    ) as string[];
    expect(permissions).toEqual(["projects:read", "tasks:read"]);
  });

  it("D-RM-07 — refuse un terme vide ou supérieur à 120 caractères avant toute lecture", () => {
    const rechercher = vi.fn();
    const controller = new RechercheController({ rechercher } as never);
    const demande = { perimetre: perimetre(), permissions: new Set(["tasks:read"]) } as never;
    for (const terme of ["   ", "x".repeat(121)]) {
      expect(() => controller.rechercher({ terme }, demande)).toThrow(HttpException);
    }
    expect(rechercher).not.toHaveBeenCalled();
  });

  it("RG-GEN-04 — une recherche sans résultat rend deux groupes vides et un compteur nul", async () => {
    const service = new RechercheService(
      {
        project: { findMany: vi.fn().mockResolvedValue([]) },
        task: { findMany: vi.fn().mockResolvedValue([]) },
      } as never,
      { filtreProjet: vi.fn().mockReturnValue({}), filtreTache: vi.fn().mockReturnValue({}) } as never,
    );
    await expect(service.rechercher(
      "introuvable",
      perimetre(),
      new Set(["projects:read", "tasks:read"]),
    )).resolves.toMatchObject({ total: 0, projets: [], taches: [] });
  });

  it("D-RM-07 — les modèles utilisateur pertinents possèdent déjà les lectures, sans nouveau droit", () => {
    for (const code of ["BASIC_USER", "PROJECT_CONTRIBUTOR", "PROJECT_LEAD"]) {
      const modele = MODELES_ROLES.find((role) => role.code === code);
      expect(modele?.permissions).toEqual(expect.arrayContaining(["projects:read", "tasks:read"]));
    }
  });
});
