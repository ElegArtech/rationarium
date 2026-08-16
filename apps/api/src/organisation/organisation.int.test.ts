import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { creerClient, type PrismaClient } from "@trame/db";
import { OrganisationService, ErreurOrganisation } from "./organisation.service.js";
import { AuditService } from "../commun/audit.service.js";
import { PerimetreService } from "../commun/perimetre.service.js";

/** L-06 — structure organisationnelle. Une règle, un test qui la cite. */

const RACINE_DB = path.resolve(import.meta.dirname, "../../../../packages/db");

let pg: StartedPostgreSqlContainer;
let prisma: PrismaClient;
let orga: OrganisationService;
let perimetres: PerimetreService;
let acteur: string;

const uuid = () => crypto.randomUUID();
const unique = (p: string) => `${p} ${uuid().slice(0, 8)}`;

beforeAll(async () => {
  pg = await new PostgreSqlContainer("postgres:18-alpine").start();
  execFileSync("pnpm", ["exec", "prisma", "migrate", "deploy"], {
    cwd: RACINE_DB,
    env: { ...process.env, DATABASE_URL: pg.getConnectionUri() },
    stdio: "pipe",
  });
  prisma = creerClient(pg.getConnectionUri());
  perimetres = new PerimetreService(prisma as never);
  orga = new OrganisationService(prisma as never, new AuditService(prisma as never), perimetres);

  acteur = uuid();
  await prisma.user.create({
    data: {
      id: acteur, login: `admin-${acteur.slice(0, 6)}`, email: `${acteur.slice(0, 6)}@x.fr`,
      motDePasseHash: "x", prenom: "Karim", nom: "Admin",
    },
  });
}, 240_000);

afterAll(async () => {
  await prisma?.$disconnect();
  await pg?.stop();
});

describe("RG-ORG-01 — une direction avec des départements ne se supprime pas", () => {
  it("le refus NOMME les départements à détacher", async () => {
    const d = await orga.creerDirection({ nom: unique("Direction") }, acteur);
    await orga.creerDepartement({ nom: unique("Informatique"), directionId: d.id }, acteur);
    await orga.creerDepartement({ nom: unique("Finances"), directionId: d.id }, acteur);

    const erreur = await orga.supprimerDirection(d.id, acteur).catch((e: ErreurOrganisation) => e);
    expect(erreur).toBeInstanceOf(ErreurOrganisation);
    expect((erreur as ErreurOrganisation).code).toBe("direction_a_des_departements");
    // Le refus est actionnable : il dit QUOI détacher.
    expect((erreur as ErreurOrganisation).detail?.departements).toHaveLength(2);
  });

  it("une direction vide se supprime", async () => {
    const d = await orga.creerDirection({ nom: unique("Éphémère") }, acteur);
    await expect(orga.supprimerDirection(d.id, acteur)).resolves.toBeUndefined();
  });
});

describe("RG-ORG-02 — supprimer un département supprime ses services", () => {
  it("l'impact est chiffré AVANT la confirmation", async () => {
    const dep = await orga.creerDepartement({ nom: unique("Technique") }, acteur);
    await orga.creerService({ nom: "Réseaux", departementId: dep.id }, acteur);
    await orga.creerService({ nom: "Postes", departementId: dep.id }, acteur);

    const impact = await orga.impactSuppressionDepartement(dep.id);
    expect([...impact.servicesSupprimes].sort()).toEqual(["Postes", "Réseaux"]);
    expect(impact.agentsDetaches).toBe(0);
  });

  it("la suppression emporte réellement les services", async () => {
    const dep = await orga.creerDepartement({ nom: unique("Provisoire") }, acteur);
    const svc = await orga.creerService({ nom: "Un service", departementId: dep.id }, acteur);
    await orga.supprimerDepartement(dep.id, acteur);
    expect(await prisma.service.findUnique({ where: { id: svc.id } })).toBeNull();
  });

  it("et l'avertissement est tracé, pas seulement affiché", async () => {
    const dep = await orga.creerDepartement({ nom: unique("Tracé") }, acteur);
    await orga.creerService({ nom: "Service tracé", departementId: dep.id }, acteur);
    await orga.supprimerDepartement(dep.id, acteur);
    const trace = await prisma.auditLog.findFirst({
      where: { action: "departement.delete", entiteId: dep.id },
    });
    expect(trace).not.toBeNull();
    expect(JSON.stringify(trace!.detail)).toContain("Service tracé");
  });
});

