import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { creerClient, type PrismaClient } from "@rationarium/db";
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

/**
 * L-37 — ce que la vue 31 lit et écrit.
 *
 * Les trois lectures de cette vue portent chacune un piège : des réglages
 * privés qui ne doivent pas fuir, une année jamais importée qui doit pourtant
 * montrer ses fériés récurrents, et un enregistrement qui doit être entier.
 */
describe("EX-PRM-01 — les réglages globaux", () => {
  beforeEach(async () => {
    await prisma.setting.deleteMany();
    await prisma.auditLog.deleteMany({ where: { action: "settings.update" } });
  });

  it("ne rend que les réglages PUBLICS — un secret de service n'est pas un paramètre d'affichage", async () => {
    await prisma.setting.createMany({
      data: [
        { cle: "display.dateFormat", valeur: "JJ/MM/AAAA", public: true },
        { cle: "smtp.password", valeur: "s3cr3t", public: false },
      ],
    });

    const lus = await cal.reglages();
    expect(lus["display.dateFormat"]).toBe("JJ/MM/AAAA");
    // L'assertion qui porte : l'absence, pas la présence.
    expect(Object.keys(lus)).not.toContain("smtp.password");
  });

  it("enregistre en bloc et rend l'état complet, pas seulement ce qui a changé", async () => {
    await cal.enregistrerReglages(
      { "display.dateFormat": "AAAA-MM-JJ", "display.firstDayOfWeek": "0" },
      acteur,
    );
    const apres = await cal.enregistrerReglages({ "display.firstDayOfWeek": "1" }, acteur);

    expect(apres["display.firstDayOfWeek"]).toBe("1");
    // Le réglage non transmis survit : un enregistrement n'est pas un
    // remplacement de l'ensemble.
    expect(apres["display.dateFormat"]).toBe("AAAA-MM-JJ");
  });

  it("un enregistrement vide ne trace rien et ne casse rien", async () => {
    expect(await cal.enregistrerReglages({}, acteur)).toEqual({});
    expect(await prisma.auditLog.count({ where: { action: "settings.update" } })).toBe(0);
  });

  it("M20 — la modification des paramètres est tracée avec les clés touchées", async () => {
    await cal.enregistrerReglages({ "planning.visibleDays": "1,2,3" }, acteur);
    const trace = await prisma.auditLog.findFirst({ where: { action: "settings.update" } });
    expect(trace).not.toBeNull();
    expect(trace?.detail).toMatchObject({ cles: ["planning.visibleDays"] });
  });
});

describe("EX-PRM-02 — la liste des fériés d'une année", () => {
  it("RG-PRM-02 — une année JAMAIS IMPORTÉE montre quand même ses fériés récurrents", async () => {
    // Le décompte des congés, lui, les voit : les deux lectures doivent dire
    // la même chose, sinon c'est le paramétrage qui ment.
    await cal.importerJoursFeries(2026, acteur);

    const listee = await cal.joursFeries(2028);
    const dates = listee.feries.map((f) => f.date.toISOString().slice(0, 10));
    expect(dates).toContain("2028-01-01");
    expect(dates).toContain("2028-07-14");
    // Pâques 2026 est mobile : elle n'est pas récurrente, donc pas projetée.
    expect(dates).not.toContain("2028-04-06");

    // La contrepartie, vérifiée : le décompte voit la même chose. Le 13 est
    // un jeudi, le 14 un vendredi férié, le 15 un samedi — un seul jour
    // ouvré. Sans la projection du récurrent, il y en aurait deux.
    expect(await cal.joursOuvres(utc("2028-07-13"), utc("2028-07-15"))).toBe(1);
  });

  it("une déclaration explicite pour l'année l'emporte sur la projection", async () => {
    await cal.importerJoursFeries(2026, acteur);
    // La collectivité travaille le 11 novembre 2028.
    await cal.declarerJourFerie(
      { date: utc("2028-11-11"), libelle: "Armistice travaillé", ouvre: true, recurrent: false },
      acteur,
    );

    const listee = await cal.joursFeries(2028);
    const onze = listee.feries.filter(
      (f) => f.date.toISOString().slice(0, 10) === "2028-11-11",
    );
    expect(onze).toHaveLength(1);
    expect(onze[0]?.ouvre).toBe(true);
  });

  it("les statistiques comptent la liste projetée, pas les seules lignes stockées", async () => {
    await cal.importerJoursFeries(2026, acteur);
    const listee = await cal.joursFeries(2028);
    expect(listee.statistiques.total).toBe(listee.feries.length);
    expect(listee.statistiques.chomes + listee.statistiques.ouvres).toBe(listee.feries.length);
  });
});

describe("EX-PRM-03 — les vacances scolaires", () => {
  beforeEach(async () => {
    await prisma.schoolVacation.deleteMany();
  });

  it("distingue ce qui vient d'un import de ce qui a été saisi à la main", async () => {
    await cal.declarerVacances(
      {
        libelle: "Toussaint", dateDebut: utc("2026-10-17"), dateFin: utc("2026-11-02"),
        zone: "B", anneeScolaire: "2026-2027", importee: true,
      },
      acteur,
    );
    await cal.declarerVacances(
      {
        libelle: "Pont local", dateDebut: utc("2027-05-13"), dateFin: utc("2027-05-16"),
        zone: "B", anneeScolaire: "2026-2027",
      },
      acteur,
    );

    const toutes = await cal.vacances();
    expect(toutes.statistiques).toMatchObject({ total: 2, importees: 1, manuelles: 1 });

    // Les deux ne se corrigent pas de la même façon : l'un se rejoue, l'autre
    // se ressaisit.
    const filtrees = await cal.vacances("2025-2026");
    expect(filtrees.vacances).toHaveLength(0);
    expect(filtrees.statistiques.total).toBe(0);
  });
});
