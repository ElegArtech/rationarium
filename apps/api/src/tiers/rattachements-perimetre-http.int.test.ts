import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { execFileSync } from "node:child_process";
import path from "node:path";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";

/**
 * `RG-SCOPE-02`, `RG-SCOPE-04` — le répertoire est global, ses rattachements
 * non.
 *
 * Tiers et clients n'ont pas de périmètre propre : `third_parties:read` et
 * `clients:read` suffisent à les lister. Mais la fiche d'un tiers nomme ses
 * projets, ses tâches et le libellé de ses saisies ; le répertoire des clients
 * nomme leur portefeuille. Ces noms-là appartiennent aux projets, et c'est le
 * périmètre du lecteur sur les projets qui décide s'il les voit.
 */

const RACINE_DB = path.resolve(import.meta.dirname, "../../../../packages/db");
const MOT_DE_PASSE = "Corr3ct-Horse-Battery!";
const jour = (s: string) => new Date(`${s}T00:00:00.000Z`);

let pg: StartedPostgreSqlContainer;
let app: NestFastifyApplication;
let prisma: import("@rationarium/db").PrismaClient;

type Compte = { id: string; jeton: string };

const lire = (url: string, jeton: string) =>
  app.inject({ method: "GET", url, cookies: { rationarium_session: jeton } });

async function compte(login: string, permissions: string[]): Promise<Compte> {
  const { hacherMotDePasse } = await import("../auth/mots-de-passe.js");
  const role = await prisma.role.create({
    data: {
      code: login.toUpperCase(),
      nom: login,
      permissions: { create: permissions.map((permission) => ({ permission })) },
    },
  });
  const { id } = await prisma.user.create({
    data: {
      login,
      email: `${login}@exemple.fr`,
      motDePasseHash: await hacherMotDePasse(MOT_DE_PASSE),
      prenom: "Test",
      nom: login,
      motDePasseAChanger: false,
      roleId: role.id,
    },
  });
  const connexion = await app.inject({
    method: "POST",
    url: "/api/auth/login",
    payload: { identifiant: login, motDePasse: MOT_DE_PASSE },
  });
  if (connexion.statusCode !== 200) throw new Error(`connexion refusée : ${connexion.body}`);
  return { id, jeton: connexion.cookies.find((c) => c.name === "rationarium_session")!.value };
}

// Ce que la conduite de projet donne à un chef de projet sur ces référentiels.
const CHEF_DE_PROJET = ["projects:read", "tasks:read", "third_parties:read", "clients:read"];

let chef: Compte;
let portefeuille: Compte;
let tiersId: string;
let clientId: string;
let projetVisible: string;

type FicheTiers = {
  projets: { nom: string }[];
  taches: { titre: string }[];
  saisies: number;
  heuresDeclarees: number;
  saisiesRecentes: { description: string | null }[];
};

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

  chef = await compte("chef", CHEF_DE_PROJET);
  portefeuille = await compte("portefeuille", [
    ...CHEF_DE_PROJET,
    "projects:manage_any",
    "tasks:readAll",
    "tasks:read_confidential",
  ]);

  const dates = { dateDebut: jour("2027-01-01"), dateFin: jour("2027-12-31") };
  projetVisible = (
    await prisma.project.create({
      data: { nom: "Projet du chef", ...dates, chefId: chef.id },
    })
  ).id;
  const projetCache = (await prisma.project.create({ data: { nom: "Projet d'une autre direction", ...dates } })).id;

  tiersId = (
    await prisma.thirdParty.create({
      data: {
        type: "organisation",
        organisation: "Bureau d'études",
        projets: { create: [{ projectId: projetVisible }, { projectId: projetCache }] },
      },
    })
  ).id;
  const lien = { create: [{ thirdPartyId: tiersId }] };
  await prisma.task.create({ data: { titre: "Étude de sol", projectId: projetVisible, tiers: lien } });
  await prisma.task.create({
    data: { titre: "Audit confidentiel", projectId: projetVisible, confidentielle: true, tiers: lien },
  });
  await prisma.task.create({ data: { titre: "Tâche d'ailleurs", projectId: projetCache, tiers: lien } });
  await prisma.timeEntry.create({
    data: { thirdPartyId: tiersId, projectId: projetVisible, date: jour("2027-02-01"), heures: 3, description: "Relevés visibles" },
  });
  await prisma.timeEntry.create({
    data: { thirdPartyId: tiersId, projectId: projetCache, date: jour("2027-02-02"), heures: 5, description: "Mission d'ailleurs" },
  });

  clientId = (
    await prisma.client.create({
      data: {
        nom: "Syndicat des eaux",
        projets: { create: [{ projectId: projetVisible }, { projectId: projetCache }] },
      },
    })
  ).id;
}, 300_000);

