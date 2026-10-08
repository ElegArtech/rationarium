import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { execFileSync } from "node:child_process";
import path from "node:path";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { creerClient, type PrismaClient } from "@rationarium/db";
import { hacherMotDePasse } from "../auth/mots-de-passe.js";

/**
 * `tasks:assign_any_user`, `RG-SCOPE-01`, `RG-TSK-15`, `RG-TSK-18` — qui
 * peut-on charger d'une tâche.
 *
 * Le défaut : la permission existait au catalogue, trois modèles de rôle la
 * portaient, et aucune ligne de l'API ne la lisait. La création, la pose des
 * assignés, le RACI et le déplacement depuis le planning acceptaient
 * n'importe quel compte de l'instance, et `serviceIds` n'importe quel
 * service : un agent chargeait de travail — et notifiait — une personne d'une
 * autre direction sans aucun lien avec elle.
 *
 * La règle : sans `tasks:assign_any_user`, une personne NOUVELLEMENT désignée
 * est soi-même, ou dans le périmètre organisationnel de l'acteur, ou
 * rattachée au projet de la tâche. La suite passe par HTTP : garde et service
 * ensemble, et chaque refus vérifie que la base n'a pas bougé.
 */

const RACINE_DB = path.resolve(import.meta.dirname, "../../../../packages/db");
const MOT_DE_PASSE = "Bonjour12!";

let pg: StartedPostgreSqlContainer;
let app: NestFastifyApplication;
let prisma: PrismaClient;

type Acteur = { id: string; jeton: string };

const DROITS_TACHES = [
  "tasks:read", "tasks:create", "tasks:create_standalone", "tasks:update", "tasks:manage_raci",
];

/** Département A, sans `tasks:assign_any_user`. */
let agent: Acteur;
/** Département A, avec une portée globale de LECTURE (`users:readAll`), sans `tasks:assign_any_user`. */
let lecteurGlobal: Acteur;
/** Département A, avec `tasks:assign_any_user`. */
let libre: Acteur;
let collegue: string;
let etranger: string;
let membreDuProjet: string;
let projet: string;
let serviceA: string;
let serviceB: string;

async function personne(login: string, departementId: string): Promise<string> {
  const id = crypto.randomUUID();
  await prisma.user.create({
    data: {
      id, login, email: `${login}@exemple.fr`, prenom: login, nom: "ASSIGN", departementId,
      motDePasseHash: await hacherMotDePasse(MOT_DE_PASSE), motDePasseAChanger: false,
    },
  });
  return id;
}

async function compte(login: string, departementId: string, permissions: string[]): Promise<Acteur> {
  const id = await personne(login, departementId);
  const role = await prisma.role.create({
    data: { code: `T_${login.toUpperCase()}`, nom: login, permissions: { create: permissions.map((permission) => ({ permission })) } },
  });
  await prisma.user.update({ where: { id }, data: { roleId: role.id } });
  const connexion = await app.inject({
    method: "POST", url: "/api/auth/login", payload: { identifiant: login, motDePasse: MOT_DE_PASSE },
  });
  if (connexion.statusCode !== 200) throw new Error(`connexion refusée : ${connexion.body}`);
  return { id, jeton: connexion.cookies.find((c) => c.name === "rationarium_session")!.value };
}

const appel = (acteur: Acteur, method: "GET" | "POST" | "PUT", url: string, payload?: object) =>
  app.inject({ method, url: `/api${url}`, cookies: { rationarium_session: acteur.jeton }, ...(payload ? { payload } : {}) });

const refuse = (r: { statusCode: number; json: () => unknown }) => {
  expect(r.statusCode).toBe(403);
  expect(r.json()).toMatchObject({ cle: "erreurs:horsPerimetre" });
};

const assignesDe = async (taskId: string) =>
  (await prisma.taskAssignee.findMany({ where: { taskId } })).map((a) => a.userId).sort();