describe("RG-ORG-03 — hiérarchie", () => {
  it("un département peut exister hors direction", async () => {
    const dep = await orga.creerDepartement({ nom: unique("Autonome") }, acteur);
    expect(dep.directionId).toBeNull();
  });

  it("et il reste visible dans l'arborescence", async () => {
    const dep = await orga.creerDepartement({ nom: unique("Visible") }, acteur);
    const p = await perimetres.resoudre(acteur, new Set(["users:manage_any"]));
    const arbre = await orga.arborescence(p);
    expect(arbre.departementsSansDirection.map((d) => d.id)).toContain(dep.id);
  });

  it("un service ne peut PAS exister hors département", async () => {
    await expect(
      orga.creerService({ nom: "Orphelin", departementId: uuid() }, acteur),
    ).rejects.toMatchObject({ code: "service_hors_departement" });
  });
});

describe("RG-GEN-07 — concurrence détectée, jamais écrasée", () => {
  it("une écriture sur une version périmée est refusée", async () => {
    const dep = await orga.creerDepartement({ nom: unique("Concurrent") }, acteur);

    // Premier écrivain : passe, et fait passer la version de 1 à 2.
    await orga.mettreAJour("departement", dep.id, 1, { description: "Première" }, acteur);

    // Second écrivain, parti de la même lecture : refusé.
    const erreur = await orga
      .mettreAJour("departement", dep.id, 1, { description: "Seconde" }, acteur)
      .catch((e: ErreurOrganisation) => e);

    expect((erreur as ErreurOrganisation).code).toBe("conflit_de_version");
    expect((erreur as ErreurOrganisation).detail).toMatchObject({
      versionLue: 1,
      versionActuelle: 2,
    });

    // Et surtout : la première écriture n'a PAS été écrasée.
    const apres = await prisma.departement.findUniqueOrThrow({ where: { id: dep.id } });
    expect(apres.description).toBe("Première");
  });

  it("l'écriture avec la bonne version passe et incrémente", async () => {
    const dep = await orga.creerDepartement({ nom: unique("Séquentiel") }, acteur);
    await orga.mettreAJour("departement", dep.id, 1, { description: "A" }, acteur);
    await orga.mettreAJour("departement", dep.id, 2, { description: "B" }, acteur);
    const apres = await prisma.departement.findUniqueOrThrow({ where: { id: dep.id } });
    expect(apres.description).toBe("B");
    expect(apres.version).toBe(3);
  });
});

describe("Unicité et statistiques", () => {
  it("deux directions ne portent pas le même nom", async () => {
    const nom = unique("Doublon");
    await orga.creerDirection({ nom }, acteur);
    await expect(orga.creerDirection({ nom }, acteur)).rejects.toMatchObject({
      code: "nom_deja_pris",
    });
  });

  it("EX-ORG-06 — effectif et services rattachés", async () => {
    const dep = await orga.creerDepartement({ nom: unique("Compté") }, acteur);
    await orga.creerService({ nom: "S1", departementId: dep.id }, acteur);
    await prisma.user.update({ where: { id: acteur }, data: { departementId: dep.id } });

    const stats = await orga.statistiques(dep.id, "departement");
    expect(stats.services).toBe(1);
    expect(stats.effectif).toBe(1);

    await prisma.user.update({ where: { id: acteur }, data: { departementId: null } });
  });
});

describe("EX-ORG-04 — l'arborescence respecte le périmètre", () => {
  it("un agent ne voit pas les départements hors de son périmètre", async () => {
    const mien = await orga.creerDepartement({ nom: unique("Mien") }, acteur);
    await orga.creerDepartement({ nom: unique("Ailleurs") }, acteur);

    const agent = uuid();
    await prisma.user.create({
      data: {
        id: agent, login: `a-${agent.slice(0, 6)}`, email: `${agent.slice(0, 6)}@x.fr`,
        motDePasseHash: "x", prenom: "Camille", nom: "T", departementId: mien.id,
      },
    });

    const p = await perimetres.resoudre(agent, new Set());
    const arbre = await orga.arborescence(p);
    const vus = arbre.departementsSansDirection.map((d) => d.id);
    expect(vus).toEqual([mien.id]);
  });
});
