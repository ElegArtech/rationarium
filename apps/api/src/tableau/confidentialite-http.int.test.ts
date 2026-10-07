import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { execFileSync } from "node:child_process";
import path from "node:path";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";

/**
 * `RG-SCOPE-04` — être assigné ne rend pas lisible une tâche confidentielle.
 *
 * La fiche le tenait ; la page d'accueil et la liste des tâches terminées sans
 * temps déclaré, non : elles partaient de « mes assignations » sans passer par
 * le prédicat de lecture, et nommaient — et comptaient — ce que la fiche
 * refusait d'ouvrir.
 */

const RACINE_DB = path.resolve(import.meta.dirname, "../../../../packages/db");
const MOT_DE_PASSE = "Corr3ct-Horse-Battery!";
const jour = (s: string) => new Date(`${s}T00:00:00.000Z`);

let pg: StartedPostgreSqlContainer;
let app: NestFastifyApplication;
let prisma: import("@rationarium/db").PrismaClient;

type Compte = { id: string; jeton: string };

const lire = (url: string, jeton: string) =>
  app.inject({ method: "GET", url, cookies: { rationarium_session: jeton } });

async function compte(login: string, permissions: string[]): Promise<Compte> {
  const { hacherMotDePasse } = await import("../auth/mots-de-passe.js");
  const role = await prisma.role.create({
    data: {
      code: login.toUpperCase(),
      nom: login,
      permissions: { create: permissions.map((permission) => ({ permission })) },
    },
  });
  const { id } = await prisma.user.create({
    data: {
      login,
      email: `${login}@exemple.fr`,
      motDePasseHash: await hacherMotDePasse(MOT_DE_PASSE),
      prenom: "Test",
      nom: login,
      motDePasseAChanger: false,
      roleId: role.id,
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

const AGENT = ["planning:read", "tasks:read", "time_tracking:read"];

let agent: Compte;
let habilite: Compte;

type Accueil = {
  indicateurs: { tachesEnCours: { valeur: number; total: number } };
  taches: { aVenir: { titre: string }[]; nonDeclarees: { titre: string }[] };
};

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

  agent = await compte("agent", AGENT);
  habilite = await compte("habilite", [...AGENT, "tasks:read_confidential"]);

  const assignes = { create: [{ userId: agent.id }, { userId: habilite.id }] };
  await prisma.task.create({
    data: { titre: "Enquête interne", confidentielle: true, statut: "doing", dateFin: jour("2099-01-15"), assignes },
  });
  await prisma.task.create({
    data: { titre: "Entretien sanction", confidentielle: true, statut: "done", dateFin: jour("2026-01-15"), assignes },
  });
  await prisma.task.create({
    data: { titre: "Rapport ordinaire", statut: "doing", dateFin: jour("2099-01-20"), assignes },
  });
  await prisma.task.create({
    data: { titre: "Relecture ordinaire", statut: "done", dateFin: jour("2026-01-20"), assignes },
  });
}, 300_000);

afterAll(async () => {
  await prisma?.$disconnect();
  await app?.close();
  await pg?.stop();
});

describe("RG-SCOPE-04 — le tableau de bord ne nomme ni ne compte une tâche confidentielle illisible", () => {
  it("RG-SCOPE-04 — GET /tableau-de-bord : « À venir » et « Non déclarées » omettent les tâches confidentielles assignées", async () => {
    const r = await lire("/api/tableau-de-bord", agent.jeton);
    expect(r.statusCode).toBe(200);
    const accueil = r.json<Accueil>();
    expect(accueil.taches.aVenir.map((t) => t.titre)).toEqual(["Rapport ordinaire"]);
    expect(accueil.taches.nonDeclarees.map((t) => t.titre)).toEqual(["Relecture ordinaire"]);
    expect(r.body).not.toContain("Enquête interne");
    expect(r.body).not.toContain("Entretien sanction");
  });

  it("RG-SCOPE-04 — GET /tableau-de-bord : les indicateurs ne comptent que les tâches lisibles", async () => {
    const accueil = (await lire("/api/tableau-de-bord", agent.jeton)).json<Accueil>();
    expect(accueil.indicateurs.tachesEnCours).toEqual({ valeur: 1, total: 2 });
  });

  it("RG-SCOPE-04 — GET /temps/non-declarees omet la tâche confidentielle terminée", async () => {
    const r = await lire("/api/temps/non-declarees", agent.jeton);
    expect(r.statusCode).toBe(200);
    expect(r.json<{ titre: string }[]>().map((t) => t.titre)).toEqual(["Relecture ordinaire"]);
  });

  it("RG-SCOPE-04 — contre-témoin : avec tasks:read_confidential, les mêmes listes les nomment", async () => {
    const accueil = (await lire("/api/tableau-de-bord", habilite.jeton)).json<Accueil>();
    expect(accueil.taches.aVenir.map((t) => t.titre).sort()).toEqual(["Enquête interne", "Rapport ordinaire"]);
    expect(accueil.indicateurs.tachesEnCours).toEqual({ valeur: 2, total: 4 });
    const liste = (await lire("/api/temps/non-declarees", habilite.jeton)).json<{ titre: string }[]>();
    expect(liste.map((t) => t.titre).sort()).toEqual(["Entretien sanction", "Relecture ordinaire"]);
  });
});
