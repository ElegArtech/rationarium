import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { execFileSync } from "node:child_process";
import path from "node:path";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { creerClient, type PrismaClient } from "@rationarium/db";
import { hacherMotDePasse } from "../auth/mots-de-passe.js";

/**
 * `RG-TSK-18`, `RG-PRJ-13`, `RG-TMP-01` — une saisie de temps est une
 * ÉCRITURE sur la tâche ou le projet qu'elle désigne.
 *
 * Le défaut : `POST /temps` contrôlait `projectId` et `taskId` avec les
 * prédicats de LECTURE. Un porteur de `projects:readAll`, de `tasks:readAll`
 * ou d'une portée globale (`users:readAll`) saisissait donc du temps sur
 * n'importe quel projet et n'importe quelle tâche de l'instance — et
 * `RG-PRJ-08` calcule le budget consommé à partir de ces saisies.
 *
 * Second défaut, `DELETE /temps/:id` : une saisie ORPHELINE (tiers dont le
 * déclarant a été supprimé) n'avait plus de cible, et la garde la laissait
 * supprimer à tout porteur de `time_tracking:delete`.
 */

const RACINE_DB = path.resolve(import.meta.dirname, "../../../../packages/db");
const date = (jour: string) => new Date(`${jour}T00:00:00.000Z`);

let pg: StartedPostgreSqlContainer;
let app: NestFastifyApplication;
let prisma: PrismaClient;

type Acteur = { id: string; jeton: string };
const SAISIE = ["time_tracking:read", "time_tracking:create", "time_tracking:delete"];

/** Lit tout, n'est rattaché à rien. */
let lecteurGlobal: Acteur;
/** Assigné d'une tâche d'un projet dont il n'est pas membre. */
let assigne: Acteur;
let membre: Acteur;
let administrateur: Acteur;
let chef: string;
/** Déclare pour des tiers, voit tous les projets, membre de ceux créés ici. */
let membreTiers: Acteur;

async function compte(login: string, permissions: string[]): Promise<Acteur> {
  const role = await prisma.role.create({
    data: { code: `T_${login.toUpperCase()}`, nom: login, permissions: { create: permissions.map((permission) => ({ permission })) } },
  });
  const id = crypto.randomUUID();
  await prisma.user.create({
    data: {
      id, login, email: `${login}@exemple.fr`, prenom: login, nom: "SAISIE", roleId: role.id,
      motDePasseHash: await hacherMotDePasse("Bonjour12!"), motDePasseAChanger: false,
    },
  });
  const connexion = await app.inject({
    method: "POST", url: "/api/auth/login", payload: { identifiant: login, motDePasse: "Bonjour12!" },
  });
  if (connexion.statusCode !== 200) throw new Error(`connexion refusée : ${connexion.body}`);
  return { id, jeton: connexion.cookies.find((c) => c.name === "rationarium_session")!.value };
}

const appel = (acteur: Acteur, method: "POST" | "DELETE", url: string, payload?: object) =>
  app.inject({ method, url: `/api${url}`, cookies: { rationarium_session: acteur.jeton }, ...(payload ? { payload } : {}) });

async function projetEtTache() {
  const projet = await prisma.project.create({
    data: {
      nom: `P-${crypto.randomUUID().slice(0, 8)}`, chefId: chef,
      dateDebut: date("2026-01-01"), dateFin: date("2026-12-31"),
      membres: { create: [{ userId: membre.id, roleProjet: "Membre" }, { userId: membreTiers.id, roleProjet: "Membre" }] },
    },
  });
  const tache = await prisma.task.create({
    data: { titre: "Recette", projectId: projet.id, assignes: { create: [{ userId: assigne.id, porteur: true }] } },
  });
  return { projet, tache };
}

beforeAll(async () => {
  pg = await new PostgreSqlContainer("postgres:18-alpine").start();
  execFileSync("pnpm", ["exec", "prisma", "migrate", "deploy"], {
    cwd: RACINE_DB, env: { ...process.env, DATABASE_URL: pg.getConnectionUri() }, stdio: "pipe",
  });
  process.env.DATABASE_URL = pg.getConnectionUri();
  const { creerApplication } = await import("../main.js");
  app = await creerApplication();
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  prisma = creerClient(pg.getConnectionUri());

  lecteurGlobal = await compte("lecteur.global", [
    ...SAISIE, "projects:read", "projects:readAll", "tasks:read", "tasks:readAll", "users:readAll",
  ]);
  assigne = await compte("agent.assigne", SAISIE);
  membre = await compte("agent.membre", SAISIE);
  administrateur = await compte("admin.comptes", [...SAISIE, "users:manage_any"]);
  chef = (await compte("chef.projet", SAISIE)).id;
  const TIERS = [...SAISIE, "time_tracking:declare_for_third_party"];
  membreTiers = await compte("membre.tiers", [...TIERS, "projects:read", "projects:readAll"]);
}, 300_000);

afterAll(async () => {
  await prisma?.$disconnect();
  await app?.close();
  await pg?.stop();
});

