import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { execFileSync } from "node:child_process";
import path from "node:path";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";

/**
 * Les trois défauts que **seule la couche HTTP peut montrer**.
 *
 *   1. `RG-TSK-02` — la garde de `POST /taches` n'exigeait que `tasks:create` :
 *      douze modèles de rôles détiennent `tasks:create_standalone` sans lui et
 *      se voyaient refuser la route AVANT que le service ait un mot à dire. Un
 *      test de service ne peut pas le voir : il n'y a pas de garde devant un
 *      appel de méthode.
 *   2. `EX-TSK-04` — les horaires manquaient au **schéma Zod**. Zod retire un
 *      champ inconnu en silence : le service ne le recevait jamais, donc un
 *      test de service qui le lui passe directement passerait au vert sur un
 *      produit cassé.
 *   3. `EX-TSK-15` — même chose pour `projectId` sur `PATCH /taches/:id` : la
 *      requête réussissait, le champ disparaissait, et l'appelant croyait avoir
 *      rattaché.
 *
 * Trois défauts dans la moitié que les suites de service ne touchent pas. C'est
 * le motif consigné : **le raccord entre deux moitiés justes est ce qui casse.**
 */

const RACINE_DB = path.resolve(import.meta.dirname, "../../../../packages/db");

let pg: StartedPostgreSqlContainer;
let app: NestFastifyApplication;
let prisma: import("@rationarium/db").PrismaClient;

const appel = (methode: string, url: string, options: { jeton?: string; corps?: unknown } = {}) =>
  app.inject({
    method: methode as "GET",
    url,
    ...(options.jeton ? { cookies: { rationarium_session: options.jeton } } : {}),
    ...(options.corps ? { payload: options.corps as object } : {}),
  });

/** Un compte réel, son rôle, et sa session obtenue par le VRAI parcours. */
async function compte(code: string, permissions: string[]): Promise<string> {
  const { hacherMotDePasse } = await import("../auth/mots-de-passe.js");
  const role = await prisma.role.create({
    data: {
      code,
      nom: code,
      permissions: { create: permissions.map((permission) => ({ permission })) },
    },
  });
  const login = code.toLowerCase().replaceAll("_", ".");
  await prisma.user.create({
    data: {
      login,
      email: `${login}@exemple.fr`,
      motDePasseHash: await hacherMotDePasse("Corr3ct-Horse-Battery!"),
      prenom: "Test",
      nom: code,
      motDePasseAChanger: false,
      roleId: role.id,
    },
  });
  const connexion = await app.inject({
    method: "POST",
    url: "/api/auth/login",
    payload: { identifiant: login, motDePasse: "Corr3ct-Horse-Battery!" },
  });
  if (connexion.statusCode !== 200) throw new Error(`connexion refusée : ${connexion.body}`);
  return connexion.cookies.find((c) => c.name === "rationarium_session")!.value;
}

let jetonHorsProjet: string;
let jetonDansProjet: string;
let jetonComplet: string;
let idComplet: string;

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

  const { creerClient } = await import("@rationarium/db");
  prisma = creerClient(pg.getConnectionUri());

  jetonHorsProjet = await compte("TEST_HORS_PROJET", ["tasks:read", "tasks:create_standalone"]);
  jetonDansProjet = await compte("TEST_DANS_PROJET", ["tasks:read", "tasks:create"]);
  jetonComplet = await compte("TEST_COMPLET", [
    "tasks:read",
    "tasks:readAll",
    "tasks:create",
    "tasks:create_standalone",
    "tasks:update",
    "tasks:manage_any",
  ]);
  idComplet = (
    await prisma.user.findFirstOrThrow({ where: { login: "test.complet" }, select: { id: true } })
  ).id;
}, 300_000);

afterAll(async () => {
  await prisma?.$disconnect();
  await app?.close();
  await pg?.stop();
});

