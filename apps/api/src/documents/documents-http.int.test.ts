import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { execFileSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";

/**
 * `RG-DOC-03`, `RG-DOC-04` — commentaires et pièces jointes, sur la chaîne
 * HTTP complète.
 *
 * `consulter` et `telecharger` héritaient déjà du droit de lire le porteur ;
 * `fil`, `commenter` et `joindre` non. Le fil d'une tâche confidentielle se
 * lisait donc avec `comments:read` seul, et l'on commentait ou déposait une
 * pièce sur n'importe quel projet de l'instance en connaissant son
 * identifiant — `RG-SCOPE-04` contourné par la porte d'à côté.
 */

const RACINE_DB = path.resolve(import.meta.dirname, "../../../../packages/db");
const MOT_DE_PASSE = "Corr3ct-Horse-Battery!";
const MIO = 1024 * 1024;

let pg: StartedPostgreSqlContainer;
let app: NestFastifyApplication;
let prisma: import("@rationarium/db").PrismaClient;
let stockage: string;

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
      code: login.toUpperCase().replaceAll(".", "_"),
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

const CONTRIBUTEUR = ["comments:read", "comments:create", "documents:create", "documents:read"];

let contributeur: Compte;
let projetVisible: string;
let projetInvisible: string;
let tacheConfidentielle: string;
let tacheVisible: string;

beforeAll(async () => {
  stockage = await mkdtemp(path.join(os.tmpdir(), "rationarium-documents-"));
  process.env["RATIONARIUM_DOCUMENTS"] = stockage;

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
  /*
   * D08 — la limite de corps est posée dans `main.ts` par SEC-02. Tant
   * qu'elle n'y est pas, Fastify garde son défaut de 1 Mio et refuse une
   * pièce de 5 Mio avant tout contrôleur : on la pose ICI, pour ce test
   * seulement. Dès que `main.ts` porte la limite, ce bloc ne fait rien et le
   * test exerce l'assemblage réel.
   */
  const fastify = app.getHttpAdapter().getInstance();
  if ((fastify.initialConfig.bodyLimit ?? 0) < 32 * MIO) {
    fastify.removeContentTypeParser("application/json");
    fastify.addContentTypeParser(
      "application/json",
      { parseAs: "string", bodyLimit: 32 * MIO },
      fastify.getDefaultJsonParser("error", "error"),
    );
  }
  await fastify.ready();

  const { creerClient } = await import("@rationarium/db");
  prisma = creerClient(pg.getConnectionUri());

  contributeur = await compte("contributeur", CONTRIBUTEUR);

  const dates = { dateDebut: new Date("2027-01-01T00:00:00.000Z"), dateFin: new Date("2027-12-31T00:00:00.000Z") };
  projetVisible = (
    await prisma.project.create({
      data: { nom: "Projet visible", ...dates, membres: { create: [{ userId: contributeur.id, roleProjet: "membre" }] } },
    })
  ).id;
  projetInvisible = (await prisma.project.create({ data: { nom: "Projet d'ailleurs", ...dates } })).id;

  // L'assigné d'une tâche confidentielle ne la lit pas sans `tasks:read_confidential`.
  tacheConfidentielle = (
    await prisma.task.create({
      data: {
        titre: "Dossier disciplinaire",
        confidentielle: true,
        assignes: { create: [{ userId: contributeur.id }] },
      },
    })
  ).id;
  tacheVisible = (
    await prisma.task.create({
      data: { titre: "Tâche ordinaire", assignes: { create: [{ userId: contributeur.id }] } },
    })
  ).id;
  await prisma.comment.create({
    data: { contenu: "Motif confidentiel", auteurId: contributeur.id, taskId: tacheConfidentielle },
  });
  await prisma.comment.create({
    data: { contenu: "Échange de projet", auteurId: contributeur.id, projectId: projetInvisible },
  });
}, 300_000);

afterAll(async () => {
  await prisma?.$disconnect();
  await app?.close();
  await pg?.stop();
  if (stockage) await rm(stockage, { recursive: true, force: true });
});

const piece = (octets: number, cible: Record<string, string>) => ({
  nom: "piece.bin",
  typeMime: "application/octet-stream",
  contenuBase64: Buffer.alloc(octets, 7).toString("base64"),
  ...cible,
});

describe("RG-DOC-03 — fil, commentaire et pièce jointe héritent du droit de lire le porteur", () => {
  it("RG-DOC-03 — le fil d'une tâche confidentielle est refusé à son assigné sans permission", async () => {
    const r = await appel("GET", `/api/documents/commentaires/fil?taskId=${tacheConfidentielle}`, contributeur.jeton);
    expect(r.statusCode).toBe(403);
    expect(r.json()).toMatchObject({ cle: "erreurs:horsPerimetre" });
    expect(r.body).not.toContain("Motif confidentiel");
  });

  it("RG-DOC-03 — le fil d'un projet non visible est refusé", async () => {
    const r = await appel("GET", `/api/documents/commentaires/fil?projectId=${projetInvisible}`, contributeur.jeton);
    expect(r.statusCode).toBe(403);
    expect(r.body).not.toContain("Échange de projet");
  });

  it("RG-DOC-03 — le fil exige une cible : sans projectId ni taskId, 400", async () => {
    const r = await appel("GET", "/api/documents/commentaires/fil", contributeur.jeton);
    expect(r.statusCode).toBe(400);
  });

  it("RG-DOC-03 — contre-témoin : le fil d'une tâche lisible se lit", async () => {
    const r = await appel("GET", `/api/documents/commentaires/fil?taskId=${tacheVisible}`, contributeur.jeton);
    expect(r.statusCode).toBe(200);
  });

  it("RG-DOC-03 — commenter un projet non visible est refusé, et rien n'est écrit", async () => {
    const r = await appel("POST", "/api/documents/commentaires", contributeur.jeton, {
      contenu: "Intrusion",
      projectId: projetInvisible,
    });
    expect(r.statusCode).toBe(403);
    expect(r.json()).toMatchObject({ cle: "erreurs:horsPerimetre" });
    expect(await prisma.comment.count({ where: { contenu: "Intrusion" } })).toBe(0);
  });

  it("RG-DOC-03 — commenter une tâche lisible en la rattachant à un projet non visible est refusé", async () => {
    const r = await appel("POST", "/api/documents/commentaires", contributeur.jeton, {
      contenu: "Rattachement forgé",
      taskId: tacheVisible,
      projectId: projetInvisible,
    });
    expect(r.statusCode).toBe(403);
  });

  it("RG-DOC-03 — contre-témoin : commenter un projet dont on est membre réussit", async () => {
    const r = await appel("POST", "/api/documents/commentaires", contributeur.jeton, {
      contenu: "Point d'avancement",
      projectId: projetVisible,
    });
    expect(r.statusCode).toBe(201);
  });

  it("RG-DOC-03 — joindre une pièce à une tâche confidentielle non lisible est refusé, et rien n'est écrit", async () => {
    const r = await appel("POST", "/api/documents", contributeur.jeton, piece(16, { taskId: tacheConfidentielle }));
    expect(r.statusCode).toBe(403);
    expect(r.json()).toMatchObject({ cle: "erreurs:horsPerimetre" });
    expect(await prisma.document.count({ where: { taskId: tacheConfidentielle } })).toBe(0);
  });
});

describe("RG-DOC-04 — une pièce jointe pèse au plus 20 Mio", () => {
  it("RG-DOC-04 — une pièce de 21 Mio est refusée en 413, avec la clé et le plafond", async () => {
    const r = await appel("POST", "/api/documents", contributeur.jeton, piece(21 * MIO, { projectId: projetVisible }));
    expect(r.statusCode).toBe(413);
    expect(r.json()).toMatchObject({
      cle: "erreurs:fichierTropVolumineux",
      detail: { maxOctets: 20_971_520 },
    });
  });

  it("RG-DOC-04 — une pièce de 5 Mio est acceptée (D08)", async () => {
    const r = await appel("POST", "/api/documents", contributeur.jeton, piece(5 * MIO, { projectId: projetVisible }));
    expect(r.statusCode).toBe(201);
    const { id } = r.json() as { id: string };
    expect((await prisma.document.findUniqueOrThrow({ where: { id } })).tailleOctets).toBe(5 * MIO);
  });
});
