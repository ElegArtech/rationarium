import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { creerClient, type PrismaClient } from "@rationarium/db";
import { TempsService } from "./temps.service.js";
import { AuditService } from "../commun/audit.service.js";
import { PerimetreService } from "../commun/perimetre.service.js";

/**
 * `RG-TMP-04` — « Déclarer pour un tiers exige une permission dédiée. »
 *
 * **Trois branches se contredisaient.** La règle est au cadrage. La permission
 * `time_tracking:declare_for_third_party` est au catalogue. Et : aucun modèle de
 * rôle ne la détenait, aucun code ne l'exigeait. Pire, `temps.service.ts`
 * **calculait** `pourAutrui` pour le journal d'audit sans jamais rien refuser —
 * la trace disait exactement ce que le contrôle aurait dû empêcher.
 *
 * Trouvé par le balayage des 191 routes du lot L-38, laissé ouvert parce que
 * l'appliquer sans revoir les modèles de rôles aurait rendu la déclaration pour
 * autrui impossible à tout le monde.
 *
 * `RG-TMP-03` écrit « l'acteur d'une saisie (agent **ou** tiers) » : les deux
 * sont des sortes d'acteur. « Déclarer pour un tiers » couvre donc aussi bien un
 * collègue qu'un intervenant extérieur — précision portée dans `cadrage/01`.
 */

const RACINE_DB = path.resolve(import.meta.dirname, "../../../../packages/db");
const utc = (s: string) => new Date(`${s}T00:00:00.000Z`);
const uuid = () => crypto.randomUUID();

let pg: StartedPostgreSqlContainer;
let prisma: PrismaClient;
let temps: TempsService;
let projet: string;

/** Un agent ordinaire : il déclare son temps, pas celui d'autrui. */
const AGENT: ReadonlySet<string> = new Set(["time_tracking:read", "time_tracking:create"]);

/** L'encadrement, qui porte désormais la permission dédiée. */
const ENCADRANT: ReadonlySet<string> = new Set([
  ...AGENT,
  "time_tracking:read_team",
  "time_tracking:declare_for_third_party",
]);

async function agent() {
  const id = uuid();
  await prisma.user.create({
    data: {
      id,
      login: `u-${id.slice(0, 8)}`,
      email: `${id.slice(0, 8)}@x.fr`,
      motDePasseHash: "x",
      prenom: "A",
      nom: "T",
    },
  });
  return id;
}

beforeAll(async () => {
  pg = await new PostgreSqlContainer("postgres:18-alpine").start();
  execFileSync("pnpm", ["exec", "prisma", "migrate", "deploy"], {
    cwd: RACINE_DB,
    env: { ...process.env, DATABASE_URL: pg.getConnectionUri() },
    stdio: "pipe",
  });
  prisma = creerClient(pg.getConnectionUri());
  const audit = new AuditService(prisma as never);
  const perimetres = new PerimetreService(prisma as never);
  temps = new TempsService(prisma as never, audit, perimetres);

  const p = await prisma.project.create({
    data: { nom: "Refonte", dateDebut: utc("2026-01-01"), dateFin: utc("2026-12-31") },
  });
  projet = p.id;
}, 180_000);

afterAll(async () => {
  await prisma?.$disconnect();
  await pg?.stop();
});

const saisie = (userId: string) => ({
  userId,
  date: utc("2026-09-10"),
  heures: 2,
  projectId: projet,
});

describe("RG-TMP-04 — déclarer pour quelqu'un d'autre", () => {
  it("RG-TMP-04 — REFUSE de déclarer du temps sur le compte d'un collègue", async () => {
    const moi = await agent();
    const autre = await agent();

    await expect(temps.saisir(saisie(autre), moi, AGENT)).rejects.toMatchObject({
      code: "autrui_sans_permission",
      detail: { permission: "time_tracking:declare_for_third_party" },
    });

    // Rien n'a été écrit : le refus est total.
    expect(await prisma.timeEntry.count({ where: { userId: autre } })).toBe(0);
  });

  it("RG-TMP-04 — laisse chacun déclarer le SIEN, c'est le cas nominal", async () => {
    const moi = await agent();
    await expect(temps.saisir(saisie(moi), moi, AGENT)).resolves.toBeDefined();
  });

  it("RG-TMP-04 — un encadrant déclare pour son équipe", async () => {
    const chef = await agent();
    const membre = await agent();
    await expect(temps.saisir(saisie(membre), chef, ENCADRANT)).resolves.toBeDefined();
  });

  it("RG-TMP-04 — REFUSE aussi de déclarer pour un intervenant EXTÉRIEUR", async () => {
    /*
     * Le cas que la permission nomme littéralement. Il était aussi ouvert que
     * l'autre : `thirdPartyId` passait sans le moindre contrôle.
     */
    const moi = await agent();
    const tiers = await prisma.thirdParty.create({
      data: { type: "individual", contactNom: "Durand" },
    });

    await expect(
      temps.saisir(
        { thirdPartyId: tiers.id, date: utc("2026-09-11"), heures: 3, projectId: projet },
        moi,
        AGENT,
      ),
    ).rejects.toMatchObject({ code: "autrui_sans_permission", detail: { champ: "thirdPartyId" } });
  });

  it("le journal d'audit TRAÇAIT `pourAutrui` sans que rien ne le refuse", async () => {
    /*
     * Le test qui nomme la nature du défaut. La trace existait, le contrôle non
     * — un journal qui décrit une situation que rien n'empêche donne
     * l'impression que la règle est tenue.
     */
    const chef = await agent();
    const membre = await agent();
    await temps.saisir(saisie(membre), chef, ENCADRANT);

    const trace = await prisma.auditLog.findFirst({
      where: { action: "time_entry.create", acteurId: chef },
      orderBy: { horodatage: "desc" },
    });
    expect((trace?.detail as { pourAutrui?: boolean } | null)?.pourAutrui).toBe(true);
  });
});