/** Une tâche hors projet, déjà assignée à l'agent : il peut la modifier. */
async function tacheDeLAgent(autres: string[] = []) {
  const t = await prisma.task.create({
    data: {
      titre: `T-${crypto.randomUUID().slice(0, 6)}`,
      assignes: { create: [agent.id, ...autres].map((userId, i) => ({ userId, porteur: i === 0 })) },
    },
  });
  return t;
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

  const direction = await prisma.direction.create({ data: { nom: "Direction assignation" } });
  const a = await prisma.departement.create({ data: { nom: "Département A", directionId: direction.id } });
  const b = await prisma.departement.create({ data: { nom: "Département B", directionId: direction.id } });
  serviceA = (await prisma.service.create({ data: { nom: "Service A", departementId: a.id } })).id;
  serviceB = (await prisma.service.create({ data: { nom: "Service B", departementId: b.id } })).id;

  agent = await compte("agent.a", a.id, DROITS_TACHES);
  lecteurGlobal = await compte("global.a", a.id, [...DROITS_TACHES, "users:read", "users:readAll"]);
  libre = await compte("libre.a", a.id, [...DROITS_TACHES, "tasks:assign_any_user"]);
  collegue = await personne("collegue.a", a.id);
  etranger = await personne("etranger.b", b.id);
  membreDuProjet = await personne("membre.b", b.id);
  await prisma.userService.create({ data: { userId: collegue, serviceId: serviceA } });
  await prisma.userService.create({ data: { userId: etranger, serviceId: serviceB } });

  projet = (await prisma.project.create({
    data: {
      nom: "Transverse", dateDebut: new Date("2026-01-01T00:00:00Z"), dateFin: new Date("2026-12-31T00:00:00Z"),
      membres: { create: [{ userId: agent.id, roleProjet: "Membre" }, { userId: membreDuProjet, roleProjet: "Membre" }] },
    },
  })).id;
}, 300_000);

afterAll(async () => {
  await prisma?.$disconnect();
  await app?.close();
  await pg?.stop();
});

describe("tasks:assign_any_user — à la création", () => {
  it("RG-SCOPE-01 — sans la permission, assigner une personne d'un autre département est refusé", async () => {
    const titre = `Refusée-${crypto.randomUUID().slice(0, 6)}`;
    refuse(await appel(agent, "POST", "/taches", { titre, assigneIds: [etranger] }));
    expect(await prisma.task.count({ where: { titre } })).toBe(0);
  });

  it("RG-SCOPE-01 — sans la permission, inviter un service d'un autre département est refusé", async () => {
    const titre = `Service-${crypto.randomUUID().slice(0, 6)}`;
    refuse(await appel(agent, "POST", "/taches", { titre, serviceIds: [serviceB] }));
    expect(await prisma.task.count({ where: { titre } })).toBe(0);
    // Le service de son propre département, lui, se déplie.
    const r = await appel(agent, "POST", "/taches", { titre, serviceIds: [serviceA] });
    expect(r.statusCode).toBe(201);
    expect(await assignesDe((r.json() as { id: string }).id)).toEqual([collegue]);
  });

  it("RG-SCOPE-03 — une portée globale de LECTURE n'ouvre pas l'assignation", async () => {
    const titre = `Globale-${crypto.randomUUID().slice(0, 6)}`;
    refuse(await appel(lecteurGlobal, "POST", "/taches", { titre, assigneIds: [etranger] }));
    expect(await prisma.task.count({ where: { titre } })).toBe(0);
  });

  it("RG-SCOPE-01 — soi-même et un collègue du périmètre restent assignables", async () => {
    const r = await appel(agent, "POST", "/taches", { titre: "Pour l'équipe", assigneIds: [agent.id, collegue] });
    expect(r.statusCode).toBe(201);
    expect(await assignesDe((r.json() as { id: string }).id)).toEqual([agent.id, collegue].sort());
  });

  it("RG-TSK-15 — un membre du projet, même d'un autre département, est assignable à une tâche du projet", async () => {
    const r = await appel(agent, "POST", "/taches", { titre: "Lot transverse", projectId: projet, assigneIds: [membreDuProjet] });
    expect(r.statusCode).toBe(201);
    // Mais un tiers au projet, d'un autre département, ne l'est pas.
    refuse(await appel(agent, "POST", "/taches", { titre: "Lot intrus", projectId: projet, assigneIds: [etranger] }));
  });

  it("tasks:assign_any_user — avec la permission, n'importe quel compte est assignable", async () => {
    const r = await appel(libre, "POST", "/taches", { titre: "Libre", assigneIds: [etranger], serviceIds: [serviceB] });
    expect(r.statusCode).toBe(201);
    expect(await assignesDe((r.json() as { id: string }).id)).toEqual([etranger]);
  });
});

