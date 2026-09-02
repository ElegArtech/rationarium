import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { creerClient, type PrismaClient } from "@rationarium/db";
import { RapportsService, debutDe } from "./rapports.service.js";
import { AuditService } from "../commun/audit.service.js";
import { PerimetreService } from "../commun/perimetre.service.js";

/**
 * L-22 — rapports et analytics, sur PostgreSQL réel.
 *
 * Les indicateurs sont la famille de code la plus facile à écrire faux sans
 * que rien ne casse : une moyenne sur zéro, un ratio qui divise par zéro, un
 * troncage silencieux, une courbe tracée sur trois points. Aucun de ces
 * défauts ne lève d'erreur — ils **affirment**, et c'est pire.
 */

const RACINE_DB = path.resolve(import.meta.dirname, "../../../../packages/db");
const utc = (s: string) => new Date(`${s}T00:00:00.000Z`);
const uuid = () => crypto.randomUUID();

/** Le mardi 11 août 2026. */
const MOMENT = utc("2026-08-11");

let pg: StartedPostgreSqlContainer;
let prisma: PrismaClient;
let rapports: RapportsService;
let perimetres: PerimetreService;
let chef: string;
let etranger: string;
let departement: string;

async function agent(prenom = "A") {
  const id = uuid();
  await prisma.user.create({
    data: {
      id, login: `u-${id.slice(0, 8)}`, email: `${id.slice(0, 8)}@x.fr`,
      motDePasseHash: "x", prenom, nom: "Agent",
    },
  });
  return id;
}

