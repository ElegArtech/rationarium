import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { execFileSync } from "node:child_process";
import path from "node:path";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";

/**
 * Robustesse face au déni de service — `RG-ROB-01`, `RG-ROB-02`, `RG-ROB-03`,
 * `RG-IMP-09`.
 *
 * Toute la chaîne HTTP est traversée : la limite de corps vit dans Fastify,
 * avant tout contrôleur, et la borne des plages dans les contrôleurs, avant
 * tout service. Un test de service ne verrait ni l'une ni l'autre.
 */

const RACINE_DB = path.resolve(import.meta.dirname, "../../../../packages/db");
const MIO = 1024 * 1024;

let pg: StartedPostgreSqlContainer;
let app: NestFastifyApplication;
let prisma: import("@rationarium/db").PrismaClient;
let jeton: string;
let moi: string;
let projetId: string;

const appel = (methode: string, url: string, corps?: unknown) =>
  app.inject({
    method: methode as "GET",
    url,
    cookies: { rationarium_session: jeton },
    ...(corps !== undefined
      ? typeof corps === "string"
        ? { payload: corps, headers: { "content-type": "application/json" } }
        : { payload: corps as object }
      : {}),
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
      code: "TEST_ROB",
      nom: "TEST_ROB",
      permissions: {
        create: [
          "projects:read",
          "projects:manage_any",
          "tasks:read",
          "tasks:readAll",
          "documents:create",
          "documents:read",
          "planning:read",
          "planning:export_ics",
          "predefined_tasks:read",
          "predefined_tasks:generate",
          "telework:read",
          "telework:generate",
          "time_tracking:read",
          "time_tracking:read_team",
          "events:read",
          "users:read_individual_tracking",
          "skills:import",
          "leaves:create",
        ].map((permission) => ({ permission })),
      },
    },
  });
  const utilisateur = await prisma.user.create({
    data: {
      login: "test.rob",
      email: "test.rob@exemple.test",
      motDePasseHash: await hacherMotDePasse("Corr3ct-Horse-Battery!"),
      prenom: "Test",
      nom: "ROB",
      motDePasseAChanger: false,
      roleId: role.id,
    },
  });
  moi = utilisateur.id;
  const projet = await prisma.project.create({
    data: {
      nom: "Projet des pièces jointes",
      dateDebut: new Date("2026-01-01T00:00:00.000Z"),
      dateFin: new Date("2026-12-31T00:00:00.000Z"),
      chefId: moi,
    },
  });
  projetId = projet.id;
  await prisma.project.createMany({
    data: Array.from({ length: 60 }, (_, i) => ({
      nom: `Zeta ${String(i).padStart(2, "0")}`,
      dateDebut: new Date("2026-01-01T00:00:00.000Z"),
      dateFin: new Date("2026-12-31T00:00:00.000Z"),
      chefId: moi,
    })),
  });
  await prisma.task.createMany({
    data: Array.from({ length: 60 }, (_, i) => ({ titre: `Zeta tâche ${i}`, projectId: projet.id })),
  });

  const connexion = await app.inject({
    method: "POST",
    url: "/api/auth/login",
    payload: { identifiant: "test.rob", motDePasse: "Corr3ct-Horse-Battery!" },
  });
  if (connexion.statusCode !== 200) throw new Error(`connexion refusée : ${connexion.body}`);
  jeton = connexion.cookies.find((c) => c.name === "rationarium_session")!.value;
}, 300_000);

afterAll(async () => {
  await prisma?.$disconnect();
  await app?.close();
  await pg?.stop();
});

