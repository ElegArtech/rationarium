import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { execFileSync } from "node:child_process";
import path from "node:path";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import type { PrismaClient } from "@rationarium/db";

const RACINE_DB = path.resolve(import.meta.dirname, "../../../../packages/db");
const MDP = "Motdepasse1!";

let pg: StartedPostgreSqlContainer;
let app: NestFastifyApplication;
let prisma: PrismaClient;
let jetonGestionnaire: string;
let jetonSansPermission: string;
let departementB: string;
let utilisateurA: { id: string; version: number };
let utilisateurB: { id: string; version: number };
let serviceB: { id: string; version: number };
let roleModifiable: { id: string; version: number };

const appel = (methode: string, url: string, jeton: string, corps?: unknown) => app.inject({
  method: methode as "GET",
  url,
  cookies: { rationarium_session: jeton },
  ...(corps === undefined ? {} : { payload: corps as object }),
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
  const { creerClient } = await import("@rationarium/db");
  const { hacherMotDePasse } = await import("../auth/mots-de-passe.js");
  app = await creerApplication();
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  prisma = creerClient(pg.getConnectionUri());

  const directionA = await prisma.direction.create({ data: { nom: "Direction A" } });
  const directionB = await prisma.direction.create({ data: { nom: "Direction B" } });
  const deptA = await prisma.departement.create({ data: { nom: "Département A", directionId: directionA.id } });
  const deptB = await prisma.departement.create({ data: { nom: "Département B", directionId: directionB.id } });
  departementB = deptB.id;
  serviceB = await prisma.service.create({ data: { nom: "Service B", departementId: deptB.id } });

  const permissions = [
    "users:create", "users:update", "users:deactivate", "users:delete_permanently", "users:reset_password",
    "users:manage_roles", "users:manage_permissions",
    "directions:create", "directions:update", "directions:delete",
    "departments:create", "departments:update", "departments:delete",
    "services:create", "services:update", "services:delete",
  ];
  const roleGestionnaire = await prisma.role.create({
    data: {
      code: "RM09_GESTIONNAIRE",
      nom: "Gestionnaire RM09",
      permissions: { create: permissions.map((permission) => ({ permission })) },
    },
  });
  const roleVide = await prisma.role.create({ data: { code: "RM09_SANS_PERMISSION", nom: "Sans permission" } });
  roleModifiable = await prisma.role.create({ data: { code: "RM09_MODIFIABLE", nom: "Rôle modifiable" } });

  const hash = await hacherMotDePasse(MDP);
  const gestionnaire = await prisma.user.create({
    data: {
      login: "rm09.gestionnaire", email: "rm09.gestionnaire@example.test", motDePasseHash: hash,
      motDePasseAChanger: false, prenom: "Gestionnaire", nom: "A", departementId: deptA.id,
      roleId: roleGestionnaire.id,
    },
  });
  await prisma.user.create({
    data: {
      login: "rm09.sans.permission", email: "rm09.sans.permission@example.test", motDePasseHash: hash,
      motDePasseAChanger: false, prenom: "Sans", nom: "Permission", departementId: deptA.id,
      roleId: roleVide.id,
    },
  });
  utilisateurA = await prisma.user.create({
    data: {
      login: "rm09.cible.a", email: "rm09.cible.a@example.test", motDePasseHash: hash,
      prenom: "Cible", nom: "A", departementId: deptA.id,
    },
  });
  utilisateurB = await prisma.user.create({
    data: {
      login: "rm09.cible.b", email: "rm09.cible.b@example.test", motDePasseHash: hash,
      prenom: "Cible", nom: "B", departementId: deptB.id,
    },
  });

  const connecter = async (identifiant: string) => {
    const reponse = await app.inject({
      method: "POST", url: "/api/auth/login", payload: { identifiant, motDePasse: MDP },
    });
    expect(reponse.statusCode).toBe(200);
    return reponse.cookies.find((cookie) => cookie.name === "rationarium_session")!.value;
  };
  jetonGestionnaire = await connecter(gestionnaire.login);
  jetonSansPermission = await connecter("rm09.sans.permission");
}, 300_000);

afterAll(async () => {
  await prisma?.$disconnect();
  await app?.close();
  await pg?.stop();
});

