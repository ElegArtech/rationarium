import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { execFileSync } from "node:child_process";
import path from "node:path";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import type { PrismaClient } from "@rationarium/db";
import { modeleParCode } from "@rationarium/contracts";

/**
 * `RG-USR-09` appliquée aux rôles — **nul ne compose un rôle plus large que
 * soi.**
 *
 * Le défaut (AUD-01) : `PUT /administration/roles/:id/permissions` vérifiait
 * le catalogue, le rôle système et la version, jamais QUI écrivait. Un porteur
 * de `users:manage_permissions` qui n'est pas administrateur ajoutait à son
 * PROPRE rôle les permissions qu'il n'avait pas — `users:manage_any`,
 * `audit:read`, tout le catalogue — sans attribuer quoi que ce soit, donc sans
 * jamais croiser le contrôle d'attribution de `RG-USR-09`. Même chemin par
 * `POST /administration/roles` dupliqué depuis le modèle `ADMIN`.
 *
 * Exercé par HTTP, avec la vraie connexion : les permissions de l'acteur
 * viennent de la garde globale.
 */

const RACINE_DB = path.resolve(import.meta.dirname, "../../../../packages/db");
const MDP = "Motdepasse1!";
const REFUS = "erreurs:rolePlusPrivilegie";

/** Un gestionnaire des rôles qui n'est pas administrateur. */
const GESTIONNAIRE = [
  ...modeleParCode("BASIC_USER")!.permissions,
  "users:read", "users:update",
  "users:manage_roles", "users:manage_permissions",
];

let pg: StartedPostgreSqlContainer;
let app: NestFastifyApplication;
let prisma: PrismaClient;
let jetonGestionnaire: string;
let jetonAdmin: string;
let roleGestionnaire: string;

const appel = (methode: string, url: string, jeton: string, corps?: unknown) =>
  app.inject({
    method: methode as "GET",
    url,
    cookies: { rationarium_session: jeton },
    ...(corps === undefined ? {} : { payload: corps as object }),
  });

const permissionsDe = async (roleId: string) =>
  (await prisma.rolePermission.findMany({ where: { roleId }, select: { permission: true } }))
    .map((p) => p.permission)
    .sort();

const versionDe = async (roleId: string) =>
  (await prisma.role.findUniqueOrThrow({ where: { id: roleId } })).version;

async function creerRole(code: string, permissions: readonly string[]) {
  const r = await prisma.role.create({
    data: {
      code, nom: code,
      permissions: { create: [...new Set(permissions)].map((permission) => ({ permission })) },
    },
  });
  return r.id;
}

beforeAll(async () => {
  pg = await new PostgreSqlContainer("postgres:18-alpine").start();
  execFileSync("pnpm", ["exec", "prisma", "migrate", "deploy"], {
    cwd: RACINE_DB,
    env: { ...process.env, DATABASE_URL: pg.getConnectionUri() },
    stdio: "pipe",
  });
  process.env.DATABASE_URL = pg.getConnectionUri();

  const { creerApplication } = await import("../main.js");
  const { creerClient } = await import("@rationarium/db");
  const { hacherMotDePasse } = await import("../auth/mots-de-passe.js");
  app = await creerApplication();
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  prisma = creerClient(pg.getConnectionUri());

  const departement = await prisma.departement.create({ data: { nom: "Département" } });
  roleGestionnaire = await creerRole("AUD01_GESTIONNAIRE", GESTIONNAIRE);
  const roleAdmin = await creerRole("ADMIN", modeleParCode("ADMIN")!.permissions);

  const hash = await hacherMotDePasse(MDP);
  const connecter = async (login: string, roleId: string) => {
    await prisma.user.create({
      data: {
        login, email: `${login}@exemple.test`, motDePasseHash: hash, motDePasseAChanger: false,
        prenom: login, nom: "Rôles", departementId: departement.id, roleId,
      },
    });
    const r = await app.inject({
      method: "POST", url: "/api/auth/login", payload: { identifiant: login, motDePasse: MDP },
    });
    expect(r.statusCode).toBe(200);
    return r.cookies.find((c) => c.name === "rationarium_session")!.value;
  };
  jetonGestionnaire = await connecter("aud01.gestionnaire", roleGestionnaire);
  jetonAdmin = await connecter("aud01.admin", roleAdmin);
}, 300_000);

afterAll(async () => {
  await prisma?.$disconnect();
  await app?.close();
  await pg?.stop();
});

