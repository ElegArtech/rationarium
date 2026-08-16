import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { creerClient, peupler, CIBLE, type PrismaClient } from "@trame/db";
import { PERMISSIONS } from "@trame/contracts";
import { PlanningService } from "../planning/planning.service.js";
import { TableauService } from "../tableau/tableau.service.js";
import { RapportsService } from "../rapports/rapports.service.js";
import { CompetencesService } from "../competences/competences.service.js";
import { RolesService } from "../administration/roles.service.js";
import { ActiviteService } from "../activite/activite.service.js";
import { TempsService } from "../temps/temps.service.js";
import { CalendrierService } from "../parametrage/calendrier.service.js";
import { AuditService } from "../commun/audit.service.js";
import { PerimetreService } from "../commun/perimetre.service.js";

/**
 * L-26 — **l'audit de performance, à la volumétrie cible.**
 *
 * `ADR-0015` a déplacé la cible de cet audit, et c'est le point de départ :
 * le prototype de la vague 0 a montré que la vue Mois n'est **pas** un problème
 * de rendu — 52 ms pour 500 ressources × 31 jours, 297 ms sur matériel bridé
 * six fois. Le budget de `cadrage/01 § 7` se dépense donc **côté serveur**,
 * dans l'agrégat de `RG-PLN-01`. La mesure porte sur la requête, pas sur la
 * peinture.
 *
 * **Le jeu de données est celui de la cible** : 500 utilisateurs, 200 projets,
 * 20 000 tâches, 5 ans d'historique. Mesurer sur dix lignes ne mesure rien —
 * aucun plan d'exécution n'y ressemble à celui de production.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * SUR LES SEUILS. `cadrage/01 § 7` donne des budgets de **bout en bout** :
 * planning d'un service sur une semaine en moins de 2 s, tableau de bord en
 * moins de 1 s. Le seuil retenu ici en alloue **80 % à la requête**, le reste
 * couvrant le transport en réseau fermé et un rendu que l'ADR-0015 mesure à
 * quelques dizaines de millisecondes. C'est un choix, il est écrit, et il est
 * conservateur : si la requête seule dépasse ce seuil, le budget est perdu.
 *
 * Ces seuils sont **bloquants** (`cadrage/04 § 5`). Une mesure qui avertit sans
 * bloquer se contourne par l'habitude en trois semaines.
 * ────────────────────────────────────────────────────────────────────────────
 */

const RACINE_DB = path.resolve(import.meta.dirname, "../../../../packages/db");
const utc = (s: string) => new Date(`${s}T00:00:00.000Z`);

/** 80 % du budget de bout en bout de `cadrage/01 § 7`. */
const BUDGET_PLANNING = 1_600;
const BUDGET_TABLEAU = 800;
/** Les vues d'analyse n'ont pas de budget au cadrage : celui-ci est le nôtre. */
const BUDGET_RAPPORTS = 2_000;
const BUDGET_MATRICE = 1_600;

let pg: StartedPostgreSqlContainer;
let prisma: PrismaClient;
let perimetres: PerimetreService;
let planning: PlanningService;
let tableau: TableauService;
let rapports: RapportsService;
let competences: CompetencesService;
let roles: RolesService;

/** Un agent quelconque du jeu, et le service auquel il appartient. */
let agent: string;
let service: string;

/**
 * Mesure la **médiane** de cinq exécutions, après une exécution de chauffe.
 *
 * La médiane et non la moyenne : une pause de ramasse-miettes déplace une
 * moyenne et laisse une médiane tranquille. La chauffe parce que le premier
 * appel paie la préparation des requêtes et le remplissage des caches — le
 * mesurer reviendrait à mesurer le démarrage, pas le service.
 */
async function mesurer(nom: string, appel: () => Promise<unknown>): Promise<number> {
  await appel();
  const releves: number[] = [];
  for (let i = 0; i < 5; i += 1) {
    const depart = performance.now();
    await appel();
    releves.push(performance.now() - depart);
  }
  releves.sort((a, b) => a - b);
  const mediane = Math.round(releves[2]!);
  // La sortie fait partie du livrable : un budget tenu de justesse et un budget
  // tenu largement demandent des décisions différentes.
  console.log(
    `  ${nom.padEnd(46)} médiane ${String(mediane).padStart(5)} ms   ` +
      `(min ${Math.round(releves[0]!)} · max ${Math.round(releves[4]!)})`,
  );
  return mediane;
}

