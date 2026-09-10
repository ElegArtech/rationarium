import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { creerClient, type PrismaClient } from "@rationarium/db";
import { AuditService } from "../commun/audit.service.js";
import { PerimetreService } from "../commun/perimetre.service.js";
import { RapportsService } from "../rapports/rapports.service.js";

const RACINE_DB = path.resolve(import.meta.dirname, "../../../../packages/db");
const date = (valeur: string) => new Date(`${valeur}T00:00:00.000Z`);
const uuid = () => crypto.randomUUID();

let pg: StartedPostgreSqlContainer;
let prisma: PrismaClient;
let rapports: RapportsService;
let perimetres: PerimetreService;
let acteurId: string;
let autreId: string;
let projetFiltreId: string;

beforeAll(async () => {
  pg = await new PostgreSqlContainer("postgres:18-alpine").start();
  execFileSync("pnpm", ["exec", "prisma", "migrate", "deploy"], {
    cwd: RACINE_DB,
    env: { ...process.env, DATABASE_URL: pg.getConnectionUri() },
    stdio: "pipe",
  });
  prisma = creerClient(pg.getConnectionUri());
  perimetres = new PerimetreService(prisma as never);
  rapports = new RapportsService(
    prisma as never,
    perimetres,
    new AuditService(prisma as never),
  );
  const [acteur, autre] = await Promise.all([
    prisma.user.create({ data: {
      login: `rpt-${uuid()}`, email: `${uuid()}@exemple.fr`, motDePasseHash: "test",
      prenom: "Inès", nom: "Pilote",
    } }),
    prisma.user.create({ data: {
      login: `autre-${uuid()}`, email: `${uuid()}@exemple.fr`, motDePasseHash: "test",
      prenom: "Zoé", nom: "Hors périmètre",
    } }),
  ]);
  acteurId = acteur.id;
  autreId = autre.id;
  const [filtre, autreVisible] = await Promise.all([
    prisma.project.create({ data: {
      nom: "Projet XLSX filtré", chefId: acteur.id,
      dateDebut: date("2026-01-01"), dateFin: date("2026-12-31"),
    } }),
    prisma.project.create({ data: {
      nom: "Projet visible écarté", sponsorId: acteur.id, chefId: autre.id,
      dateDebut: date("2026-01-01"), dateFin: date("2026-12-31"),
    } }),
  ]);
  projetFiltreId = filtre.id;
  await prisma.project.create({ data: {
    nom: "Projet hors périmètre", chefId: autre.id,
    dateDebut: date("2026-01-01"), dateFin: date("2026-12-31"),
  } });
  await prisma.task.createMany({ data: [
    { titre: "Livraison", projectId: filtre.id, statut: "doing", avancement: 40 },
    { titre: "Écartée", projectId: autreVisible.id, statut: "doing", avancement: 10 },
  ] });
}, 240_000);

afterAll(async () => {
  await prisma?.$disconnect();
  await pg?.stop();
});

describe("RM-11 — rapport sur PostgreSQL réel", () => {
  it("EX-RPT-02, EX-RPT-03 et RG-RPT-01 — le XLSX reprend période, projet, responsable et périmètre sans ligne étrangère", async () => {
    const permissions = new Set(["reports:read", "reports:export"]);
    const perimetre = await perimetres.resoudre(acteurId, permissions);
    const fichier = await rapports.exporter(
      "xlsx",
      { periode: "mois", projets: [projetFiltreId], responsables: [acteurId] },
      perimetre,
      permissions,
      date("2026-09-07"),
      acteurId,
    );
    expect(fichier.type).toBe("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    expect(fichier.nom).toBe("rapport-2026-09-01.xlsx");
    expect(fichier.contenu.subarray(0, 2).toString("ascii")).toBe("PK");
    const archiveLisible = fichier.contenu.toString("utf8");
    expect(archiveLisible).toContain("Projet XLSX filtré");
    expect(archiveLisible).not.toContain("Projet visible écarté");
    expect(archiveLisible).not.toContain("Projet hors périmètre");
  });

  it("RG-RPT-01 et RG-SCOPE-04 — tendance.accesRestreint est toujours booléen et ne s'ouvre qu'avec portée globale et confidentielle", async () => {
    const restreint = await rapports.vueEnsemble(
      { periode: "mois" },
      await perimetres.resoudre(acteurId, new Set(["reports:read"])),
      new Set(["reports:read"]),
      date("2026-09-07"),
    );
    expect(restreint.tendance.accesRestreint).toBe(true);

    const droitsGlobaux = new Set([
      "reports:read", "users:readAll", "tasks:read_confidential",
    ]);
    const global = await rapports.vueEnsemble(
      { periode: "mois" },
      await perimetres.resoudre(autreId, droitsGlobaux),
      droitsGlobaux,
      date("2026-09-07"),
    );
    expect(global.tendance.accesRestreint).toBe(false);
  });
});