describe("RG-GEN-07 — concurrence optimiste HTTP sur les rôles", () => {
  it("RG-GEN-07 — PATCH rôle exige la version et refuse en 409 l'état périmé", async () => {
    const premier = await appel("PATCH", `/api/administration/roles/${roleModifiable.id}`, jetonGestionnaire, {
      nom: "Premier nom", version: roleModifiable.version,
    });
    expect(premier.statusCode).toBe(200);

    const perime = await appel("PATCH", `/api/administration/roles/${roleModifiable.id}`, jetonGestionnaire, {
      nom: "Écrasement interdit", version: roleModifiable.version,
    });
    expect(perime.statusCode).toBe(409);
    expect(perime.json()).toMatchObject({ cle: "erreurs:conflitDeVersion" });
    expect((await prisma.role.findUniqueOrThrow({ where: { id: roleModifiable.id } })).nom).toBe("Premier nom");
  });

  it("EX-ADM-04 / RG-GEN-07 — la matrice périmée est refusée sans remplacement partiel", async () => {
    const version = (await prisma.role.findUniqueOrThrow({ where: { id: roleModifiable.id } })).version;
    const premier = await appel("PUT", `/api/administration/roles/${roleModifiable.id}/permissions`, jetonGestionnaire, {
      permissions: ["projects:read"], version,
    });
    expect(premier.statusCode).toBe(200);

    const perime = await appel("PUT", `/api/administration/roles/${roleModifiable.id}/permissions`, jetonGestionnaire, {
      permissions: ["tasks:read"], version,
    });
    expect(perime.statusCode).toBe(409);
    expect(perime.json()).toMatchObject({ cle: "erreurs:conflitDeVersion" });
    const permissions = await prisma.rolePermission.findMany({ where: { roleId: roleModifiable.id } });
    expect(permissions.map((p) => p.permission)).toEqual(["projects:read"]);
  });

  it("RG-GEN-07 — les écritures de rôle sans version sont refusées à la frontière HTTP", async () => {
    const renommer = await appel("PATCH", `/api/administration/roles/${roleModifiable.id}`, jetonGestionnaire, { nom: "Sans version" });
    const matrice = await appel("PUT", `/api/administration/roles/${roleModifiable.id}/permissions`, jetonGestionnaire, { permissions: [] });
    expect(renommer.statusCode).toBe(400);
    expect(matrice.statusCode).toBe(400);
  });
});

describe("RG-SCOPE-01 — permission puis périmètre sur les écritures RM09", () => {
  it("RG-SCOPE-01 — une modification d'utilisateur hors périmètre est refusée et n'écrit rien", async () => {
    const reponse = await appel("PATCH", `/api/utilisateurs/${utilisateurB.id}`, jetonGestionnaire, {
      version: utilisateurB.version, nom: "Fuite",
    });
    expect(reponse.statusCode).toBe(403);
    expect(reponse.json()).toMatchObject({ cle: "erreurs:horsPerimetre" });
    expect((await prisma.user.findUniqueOrThrow({ where: { id: utilisateurB.id } })).nom).toBe("B");
  });

  it("RG-SCOPE-01 — créer un utilisateur dans un département hors périmètre est refusé", async () => {
    const reponse = await appel("POST", "/api/utilisateurs", jetonGestionnaire, {
      prenom: "Intrus", nom: "B", email: "intrus.b@example.test", login: "intrus.b",
      motDePasse: MDP, departementId: departementB,
    });
    expect(reponse.statusCode).toBe(403);
    expect(await prisma.user.findUnique({ where: { login: "intrus.b" } })).toBeNull();
  });

  it("RG-SCOPE-01 — modifier un service hors périmètre est refusé et n'écrit rien", async () => {
    const reponse = await appel("PATCH", `/api/organisation/services/${serviceB.id}`, jetonGestionnaire, {
      version: serviceB.version, nom: "Service divulgué",
    });
    expect(reponse.statusCode).toBe(403);
    expect(reponse.json()).toMatchObject({ cle: "erreurs:horsPerimetre" });
    expect((await prisma.service.findUniqueOrThrow({ where: { id: serviceB.id } })).nom).toBe("Service B");
  });

  it("RG-SCOPE-01 — modifier un utilisateur du périmètre reste autorisé", async () => {
    const reponse = await appel("PATCH", `/api/utilisateurs/${utilisateurA.id}`, jetonGestionnaire, {
      version: utilisateurA.version, nom: "Autorisée",
    });
    expect(reponse.statusCode).toBe(200);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: utilisateurA.id } })).nom).toBe("Autorisée");
  });

  it("RG-DROITS-03 / RG-SCOPE-01 — la permission est refusée avant l'examen du périmètre", async () => {
    const reponse = await appel("PATCH", `/api/utilisateurs/${utilisateurB.id}`, jetonSansPermission, {
      version: utilisateurB.version, nom: "Interdit",
    });
    expect(reponse.statusCode).toBe(403);
    expect(reponse.json()).toMatchObject({ cle: "commun:droits.permissionRequise" });
  });
});
