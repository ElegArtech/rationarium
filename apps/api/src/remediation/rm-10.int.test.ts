import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { execFileSync } from "node:child_process";
import path from "node:path";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { creerClient, type PrismaClient } from "@rationarium/db";
import { modeleParCode } from "@rationarium/contracts";
import { hacherMotDePasse } from "../auth/mots-de-passe.js";

const RACINE_DB = path.resolve(import.meta.dirname, "../../../../packages/db");
const date = (jour: string) => new Date(`${jour}T00:00:00.000Z`);

let pg: StartedPostgreSqlContainer;
let app: NestFastifyApplication;
let prisma: PrismaClient;
let karim: { id: string; jeton: string };
let hugo: { id: string; jeton: string };

async function compte(code: "ADMIN" | "HR_OFFICER") {
  const modele = modeleParCode(code);
  if (!modele) throw new Error(`Modèle ${code} absent du catalogue.`);
  const role = await prisma.role.create({
    data: {
      code,
      nom: code,
      systeme: modele.systeme,
      permissions: { create: modele.permissions.map((permission) => ({ permission })) },
    },
  });
  const id = crypto.randomUUID();
  await prisma.user.create({
    data: {
      id,
      login: code.toLowerCase(),
      email: `${code.toLowerCase()}@exemple.fr`,
      prenom: code,
      nom: "RM10",
      roleId: role.id,
      motDePasseHash: await hacherMotDePasse("Bonjour12!"),
      motDePasseAChanger: false,
    },
  });
  const connexion = await app.inject({
    method: "POST",
    url: "/api/auth/login",
    payload: { identifiant: code.toLowerCase(), motDePasse: "Bonjour12!" },
  });
  expect(connexion.statusCode).toBe(200);
  return {
    id,
    jeton: connexion.cookies.find((cookie) => cookie.name === "rationarium_session")!.value,
  };
}

const appel = (
  acteur: { jeton: string },
  methode: "GET" | "POST" | "PATCH",
  url: string,
  corps?: object,
) => app.inject({
  method: methode,
  url: `/api${url}`,
  cookies: { rationarium_session: acteur.jeton },
  ...(corps ? { payload: corps } : {}),
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
  prisma = creerClient(pg.getConnectionUri());
  karim = await compte("ADMIN");
  hugo = await compte("HR_OFFICER");
}, 300_000);

afterAll(async () => {
  await prisma?.$disconnect();
  await app?.close();
  await pg?.stop();
});

beforeEach(async () => {
  await prisma.schoolVacation.deleteMany();
  await prisma.holiday.deleteMany();
  await prisma.setting.deleteMany({
    where: { cle: { in: ["planning.schoolZone", "display.dateFormat", "smtp.password"] } },
  });
  await prisma.auditLog.deleteMany({
    where: { action: { in: ["holiday.update", "school_vacation.import", "access.denied"] } },
  });
});

