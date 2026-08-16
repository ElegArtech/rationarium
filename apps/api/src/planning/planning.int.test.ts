import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { creerClient, type PrismaClient } from "@trame/db";
import { PlanningService } from "./planning.service.js";
import { CalendrierService } from "../parametrage/calendrier.service.js";
import { AuditService } from "../commun/audit.service.js";
import { PerimetreService } from "../commun/perimetre.service.js";
import { ActiviteService } from "../activite/activite.service.js";

/**
 * L-20 — le planning unifié, sur PostgreSQL réel.
 *
 * L'objet de ces tests n'est pas « l'agrégat rend des données » : c'est
 * **ce qu'il refuse de rendre**, et **ce qu'il compte**. Un planning qui laisse
 * fuir une personne hors périmètre, ou qui compte deux fois un agent rattaché
 * à deux services, est faux d'une façon qui ne se voit pas à l'œil.
 */

const RACINE_DB = path.resolve(import.meta.dirname, "../../../../packages/db");
const utc = (s: string) => new Date(`${s}T00:00:00.000Z`);
const uuid = () => crypto.randomUUID();

let pg: StartedPostgreSqlContainer;
let prisma: PrismaClient;
let planning: PlanningService;
let perimetres: PerimetreService;

let acteur: string;
let direction: string;
let departement: string;
let serviceA: string;
let serviceB: string;
/** Bruno appartient à deux services : c'est le piège du comptage. */
let bruno: string;
let ana: string;
/** Chloé est hors du département : elle ne doit apparaître nulle part. */
let chloe: string;
let typeConge: string;

