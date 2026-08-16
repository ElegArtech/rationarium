import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { creerClient, type PrismaClient } from "@trame/db";
import { TiersService } from "./tiers.service.js";
import { CompetencesService } from "../competences/competences.service.js";
import { AuditService } from "../commun/audit.service.js";
import { PerimetreService } from "../commun/perimetre.service.js";

/**
 * L-35 — les points d'entrée ajoutés pour les vues 22 à 26 : répertoires des
 * tiers et des clients, référentiel des compétences, suppression d'un client.
 */

const RACINE_DB = path.resolve(import.meta.dirname, "../../../../packages/db");
const utc = (s: string) => new Date(`${s}T00:00:00.000Z`);

let pg: StartedPostgreSqlContainer;
let prisma: PrismaClient;
let tiers: TiersService;
let competences: CompetencesService;
let acteur: string;

async function agent(prenom = "A", nom = "T") {
  const id = crypto.randomUUID();
  await prisma.user.create({
    data: {
      id, login: `u-${id.slice(0, 8)}`, email: `${id.slice(0, 8)}@x.fr`,
      motDePasseHash: "x", prenom, nom,
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
  prisma = creerClient(pg.getConnectionUri());
  const audit = new AuditService(prisma as never);
  const perimetres = new PerimetreService(prisma as never);
  tiers = new TiersService(prisma as never, audit);
  competences = new CompetencesService(prisma as never, audit, perimetres);
  acteur = await agent("Acteur", "Test");
}, 240_000);

afterAll(async () => {
  await prisma?.$disconnect();
  await pg?.stop();
});

describe("EX-TRS-01 — le répertoire des tiers", () => {
  it("exclut les archivés par défaut, mais sait les retrouver", async () => {
    const vivant = await prisma.thirdParty.create({
      data: { type: "organisation", organisation: "Presta vivante" },
    });
    const archive = await prisma.thirdParty.create({
      data: { type: "organisation", organisation: "Presta archivée", actif: false },
    });

    const actifs = await tiers.listerTiers();
    expect(actifs.map((x) => x.id)).toContain(vivant.id);
    expect(actifs.map((x) => x.id)).not.toContain(archive.id);

    // Un tiers archivé n'a pas disparu : il porte du temps déclaré qui doit
    // rester traçable. Le masquer sans moyen de le retrouver mentirait.
    const archives = await tiers.listerTiers({ archive: true });
    expect(archives.map((x) => x.id)).toEqual([archive.id]);
  });

  it("la recherche porte sur l'organisation ET sur le contact", async () => {
    await prisma.thirdParty.create({
      data: { type: "individual", contactNom: "Zoé Cherchée", contactEmail: "zoe@x.fr" },
    });
    expect((await tiers.listerTiers({ recherche: "cherchée" }))).toHaveLength(1);
    expect((await tiers.listerTiers({ recherche: "zoe@" }))).toHaveLength(1);
  });

  it("chaque ligne porte ses comptes de rattachement", async () => {
    const t = await prisma.thirdParty.create({
      data: { type: "organisation", organisation: "Comptée" },
    });
    const p = await prisma.project.create({
      data: { nom: `Projet ${t.id.slice(0, 6)}`, dateDebut: utc("2026-01-01"), dateFin: utc("2026-12-31") },
    });
    await prisma.projectThirdParty.create({ data: { projectId: p.id, thirdPartyId: t.id } });

    const ligne = (await tiers.listerTiers({ recherche: "Comptée" }))[0];
    expect(ligne?._count.projets).toBe(1);
    expect(ligne?._count.taches).toBe(0);
  });
});

describe("EX-TRS-05 — supprimer un client DÉTACHE ses projets", () => {
  it("le projet survit à la suppression de son bénéficiaire", async () => {
    const client = await prisma.client.create({ data: { nom: "Direction commanditaire" } });
    const projet = await prisma.project.create({
      data: { nom: "Projet commandité", dateDebut: utc("2026-01-01"), dateFin: utc("2026-12-31") },
    });
    await prisma.projectClient.create({ data: { projectId: projet.id, clientId: client.id } });

    await tiers.supprimerClient(client.id, acteur);

    // Un projet dont le bénéficiaire disparaît reste un projet. Confondre les
    // deux effacerait du travail réel parce qu'un commanditaire a changé de nom.
    expect(await prisma.project.findUnique({ where: { id: projet.id } })).not.toBeNull();
    expect(await prisma.projectClient.count({ where: { projectId: projet.id } })).toBe(0);
  });

  it("la suppression est tracée avec le nombre de projets détachés", async () => {
    const client = await prisma.client.create({ data: { nom: "Tracée" } });
    const p1 = await prisma.project.create({
      data: { nom: "P1 tracée", dateDebut: utc("2026-01-01"), dateFin: utc("2026-12-31") },
    });
    await prisma.projectClient.create({ data: { projectId: p1.id, clientId: client.id } });

    await tiers.supprimerClient(client.id, acteur);

    const trace = await prisma.auditLog.findFirst({
      where: { action: "client.delete", entiteId: client.id },
    });
    expect(trace?.detail).toMatchObject({ nom: "Tracée", projetsDetaches: 1 });
  });

  it("un client inexistant est refusé, pas ignoré en silence", async () => {
    await expect(tiers.supprimerClient(crypto.randomUUID(), acteur)).rejects.toMatchObject({
      code: "introuvable",
    });
  });
});

describe("EX-TRS-04 — le répertoire des clients", () => {
  it("chaque client porte son portefeuille", async () => {
    const client = await prisma.client.create({ data: { nom: "Avec portefeuille" } });
    const p = await prisma.project.create({
      data: { nom: "Son projet", dateDebut: utc("2026-01-01"), dateFin: utc("2026-12-31") },
    });
    await prisma.projectClient.create({ data: { projectId: p.id, clientId: client.id } });

    const ligne = (await tiers.listerClients({ recherche: "Avec portefeuille" }))[0];
    expect(ligne?._count.projets).toBe(1);
    expect(ligne?.projets[0]?.project.nom).toBe("Son projet");
  });
});

describe("EX-CMP-01 — le référentiel dit l'écart, pas seulement l'effectif", () => {
  it("le manque est calculé, jamais stocké", async () => {
    const c = await competences.creer(
      { nom: "Cartographie SIG", categorie: "technical", effectifRequis: 3 },
      acteur,
    );
    const a = await agent("Sachante", "Une");
    await competences.definirNiveau(a, c.id, "expert", acteur);

    const ligne = (await competences.referentiel({ recherche: "Cartographie" }))[0];
    expect(ligne?.detenteurs).toBe(1);
    expect(ligne?.effectifRequis).toBe(3);
    // C'est l'écart entre les deux qui fait l'information, pas l'un des deux.
    expect(ligne?.manque).toBe(2);
  });

  it("un effectif atteint ne produit pas de manque négatif", async () => {
    const c = await competences.creer(
      { nom: "Rédaction administrative", categorie: "methodology", effectifRequis: 1 },
      acteur,
    );
    const a = await agent("Deux", "Sachants");
    const b = await agent("Trois", "Sachants");
    await competences.definirNiveau(a, c.id, "expert", acteur);
    await competences.definirNiveau(b, c.id, "master", acteur);

    const ligne = (await competences.referentiel({ recherche: "Rédaction" }))[0];
    expect(ligne?.detenteurs).toBe(2);
    expect(ligne?.manque).toBe(0);
  });

  it("le filtre par catégorie ne ramène que sa catégorie", async () => {
    await competences.creer(
      { nom: "Écoute active", categorie: "soft_skill", effectifRequis: 2 },
      acteur,
    );
    const doux = await competences.referentiel({ categorie: "soft_skill" });
    expect(doux.every((x) => x.categorie === "soft_skill")).toBe(true);
    expect(doux.map((x) => x.nom)).toContain("Écoute active");
  });
});
