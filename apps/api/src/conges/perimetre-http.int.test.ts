import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { execFileSync } from "node:child_process";
import path from "node:path";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";

/**
 * `RG-CNG-34`, `RG-CNG-35` — qui peut décider d'une demande de congé, et qui
 * peut la corriger ou la retirer.
 *
 * Les routes de décision n'étaient gardées que par `leaves:approve` ; celles
 * de correction et de suppression par `leaves:update` et `leaves:delete`, que
 * le SOCLE donne à tout agent. Le service ne requestionnait pas la cible :
 * n'importe quel manager approuvait le congé de n'importe quel agent de
 * l'instance, et n'importe quel agent supprimait la demande d'un collègue.
 *
 * Joué sur la chaîne HTTP complète : c'est le contrôleur qui pose la borne, et
 * `leaves:manage_any` — détenue par MANAGER, HR_OFFICER, PORTFOLIO_MANAGER… —
 * ne vaut PAS portée globale. D'où les deux managers ci-dessous, l'un dans le
 * département de l'agent, l'autre sans département.
 */

const RACINE_DB = path.resolve(import.meta.dirname, "../../../../packages/db");
const MOT_DE_PASSE = "Corr3ct-Horse-Battery!";
const utc = (s: string) => new Date(`${s}T00:00:00.000Z`);

let pg: StartedPostgreSqlContainer;
let app: NestFastifyApplication;
let prisma: import("@rationarium/db").PrismaClient;

type Compte = { id: string; jeton: string };

const appel = (methode: string, url: string, jeton: string, corps?: unknown) =>
  app.inject({
    method: methode as "GET",
    url,
    cookies: { rationarium_session: jeton },
    ...(corps !== undefined ? { payload: corps as object } : {}),
  });

const roles = new Map<string, string>();