describe("RG-TSK-02 — la ROUTE de création accepte l'un OU l'autre des deux droits", () => {
  it("RG-TSK-02 — `tasks:create_standalone` seul ATTEINT la route et crée hors projet", async () => {
    // Le versant qui manquait au produit : la garde exigeait `tasks:create`,
    // donc ces comptes-là se voyaient refuser AVANT le service, en 403.
    const r = await appel("POST", "/api/taches", {
      jeton: jetonHorsProjet,
      corps: { titre: "Réunion de service" },
    });

    expect(r.statusCode).toBe(201);
    const cree = r.json() as { id: string; projectId: string | null };
    expect(cree.projectId).toBeNull();
  });

  it("RG-TSK-02 — `tasks:create_standalone` seul est refusé DANS un projet, en 403", async () => {
    const p = await prisma.project.create({
      data: {
        nom: `P-${crypto.randomUUID().slice(0, 8)}`,
        dateDebut: new Date("2026-01-01T00:00:00.000Z"),
        dateFin: new Date("2026-12-31T00:00:00.000Z"),
      },
    });

    const r = await appel("POST", "/api/taches", {
      jeton: jetonHorsProjet,
      corps: { titre: "Lot interdit", projectId: p.id },
    });

    expect(r.statusCode).toBe(403);
    expect(r.json()).toMatchObject({ cle: "erreurs:droitDeCreationManquant" });
  });

  it("RG-TSK-02 — `tasks:create` seul est refusé HORS projet, en 403", async () => {
    const r = await appel("POST", "/api/taches", {
      jeton: jetonDansProjet,
      corps: { titre: "Réunion interdite" },
    });

    expect(r.statusCode).toBe(403);
    expect(r.json()).toMatchObject({ cle: "erreurs:droitDeCreationManquant" });
  });

  it("RG-TSK-02 — sans aucun des deux, la route elle-même refuse", async () => {
    const jetonLecteur = await compte("TEST_LECTEUR", ["tasks:read"]);
    const r = await appel("POST", "/api/taches", {
      jeton: jetonLecteur,
      corps: { titre: "Rien du tout" },
    });

    expect(r.statusCode).toBe(403);
    expect(r.json()).toMatchObject({ cle: "commun:droits.permissionRequise" });
  });
});

describe("EX-TSK-04 — le schéma de la route accepte les horaires", () => {
  it("EX-TSK-04 — `POST /taches` avec `heureDebut` les relit, au lieu de `null`", async () => {
    // La sonde de la vague 7-5, rejouée : elle relisait `null`, Zod ayant
    // retiré le champ en silence.
    const r = await appel("POST", "/api/taches", {
      jeton: jetonComplet,
      corps: { titre: "Créneau", heureDebut: "09:00", heureFin: "12:30" },
    });
    expect(r.statusCode).toBe(201);
    const { id } = r.json() as { id: string };

    const relue = await appel("GET", `/api/taches/${id}`, { jeton: jetonComplet });
    expect(relue.json()).toMatchObject({ heureDebut: "09:00", heureFin: "12:30" });
  });

  it("EX-TSK-04 — un horaire mal formé est refusé champ par champ, pas ignoré", async () => {
    const r = await appel("POST", "/api/taches", {
      jeton: jetonComplet,
      corps: { titre: "Horaire absurde", heureDebut: "9h", heureFin: "12:30" },
    });

    expect(r.statusCode).toBe(400);
    const charge = r.json() as { cle: string; details: { champ: string }[] };
    expect(charge.cle).toBe("erreurs:donneesInvalides");
    expect(charge.details.map((d) => d.champ)).toContain("heureDebut");
  });

  it("EX-TSK-04 — `PATCH /taches/:id` corrige l'horaire, et le relit", async () => {
    const cree = await appel("POST", "/api/taches", {
      jeton: jetonComplet,
      corps: { titre: "À corriger", heureDebut: "09:00", heureFin: "10:00" },
    });
    const { id, version } = cree.json() as { id: string; version: number };

    const r = await appel("PATCH", `/api/taches/${id}`, {
      jeton: jetonComplet,
      corps: { version, heureFin: "11:30" },
    });
    expect(r.statusCode).toBe(200);

    const relue = await appel("GET", `/api/taches/${id}`, { jeton: jetonComplet });
    expect(relue.json()).toMatchObject({ heureDebut: "09:00", heureFin: "11:30" });
  });
});

