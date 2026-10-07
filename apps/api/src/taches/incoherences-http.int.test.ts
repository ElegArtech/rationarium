import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { execFileSync } from "node:child_process";
import path from "node:path";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";

/**
 * `RG-SCOPE-04` — `GET /taches/:id/incoherences` NOMME les tâches prérequises,
 * leur titre et leur échéance. Le contrôle de lisibilité est posé à l'entrée
 * HTTP, pas dans le service (appelé de l'intérieur par `fiche`, déjà bornée) :
 * seule la chaîne HTTP peut donc prouver qu'il y est.
 */

const RACINE_DB = path.resolve(import.meta.dirname, "../../../../packages/db");
const MOT_DE_PASSE = "Corr3ct-Horse-Battery!";

let pg: StartedPostgreSqlContainer;
let app: NestFastifyApplication;
let prisma: import("@rationarium/db").PrismaClient;
let jeton: string;
let lecteurId: string;
let tacheAutrui: string;
let tacheAssignee: string;

beforeAll(async () => {
  pg = await new PostgreSqlContainer("postgres:18-alpine").start();
  execFileSync("pnpm", ["exec", "prisma", "migrate", "deploy"], {
    cwd: RACINE_DB,
    env: { ...process.env, DATABASE_URL: pg.getConnectionUri() },
    stdio: "pipe",
  });
  process.env.DATABASE_URL = pg.getConnectionUri();

  const { creerApplication } = await import("../main.js");
  app = await creerApplication();
  await app.init();
  await app.getHttpAdapter().getInstance().ready();

  const { creerClient } = await import("@rationarium/db");
  prisma = creerClient(pg.getConnectionUri());

  const { hacherMotDePasse } = await import("../auth/mots-de-passe.js");
  const role = await prisma.role.create({
    data: { code: "TEST_LECTEUR", nom: "TEST_LECTEUR", permissions: { create: [{ permission: "tasks:read" }] } },
  });
  lecteurId = (
    await prisma.user.create({
      data: {
        login: "lecteur",
        email: "lecteur@exemple.fr",
        motDePasseHash: await hacherMotDePasse(MOT_DE_PASSE),
        prenom: "Test",
        nom: "Lecteur",
        motDePasseAChanger: false,
        roleId: role.id,
      },
    })
  ).id;
  const connexion = await app.inject({
    method: "POST",
    url: "/api/auth/login",
    payload: { identifiant: "lecteur", motDePasse: MOT_DE_PASSE },
  });
  if (connexion.statusCode !== 200) throw new Error(`connexion refusée : ${connexion.body}`);
  jeton = connexion.cookies.find((c) => c.name === "rationarium_session")!.value;

  const projet = await prisma.project.create({
    data: {
      nom: "Projet d'ailleurs",
      dateDebut: new Date("2027-01-01T00:00:00.000Z"),
      dateFin: new Date("2027-12-31T00:00:00.000Z"),
    },
  });
  const prerequis = await prisma.task.create({
    data: { titre: "Prérequis secret", projectId: projet.id, dateFin: new Date("2027-06-30T00:00:00.000Z") },
  });
  tacheAutrui = (
    await prisma.task.create({
      data: {
        titre: "Tâche d'autrui",
        projectId: projet.id,
        dateDebut: new Date("2027-03-01T00:00:00.000Z"),
        dependances: { create: [{ prerequisId: prerequis.id }] },
      },
    })
  ).id;
  tacheAssignee = (
    await prisma.task.create({ data: { titre: "Ma tâche", assignes: { create: [{ userId: lecteurId }] } } })
  ).id;
}, 300_000);

afterAll(async () => {
  await prisma?.$disconnect();
  await app?.close();
  await pg?.stop();
});

describe("RG-SCOPE-04 — les incohérences d'une tâche ne se lisent que si la tâche se lit", () => {
  it("RG-SCOPE-04 — GET /taches/:id/incoherences d'une tâche illisible rend 403, sans nommer le prérequis", async () => {
    const r = await app.inject({
      method: "GET",
      url: `/api/taches/${tacheAutrui}/incoherences`,
      cookies: { rationarium_session: jeton },
    });
    expect(r.statusCode).toBe(403);
    expect(r.json()).toMatchObject({ cle: "erreurs:horsPerimetre" });
    expect(r.body).not.toContain("Prérequis secret");
  });

  it("RG-SCOPE-04 — contre-témoin : sur une tâche dont on est assigné, la route répond", async () => {
    const r = await app.inject({
      method: "GET",
      url: `/api/taches/${tacheAssignee}/incoherences`,
      cookies: { rationarium_session: jeton },
    });
    expect(r.statusCode).toBe(200);
  });
});
