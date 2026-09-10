import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { creerClient, type PrismaClient } from "@rationarium/db";
import { hacherMotDePasse } from "../auth/mots-de-passe.js";

const RACINE_DB = path.resolve(import.meta.dirname, "../../../../packages/db");
let pg: StartedPostgreSqlContainer;
let app: NestFastifyApplication;
let prisma: PrismaClient;
let autorise: { id: string; jeton: string };
let refuse: { id: string; jeton: string };
let projetId: string;

async function compte(nom: string, permissions: string[]) {
  const id = crypto.randomUUID();
  const role = await prisma.role.create({
    data: {
      code: `RM11_${nom}_${id}`,
      nom,
      permissions: { create: permissions.map((permission) => ({ permission })) },
    },
  });
  await prisma.user.create({
    data: {
      id,
      login: `rm11-${nom}`,
      email: `rm11-${nom}@exemple.fr`,
      prenom: "Test",
      nom,
      roleId: role.id,
      motDePasseHash: await hacherMotDePasse("Bonjour12!"),
      motDePasseAChanger: false,
    },
  });
  const connexion = await app.inject({
    method: "POST",
    url: "/api/auth/login",
    payload: { identifiant: `rm11-${nom}`, motDePasse: "Bonjour12!" },
  });
  expect(connexion.statusCode).toBe(200);
  return { id, jeton: connexion.cookies.find((c) => c.name === "rationarium_session")!.value };
}

const exporter = (acteur: { jeton: string }, suffixe = "") => app.inject({
  method: "GET",
  url: `/api/rapports/export?format=xlsx&langue=fr${suffixe}`,
  cookies: { rationarium_session: acteur.jeton },
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
  prisma = creerClient(pg.getConnectionUri());
  autorise = await compte("autorise", ["reports:read", "reports:export"]);
  refuse = await compte("refuse", ["reports:read"]);
  const projet = await prisma.project.create({
    data: {
      nom: "Projet RM11 exporté",
      chefId: autorise.id,
      dateDebut: new Date("2026-01-01T00:00:00Z"),
      dateFin: new Date("2026-12-31T00:00:00Z"),
    },
  });
  projetId = projet.id;
  await prisma.task.create({
    data: { titre: "Travail restant", projectId: projetId, statut: "doing", avancement: 25 },
  });
  const ecarte = await prisma.project.create({
    data: {
      nom: "Projet RM11 écarté",
      sponsorId: autorise.id,
      dateDebut: new Date("2026-01-01T00:00:00Z"),
      dateFin: new Date("2026-12-31T00:00:00Z"),
    },
  });
  await prisma.task.create({
    data: { titre: "Autre travail", projectId: ecarte.id, statut: "done", avancement: 100 },
  });
}, 300_000);

afterAll(async () => {
  await prisma?.$disconnect();
  await app?.close();
  await pg?.stop();
});

beforeEach(async () => {
  await prisma.auditLog.deleteMany({ where: { action: "report.export" } });
});

describe("RM-11 — export HTTP réel", () => {
  it("EX-RPT-03 et RG-RPT-01 — le XLSX filtré est ouvrable et contient exactement l’identifiant et les agrégats attendus", async () => {
    const reponse = await exporter(autorise, `&projets=${projetId}`);
    expect(reponse.statusCode).toBe(200);
    expect(reponse.headers["content-type"]).toBe(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    expect(reponse.headers["content-disposition"]).toMatch(/^attachment; filename="rapport-.*\.xlsx"$/);

    const dossier = mkdtempSync(path.join(tmpdir(), "rationarium-rm11-"));
    try {
      const fichier = path.join(dossier, "rapport.xlsx");
      writeFileSync(fichier, reponse.rawPayload);
      execFileSync("unzip", ["-t", fichier], { stdio: "pipe" });
      const feuille = execFileSync("unzip", ["-p", fichier, "xl/worksheets/sheet1.xml"], {
        encoding: "utf8",
      });
      expect(feuille.match(/<row /g)).toHaveLength(2);
      expect(feuille).toContain(projetId);
      expect(feuille).toContain("Projet RM11 exporté");
      expect(feuille).not.toContain("Projet RM11 écarté");
      expect(feuille).toContain('<c r="D2"><v>1</v></c>');

      execFileSync("libreoffice", [
        "--headless", "--convert-to", "ods", "--outdir", dossier, fichier,
      ], { stdio: "pipe", timeout: 60_000 });
      const ods = path.join(dossier, "rapport.ods");
      expect(existsSync(ods)).toBe(true);
      expect(readFileSync(ods).subarray(0, 2).toString("ascii")).toBe("PK");
    } finally {
      rmSync(dossier, { recursive: true, force: true });
    }
  }, 90_000);

  it("M20 — succès HTTP trace filtres et acteur, refus permission et validation en échec ne tracent rien", async () => {
    const succes = await exporter(autorise, `&projets=${projetId}&periode=trimestre`);
    expect(succes.statusCode).toBe(200);
    const trace = await prisma.auditLog.findFirstOrThrow({ where: { action: "report.export" } });
    expect(trace.acteurId).toBe(autorise.id);
    expect(trace.detail).toMatchObject({ format: "xlsx", langue: "fr", projets: [projetId] });

    await prisma.auditLog.deleteMany({ where: { action: "report.export" } });
    expect((await exporter(refuse)).statusCode).toBe(403);
    const invalide = await app.inject({
      method: "GET",
      url: "/api/rapports/export?format=invalide",
      cookies: { rationarium_session: autorise.jeton },
    });
    expect(invalide.statusCode).toBe(400);
    expect(await prisma.auditLog.count({ where: { action: "report.export" } })).toBe(0);
  });
});
