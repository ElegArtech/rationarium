import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { execFileSync } from "node:child_process";
import path from "node:path";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";

/**
 * `RG-SCOPE-04`, `RG-TSK-09` — ce qu'une tâche LISIBLE dit de ses voisines.
 *
 * La tâche de l'URL était contrôlée ; ses prérequis et ses dépendantes non.
 * L'alerte d'incohérence et l'aperçu de cascade nommaient donc des tâches
 * confidentielles à qui ne pouvait pas les ouvrir, et la cascade elle-même
 * décalait les tâches d'un projet dont l'acteur n'était pas membre.
 */

const RACINE_DB = path.resolve(import.meta.dirname, "../../../../packages/db");
const MOT_DE_PASSE = "Corr3ct-Horse-Battery!";
const jour = (s: string) => new Date(`${s}T00:00:00.000Z`);

let pg: StartedPostgreSqlContainer;
let app: NestFastifyApplication;
let prisma: import("@rationarium/db").PrismaClient;

type Compte = { id: string; jeton: string };

const appel = (methode: string, url: string, jeton: string, corps?: unknown) =>
  app.inject({
    method: methode as "GET",
    url,
    cookies: { rationarium_session: jeton },
    ...(corps !== undefined ? { payload: corps as object } : {}),
  });

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
      email: `${login}@exemple.test`,
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

const CONTRIBUTION = ["tasks:read", "tasks:update", "tasks:manage_dependencies"];

let membre: Compte;
let habilite: Compte;
let manager: Compte;
let pilote: string;
let dependante: string;

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

  membre = await compte("membre", CONTRIBUTION);
  habilite = await compte("habilite", [...CONTRIBUTION, "tasks:read_confidential"]);
  // Un manager d'encadrement : il lit toutes les tâches, il n'est pas du projet.
  manager = await compte("manager", [...CONTRIBUTION, "tasks:readAll"]);

  const projet = await prisma.project.create({
    data: {
      nom: "Projet commun",
      dateDebut: jour("2027-01-01"),
      dateFin: jour("2027-12-31"),
      membres: {
        create: [
          { userId: membre.id, roleProjet: "membre" },
          { userId: habilite.id, roleProjet: "membre" },
        ],
      },
    },
  });
  const prerequis = await prisma.task.create({
    data: {
      titre: "Prérequis confidentiel",
      projectId: projet.id,
      confidentielle: true,
      dateDebut: jour("2027-02-01"),
      dateFin: jour("2027-06-30"),
    },
  });
  pilote = (
    await prisma.task.create({
      data: {
        titre: "Tâche pilote",
        projectId: projet.id,
        dateDebut: jour("2027-03-01"),
        dateFin: jour("2027-03-10"),
        dependances: { create: [{ prerequisId: prerequis.id }] },
      },
    })
  ).id;
  dependante = (
    await prisma.task.create({
      data: {
        titre: "Dépendante confidentielle",
        projectId: projet.id,
        confidentielle: true,
        dateDebut: jour("2027-04-01"),
        dateFin: jour("2027-04-10"),
        dependances: { create: [{ prerequisId: pilote }] },
      },
    })
  ).id;
}, 300_000);

afterAll(async () => {
  await prisma?.$disconnect();
  await app?.close();
  await pg?.stop();
});

describe("RG-SCOPE-04 — une tâche lisible ne nomme pas ses voisines confidentielles", () => {
  it("RG-SCOPE-04 — GET /taches/:id/incoherences garde l'entrée, sans titre ni date, pour un prérequis illisible", async () => {
    const r = await appel("GET", `/api/taches/${pilote}/incoherences`, membre.jeton);
    expect(r.statusCode).toBe(200);
    const lignes = r.json<{ prerequis: { titre: string | null; dateFin: string | null; lisible: boolean }; jours: number | null }[]>();
    expect(lignes).toHaveLength(1);
    expect(lignes[0]).toMatchObject({ prerequis: { titre: null, dateFin: null, lisible: false }, jours: null });
    expect(r.body).not.toContain("Prérequis confidentiel");
  });

  it("RG-SCOPE-04 — la fiche de la tâche ne nomme pas le prérequis confidentiel dans ses incohérences", async () => {
    const r = await appel("GET", `/api/taches/${pilote}`, membre.jeton);
    expect(r.statusCode).toBe(200);
    expect(r.json<{ incoherences: { prerequis: { lisible: boolean } }[] }>().incoherences).toEqual([
      expect.objectContaining({ prerequis: expect.objectContaining({ lisible: false }) }),
    ]);
    expect(r.body).not.toContain("Prérequis confidentiel");
  });

  it("RG-SCOPE-04 — GET /taches/:id/cascade compte la dépendante confidentielle sans la nommer", async () => {
    const r = await appel("GET", `/api/taches/${pilote}/cascade?jours=3`, membre.jeton);
    expect(r.statusCode).toBe(200);
    expect(r.json()).toEqual([{ id: dependante, titre: null, lisible: false }]);
    expect(r.body).not.toContain("Dépendante confidentielle");
  });

  it("RG-SCOPE-04 — contre-témoin : avec tasks:read_confidential, les mêmes routes nomment les tâches", async () => {
    const inc = await appel("GET", `/api/taches/${pilote}/incoherences`, habilite.jeton);
    expect(inc.json<{ prerequis: { titre: string } }[]>()[0]!.prerequis.titre).toBe("Prérequis confidentiel");
    const cascade = await appel("GET", `/api/taches/${pilote}/cascade?jours=3`, habilite.jeton);
    expect(cascade.json<{ titre: string }[]>()[0]!.titre).toBe("Dépendante confidentielle");
  });
});

describe("RG-TSK-09 — décaler en cascade exige d'être membre du projet", () => {
  it("RG-TSK-09 — un lecteur de toutes les tâches, hors du projet, ne décale pas la chaîne : 403, rien ne bouge", async () => {
    /*
     * `RG-TSK-18` — lire toutes les tâches ne donne plus la main sur la tâche
     * pilote. Pour atteindre la règle de la CASCADE, le manager doit pouvoir
     * modifier le pilote : il y est assigné, sans être du projet. C'est la
     * chaîne de dépendantes que `RG-TSK-09` lui refuse alors.
     */
    await prisma.taskAssignee.create({ data: { taskId: pilote, userId: manager.id } });
    const r = await appel("POST", `/api/taches/${pilote}/cascade`, manager.jeton, { jours: 3 });
    expect(r.statusCode).toBe(403);
    expect(r.json()).toMatchObject({ cle: "erreurs:pasMembreDuProjet" });
    const apres = await prisma.task.findUniqueOrThrow({ where: { id: dependante } });
    expect(apres.dateDebut!.toISOString().slice(0, 10)).toBe("2027-04-01");
  });

  it("RG-TSK-09 — un membre du projet décale la chaîne, et la réponse ne nomme pas la dépendante confidentielle", async () => {
    const r = await appel("POST", `/api/taches/${pilote}/cascade`, membre.jeton, { jours: 3 });
    expect(r.statusCode).toBe(201);
    expect(r.json()).toMatchObject({ decalees: 2, touchees: [{ id: dependante, titre: null, lisible: false }] });
    const apres = await prisma.task.findUniqueOrThrow({ where: { id: dependante } });
    expect(apres.dateDebut!.toISOString().slice(0, 10)).toBe("2027-04-04");
  });
});