describe("RG-ROB-01 — la limite de corps suit ce que la route reçoit", () => {
  it("RG-ROB-01 — POST /auth/login refuse un corps de 2 Mio en 413, avant toute analyse", async () => {
    const r = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: JSON.stringify({ identifiant: "x".repeat(2 * MIO), motDePasse: "y" }),
      headers: { "content-type": "application/json" },
    });
    expect(r.statusCode).toBe(413);
    expect(r.json()).toMatchObject({ cle: "erreurs:fichierTropVolumineux" });
  });

  it("RG-ROB-01 — une écriture ordinaire (PATCH d'un projet) refuse aussi 2 Mio", async () => {
    const r = await appel("PATCH", `/api/projets/${projetId}`, { description: "x".repeat(2 * MIO), version: 1 });
    expect(r.statusCode).toBe(413);
  });

  it("RG-ROB-01, RG-DOC-04 — une pièce jointe de 15 Mio passe toujours", async () => {
    const r = await appel("POST", "/api/documents", {
      nom: "quinze.bin",
      typeMime: "application/octet-stream",
      contenuBase64: Buffer.alloc(15 * MIO, 7).toString("base64"),
      projectId: projetId,
    });
    expect(r.statusCode, r.body.slice(0, 300)).toBe(201);
  });

  it("RG-ROB-01, RG-DOC-04 — au-delà de 32 Mio, la pièce jointe est refusée en 413 avec sa clé", async () => {
    const r = await appel("POST", "/api/documents", {
      nom: "trop.bin",
      typeMime: "application/octet-stream",
      contenuBase64: "A".repeat(32 * MIO + 4),
      projectId: projetId,
    });
    expect(r.statusCode).toBe(413);
    expect(r.json()).toMatchObject({ cle: "erreurs:fichierTropVolumineux" });
  });

  it("RG-ROB-01 — chaque relèvement de la table a trouvé sa route (aucune entrée inerte)", async () => {
    const { entreesSansRoute, LIMITES_PAR_ROUTE } = await import("./limites-corps.js");
    expect(LIMITES_PAR_ROUTE.length).toBeGreaterThanOrEqual(11);
    expect(entreesSansRoute(app.getHttpAdapter().getInstance())).toEqual([]);
  });
});

describe("RG-ROB-02 — les plages de dates sont bornées", () => {
  const trop = "debut=1970-01-01&fin=9999-12-31";
  const inverse = "debut=2026-03-31&fin=2026-03-01";

  const lectures = () => [
    "/api/planning",
    "/api/planning/activite",
    "/api/planning/ics",
    "/api/parametrage/trame",
    "/api/teletravail",
    "/api/activite/grille",
    "/api/temps",
    "/api/temps/rapport?axe=agent",
    "/api/evenements",
  ];
  const avec = (url: string, q: string) => `${url}${url.includes("?") ? "&" : "?"}${q}`;

  it("RG-ROB-02 — chaque lecture par plage refuse plus de 366 jours en 400 erreurs:periodeTropEtendue", async () => {
    for (const url of lectures()) {
      const r = await appel("GET", avec(url, trop));
      expect(r.statusCode, url).toBe(400);
      expect(r.json(), url).toMatchObject({ cle: "erreurs:periodeTropEtendue", detail: { maxJours: 366 } });
    }
  });

  it("RG-ROB-02 — chaque lecture par plage refuse fin < debut en 400 erreurs:datesIncoherentes", async () => {
    for (const url of lectures()) {
      const r = await appel("GET", avec(url, inverse));
      expect(r.statusCode, url).toBe(400);
      expect(r.json(), url).toMatchObject({ cle: "erreurs:datesIncoherentes" });
    }
  });

  it("RG-ROB-02 — contre-témoin : une année bissextile entière passe", async () => {
    for (const url of ["/api/planning", "/api/activite/grille", "/api/teletravail", "/api/temps/rapport?axe=agent"]) {
      const r = await appel("GET", avec(url, "debut=2028-01-01&fin=2028-12-31"));
      expect(r.statusCode, `${url} ${r.body.slice(0, 200)}`).toBe(200);
    }
    // L'export ICS garde son type de calendrier quand il réussit.
    const ics = await appel("GET", "/api/planning/ics?debut=2028-01-01&fin=2028-12-31");
    expect(ics.statusCode).toBe(200);
    expect(ics.headers["content-type"]).toContain("text/calendar");
    expect(ics.headers["content-disposition"]).toContain("planning.ics");
  });

  it("RG-ROB-02 — les générations bornent leur fenêtre (télétravail, activité)", async () => {
    const tlt = await appel("POST", "/api/teletravail/generer", { debut: "2026-01-01", fin: "2099-12-31" });
    expect(tlt.statusCode).toBe(400);
    expect(tlt.json()).toMatchObject({ cle: "erreurs:periodeTropEtendue" });

    const act = await appel("POST", "/api/activite/generer", {
      predefinedTaskId: crypto.randomUUID(),
      debut: "2026-01-01",
      fin: "2099-12-31",
      userIds: [moi],
    });
    expect(act.statusCode).toBe(400);
    expect(act.json()).toMatchObject({ cle: "erreurs:periodeTropEtendue" });
  });

  it("RG-ROB-02 — le décompte des jours ouvrés suit la borne d'un congé, pas celle d'une lecture", async () => {
    const deuxAns = await appel("GET", "/api/parametrage/jours-ouvres?debut=2026-01-01&fin=2027-12-31");
    expect(deuxAns.statusCode, deuxAns.body.slice(0, 200)).toBe(200);
    const huitMille = await appel("GET", `/api/parametrage/jours-ouvres?${trop}`);
    expect(huitMille.statusCode).toBe(400);
    expect(huitMille.json()).toMatchObject({ cle: "erreurs:periodeTropEtendue", detail: { maxJours: 3 * 366 } });
  });

  it("RG-ROB-02 — une demande de congé de huit mille ans est refusée à la validation", async () => {
    const r = await appel("POST", "/api/conges", {
      typeId: crypto.randomUUID(),
      dateDebut: "1970-01-01",
      dateFin: "9999-12-31",
    });
    expect(r.statusCode).toBe(400);
    expect(JSON.stringify(r.json())).toContain("dateFin");
  });

  it("RG-ROB-02 — le suivi individuel garde « tout l'historique » mais refuse l'absurde", async () => {
    const tout = await appel("GET", `/api/utilisateurs/${moi}/suivi?debut=1970-01-01&fin=2031-12-31`);
    expect(tout.statusCode, tout.body.slice(0, 200)).toBe(200);
    const absurde = await appel("GET", `/api/utilisateurs/${moi}/suivi?debut=1970-01-01&fin=9999-12-31`);
    expect(absurde.statusCode).toBe(400);
    expect(absurde.json()).toMatchObject({ cle: "erreurs:periodeTropEtendue" });
  });
});

