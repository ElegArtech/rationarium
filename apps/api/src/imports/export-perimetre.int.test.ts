import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { execFileSync } from "node:child_process";
import path from "node:path";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { creerClient, type PrismaClient } from "@rationarium/db";
import { modeleParCode } from "@rationarium/contracts";
import { hacherMotDePasse } from "../auth/mots-de-passe.js";

/**
 * M21 côté projet — `RG-PRJ-13`, `RG-IMP-07`, `RG-IMP-08`.
 *
 * Trois défauts sur les mêmes routes :
 *
 *   - l'import d'un projet (Ajouter, Remplacer, tâches seules, jalons seuls)
 *     et le décompte qui précède le Remplacer ne regardaient que la
 *     permission : un chef de projet vidait le projet d'un autre en mode
 *     Remplacer, en devinant son identifiant ;
 *   - l'export CSV des tâches et des jalons ne contrôlait ni la visibilité du
 *     projet, ni la confidentialité des tâches (`RG-SCOPE-04`) : une tâche
 *     confidentielle sortait dans le fichier de qui ne pouvait pas l'ouvrir ;
 *   - une cellule exportée qui commençait par `=` s'ouvrait comme une formule.
 *
 * Par HTTP, comme `ecritures-perimetre.int.test.ts` : la garde PUIS le service.
 */

const RACINE_DB = path.resolve(import.meta.dirname, "../../../../packages/db");
const date = (jour: string) => new Date(`${jour}T00:00:00.000Z`);

let pg: StartedPostgreSqlContainer;
let app: NestFastifyApplication;
let prisma: PrismaClient;

type Acteur = { id: string; jeton: string };

/** `PROJECT_LEAD` : `tasks:import`, `milestones:import`, `tasks:export`, et
 *  PAS `tasks:read_confidential`. */
let horsProjet: Acteur;
let chef: Acteur;
let membre: Acteur;
/** `projects:manage_any` sans gestion globale des personnes. */
let gestionnaire: Acteur;

const MOT_DE_PASSE = "Bonjour12!";