describe("RM-10 — calendrier et habilitations RH", () => {
  it("EX-PRM-03 — les paramètres publics sont consultables sans authentification et aucun réglage privé ne fuit", async () => {
    await prisma.setting.createMany({
      data: [
        { cle: "display.dateFormat", valeur: "JJ/MM/AAAA", public: true },
        { cle: "smtp.password", valeur: "secret-interne", public: false },
      ],
    });

    const reponse = await app.inject({ method: "GET", url: "/api/parametrage" });

    expect(reponse.statusCode).toBe(200);
    expect(reponse.json()).toMatchObject({ "display.dateFormat": "JJ/MM/AAAA" });
    expect(reponse.json()).not.toHaveProperty("smtp.password");
    expect(reponse.cookies).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "rationarium_session" }),
    ]));
  });

  it("RG-GEN-07, RG-PRM-01 et RG-PRM-02 — la qualification d’un férié est versionnée et agit sur le décompte", async () => {
    const ferie = await prisma.holiday.create({
      data: { date: date("2026-09-14"), libelle: "Fête locale" },
    });
    const modifie = await appel(karim, "PATCH", `/parametrage/feries/${ferie.id}`, {
      version: ferie.version,
      ouvre: true,
      recurrent: true,
    });
    expect(modifie.statusCode).toBe(200);
    expect(modifie.json()).toMatchObject({ ouvre: true, recurrent: true, version: 2 });
    const decompte = await appel(
      karim,
      "GET",
      "/parametrage/jours-ouvres?debut=2026-09-14&fin=2026-09-14",
    );
    expect(decompte.statusCode).toBe(200);
    expect(decompte.json()).toMatchObject({ jours: 1 });
    expect(await prisma.auditLog.count({
      where: { action: "holiday.update", entiteId: ferie.id, acteurId: karim.id },
    })).toBe(1);

    const conflit = await appel(karim, "PATCH", `/parametrage/feries/${ferie.id}`, {
      version: ferie.version,
      ouvre: false,
    });
    expect(conflit.statusCode).toBe(409);
    expect((await prisma.holiday.findUniqueOrThrow({ where: { id: ferie.id } })).ouvre).toBe(true);
    // L'intercepteur ne trace que l'écriture aboutie, pas une tentative sans mutation.
    expect(await prisma.auditLog.count({ where: { action: "holiday.update", entiteId: ferie.id } })).toBe(1);
  });

  it("RG-PRM-04 et D-RM-15 — l’import officiel est borné au couple année-zone et son rejeu est idempotent", async () => {
    await prisma.setting.create({
      data: { cle: "planning.schoolZone", valeur: "B", public: true },
    });
    const corps = { anneeScolaire: "2026-2027" };
    const [premier, concurrent] = await Promise.all([
      appel(karim, "POST", "/parametrage/vacances/importer", corps),
      appel(karim, "POST", "/parametrage/vacances/importer", corps),
    ]);
    expect(premier.statusCode).toBe(201);
    expect(concurrent.statusCode).toBe(201);
    expect([premier.json(), concurrent.json()]).toEqual(expect.arrayContaining([
      { crees: 4, existants: 0 },
      { crees: 0, existants: 4 },
    ]));
    const rejeu = await appel(karim, "POST", "/parametrage/vacances/importer", corps);
    expect(rejeu.json()).toEqual({ crees: 0, existants: 4 });
    expect(await prisma.schoolVacation.count({ where: { zone: "B", anneeScolaire: "2026-2027" } })).toBe(4);
    expect(await prisma.schoolVacation.count({ where: { zone: { not: "B" } } })).toBe(0);
    expect(await prisma.auditLog.count({
      where: { action: "school_vacation.import", acteurId: karim.id },
    })).toBe(3);
    const trace = await prisma.auditLog.findFirstOrThrow({
      where: { action: "school_vacation.import", acteurId: karim.id },
      orderBy: { horodatage: "desc" },
    });
    expect(trace.detail).toMatchObject({
      anneeScolaire: "2026-2027",
      zone: "B",
      crees: 0,
      existants: 4,
      collecte: "2026-09-10",
      sha256Source: "777eb79d413ebaadd9be0338c5fa09a7261f5ddd0f3eb782d4f3c121cd35fa6e",
      nombrePeriodes: 171,
    });
  });

  it("RG-GEN-03 et D-RM-15 — une combinaison absente est refusée explicitement sans écriture", async () => {
    const reponse = await appel(karim, "POST", "/parametrage/vacances/importer", {
      anneeScolaire: "2030-2031",
      zone: "C",
    });
    expect(reponse.statusCode).toBe(422);
    expect(reponse.json()).toMatchObject({ cle: "erreurs:calendrierScolaireIndisponible" });
    expect(await prisma.schoolVacation.count()).toBe(0);
  });

  it("D-RM-15 — la route officielle marque en base toutes les périodes comme importées", async () => {
    const reponse = await appel(karim, "POST", "/parametrage/vacances/importer", {
      anneeScolaire: "2026-2027",
      zone: "A",
    });
    expect(reponse.statusCode).toBe(201);
    expect(reponse.json()).toEqual({ crees: 4, existants: 0 });
    const stockees = await prisma.schoolVacation.findMany({
      where: { anneeScolaire: "2026-2027", zone: "A" },
      select: { importee: true },
    });
    expect(stockees).toHaveLength(4);
    expect(stockees.filter((periode) => !periode.importee)).toHaveLength(0);
  });

  it("EX-PLN-14 et D-RM-15 — planning.schoolZone A/B/C/vide pilote les deux trames HTTP", async () => {
    await prisma.setting.create({
      data: { cle: "planning.schoolZone", valeur: "A", public: true },
    });
    for (const zone of ["A", "B", "C"] as const) {
      const importee = await appel(karim, "POST", "/parametrage/vacances/importer", {
        anneeScolaire: "2026-2027",
        zone,
      });
      expect(importee.json()).toEqual({ crees: 4, existants: 0 });
    }

    for (const zone of ["A", "B", "C"] as const) {
      await prisma.setting.update({
        where: { cle: "planning.schoolZone" },
        data: { valeur: zone, version: { increment: 1 } },
      });
      const [planning, activite] = await Promise.all([
        appel(karim, "GET", "/planning?debut=2027-02-01&fin=2027-03-31"),
        appel(karim, "GET", "/planning/activite?debut=2027-02-01&fin=2027-03-31"),
      ]);
      expect(planning.statusCode).toBe(200);
      expect(activite.statusCode).toBe(200);
      for (const reponse of [planning, activite]) {
        const vacances = reponse.json<{ trame: { vacances: { zone: string }[] } }>().trame.vacances;
        expect(vacances.length).toBeGreaterThan(0);
        expect([...new Set(vacances.map((periode) => periode.zone))]).toEqual([zone]);
      }
    }

    await prisma.setting.update({
      where: { cle: "planning.schoolZone" },
      data: { valeur: "", version: { increment: 1 } },
    });
    const [planningVide, activiteVide] = await Promise.all([
      appel(karim, "GET", "/planning?debut=2027-02-01&fin=2027-03-31"),
      appel(karim, "GET", "/planning/activite?debut=2027-02-01&fin=2027-03-31"),
    ]);
    expect(planningVide.json<{ trame: { vacances: unknown[] } }>().trame.vacances).toHaveLength(0);
    expect(activiteVide.json<{ trame: { vacances: unknown[] } }>().trame.vacances).toHaveLength(0);
    const importSansZone = await appel(karim, "POST", "/parametrage/vacances/importer", {
      anneeScolaire: "2026-2027",
    });
    expect(importSansZone.statusCode).toBe(422);
    expect(importSansZone.json()).toMatchObject({
      cle: "erreurs:calendrierScolaireIndisponible",
    });
  });

  it("D-RM-15 — GET vacances filtre année et zone et publie les combinaisons officielles disponibles", async () => {
    await appel(karim, "POST", "/parametrage/vacances/importer", {
      anneeScolaire: "2026-2027",
      zone: "C",
    });
    const reponse = await appel(
      karim,
      "GET",
      "/parametrage/vacances?anneeScolaire=2026-2027&zone=C",
    );
    expect(reponse.statusCode).toBe(200);
    const charge = reponse.json<{
      vacances: { zone: string; anneeScolaire: string }[];
      reference: { collecte: string; sha256Source: string; nombrePeriodes: number; combinaisons: { anneeScolaire: string; zones: string[] }[] };
    }>();
    expect(charge.vacances).toHaveLength(4);
    expect([...new Set(charge.vacances.map((periode) => periode.zone))]).toEqual(["C"]);
    expect([...new Set(charge.vacances.map((periode) => periode.anneeScolaire))]).toEqual(["2026-2027"]);
    expect(charge.reference).toMatchObject({
      collecte: "2026-09-10",
      sha256Source: "777eb79d413ebaadd9be0338c5fa09a7261f5ddd0f3eb782d4f3c121cd35fa6e",
      nombrePeriodes: 171,
    });
    expect(charge.reference.combinaisons).toHaveLength(10);
    expect(charge.reference.combinaisons.map((combinaison) => combinaison.anneeScolaire)).toEqual([
      "2017-2018", "2018-2019", "2019-2020", "2020-2021", "2021-2022",
      "2022-2023", "2023-2024", "2024-2025", "2025-2026", "2026-2027",
    ]);
    for (const combinaison of charge.reference.combinaisons) {
      expect(combinaison.zones).toEqual(["A", "B", "C"]);
    }
    expect(charge.reference.combinaisons).toContainEqual({
      anneeScolaire: "2026-2027",
      zones: ["A", "B", "C"],
    });
  });

  it("RG-PRM-04 — la saisie manuelle refuse une fin égale au début et ne peut pas usurper l’origine officielle", async () => {
    const egale = await appel(karim, "POST", "/parametrage/vacances", {
      libelle: "Journée sans intervalle",
      dateDebut: "2027-05-01",
      dateFin: "2027-05-01",
      zone: "B",
      anneeScolaire: "2026-2027",
    });
    expect(egale.statusCode).toBe(422);
    expect(await prisma.schoolVacation.count()).toBe(0);

    const origineForgee = await appel(karim, "POST", "/parametrage/vacances", {
      libelle: "Origine forgée",
      dateDebut: "2027-05-01",
      dateFin: "2027-05-02",
      zone: "B",
      anneeScolaire: "2026-2027",
      importee: true,
    });
    expect(origineForgee.statusCode).toBe(400);
    expect(await prisma.schoolVacation.count()).toBe(0);
  });

  it("D-RM-15 — une période manuelle homonyme divergente bloque l’import officiel sans faux existant ni import partiel", async () => {
    await prisma.schoolVacation.create({
      data: {
        libelle: "Vacances de la Toussaint",
        dateDebut: date("2026-10-01"),
        dateFin: date("2026-10-02"),
        zone: "B",
        anneeScolaire: "2026-2027",
        importee: false,
      },
    });
    const importation = await appel(karim, "POST", "/parametrage/vacances/importer", {
      anneeScolaire: "2026-2027",
      zone: "B",
    });
    expect(importation.statusCode).toBe(409);
    expect(importation.json()).toMatchObject({ cle: "erreurs:periodeScolaireEnConflit" });
    const stockees = await prisma.schoolVacation.findMany();
    expect(stockees).toHaveLength(1);
    expect(stockees[0]).toMatchObject({ importee: false });
  });

  it("RG-DROITS-03 et D-RM-02 — Hugo peut lire mais ni qualifier ni importer", async () => {
    const ferie = await prisma.holiday.create({
      data: { date: date("2026-11-11"), libelle: "Armistice" },
    });
    expect((await appel(hugo, "GET", "/parametrage/feries?annee=2026")).statusCode).toBe(200);
    expect((await appel(hugo, "PATCH", `/parametrage/feries/${ferie.id}`, {
      version: ferie.version,
      ouvre: true,
    })).statusCode).toBe(403);
    expect((await appel(hugo, "POST", "/parametrage/vacances/importer", {
      anneeScolaire: "2026-2027",
      zone: "B",
    })).statusCode).toBe(403);
    expect((await prisma.holiday.findUniqueOrThrow({ where: { id: ferie.id } })).ouvre).toBe(false);
    expect(await prisma.schoolVacation.count()).toBe(0);
    expect(await prisma.auditLog.count({
      where: { action: "access.denied", acteurId: hugo.id },
    })).toBe(2);
  });
});
