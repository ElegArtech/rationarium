import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { creerClient, type PrismaClient } from "@rationarium/db";
import { PlanningService } from "./planning.service.js";
import { CalendrierService } from "../parametrage/calendrier.service.js";
import { AuditService } from "../commun/audit.service.js";
import { PerimetreService } from "../commun/perimetre.service.js";
import { ActiviteService } from "../activite/activite.service.js";
import { TachesService } from "../taches/taches.service.js";
import { EvenementsService } from "../evenements/evenements.service.js";
import { NotificationsService } from "../notifications/notifications.service.js";
import { FileService } from "../notifications/file.service.js";

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
/*
 * Les gestes du planning restent chez les modules qui portent leurs règles :
 * déplacer une tâche est une affaire de tâches, créer un événement une affaire
 * d'événements. Les instancier ici est ce qui permet d'éprouver le RACCORD —
 * ce qu'un geste écrit, la grille doit le rendre.
 */
let taches: TachesService;
let evenements: EvenementsService;

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
  taches = new TachesService(
    prisma as never,
    audit,
    perimetres,
    new NotificationsService(prisma as never, new FileService()),
  );
  evenements = new EvenementsService(prisma as never, audit, perimetres);

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

// ════════════════════════════════════════════════════════════════════════════
// Les règles du cadrage qu'aucun test ne citait — domaine PLN.
//
// Aucun code de production n'est ajouté : ces suites éprouvent ce que le
// module prétend déjà tenir. Elles partent du TEXTE de l'exigence, pas de la
// signature du service.
//
// Ce que le serveur peut prouver d'une exigence d'interface, et ce qu'il ne
// peut pas : « basculer entre trois vues » et « naviguer d'une période à
// l'autre » sont des gestes de la vue 07, mais chacun se traduit par un appel
// dont les BORNES décident de ce qui est rendu. C'est cette moitié-là — la
// seule falsifiable côté serveur — qui est éprouvée ici.
// ════════════════════════════════════════════════════════════════════════════

/** Une semaine du lundi au dimanche, telle que la vue 07 la demande. */
const SEMAINE_1 = { debut: utc("2026-06-01"), fin: utc("2026-06-07") };
const SEMAINE_2 = { debut: utc("2026-06-08"), fin: utc("2026-06-14") };
const MOIS = { debut: utc("2026-06-01"), fin: utc("2026-06-30") };