async function compte(login: string, modeleCode: string, ajouts: string[] = []): Promise<Acteur> {
  const modele = modeleParCode(modeleCode);
  if (!modele) throw new Error(`Modèle ${modeleCode} absent du catalogue.`);
  const role = await prisma.role.create({
    data: {
      code: `T_${login.toUpperCase()}`,
      nom: login,
      permissions: {
        create: [...new Set([...modele.permissions, ...ajouts])].map((permission) => ({ permission })),
      },
    },
  });
  const id = crypto.randomUUID();
  await prisma.user.create({
    data: {
      id,
      login,
      email: `${login}@exemple.fr`,
      prenom: login,
      nom: "SEC03",
      roleId: role.id,
      motDePasseHash: await hacherMotDePasse(MOT_DE_PASSE),
      motDePasseAChanger: false,
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

const appel = (acteur: Acteur, methode: "GET" | "POST", url: string, corps?: object) =>
  app.inject({
    method: methode,
    url: `/api${url}`,
    cookies: { rationarium_session: acteur.jeton },
    ...(corps ? { payload: corps } : {}),
  });

/** Les lignes d'un CSV exporté, BOM retiré, en-tête comprise. */
const lignesCsv = (corps: string) => corps.replace(/^\uFEFF/, "").trimEnd().split(/\r?\n/);

/** Un projet dirigé par `chef`, `membre` inscrit : un jalon, une tâche
 *  ordinaire, une tâche confidentielle. */
async function projet() {
  const p = await prisma.project.create({
    data: {
      nom: `P-${crypto.randomUUID().slice(0, 8)}`,
      dateDebut: date("2026-01-01"),
      dateFin: date("2026-12-31"),
      chefId: chef.id,
      membres: { create: [{ userId: membre.id, roleProjet: "Membre" }] },
    },
  });
  await prisma.milestone.create({ data: { nom: "Lancement", projectId: p.id } });
  await prisma.task.create({ data: { titre: "Tâche publique", projectId: p.id } });
  await prisma.task.create({
    data: { titre: "Tâche secrète", projectId: p.id, confidentielle: true },
  });
  return p;
}

const etat = async (projectId: string) => ({
  taches: await prisma.task.findMany({ where: { projectId }, orderBy: { id: "asc" } }),
  jalons: await prisma.milestone.findMany({ where: { projectId }, orderBy: { id: "asc" } }),
});

const CSV_PROJET = "rowType;name;title\nMILESTONE;Intrus;\nTASK;;Tâche intruse\n";
const CSV_TACHES = "title\nTâche intruse\n";
const CSV_JALONS = "name;dueDate\nIntrus;2026-07-01\n";

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

  horsProjet = await compte("lead.hors", "PROJECT_LEAD");
  chef = await compte("lead.chef", "PROJECT_LEAD");
  membre = await compte("lead.membre", "PROJECT_LEAD");
  gestionnaire = await compte("gestion.domaine", "BASIC_USER", [
    "projects:manage_any",
    "tasks:import",
    "milestones:import",
    "tasks:export",
  ]);
}, 300_000);

afterAll(async () => {
  await prisma?.$disconnect();
  await app?.close();
  await pg?.stop();
});

describe("RG-PRJ-13 — l'import d'un projet exige d'y être rattaché, et d'en être porteur pour le remplacer", () => {
  const REFUS: { nom: string; methode: "GET" | "POST"; url: (id: string) => string; corps?: object }[] = [
    { nom: "GET /imports/projet/:id/volumes", methode: "GET", url: (id) => `/imports/projet/${id}/volumes` },
    {
      nom: "POST /imports/projet/:id (ajouter)", methode: "POST", url: (id) => `/imports/projet/${id}`,
      corps: { contenu: CSV_PROJET, mode: "ajouter" },
    },
    {
      nom: "POST /imports/projet/:id (remplacer)", methode: "POST", url: (id) => `/imports/projet/${id}`,
      corps: { contenu: CSV_PROJET, mode: "remplacer" },
    },
    {
      nom: "POST /imports/projet/:id/taches", methode: "POST", url: (id) => `/imports/projet/${id}/taches`,
      corps: { contenu: CSV_TACHES },
    },
    {
      nom: "POST /imports/projet/:id/jalons", methode: "POST", url: (id) => `/imports/projet/${id}/jalons`,
      corps: { contenu: CSV_JALONS },
    },
    { nom: "GET /imports/export/projet/:id/taches", methode: "GET", url: (id) => `/imports/export/projet/${id}/taches` },
    { nom: "GET /imports/export/projet/:id/jalons", methode: "GET", url: (id) => `/imports/export/projet/${id}/jalons` },
  ];

  for (const geste of REFUS) {
    it(`RG-PRJ-13 — ${geste.nom} par un chef de projet non rattaché : 403, base inchangée`, async () => {
      const p = await projet();
      const avant = await etat(p.id);

      const r = await appel(horsProjet, geste.methode, geste.url(p.id), geste.corps);

      expect(r.statusCode).toBe(403);
      expect((r.json() as { cle: string }).cle).toBe("erreurs:horsPerimetre");
      expect(await etat(p.id)).toEqual(avant);
    });
  }

  it("RG-PRJ-13 — un membre importe en mode Ajouter, tâches et jalons compris", async () => {
    const p = await projet();
    expect((await appel(membre, "GET", `/imports/projet/${p.id}/volumes`)).statusCode).toBe(200);
    expect((await appel(membre, "POST", `/imports/projet/${p.id}`, { contenu: CSV_PROJET, mode: "ajouter" })).statusCode).toBe(201);
    expect((await appel(membre, "POST", `/imports/projet/${p.id}/jalons`, { contenu: "name;dueDate\nRecette;2026-09-30\n" })).statusCode).toBe(201);
    expect((await appel(membre, "POST", `/imports/projet/${p.id}/taches`, { contenu: "title\nAutre tâche\n" })).statusCode).toBe(201);
    const titres = (await prisma.task.findMany({ where: { projectId: p.id } })).map((t) => t.titre).sort();
    expect(titres).toEqual(["Autre tâche", "Tâche intruse", "Tâche publique", "Tâche secrète"]);
  });

  it("RG-PRJ-13 — un membre ne REMPLACE pas : le mode Remplacer appartient au porteur", async () => {
    const p = await projet();
    const avant = await etat(p.id);
    const r = await appel(membre, "POST", `/imports/projet/${p.id}`, { contenu: CSV_PROJET, mode: "remplacer" });
    expect(r.statusCode).toBe(403);
    expect((r.json() as { cle: string }).cle).toBe("erreurs:horsPerimetre");
    expect(await etat(p.id)).toEqual(avant);
  });

  it("RG-PRJ-13 — le chef remplace le contenu de son projet", async () => {
    const p = await projet();
    const r = await appel(chef, "POST", `/imports/projet/${p.id}`, { contenu: CSV_PROJET, mode: "remplacer" });
    expect(r.statusCode).toBe(201);
    expect((await prisma.task.findMany({ where: { projectId: p.id } })).map((t) => t.titre)).toEqual(["Tâche intruse"]);
  });

  it("RG-PRJ-13 — `projects:manage_any` remplace et exporte un projet où il n'est rien", async () => {
    const p = await projet();
    expect((await appel(gestionnaire, "GET", `/imports/export/projet/${p.id}/jalons`)).statusCode).toBe(200);
    const r = await appel(gestionnaire, "POST", `/imports/projet/${p.id}`, { contenu: CSV_PROJET, mode: "remplacer" });
    expect(r.statusCode).toBe(201);
  });
});

describe("RG-IMP-07 — un export ne contient que ce que l'exportateur peut lire", () => {
  it("RG-IMP-07 — un membre sans `tasks:read_confidential` n'exporte pas la tâche confidentielle", async () => {
    const p = await projet();
    const r = await appel(membre, "GET", `/imports/export/projet/${p.id}/taches`);
    expect(r.statusCode).toBe(200);

    const titres = lignesCsv(r.body).slice(1).map((l) => l.split(";")[0]);
    expect(titres).toEqual(["Tâche publique"]);
  });

  it("RG-IMP-07 — qui détient `tasks:read_confidential` l'exporte", async () => {
    const lecteur = await compte("lead.confidentiel", "PROJECT_LEAD", ["tasks:read_confidential"]);
    const p = await projet();
    await prisma.projectMember.create({ data: { projectId: p.id, userId: lecteur.id, roleProjet: "Membre" } });

    const r = await appel(lecteur, "GET", `/imports/export/projet/${p.id}/taches`);
    const titres = lignesCsv(r.body).slice(1).map((l) => l.split(";")[0]);
    expect(titres).toEqual(["Tâche publique", "Tâche secrète"]);
  });

  it("RG-IMP-07 — la forme du CSV ne change pas : en-tête de l'import, séparateur point-virgule", async () => {
    const p = await projet();
    const r = await appel(membre, "GET", `/imports/export/projet/${p.id}/taches`);
    expect(r.headers["content-type"]).toBe("text/csv; charset=utf-8");
    expect(r.headers["content-disposition"]).toBe(`attachment; filename="taches-${p.id}.csv"`);
    expect(lignesCsv(r.body)[0]).toBe(
      "title;description;status;priority;assigneeEmail;milestoneName;estimatedHours;startDate;endDate;progress",
    );
  });
});

describe("RG-IMP-08 — l'export neutralise les formules, l'import les restitue", () => {
  const FORMULE = '=HYPERLINK("http://exemple.org")';

  it("RG-IMP-08 — un titre en formule sort préfixé d'une apostrophe, et revient exact au réimport", async () => {
    const source = await projet();
    await prisma.task.create({
      data: { titre: FORMULE, description: "-dépassement", projectId: source.id },
    });
    await prisma.milestone.create({
      data: { nom: "@jalon", projectId: source.id, dateEcheance: date("2026-05-31") },
    });

    const taches = await appel(chef, "GET", `/imports/export/projet/${source.id}/taches`);
    const ligne = lignesCsv(taches.body).find((l) => l.includes("HYPERLINK"));
    expect(ligne?.startsWith(`"'=HYPERLINK(""http://exemple.org"")";'-dépassement;`)).toBe(true);

    const jalons = await appel(chef, "GET", `/imports/export/projet/${source.id}/jalons`);
    expect(lignesCsv(jalons.body).slice(1)).toContain("'@jalon;;2026-05-31");

    const cible = await projet();
    expect((await appel(chef, "POST", `/imports/projet/${cible.id}/jalons`, { contenu: jalons.body })).statusCode).toBe(201);
    expect((await appel(chef, "POST", `/imports/projet/${cible.id}/taches`, { contenu: taches.body })).statusCode).toBe(201);

    const reimportee = await prisma.task.findFirst({ where: { projectId: cible.id, titre: FORMULE } });
    expect(reimportee?.description).toBe("-dépassement");
    expect(await prisma.milestone.findFirst({ where: { projectId: cible.id, nom: "@jalon" } })).not.toBeNull();
  });
});