describe("EX-TSK-15 — le schéma de la route accepte le rattachement a posteriori", () => {
  it("EX-TSK-15 — `PATCH /taches/:id` avec `projectId` rattache VRAIMENT", async () => {
    // La sonde de la vague 7-5 : le PATCH réussissait, la relecture rendait
    // `null`, aucune erreur n'était levée, et l'appelant croyait avoir
    // rattaché. C'est le pire des trois cas — un succès qui ment.
    const p = await prisma.project.create({
      data: {
        nom: `P-${crypto.randomUUID().slice(0, 8)}`,
        dateDebut: new Date("2026-01-01T00:00:00.000Z"),
        dateFin: new Date("2026-12-31T00:00:00.000Z"),
        membres: { create: [{ userId: idComplet, roleProjet: "developpeur" }] },
      },
    });

    const cree = await appel("POST", "/api/taches", {
      jeton: jetonComplet,
      corps: { titre: "Née hors projet" },
    });
    const { id, version } = cree.json() as { id: string; version: number };

    const r = await appel("PATCH", `/api/taches/${id}`, {
      jeton: jetonComplet,
      corps: { version, projectId: p.id },
    });
    expect(r.statusCode).toBe(200);

    const relue = await appel("GET", `/api/taches/${id}`, { jeton: jetonComplet });
    expect(relue.json()).toMatchObject({ projectId: p.id, horsProjet: false });
  });

  it("EX-TSK-15 — et `projectId: null` détache VRAIMENT", async () => {
    const p = await prisma.project.create({
      data: {
        nom: `P-${crypto.randomUUID().slice(0, 8)}`,
        dateDebut: new Date("2026-01-01T00:00:00.000Z"),
        dateFin: new Date("2026-12-31T00:00:00.000Z"),
        membres: { create: [{ userId: idComplet, roleProjet: "developpeur" }] },
      },
    });

    const cree = await appel("POST", "/api/taches", {
      jeton: jetonComplet,
      corps: { titre: "À détacher", projectId: p.id },
    });
    const { id, version } = cree.json() as { id: string; version: number };

    const r = await appel("PATCH", `/api/taches/${id}`, {
      jeton: jetonComplet,
      corps: { version, projectId: null },
    });
    expect(r.statusCode).toBe(200);

    const relue = await appel("GET", `/api/taches/${id}`, { jeton: jetonComplet });
    expect(relue.json()).toMatchObject({ projectId: null, horsProjet: true });
  });
});

