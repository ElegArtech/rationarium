import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { execFileSync } from "node:child_process";
import path from "node:path";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";

/**
 * `RG-GEN-11` — un identifiant mal formé produit 404, jamais 500.
 *
 * Les routes `:id` passent l'identifiant tel quel à Prisma. Une valeur qui
 * n'est pas un UUID ne correspond à aucune ligne — c'est un « introuvable » —,
 * mais PostgreSQL refuse de la convertir (`22P02`) et l'erreur remontait
 * jusqu'au filtre global sans y être reconnue : « erreur inattendue, incident
 * enregistré », pour une simple adresse tapée de travers.
 *
 * Seule la chaîne HTTP complète le montre : c'est le FILTRE qui traduit, et un
 * test de service ne le traverse pas.
 */

const RACINE_DB = path.resolve(import.meta.dirname, "../../../../packages/db");

let pg: StartedPostgreSqlContainer;
let app: NestFastifyApplication;
let prisma: import("@rationarium/db").PrismaClient;
let jeton: string;

const appel = (methode: string, url: string, corps?: unknown) =>
  app.inject({
    method: methode as "GET",
    url,
    cookies: { rationarium_session: jeton },
    ...(corps !== undefined ? { payload: corps as object } : {}),
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
  app = await creerApplication();
  await app.init();
  await app.getHttpAdapter().getInstance().ready();

  const { creerClient } = await import("@rationarium/db");
  prisma = creerClient(pg.getConnectionUri());

  const { hacherMotDePasse } = await import("../auth/mots-de-passe.js");
  const role = await prisma.role.create({
    data: {
      code: "TEST_GEN_11",
      nom: "TEST_GEN_11",
      permissions: {
        create: ["projects:read", "projects:update", "projects:manage_any", "tasks:read", "tasks:readAll"].map(
          (permission) => ({ permission }),
        ),
      },
    },
  });
  await prisma.user.create({
    data: {
      login: "test.gen.11",
      email: "test.gen.11@exemple.test",
      motDePasseHash: await hacherMotDePasse("Corr3ct-Horse-Battery!"),
      prenom: "Test",
      nom: "GEN",
      motDePasseAChanger: false,
      roleId: role.id,
    },
  });
  const connexion = await app.inject({
    method: "POST",
    url: "/api/auth/login",
    payload: { identifiant: "test.gen.11", motDePasse: "Corr3ct-Horse-Battery!" },
  });
  if (connexion.statusCode !== 200) throw new Error(`connexion refusée : ${connexion.body}`);
  jeton = connexion.cookies.find((c) => c.name === "rationarium_session")!.value;
}, 300_000);

afterAll(async () => {
  await prisma?.$disconnect();
  await app?.close();
  await pg?.stop();
});

describe("RG-GEN-11 — un identifiant mal formé est un introuvable", () => {
  it("RG-GEN-11 — GET /projets/abc rend 404 erreurs:introuvable, pas 500", async () => {
    const r = await appel("GET", "/api/projets/abc");
    expect(r.statusCode).toBe(404);
    expect(r.json()).toMatchObject({ cle: "erreurs:introuvable" });
  });

  it("RG-GEN-11 — GET /taches/abc rend 404 erreurs:introuvable, pas 500", async () => {
    const r = await appel("GET", "/api/taches/abc");
    expect(r.statusCode).toBe(404);
    expect(r.json()).toMatchObject({ cle: "erreurs:introuvable" });
  });

  it("RG-GEN-11 — POST /projets/abc/annuler rend 404 erreurs:introuvable, pas 500", async () => {
    const r = await appel("POST", "/api/projets/abc/annuler", {});
    expect(r.statusCode).toBe(404);
    expect(r.json()).toMatchObject({ cle: "erreurs:introuvable" });
  });

  it("RG-GEN-11 — contre-témoin : un UUID bien formé mais absent reste un 404", async () => {
    const r = await appel("GET", `/api/projets/${crypto.randomUUID()}`);
    expect(r.statusCode).toBe(404);
  });
});

describe("RG-DOC-04 — un corps au-delà de la limite du transport se dit en clair", () => {
  it("RG-DOC-04 — un corps trop volumineux rend 413 erreurs:fichierTropVolumineux", async () => {
    /*
     * Au-delà de la limite de Fastify, le corps n'atteint jamais un
     * contrôleur : c'est le filtre qui doit nommer la situation. Sans lui,
     * le client lisait un 413 sans clé, donc sans message traduisible.
     */
    const limite = app.getHttpAdapter().getInstance().initialConfig.bodyLimit ?? 1_048_576;
    const r = await appel("POST", "/api/documents", {
      nom: "trop.bin",
      typeMime: "application/octet-stream",
      contenuBase64: "A".repeat(limite + 4),
    });
    expect(r.statusCode).toBe(413);
    expect(r.json()).toMatchObject({ cle: "erreurs:fichierTropVolumineux" });
  });
});
