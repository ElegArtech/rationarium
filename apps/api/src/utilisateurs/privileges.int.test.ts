import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { execFileSync } from "node:child_process";
import path from "node:path";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import type { PrismaClient } from "@rationarium/db";
import { modeleParCode } from "@rationarium/contracts";

/**
 * `RG-USR-09`, `RG-USR-10` — **nul n'agit sur un compte plus privilégié que soi.**
 *
 * Le défaut (D01, D02) : `users:reset_password` et `users:update` gardaient
 * leurs routes, et rien ne regardait QUI était visé. Le support informatique,
 * la RH, l'administrateur délégué réinitialisaient le mot de passe de l'ADMIN
 * ou changeaient son courriel — puis demandaient un « mot de passe oublié » —
 * et devenaient administrateurs. L'import CSV, lui, écrivait la colonne `role`
 * sans même exiger `users:manage_roles`.
 *
 * Exercé par HTTP, avec la vraie connexion : c'est la garde globale qui fournit
 * les permissions et le périmètre, et c'est le raccord entre elle et le service
 * qui était troué.
 */

const RACINE_DB = path.resolve(import.meta.dirname, "../../../../packages/db");
const MDP = "Motdepasse1!";
const REFUS = "erreurs:comptePlusPrivilegie";

let pg: StartedPostgreSqlContainer;
let app: NestFastifyApplication;
let prisma: PrismaClient;

let deptA: { id: string; nom: string };
let deptB: { id: string; nom: string };
const roles = new Map<string, string>();
const comptes = new Map<string, { id: string; login: string }>();
const jetons = new Map<string, string>();

/** Les rôles que l'audit du 2026-10-07 a vus réinitialiser l'ADMIN (D01). */
const ROLES_D01 = [
  "IT_SUPPORT",
  "HR_OFFICER",
  "HR_OFFICER_LIGHT",
  "ADMIN_DELEGATED",
  "MANAGER_HR_FOCUS",
] as const;

/**
 * Un gestionnaire des rôles qui n'est PAS administrateur : il détient
 * `users:manage_roles`, le socle d'un agent, et rien de l'audit ni des
 * paramètres. Il peut donc attribuer `BASIC_USER` et pas `ADMIN`.
 */
const GESTIONNAIRE_ROLES = [
  ...modeleParCode("BASIC_USER")!.permissions,
  "users:read", "users:readAll", "users:create", "users:update", "users:import",
  "users:manage_roles",
];

/** Un importateur cantonné à son département : pas de lecture globale. */
const IMPORTATEUR_LOCAL = ["users:read", "users:import"];

const appel = (methode: string, url: string, qui: string, corps?: unknown) =>
  app.inject({
    method: methode as "GET",
    url,
    cookies: { rationarium_session: jetons.get(qui)! },
    ...(corps === undefined ? {} : { payload: corps as object }),
  });

const relire = (qui: string) =>
  prisma.user.findUniqueOrThrow({ where: { id: comptes.get(qui)!.id } });

async function poserCompte(cle: string, role: string | null, departementId: string) {
  const { hacherMotDePasse } = await import("../auth/mots-de-passe.js");
  const login = `priv.${cle.toLowerCase().replaceAll("_", ".")}`;
  const u = await prisma.user.create({
    data: {
      login,
      email: `${login}@exemple.test`,
      motDePasseHash: await hacherMotDePasse(MDP),
      motDePasseAChanger: false,
      prenom: cle,
      nom: "Privilèges",
      departementId,
      roleId: role ? roles.get(role)! : null,
    },
  });
  comptes.set(cle, { id: u.id, login });
}

