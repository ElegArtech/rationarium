import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { creerClient, type PrismaClient } from "@trame/db";
import { CalendrierService } from "./calendrier.service.js";
import { AuditService } from "../commun/audit.service.js";

/**
 * L-09 — le calendrier.
 *
 * Ce module définit **ce qu'est un jour ouvré**. Le décompte des congés, la
 * génération des assignations et la trame du planning en dépendent. Une erreur
 * ici se propage partout, et elle se voit sur une fiche de paie.
 */

const RACINE_DB = path.resolve(import.meta.dirname, "../../../../packages/db");
const utc = (s: string) => new Date(`${s}T00:00:00.000Z`);

let pg: StartedPostgreSqlContainer;
let prisma: PrismaClient;
let cal: CalendrierService;
let acteur: string;

beforeAll(async () => {
  pg = await new PostgreSqlContainer("postgres:18-alpine").start();
  execFileSync("pnpm", ["exec", "prisma", "migrate", "deploy"], {
    cwd: RACINE_DB,
    env: { ...process.env, DATABASE_URL: pg.getConnectionUri() },
    stdio: "pipe",
  });
  prisma = creerClient(pg.getConnectionUri());
  cal = new CalendrierService(prisma as never, new AuditService(prisma as never));

  acteur = crypto.randomUUID();
  await prisma.user.create({
    data: {
      id: acteur, login: `k-${acteur.slice(0, 6)}`, email: `${acteur.slice(0, 6)}@x.fr`,
      motDePasseHash: "x", prenom: "K", nom: "A",
    },
  });
}, 240_000);

afterAll(async () => {
  await prisma?.$disconnect();
  await pg?.stop();
});

beforeEach(async () => {
  await prisma.holiday.deleteMany();
});

describe("RG-CNG-16 — jours ouvrés : week-ends et fériés chômés exclus", () => {
  it("une semaine pleine du lundi au vendredi vaut 5 jours", async () => {
    // 2026-03-02 est un lundi.
    expect(await cal.joursOuvres(utc("2026-03-02"), utc("2026-03-06"))).toBe(5);
  });

  it("une semaine calendaire complète en vaut 5 aussi — le week-end ne compte pas", async () => {
    expect(await cal.joursOuvres(utc("2026-03-02"), utc("2026-03-08"))).toBe(5);
  });

  it("un jour férié chômé retire un jour", async () => {
    await cal.declarerJourFerie(
      { date: utc("2026-03-04"), libelle: "Férié d'essai" },
      acteur,
    );
    expect(await cal.joursOuvres(utc("2026-03-02"), utc("2026-03-06"))).toBe(4);
  });

  it("RG-PRM-01 — un férié marqué OUVRÉ ne retire rien", async () => {
    // C'est le piège du module : férié n'implique pas chômé.
    await cal.declarerJourFerie(
      { date: utc("2026-03-04"), libelle: "Férié travaillé", ouvre: true },
      acteur,
    );
    expect(await cal.joursOuvres(utc("2026-03-02"), utc("2026-03-06"))).toBe(5);
  });

  it("un férié tombant un week-end ne retire rien non plus", async () => {
    await cal.declarerJourFerie(
      { date: utc("2026-03-07"), libelle: "Férié un samedi" },
      acteur,
    );
    expect(await cal.joursOuvres(utc("2026-03-02"), utc("2026-03-08"))).toBe(5);
  });

  it("RG-PRM-02 — un férié récurrent vaut pour toutes les années", async () => {
    await cal.declarerJourFerie(
      { date: utc("2020-07-14"), libelle: "Fête nationale", recurrent: true },
      acteur,
    );
    // Le 14 juillet 2026 est un mardi.
    expect(await cal.joursOuvres(utc("2026-07-13"), utc("2026-07-17"))).toBe(4);
    // Et en 2027 aussi — un mercredi.
    expect(await cal.joursOuvres(utc("2027-07-12"), utc("2027-07-16"))).toBe(4);
  });
});

describe("RG-CNG-17 — les demi-journées comptent au demi-jour près", () => {
  it("une demi-journée en début de période retire 0,5", async () => {
    expect(
      await cal.joursOuvres(utc("2026-03-02"), utc("2026-03-06"), { demiJourneeDebut: true }),
    ).toBe(4.5);
  });

  it("les deux extrémités retirent 1 jour au total", async () => {
    expect(
      await cal.joursOuvres(utc("2026-03-02"), utc("2026-03-06"), {
        demiJourneeDebut: true,
        demiJourneeFin: true,
      }),
    ).toBe(4);
  });

  it("RG-CNG-18 — sur un seul jour, une demi-journée vaut 0,5 et non 0", async () => {
    // Retrancher deux fois une demi-journée sur un jour unique donnerait 0.
    expect(
      await cal.joursOuvres(utc("2026-03-03"), utc("2026-03-03"), {
        demiJourneeDebut: true,
        demiJourneeFin: true,
      }),
    ).toBe(0.5);
  });

  it("une demi-journée sur une extrémité non ouvrable ne retire rien", async () => {
    // Le 2026-03-07 est un samedi : retrancher une demi-journée fausserait
    // le décompte d'un demi-jour jamais travaillé.
    expect(
      await cal.joursOuvres(utc("2026-03-02"), utc("2026-03-07"), { demiJourneeFin: true }),
    ).toBe(5);
  });
});

