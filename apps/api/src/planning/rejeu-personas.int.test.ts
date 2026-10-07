import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { execFileSync } from "node:child_process";
import path from "node:path";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import type { PrismaClient } from "@rationarium/db";
import { modeleParCode } from "@rationarium/contracts";

/**
 * AUD-01 — les scénarios d'audit les plus proches du planning, de l'activité,
 * des compétences, des événements et des notifications, **rejoués sous les
 * modèles de rôles réels** plutôt que sous les rôles sur mesure de la vague 1.
 *
 * Tous les acteurs sont dans le département A, toutes les cibles dans le
 * département B : chaque refus attendu est un refus de périmètre ou de
 * propriété, jamais de permission.
 */

const RACINE_DB = path.resolve(import.meta.dirname, "../../../../packages/db");
const MDP = "Motdepasse1!";
const HORS = "erreurs:horsPerimetre";

let pg: StartedPostgreSqlContainer;
let app: NestFastifyApplication;
let prisma: PrismaClient;
const comptes = new Map<string, { id: string; jeton?: string }>();

const id = (qui: string) => comptes.get(qui)!.id;
const appel = (methode: string, url: string, qui: string, corps?: unknown) =>
  app.inject({
    method: methode as "GET",
    url,
    cookies: { rationarium_session: comptes.get(qui)!.jeton! },
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

  const deptA = await prisma.departement.create({ data: { nom: "Département A" } });
  const deptB = await prisma.departement.create({ data: { nom: "Département B" } });
  const hash = await hacherMotDePasse(MDP);

  const poser = async (cle: string, modele: string | null, departementId: string, connecter: boolean) => {
    const role = modele
      ? await prisma.role.upsert({
          where: { code: modele },
          update: {},
          create: {
            code: modele, nom: modele,
            permissions: { create: modeleParCode(modele)!.permissions.map((permission) => ({ permission })) },
          },
        })
      : null;
    const login = `rejeu.${cle.toLowerCase()}`;
    const u = await prisma.user.create({
      data: {
        login, email: `${login}@exemple.test`, motDePasseHash: hash, motDePasseAChanger: false,
        prenom: cle, nom: "Rejeu", departementId, roleId: role?.id ?? null,
      },
    });
    comptes.set(cle, { id: u.id });
    if (!connecter) return;
    const r = await app.inject({
      method: "POST", url: "/api/auth/login", payload: { identifiant: login, motDePasse: MDP },
    });
    expect(r.statusCode).toBe(200);
    comptes.get(cle)!.jeton = r.cookies.find((c) => c.name === "rationarium_session")!.value;
  };

  await poser("MANAGER", "MANAGER", deptA.id, true);
  await poser("MANAGER_HR_FOCUS", "MANAGER_HR_FOCUS", deptA.id, true);
  await poser("PROJECT_LEAD", "PROJECT_LEAD", deptA.id, true);
  await poser("BASIC_USER", "BASIC_USER", deptA.id, true);
  await poser("COLLEGUE", "BASIC_USER", deptA.id, false);
  await poser("AGENT_B", "BASIC_USER", deptB.id, false);
}, 300_000);

afterAll(async () => {
  await prisma?.$disconnect();
  await app?.close();
  await pg?.stop();
});

