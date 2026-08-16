import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { execFileSync } from "node:child_process";
import path from "node:path";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";

/**
 * La surface HTTP, exercée pour de vrai.
 *
 * Le test unitaire voisin prouve que **chaque route déclare** une permission.
 * Celui-ci prouve que la déclaration **produit un refus** : la garde est bien
 * branchée en global, l'ordre permission-puis-périmètre est tenu, le refus est
 * tracé, et le filtre traduit les échecs métier en clé plutôt qu'en 500.
 *
 * Sans lui, on aurait la preuve que les décorateurs sont posés et aucune preuve
 * qu'ils servent à quelque chose.
 */

const RACINE_DB = path.resolve(import.meta.dirname, "../../../../packages/db");

let pg: StartedPostgreSqlContainer;
let app: NestFastifyApplication;
let prisma: import("@trame/db").PrismaClient;

let jetonSansDroit: string;
let idSansDroit: string;

const appel = (methode: string, url: string, options: { jeton?: string; corps?: unknown } = {}) =>
  app.inject({
    method: methode as "GET",
    url,
    ...(options.jeton ? { cookies: { trame_session: options.jeton } } : {}),
    ...(options.corps ? { payload: options.corps as object } : {}),
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

  const { creerClient } = await import("@trame/db");
  prisma = creerClient(pg.getConnectionUri());

  // Un compte sans rôle : le cas dégradé de la liste blanche. La session est
  // obtenue par le vrai parcours de connexion — un jeton posé à la main
  // testerait une session que le produit ne sait pas fabriquer.
  const { hacherMotDePasse } = await import("../auth/mots-de-passe.js");
  const u = await prisma.user.create({
    data: {
      login: "sans.droit",
      email: "sans.droit@exemple.fr",
      motDePasseHash: await hacherMotDePasse("Corr3ct-Horse-Battery!"),
      prenom: "Sans",
      nom: "Droit",
      motDePasseAChanger: false,
    },
  });
  idSansDroit = u.id;

  const connexion = await app.inject({
    method: "POST",
    url: "/api/auth/login",
    payload: { identifiant: "sans.droit", motDePasse: "Corr3ct-Horse-Battery!" },
  });
  if (connexion.statusCode !== 200) throw new Error(`connexion refusée : ${connexion.body}`);
  jetonSansDroit = connexion.cookies.find((c) => c.name === "trame_session")!.value;
}, 300_000);

afterAll(async () => {
  await prisma?.$disconnect();
  await app?.close();
  await pg?.stop();
});

describe("RG-DROITS-03 — sans session, tout est refusé", () => {
  const echantillon: [string, string][] = [
    ["GET", "/api/projets"],
    ["GET", "/api/taches"],
    ["GET", "/api/conges"],
    ["GET", "/api/utilisateurs"],
    ["GET", "/api/administration/audit"],
    ["GET", "/api/temps"],
    ["POST", "/api/documents"],
    ["GET", "/api/organisation"],
  ];

  for (const [methode, url] of echantillon) {
    it(`${methode} ${url} → 401`, async () => {
      const r = await appel(methode, url);
      expect(r.statusCode).toBe(401);
      // La clé, pas un texte français figé : RG-GEN-08.
      expect(r.json()).toMatchObject({ cle: "auth:erreurs.sessionRequise" });
    });
  }

  it("les routes d'authentification, elles, restent atteignables", async () => {
    const r = await appel("POST", "/api/auth/forgot-password", {
      corps: { email: "inconnu@exemple.fr" },
    });
    expect(r.statusCode).toBe(202);
  });
});

describe("RG-DROITS-03 — session sans rôle : aucune permission", () => {
  it("un compte sans rôle est refusé en 403, pas en 401", async () => {
    // La distinction compte : 401 dit « identifiez-vous », 403 dit « vous êtes
    // identifié, mais ce n'est pas pour vous ». Les confondre enverrait
    // l'utilisateur se reconnecter en boucle.
    const r = await appel("GET", "/api/projets", { jeton: jetonSansDroit });
    expect(r.statusCode).toBe(403);
    expect(r.json()).toMatchObject({ cle: "commun:droits.permissionRequise" });
  });

  it("RG-ADM-03 — le refus est lui-même tracé", async () => {
    await appel("GET", "/api/administration/audit", { jeton: jetonSansDroit });
    const trace = await prisma.auditLog.findFirst({
      where: { action: "access.denied", acteurId: idSansDroit },
      orderBy: { horodatage: "desc" },
    });
    expect(trace).not.toBeNull();
    expect(trace?.entiteId).toContain("/api/administration/audit");
  });
});

describe("La couche HTTP formule ce que le service nomme", () => {
  it("une entrée mal formée est refusée champ par champ", async () => {
    const permissif = await prisma.role.create({
      data: {
        code: "TEST_HTTP",
        nom: "Test",
        permissions: { create: [{ permission: "projects:create" }] },
      },
    });
    await prisma.user.update({
      where: { id: idSansDroit },
      data: { roleId: permissif.id },
    });

    const r = await appel("POST", "/api/projets", {
      jeton: jetonSansDroit,
      corps: { nom: "", dateDebut: "pas une date", dateFin: "2026-12-31" },
    });

    expect(r.statusCode).toBe(400);
    const charge = r.json() as { cle: string; details: { champ: string }[] };
    expect(charge.cle).toBe("erreurs:donneesInvalides");
    // Le champ fautif est nommé : cadrage/02 affiche l'erreur sous le champ.
    expect(charge.details.map((d) => d.champ).sort()).toEqual(["dateDebut", "nom"]);
  });

  it("un échec métier ressort en clé traduisible, jamais en 500", async () => {
    const r = await appel("POST", "/api/projets", {
      jeton: jetonSansDroit,
      corps: { nom: "Dates inversées", dateDebut: "2026-12-31", dateFin: "2026-01-01" },
    });

    expect(r.statusCode).toBe(422);
    expect(r.json()).toMatchObject({ cle: "erreurs:datesIncoherentes" });
  });

  it("une entité absente ressort en 404, pas en 500", async () => {
    await prisma.rolePermission.create({
      data: {
        roleId: (await prisma.role.findFirstOrThrow({ where: { code: "TEST_HTTP" } })).id,
        permission: "projects:delete",
      },
    });
    const r = await appel("DELETE", `/api/projets/${crypto.randomUUID()}`, {
      jeton: jetonSansDroit,
    });
    expect(r.statusCode).toBe(404);
    expect(r.json()).toMatchObject({ cle: "erreurs:introuvable" });
  });
});
