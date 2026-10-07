import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { execFileSync } from "node:child_process";
import path from "node:path";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import type { PrismaClient } from "@rationarium/db";

/**
 * `RG-EVT-08` — **lire au-delà de soi ne donne pas le droit d'écrire.**
 *
 * Le défaut (AUD-01) : les écritures sur un événement partageaient le prédicat
 * de la lecture, que `events:readAll` ou un périmètre global (`users:readAll`)
 * lèvent. Une permission de LECTURE ouvrait donc la modification, la
 * suppression et la gestion des participants de tous les événements de
 * l'instance — alors que le catalogue réserve cet élargissement à
 * `events:manage_any` (§ 3.2 : `:readAll` lit, `:manage_any` modifie).
 *
 * Exercé par HTTP, avec la vraie connexion.
 */

const RACINE_DB = path.resolve(import.meta.dirname, "../../../../packages/db");
const MDP = "Motdepasse1!";
const ECRITURE = ["events:read", "events:update", "events:delete"];

let pg: StartedPostgreSqlContainer;
let app: NestFastifyApplication;
let prisma: PrismaClient;
const comptes = new Map<string, { id: string; jeton: string }>();

const appel = (methode: string, url: string, qui: string, corps?: unknown) =>
  app.inject({
    method: methode as "GET",
    url,
    cookies: { rationarium_session: comptes.get(qui)!.jeton },
    ...(corps === undefined ? {} : { payload: corps as object }),
  });

/** Un événement isolé dont seul « Participant » fait partie. */
const poserEvenement = (titre: string) =>
  prisma.event.create({
    data: {
      titre, date: new Date("2026-11-10"), journeeEntiere: true,
      participants: { create: [{ userId: comptes.get("PARTICIPANT")!.id }] },
    },
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

  // Tous dans le même département : le refus attendu ne doit pas venir du
  // périmètre organisationnel, mais de la seule propriété de l'événement.
  const departement = await prisma.departement.create({ data: { nom: "Département" } });
  const hash = await hacherMotDePasse(MDP);
  const roles: [string, string[]][] = [
    ["PARTICIPANT", ECRITURE],
    ["LECTEUR_LARGE", [...ECRITURE, "events:readAll"]],
    ["PERIMETRE_GLOBAL", [...ECRITURE, "users:readAll"]],
    ["GESTIONNAIRE", [...ECRITURE, "events:manage_any"]],
  ];
  for (const [cle, permissions] of roles) {
    const role = await prisma.role.create({
      data: { code: `EVT_${cle}`, nom: cle, permissions: { create: permissions.map((permission) => ({ permission })) } },
    });
    const login = `evt.${cle.toLowerCase()}`;
    const u = await prisma.user.create({
      data: {
        login, email: `${login}@exemple.test`, motDePasseHash: hash, motDePasseAChanger: false,
        prenom: cle, nom: "Événements", departementId: departement.id, roleId: role.id,
      },
    });
    const r = await app.inject({
      method: "POST", url: "/api/auth/login", payload: { identifiant: login, motDePasse: MDP },
    });
    expect(r.statusCode).toBe(200);
    comptes.set(cle, { id: u.id, jeton: r.cookies.find((c) => c.name === "rationarium_session")!.value });
  }
}, 300_000);

afterAll(async () => {
  await prisma?.$disconnect();
  await app?.close();
  await pg?.stop();
});

describe("RG-EVT-08 — écrire sur un événement exige d'y participer ou events:manage_any", () => {
  for (const qui of ["LECTEUR_LARGE", "PERIMETRE_GLOBAL"]) {
    it(`RG-EVT-08 — ${qui} lit l'événement d'autrui mais ne le modifie ni ne le supprime`, async () => {
      const evt = await poserEvenement(`Réunion ${qui}`);

      const lecture = await appel("GET", "/api/evenements?debut=2026-11-01&fin=2026-11-30", qui);
      expect(lecture.statusCode).toBe(200);
      expect(lecture.json().map((e: { id: string }) => e.id)).toContain(evt.id);

      const modifier = await appel("PATCH", `/api/evenements/${evt.id}`, qui, { version: evt.version, titre: "Détourné" });
      expect(modifier.statusCode).toBe(403);
      expect(modifier.json()).toMatchObject({ cle: "erreurs:horsPerimetre" });

      const supprimer = await appel("DELETE", `/api/evenements/${evt.id}?version=${evt.version}`, qui);
      expect(supprimer.statusCode).toBe(403);

      const s_inviter = await appel("POST", `/api/evenements/${evt.id}/participants`, qui, { userId: comptes.get(qui)!.id });
      expect(s_inviter.statusCode).toBe(403);

      const retirer = await appel("DELETE", `/api/evenements/${evt.id}/participants/${comptes.get("PARTICIPANT")!.id}`, qui);
      expect(retirer.statusCode).toBe(403);

      const relu = await prisma.event.findUniqueOrThrow({
        where: { id: evt.id },
        include: { participants: { select: { userId: true } } },
      });
      expect(relu.titre).toBe(`Réunion ${qui}`);
      expect(relu.participants.map((p) => p.userId)).toEqual([comptes.get("PARTICIPANT")!.id]);
    });
  }

  it("RG-EVT-08 — ni n'arrête la récurrence d'une série d'autrui", async () => {
    const serie = await prisma.event.create({
      data: {
        titre: "Série", date: new Date("2026-11-02"), journeeEntiere: true,
        recurrenceFrequence: 1, recurrenceJourSemaine: 1, recurrenceFin: new Date("2026-12-28"),
        participants: { create: [{ userId: comptes.get("PARTICIPANT")!.id }] },
      },
    });
    const reponse = await appel("POST", `/api/evenements/${serie.id}/arreter`, "LECTEUR_LARGE", {
      aPartirDe: "2026-11-20", version: serie.version,
    });
    expect(reponse.statusCode).toBe(403);
    expect((await prisma.event.findUniqueOrThrow({ where: { id: serie.id } })).recurrenceFin)
      .toEqual(new Date("2026-12-28"));
  });

  it("RG-EVT-08 — le participant modifie, et events:manage_any modifie sans participer", async () => {
    const evt = await poserEvenement("Point d'équipe");
    const parParticipant = await appel("PATCH", `/api/evenements/${evt.id}`, "PARTICIPANT", {
      version: evt.version, titre: "Point d'équipe déplacé",
    });
    expect(parParticipant.statusCode).toBe(200);

    const version = (await prisma.event.findUniqueOrThrow({ where: { id: evt.id } })).version;
    const parGestionnaire = await appel("PATCH", `/api/evenements/${evt.id}`, "GESTIONNAIRE", {
      version, titre: "Point d'équipe arbitré",
    });
    expect(parGestionnaire.statusCode).toBe(200);
    expect((await prisma.event.findUniqueOrThrow({ where: { id: evt.id } })).titre).toBe("Point d'équipe arbitré");
  });
});