async function connecter(cle: string) {
  const r = await app.inject({
    method: "POST",
    url: "/api/auth/login",
    payload: { identifiant: comptes.get(cle)!.login, motDePasse: MDP },
  });
  if (r.statusCode !== 200) throw new Error(`connexion de ${cle} refusée : ${r.body}`);
  jetons.set(cle, r.cookies.find((c) => c.name === "rationarium_session")!.value);
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
  app = await creerApplication();
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  prisma = creerClient(pg.getConnectionUri());

  const direction = await prisma.direction.create({ data: { nom: "Direction" } });
  deptA = await prisma.departement.create({ data: { nom: "Département A", directionId: direction.id } });
  deptB = await prisma.departement.create({ data: { nom: "Département B", directionId: direction.id } });

  // Les modèles réels, pas des imitations : c'est leur contenu qui fait le défaut.
  for (const code of ["ADMIN", "BASIC_USER", ...ROLES_D01]) {
    const modele = modeleParCode(code)!;
    const r = await prisma.role.create({
      data: {
        code, nom: modele.nom, systeme: modele.systeme,
        permissions: { create: modele.permissions.map((permission) => ({ permission })) },
      },
    });
    roles.set(code, r.id);
  }
  for (const [code, permissions] of [
    ["GESTIONNAIRE_ROLES", GESTIONNAIRE_ROLES],
    ["IMPORTATEUR_LOCAL", IMPORTATEUR_LOCAL],
  ] as const) {
    const r = await prisma.role.create({
      data: {
        code, nom: code,
        permissions: { create: [...new Set(permissions)].map((permission) => ({ permission })) },
      },
    });
    roles.set(code, r.id);
  }

  // Tout le monde dans le département A : le refus attendu ne doit pas venir
  // du périmètre, sinon le test prouverait autre chose que RG-USR-09.
  await poserCompte("ADMIN", "ADMIN", deptA.id);
  await poserCompte("BASIC", "BASIC_USER", deptA.id);
  for (const code of ROLES_D01) await poserCompte(code, code, deptA.id);
  await poserCompte("GESTIONNAIRE", "GESTIONNAIRE_ROLES", deptA.id);
  await poserCompte("IMPORTATEUR", "IMPORTATEUR_LOCAL", deptA.id);

  for (const cle of ["ADMIN", ...ROLES_D01, "GESTIONNAIRE", "IMPORTATEUR"]) await connecter(cle);
}, 300_000);

afterAll(async () => {
  await prisma?.$disconnect();
  await app?.close();
  await pg?.stop();
});

describe("RG-USR-09 — nul n'agit sur un compte plus privilégié que soi", () => {
  it("RG-USR-09 — IT_SUPPORT ne réinitialise pas le mot de passe de l'ADMIN", async () => {
    const avant = await relire("ADMIN");
    const r = await appel("POST", `/api/utilisateurs/${avant.id}/mot-de-passe`, "IT_SUPPORT", {
      nouveau: "Pris-en-main1!",
    });
    expect(r.statusCode).toBe(403);
    expect(r.json()).toMatchObject({ cle: REFUS });
    const apres = await relire("ADMIN");
    expect(apres.motDePasseHash).toBe(avant.motDePasseHash);
    expect(apres.motDePasseAChanger).toBe(false);
  });

  it("RG-USR-09 — IT_SUPPORT ne change pas le courriel de l'ADMIN", async () => {
    const avant = await relire("ADMIN");
    const r = await appel("PATCH", `/api/utilisateurs/${avant.id}`, "IT_SUPPORT", {
      version: avant.version, email: "boite.du.support@exemple.test",
    });
    expect(r.statusCode).toBe(403);
    expect(r.json()).toMatchObject({ cle: REFUS });
    const apres = await relire("ADMIN");
    expect(apres.email).toBe(avant.email);
    expect(apres.version).toBe(avant.version);
  });

  it("RG-USR-09 — HR_OFFICER ne désactive pas l'ADMIN", async () => {
    const avant = await relire("ADMIN");
    const r = await appel("POST", `/api/utilisateurs/${avant.id}/desactiver`, "HR_OFFICER", {
      version: avant.version,
    });
    expect(r.statusCode).toBe(403);
    expect(r.json()).toMatchObject({ cle: REFUS });
    expect((await relire("ADMIN")).actif).toBe(true);
  });

  it("RG-USR-09 — ADMIN_DELEGATED ne réinitialise pas le mot de passe de l'ADMIN", async () => {
    const avant = await relire("ADMIN");
    const r = await appel("POST", `/api/utilisateurs/${avant.id}/mot-de-passe`, "ADMIN_DELEGATED", {
      nouveau: "Pris-en-main1!",
    });
    expect(r.statusCode).toBe(403);
    expect(r.json()).toMatchObject({ cle: REFUS });
    expect((await relire("ADMIN")).motDePasseHash).toBe(avant.motDePasseHash);
  });

  /*
   * Les cinq rôles de D01, chacun sur les deux gestes. Un rôle qui ne détient
   * pas la permission de la route est refusé par la garde, avant le service :
   * le refus est alors l'autre clé, et c'est très bien — ce qui compte est que
   * l'ADMIN n'ait pas bougé.
   */
  for (const code of ROLES_D01) {
    it(`RG-USR-09 — ${code} : ni réinitialisation ni changement de courriel sur l'ADMIN`, async () => {
      const permissions = new Set(modeleParCode(code)!.permissions);
      const avant = await relire("ADMIN");

      const reset = await appel("POST", `/api/utilisateurs/${avant.id}/mot-de-passe`, code, {
        nouveau: "Pris-en-main1!",
      });
      expect(reset.statusCode).toBe(403);
      if (permissions.has("users:reset_password")) expect(reset.json()).toMatchObject({ cle: REFUS });

      const courriel = await appel("PATCH", `/api/utilisateurs/${avant.id}`, code, {
        version: avant.version, email: `pris.${code.toLowerCase()}@exemple.test`,
      });
      expect(courriel.statusCode).toBe(403);
      if (permissions.has("users:update")) expect(courriel.json()).toMatchObject({ cle: REFUS });

      const apres = await relire("ADMIN");
      expect(apres.motDePasseHash).toBe(avant.motDePasseHash);
      expect(apres.email).toBe(avant.email);
    });
  }

  it("RG-USR-09 — IT_SUPPORT réinitialise toujours un BASIC_USER : le support garde son métier", async () => {
    const avant = await relire("BASIC");
    const r = await appel("POST", `/api/utilisateurs/${avant.id}/mot-de-passe`, "IT_SUPPORT", {
      nouveau: "Provisoire12!",
    });
    expect(r.statusCode).toBe(201);
    const apres = await relire("BASIC");
    expect(apres.motDePasseHash).not.toBe(avant.motDePasseHash);
    expect(apres.motDePasseAChanger).toBe(true);
  });

  it("RG-USR-09 — l'ADMIN agit sur un autre ADMIN : l'égalité de droits n'est pas un refus", async () => {
    await poserCompte("ADMIN_2", "ADMIN", deptA.id);
    const cible = await relire("ADMIN_2");
    const r = await appel("PATCH", `/api/utilisateurs/${cible.id}`, "ADMIN", {
      version: cible.version, nom: "Corrigé",
    });
    expect(r.statusCode).toBe(200);
    expect((await relire("ADMIN_2")).nom).toBe("Corrigé");
  });

  it("RG-USR-09 — l'annuaire signale, ligne par ligne, les comptes plus privilégiés que le lecteur", async () => {
    const r = await appel("GET", "/api/utilisateurs", "IT_SUPPORT");
    expect(r.statusCode).toBe(200);
    const lignes = r.json() as { id: string; actionsRestreintes: boolean }[];
    const ligne = (cle: string) => lignes.find((l) => l.id === comptes.get(cle)!.id);
    expect(ligne("ADMIN")?.actionsRestreintes).toBe(true);
    expect(ligne("BASIC")?.actionsRestreintes).toBe(false);
    expect(ligne("IT_SUPPORT")?.actionsRestreintes).toBe(false);
  });
});