describe("RG-GEN-06 — l'annuaire dit qui est assignable sans la permission", () => {
  it("RG-SCOPE-01 — une lecture globale voit tout l'annuaire, et chaque ligne dit si elle est du périmètre", async () => {
    /*
     * Le raccord entre la lecture et l'écriture : l'écran filtre ses candidats
     * sur ce drapeau. S'il mentait, la fenêtre proposerait des personnes que
     * la création refuse — ou cacherait des collègues qu'elle accepte.
     */
    const r = await appel(lecteurGlobal, "GET", "/utilisateurs?actif=true");
    expect(r.statusCode).toBe(200);
    const lignes = new Map(
      (r.json() as { id: string; dansMonPerimetre: boolean }[]).map((l) => [l.id, l.dansMonPerimetre]),
    );
    expect(lignes.get(etranger)).toBe(false);
    expect(lignes.get(collegue)).toBe(true);
    expect(lignes.get(lecteurGlobal.id)).toBe(true);

    // Et ce que la ligne promet, la création le tient.
    refuse(await appel(lecteurGlobal, "POST", "/taches", { titre: "Promesse", assigneIds: [etranger] }));
    expect((await appel(lecteurGlobal, "POST", "/taches", { titre: "Promesse", assigneIds: [collegue] })).statusCode).toBe(201);
  });
});

describe("tasks:assign_any_user — après coup : assignés, RACI, planning", () => {
  it("EX-TSK-06 — ajouter une personne hors périmètre à la liste des assignés est refusé, rien n'est écrit", async () => {
    const t = await tacheDeLAgent();
    refuse(await appel(agent, "PUT", `/taches/${t.id}/assignes`, { version: t.version, userIds: [agent.id, etranger] }));
    expect(await assignesDe(t.id)).toEqual([agent.id]);
    expect((await prisma.task.findUniqueOrThrow({ where: { id: t.id } })).version).toBe(t.version);
  });

  it("EX-TSK-06 — seules les ARRIVÉES sont contrôlées : une liste qui contient déjà quelqu'un d'ailleurs se recompose", async () => {
    const t = await tacheDeLAgent([etranger]);
    const r = await appel(agent, "PUT", `/taches/${t.id}/assignes`, {
      version: t.version, userIds: [etranger, agent.id, collegue],
    });
    expect(r.statusCode).toBe(200);
    expect(await assignesDe(t.id)).toEqual([agent.id, collegue, etranger].sort());
  });

  it("RG-TSK-10 — attribuer un rôle RACI à une personne hors périmètre est refusé", async () => {
    const t = await tacheDeLAgent();
    refuse(await appel(agent, "POST", `/taches/${t.id}/raci`, { userId: etranger, role: "informed" }));
    expect(await prisma.taskRaci.count({ where: { taskId: t.id } })).toBe(0);
    const r = await appel(agent, "POST", `/taches/${t.id}/raci`, { userId: collegue, role: "informed" });
    expect(r.statusCode).toBe(201);
  });

  it("EX-PLN-10 — glisser une tâche sur la ligne d'une personne hors périmètre est refusé, même en lecture globale", async () => {
    const t = await prisma.task.create({
      data: { titre: "À glisser", assignes: { create: [{ userId: lecteurGlobal.id, porteur: true }] } },
    });
    refuse(await appel(lecteurGlobal, "POST", `/taches/${t.id}/deplacer`, {
      version: t.version, nouvelAssigneId: etranger, ancienAssigneId: lecteurGlobal.id,
    }));
    expect(await assignesDe(t.id)).toEqual([lecteurGlobal.id]);
  });
});