describe("RG-USR-09 — nul ne compose un rôle portant des permissions qu'il n'a pas", () => {
  it("RG-USR-09 — le gestionnaire n'ajoute pas à son propre rôle une permission qu'il n'a pas", async () => {
    const avant = await permissionsDe(roleGestionnaire);
    const reponse = await appel(
      "PUT", `/api/administration/roles/${roleGestionnaire}/permissions`, jetonGestionnaire,
      { permissions: [...avant, "users:manage_any", "audit:read"], version: await versionDe(roleGestionnaire) },
    );
    expect(reponse.statusCode).toBe(403);
    expect(reponse.json()).toMatchObject({ cle: REFUS });
    expect(await permissionsDe(roleGestionnaire)).toEqual(avant);
  });

  it("RG-USR-09 — ni sur un rôle sur mesure qu'il attribuerait ensuite", async () => {
    const roleId = await creerRole("AUD01_VIDE", []);
    const reponse = await appel(
      "PUT", `/api/administration/roles/${roleId}/permissions`, jetonGestionnaire,
      { permissions: ["users:read", "settings:update"], version: await versionDe(roleId) },
    );
    expect(reponse.statusCode).toBe(403);
    expect(reponse.json()).toMatchObject({ cle: REFUS });
    expect(await permissionsDe(roleId)).toEqual([]);
  });

  it("RG-USR-09 — il ne modifie pas un rôle qui porte déjà des permissions qu'il n'a pas", async () => {
    const roleId = await creerRole("AUD01_LARGE", ["users:read", "audit:read"]);
    const reponse = await appel(
      "PUT", `/api/administration/roles/${roleId}/permissions`, jetonGestionnaire,
      { permissions: ["users:read"], version: await versionDe(roleId) },
    );
    expect(reponse.statusCode).toBe(403);
    expect(reponse.json()).toMatchObject({ cle: REFUS });
    expect(await permissionsDe(roleId)).toEqual(["audit:read", "users:read"]);
  });

  it("RG-USR-09 — il ne duplique pas le modèle ADMIN", async () => {
    const reponse = await appel("POST", "/api/administration/roles", jetonGestionnaire, {
      code: "AUDIT_COPIE_ADMIN", nom: "Copie", depuisModele: "ADMIN",
    });
    expect(reponse.statusCode).toBe(403);
    expect(reponse.json()).toMatchObject({ cle: REFUS });
    expect(await prisma.role.findUnique({ where: { code: "AUDIT_COPIE_ADMIN" } })).toBeNull();
  });

  it("RG-USR-09 — le refus est ciblé : un rôle qu'il couvre se compose et se duplique", async () => {
    const roleId = await creerRole("AUD01_COUVERT", []);
    const compose = await appel(
      "PUT", `/api/administration/roles/${roleId}/permissions`, jetonGestionnaire,
      { permissions: ["users:read", "projects:read"], version: await versionDe(roleId) },
    );
    expect(compose.statusCode).toBe(200);
    expect(await permissionsDe(roleId)).toEqual(["projects:read", "users:read"]);

    const copie = await appel("POST", "/api/administration/roles", jetonGestionnaire, {
      code: "AUDIT_COPIE_BASE", nom: "Copie de base", depuisModele: "BASIC_USER",
    });
    expect(copie.statusCode).toBe(201);
  });

  it("RG-USR-09 — l'administrateur compose un rôle complet : l'égalité de droits n'est pas un refus", async () => {
    const roleId = await creerRole("AUD01_PAR_ADMIN", []);
    const reponse = await appel(
      "PUT", `/api/administration/roles/${roleId}/permissions`, jetonAdmin,
      { permissions: ["users:manage_any", "audit:read"], version: await versionDe(roleId) },
    );
    expect(reponse.statusCode).toBe(200);
    expect(await permissionsDe(roleId)).toEqual(["audit:read", "users:manage_any"]);
  });
});

describe("RG-ADM-02 — les rôles système ne se modifient pas, même par HTTP et même par l'ADMIN", () => {
  it("RG-ADM-02 — une requête forgée ne vide, ne renomme ni ne supprime un rôle système", async () => {
    const systeme = await prisma.role.create({
      data: {
        code: "AUDIT_SYSTEME", nom: "Système", systeme: true,
        permissions: { create: [{ permission: "users:read" }] },
      },
    });
    const vider = await appel(
      "PUT", `/api/administration/roles/${systeme.id}/permissions`, jetonAdmin,
      { permissions: [], version: systeme.version },
    );
    expect(vider.statusCode).toBe(403);
    expect(vider.json()).toMatchObject({ cle: "erreurs:roleSystemeNonModifiable" });

    const renommer = await appel("PATCH", `/api/administration/roles/${systeme.id}`, jetonAdmin, {
      nom: "Autre", version: systeme.version,
    });
    expect(renommer.json()).toMatchObject({ cle: "erreurs:roleSystemeNonRenommable" });

    const supprimer = await appel("DELETE", `/api/administration/roles/${systeme.id}`, jetonAdmin, {
      version: systeme.version,
    });
    expect(supprimer.json()).toMatchObject({ cle: "erreurs:roleSystemeNonSupprimable" });

    expect(await permissionsDe(systeme.id)).toEqual(["users:read"]);
    expect((await prisma.role.findUniqueOrThrow({ where: { id: systeme.id } })).nom).toBe("Système");
  });
});