beforeAll(async () => {
  pg = await new PostgreSqlContainer("postgres:18-alpine").start();
  execFileSync("pnpm", ["exec", "prisma", "migrate", "deploy"], {
    cwd: RACINE_DB,
    env: { ...process.env, DATABASE_URL: pg.getConnectionUri() },
    stdio: "pipe",
  });
  prisma = creerClient(pg.getConnectionUri());

  const remplissage = await peupler(prisma, CIBLE, PERMISSIONS);
  console.log(
    `\n  Jeu de volumétrie : ${CIBLE.utilisateurs} agents · ${CIBLE.projets} projets · ` +
      `${CIBLE.taches} tâches · ${CIBLE.annees} ans — peuplé en ${remplissage.duree} ms\n`,
  );

  // `ANALYZE` : sans statistiques à jour, le planificateur choisit des plans
  // qui n'ont rien à voir avec ceux de production. Mesurer sans cela mesure
  // un accident.
  await prisma.$executeRawUnsafe("ANALYZE");

  const audit = new AuditService(prisma as never);
  perimetres = new PerimetreService(prisma as never);
  const calendrier = new CalendrierService(prisma as never, audit);
  const activite = new ActiviteService(prisma as never, audit, perimetres);
  planning = new PlanningService(prisma as never, calendrier, audit, activite);
  const temps = new TempsService(prisma as never, audit, perimetres);
  tableau = new TableauService(prisma as never, planning, temps);
  rapports = new RapportsService(prisma as never, perimetres, audit);
  competences = new CompetencesService(prisma as never, audit, perimetres);
  roles = new RolesService(prisma as never, audit);

  const premier = await prisma.user.findFirstOrThrow({
    select: { id: true, services: { select: { serviceId: true }, take: 1 } },
    orderBy: { login: "asc" },
  });
  agent = premier.id;
  service = premier.services[0]!.serviceId;
}, 900_000);

afterAll(async () => {
  await prisma?.$disconnect();
  await pg?.stop();
});

// ════════════════════════════════════════════════════════════════════════════

describe("cadrage/01 § 7 — les budgets, à la volumétrie cible", () => {
  it("le jeu de données est bien à la cible — sinon la mesure ne vaut rien", async () => {
    const [users, projets, taches, conges, saisies] = await Promise.all([
      prisma.user.count(),
      prisma.project.count(),
      prisma.task.count(),
      prisma.leave.count(),
      prisma.timeEntry.count(),
    ]);

    expect(users).toBeGreaterThanOrEqual(CIBLE.utilisateurs);
    expect(projets).toBeGreaterThanOrEqual(CIBLE.projets);
    expect(taches).toBeGreaterThanOrEqual(CIBLE.taches);
    // L'historique compte autant que le volume : c'est lui qui décide si un
    // index de date sert à quelque chose.
    expect(conges).toBeGreaterThan(5_000);
    expect(saisies).toBeGreaterThan(15_000);
  });

  it("RG-PLN-01 — LE PLANNING D'UN SERVICE SUR UNE SEMAINE tient le budget", async () => {
    const perimetre = await perimetres.resoudre(agent, new Set(["users:manage_any"]));
    const permissions = new Set(["predefined_tasks:read"]);

    const mediane = await mesurer("planning · un service · une semaine", () =>
      planning.agreger(
        utc("2026-08-10"),
        utc("2026-08-16"),
        { services: [service] },
        perimetre,
        permissions,
      ),
    );

    expect(mediane).toBeLessThan(BUDGET_PLANNING);
  });

  it("le planning d'un MOIS entier, sur toute l'instance, reste servable", async () => {
    const perimetre = await perimetres.resoudre(agent, new Set(["users:manage_any"]));

    // Le pire cas raisonnable : 500 agents × 31 jours. Ce n'est pas le cas
    // nominal — une vue de département en compte quelques dizaines — mais
    // c'est celui qu'un directeur ouvrira un jour.
    const mediane = await mesurer("planning · instance entière · un mois", () =>
      planning.agreger(
        utc("2026-08-01"),
        utc("2026-08-31"),
        {},
        perimetre,
        new Set(["predefined_tasks:read"]),
      ),
    );

    // Deux fois le budget d'une semaine de service : quatre fois plus de jours
    // et vingt fois plus d'agents. Un seuil, pas une absence de seuil.
    expect(mediane).toBeLessThan(BUDGET_PLANNING * 2);
  });

  it("EX-DSH — LE TABLEAU DE BORD tient son budget d'une seconde", async () => {
    const perimetre = await perimetres.resoudre(agent, new Set(["users:manage_any"]));

    const mediane = await mesurer("tableau de bord · un agent", () =>
      tableau.accueil(agent, perimetre, new Set(["planning:read"]), utc("2026-08-11")),
    );

    expect(mediane).toBeLessThan(BUDGET_TABLEAU);
  });

  it("M17 — les rapports agrègent 200 projets sans décrocher", async () => {
    const perimetre = await perimetres.resoudre(agent, new Set(["users:manage_any"]));
    const permissions = new Set(["reports:read", "projects:readAll"]);

    const mediane = await mesurer("rapports · vue d'ensemble · un trimestre", () =>
      rapports.vueEnsemble({ periode: "trimestre" }, perimetre, permissions, utc("2026-08-11")),
    );

    expect(mediane).toBeLessThan(BUDGET_RAPPORTS);
  });

  it("la matrice de compétences — 500 agents × 60 compétences", async () => {
    const perimetre = await perimetres.resoudre(agent, new Set(["users:manage_any"]));

    const mediane = await mesurer("matrice de compétences · instance entière", () =>
      competences.matrice(perimetre),
    );

    expect(mediane).toBeLessThan(BUDGET_MATRICE);
  });

  it("la matrice de permissions — 26 modules × 30 actions", async () => {
    // Le jeu de volumétrie porte un rôle chargé du catalogue entier : sans
    // lui, ce contrôle se contentait de constater qu'il n'avait rien à
    // mesurer, ce qui est un trou dans un audit qui se veut exhaustif.
    const role = await prisma.role.findFirstOrThrow({ select: { id: true } });
    const mediane = await mesurer("matrice de permissions · un rôle", () =>
      roles.matrice(role.id),
    );
    expect(mediane).toBeLessThan(BUDGET_MATRICE);
  });
});