afterAll(async () => {
  await prisma?.$disconnect();
  await app?.close();
  await pg?.stop();
});

describe("RG-SCOPE-02, RG-SCOPE-04 — la fiche d'un tiers ne nomme que ce que le lecteur peut ouvrir", () => {
  it("RG-SCOPE-02 — GET /tiers/:id omet le projet invisible et ses saisies, cumul compris", async () => {
    const r = await lire(`/api/tiers/${tiersId}`, chef.jeton);
    expect(r.statusCode).toBe(200);
    const fiche = r.json<FicheTiers>();
    expect(fiche.projets.map((p) => p.nom)).toEqual(["Projet du chef"]);
    expect(fiche.saisiesRecentes.map((s) => s.description)).toEqual(["Relevés visibles"]);
    expect(fiche.saisies).toBe(1);
    expect(fiche.heuresDeclarees).toBe(3);
    expect(r.body).not.toContain("Projet d'une autre direction");
    expect(r.body).not.toContain("Mission d'ailleurs");
  });

  it("RG-SCOPE-04 — GET /tiers/:id omet la tâche confidentielle et la tâche d'un projet invisible", async () => {
    const r = await lire(`/api/tiers/${tiersId}`, chef.jeton);
    expect(r.json<FicheTiers>().taches.map((t) => t.titre)).toEqual(["Étude de sol"]);
    expect(r.body).not.toContain("Audit confidentiel");
    expect(r.body).not.toContain("Tâche d'ailleurs");
  });

  it("RG-SCOPE-02 — contre-témoin : avec la gestion de tous les projets et la lecture confidentielle, la fiche est entière", async () => {
    const fiche = (await lire(`/api/tiers/${tiersId}`, portefeuille.jeton)).json<FicheTiers>();
    expect(fiche.projets).toHaveLength(2);
    expect(fiche.taches).toHaveLength(3);
    expect(fiche.heuresDeclarees).toBe(8);
  });
});

describe("RG-SCOPE-02 — le portefeuille d'un client ne nomme que les projets visibles", () => {
  it("RG-SCOPE-02 — GET /clients nomme le seul projet visible du client, et le compte en conséquence", async () => {
    const r = await lire("/api/clients", chef.jeton);
    expect(r.statusCode).toBe(200);
    const ligne = r.json<{ id: string; projets: { project: { nom: string } }[]; _count: { projets: number } }[]>()
      .find((c) => c.id === clientId)!;
    expect(ligne.projets.map((p) => p.project.nom)).toEqual(["Projet du chef"]);
    expect(ligne._count.projets).toBe(1);
    expect(r.body).not.toContain("Projet d'une autre direction");
  });

  it("RG-SCOPE-02 — GET /clients/:id nomme le seul projet visible", async () => {
    const r = await lire(`/api/clients/${clientId}`, chef.jeton);
    expect(r.statusCode).toBe(200);
    expect(r.json<{ projets: { id: string }[] }>().projets.map((p) => p.id)).toEqual([projetVisible]);
    expect(r.body).not.toContain("Projet d'une autre direction");
  });

  it("RG-SCOPE-02 — contre-témoin : avec projects:manage_any, le portefeuille est entier", async () => {
    const r = await lire(`/api/clients/${clientId}`, portefeuille.jeton);
    expect(r.json<{ projets: unknown[] }>().projets).toHaveLength(2);
  });
});