describe("RG-USR-09 — attribuer un rôle exige d'en détenir toutes les permissions", () => {
  it("RG-USR-09 — un porteur de users:manage_roles n'attribue pas ADMIN par modification", async () => {
    const avant = await relire("BASIC");
    const r = await appel("PATCH", `/api/utilisateurs/${avant.id}`, "GESTIONNAIRE", {
      version: avant.version, roleId: roles.get("ADMIN"),
    });
    expect(r.statusCode).toBe(403);
    expect(r.json()).toMatchObject({ cle: REFUS });
    const apres = await relire("BASIC");
    expect(apres.roleId).toBe(roles.get("BASIC_USER"));
    expect(apres.version).toBe(avant.version);
  });

  it("RG-USR-09 — ni par création", async () => {
    const r = await appel("POST", "/api/utilisateurs", "GESTIONNAIRE", {
      prenom: "Second", nom: "Administrateur", email: "second.admin@exemple.test",
      login: "second.admin", motDePasse: "Motdepasse1!", roleId: roles.get("ADMIN"),
      departementId: deptA.id,
    });
    expect(r.statusCode).toBe(403);
    expect(r.json()).toMatchObject({ cle: REFUS });
    expect(await prisma.user.findUnique({ where: { login: "second.admin" } })).toBeNull();
  });

  it("RG-USR-09 — il attribue un rôle qu'il couvre : le refus est ciblé", async () => {
    await poserCompte("SANS_ROLE", null, deptA.id);
    const avant = await relire("SANS_ROLE");
    const r = await appel("PATCH", `/api/utilisateurs/${avant.id}`, "GESTIONNAIRE", {
      version: avant.version, roleId: roles.get("BASIC_USER"),
    });
    expect(r.statusCode).toBe(200);
    expect((await relire("SANS_ROLE")).roleId).toBe(roles.get("BASIC_USER"));
  });
});