describe("EX-PLN-01 — les trois vues : Semaine, Mois, Activité", () => {
  /*
   * Les trois vues ne sont pas trois écrans indépendants : deux d'entre elles
   * sont le MÊME agrégat sur deux bornes, la troisième est une grille à part.
   * Ce qui se prouve ici, c'est que la bascule ne perd rien — une occupation
   * vue en Semaine se retrouve en Mois — et que la vue Activité rend bien un
   * objet distinct, avec sa trame.
   */
  let tacheDeJuin: string;

  beforeAll(async () => {
    const t = await prisma.task.create({
      data: {
        titre: "Chantier de juin",
        dateDebut: utc("2026-06-03"),
        dateFin: utc("2026-06-04"),
        assignes: { create: [{ userId: ana }] },
      },
    });
    tacheDeJuin = t.id;
  });

  it("EX-PLN-01 — la vue SEMAINE rend sept jours, la vue MOIS les trente", async () => {
    const semaine = await planning.agreger(
      SEMAINE_1.debut, SEMAINE_1.fin, {}, await perimetreGlobal(), TOUT,
    );
    const mois = await planning.agreger(
      MOIS.debut, MOIS.fin, {}, await perimetreGlobal(), TOUT,
    );

    expect(semaine.periode.jours).toHaveLength(7);
    expect(semaine.periode.jours[0]).toBe("2026-06-01");
    expect(semaine.periode.jours.at(-1)).toBe("2026-06-07");
    expect(mois.periode.jours).toHaveLength(30);
    expect(mois.periode.jours.at(-1)).toBe("2026-06-30");
    // La synthèse suit la grille, jamais une période figée : une ligne par
    // jour affiché, sinon l'en-tête et le pied ne s'alignent plus.
    expect(semaine.synthese).toHaveLength(7);
    expect(mois.synthese).toHaveLength(30);
  });

  it("EX-PLN-01 — basculer de SEMAINE à MOIS ne perd pas l'occupation", async () => {
    const semaine = await planning.agreger(
      SEMAINE_1.debut, SEMAINE_1.fin, {}, await perimetreGlobal(), TOUT,
    );
    const mois = await planning.agreger(
      MOIS.debut, MOIS.fin, {}, await perimetreGlobal(), TOUT,
    );
    expect(semaine.occupations.taches.map((t) => t.id)).toContain(tacheDeJuin);
    expect(mois.occupations.taches.map((t) => t.id)).toContain(tacheDeJuin);
  });

  it("EX-PLN-01 — la vue ACTIVITÉ est une autre grille : jours en lignes, tâches en colonnes", async () => {
    /*
     * Elle n'est pas une variante d'échelle des deux premières : ses axes sont
     * inversés et son contenu est celui des tâches prédéfinies. Elle porte sa
     * trame dans le même appel (`RG-PLN-01`) — un jour férié découvert après
     * coup est un jour qu'on a déjà compté comme ouvré.
     */
    const permanence = await prisma.predefinedTask.create({
      data: { nom: `Astreinte ${uuid().slice(0, 6)}` },
    });
    await prisma.predefinedTaskAssignment.create({
      data: { predefinedTaskId: permanence.id, userId: ana, date: utc("2026-06-02") },
    });

    const grille = await planning.grilleActivite(
      SEMAINE_1.debut, SEMAINE_1.fin, await perimetreGlobal(),
    );

    expect(grille.lignes).toHaveLength(7);
    expect(grille.lignes[0]?.date).toBe("2026-06-01");
    expect(grille.colonnes.map((c) => c.id)).toContain(permanence.id);
    expect(grille.trame).toBeDefined();

    const mardi = grille.lignes.find((l) => l.date === "2026-06-02");
    const cellule = mardi?.cellules.find((c) => c.tacheId === permanence.id);
    expect(cellule?.agents.map((a) => a["id"])).toEqual([ana]);
    // Et le jour d'à côté est vide : sans cela la grille afficherait l'agent
    // sur toute la semaine.
    const lundi = grille.lignes.find((l) => l.date === "2026-06-01");
    expect(lundi?.cellules.find((c) => c.tacheId === permanence.id)?.agents).toEqual([]);
  });
});

