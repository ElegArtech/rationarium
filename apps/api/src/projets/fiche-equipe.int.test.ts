import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { creerClient, type PrismaClient } from "@rationarium/db";
import { ProjetsService } from "./projets.service.js";
import { AuditService } from "../commun/audit.service.js";
import { NotificationsService } from "../notifications/notifications.service.js";
import { FileService } from "../notifications/file.service.js";
import { PerimetreService } from "../commun/perimetre.service.js";

/**
 * L-32 — les points d'entrée ajoutés pour les vues 11, 13 et 14 : fiche
 * agrégée, équipe en trois populations, jalon sans date.
 */

const RACINE_DB = path.resolve(import.meta.dirname, "../../../../packages/db");
const utc = (s: string) => new Date(`${s}T00:00:00.000Z`);

let pg: StartedPostgreSqlContainer;
let prisma: PrismaClient;
let projets: ProjetsService;
let perimetres: PerimetreService;
let acteur: string;

/*
 * Ces suites éprouvent le CONTENU des lectures, pas leur cloisonnement : elles
 * passent donc un périmètre de gestion globale. Le cloisonnement de `fiche`,
 * `budget`, `equipe` et `feuilleDeRoute` a sa propre suite.
 *
 * `tasks:manage_any` accompagne désormais `projects:manage_any`, et il n'est
 * pas décoratif : depuis que les compteurs de tâches d'un projet respectent
 * `filtreTache` (`RG-SCOPE-04`), ouvrir un projet ne suffit plus à en compter
 * les tâches. La suite annonçait « un périmètre de gestion globale » en n'en
 * passant qu'une moitié — celle du domaine projet —, et les projets de ce
 * décor sont créés en base sans créateur : leur fiche rendait donc zéro tâche.
 */
const global = () =>
  perimetres.resoudre(acteur, new Set(["projects:manage_any", "tasks:manage_any"]));
const toutes: ReadonlySet<string> = new Set(["projects:manage_any", "tasks:manage_any"]);

async function agent(prenom = "A", nom = "T") {
  const id = crypto.randomUUID();
  await prisma.user.create({
    data: {
      id, login: `u-${id.slice(0, 8)}`, email: `${id.slice(0, 8)}@x.fr`,
      motDePasseHash: "x", prenom, nom,
    },
  });
  return id;
}

