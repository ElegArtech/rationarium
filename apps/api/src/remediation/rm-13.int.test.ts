import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { creerClient, type PrismaClient } from "@rationarium/db";
import { PerimetreService } from "../commun/perimetre.service.js";
import { RechercheService } from "../recherche/recherche.service.js";

const RACINE_DB = path.resolve(import.meta.dirname, "../../../../packages/db");
const uuid = () => crypto.randomUUID();
const date = (valeur: string) => new Date(`${valeur}T00:00:00.000Z`);

let pg: StartedPostgreSqlContainer;
let prisma: PrismaClient;
let recherche: RechercheService;
let perimetres: PerimetreService;
let acteurId: string;

beforeAll(async () => {
  pg = await new PostgreSqlContainer("postgres:18-alpine").start();
  execFileSync("pnpm", ["exec", "prisma", "migrate", "deploy"], {
    cwd: RACINE_DB,
    env: { ...process.env, DATABASE_URL: pg.getConnectionUri() },
    stdio: "pipe",
  });
  prisma = creerClient(pg.getConnectionUri());
  perimetres = new PerimetreService(prisma as never);
  recherche = new RechercheService(prisma as never, perimetres);

  const [acteur, horsPerimetre] = await Promise.all([
    prisma.user.create({
      data: {
        id: uuid(), login: `acteur-${uuid()}`, email: `${uuid()}@exemple.fr`,
        motDePasseHash: "test", prenom: "Ada", nom: "Visible",
      },
    }),
    prisma.user.create({
      data: {
        id: uuid(), login: `hors-${uuid()}`, email: `${uuid()}@exemple.fr`,
        motDePasseHash: "test", prenom: "Hedy", nom: "Hors périmètre",
      },
    }),
  ]);
  acteurId = acteur.id;

  const [visible, invisible] = await Promise.all([
    prisma.project.create({
      data: {
        nom: "Orion visible", dateDebut: date("2026-01-01"),
        dateFin: date("2026-12-31"), chefId: acteur.id,
      },
    }),
    prisma.project.create({
      data: {
        nom: "Orion hors périmètre", dateDebut: date("2026-01-01"),
        dateFin: date("2026-12-31"), chefId: horsPerimetre.id,
      },
    }),
  ]);

  await prisma.task.createMany({
    data: [
      { titre: "Orion tâche visible", projectId: visible.id },
      { titre: "Orion tâche confidentielle", projectId: visible.id, confidentielle: true },
      { titre: "Orion tâche hors périmètre", projectId: invisible.id },
    ],
  });
}, 240_000);

afterAll(async () => {
  await prisma?.$disconnect();
  await pg?.stop();
});

describe("RM-13 — recherche globale sur PostgreSQL réel", () => {
  it("D-RM-07, RG-SCOPE-02 et RG-SCOPE-04 — ne rend que les projets et tâches réellement visibles, puis ouvre le confidentiel avec le droit explicite", async () => {
    const droitsLecture = new Set(["projects:read", "tasks:read"]);
    const perimetre = await perimetres.resoudre(acteurId, droitsLecture);

    const sansConfidentiel = await recherche.rechercher("Orion", perimetre, droitsLecture);
    expect(sansConfidentiel.projets.map(({ nom }) => nom)).toEqual(["Orion visible"]);
    expect(sansConfidentiel.taches.map(({ titre }) => titre)).toEqual(["Orion tâche visible"]);
    expect(JSON.stringify(sansConfidentiel)).not.toContain("hors périmètre");
    expect(JSON.stringify(sansConfidentiel)).not.toContain("confidentielle");

    const droitsConfidentiels = new Set([
      "projects:read", "tasks:read", "tasks:read_confidential",
    ]);
    const perimetreConfidentiel = await perimetres.resoudre(acteurId, droitsConfidentiels);
    const avecConfidentiel = await recherche.rechercher(
      "Orion", perimetreConfidentiel, droitsConfidentiels,
    );
    expect(avecConfidentiel.taches.map(({ titre }) => titre)).toEqual([
      "Orion tâche confidentielle",
      "Orion tâche visible",
    ]);
    expect(JSON.stringify(avecConfidentiel)).not.toContain("hors périmètre");
  });
});
