import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { creerClient, type PrismaClient } from "@rationarium/db";
import { TeletravailService } from "./teletravail.service.js";
import { AuditService } from "../commun/audit.service.js";
import { PerimetreService } from "../commun/perimetre.service.js";

/**
 * `RG-TLT-07` — « Agir sur le télétravail d'autrui exige une permission dédiée,
 * distincte selon l'action. »
 *
 * **La règle était énoncée au cadrage et tenue nulle part.** `basculer`,
 * `generer` et `statistiques` recevaient `userId` et `acteurId` et ne les
 * comparaient jamais ; les trois routes qui les servent font retomber `userId`
 * sur l'acteur *par défaut*, ce qui donne l'apparence d'un contrôle là où il n'y
 * en avait aucun. Tout porteur de `telework:create` — c'est-à-dire tout agent —
 * pouvait poser du télétravail sur le calendrier de n'importe qui.
 *
 * Le balayage de L-38 l'a trouvée sur `basculer` ; le contrôle de L-40 a montré
 * que **trois routes** passaient par cette absence, pas une.
 *
 * Ce fichier est neuf : `teletravail/` était le seul module métier substantiel
 * sans test à son nom, ses règles vivant dans `evenements/vague3.int.test.ts`
 * qui en mélange trois.
 */

const RACINE_DB = path.resolve(import.meta.dirname, "../../../../packages/db");
const utc = (s: string) => new Date(`${s}T00:00:00.000Z`);
const uuid = () => crypto.randomUUID();

let pg: StartedPostgreSqlContainer;
let prisma: PrismaClient;
let teletravail: TeletravailService;

/** Les droits d'un agent ordinaire : il saisit son télétravail, pas celui d'autrui. */
const AGENT: ReadonlySet<string> = new Set([
  "telework:read",
  "telework:create",
  "telework:update",
  "telework:generate",
]);

/** Les droits d'un encadrant : le bloc `ENCADREMENT` du catalogue de rôles. */
const ENCADRANT: ReadonlySet<string> = new Set([
  ...AGENT,
  "telework:read_team",
  "telework:manage_any",
  "telework:manage_rules",
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
  teletravail = new TeletravailService(prisma as never, audit, perimetres);
}, 180_000);

afterAll(async () => {
  await prisma?.$disconnect();
  await pg?.stop();
});

describe("RG-TLT-07 — agir sur le télétravail d'autrui", () => {
  it("RG-TLT-07 — REFUSE de poser du télétravail sur le calendrier d'un autre", async () => {
    const moi = await agent();
    const autre = await agent();

    await expect(
      teletravail.basculer(autre, utc("2026-09-07"), "telework", moi, AGENT),
    ).rejects.toMatchObject({
      code: "autrui_sans_permission",
      detail: { permission: "telework:manage_any" },
    });

    // Et rien n'a été écrit : un refus qui laisse une trace serait pire.
    const pose = await prisma.telework.count({ where: { userId: autre } });
    expect(pose).toBe(0);
  });

  it("RG-TLT-07 — laisse chacun poser le SIEN, c'est le cas nominal", async () => {
    const moi = await agent();
    await expect(
      teletravail.basculer(moi, utc("2026-09-08"), "telework", moi, AGENT),
    ).resolves.toBeDefined();
  });

  it("RG-TLT-07 — un encadrant, lui, pose celui de son équipe", async () => {
    const chef = await agent();
    const membre = await agent();
    await expect(
      teletravail.basculer(membre, utc("2026-09-09"), "telework", chef, ENCADRANT),
    ).resolves.toBeDefined();
  });

  it("RG-TLT-07 — REFUSE de GÉNÉRER pour un autre sans telework:manage_any", async () => {
    /*
     * `generer` est l'action la plus lourde : elle pose des dizaines de jours
     * d'un coup. C'est celle où l'absence de contrôle coûtait le plus.
     */
    const moi = await agent();
    const autre = await agent();
    await expect(
      teletravail.generer(autre, utc("2026-09-01"), utc("2026-09-30"), moi, AGENT),
    ).rejects.toMatchObject({ code: "autrui_sans_permission" });
  });

  it("RG-TLT-07 — LIRE les statistiques d'un autre demande read_team, pas manage_any", async () => {
    /*
     * « Distincte selon l'action » : consulter et écrire ne sont pas le même
     * geste et ne se gouvernent pas de la même permission. Un encadrant qui
     * consulte n'a pas besoin du droit d'écrire.
     */
    const moi = await agent();
    const autre = await agent();

    await expect(teletravail.statistiques(autre, 2026, moi, AGENT)).rejects.toMatchObject({
      code: "autrui_sans_permission",
      detail: { permission: "telework:read_team" },
    });

    const lecteur: ReadonlySet<string> = new Set(["telework:read", "telework:read_team"]);
    await expect(teletravail.statistiques(autre, 2026, moi, lecteur)).resolves.toBeDefined();
  });

  it("RG-TLT-07 — consulter SES propres statistiques ne demande rien de plus", async () => {
    const moi = await agent();
    await expect(teletravail.statistiques(moi, 2026, moi, AGENT)).resolves.toMatchObject({
      annee: 2026,
    });
  });

  it("le champ `annee` porte bien l'ANNÉE, pas un décompte", async () => {
    /*
     * Trouvé en écrivant les tests ci-dessus : `statistiques` rendait
     * `annee: jours.length`. Le champ nommé « année » portait un nombre de
     * jours. Personne ne l'avait vu parce que personne n'appelait la route —
     * aucun écran ne la consommait, donc aucune assertion ne portait sur sa
     * forme. C'est le défaut que « une capacité sans client » cache par nature.
     */
    const moi = await agent();
    await prisma.telework.create({
      data: { userId: moi, date: utc("2026-03-10"), etat: "telework" },
    });
    const s = await teletravail.statistiques(moi, 2026, moi, AGENT);
    expect(s.annee).toBe(2026);
    expect(s.total).toBe(1);
    expect(s.parMois[2]).toBe(1);
  });
});