describe("RG-PRJ-13, RG-TSK-18 — saisir du temps exige un droit d'ÉCRITURE sur la cible", () => {
  it("RG-PRJ-13 — projects:readAll ne suffit pas à saisir du temps sur un projet où l'on n'est rien", async () => {
    const { projet } = await projetEtTache();
    const r = await appel(lecteurGlobal, "POST", "/temps", { projectId: projet.id, date: "2026-09-10", heures: 3 });
    expect(r.statusCode).toBe(403);
    expect(r.json()).toMatchObject({ cle: "erreurs:horsPerimetre" });
    expect(await prisma.timeEntry.count({ where: { projectId: projet.id } })).toBe(0);
  });

  it("RG-TSK-18 — tasks:readAll et une portée globale ne suffisent pas à saisir sur la tâche d'autrui", async () => {
    const { projet, tache } = await projetEtTache();
    for (const corps of [{ taskId: tache.id }, { taskId: tache.id, projectId: projet.id }]) {
      const r = await appel(lecteurGlobal, "POST", "/temps", { ...corps, date: "2026-09-10", heures: 2 });
      expect(r.statusCode).toBe(403);
      expect(r.json()).toMatchObject({ cle: "erreurs:horsPerimetre" });
    }
    expect(await prisma.timeEntry.count({ where: { taskId: tache.id } })).toBe(0);
  });

  it("RG-PRJ-13 — le membre du projet y saisit son temps", async () => {
    const { projet } = await projetEtTache();
    const r = await appel(membre, "POST", "/temps", { projectId: projet.id, date: "2026-09-10", heures: 3 });
    expect(r.statusCode).toBe(201);
  });

  it("RG-TSK-18 — l'assigné saisit sur sa tâche, projet compris, sans être membre du projet", async () => {
    const { projet, tache } = await projetEtTache();
    const r = await appel(assigne, "POST", "/temps", {
      taskId: tache.id, projectId: projet.id, date: "2026-09-11", heures: 2,
    });
    expect(r.statusCode).toBe(201);
    // Mais pas sur le projet seul : c'est la tâche qui le lie, pas le projet.
    const seul = await appel(assigne, "POST", "/temps", { projectId: projet.id, date: "2026-09-11", heures: 1 });
    expect(seul.statusCode).toBe(403);
  });
});

describe("RG-TMP-03 — une saisie orpheline n'est pas à la merci de tout porteur de la permission", () => {
  it("RG-TMP-03 — sans déclarant ni agent, la suppression exige users:manage_any", async () => {
    const tiers = await prisma.thirdParty.create({ data: { type: "organisation", organisation: "Prestataire" } });
    const { projet } = await projetEtTache();
    // Le déclarant existe à la saisie, puis son compte est supprimé :
    // `creeParId` passe à NULL (`onDelete: SetNull`), la saisie demeure.
    const declarant = await prisma.user.create({
      data: { login: "declarant.parti", email: "declarant.parti@exemple.fr", prenom: "Parti", nom: "SAISIE", motDePasseHash: "x" },
    });
    const orpheline = await prisma.timeEntry.create({
      data: { thirdPartyId: tiers.id, creeParId: declarant.id, projectId: projet.id, date: date("2026-09-10"), heures: 4 },
    });
    await prisma.user.delete({ where: { id: declarant.id } });
    expect(await prisma.timeEntry.findUniqueOrThrow({ where: { id: orpheline.id } })).toMatchObject({
      creeParId: null, userId: null,
    });

    const refus = await appel(membre, "DELETE", `/temps/${orpheline.id}`);
    expect(refus.statusCode).toBe(403);
    expect(await prisma.timeEntry.count({ where: { id: orpheline.id } })).toBe(1);

    expect((await appel(administrateur, "DELETE", `/temps/${orpheline.id}`)).statusCode).toBe(200);
    expect(await prisma.timeEntry.count({ where: { id: orpheline.id } })).toBe(0);
  });
});

describe("RG-PRJ-13 — déclarer pour un tiers exige qu'il intervienne sur le projet de la saisie", () => {
  it("RG-PRJ-13 — un tiers d'un autre projet, seulement VU, ne se déclare pas sur son propre projet", async () => {
    const { projet: mien } = await projetEtTache();
    const { projet: autre } = await projetEtTache();
    await prisma.projectMember.deleteMany({ where: { projectId: autre.id, userId: membreTiers.id } });
    const tiers = await prisma.thirdParty.create({ data: { type: "organisation", organisation: "Prestataire" } });
    await prisma.projectThirdParty.create({ data: { projectId: autre.id, thirdPartyId: tiers.id } });
    const r = await appel(membreTiers, "POST", "/temps", { thirdPartyId: tiers.id, projectId: mien.id, date: "2026-09-12", heures: 3 });
    expect(r.statusCode).toBe(403);
    expect(r.json()).toMatchObject({ cle: "erreurs:horsPerimetre" });
    expect(await prisma.timeEntry.count({ where: { thirdPartyId: tiers.id } })).toBe(0);
  });

  it("RG-PRJ-13 — le membre du projet déclare pour le tiers qui y intervient", async () => {
    const { projet } = await projetEtTache();
    const tiers = await prisma.thirdParty.create({ data: { type: "organisation", organisation: "Prestataire" } });
    await prisma.projectThirdParty.create({ data: { projectId: projet.id, thirdPartyId: tiers.id } });
    const r = await appel(membreTiers, "POST", "/temps", { thirdPartyId: tiers.id, projectId: projet.id, date: "2026-09-12", heures: 3 });
    expect(r.statusCode, r.body).toBe(201);
  });
});