describe("RG-USR-10 — l'import CSV applique les règles de la création unitaire", () => {
  const ENTETE = "email;login;password;firstName;lastName;role;departmentName;serviceNames";
  const importer = (qui: string, ...lignes: string[]) =>
    appel("POST", "/api/imports/utilisateurs", qui, { contenu: [ENTETE, ...lignes].join("\n") });
  type Rendu = { importes: number; erreurs: { ligne: number; cle: string }[] };

  it("RG-USR-10 — HR_OFFICER importe une ligne role=ADMIN : ligne refusée, aucun compte créé", async () => {
    const r = await importer(
      "HR_OFFICER",
      `faux.admin@exemple.test;faux.admin;Motdepasse1!;Faux;Admin;ADMIN;${deptA.nom};`,
    );
    expect(r.statusCode).toBe(201);
    const rendu = r.json() as Rendu;
    expect(rendu.importes).toBe(0);
    expect(rendu.erreurs).toMatchObject([{ ligne: 2, cle: "imports:motifs.roleSansPermission" }]);
    expect(await prisma.user.findUnique({ where: { login: "faux.admin" } })).toBeNull();
  });

  it("RG-USR-10 — HR_OFFICER importe sans rôle dans son périmètre : le compte est créé", async () => {
    /*
     * `HR_OFFICER` ne détient pas `users:manage_roles` : la colonne `role` lui
     * est fermée, comme le champ `roleId` de la création unitaire. Son métier
     * — créer les comptes — reste entier.
     */
    const r = await importer(
      "HR_OFFICER",
      `recrue.rh@exemple.test;recrue.rh;Motdepasse1!;Recrue;RH;;${deptA.nom};`,
    );
    expect(r.statusCode).toBe(201);
    expect(r.json()).toMatchObject({ importes: 1, erreurs: [] });
    const cree = await prisma.user.findUniqueOrThrow({ where: { login: "recrue.rh" } });
    expect(cree.departementId).toBe(deptA.id);
    expect(cree.roleId).toBeNull();
  });

  it("RG-USR-10 — un porteur de users:manage_roles importe role=BASIC_USER : créé avec ce rôle", async () => {
    const r = await importer(
      "GESTIONNAIRE",
      `recrue.base@exemple.test;recrue.base;Motdepasse1!;Recrue;Base;BASIC_USER;${deptA.nom};`,
    );
    expect(r.json()).toMatchObject({ importes: 1, erreurs: [] });
    const cree = await prisma.user.findUniqueOrThrow({ where: { login: "recrue.base" } });
    expect(cree.roleId).toBe(roles.get("BASIC_USER"));
  });

  it("RG-USR-10 et RG-USR-09 — ce même porteur n'importe pas role=ADMIN", async () => {
    const r = await importer(
      "GESTIONNAIRE",
      `admin.importe@exemple.test;admin.importe;Motdepasse1!;Admin;Importé;ADMIN;${deptA.nom};`,
    );
    const rendu = r.json() as Rendu;
    expect(rendu.importes).toBe(0);
    expect(rendu.erreurs).toMatchObject([{ ligne: 2, cle: "imports:motifs.rolePlusPrivilegie" }]);
    expect(await prisma.user.findUnique({ where: { login: "admin.importe" } })).toBeNull();
  });

  it("RG-USR-10 — un importateur local : son département passe, un autre est refusé ligne à ligne", async () => {
    const r = await importer(
      "IMPORTATEUR",
      `local.a@exemple.test;local.a;Motdepasse1!;Local;A;;${deptA.nom};`,
      `local.b@exemple.test;local.b;Motdepasse1!;Local;B;;${deptB.nom};`,
      `local.c@exemple.test;local.c;Motdepasse1!;Local;C;;;`,
    );
    expect(r.statusCode).toBe(201);
    const rendu = r.json() as Rendu;
    // Pas d'échec global : la ligne saine entre, les deux autres sont nommées.
    expect(rendu.importes).toBe(1);
    expect(rendu.erreurs).toMatchObject([
      { ligne: 3, cle: "imports:motifs.departementHorsPerimetre" },
      { ligne: 4, cle: "imports:motifs.rattachementRequis" },
    ]);
    expect(await prisma.user.findUnique({ where: { login: "local.a" } })).not.toBeNull();
    expect(await prisma.user.findUnique({ where: { login: "local.b" } })).toBeNull();
    expect(await prisma.user.findUnique({ where: { login: "local.c" } })).toBeNull();
  });
});