describe("RG-CNG-19 — répartition par année civile", () => {
  it("une période dans une seule année n'est pas découpée", async () => {
    const parts = await cal.repartitionParAnnee(utc("2026-03-02"), utc("2026-03-06"));
    expect(parts).toEqual([{ annee: 2026, jours: 5 }]);
  });

  it("une période à cheval est répartie, chaque année comptée séparément", async () => {
    // Du lundi 28 décembre 2026 au vendredi 1er janvier 2027.
    const parts = await cal.repartitionParAnnee(utc("2026-12-28"), utc("2027-01-01"));
    expect(parts).toHaveLength(2);
    expect(parts[0]!.annee).toBe(2026);
    expect(parts[1]!.annee).toBe(2027);
    // Le total reste juste : c'est ce qui permet de contrôler deux soldes.
    const total = parts.reduce((n, p) => n + p.jours, 0);
    expect(total).toBe(await cal.joursOuvres(utc("2026-12-28"), utc("2027-01-01")));
  });

  it("les demi-journées restent aux bonnes extrémités du découpage", async () => {
    const parts = await cal.repartitionParAnnee(utc("2026-12-28"), utc("2027-01-01"), {
      demiJourneeDebut: true,
      demiJourneeFin: true,
    });
    const total = parts.reduce((n, p) => n + p.jours, 0);
    expect(total).toBe(
      await cal.joursOuvres(utc("2026-12-28"), utc("2027-01-01"), {
        demiJourneeDebut: true,
        demiJourneeFin: true,
      }),
    );
  });
});

describe("Import des jours fériés français", () => {
  it("importe onze jours pour une année", async () => {
    const r = await cal.importerJoursFeries(2026, acteur);
    expect(r.crees).toBe(11);
    expect(r.existants).toBe(0);
  });

  it("RG-PRM-03 — rejoué, il rend compte des existants sans dupliquer", async () => {
    await cal.importerJoursFeries(2026, acteur);
    const r = await cal.importerJoursFeries(2026, acteur);
    expect(r.crees).toBe(0);
    expect(r.existants).toBe(11);
  });

  it("calcule correctement les fériés mobiles — Pâques 2026 tombe le 5 avril", async () => {
    await cal.importerJoursFeries(2026, acteur);
    const lundiPaques = await prisma.holiday.findUnique({ where: { date: utc("2026-04-06") } });
    expect(lundiPaques?.libelle).toBe("Lundi de Pâques");

    // Ascension = Pâques + 39 jours = 14 mai 2026.
    const ascension = await prisma.holiday.findUnique({ where: { date: utc("2026-05-14") } });
    expect(ascension?.libelle).toBe("Ascension");
  });

  it("et pour une autre année — Pâques 2027 tombe le 28 mars", async () => {
    await cal.importerJoursFeries(2027, acteur);
    const lundiPaques = await prisma.holiday.findUnique({ where: { date: utc("2027-03-29") } });
    expect(lundiPaques?.libelle).toBe("Lundi de Pâques");
  });

  it("les fériés fixes sont marqués récurrents, les mobiles non", async () => {
    await cal.importerJoursFeries(2026, acteur);
    const noel = await prisma.holiday.findUniqueOrThrow({ where: { date: utc("2026-12-25") } });
    const ascension = await prisma.holiday.findUniqueOrThrow({ where: { date: utc("2026-05-14") } });
    expect(noel.recurrent).toBe(true);
    expect(ascension.recurrent).toBe(false);
  });
});

describe("Vacances scolaires et trame de fond", () => {
  it("RG-PRM-04 — une période incohérente est refusée", async () => {
    await expect(
      cal.declarerVacances(
        {
          libelle: "Incohérent", dateDebut: utc("2026-07-10"), dateFin: utc("2026-07-01"),
          zone: "C", anneeScolaire: "2025-2026",
        },
        acteur,
      ),
    ).rejects.toMatchObject({ code: "dates_incoherentes" });
  });

  it("EX-PLN-14 — la trame réunit fériés chômés et vacances de la zone", async () => {
    await cal.importerJoursFeries(2026, acteur);
    await cal.declarerVacances(
      {
        libelle: "Vacances d'été", dateDebut: utc("2026-07-04"), dateFin: utc("2026-08-31"),
        zone: "C", anneeScolaire: "2025-2026",
      },
      acteur,
    );

    const trame = await cal.trameDeFond(utc("2026-07-01"), utc("2026-07-31"), "C");
    expect(trame.joursChomes).toContain("2026-07-14");
    expect(trame.vacances).toHaveLength(1);

    // Une autre zone ne voit pas ces vacances.
    const autreZone = await cal.trameDeFond(utc("2026-07-01"), utc("2026-07-31"), "A");
    expect(autreZone.vacances).toHaveLength(0);
  });

  it("les statistiques distinguent chômés et ouvrés", async () => {
    await cal.importerJoursFeries(2026, acteur);
    await cal.declarerJourFerie(
      { date: utc("2026-06-15"), libelle: "Journée de solidarité", ouvre: true },
      acteur,
    );
    const stats = await cal.statistiquesFeries(2026);
    expect(stats.total).toBe(12);
    expect(stats.chomes).toBe(11);
    expect(stats.ouvres).toBe(1);
    expect(stats.legaux).toBe(11);
  });
});