describe("EX-PLN-02 — naviguer d'une période à l'autre, et revenir à aujourd'hui", () => {
  /*
   * La navigation est un geste du client ; ce que le serveur en porte, c'est
   * la BORNE. Deux semaines consécutives doivent être disjointes et
   * contiguës — un jour compté deux fois ferait apparaître un congé dans deux
   * semaines, un jour manquant le ferait disparaître entre les deux.
   */
  let tacheSemaine2: string;

  beforeAll(async () => {
    const t = await prisma.task.create({
      data: {
        titre: "Réunion de la semaine 2",
        dateDebut: utc("2026-06-10"),
        dateFin: utc("2026-06-10"),
        assignes: { create: [{ userId: bruno }] },
      },
    });
    tacheSemaine2 = t.id;
  });

  it("EX-PLN-02 — deux périodes consécutives sont DISJOINTES et contiguës", async () => {
    const s1 = await planning.agreger(
      SEMAINE_1.debut, SEMAINE_1.fin, {}, await perimetreGlobal(), TOUT,
    );
    const s2 = await planning.agreger(
      SEMAINE_2.debut, SEMAINE_2.fin, {}, await perimetreGlobal(), TOUT,
    );

    const communs = s1.periode.jours.filter((j) => s2.periode.jours.includes(j));
    expect(communs).toEqual([]);
    // Contiguës : le lendemain du dernier jour de l'une ouvre l'autre.
    expect(s1.periode.fin).toBe("2026-06-07");
    expect(s2.periode.debut).toBe("2026-06-08");
  });

  it("EX-PLN-02 — l'occupation SUIT la période : elle n'apparaît que dans la sienne", async () => {
    const s1 = await planning.agreger(
      SEMAINE_1.debut, SEMAINE_1.fin, {}, await perimetreGlobal(), TOUT,
    );
    const s2 = await planning.agreger(
      SEMAINE_2.debut, SEMAINE_2.fin, {}, await perimetreGlobal(), TOUT,
    );

    expect(s1.occupations.taches.map((t) => t.id)).not.toContain(tacheSemaine2);
    expect(s2.occupations.taches.map((t) => t.id)).toContain(tacheSemaine2);
  });

  it("EX-PLN-02 — « revenir à aujourd'hui » rend la période qui CONTIENT le jour courant", async () => {
    /*
     * Le retour à aujourd'hui n'a de sens que si une occupation datée du jour
     * y tombe. L'horloge n'est pas figée ici : le test pose la donnée SUR la
     * date du jour, quelle qu'elle soit, plutôt que sur une date écrite en
     * dur qui serait juste aujourd'hui et fausse demain.
     */
    const aujourdhui = utc(new Date().toISOString().slice(0, 10));
    const veille = new Date(aujourdhui);
    veille.setUTCDate(veille.getUTCDate() - 1);
    const lendemain = new Date(aujourdhui);
    lendemain.setUTCDate(lendemain.getUTCDate() + 1);

    const duJour = await prisma.task.create({
      data: {
        titre: "Du jour",
        dateDebut: aujourdhui,
        dateFin: aujourdhui,
        assignes: { create: [{ userId: ana }] },
      },
    });

    const courante = await planning.agreger(
      veille, lendemain, {}, await perimetreGlobal(), TOUT,
    );
    expect(courante.periode.jours).toContain(aujourdhui.toISOString().slice(0, 10));
    expect(courante.occupations.taches.map((t) => t.id)).toContain(duJour.id);

    // Et la période précédente, elle, ne la contient pas — sans quoi « revenir
    // à aujourd'hui » ne changerait rien à ce qu'on voit.
    const avantVeille = new Date(aujourdhui);
    avantVeille.setUTCDate(avantVeille.getUTCDate() - 8);
    const precedente = await planning.agreger(
      avantVeille, veille, {}, await perimetreGlobal(), TOUT,
    );
    expect(precedente.periode.jours).not.toContain(aujourdhui.toISOString().slice(0, 10));
    expect(precedente.occupations.taches.map((t) => t.id)).not.toContain(duJour.id);
  });
});

