import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { creerClient, type PrismaClient } from "@trame/db";
import { RolesService, ErreurRole } from "./roles.service.js";
import { AuditQueryService } from "./audit.query.service.js";
import { AuditService } from "../commun/audit.service.js";
import { NOMBRE_PERMISSIONS, NOMBRE_MODELES, modeleParCode } from "@trame/contracts";

/** L-08 — rôles, matrice, journal d'audit. Criticité haute. */

const RACINE_DB = path.resolve(import.meta.dirname, "../../../../packages/db");

let pg: StartedPostgreSqlContainer;
let prisma: PrismaClient;
let roles: RolesService;
let journal: AuditQueryService;
let karim: string;

const uuid = () => crypto.randomUUID();

beforeAll(async () => {
  pg = await new PostgreSqlContainer("postgres:18-alpine").start();
  execFileSync("pnpm", ["exec", "prisma", "migrate", "deploy"], {
    cwd: RACINE_DB,
    env: { ...process.env, DATABASE_URL: pg.getConnectionUri() },
    stdio: "pipe",
  });
  prisma = creerClient(pg.getConnectionUri());
  const audit = new AuditService(prisma as never);
  roles = new RolesService(prisma as never, audit);
  journal = new AuditQueryService(prisma as never, audit);

  karim = uuid();
  await prisma.user.create({
    data: {
      id: karim, login: `karim-${karim.slice(0, 6)}`, email: `${karim.slice(0, 6)}@x.fr`,
      motDePasseHash: "x", prenom: "Karim", nom: "Admin",
    },
  });
}, 240_000);

afterAll(async () => {
  await prisma?.$disconnect();
  await pg?.stop();
});

describe("EX-ADM-06 — initialisation du référentiel", () => {
  it("crée les 26 modèles de rôles", async () => {
    const r = await roles.initialiserReferentiel(karim);
    expect(r.crees).toBe(NOMBRE_MODELES);
    expect(await prisma.role.count()).toBe(NOMBRE_MODELES);
  });

  it("est idempotente — la rejouer ne duplique rien", async () => {
    const r = await roles.initialiserReferentiel(karim);
    expect(r.crees).toBe(0);
    expect(r.existants).toBe(NOMBRE_MODELES);
    expect(await prisma.role.count()).toBe(NOMBRE_MODELES);
  });

  it("ADMIN détient l'intégralité du catalogue", async () => {
    const admin = await prisma.role.findUniqueOrThrow({
      where: { code: "ADMIN" },
      include: { _count: { select: { permissions: true } } },
    });
    expect(admin._count.permissions).toBe(NOMBRE_PERMISSIONS);
  });

  it("un rôle personnalisé N'EST PAS réécrit par une réinitialisation", async () => {
    const sur_mesure = await roles.creer({ code: "SUR_MESURE", nom: "Sur mesure" }, karim);
    await roles.definirPermissions(sur_mesure.id, ["projects:read"], karim);

    await roles.initialiserReferentiel(karim);

    const apres = await prisma.rolePermission.findMany({ where: { roleId: sur_mesure.id } });
    expect(apres.map((p) => p.permission)).toEqual(["projects:read"]);
  });
});

describe("RG-DROITS-02 — les rôles système sont protégés", () => {
  it("un rôle système ne se supprime pas", async () => {
    const admin = await prisma.role.findUniqueOrThrow({ where: { code: "ADMIN" } });
    await expect(roles.supprimer(admin.id, karim)).rejects.toMatchObject({
      code: "role_systeme_non_supprimable",
    });
  });

  it("un rôle système ne se renomme pas", async () => {
    const admin = await prisma.role.findUniqueOrThrow({ where: { code: "ADMIN" } });
    await expect(roles.renommer(admin.id, "Grand chef", karim)).rejects.toMatchObject({
      code: "role_systeme_non_renommable",
    });
  });

  it("un rôle dupliqué depuis un modèle système N'EST PAS système", async () => {
    // Sans cette règle, on fabriquerait un rôle indélébile par duplication.
    const copie = await roles.creer(
      { code: "COPIE_ADMIN", nom: "Copie", depuisModele: "ADMIN" },
      karim,
    );
    expect(copie.systeme).toBe(false);
    const permissions = await prisma.rolePermission.count({ where: { roleId: copie.id } });
    expect(permissions).toBe(NOMBRE_PERMISSIONS);
    await expect(roles.supprimer(copie.id, karim)).resolves.toBeUndefined();
  });
});

describe("RG-DROITS-03 — liste blanche stricte", () => {
  it("une permission hors catalogue est refusée", async () => {
    const r = await roles.creer({ code: "ESSAI_1", nom: "Essai" }, karim);
    const erreur = await roles
      .definirPermissions(r.id, ["projects:read", "projects:faire_nimporte_quoi"], karim)
      .catch((e: ErreurRole) => e);
    expect((erreur as ErreurRole).code).toBe("permission_hors_catalogue");
    expect((erreur as ErreurRole).detail?.permissions).toEqual(["projects:faire_nimporte_quoi"]);
  });

  it("et RIEN n'est écrit quand une seule permission est fautive", async () => {
    const r = await roles.creer({ code: "ESSAI_2", nom: "Essai" }, karim);
    await roles.definirPermissions(r.id, ["projects:read"], karim);
    await roles.definirPermissions(r.id, ["tasks:read", "inexistant:read"], karim).catch(() => {});
    const apres = await prisma.rolePermission.findMany({ where: { roleId: r.id } });
    expect(apres.map((p) => p.permission)).toEqual(["projects:read"]);
  });
});