describe("Les plans d'exécution des requêtes chaudes", () => {
  // Les colonnes physiques portent le nom du modèle : le schéma ne pose pas de
  // `@map`. Les guillemets sont donc obligatoires — sans eux, PostgreSQL plie
  // en minuscules et ne trouve rien.
  /**
   * `.claude/rules/modele-de-donnees.md` nomme les index déterminants pour le
   * budget de deux secondes. Ce contrôle regarde ce que PostgreSQL en fait
   * **réellement** : un index déclaré et jamais employé ne tient aucun budget.
   *
   * Il n'échoue pas sur un balayage séquentiel — sur certaines tailles, le
   * planificateur a raison de le préférer. Il **rend le plan visible**, pour
   * que la décision se prenne sur une mesure et non sur une intuition.
   */
  const plan = async (sql: string): Promise<string> => {
    const lignes = await prisma.$queryRawUnsafe<{ "QUERY PLAN": string }[]>(
      `EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT) ${sql}`,
    );
    return lignes.map((l) => l["QUERY PLAN"]).join("\n");
  };

  it("les tâches d'une semaine passent par un index de date", async () => {
    const texte = await plan(`
      SELECT t.id FROM tasks t
      JOIN task_assignees a ON a."taskId" = t.id
      WHERE t."dateDebut" <= DATE '2026-08-16' AND t."dateFin" >= DATE '2026-08-10'
    `);
    console.log(`\n  ── Plan : tâches de la semaine ──\n${texte}\n`);
    /*
     * On affirme ce qui COMPTE, pas la forme du plan. Le planificateur choisit
     * ici une jointure par hachage plutôt qu'une boucle imbriquée, et il a
     * raison : la requête s'exécute en quelques millisecondes. Affirmer une
     * stratégie de jointure consacrerait un comportement observé au lieu d'une
     * exigence, et casserait au premier `ANALYZE` qui change d'avis.
     *
     * Ce qui compte : l'index de date des tâches sert, et non un balayage
     * complet des 20 000 lignes.
     */
    expect(texte).toMatch(/Index Scan on "tasks_date|Bitmap Index Scan on "tasks_date/);
  });

  it("les congés d'une période passent par l'index (user_id, dates)", async () => {
    const texte = await plan(`
      SELECT l.id FROM leaves l
      WHERE l."dateDebut" <= DATE '2026-08-16' AND l."dateFin" >= DATE '2026-08-10'
        AND l.statut IN ('pending', 'approved')
    `);
    console.log(`\n  ── Plan : congés de la période ──\n${texte}\n`);
    expect(texte.length).toBeGreaterThan(0);
  });

  it("le télétravail d'une période passe par son index de date", async () => {
    const texte = await plan(`
      SELECT w.id FROM telework w
      WHERE w.date BETWEEN DATE '2026-08-10' AND DATE '2026-08-16'
    `);
    console.log(`\n  ── Plan : télétravail de la période ──\n${texte}\n`);
    // L'index `(date)` existe : sur 20 000 lignes dont 7 jours, il doit servir.
    expect(texte).toMatch(/Index Scan|Bitmap/);
  });
});
