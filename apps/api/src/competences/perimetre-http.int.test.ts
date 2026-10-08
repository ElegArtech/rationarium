import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { execFileSync } from "node:child_process";
import path from "node:path";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";

/**
 * `RG-CMP-07` — définir ou retirer le niveau d'un agent exige que l'agent soit
 * dans le périmètre de l'acteur.
 *
 * La matrice se LIT bornée au périmètre ; elle s'ÉCRIVAIT sans borne : avec
 * `skills:manage_matrix`, `PUT /competences/agents/:userId/:skillId` posait le
 * niveau de n'importe quel agent de l'instance, et `DELETE` le retirait.
 * La liste filtre, l'adresse directe non — le motif consigné.
 */

const RACINE_DB = path.resolve(import.meta.dirname, "../../../../packages/db");
const MOT_DE_PASSE = "Corr3ct-Horse-Battery!";

let pg: StartedPostgreSqlContainer;
let app: NestFastifyApplication;
let prisma: import("@rationarium/db").PrismaClient;

let jetonManager: string;
let agentDuDepartement: string;
let agentAilleurs: string;
let competence: string;

const appel = (methode: string, url: string, corps?: unknown) =>
  app.inject({
    method: methode as "GET",
    url,
    cookies: { rationarium_session: jetonManager },
    ...(corps !== undefined ? { payload: corps as object } : {}),
  });

async function agent(login: string, departementId: string) {
  const { id } = await prisma.user.create({
    data: {
      login,
      email: `${login}@exemple.test`,
      motDePasseHash: "x",
      prenom: "Test",
      nom: login,
      departementId,
    },
  });
  return id;
}

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

  const departementA = await prisma.departement.create({ data: { nom: "Département A" } });
  const departementB = await prisma.departement.create({ data: { nom: "Département B" } });

  const { hacherMotDePasse } = await import("../auth/mots-de-passe.js");
  const role = await prisma.role.create({
    data: {
      code: "TEST_MATRICE",
      nom: "TEST_MATRICE",
      permissions: { create: ["skills:read", "skills:manage_matrix"].map((permission) => ({ permission })) },
    },
  });
  await prisma.user.create({
    data: {
      login: "manager.a",
      email: "manager.a@exemple.test",
      motDePasseHash: await hacherMotDePasse(MOT_DE_PASSE),
      prenom: "Test",
      nom: "Manager",
      motDePasseAChanger: false,
      roleId: role.id,
      departementId: departementA.id,
    },
  });
  const connexion = await app.inject({
    method: "POST",
    url: "/api/auth/login",
    payload: { identifiant: "manager.a", motDePasse: MOT_DE_PASSE },
  });
  if (connexion.statusCode !== 200) throw new Error(`connexion refusée : ${connexion.body}`);
  jetonManager = connexion.cookies.find((c) => c.name === "rationarium_session")!.value;

  agentDuDepartement = await agent("agent.a", departementA.id);
  agentAilleurs = await agent("agent.b", departementB.id);
  competence = (await prisma.skill.create({ data: { nom: "Marchés publics", categorie: "technical" } })).id;
}, 300_000);

afterAll(async () => {
  await prisma?.$disconnect();
  await app?.close();
  await pg?.stop();
});

const niveauDe = async (userId: string) =>
  (await prisma.userSkill.findUnique({ where: { userId_skillId: { userId, skillId: competence } } }))?.niveau ?? null;

describe("RG-CMP-07 — le niveau d'un agent ne s'écrit que dans son périmètre", () => {
  it("RG-CMP-07 — définir le niveau d'un agent hors périmètre est refusé, et rien n'est écrit", async () => {
    const r = await appel("PUT", `/api/competences/agents/${agentAilleurs}/${competence}`, { niveau: "expert" });
    expect(r.statusCode).toBe(403);
    expect(r.json()).toMatchObject({ cle: "erreurs:horsPerimetre" });
    expect(await niveauDe(agentAilleurs)).toBeNull();
  });

  it("RG-CMP-07 — retirer la compétence d'un agent hors périmètre est refusé, et elle demeure", async () => {
    await prisma.userSkill.upsert({
      where: { userId_skillId: { userId: agentAilleurs, skillId: competence } },
      create: { userId: agentAilleurs, skillId: competence, niveau: "master" },
      update: { niveau: "master" },
    });
    try {
      const r = await appel("DELETE", `/api/competences/agents/${agentAilleurs}/${competence}`);
      expect(r.statusCode).toBe(403);
      expect(r.json()).toMatchObject({ cle: "erreurs:horsPerimetre" });
      expect(await niveauDe(agentAilleurs)).toBe("master");
    } finally {
      await prisma.userSkill.deleteMany({ where: { userId: agentAilleurs } });
    }
  });

  it("RG-CMP-07 — dans le périmètre, le niveau se définit puis se retire", async () => {
    const pose = await appel("PUT", `/api/competences/agents/${agentDuDepartement}/${competence}`, {
      niveau: "intermediate",
    });
    expect(pose.statusCode).toBe(200);
    expect(await niveauDe(agentDuDepartement)).toBe("intermediate");

    const retrait = await appel("DELETE", `/api/competences/agents/${agentDuDepartement}/${competence}`);
    expect(retrait.statusCode).toBe(200);
    expect(await niveauDe(agentDuDepartement)).toBeNull();
  });
});