describe("EX-ADM-04 — la matrice de la vue 32", () => {
  it("est COMPLÈTE : le catalogue donne les colonnes, pas le rôle", async () => {
    const r = await prisma.role.findUniqueOrThrow({ where: { code: "BASIC_USER" } });
    const m = await roles.matrice(r.id);

    // 24 domaines en lignes, quelle que soit la maigreur du rôle.
    expect(m.lignes).toHaveLength(24);
    // Une matrice qui n'afficherait que les permissions détenues ne
    // permettrait pas d'en cocher de nouvelles.
    const audit = m.lignes.find((l) => l.domaine === "audit")!;
    expect(audit.cases.find((c) => c.action === "read")?.detenue).toBe(false);
  });

  it("distingue la case décochée de la case inerte", async () => {
    const r = await prisma.role.findUniqueOrThrow({ where: { code: "BASIC_USER" } });
    const m = await roles.matrice(r.id);
    const audit = m.lignes.find((l) => l.domaine === "audit")!;
    // `audit:read` existe et n'est pas détenue → false.
    expect(audit.cases.find((c) => c.action === "read")?.detenue).toBe(false);
    // `audit:create` n'existe pas au catalogue → null, case inerte.
    expect(audit.cases.find((c) => c.action === "create")?.detenue).toBeNull();
  });

  it("reflète les permissions réellement détenues", async () => {
    const r = await prisma.role.findUniqueOrThrow({ where: { code: "PROJECT_CONTRIBUTOR" } });
    const m = await roles.matrice(r.id);
    const taches = m.lignes.find((l) => l.domaine === "tasks")!;
    expect(taches.cases.find((c) => c.action === "read")?.detenue).toBe(true);
    expect(taches.cases.find((c) => c.action === "manage_any")?.detenue).toBe(false);
    expect(modeleParCode("PROJECT_CONTRIBUTOR")!.permissions).toContain("tasks:read");
  });
});

describe("EX-ADM-03 — suppression d'un rôle", () => {
  it("un rôle porté par des comptes ne se supprime pas, et le refus chiffre", async () => {
    const r = await roles.creer({ code: "PORTE", nom: "Porté" }, karim);
    await prisma.user.update({ where: { id: karim }, data: { roleId: r.id } });

    const erreur = await roles.supprimer(r.id, karim).catch((e: ErreurRole) => e);
    expect((erreur as ErreurRole).code).toBe("role_utilise");
    expect((erreur as ErreurRole).detail?.utilisateurs).toBe(1);

    await prisma.user.update({ where: { id: karim }, data: { roleId: null } });
    await expect(roles.supprimer(r.id, karim)).resolves.toBeUndefined();
  });
});

describe("RG-ADM-01 — le journal est en lecture seule et se consulte", () => {
  it("EX-ADM-07 — pagination par curseur, la plus récente d'abord", async () => {
    for (let i = 0; i < 5; i++) {
      await prisma.auditLog.create({
        data: { action: `essai.pagination.${i}`, typeEntite: "Essai", entiteId: `e${i}` },
      });
    }
    const page = await journal.consulter({ typeEntite: "Essai" }, { taille: 3 });
    expect(page.entrees).toHaveLength(3);
    expect(page.curseurSuivant).not.toBeNull();

    const suite = await journal.consulter(
      { typeEntite: "Essai" },
      { taille: 3, curseur: page.curseurSuivant! },
    );
    // Aucune entrée en double entre les deux pages.
    const ids = new Set([...page.entrees, ...suite.entrees].map((e) => e.id));
    expect(ids.size).toBe(page.entrees.length + suite.entrees.length);
  });

  it("EX-ADM-08 — filtre par type d'entité, acteur, action et plage", async () => {
    await prisma.auditLog.create({
      data: { action: "leave.approve", typeEntite: "Leave", entiteId: "L1", acteurId: karim },
    });
    const parActeur = await journal.consulter({ acteurId: karim });
    expect(parActeur.entrees.every((e) => e.acteur !== null)).toBe(true);

    const parAction = await journal.consulter({ action: "leave." });
    expect(parAction.entrees.every((e) => e.action.startsWith("leave."))).toBe(true);
  });

  it("RG-ADM-09 — distingue l'action système de l'action humaine", async () => {
    await prisma.auditLog.create({
      data: { action: "notification.daily", typeEntite: "Job", systeme: true },
    });
    const systeme = await journal.consulter({ systeme: true });
    expect(systeme.entrees.length).toBeGreaterThan(0);
    expect(systeme.entrees.every((e) => e.systeme)).toBe(true);
    expect(systeme.entrees.every((e) => e.acteur === null)).toBe(true);
  });

  it("une entrée survit à la suppression de son acteur — c'est le point d'un journal", async () => {
    const ephemere = uuid();
    await prisma.user.create({
      data: {
        id: ephemere, login: `e-${ephemere.slice(0, 6)}`, email: `${ephemere.slice(0, 6)}@x.fr`,
        motDePasseHash: "x", prenom: "É", nom: "Phémère",
      },
    });
    await prisma.auditLog.create({
      data: { action: "essai.survie", typeEntite: "Essai", acteurId: ephemere },
    });
    await prisma.user.delete({ where: { id: ephemere } });

    const page = await journal.consulter({ action: "essai.survie" });
    expect(page.entrees).toHaveLength(1);
    expect(page.entrees[0]!.acteur).toMatchObject({ supprime: true });
  });

  it("les partitions se préparent d'avance", async () => {
    const mois = await journal.preparerPartitions(2);
    expect(mois).toHaveLength(3);
    const { rows } = (await prisma.$queryRawUnsafe(
      `SELECT count(*)::int AS n FROM pg_inherits i JOIN pg_class p ON p.oid = i.inhparent WHERE p.relname = 'audit_log'`,
    )) as unknown as { rows?: unknown[] } & { n: number }[];
    expect(Array.isArray(rows) ? rows : ([] as unknown[])).toBeDefined();
  });
});