describe("AUD-01 — rejeu sous les modèles de rôles réels", () => {
  it("RG-CMP-07 — MANAGER_HR_FOCUS ne définit pas le niveau d'un agent hors périmètre (D18)", async () => {
    const competence = await prisma.skill.create({ data: { nom: "Rejeu", categorie: "technical" } });
    const dehors = await appel("PUT", `/api/competences/agents/${id("AGENT_B")}/${competence.id}`, "MANAGER_HR_FOCUS", {
      niveau: "expert",
    });
    expect(dehors.statusCode).toBe(403);
    expect(dehors.json()).toMatchObject({ cle: HORS });
    expect(await prisma.userSkill.count({ where: { userId: id("AGENT_B") } })).toBe(0);

    const dedans = await appel("PUT", `/api/competences/agents/${id("COLLEGUE")}/${competence.id}`, "MANAGER_HR_FOCUS", {
      niveau: "expert",
    });
    expect(dedans.statusCode).toBe(200);
  });

  it("RG-PLN-04 — MANAGER ne bascule pas le télétravail d'un agent hors périmètre depuis le planning", async () => {
    const reponse = await appel("PATCH", "/api/planning/teletravail", "MANAGER", {
      userId: id("AGENT_B"), date: "2026-11-10", etat: "telework", version: 0,
    });
    expect(reponse.statusCode).toBe(403);
    expect(reponse.json()).toMatchObject({ cle: HORS });
    expect(await prisma.telework.count({ where: { userId: id("AGENT_B") } })).toBe(0);
  });

  it("RG-PLN-04 — PROJECT_LEAD, sans telework:manage_any, ne bascule pas la cellule d'un collègue", async () => {
    const reponse = await appel("PATCH", "/api/planning/teletravail", "PROJECT_LEAD", {
      userId: id("COLLEGUE"), date: "2026-11-10", etat: "telework", version: 0,
    });
    expect(reponse.statusCode).toBe(403);
    expect(await prisma.telework.count({ where: { userId: id("COLLEGUE") } })).toBe(0);
  });

  it("RG-SCOPE-01 — MANAGER n'assigne pas une permanence à un agent hors périmètre", async () => {
    const permanence = await prisma.predefinedTask.create({ data: { nom: "Accueil rejeu" } });
    const reponse = await appel("POST", "/api/activite/assignations", "MANAGER", {
      predefinedTaskId: permanence.id, userIds: [id("AGENT_B")], date: "2026-11-10", periode: "full_day",
    });
    expect(reponse.statusCode).toBe(403);
    expect(reponse.json()).toMatchObject({ cle: HORS });
    expect(await prisma.predefinedTaskAssignment.count({ where: { userId: id("AGENT_B") } })).toBe(0);
  });

  it("RG-PLN-02 — le planning de MANAGER ne contient aucun agent hors périmètre, même demandé par ressource", async () => {
    const reponse = await appel(
      "GET", `/api/planning?debut=2026-11-09&fin=2026-11-13&ressourceId=${id("AGENT_B")}`, "MANAGER",
    );
    expect(reponse.statusCode).toBe(200);
    const ids = reponse.json().groupes.flatMap((g: { personnes: { id: string }[] }) => g.personnes.map((p) => p.id));
    expect(ids).toEqual([]);

    // Témoin : la même requête sur un collègue du périmètre le rend.
    const temoin = await appel(
      "GET", `/api/planning?debut=2026-11-09&fin=2026-11-13&ressourceId=${id("COLLEGUE")}`, "MANAGER",
    );
    expect(temoin.json().groupes.flatMap((g: { personnes: { id: string }[] }) => g.personnes.map((p) => p.id)))
      .toEqual([id("COLLEGUE")]);
  });

  it("RG-EVT-08 — PROJECT_LEAD ne modifie pas l'événement d'un collègue auquel il ne participe pas", async () => {
    const evt = await prisma.event.create({
      data: {
        titre: "Entretien", date: new Date("2026-11-10"), journeeEntiere: true,
        participants: { create: [{ userId: id("COLLEGUE") }] },
      },
    });
    const reponse = await appel("PATCH", `/api/evenements/${evt.id}`, "PROJECT_LEAD", {
      version: evt.version, titre: "Lu par un autre",
    });
    expect(reponse.statusCode).toBe(403);
    expect((await prisma.event.findUniqueOrThrow({ where: { id: evt.id } })).titre).toBe("Entretien");
  });

  it("EX-NTF-02 — BASIC_USER ne marque pas comme lue la notification d'un collègue", async () => {
    const notification = await prisma.notification.create({
      data: { userId: id("COLLEGUE"), type: "task.assigned", titre: "Pour le collègue", contenu: "Privé" },
    });
    const marquer = await appel("PATCH", `/api/notifications/${notification.id}`, "BASIC_USER");
    expect(marquer.statusCode).toBe(404);
    expect((await prisma.notification.findUniqueOrThrow({ where: { id: notification.id } })).lue).toBe(false);

    const liste = await appel("GET", "/api/notifications", "BASIC_USER");
    expect(liste.statusCode).toBe(200);
    expect(JSON.stringify(liste.json())).not.toContain(notification.id);
  });
});