describe("RG-GEN-07 — les deux poses d'ensemble exigent la version, jusque dans le schéma", () => {
  it("RG-GEN-07 — `PUT /taches/:id/assignes` sans version est refusé, pas accepté", async () => {
    const cree = await appel("POST", "/api/taches", {
      jeton: jetonComplet,
      corps: { titre: "Assignés" },
    });
    const { id } = cree.json() as { id: string };

    const r = await appel("PUT", `/api/taches/${id}/assignes`, {
      jeton: jetonComplet,
      corps: { userIds: [idComplet] },
    });

    expect(r.statusCode).toBe(400);
    const charge = r.json() as { details: { champ: string }[] };
    expect(charge.details.map((d) => d.champ)).toContain("version");
  });

  it("RG-GEN-07 — avec la version lue, la pose aboutit et rend la suivante", async () => {
    const cree = await appel("POST", "/api/taches", {
      jeton: jetonComplet,
      corps: { titre: "Assignés bis" },
    });
    const { id, version } = cree.json() as { id: string; version: number };

    const r = await appel("PUT", `/api/taches/${id}/assignes`, {
      jeton: jetonComplet,
      corps: { version, userIds: [idComplet] },
    });

    expect(r.statusCode).toBe(200);
    expect(r.json()).toMatchObject({ assignes: [idComplet], version: version + 1 });

    // Rejouer la MÊME version est un conflit, pas un écrasement.
    const rejeu = await appel("PUT", `/api/taches/${id}/assignes`, {
      jeton: jetonComplet,
      corps: { version, userIds: [] },
    });
    expect(rejeu.statusCode).toBe(409);
    expect(rejeu.json()).toMatchObject({ cle: "erreurs:conflitDeVersion" });
  });

  it("RG-GEN-07 — `PUT /taches/:id/sous-taches/ordre` exige la version, elle aussi", async () => {
    const cree = await appel("POST", "/api/taches", {
      jeton: jetonComplet,
      corps: { titre: "Sous-tâches" },
    });
    const { id } = cree.json() as { id: string };

    const r = await appel("PUT", `/api/taches/${id}/sous-taches/ordre`, {
      jeton: jetonComplet,
      corps: { ids: [] },
    });

    expect(r.statusCode).toBe(400);
    const charge = r.json() as { details: { champ: string }[] };
    expect(charge.details.map((d) => d.champ)).toContain("version");
  });

  /*
   * ─────────────────────────────────────────────────────────────────────────
   * `EX-TSK-08` — `avancement` à la création.
   *
   * Quatrième défaut de la même famille dans ce fichier, et le plus coûteux :
   * `tacheSchema` — le contrat exporté — déclarait le champ, le schéma en
   * ligne de la route ne l'avait pas, Zod le retirait en silence. Un projet
   * chargé avec son historique affichait zéro pour cent, `RG-PRJ-07` moyennant
   * un champ que rien n'écrivait. La requête rendait `201`.
   * ─────────────────────────────────────────────────────────────────────────
   */
  it("EX-TSK-08 — `POST /taches` avec `avancement` le relit, au lieu de zéro", async () => {
    const r = await appel("POST", "/api/taches", {
      jeton: jetonComplet,
      corps: { titre: "Déjà faite", statut: "done", avancement: 100 },
    });
    expect(r.statusCode).toBe(201);
    const { id } = r.json() as { id: string };

    const relue = await appel("GET", `/api/taches/${id}`, { jeton: jetonComplet });
    expect(relue.json()).toMatchObject({ avancement: 100 });
  });

  it("EX-TSK-08 — absent du corps, l'avancement vaut ZÉRO", async () => {
    const r = await appel("POST", "/api/taches", {
      jeton: jetonComplet,
      corps: { titre: "À faire" },
    });
    const { id } = r.json() as { id: string };
    const relue = await appel("GET", `/api/taches/${id}`, { jeton: jetonComplet });
    expect(relue.json()).toMatchObject({ avancement: 0 });
  });

  it("EX-TSK-08 — une valeur hors de zéro à cent est REFUSÉE en 400", async () => {
    for (const valeur of [101, -1, 12.5]) {
      const r = await appel("POST", "/api/taches", {
        jeton: jetonComplet,
        corps: { titre: `Absurde ${valeur}`, avancement: valeur },
      });
      expect(r.statusCode, `avancement ${valeur}`).toBe(400);
      const charge = r.json() as { details: { champ: string }[] };
      expect(charge.details.map((d) => d.champ)).toContain("avancement");
    }
  });

  it("une clé INCONNUE est refusée, elle n'est plus retirée en silence", async () => {
    /*
     * Le remède qui vise la cause plutôt que le symptôme, appliqué au module
     * qui a payé la classe quatre fois. Un client qui envoie un champ
     * inexistant l'apprend tout de suite, au lieu de croire l'avoir écrit.
     *
     * Il n'est PAS généralisé aux soixante-dix-huit autres routes d'écriture :
     * un `400` là où le produit acceptait silencieusement casserait un
     * appelant existant, et rien aujourd'hui ne prouve qu'aucun n'envoie de
     * champ superflu. La divergence contrat/route, elle, est tenue partout par
     * `schemas-ecriture.test.ts`.
     */
    const r = await appel("POST", "/api/taches", {
      jeton: jetonComplet,
      corps: { titre: "Avec un intrus", champInexistant: 1 },
    });
    expect(r.statusCode).toBe(400);
  });
});