/** Un compte réel, son rôle, et sa session obtenue par le VRAI parcours. */
async function compte(
  login: string,
  permissions: string[],
  departementId?: string,
): Promise<Compte> {
  const { hacherMotDePasse } = await import("../auth/mots-de-passe.js");
  const cle = permissions.join(",");
  let roleId = roles.get(cle);
  if (!roleId) {
    const code = `TEST_${roles.size}`;
    roleId = (
      await prisma.role.create({
        data: { code, nom: code, permissions: { create: permissions.map((permission) => ({ permission })) } },
      })
    ).id;
    roles.set(cle, roleId);
  }
  const { id } = await prisma.user.create({
    data: {
      login,
      email: `${login}@exemple.fr`,
      motDePasseHash: await hacherMotDePasse(MOT_DE_PASSE),
      prenom: "Test",
      nom: login,
      motDePasseAChanger: false,
      roleId,
      ...(departementId ? { departementId } : {}),
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

const AGENT = ["leaves:read", "leaves:create", "leaves:update", "leaves:delete", "leaves:request_cancellation"];
const VALIDATEUR = ["leaves:read", "leaves:read_team", "leaves:approve"];
/** Le modèle MANAGER, pour ce qui touche aux congés : `leaves:manage_any` sans portée globale. */
const GESTIONNAIRE = [...AGENT, "leaves:read_team", "leaves:approve", "leaves:manage_any"];

let agent: Compte;
let collegue: Compte;
let validateur: Compte;
let delegue: Compte;
let gestionnaireDuDepartement: Compte;
let managerSansDepartement: Compte;
let typeId: string;

/** Une demande d'un jour ouvré, chaque fois sur une semaine différente. */
let semaine = 0;
async function demande(statut: "pending" | "cancellation_requested" = "pending") {
  const jour = new Date(utc("2027-01-04").getTime() + 7 * 86_400_000 * semaine++);
  return prisma.leave.create({
    data: {
      userId: agent.id,
      typeId,
      dateDebut: jour,
      dateFin: jour,
      joursOuvres: 1,
      statut,
      validateurId: validateur.id,
      repartitions: { create: [{ annee: 2027, jours: 1 }] },
    },
  });
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
  app = await creerApplication();
  await app.init();
  await app.getHttpAdapter().getInstance().ready();

  const { creerClient } = await import("@rationarium/db");
  prisma = creerClient(pg.getConnectionUri());

  const departementA = await prisma.departement.create({ data: { nom: "Département A" } });
  await prisma.departement.create({ data: { nom: "Département B" } });

  agent = await compte("agent", AGENT, departementA.id);
  collegue = await compte("collegue", AGENT, departementA.id);
  validateur = await compte("validateur", VALIDATEUR, departementA.id);
  delegue = await compte("delegue", VALIDATEUR, departementA.id);
  gestionnaireDuDepartement = await compte("gestionnaire", GESTIONNAIRE, departementA.id);
  managerSansDepartement = await compte("manager.ailleurs", GESTIONNAIRE);

  // RG-CNG-08 — le validateur est le manager du service de l'agent.
  await prisma.service.create({
    data: {
      nom: "Service A",
      departementId: departementA.id,
      managerId: validateur.id,
      membres: { create: [{ userId: validateur.id }, { userId: agent.id }, { userId: collegue.id }] },
    },
  });

  typeId = (await prisma.leaveType.create({ data: { code: "CP_TEST", nom: "Congés payés" } })).id;
  await prisma.leaveBalance.create({ data: { userId: null, typeId, annee: 2027, joursAttribues: 50 } });
}, 300_000);

afterAll(async () => {
  await prisma?.$disconnect();
  await app?.close();
  await pg?.stop();
});

describe("RG-CNG-34 — décider d'une demande exige d'en être le validateur, ou de gérer l'agent", () => {
  it("RG-CNG-34 — un manager sans département ne peut ni approuver, ni refuser, ni traiter une annulation hors de son périmètre", async () => {
    const aApprouver = await demande();
    const aRefuser = await demande();
    const enAnnulation = await demande("cancellation_requested");
    const { jeton } = managerSansDepartement;

    const approbation = await appel("POST", `/api/conges/${aApprouver.id}/approuver`, jeton, { version: 1 });
    const refus = await appel("POST", `/api/conges/${aRefuser.id}/refuser`, jeton, {
      motifRefus: "Effectif insuffisant",
      version: 1,
    });
    const annulation = await appel("POST", `/api/conges/${enAnnulation.id}/annulation/traiter`, jeton, {
      accepte: true,
      version: 1,
    });

    for (const r of [approbation, refus, annulation]) {
      expect(r.statusCode).toBe(403);
      expect(r.json()).toMatchObject({ cle: "erreurs:horsPerimetre" });
    }
    const statuts = await prisma.leave.findMany({
      where: { id: { in: [aApprouver.id, aRefuser.id, enAnnulation.id] } },
      select: { id: true, statut: true },
    });
    expect(Object.fromEntries(statuts.map((c) => [c.id, c.statut]))).toEqual({
      [aApprouver.id]: "pending",
      [aRefuser.id]: "pending",
      [enAnnulation.id]: "cancellation_requested",
    });
  });

  it("RG-CNG-34 — le validateur enregistré approuve, et la demande figure dans son onglet « À valider »", async () => {
    const c = await demande();

    const aValider = await appel("GET", "/api/conges?aValider=true", validateur.jeton);
    expect((aValider.json() as { id: string }[]).map((d) => d.id)).toContain(c.id);

    const r = await appel("POST", `/api/conges/${c.id}/approuver`, validateur.jeton, { version: 1 });
    expect(r.statusCode).toBe(201);
    expect((await prisma.leave.findUniqueOrThrow({ where: { id: c.id } })).statut).toBe("approved");
  });

  it("RG-CNG-34 — le délégué actif du validateur (RG-CNG-10) refuse, sans être le validateur enregistré", async () => {
    const delegation = await prisma.leaveDelegation.create({
      data: {
        delegantId: validateur.id,
        delegueId: delegue.id,
        dateDebut: utc("2000-01-01"),
        dateFin: utc("2999-12-31"),
      },
    });
    try {
      const c = await demande();
      const r = await appel("POST", `/api/conges/${c.id}/refuser`, delegue.jeton, {
        motifRefus: "Période chargée",
        version: 1,
      });
      expect(r.statusCode).toBe(201);
      expect((await prisma.leave.findUniqueOrThrow({ where: { id: c.id } })).statut).toBe("refused");
    } finally {
      await prisma.leaveDelegation.delete({ where: { id: delegation.id } });
    }
  });

  it("RG-CNG-34 — contre-témoin : sans délégation active, le même compte est refusé", async () => {
    const c = await demande();
    const r = await appel("POST", `/api/conges/${c.id}/approuver`, delegue.jeton, { version: 1 });
    expect(r.statusCode).toBe(403);
    expect(r.json()).toMatchObject({ cle: "erreurs:horsPerimetre" });
  });

  it("RG-CNG-34 — `leaves:manage_any` avec l'agent dans son département approuve, refuse et traite l'annulation", async () => {
    const aApprouver = await demande();
    const aRefuser = await demande();
    const enAnnulation = await demande("cancellation_requested");
    const { jeton } = gestionnaireDuDepartement;

    const approbation = await appel("POST", `/api/conges/${aApprouver.id}/approuver`, jeton, { version: 1 });
    const refus = await appel("POST", `/api/conges/${aRefuser.id}/refuser`, jeton, {
      motifRefus: "Effectif insuffisant",
      version: 1,
    });
    const annulation = await appel("POST", `/api/conges/${enAnnulation.id}/annulation/traiter`, jeton, {
      accepte: true,
      version: 1,
    });

    expect([approbation.statusCode, refus.statusCode, annulation.statusCode]).toEqual([201, 201, 201]);
  });
});

describe("RG-CNG-35 — corriger ou retirer une demande exige d'en être l'agent, ou de gérer l'agent", () => {
  /** Chaque correction vise un jour à elle : deux corrections au même jour se chevaucheraient (RG-CNG-27). */
  const jours = ["2027-11-08", "2027-11-15", "2027-11-22", "2027-11-29", "2027-12-06", "2027-12-13"];
  const correction = (version: number) => {
    const jour = jours.shift()!;
    return { dateDebut: jour, dateFin: jour, version };
  };

  it("RG-CNG-35 — un agent ne modifie pas la demande d'un collègue", async () => {
    const c = await demande();
    const r = await appel("PATCH", `/api/conges/${c.id}`, collegue.jeton, correction(1));
    expect(r.statusCode).toBe(403);
    expect(r.json()).toMatchObject({ cle: "erreurs:horsPerimetre" });
    expect((await prisma.leave.findUniqueOrThrow({ where: { id: c.id } })).dateDebut).toEqual(c.dateDebut);
  });

  it("RG-CNG-35 — un agent ne supprime pas la demande d'un collègue", async () => {
    const c = await demande();
    const r = await appel("DELETE", `/api/conges/${c.id}?version=1`, collegue.jeton);
    expect(r.statusCode).toBe(403);
    expect(r.json()).toMatchObject({ cle: "erreurs:horsPerimetre" });
    expect(await prisma.leave.findUnique({ where: { id: c.id } })).not.toBeNull();
  });

  it("RG-CNG-35 — un manager sans département ne modifie ni ne supprime la demande d'un agent hors périmètre", async () => {
    const c = await demande();
    const modification = await appel("PATCH", `/api/conges/${c.id}`, managerSansDepartement.jeton, correction(1));
    const suppression = await appel("DELETE", `/api/conges/${c.id}?version=1`, managerSansDepartement.jeton);
    expect([modification.statusCode, suppression.statusCode]).toEqual([403, 403]);
  });

  it("RG-CNG-35 — l'agent modifie puis supprime sa propre demande", async () => {
    const c = await demande();
    const modification = await appel("PATCH", `/api/conges/${c.id}`, agent.jeton, correction(1));
    expect(modification.statusCode).toBe(200);
    const suppression = await appel("DELETE", `/api/conges/${c.id}?version=2`, agent.jeton);
    expect(suppression.statusCode).toBe(200);
    expect(await prisma.leave.findUnique({ where: { id: c.id } })).toBeNull();
  });

  it("RG-CNG-35 — `leaves:manage_any` avec l'agent dans son département modifie et supprime", async () => {
    const c = await demande();
    const modification = await appel("PATCH", `/api/conges/${c.id}`, gestionnaireDuDepartement.jeton, correction(1));
    expect(modification.statusCode).toBe(200);
    const suppression = await appel("DELETE", `/api/conges/${c.id}?version=2`, gestionnaireDuDepartement.jeton);
    expect(suppression.statusCode).toBe(200);
  });
});