async function agent(prenom: string, departementId: string | null, services: string[] = []) {
  const id = uuid();
  await prisma.user.create({
    data: {
      id, login: `u-${id.slice(0, 8)}`, email: `${id.slice(0, 8)}@x.fr`,
      motDePasseHash: "x", prenom, nom: "Agent",
      ...(departementId ? { departementId } : {}),
      ...(services.length ? { services: { create: services.map((serviceId) => ({ serviceId })) } } : {}),
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
  perimetres = new PerimetreService(prisma as never);
  planning = new PlanningService(
    prisma as never,
    new CalendrierService(prisma as never, audit),
    audit,
    new ActiviteService(prisma as never, audit, perimetres),
  );

  direction = uuid();
  await prisma.direction.create({ data: { id: direction, nom: `Dir ${direction.slice(0, 6)}` } });
  departement = uuid();
  await prisma.departement.create({
    data: { id: departement, nom: `Dep ${departement.slice(0, 6)}`, directionId: direction },
  });
  const autreDepartement = uuid();
  await prisma.departement.create({
    data: { id: autreDepartement, nom: `Dep ${autreDepartement.slice(0, 6)}`, directionId: direction },
  });

  serviceA = uuid();
  serviceB = uuid();
  await prisma.service.createMany({
    data: [
      { id: serviceA, nom: "Aatelier", departementId: departement },
      { id: serviceB, nom: "Bureau", departementId: departement },
    ],
  });

  acteur = await agent("Acteur", departement);
  ana = await agent("Ana", departement, [serviceA]);
  bruno = await agent("Bruno", departement, [serviceA, serviceB]);
  chloe = await agent("Chloe", autreDepartement);

  const type = await prisma.leaveType.create({
    data: { code: `CA-${uuid().slice(0, 6)}`, nom: "Congés annuels", couleur: "#123456" },
  });
  typeConge = type.id;
}, 240_000);

afterAll(async () => {
  await prisma?.$disconnect();
  await pg?.stop();
});

/** Le périmètre d'un responsable de département : Ana, Bruno et l'acteur. */
const perimetreDepartement = () => perimetres.resoudre(acteur, new Set(["users:read"]));
const perimetreGlobal = () => perimetres.resoudre(acteur, new Set(["users:manage_any"]));

const TOUT = new Set(["predefined_tasks:read", "tasks:read_confidential"]);

// ════════════════════════════════════════════════════════════════════════════

describe("RG-PLN-01 — l'agrégat rapporte tout, en une sollicitation", () => {
  it("EX-PLN-03 — les six natures d'occupation cohabitent dans la même réponse", async () => {
    const tache = await prisma.task.create({
      data: {
        titre: "Rédiger la note", dateDebut: utc("2026-03-03"), dateFin: utc("2026-03-04"),
        assignes: { create: [{ userId: ana }] },
      },
    });
    await prisma.leave.create({
      data: {
        userId: bruno, typeId: typeConge, dateDebut: utc("2026-03-05"), dateFin: utc("2026-03-05"),
        joursOuvres: 1, statut: "approved",
      },
    });
    await prisma.telework.create({ data: { userId: ana, date: utc("2026-03-02"), etat: "telework" } });
    const evenement = await prisma.event.create({
      data: {
        titre: "Comité", date: utc("2026-03-03"), journeeEntiere: true,
        participants: { create: [{ userId: bruno }] },
      },
    });
    const permanence = await prisma.predefinedTask.create({
      data: { nom: `Accueil ${uuid().slice(0, 6)}` },
    });
    await prisma.predefinedTaskAssignment.create({
      data: { predefinedTaskId: permanence.id, userId: ana, date: utc("2026-03-04") },
    });

    const p = await planning.agreger(
      utc("2026-03-02"), utc("2026-03-06"), {}, await perimetreGlobal(), TOUT,
    );

    expect(p.periode.jours).toHaveLength(5);
    expect(p.occupations.taches.map((t) => t.id)).toContain(tache.id);
    expect(p.occupations.conges).toHaveLength(1);
    expect(p.occupations.teletravail).toHaveLength(1);
    expect(p.occupations.evenements.map((e) => e.id)).toContain(evenement.id);
    expect(p.occupations.permanences?.length).toBe(1);
    // La trame de fond fait partie du même appel : la demander séparément
    // ferait clignoter la grille au chargement.
    expect(p.trame).toBeDefined();
  });

  it("une tâche qui CHEVAUCHE la période y apparaît, même commencée avant", async () => {
    const longue = await prisma.task.create({
      data: {
        titre: "Chantier long", dateDebut: utc("2026-04-01"), dateFin: utc("2026-04-30"),
        assignes: { create: [{ userId: ana }] },
      },
    });

    const p = await planning.agreger(
      utc("2026-04-13"), utc("2026-04-17"), {}, await perimetreGlobal(), TOUT,
    );
    // Sans le chevauchement, une tâche d'un mois serait invisible trois
    // semaines sur quatre.
    expect(p.occupations.taches.map((t) => t.id)).toContain(longue.id);
  });

  it("RG-TSK-11 — une tâche multi-assignée s'annonce comme telle AVANT le geste", async () => {
    await prisma.task.create({
      data: {
        titre: "Tâche partagée", dateDebut: utc("2026-05-04"), dateFin: utc("2026-05-04"),
        assignes: { create: [{ userId: ana }, { userId: bruno }] },
      },
    });

    const p = await planning.agreger(
      utc("2026-05-04"), utc("2026-05-08"), {}, await perimetreGlobal(), TOUT,
    );
    const partagee = p.occupations.taches.find((t) => t.titre === "Tâche partagée");
    // La vue doit pouvoir refuser le glisser-déposer en date d'emblée, plutôt
    // que d'attendre le refus du serveur après le geste.
    expect(partagee?.multiAssignee).toBe(true);
  });

  it("une tâche hors projet est marquée comme telle — le brief l'exige distincte", async () => {
    const p = await planning.agreger(
      utc("2026-03-02"), utc("2026-03-06"), {}, await perimetreGlobal(), TOUT,
    );
    expect(p.occupations.taches.every((t) => t.horsProjet)).toBe(true);
  });
});

describe("RG-PLN-02 — le périmètre, et rien au-delà", () => {
  it("une personne hors du périmètre n'apparaît dans AUCUN groupe", async () => {
    const p = await planning.agreger(
      utc("2026-03-02"), utc("2026-03-06"), {}, await perimetreDepartement(), TOUT,
    );
    const vus = p.groupes.flatMap((g) => g.personnes.map((x) => x.id));
    expect(vus).toContain(ana);
    // L'assertion qui porte : l'absence.
    expect(vus).not.toContain(chloe);
  });

  it("et ses occupations ne fuient pas non plus par la porte des congés", async () => {
    await prisma.leave.create({
      data: {
        userId: chloe, typeId: typeConge, dateDebut: utc("2026-03-03"), dateFin: utc("2026-03-03"),
        joursOuvres: 1, statut: "approved",
      },
    });

    const p = await planning.agreger(
      utc("2026-03-02"), utc("2026-03-06"), {}, await perimetreDepartement(), TOUT,
    );
    expect(p.occupations.conges.map((c) => c.userId)).not.toContain(chloe);
  });

  it("RG-SCOPE-04 — une tâche confidentielle reste invisible sans permission explicite", async () => {
    await prisma.task.create({
      data: {
        titre: "Dossier sensible", confidentielle: true,
        dateDebut: utc("2026-06-01"), dateFin: utc("2026-06-01"),
        assignes: { create: [{ userId: ana }] },
      },
    });

    // Le périmètre est résolu SANS le droit au confidentiel : c'est lui qui
    // porte l'information, pas la permission relue au moment de la requête.
    const ordinaire = await perimetres.resoudre(acteur, new Set(["users:read"]));
    const sans = await planning.agreger(
      utc("2026-06-01"), utc("2026-06-05"), {}, ordinaire, new Set(),
    );
    expect(sans.occupations.taches.map((t) => t.titre)).not.toContain("Dossier sensible");

    // Le planning n'est pas une porte dérobée sur ce que la vue Tâches refuse.
    const habilite = await perimetres.resoudre(
      acteur,
      new Set(["users:read", "tasks:read_confidential"]),
    );
    const avec = await planning.agreger(
      utc("2026-06-01"), utc("2026-06-05"), {}, habilite, TOUT,
    );
    expect(avec.occupations.taches.map((t) => t.titre)).toContain("Dossier sensible");
  });

  it("EX-PLN-05 — « Mon périmètre » restreint quelqu'un qui a pourtant le droit de voir plus", async () => {
    const large = await planning.agreger(
      utc("2026-03-02"), utc("2026-03-06"), {}, await perimetreGlobal(), TOUT,
    );
    const restreint = await planning.agreger(
      utc("2026-03-02"), utc("2026-03-06"), { monPerimetre: true }, await perimetreGlobal(), TOUT,
    );
    const compte = (p: typeof large) =>
      new Set(p.groupes.flatMap((g) => g.personnes.map((x) => x.id))).size;
    expect(compte(restreint)).toBeLessThan(compte(large));
  });

  it("EX-PLN-05 — le filtre par service ne rend que les agents de ce service", async () => {
    const p = await planning.agreger(
      utc("2026-03-02"), utc("2026-03-06"), { services: [serviceB] }, await perimetreGlobal(), TOUT,
    );
    const vus = new Set(p.groupes.flatMap((g) => g.personnes.map((x) => x.id)));
    expect(vus.has(bruno)).toBe(true);
    expect(vus.has(ana)).toBe(false);
  });
});

describe("RG-PLN-07 — les permanences ne se montrent qu'avec le droit", () => {
  it("sans le droit, elles valent NULL — ce qui n'est pas « aucune permanence »", async () => {
    const p = await planning.agreger(
      utc("2026-03-02"), utc("2026-03-06"), {}, await perimetreGlobal(), new Set(),
    );
    // La distinction compte : un tableau vide dirait « personne n'est de
    // permanence cette semaine », ce qui serait faux.
    expect(p.occupations.permanences).toBeNull();
  });

  it("avec le droit, elles portent leur tâche d'origine", async () => {
    const p = await planning.agreger(
      utc("2026-03-02"), utc("2026-03-06"), {}, await perimetreGlobal(), TOUT,
    );
    expect(p.occupations.permanences?.[0]?.predefinedTask.nom).toMatch(/^Accueil/);
  });
});

describe("EX-PLN-04, EX-PLN-08 — les groupes et la synthèse", () => {
  it("UN AGENT DE DEUX SERVICES APPARAÎT DEUX FOIS, mais n'est compté qu'une", async () => {
    const p = await planning.agreger(
      utc("2026-03-02"), utc("2026-03-06"), {}, await perimetreDepartement(), TOUT,
    );
    const apparitions = p.groupes.flatMap((g) => g.personnes.map((x) => x.id)).filter((x) => x === bruno);
    expect(apparitions).toHaveLength(2);

    // C'est le piège du comptage : un effectif de trois en afficherait quatre.
    expect(p.synthese[0]?.total).toBe(3);
  });

  it("un agent sans service forme son propre groupe, en fin de liste", async () => {
    const p = await planning.agreger(
      utc("2026-03-02"), utc("2026-03-06"), {}, await perimetreDepartement(), TOUT,
    );
    const dernier = p.groupes[p.groupes.length - 1];
    expect(dernier?.service).toBeNull();
    // Un agent invisible au planning est un agent qu'on croit disponible.
    expect(dernier?.personnes.map((x) => x.id)).toContain(acteur);
  });

  it("EX-PLN-08 — congé et télétravail se cumulent sans se compter deux fois", async () => {
    // Ana est en télétravail le 2, Bruno en congé le 5.
    const p = await planning.agreger(
      utc("2026-03-02"), utc("2026-03-06"), {}, await perimetreDepartement(), TOUT,
    );
    const parJour = new Map(p.synthese.map((s) => [s.date, s]));
    expect(parJour.get("2026-03-02")?.absents).toBe(1);
    expect(parJour.get("2026-03-05")?.absents).toBe(1);
    expect(parJour.get("2026-03-03")?.absents).toBe(0);

    // Le même agent en congé ET en télétravail le même jour compte une fois.
    await prisma.telework.create({ data: { userId: bruno, date: utc("2026-03-05"), etat: "telework" } });
    const apres = await planning.agreger(
      utc("2026-03-02"), utc("2026-03-06"), {}, await perimetreDepartement(), TOUT,
    );
    expect(apres.synthese.find((s) => s.date === "2026-03-05")?.absents).toBe(1);
  });

  it("UN CONGÉ EN ATTENTE N'EST PAS UNE ABSENCE — il gonflerait le chiffre", async () => {
    await prisma.leave.create({
      data: {
        userId: ana, typeId: typeConge, dateDebut: utc("2026-03-06"), dateFin: utc("2026-03-06"),
        joursOuvres: 1, statut: "pending",
      },
    });

    const p = await planning.agreger(
      utc("2026-03-02"), utc("2026-03-06"), {}, await perimetreDepartement(), TOUT,
    );
    // Il est bien affiché — EX-PLN-13 exige de le distinguer…
    expect(p.occupations.conges.some((c) => c.statut === "pending")).toBe(true);
    // …mais il ne compte pas : la décision n'est pas prise.
    expect(p.synthese.find((s) => s.date === "2026-03-06")?.absents).toBe(0);
  });

  it("le pourcentage tient sur un effectif nul sans produire NaN", async () => {
    const p = await planning.agreger(
      utc("2026-03-02"), utc("2026-03-06"), { ressourceId: uuid() }, await perimetreGlobal(), TOUT,
    );
    expect(p.groupes).toEqual([]);
    expect(p.synthese.every((s) => s.pourcentage === 0)).toBe(true);
  });
});

describe("EX-PLN-15 — export et import ICS", () => {
  it("l'export respecte le périmètre — un fichier sort du produit", async () => {
    const ics = await planning.exporterIcs(
      utc("2026-03-02"), utc("2026-03-06"), {}, await perimetreDepartement(), utc("2026-08-16"),
    );
    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).toContain("Comité");
    // Chloé est hors périmètre : son congé du 3 mars n'a rien à faire là.
    expect(ics).not.toContain("Chloe");
  });

  it("un congé EN ATTENTE ne s'exporte pas — il paraîtrait acquis ailleurs", async () => {
    const ics = await planning.exporterIcs(
      utc("2026-03-02"), utc("2026-03-06"), {}, await perimetreDepartement(), utc("2026-08-16"),
    );
    // Le congé approuvé de Bruno y est ; celui d'Ana, en attente, non.
    expect(ics).toContain("Bruno Agent — Congés annuels");
    expect(ics).not.toContain("Ana Agent — Congés annuels");
  });

  it("l'import rend compte : créés, ignorés", async () => {
    const fichier = [
      "BEGIN:VCALENDAR",
      "BEGIN:VEVENT",
      "UID:externe-1",
      "DTSTART;VALUE=DATE:20261110",
      "SUMMARY:Séminaire externe",
      "END:VEVENT",
      "BEGIN:VEVENT",
      "DTSTART;VALUE=DATE:20261111",
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");

    const bilan = await planning.importerIcs(fichier, acteur);
    expect(bilan).toMatchObject({ crees: 1, existants: 0, ignores: 1 });
    expect(await prisma.event.count({ where: { titre: "Séminaire externe" } })).toBe(1);
  });

  it("REJOUÉ, IL NE DUPLIQUE RIEN — c'est le seul garde-fou d'un import", async () => {
    const fichier = [
      "BEGIN:VCALENDAR",
      "BEGIN:VEVENT",
      "UID:externe-2",
      "DTSTART;VALUE=DATE:20261112",
      "SUMMARY:Atelier partenaire",
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");

    await planning.importerIcs(fichier, acteur);
    const second = await planning.importerIcs(fichier, acteur);

    expect(second).toMatchObject({ crees: 0, existants: 1 });
    expect(await prisma.event.count({ where: { titre: "Atelier partenaire" } })).toBe(1);
  });

  it("M20 — l'import est tracé avec son bilan", async () => {
    const trace = await prisma.auditLog.findFirst({
      where: { action: "event.create", entiteId: "import-ics" },
      orderBy: { horodatage: "desc" },
    });
    expect(trace?.detail).toMatchObject({ source: "ics" });
  });
});
