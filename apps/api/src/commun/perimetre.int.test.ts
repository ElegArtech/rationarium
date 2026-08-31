import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { creerClient, type PrismaClient } from "@rationarium/db";
import { PerimetreService } from "./perimetre.service.js";

/**
 * L-06 — le cloisonnement par périmètre, criticité haute.
 *
 * **Un défaut ici est silencieux** : une lecture hors périmètre ne produit
 * aucune erreur, elle produit des données. Ces tests cherchent donc autant ce
 * qui doit être VISIBLE que ce qui doit être INVISIBLE — le second est le plus
 * important, et le plus facile à oublier.
 *
 * Décor : une direction, deux départements, trois services, cinq agents.
 */

const RACINE_DB = path.resolve(import.meta.dirname, "../../../../packages/db");

let pg: StartedPostgreSqlContainer;
let prisma: PrismaClient;
let perimetre: PerimetreService;

const decor = {
  direction: "", deptA: "", deptB: "",
  svcA1: "", svcA2: "", svcB1: "",
  camille: "", fatou: "", hugo: "", ines: "", karim: "",
};

const uuid = () => crypto.randomUUID();

async function agent(nom: string, departementId?: string | null) {
  const id = uuid();
  await prisma.user.create({
    data: {
      id,
      login: `${nom}-${id.slice(0, 6)}`,
      email: `${nom}-${id.slice(0, 6)}@x.fr`,
      motDePasseHash: "x",
      prenom: nom,
      nom: "Test",
      ...(departementId ? { departementId } : {}),
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
  perimetre = new PerimetreService(prisma as never);

  decor.direction = uuid();
  await prisma.direction.create({ data: { id: decor.direction, nom: "Direction générale" } });

  decor.deptA = uuid();
  decor.deptB = uuid();
  await prisma.departement.create({
    data: { id: decor.deptA, nom: "Systèmes d'information", directionId: decor.direction },
  });
  await prisma.departement.create({
    data: { id: decor.deptB, nom: "Ressources humaines", directionId: decor.direction },
  });

  decor.svcA1 = uuid();
  decor.svcA2 = uuid();
  decor.svcB1 = uuid();
  await prisma.service.create({ data: { id: decor.svcA1, nom: "Études", departementId: decor.deptA } });
  await prisma.service.create({ data: { id: decor.svcA2, nom: "Exploitation", departementId: decor.deptA } });
  await prisma.service.create({ data: { id: decor.svcB1, nom: "Paie", departementId: decor.deptB } });

  decor.camille = await agent("camille", decor.deptA);
  decor.fatou = await agent("fatou", decor.deptA);
  decor.hugo = await agent("hugo", decor.deptB);
  decor.ines = await agent("ines", decor.deptA);
  decor.karim = await agent("karim", decor.deptA);

  // Fatou manage le service Études.
  await prisma.service.update({ where: { id: decor.svcA1 }, data: { managerId: decor.fatou } });
  // Inès dirige la direction entière.
  await prisma.direction.update({
    where: { id: decor.direction },
    data: { responsableId: decor.ines },
  });
}, 240_000);

afterAll(async () => {
  await prisma?.$disconnect();
  await pg?.stop();
});

const sans = new Set<string>();
const avec = (...p: string[]) => new Set(p);

describe("RG-SCOPE-01 — périmètre par défaut", () => {
  it("un agent voit son département de rattachement", async () => {
    const p = await perimetre.resoudre(decor.camille, sans);
    expect(p.global).toBe(false);
    expect([...p.departements]).toEqual([decor.deptA]);
  });

  it("et ne voit PAS un autre département", async () => {
    const p = await perimetre.resoudre(decor.camille, sans);
    expect(p.departements.has(decor.deptB)).toBe(false);
    expect(p.utilisateurs.has(decor.hugo)).toBe(false);
  });

  it("il voit les agents de son département", async () => {
    const p = await perimetre.resoudre(decor.camille, sans);
    expect(p.utilisateurs.has(decor.fatou)).toBe(true);
    expect(p.utilisateurs.has(decor.karim)).toBe(true);
  });

  it("il se voit toujours lui-même, même sans département", async () => {
    const orphelin = await agent("orphelin", null);
    const p = await perimetre.resoudre(orphelin, sans);
    expect(p.departements.size).toBe(0);
    // Sans cette garantie, un agent sans rattachement ne pourrait plus poser
    // de congé : il ne se verrait pas lui-même.
    expect(p.utilisateurs.has(orphelin)).toBe(true);
  });

  it("les départements des services élargissent le périmètre", async () => {
    // Un agent du département A, membre d'un service du département B.
    const transverse = await agent("transverse", decor.deptA);
    await prisma.userService.create({
      data: { userId: transverse, serviceId: decor.svcB1 },
    });
    const p = await perimetre.resoudre(transverse, sans);
    expect(p.departements.has(decor.deptA)).toBe(true);
    expect(p.departements.has(decor.deptB)).toBe(true);
    expect(p.utilisateurs.has(decor.hugo)).toBe(true);
  });

  it("un manager de service voit le département de son service", async () => {
    const p = await perimetre.resoudre(decor.fatou, sans);
    expect(p.departements.has(decor.deptA)).toBe(true);
  });

  it("un responsable de direction voit TOUTE la direction", async () => {
    const p = await perimetre.resoudre(decor.ines, sans);
    expect(p.departements.has(decor.deptA)).toBe(true);
    expect(p.departements.has(decor.deptB)).toBe(true);
    expect(p.utilisateurs.has(decor.hugo)).toBe(true);
  });
});

describe("RG-SCOPE-03 — la gestion globale court-circuite le périmètre", () => {
  it("un détenteur de users:manage_any voit tout", async () => {
    const p = await perimetre.resoudre(decor.camille, avec("users:manage_any"));
    expect(p.global).toBe(true);
    // Périmètre global : les ensembles sont vides parce qu'ils ne filtrent rien.
    expect(perimetre.filtreUtilisateur(p)).toEqual({});
    expect(perimetre.filtreParAgent(p)).toEqual({});
  });

  it("une permission ordinaire ne suffit pas", async () => {
    const p = await perimetre.resoudre(decor.camille, avec("users:read", "projects:read"));
    expect(p.global).toBe(false);
  });
});

describe("RG-SCOPE-04 — les tâches confidentielles", () => {
  it("ne sont PAS lisibles du seul fait d'y être assigné", async () => {
    const p = await perimetre.resoudre(decor.camille, sans);
    const filtre = perimetre.filtreTache(p, sans);
    // La clause exclut explicitement le confidentiel.
    expect(JSON.stringify(filtre)).toContain('"confidentielle":false');
  });

  it("le deviennent avec la permission explicite", async () => {
    const p = await perimetre.resoudre(decor.camille, avec("tasks:read_confidential"));
    expect(p.confidentiel).toBe(true);
    const filtre = perimetre.filtreTache(p, avec("tasks:read_confidential"));
    expect(JSON.stringify(filtre)).not.toContain("confidentielle");
  });

  it("un périmètre global voit le confidentiel", async () => {
    const p = await perimetre.resoudre(decor.camille, avec("tasks:manage_any"));
    expect(p.confidentiel).toBe(true);
  });
});

describe("RG-SCOPE-02 — visibilité des projets", () => {
  it("restreinte au créateur, chef, sponsor et membres", async () => {
    const p = await perimetre.resoudre(decor.camille, sans);
    const filtre = perimetre.filtreProjet(p, sans);
    const rendu = JSON.stringify(filtre);
    expect(rendu).toContain("createurId");
    expect(rendu).toContain("chefId");
    expect(rendu).toContain("sponsorId");
    expect(rendu).toContain("membres");
  });

  it("projects:manage_any voit tout", async () => {
    const p = await perimetre.resoudre(decor.camille, sans);
    expect(perimetre.filtreProjet(p, avec("projects:manage_any"))).toEqual({});
  });

  it("l'appartenance à un projet ne découle PAS du rattachement hiérarchique", async () => {
    // Un projet créé par Hugo, dans un autre département. Camille est dans le
    // périmètre organisationnel de personne qui la relie à ce projet.
    const projet = uuid();
    await prisma.project.create({
      data: {
        id: projet, nom: `Projet ${projet.slice(0, 6)}`,
        dateDebut: new Date("2026-01-01"), dateFin: new Date("2026-12-31"),
        createurId: decor.hugo,
      },
    });
    const p = await perimetre.resoudre(decor.camille, sans);
    const visibles = await prisma.project.findMany({
      where: { ...perimetre.filtreProjet(p, sans), id: projet },
    });
    expect(visibles).toEqual([]);
  });
});

describe("le prédicat filtre réellement, en base", () => {
  it("une lecture d'utilisateurs filtrée ne rend que le périmètre", async () => {
    const p = await perimetre.resoudre(decor.camille, sans);
    const vus = await prisma.user.findMany({
      where: perimetre.filtreUtilisateur(p),
      select: { id: true },
    });
    const ids = new Set(vus.map((u) => u.id));
    expect(ids.has(decor.fatou)).toBe(true);
    expect(ids.has(decor.hugo)).toBe(false);
  });

  it("la même lecture sans prédicat rendrait tout — c'est ce qu'on empêche", async () => {
    const tous = await prisma.user.count();
    const p = await perimetre.resoudre(decor.camille, sans);
    const vus = await prisma.user.count({ where: perimetre.filtreUtilisateur(p) });
    expect(vus).toBeLessThan(tous);
  });
});