describe("RG-ROB-03 — la recherche globale est bornée", () => {
  it("RG-ROB-03 — 60 projets et 60 tâches correspondent : 50 de chaque sont rendus", async () => {
    const r = await appel("GET", "/api/recherche?terme=Zeta");
    expect(r.statusCode).toBe(200);
    const corps = r.json() as { projets: unknown[]; taches: unknown[] };
    expect(corps.projets).toHaveLength(50);
    expect(corps.taches).toHaveLength(50);
  });
});

describe("RG-IMP-09 — un import porte au plus 5 000 lignes", () => {
  const csv = (n: number) =>
    ["name;category", ...Array.from({ length: n }, (_, i) => `Compétence ${i};Technique`)].join("\n");

  it("RG-IMP-09 — 5 001 lignes : l'aperçu est refusé en 422 avec le nombre et le plafond", async () => {
    const r = await appel("POST", "/api/imports/apercu?type=competences", { contenu: csv(5001) });
    expect(r.statusCode).toBe(422);
    expect(r.json()).toMatchObject({
      cle: "erreurs:importTropDeLignes",
      detail: { lignes: 5001, maxLignes: 5000 },
    });
  });

  it("RG-IMP-09 — 5 001 lignes : l'exécution est refusée de même", async () => {
    const r = await appel("POST", "/api/imports/competences", { contenu: csv(5001) });
    expect(r.statusCode).toBe(422);
    expect(r.json()).toMatchObject({ cle: "erreurs:importTropDeLignes" });
  });

  it("RG-IMP-09 — contre-témoin : 5 000 lignes, lignes vides en plus, sont analysées", async () => {
    const r = await appel("POST", "/api/imports/apercu?type=competences", { contenu: `${csv(5000)}\n\n\n` });
    expect(r.statusCode, r.body.slice(0, 300)).toBe(201);
  });
});