async function projet(donnees: {
  nom: string;
  chefId?: string;
  statut?: string;
  dateDebut?: string;
  dateFin?: string;
}) {
  return prisma.project.create({
    data: {
      nom: donnees.nom,
      statut: (donnees.statut ?? "active") as never,
      dateDebut: utc(donnees.dateDebut ?? "2026-01-01"),
      dateFin: utc(donnees.dateFin ?? "2026-12-31"),
      departementId: departement,
      ...(donnees.chefId ? { chefId: donnees.chefId } : {}),
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
  prisma = creerClient(pg.getConnectionUri());
  const audit = new AuditService(prisma as never);
  perimetres = new PerimetreService(prisma as never);
  rapports = new RapportsService(prisma as never, perimetres, audit);

  const direction = uuid();
  await prisma.direction.create({ data: { id: direction, nom: `Dir ${direction.slice(0, 6)}` } });
  departement = uuid();
  await prisma.departement.create({
    data: { id: departement, nom: "Direction des services numériques", directionId: direction },
  });

  chef = await agent("Driss");
  etranger = await agent("Etranger");
}, 240_000);

afterAll(async () => {
  await prisma?.$disconnect();
  await pg?.stop();
});

beforeEach(async () => {
  await prisma.taskAssignee.deleteMany();
  await prisma.task.deleteMany();
  await prisma.milestone.deleteMany();
  await prisma.projectSnapshot.deleteMany();
  await prisma.project.deleteMany();
});

const global = () => perimetres.resoudre(chef, new Set(["users:manage_any"]));
const PERMISSIONS = new Set(["reports:read", "projects:readAll"]);

const page = async () =>
  rapports.vueEnsemble({ periode: "mois" }, await global(), PERMISSIONS, MOMENT);

// ════════════════════════════════════════════════════════════════════════════

describe("le calcul de période", () => {
  it("chaque période commence là où elle doit", () => {
    // Le 11 août 2026 est un mardi.
    expect(debutDe("semaine", MOMENT).toISOString().slice(0, 10)).toBe("2026-08-10");
    expect(debutDe("mois", MOMENT).toISOString().slice(0, 10)).toBe("2026-08-01");
    expect(debutDe("trimestre", MOMENT).toISOString().slice(0, 10)).toBe("2026-07-01");
    expect(debutDe("annee", MOMENT).toISOString().slice(0, 10)).toBe("2026-01-01");
  });

  it("un dimanche appartient à la semaine qui précède", () => {
    expect(debutDe("semaine", utc("2026-08-16")).toISOString().slice(0, 10)).toBe("2026-08-10");
  });
});

describe("RG-RPT-01 — les agrégats respectent le périmètre", () => {
  it("UN COMPTEUR AUSSI DIVULGUE : le projet d'autrui ne compte nulle part", async () => {
    const mien = await projet({ nom: "Portail citoyen", chefId: chef });
    const sien = await projet({ nom: "Projet confidentiel", chefId: etranger });

    await prisma.task.createMany({
      data: [
        { titre: "À moi", projectId: mien.id, statut: "doing", dateFin: utc("2026-08-01") },
        { titre: "À lui", projectId: sien.id, statut: "doing", dateFin: utc("2026-08-01") },
      ],
    });

    // Un périmètre non global, sans droit de lecture élargie.
    const restreint = await perimetres.resoudre(chef, new Set(["users:read"]));
    const vue = await rapports.vueEnsemble(
      { periode: "mois" },
      restreint,
      new Set(["reports:read"]),
      MOMENT,
    );

    expect(vue.sante.map((s) => s.nom)).toEqual(["Portail citoyen"]);
    // « 2 tâches en retard » aurait déjà trop dit.
    expect(vue.alerte.tachesEnRetard).toBe(1);
  });
});

describe("EX-RPT-04, RG-RPT-02 — la progression, plafonnée et ANNONCÉE", () => {
  it("au-delà de dix projets, le troncage est signalé — jamais silencieux", async () => {
    for (let i = 0; i < 12; i += 1) {
      await projet({ nom: `Projet ${String(i).padStart(2, "0")}`, chefId: chef });
    }

    const vue = await page();
    expect(vue.progression.projets).toHaveLength(10);
    // Une liste coupée en silence fait conclure qu'il n'y a que dix projets.
    expect(vue.progression.total).toBe(12);
    expect(vue.progression.tronque).toBe(true);
  });

  it("en deçà, rien n'est tronqué et le drapeau le dit", async () => {
    await projet({ nom: "Unique", chefId: chef });
    const vue = await page();
    expect(vue.progression.tronque).toBe(false);
  });

  it("un projet sans tâche progresse de zéro, pas de NaN", async () => {
    await projet({ nom: "Vide", chefId: chef });
    const vue = await page();
    expect(vue.progression.projets[0]?.progression).toBe(0);
  });
});

describe("EX-RPT-05, RG-RPT-05 — la surcharge est un ÉCART À LA MOYENNE", () => {
  it("dix tâches ne veulent rien dire dans l'absolu, tout par rapport à l'équipe", async () => {
    const p = await projet({ nom: "Charge", chefId: chef });
    const charge = await agent("Charge");
    const leger = await agent("Leger");

    for (let i = 0; i < 9; i += 1) {
      await prisma.task.create({
        data: { titre: `T${i}`, projectId: p.id, statut: "doing", assignes: { create: [{ userId: charge }] } },
      });
    }
    await prisma.task.create({
      data: { titre: "Une", projectId: p.id, statut: "doing", assignes: { create: [{ userId: leger }] } },
    });

    const vue = await page();
    expect(vue.charge.moyenne).toBe(5);
    const parNom = new Map(vue.charge.agents.map((a) => [a.nom, a]));
    expect(parNom.get("Charge Agent")?.surcharge).toBe(true);
    expect(parNom.get("Leger Agent")?.surcharge).toBe(false);
    expect(vue.charge.surcharges).toBe(1);
  });

  it("sans aucune assignation, la moyenne vaut zéro et personne n'est surchargé", async () => {
    await projet({ nom: "Personne", chefId: chef });
    const vue = await page();
    expect(vue.charge.moyenne).toBe(0);
    // Une comparaison à zéro déclarerait tout le monde surchargé.
    expect(vue.charge.surcharges).toBe(0);
  });

  it("les tâches terminées ne pèsent plus sur la charge", async () => {
    const p = await projet({ nom: "Closes", chefId: chef });
    const a = await agent("Fini");
    await prisma.task.create({
      data: { titre: "Faite", projectId: p.id, statut: "done", assignes: { create: [{ userId: a }] } },
    });
    const vue = await page();
    expect(vue.charge.agents).toEqual([]);
  });
});

describe("EX-RPT-06 — la santé est CALCULÉE, pas saisie", () => {
  it("le retard prime sur le pourcentage : 90 % avec des dépassements alerte", async () => {
    const p = await projet({ nom: "Presque fini", chefId: chef });
    for (let i = 0; i < 9; i += 1) {
      await prisma.task.create({ data: { titre: `Ok${i}`, projectId: p.id, statut: "done" } });
    }
    await prisma.task.create({
      data: { titre: "Traîne", projectId: p.id, statut: "doing", dateFin: utc("2026-07-01") },
    });

    const vue = await page();
    const sante = vue.sante[0];
    expect(sante?.completion).toBe(90);
    // Un pourcentage rassurant ne doit pas masquer un retard réel.
    expect(sante?.sante).toBe("warning");
    expect(sante?.enRetard).toBe(1);
  });

  it("trois tâches en retard font passer en critique", async () => {
    const p = await projet({ nom: "En difficulté", chefId: chef });
    for (let i = 0; i < 3; i += 1) {
      await prisma.task.create({
        data: { titre: `R${i}`, projectId: p.id, statut: "doing", dateFin: utc("2026-07-01") },
      });
    }
    expect((await page()).sante[0]?.sante).toBe("critical");
  });

  it("un projet dont l'échéance est passée ET qui traîne est critique", async () => {
    const p = await projet({ nom: "Dépassé", chefId: chef, dateFin: "2026-06-30" });
    await prisma.task.create({
      data: { titre: "Reste", projectId: p.id, statut: "doing", dateFin: utc("2026-06-01") },
    });
    expect((await page()).sante[0]?.sante).toBe("critical");
  });

  it("sans retard, la santé est bonne — et le service est nommé", async () => {
    const p = await projet({ nom: "Sain", chefId: chef });
    await prisma.task.create({ data: { titre: "En cours", projectId: p.id, statut: "doing" } });
    const sante = (await page()).sante[0];
    expect(sante?.sante).toBe("good");
    expect(sante?.service).toBe("Direction des services numériques");
  });
});

describe("EX-RPT-07, RG-RPT-03, RG-RPT-04 — la tendance", () => {
  it("UN HISTORIQUE COURT LE DIT plutôt que de tracer une courbe", async () => {
    const p = await projet({ nom: "Jeune", chefId: chef });
    await prisma.projectSnapshot.createMany({
      data: [
        { projectId: p.id, date: utc("2026-08-03"), progression: 10, tachesTotal: 4, tachesFinies: 0, heuresConsommees: 0 },
        { projectId: p.id, date: utc("2026-08-05"), progression: 20, tachesTotal: 4, tachesFinies: 1, heuresConsommees: 3 },
      ],
    });

    const vue = await page();
    // Une courbe lissée sur des données absentes est le plus efficace des
    // mensonges : elle a l'air d'une mesure.
    expect(vue.tendance.historiqueSuffisant).toBe(false);
    expect(vue.tendance.stagnation).toBe(false);
  });

  it("RG-RPT-04 — une progression qui ne bouge pas est NOMMÉE stagnation", async () => {
    const p = await projet({ nom: "Figé", chefId: chef });
    await prisma.projectSnapshot.createMany({
      data: [1, 3, 5, 7].map((n) => ({
        projectId: p.id,
        date: utc(`2026-08-0${n}`),
        progression: 42,
        tachesTotal: 10,
        tachesFinies: 4,
        heuresConsommees: 0,
      })),
    });

    const vue = await page();
    expect(vue.tendance.historiqueSuffisant).toBe(true);
    expect(vue.tendance.gain).toBe(0);
    expect(vue.tendance.stagnation).toBe(true);
  });

  it("une vraie progression n'est pas une stagnation", async () => {
    const p = await projet({ nom: "Avance", chefId: chef });
    await prisma.projectSnapshot.createMany({
      data: [1, 3, 5, 7].map((n, i) => ({
        projectId: p.id,
        date: utc(`2026-08-0${n}`),
        progression: 10 + i * 15,
        tachesTotal: 10,
        tachesFinies: i,
        heuresConsommees: 0,
      })),
    });

    const vue = await page();
    expect(vue.tendance.gain).toBe(45);
    expect(vue.tendance.stagnation).toBe(false);
  });
});

describe("EX-RPT-08 — la complétion des jalons", () => {
  it("échu et terminé, échu et non terminé, à venir : les trois se distinguent", async () => {
    const p = await projet({ nom: "Jalonné", chefId: chef });
    const aTemps = await prisma.milestone.create({
      data: { nom: "Livré", projectId: p.id, dateEcheance: utc("2026-07-01") },
    });
    const rate = await prisma.milestone.create({
      data: { nom: "Manqué", projectId: p.id, dateEcheance: utc("2026-07-15") },
    });
    await prisma.milestone.create({
      data: { nom: "Devant", projectId: p.id, dateEcheance: utc("2026-09-01") },
    });

    await prisma.task.create({
      data: { titre: "Faite", projectId: p.id, milestoneId: aTemps.id, statut: "done" },
    });
    await prisma.task.create({
      data: { titre: "Traîne", projectId: p.id, milestoneId: rate.id, statut: "doing" },
    });

    const vue = await page();
    expect(vue.jalons).toMatchObject({ total: 3, aTemps: 1, enRetard: 1, aVenir: 1, echus: 2 });
  });

  it("UN JALON DÛ AUJOURD'HUI N'EST PAS EN RETARD, même en fin de journée", async () => {
    const p = await projet({ nom: "Aujourd'hui", chefId: chef });
    const dujour = await prisma.milestone.create({
      data: { nom: "Dû ce soir", projectId: p.id, dateEcheance: utc("2026-08-11") },
    });
    await prisma.task.create({
      data: { titre: "Encore ouverte", projectId: p.id, milestoneId: dujour.id, statut: "doing" },
    });

    /*
      L'heure n'est pas un détail de mise en scène, elle EST le contrôle. Les
      échéances sont des colonnes `@db.Date` et reviennent à minuit ; les
      comparer à l'instant courant rendait « en retard » un jalon dû
      aujourd'hui dès la première seconde — le seul jour où il peut encore être
      tenu. À minuit pile, la comparaison fautive donne pourtant la bonne
      réponse : un test qui fixe son horloge là ne peut pas voir le défaut.
    */
    for (const heure of ["08:30", "14:00", "23:59"]) {
      const vue = await rapports.vueEnsemble(
        { periode: "mois" }, await global(), PERMISSIONS,
        new Date(`2026-08-11T${heure}:00.000Z`),
      );
      expect(vue.jalons.aVenir, `à ${heure}`).toBe(1);
      expect(vue.jalons.enRetard, `à ${heure}`).toBe(0);
      expect(vue.jalons.retards, `à ${heure}`).toEqual([]);
      // La santé du projet lit les mêmes jalons : elle doit compter le même.
      expect(vue.sante[0]?.jalonsAVenir, `à ${heure}`).toBe(1);
    }
  });

  it("`RG-RPT-07` — LE DÉTAIL NOMME chaque retard, son projet, son ancienneté et son reste", async () => {
    const vieux = await projet({ nom: "Chantier ancien", chefId: chef });
    const recent = await projet({ nom: "Chantier récent", chefId: chef });
    const jVieux = await prisma.milestone.create({
      data: { nom: "Phase 1", projectId: vieux.id, dateEcheance: utc("2026-07-01") },
    });
    const jRecent = await prisma.milestone.create({
      data: { nom: "Recette", projectId: recent.id, dateEcheance: utc("2026-08-05") },
    });
    await prisma.task.createMany({
      data: [
        { titre: "Reste A", projectId: vieux.id, milestoneId: jVieux.id, statut: "doing" },
        { titre: "Reste B", projectId: vieux.id, milestoneId: jVieux.id, statut: "todo" },
        { titre: "Faite", projectId: vieux.id, milestoneId: jVieux.id, statut: "done" },
        { titre: "Reste C", projectId: recent.id, milestoneId: jRecent.id, statut: "todo" },
      ],
    });

    const vue = await page();
    expect(vue.jalons.enRetard).toBe(2);
    // Du plus ancien retard au plus récent : c'est l'ordre où on les traite.
    expect(vue.jalons.retards.map((j) => j.nom)).toEqual(["Phase 1", "Recette"]);
    expect(vue.jalons.retards[0]).toMatchObject({
      nom: "Phase 1",
      projetId: vieux.id,
      projetNom: "Chantier ancien",
      dateEcheance: "2026-07-01",
      joursDeRetard: 41,
      // Deux ouvertes sur trois : c'est ce qui reste pour lever le retard.
      tachesRestantes: 2,
    });
    expect(vue.jalons.retards[1]).toMatchObject({
      projetNom: "Chantier récent", joursDeRetard: 6, tachesRestantes: 1,
    });
    expect(vue.jalons.retardsNonListes).toBe(0);
  });

  it("`RG-RPT-02` et `RG-RPT-07` — au-delà de dix retards, la liste s'arrête et le dit", async () => {
    const p = await projet({ nom: "Débordé", chefId: chef });
    for (let i = 0; i < 13; i += 1) {
      const j = await prisma.milestone.create({
        data: { nom: `Jalon ${i}`, projectId: p.id, dateEcheance: utc("2026-07-01") },
      });
      await prisma.task.create({
        data: { titre: `T${i}`, projectId: p.id, milestoneId: j.id, statut: "todo" },
      });
    }

    const vue = await page();
    expect(vue.jalons.enRetard).toBe(13);
    // Le compte global reste juste : c'est la LISTE qui est bornée.
    expect(vue.jalons.retards).toHaveLength(10);
    expect(vue.jalons.retardsNonListes).toBe(3);
  });

  it("un jalon sans tâche et échu n'est pas « atteint à temps »", async () => {
    const p = await projet({ nom: "Vide", chefId: chef });
    await prisma.milestone.create({
      data: { nom: "Sans tâche", projectId: p.id, dateEcheance: utc("2026-07-01") },
    });
    // « Toutes les tâches terminées » sur zéro tâche serait vrai par vacuité :
    // c'est le piège que ce test tient.
    const vue = await page();
    expect(vue.jalons.aTemps).toBe(0);
    // `RG-RPT-07` — il figure donc dans le détail, avec zéro tâche restante.
    // Ce zéro ne dit pas « tout est fait », il dit « rien n'est rattaché », et
    // c'est la raison du retard : l'interface doit l'écrire ainsi.
    expect(vue.jalons.retards).toMatchObject([{ nom: "Sans tâche", tachesRestantes: 0 }]);
  });
});

describe("EX-RPT-10 — l'activité récente, INTERPRÉTÉE", () => {
  it("le ratio dit si le backlog grossit ou se résorbe", async () => {
    const p = await projet({ nom: "Actif", chefId: chef });
    await prisma.task.createMany({
      data: [
        { titre: "A", projectId: p.id, statut: "done" },
        { titre: "B", projectId: p.id, statut: "done" },
        { titre: "C", projectId: p.id, statut: "todo" },
        { titre: "D", projectId: p.id, statut: "todo" },
        { titre: "E", projectId: p.id, statut: "todo" },
      ],
    });

    const vue = await page();
    // Le ratio seul ne dit rien à qui ne le manipule pas tous les jours.
    expect(vue.activite.ratio).toBe(0.4);
    expect(vue.activite.interpretation).toBe("grossit");
  });

  it("UN RATIO SUR ZÉRO CRÉATION N'EXISTE PAS — il n'est pas « stable »", async () => {
    await projet({ nom: "Dormant", chefId: chef });
    const vue = await page();
    expect(vue.activite.creees).toBe(0);
    expect(vue.activite.ratio).toBeNull();
    // Affirmer « stable » sur une absence de données serait une invention.
    expect(vue.activite.interpretation).toBeNull();
  });
});

describe("EX-RPT-11 — le Gantt portefeuille et son RAG", () => {
  it("les cinq états RAG se distinguent, et ne sont pas la santé", async () => {
    const futur = await projet({ nom: "À venir", chefId: chef, dateDebut: "2026-10-01", dateFin: "2026-12-31" });
    const depasse = await projet({ nom: "En retard", chefId: chef, dateFin: "2026-07-01" });
    const risque = await projet({ nom: "À risque", chefId: chef });
    const fini = await projet({ nom: "Terminé", chefId: chef, statut: "done" });
    const sain = await projet({ nom: "Sur les rails", chefId: chef });

    await prisma.task.create({
      data: { titre: "Traîne", projectId: risque.id, statut: "doing", dateFin: utc("2026-07-01") },
    });
    await prisma.task.create({
      data: { titre: "En cours", projectId: sain.id, statut: "doing", dateFin: utc("2026-09-01") },
    });

    const g = await rapports.gantt({ periode: "mois" }, await global(), PERMISSIONS, MOMENT);
    const parId = new Map(g.lignes.map((l) => [l.id, l.rag]));

    expect(parId.get(futur.id)).toBe("upcoming");
    expect(parId.get(depasse.id)).toBe("late");
    expect(parId.get(risque.id)).toBe("at_risk");
    expect(parId.get(fini.id)).toBe("done");
    expect(parId.get(sain.id)).toBe("on_track");
  });

  it("la progression du Gantt compte les tâches finies, pas leur avancement moyen", async () => {
    const p = await projet({ nom: "Mesuré", chefId: chef });
    await prisma.task.createMany({
      data: [
        { titre: "A", projectId: p.id, statut: "done", avancement: 100 },
        { titre: "B", projectId: p.id, statut: "doing", avancement: 90 },
      ],
    });

    const g = await rapports.gantt({ periode: "mois" }, await global(), PERMISSIONS, MOMENT);
    // 50 % de tâches finies, et non 95 % d'avancement moyen : le Gantt parle
    // de livraison, pas d'effort.
    expect(g.lignes[0]?.progression).toBe(50);
  });
});

describe("EX-RPT-03 — l'export", () => {
  it("le CSV échappe ce qui casserait les colonnes", async () => {
    await projet({ nom: 'Refonte "portail", phase 2', chefId: chef });

    const fichier = await rapports.exporter(
      "csv", { periode: "mois" }, await global(), PERMISSIONS, MOMENT, chef,
    );

    expect(fichier.type).toContain("text/csv");
    // Un nom contenant une virgule décalerait toutes les colonnes suivantes,
    // et le fichier paraîtrait valide.
    expect(fichier.contenu).toContain('"Refonte ""portail"", phase 2"');
    // Le BOM : sans lui, Excel lit en ANSI et « Complétion » devient illisible.
    expect(fichier.contenu.charCodeAt(0)).toBe(0xfeff);
    expect(fichier.contenu).toContain("\r\n");
  });

  it("le JSON rend la page entière, telle qu'elle a été calculée", async () => {
    await projet({ nom: "Exporté", chefId: chef });
    const fichier = await rapports.exporter(
      "json", { periode: "mois" }, await global(), PERMISSIONS, MOMENT, chef,
    );
    const relu = JSON.parse(fichier.contenu) as { sante: { nom: string }[] };
    expect(relu.sante.map((s) => s.nom)).toEqual(["Exporté"]);
  });

  it("M20 — l'export est tracé : c'est une sortie de données", async () => {
    await prisma.auditLog.deleteMany({ where: { action: "export.csv" } });
    await rapports.exporter("csv", { periode: "mois" }, await global(), PERMISSIONS, MOMENT, chef);
    const trace = await prisma.auditLog.findFirst({ where: { action: "export.csv" } });
    expect(trace?.detail).toMatchObject({ format: "csv" });
  });
});

describe("EX-RPT-02 — les filtres", () => {
  it("le filtre par projet restreint TOUS les modules, pas seulement la liste", async () => {
    const garde = await projet({ nom: "Gardé", chefId: chef });
    const ecarte = await projet({ nom: "Écarté", chefId: chef });
    await prisma.task.create({
      data: { titre: "Ici", projectId: garde.id, statut: "doing", dateFin: utc("2026-07-01") },
    });
    await prisma.task.create({
      data: { titre: "Ailleurs", projectId: ecarte.id, statut: "doing", dateFin: utc("2026-07-01") },
    });

    const vue = await rapports.vueEnsemble(
      { periode: "mois", projets: [garde.id] },
      await global(),
      PERMISSIONS,
      MOMENT,
    );
    expect(vue.sante).toHaveLength(1);
    // Le bandeau d'alerte suit le filtre : sinon il annoncerait un retard
    // qu'aucun module de la page ne montre.
    expect(vue.alerte.tachesEnRetard).toBe(1);
  });

  it("le filtre par responsable ne garde que ses projets", async () => {
    await projet({ nom: "Le mien", chefId: chef });
    await projet({ nom: "Le sien", chefId: etranger });

    const vue = await rapports.vueEnsemble(
      { periode: "mois", responsables: [etranger] },
      await global(),
      PERMISSIONS,
      MOMENT,
    );
    expect(vue.sante.map((s) => s.nom)).toEqual(["Le sien"]);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// Vague 7-4 — dette de traçabilité.
// ════════════════════════════════════════════════════════════════════════════

describe("EX-RPT-09 — consulter la répartition des tâches par priorité et par statut", () => {
  it("les deux axes ne comptent PAS la même population, et c'est voulu", async () => {
    /*
     * La répartition par PRIORITÉ répond à « que reste-t-il à faire, et dans
     * quel ordre ? » : les tâches terminées n'y ont plus leur place, sinon
     * l'histogramme se remplit de travail déjà fait et cesse d'orienter.
     * La répartition par STATUT, elle, répond à « où en est-on ? » : la
     * colonne « Terminé » est justement ce qu'on vient y lire.
     *
     * Un test qui n'exercerait qu'un seul des deux axes laisserait passer la
     * confusion la plus probable — appliquer le même filtre aux deux.
     */
    const p = await projet({ nom: "Répartition" });
    await prisma.task.createMany({
      data: [
        { titre: "Critique en cours", projectId: p.id, priorite: "critical", statut: "doing" },
        { titre: "Haute à faire", projectId: p.id, priorite: "high", statut: "todo" },
        { titre: "Haute bloquée", projectId: p.id, priorite: "high", statut: "blocked" },
        { titre: "Normale finie", projectId: p.id, priorite: "normal", statut: "done" },
        { titre: "Basse finie", projectId: p.id, priorite: "low", statut: "done" },
      ],
    });

    const { repartitions } = await page();

    const parPriorite = new Map(repartitions.priorite.map((l) => [l.cle, l.nombre]));
    expect(parPriorite.get("critical")).toBe(1);
    expect(parPriorite.get("high")).toBe(2);
    // Les deux tâches terminées ne figurent PAS dans l'axe des priorités.
    expect(parPriorite.get("normal")).toBeUndefined();
    expect(parPriorite.get("low")).toBeUndefined();

    const parStatut = new Map(repartitions.statut.map((l) => [l.cle, l.nombre]));
    expect(parStatut.get("doing")).toBe(1);
    expect(parStatut.get("todo")).toBe(1);
    expect(parStatut.get("blocked")).toBe(1);
    // Elles y figurent ici, et c'est toute la différence entre les deux axes.
    expect(parStatut.get("done")).toBe(2);
  });

  it("le compte d'actives est la somme de l'axe priorité, pas celle de l'axe statut", async () => {
    const p = await projet({ nom: "Actives" });
    await prisma.task.createMany({
      data: [
        { titre: "A", projectId: p.id, priorite: "normal", statut: "todo" },
        { titre: "B", projectId: p.id, priorite: "normal", statut: "review" },
        { titre: "C", projectId: p.id, priorite: "normal", statut: "done" },
      ],
    });

    const { repartitions } = await page();

    expect(repartitions.actives).toBe(2);
    expect(repartitions.statut.reduce((n, l) => n + l.nombre, 0)).toBe(3);
  });

  it("RG-RPT-01 — LA RÉPARTITION S'ARRÊTE AU PÉRIMÈTRE : un histogramme divulgue autant qu'une liste", async () => {
    const mien = await projet({ nom: "Le mien", chefId: chef });
    const sien = await projet({ nom: "Le sien", chefId: etranger });
    await prisma.task.createMany({
      data: [
        { titre: "Visible", projectId: mien.id, priorite: "critical", statut: "doing" },
        { titre: "Invisible", projectId: sien.id, priorite: "critical", statut: "doing" },
      ],
    });

    const restreint = await perimetres.resoudre(chef, new Set(["users:read"]));
    const vue = await rapports.vueEnsemble(
      { periode: "mois" },
      restreint,
      new Set(["reports:read"]),
      MOMENT,
    );

    // « 2 tâches critiques en cours » aurait déjà trop dit du projet d'autrui.
    expect(vue.repartitions.priorite.find((l) => l.cle === "critical")?.nombre).toBe(1);
    expect(vue.repartitions.actives).toBe(1);
  });

  it("sans aucune tâche, les deux axes sont VIDES — pas une colonne à zéro inventée", async () => {
    await projet({ nom: "Neuf" });
    const { repartitions } = await page();
    expect(repartitions.priorite).toEqual([]);
    expect(repartitions.statut).toEqual([]);
    expect(repartitions.actives).toBe(0);
  });
});