describe("EX-PLN-10 — le glisser-déposer change la DATE ou l'ASSIGNÉ", () => {
  /*
   * Le geste ne se simule pas ici : c'est son EFFET qui se prouve, au service
   * que la vue 07 appelle. Et l'effet se lit là où la vue le lira — dans
   * l'agrégat relu après le geste, pas dans la ligne en base.
   */
  it("EX-PLN-10 — déposer sur une autre colonne change la date, et la DURÉE est conservée", async () => {
    const t = await prisma.task.create({
      data: {
        titre: "À déplacer",
        dateDebut: utc("2026-07-06"),
        dateFin: utc("2026-07-08"),
        assignes: { create: [{ userId: ana }] },
      },
    });

    const r = await taches.deplacerDepuisPlanning(t.id, { nouvelleDate: utc("2026-07-13") }, ana);
    expect(r).toMatchObject({ dateModifiee: true, assigneModifie: false });

    const apres = await planning.agreger(
      utc("2026-07-13"), utc("2026-07-19"), {}, await perimetreGlobal(), TOUT,
    );
    const vue = apres.occupations.taches.find((x) => x.id === t.id);
    expect(vue?.dateDebut).toBe("2026-07-13");
    // Deux jours d'écart avant, deux jours d'écart après : un déplacement qui
    // écraserait la date de fin raccourcirait la tâche à l'insu de tous.
    expect(vue?.dateFin).toBe("2026-07-15");

    const avant = await planning.agreger(
      utc("2026-07-06"), utc("2026-07-12"), {}, await perimetreGlobal(), TOUT,
    );
    expect(avant.occupations.taches.map((x) => x.id)).not.toContain(t.id);
  });

  it("EX-PLN-10 — déposer sur une autre LIGNE change l'assigné, et la date ne bouge pas", async () => {
    const t = await prisma.task.create({
      data: {
        titre: "À réassigner",
        dateDebut: utc("2026-07-20"),
        dateFin: utc("2026-07-20"),
        assignes: { create: [{ userId: ana }] },
      },
    });

    const r = await taches.deplacerDepuisPlanning(
      t.id, { nouvelAssigneId: bruno, ancienAssigneId: ana }, ana,
    );
    expect(r).toMatchObject({ dateModifiee: false, assigneModifie: true });

    const apres = await planning.agreger(
      utc("2026-07-20"), utc("2026-07-26"), {}, await perimetreGlobal(), TOUT,
    );
    const vue = apres.occupations.taches.find((x) => x.id === t.id);
    expect(vue?.assignes).toEqual([bruno]);
    expect(vue?.dateDebut).toBe("2026-07-20");
  });

  it("EX-PLN-10 — le geste est TRACÉ, en nommant ce qui a bougé", async () => {
    const t = await prisma.task.create({
      data: {
        titre: "Tracée",
        dateDebut: utc("2026-08-03"),
        dateFin: utc("2026-08-03"),
        assignes: { create: [{ userId: ana }] },
      },
    });
    await taches.deplacerDepuisPlanning(t.id, { nouvelleDate: utc("2026-08-05") }, ana);

    const trace = await prisma.auditLog.findFirst({
      where: { action: "task.planning_move", entiteId: t.id },
    });
    expect(trace?.detail).toMatchObject({ dateModifiee: true, assigneModifie: false });
  });
});

describe("EX-PLN-11 — créer une tâche ou un événement DEPUIS le planning", () => {
  /*
   * Le planning est un lieu de geste autant que de lecture. Ce qui se prouve
   * au serveur, c'est le raccord : ce qu'on vient de créer apparaît DANS LA
   * MÊME GRILLE, sous la bonne personne et le bon jour. Une création qui
   * n'apparaît pas au rafraîchissement suivant est une création que
   * l'utilisateur refera.
   */
  it("EX-PLN-11 — la tâche créée apparaît AUSSITÔT dans la grille de sa période", async () => {
    const creee = await taches.creer(
      {
        titre: "Née du planning",
        dateDebut: utc("2026-09-08"),
        dateFin: utc("2026-09-08"),
        assigneIds: [ana],
      },
      acteur,
    );

    const grille = await planning.agreger(
      utc("2026-09-07"), utc("2026-09-13"), {}, await perimetreGlobal(), TOUT,
    );
    const vue = grille.occupations.taches.find((t) => t.id === creee.id);
    expect(vue).toBeTruthy();
    expect(vue?.assignes).toEqual([ana]);
    expect(vue?.dateDebut).toBe("2026-09-08");
    // Une tâche née du planning est hors projet par défaut, et la grille doit
    // la distinguer comme telle — parti pris n° 2.
    expect(vue?.horsProjet).toBe(true);
  });

  it("EX-PLN-11 — l'événement créé apparaît AUSSITÔT, sous ses participants", async () => {
    // `creer` rend `{ evenement, occurrences }` : la forme se lit sur la
    // SIGNATURE du service, jamais sur ce qu'on croit qu'il rend.
    const { evenement: cree } = await evenements.creer(
      {
        titre: "Point d'équipe",
        date: utc("2026-09-09"),
        journeeEntiere: false,
        heureDebut: "14:00",
        heureFin: "15:00",
        participantIds: [bruno],
      },
      acteur,
    );

    const grille = await planning.agreger(
      utc("2026-09-07"), utc("2026-09-13"), {}, await perimetreGlobal(), TOUT,
    );
    const vue = grille.occupations.evenements.find((e) => e.id === cree.id);
    expect(vue?.participants).toEqual([bruno]);
    expect(vue?.date).toBe("2026-09-09");
    expect(vue?.heureDebut).toBe("14:00");
  });

  it("EX-PLN-11 — hors de la période affichée, la création ne s'y invite pas", async () => {
    // Le contre-témoin de la suite : sans lui, une grille qui rendrait TOUT
    // ferait passer les deux tests précédents.
    const ailleurs = await taches.creer(
      {
        titre: "Née ailleurs",
        dateDebut: utc("2026-10-05"),
        dateFin: utc("2026-10-05"),
        assigneIds: [ana],
      },
      acteur,
    );
    const grille = await planning.agreger(
      utc("2026-09-07"), utc("2026-09-13"), {}, await perimetreGlobal(), TOUT,
    );
    expect(grille.occupations.taches.map((t) => t.id)).not.toContain(ailleurs.id);
  });
});

