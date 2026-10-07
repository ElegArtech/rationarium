import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { execFileSync } from "node:child_process";
import path from "node:path";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import type { PrismaClient } from "@rationarium/db";

/**
 * `RG-ORG-06` — **une direction ne s'écrit que tout entière dans son
 * périmètre.**
 *
 * Le défaut (AUD-01) : hors périmètre global, une direction était « dans le
 * périmètre » dès qu'UN de ses départements l'était. Or `RG-SCOPE-01` étend le
 * périmètre du responsable d'une direction à TOUTE la direction : un porteur de
 * `directions:update` rattaché au seul département A se désignait responsable
 * de la direction, et voyait aussitôt le département B et ses agents.
 *
 * Exercé par HTTP, avec la vraie connexion.
 */

const RACINE_DB = path.resolve(import.meta.dirname, "../../../../packages/db");
const MDP = "Motdepasse1!";
const DROITS = ["directions:read", "directions:update", "departments:read", "users:read"];

let pg: StartedPostgreSqlContainer;
let app: NestFastifyApplication;
let prisma: PrismaClient;
let partagee: { id: string; version: number };
let propre: { id: string; version: number };
let deptB: string;
const comptes = new Map<string, { id: string; jeton: string }>();

const appel = (methode: string, url: string, qui: string, corps?: unknown) =>
  app.inject({
    method: methode as "GET",
    url,
    cookies: { rationarium_session: comptes.get(qui)!.jeton },
    ...(corps === undefined ? {} : { payload: corps as object }),
  });

beforeAll(async () => {
  pg = await new PostgreSqlContainer("postgres:18-alpine").start();
  execFileSync("pnpm", ["exec", "prisma", "migrate", "deploy"], {
    cwd: RACINE_DB,
    env: { ...process.env, DATABASE_URL: pg.getConnectionUri() },
    stdio: "pipe",
  });
  process.env.DATABASE_URL = pg.getConnectionUri();

  const { creerApplication } = await import("../main.js");
  const { creerClient } = await import("@rationarium/db");
  const { hacherMotDePasse } = await import("../auth/mots-de-passe.js");
  app = await creerApplication();
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  prisma = creerClient(pg.getConnectionUri());

  // Direction partagée : A (celui de l'acteur) et B (hors de son périmètre).
  partagee = await prisma.direction.create({ data: { nom: "Direction partagée" } });
  const deptA = await prisma.departement.create({ data: { nom: "Département A", directionId: partagee.id } });
  deptB = (await prisma.departement.create({ data: { nom: "Département B", directionId: partagee.id } })).id;
  // Direction propre : son seul département est celui du second acteur.
  propre = await prisma.direction.create({ data: { nom: "Direction propre" } });
  const deptC = await prisma.departement.create({ data: { nom: "Département C", directionId: propre.id } });
  await prisma.user.create({
    data: {
      login: "dir.agent.b", email: "dir.agent.b@exemple.test", motDePasseHash: "x",
      prenom: "Agent", nom: "B", departementId: deptB,
    },
  });

  const role = await prisma.role.create({
    data: { code: "DIR_GESTIONNAIRE", nom: "Gestionnaire", permissions: { create: DROITS.map((permission) => ({ permission })) } },
  });
  const hash = await hacherMotDePasse(MDP);
  for (const [cle, departementId] of [["A", deptA.id], ["C", deptC.id]] as const) {
    const login = `dir.gestionnaire.${cle.toLowerCase()}`;
    const u = await prisma.user.create({
      data: {
        login, email: `${login}@exemple.test`, motDePasseHash: hash, motDePasseAChanger: false,
        prenom: "Gestionnaire", nom: cle, departementId, roleId: role.id,
      },
    });
    const r = await app.inject({
      method: "POST", url: "/api/auth/login", payload: { identifiant: login, motDePasse: MDP },
    });
    expect(r.statusCode).toBe(200);
    comptes.set(cle, { id: u.id, jeton: r.cookies.find((c) => c.name === "rationarium_session")!.value });
  }
}, 300_000);

afterAll(async () => {
  await prisma?.$disconnect();
  await app?.close();
  await pg?.stop();
});

describe("RG-ORG-06 — une direction ne s'écrit que tout entière dans le périmètre", () => {
  it("RG-ORG-06 — rattaché au seul département A, il ne se désigne pas responsable de la direction", async () => {
    const reponse = await appel("PATCH", `/api/organisation/directions/${partagee.id}`, "A", {
      version: partagee.version, responsableId: comptes.get("A")!.id,
    });
    expect(reponse.statusCode).toBe(403);
    expect(reponse.json()).toMatchObject({ cle: "erreurs:horsPerimetre" });
    expect((await prisma.direction.findUniqueOrThrow({ where: { id: partagee.id } })).responsableId).toBeNull();

    // Et son périmètre n'a pas gagné le département B.
    const annuaire = await appel("GET", "/api/utilisateurs", "A");
    expect(annuaire.statusCode).toBe(200);
    expect(annuaire.json().map((u: { login: string }) => u.login)).not.toContain("dir.agent.b");
  });

  it("RG-ORG-06 — ni ne la renomme", async () => {
    const reponse = await appel("PATCH", `/api/organisation/directions/${partagee.id}`, "A", {
      version: partagee.version, nom: "Direction annexée",
    });
    expect(reponse.statusCode).toBe(403);
    expect((await prisma.direction.findUniqueOrThrow({ where: { id: partagee.id } })).nom).toBe("Direction partagée");
  });

  it("RG-ORG-06 — une direction dont tous les départements sont dans son périmètre se modifie", async () => {
    const reponse = await appel("PATCH", `/api/organisation/directions/${propre.id}`, "C", {
      version: propre.version, responsableId: comptes.get("C")!.id,
    });
    expect(reponse.statusCode).toBe(200);
    expect((await prisma.direction.findUniqueOrThrow({ where: { id: propre.id } })).responsableId)
      .toBe(comptes.get("C")!.id);
  });
});