async function projet(nom: string, données: Record<string, unknown> = {}) {
  return prisma.project.create({
    data: {
      nom, dateDebut: utc("2026-01-01"), dateFin: utc("2026-12-31"), ...données,
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
  // `RG-NTF-04` — la file n'est PAS démarrée ici. C'est délibéré : ces suites
  // prouvent au passage que les actions métier aboutissent sans elle.
  const notifications = new NotificationsService(prisma as never, new FileService());
  const audit = new AuditService(prisma as never);
  perimetres = new PerimetreService(prisma as never);
  projets = new ProjetsService(prisma as never, audit, perimetres, notifications);
  acteur = await agent("Acteur", "Test");
}, 240_000);

afterAll(async () => {
  await prisma?.$disconnect();
  await pg?.stop();
});

describe("EX-PRJ-02 — la fiche rassemble ce que la vue 11 affiche", () => {
  it("elle porte progression, budget, comptes de tâches et d'équipe en une lecture", async () => {
    const p = await projet("Fiche complète", { budgetHeures: 100 });
    const membre = await agent("Membre", "Un");

    await prisma.task.createMany({
      data: [
        { titre: "A", projectId: p.id, statut: "done", avancement: 100 },
        { titre: "B", projectId: p.id, statut: "doing", avancement: 50 },
        { titre: "C", projectId: p.id, statut: "blocked", avancement: 0 },
      ],
    });
    await prisma.projectMember.create({
      data: { projectId: p.id, userId: membre, roleProjet: "membre", tauxAllocation: 40 },
    });
    await prisma.timeEntry.create({
      data: { userId: membre, projectId: p.id, date: utc("2026-03-02"), heures: 12 },
    });

    const fiche = await projets.fiche(p.id, await global(), toutes);

    // La progression est la moyenne des avancements : (100 + 50 + 0) / 3.
    expect(fiche.progression).toBe(50);
    expect(fiche.taches).toEqual({ total: 3, enCours: 1, bloquees: 1 });
    expect(fiche.budget).toMatchObject({ alloue: 100, consomme: 12, restant: 88 });
    expect(fiche.equipe).toEqual({ agents: 1, tiers: 0, clients: 0 });
  });

  it("un projet inexistant est refusé, pas rendu vide", async () => {
    await expect(
      projets.fiche(crypto.randomUUID(), await global(), toutes),
    ).rejects.toMatchObject({
      code: "introuvable",
    });
  });

  it("les valeurs absentes le restent — la fiche n'invente pas de zéro", async () => {
    const p = await projet("Sans rien");
    const fiche = await projets.fiche(p.id, await global(), toutes);
    expect(fiche.budget.alloue).toBeNull();
    expect(fiche.budget.restant).toBeNull();
    expect(fiche.chef).toBeNull();
    expect(fiche.dernierInstantane).toBeNull();
    // Un projet sans tâche est à 0 %, pas à 100 : la division vide est gardée.
    expect(fiche.progression).toBe(0);
  });
});

describe("EX-PRJ-09 — l'équipe distingue trois populations", () => {
  it("agents, tiers et clients ressortent séparément", async () => {
    const p = await projet("Trois populations");
    const a = await agent("Anne", "Agent");
    const t = await prisma.thirdParty.create({
      data: { type: "organisation", organisation: "Presta SA" },
    });
    const c = await prisma.client.create({ data: { nom: "Direction bénéficiaire" } });

    await prisma.projectMember.create({
      data: { projectId: p.id, userId: a, roleProjet: "developpeur", tauxAllocation: 60 },
    });
    await prisma.projectThirdParty.create({ data: { projectId: p.id, thirdPartyId: t.id } });
    await prisma.projectClient.create({ data: { projectId: p.id, clientId: c.id } });

    const equipe = await projets.equipe(p.id, await global(), toutes);

    expect(equipe.agents).toHaveLength(1);
    expect(equipe.tiers).toHaveLength(1);
    expect(equipe.clients).toHaveLength(1);
    expect(equipe.agents[0]?.utilisateur.prenom).toBe("Anne");
  });

  it("l'allocation cumulée ne compte QUE les agents", async () => {
    const p = await projet("Charge");
    const a1 = await agent("Un", "Agent");
    const a2 = await agent("Deux", "Agent");
    const t = await prisma.thirdParty.create({ data: { type: "individual", contactNom: "Presta" } });

    await prisma.projectMember.createMany({
      data: [
        { projectId: p.id, userId: a1, roleProjet: "developpeur", tauxAllocation: 80 },
        { projectId: p.id, userId: a2, roleProjet: "testeur", tauxAllocation: 50 },
      ],
    });
    await prisma.projectThirdParty.create({ data: { projectId: p.id, thirdPartyId: t.id } });

    // Un tiers ne consomme pas la charge des services : il ne s'ajoute pas.
    expect((await projets.equipe(p.id, await global(), toutes)).allocationCumulee).toBe(130);
  });

  it("un agent sans allocation ne fausse pas le cumul", async () => {
    const p = await projet("Sans taux");
    const a = await agent("Sans", "Taux");
    await prisma.projectMember.create({
      data: { projectId: p.id, userId: a, roleProjet: "observateur" },
    });
    expect((await projets.equipe(p.id, await global(), toutes)).allocationCumulee).toBe(0);
  });
});

describe("EX-PRJ-09 — le retrait défait un lien, il n'efface rien", () => {
  /*
   * `RG-PRJ-12` — le retrait emporte les affectations DU PROJET, et rien
   * d'autre.
   *
   * Ce contrôle affirmait l'inverse jusqu'au 2026-09-06 : « les tâches
   * survivent au retrait ». C'était une décision prise à l'implémentation sur
   * une spécification muette, et elle contredisait `RG-SCOPE-02` — un projet
   * est visible à ses MEMBRES : l'affectation conservée laissait quelqu'un
   * porteur d'une tâche d'un projet qu'il ne peut plus ouvrir. La règle est
   * désormais écrite au cadrage, et c'est elle que le contrôle cite.
   *
   * Les DEUX moitiés comptent, et elles s'opposent : la tâche hors projet et
   * le temps déclaré ne bougent pas. Sans la tâche hors projet, un
   * `deleteMany` trop large passerait au vert.
   */
  it("RG-PRJ-12 — le retrait emporte les affectations du projet, PAS le reste", async () => {
    const p = await projet("Retrait");
    const a = await agent("Parti", "Ailleurs");
    await prisma.projectMember.create({
      data: { projectId: p.id, userId: a, roleProjet: "developpeur", tauxAllocation: 30 },
    });
    const tache = await prisma.task.create({
      data: { titre: "La sienne", projectId: p.id, assignes: { create: { userId: a } } },
    });
    const ailleurs = await prisma.task.create({
      data: { titre: "Hors projet", assignes: { create: { userId: a } } },
    });
    /*
     * Le RACI est un SECOND attachement au travail du projet, distinct de
     * l'affectation : « garant » d'une tâche d'un projet qu'on ne peut plus
     * ouvrir est une responsabilité que personne ne peut plus exercer. Il part
     * avec, et celui de la tâche hors projet reste — sans cette seconde
     * moitié, un `deleteMany` trop large passerait au vert.
     */
    await prisma.taskRaci.create({
      data: { taskId: tache.id, userId: a, role: "accountable" },
    });
    await prisma.taskRaci.create({
      data: { taskId: ailleurs.id, userId: a, role: "consulted" },
    });
    await prisma.timeEntry.create({
      data: { userId: a, projectId: p.id, date: utc("2026-04-01"), heures: 5 },
    });

    const rendu = await projets.retirerMembre(p.id, a, acteur, await global(), toutes);

    expect(rendu).toEqual({ tachesRetirees: 1, raciRetires: 1 });
    expect((await projets.equipe(p.id, await global(), toutes)).agents).toHaveLength(0);
    expect(await prisma.taskAssignee.count({ where: { taskId: tache.id } })).toBe(0);
    expect(await prisma.taskRaci.count({ where: { taskId: tache.id } })).toBe(0);
    expect(await prisma.taskRaci.count({ where: { taskId: ailleurs.id } })).toBe(1);

    // Ce qui distingue « retirer du projet » de « supprimer » : la tâche est
    // toujours là, sans assigné ; le temps déclaré alimente encore `RG-PRJ-08` ;
    // et une affectation qui ne relève pas du projet n'est pas concernée.
    expect(await prisma.task.count({ where: { id: tache.id } })).toBe(1);
    expect(await prisma.timeEntry.count({ where: { userId: a } })).toBe(1);
    expect(await prisma.taskAssignee.count({ where: { taskId: ailleurs.id } })).toBe(1);
  });

  /*
   * Le compte que la vue ANNONCE avant de retirer.
   *
   * Il voyage avec l'équipe : l'écran qui pose la question est celui qui lit
   * la réponse, et une route d'impact par membre aurait fait un aller-retour
   * de plus pour un nombre déjà calculable.
   */
  it("RG-PRJ-12 — l'équipe porte le compte des tâches assignées, par membre", async () => {
    const p = await projet("Compte d'affectations");
    const a = await agent("Compté", "Deux");
    const b = await agent("Compté", "Zero");
    await prisma.projectMember.createMany({
      data: [
        { projectId: p.id, userId: a, roleProjet: "membre" },
        { projectId: p.id, userId: b, roleProjet: "membre" },
      ],
    });
    await prisma.task.create({
      data: { titre: "Une", projectId: p.id, assignes: { create: { userId: a } } },
    });
    await prisma.task.create({
      data: { titre: "Deux", projectId: p.id, assignes: { create: { userId: a } } },
    });

    await prisma.taskRaci.createMany({
      data: [
        { taskId: (await prisma.task.findFirstOrThrow({ where: { titre: "Une", projectId: p.id } })).id, userId: a, role: "responsible" },
      ],
    });

    const equipe = await projets.equipe(p.id, await global(), toutes);
    const compte = new Map(equipe.agents.map((m) => [m.userId, m.tachesAssignees]));
    const compteRaci = new Map(equipe.agents.map((m) => [m.userId, m.raciSurTaches]));
    expect(compte.get(a)).toBe(2);
    expect(compte.get(b)).toBe(0);
    // Deux attachements distincts, deux comptes : la fenêtre les nomme à part.
    expect(compteRaci.get(a)).toBe(1);
    expect(compteRaci.get(b)).toBe(0);
  });

  /*
   * Permission PUIS périmètre, sur l'ÉCRITURE. `projects:manage_members`
   * suffisait à composer l'équipe de n'importe quel projet de l'instance en
   * devinant son identifiant : la garde faisait ce qu'on lui demandait, et le
   * service ne requestionnait rien.
   */
  it("RG-SCOPE-02 — retirer d'un projet hors périmètre est refusé", async () => {
    const p = await projet("Hors de portée");
    const a = await agent("Membre", "Interne");
    await prisma.projectMember.create({
      data: { projectId: p.id, userId: a, roleProjet: "membre" },
    });

    const etranger = await agent("Étranger", "AuProjet");
    const dehors = await perimetres.resoudre(etranger, new Set());
    await expect(
      projets.retirerMembre(p.id, a, etranger, dehors, new Set(["projects:manage_members"])),
    ).rejects.toMatchObject({ code: "hors_perimetre" });
  });

  it("le retrait est tracé", async () => {
    const p = await projet("Trace du retrait");
    const a = await agent();
    await prisma.projectMember.create({
      data: { projectId: p.id, userId: a, roleProjet: "membre" },
    });
    await projets.retirerMembre(p.id, a, acteur, await global(), toutes);

    const trace = await prisma.auditLog.findFirst({
      where: { action: "project.member_remove", entiteId: p.id },
    });
    expect(trace?.acteurId).toBe(acteur);
  });
});

describe("Un jalon sans date — tâche de schéma du 2026-08-16", () => {
  it("le jalon se crée sans échéance", async () => {
    const p = await projet("Jalon sans date");
    const jalon = await projets.creerJalon(
      { nom: "À planifier", projectId: p.id },
      acteur,
    );
    expect(jalon.dateEcheance).toBeNull();
  });

  it("il apparaît EN FIN de feuille de route, jamais en tête", async () => {
    const p = await projet("Ordre de la chronologie");
    await projets.creerJalon(
      { nom: "Sans date", projectId: p.id },
      acteur,
    );
    await projets.creerJalon(
      { nom: "Décembre", dateEcheance: utc("2026-12-01"), projectId: p.id },
      acteur,
    );
    await projets.creerJalon(
      { nom: "Mars", dateEcheance: utc("2026-03-01"), projectId: p.id },
      acteur,
    );

    const { jalons } = await projets.feuilleDeRoute(p.id, await global(), toutes);
    // « Sans date, le jalon reste en fin de chronologie » — vue 13, à la lettre.
    expect(jalons.map((j) => j.nom)).toEqual(["Mars", "Décembre", "Sans date"]);
  });

  it("son statut reste calculé comme les autres", async () => {
    const p = await projet("Statut du jalon sans date");
    const jalon = await projets.creerJalon({ nom: "Ouvert", projectId: p.id }, acteur);
    await prisma.task.create({
      data: { titre: "Commencée", projectId: p.id, milestoneId: jalon.id, statut: "doing" },
    });
    expect(await projets.statutJalon(jalon.id)).toBe("doing");
  });
});