describe("EX-PLN-12 — ouvrir le DÉTAIL d'une tâche ou d'un événement", () => {
  /*
   * Le clic est un geste de la vue ; ce qui doit tenir au serveur, c'est le
   * RACCORD — l'identifiant que la grille rend est celui qu'accepte le point
   * d'entrée de détail. C'est exactement la couture que le dépôt a déjà payée
   * deux fois : une forme de réponse inventée côté client, et une fiche qui
   * ne rendait pas ce que l'écriture exigeait.
   */
  it("EX-PLN-12 — l'identifiant rendu par la grille OUVRE la fiche de la tâche", async () => {
    const t = await taches.creer(
      {
        titre: "Cliquable",
        dateDebut: utc("2026-11-02"),
        dateFin: utc("2026-11-03"),
        assigneIds: [ana],
      },
      acteur,
    );
    const grille = await planning.agreger(
      utc("2026-11-02"), utc("2026-11-08"), {}, await perimetreGlobal(), TOUT,
    );
    const depuisLaGrille = grille.occupations.taches.find((x) => x.titre === "Cliquable");
    expect(depuisLaGrille?.id).toBe(t.id);

    // On n'utilise QUE ce que la grille a rendu : c'est tout ce dont la vue
    // dispose au moment du clic.
    const fiche = await taches.fiche(depuisLaGrille!.id, await perimetreGlobal(), TOUT);
    expect(fiche.titre).toBe("Cliquable");
    expect(fiche.assignes.map((a) => a.userId)).toEqual([ana]);
    // La fiche porte sa version : sans elle, le détail s'ouvre mais rien ne
    // s'y modifie (`RG-GEN-07`).
    expect(fiche.version).toBeTypeOf("number");
  });

  it("EX-PLN-12 — l'identifiant rendu par la grille RETROUVE le détail de l'événement", async () => {
    const { evenement: e } = await evenements.creer(
      {
        titre: "À ouvrir",
        date: utc("2026-11-04"),
        journeeEntiere: true,
        participantIds: [bruno],
      },
      acteur,
    );
    const grille = await planning.agreger(
      utc("2026-11-02"), utc("2026-11-08"), {}, await perimetreGlobal(), TOUT,
    );
    const depuisLaGrille = grille.occupations.evenements.find((x) => x.titre === "À ouvrir");
    expect(depuisLaGrille?.id).toBe(e.id);

    const detail = (
      await evenements.surPlage(
        await perimetreGlobal(), new Set(["events:readAll"]), utc("2026-11-04"), utc("2026-11-04"),
      )
    ).find((x) => x.id === depuisLaGrille!.id);
    expect(detail?.titre).toBe("À ouvrir");
    // Le détail nomme ses participants, là où la grille n'en rendait que les
    // identifiants : c'est ce qui distingue le détail de la carte.
    expect(detail?.participants.map((p) => p.user.id)).toEqual([bruno]);
    expect(detail?.version).toBeTypeOf("number");
  });
});
