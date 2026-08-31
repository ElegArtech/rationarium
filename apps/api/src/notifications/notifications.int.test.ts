import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { creerClient, type PrismaClient } from "@rationarium/db";
import { NotificationsService, ErreurNotification } from "./notifications.service.js";
import { FileService, FILE_COURRIEL } from "./file.service.js";
import { CongesService } from "../conges/conges.service.js";
import { TachesService } from "../taches/taches.service.js";
import { CalendrierService } from "../parametrage/calendrier.service.js";
import { AuditService } from "../commun/audit.service.js";
import { PerimetreService } from "../commun/perimetre.service.js";

/**
 * L-23 — notifications, courriel, travaux planifiés.
 *
 * **La garantie centrale de ce lot est une NON-conséquence** : `RG-NTF-04`
 * dit que l'indisponibilité de la messagerie n'empêche jamais l'action métier
 * d'aboutir. Un test qui vérifierait seulement « la notification est créée »
 * passerait tout en laissant la règle non tenue. Les contrôles ci-dessous
 * cassent donc délibérément la file, puis vérifient que le congé est bien
 * approuvé quand même.
 */

const RACINE_DB = path.resolve(import.meta.dirname, "../../../../packages/db");
const utc = (s: string) => new Date(`${s}T00:00:00.000Z`);
const uuid = () => crypto.randomUUID();

let pg: StartedPostgreSqlContainer;
let prisma: PrismaClient;
let notifications: NotificationsService;
let file: FileService;
let conges: CongesService;
let taches: TachesService;
let perimetres: PerimetreService;

let agent: string;
let validateur: string;
let typeAvecValidation: string;
let typeSansValidation: string;

async function creerAgent(prenom: string) {
  const id = uuid();
  await prisma.user.create({
    data: {
      id, login: `u-${id.slice(0, 8)}`, email: `${id.slice(0, 8)}@exemple.fr`,
      motDePasseHash: "x", prenom, nom: "Agent",
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

  // La file n'est jamais démarrée dans ces suites : c'est exactement le cas
  // dégradé que `RG-NTF-04` doit tenir.
  file = new FileService();
  notifications = new NotificationsService(prisma as never, file);
  conges = new CongesService(
    prisma as never,
    audit,
    perimetres,
    new CalendrierService(prisma as never, audit),
    notifications,
  );
  taches = new TachesService(prisma as never, audit, perimetres, notifications);

  agent = await creerAgent("Ana");
  validateur = await creerAgent("Valentin");

  const avec = await prisma.leaveType.create({
    data: { code: `CA-${uuid().slice(0, 6)}`, nom: "Congés annuels", validationRequise: true },
  });
  const sans = await prisma.leaveType.create({
    data: { code: `RE-${uuid().slice(0, 6)}`, nom: "Récupération", validationRequise: false },
  });
  typeAvecValidation = avec.id;
  typeSansValidation = sans.id;

  // Le validateur est le responsable du département de l'agent.
  const direction = uuid();
  await prisma.direction.create({ data: { id: direction, nom: `Dir ${direction.slice(0, 6)}` } });
  const departement = uuid();
  await prisma.departement.create({
    data: {
      id: departement, nom: `Dep ${departement.slice(0, 6)}`,
      directionId: direction, responsableId: validateur,
    },
  });
  await prisma.user.update({ where: { id: agent }, data: { departementId: departement } });

  await prisma.leaveBalance.create({
    data: { userId: agent, typeId: typeAvecValidation, annee: 2026, joursAttribues: 25 },
  });
  await prisma.leaveBalance.create({
    data: { userId: agent, typeId: typeSansValidation, annee: 2026, joursAttribues: 10 },
  });
}, 240_000);

afterAll(async () => {
  await prisma?.$disconnect();
  await pg?.stop();
});

beforeEach(async () => {
  // Les espions ne survivent pas d'un contrôle à l'autre : un `mockRestore`
  // oublié après un échec contaminerait toute la suite, et les erreurs
  // suivantes ne diraient plus rien de leur propre sujet.
  vi.restoreAllMocks();
  await prisma.notification.deleteMany();
  await prisma.leave.deleteMany();
  await prisma.taskAssignee.deleteMany();
  await prisma.task.deleteMany();
});

const notifsDe = (userId: string) =>
  prisma.notification.findMany({ where: { userId }, orderBy: { creeLe: "asc" } });

// ════════════════════════════════════════════════════════════════════════════

describe("RG-NTF-04 — la messagerie ne bloque JAMAIS le métier", () => {
  it("LE CONGÉ EST DÉPOSÉ MÊME QUAND LA FILE EST MORTE", async () => {
    // La file est inactive dans toute cette suite ; on la casse en plus.
    const casse = vi.spyOn(file, "publier").mockRejectedValue(new Error("SMTP injoignable"));

    const conge = await conges.deposer(
      {
        userId: agent, typeId: typeAvecValidation,
        dateDebut: utc("2026-09-07"), dateFin: utc("2026-09-11"),
      },
      agent,
    );

    // L'action métier a abouti. C'est tout ce que la règle demande, et c'est
    // ce qu'un test de « la notification est créée » n'aurait pas vu.
    expect(conge.statut).toBe("pending");
    expect(await prisma.leave.count({ where: { id: conge.id } })).toBe(1);
    casse.mockRestore();
  });

  it("la mise en file ne lève pas non plus quand la file est absente", async () => {
    // `publier` rend `null` plutôt que de lever : l'appelant est une action
    // métier en cours d'aboutissement.
    await expect(file.publier(FILE_COURRIEL, { a: 1 })).resolves.toBeNull();
    expect(file.active).toBe(false);
  });

  it("la notification en base, elle, est bien écrite", async () => {
    await conges.deposer(
      {
        userId: agent, typeId: typeAvecValidation,
        dateDebut: utc("2026-09-14"), dateFin: utc("2026-09-15"),
      },
      agent,
    );
    // La cloche fonctionne sans messagerie : c'est le canal qui ne dépend de
    // rien d'extérieur.
    const recues = await notifsDe(validateur);
    expect(recues.map((n) => n.type)).toEqual(["conge_a_valider"]);
  });
});

describe("cadrage/01 § M18 — les six déclencheurs", () => {
  it("une demande de congé prévient SON validateur, et personne d'autre", async () => {
    await conges.deposer(
      {
        userId: agent, typeId: typeAvecValidation,
        dateDebut: utc("2026-10-05"), dateFin: utc("2026-10-06"),
      },
      agent,
    );

    expect((await notifsDe(validateur)).map((n) => n.type)).toEqual(["conge_a_valider"]);
    // Le demandeur n'a pas à être notifié de sa propre demande.
    expect(await notifsDe(agent)).toEqual([]);
  });

  it("RG-NTF-03 — UN CONGÉ AUTO-APPROUVÉ NE DÉCLENCHE AUCUNE VALIDATION", async () => {
    await conges.deposer(
      {
        userId: agent, typeId: typeSansValidation,
        dateDebut: utc("2026-10-12"), dateFin: utc("2026-10-13"),
      },
      agent,
    );

    // Il n'y a personne à prévenir : la décision est déjà prise. Envoyer
    // quand même produirait une demande de validation pour un congé validé.
    expect(await notifsDe(validateur)).toEqual([]);
  });

  it("l'approbation prévient le demandeur", async () => {
    const conge = await conges.deposer(
      {
        userId: agent, typeId: typeAvecValidation,
        dateDebut: utc("2026-11-02"), dateFin: utc("2026-11-03"),
      },
      agent,
    );
    await prisma.notification.deleteMany();

    await conges.approuver(conge.id, validateur, new Set(["leaves:approve"]), conge.version);

    const recues = await notifsDe(agent);
    expect(recues.map((n) => n.type)).toEqual(["conge_decide"]);
    expect(recues[0]?.titre).toContain("approuvée");
  });

  it("LE REFUS PORTE SON MOTIF — c'est la première question qu'on se pose", async () => {
    const conge = await conges.deposer(
      {
        userId: agent, typeId: typeAvecValidation,
        dateDebut: utc("2026-11-09"), dateFin: utc("2026-11-10"),
      },
      agent,
    );
    await prisma.notification.deleteMany();

    await conges.refuser(conge.id, "Effectif insuffisant sur la période", validateur, conge.version);

    const recues = await notifsDe(agent);
    expect(recues[0]?.contenu).toContain("Effectif insuffisant sur la période");
  });

  it("RG-NTF-03, seconde face — s'auto-approuver ne s'annonce pas à soi-même", async () => {
    const conge = await conges.deposer(
      {
        userId: agent, typeId: typeAvecValidation,
        dateDebut: utc("2026-11-16"), dateFin: utc("2026-11-17"),
      },
      agent,
    );
    await prisma.notification.deleteMany();

    // L'agent s'approuve lui-même : `autoValide` vaut vrai.
    await conges.approuver(conge.id, agent, new Set(["leaves:self_approve"]), conge.version);
    expect(await notifsDe(agent)).toEqual([]);
  });

  it("une tâche assignée prévient ses assignés, jamais son créateur", async () => {
    await taches.creer({ titre: "Rédiger la note", assigneIds: [agent, validateur] }, validateur);

    expect((await notifsDe(agent)).map((n) => n.type)).toEqual(["tache_assignee"]);
    // Celui qui crée la tâche vient de la voir.
    expect(await notifsDe(validateur)).toEqual([]);
  });
});

describe("RG-NTF-01 — les alertes d'échéance, une fois par jour", () => {
  it("distingue l'échéance PROCHE de l'échéance DÉPASSÉE", async () => {
    await prisma.task.create({
      data: {
        titre: "Bientôt", statut: "doing", dateFin: utc("2026-08-13"),
        assignes: { create: [{ userId: agent }] },
      },
    });
    await prisma.task.create({
      data: {
        titre: "Dépassée", statut: "doing", dateFin: utc("2026-08-01"),
        assignes: { create: [{ userId: agent }] },
      },
    });
    await prisma.task.create({
      data: {
        titre: "Lointaine", statut: "doing", dateFin: utc("2026-12-01"),
        assignes: { create: [{ userId: agent }] },
      },
    });

    const bilan = await notifications.alertesEcheance(utc("2026-08-11"));
    expect(bilan.emises).toBe(2);

    const types = (await notifsDe(agent)).map((n) => n.type).sort();
    // Une anticipation et une correction n'appellent pas le même geste :
    // les fondre en une seule alerte ferait perdre la première.
    expect(types).toEqual(["tache_echeance_proche", "tache_en_retard"]);
  });

  it("REJOUÉ DANS LA JOURNÉE, IL NE REDOUBLE RIEN", async () => {
    await prisma.task.create({
      data: {
        titre: "Bientôt", statut: "doing", dateFin: utc("2026-08-13"),
        assignes: { create: [{ userId: agent }] },
      },
    });

    await notifications.alertesEcheance(utc("2026-08-11"));
    const second = await notifications.alertesEcheance(utc("2026-08-11"));

    // Un travail périodique se rejoue — au redémarrage, après un échec — et
    // l'utilisateur qui reçoit trois fois la même alerte cesse de les lire.
    expect(second.emises).toBe(0);
    expect(second.ignorees).toBe(1);
    expect(await notifsDe(agent)).toHaveLength(1);
  });

  it("une tâche terminée n'alerte pas, même dépassée", async () => {
    await prisma.task.create({
      data: {
        titre: "Faite en retard", statut: "done", dateFin: utc("2026-08-01"),
        assignes: { create: [{ userId: agent }] },
      },
    });
    expect((await notifications.alertesEcheance(utc("2026-08-11"))).emises).toBe(0);
  });

  it("une tâche sans assigné n'alerte personne, sans lever", async () => {
    await prisma.task.create({
      data: { titre: "Orpheline", statut: "doing", dateFin: utc("2026-08-01") },
    });
    await expect(notifications.alertesEcheance(utc("2026-08-11"))).resolves.toMatchObject({
      emises: 0,
    });
  });
});

describe("EX-NTF-01 à EX-NTF-03 — la lecture et le marquage", () => {
  it("le compteur de non-lues suit le marquage", async () => {
    await notifications.notifier({
      userId: agent, type: "tache_assignee", titre: "Une", contenu: "…",
    });
    await notifications.notifier({
      userId: agent, type: "tache_assignee", titre: "Deux", contenu: "…",
    });

    expect((await notifications.lister(agent)).nonLues).toBe(2);

    const premiere = (await notifsDe(agent))[0]!;
    await notifications.marquerLue(agent, premiere.id);
    expect((await notifications.lister(agent)).nonLues).toBe(1);

    expect(await notifications.toutMarquerLu(agent)).toEqual({ marquees: 1 });
    expect((await notifications.lister(agent)).nonLues).toBe(0);
  });

  it("le filtre « non lues seulement » ne rend que celles-là", async () => {
    await notifications.notifier({
      userId: agent, type: "tache_assignee", titre: "Lue", contenu: "…",
    });
    const seule = (await notifsDe(agent))[0]!;
    await notifications.marquerLue(agent, seule.id);
    await notifications.notifier({
      userId: agent, type: "tache_assignee", titre: "Fraîche", contenu: "…",
    });

    const filtrees = await notifications.lister(agent, { nonLuesSeulement: true });
    expect(filtrees.entrees.map((n) => n.titre)).toEqual(["Fraîche"]);
  });

  it("LA NOTIFICATION D'AUTRUI EST INTOUCHABLE, même en devinant l'identifiant", async () => {
    await notifications.notifier({
      userId: validateur, type: "conge_a_valider", titre: "La sienne", contenu: "…",
    });
    const sienne = (await notifsDe(validateur))[0]!;

    await expect(notifications.marquerLue(agent, sienne.id)).rejects.toBeInstanceOf(
      ErreurNotification,
    );
    const intacte = await prisma.notification.findUniqueOrThrow({ where: { id: sienne.id } });
    expect(intacte.lue).toBe(false);
  });

  it("« tout marquer » ne touche que les siennes", async () => {
    await notifications.notifier({
      userId: validateur, type: "conge_a_valider", titre: "La sienne", contenu: "…",
    });
    await notifications.notifier({
      userId: agent, type: "tache_assignee", titre: "La mienne", contenu: "…",
    });

    await notifications.toutMarquerLu(agent);
    expect((await notifications.lister(validateur)).nonLues).toBe(1);
  });
});

describe("EX-NTF-04 — le courriel, pour les notifications critiques seulement", () => {
  it("une demande à valider part par courriel ; une échéance proche, non", async () => {
    const envois = vi.spyOn(file, "publier");

    await notifications.notifier({
      userId: agent, type: "conge_a_valider", titre: "À valider", contenu: "…",
    });
    expect(envois).toHaveBeenCalledTimes(1);

    // Une échéance qui approche attendra la prochaine ouverture de
    // l'application : la noyer dans le courriel ferait ignorer les autres.
    await notifications.notifier({
      userId: agent, type: "tache_echeance_proche", titre: "Bientôt", contenu: "…",
    });
    expect(envois).toHaveBeenCalledTimes(1);
    envois.mockRestore();
  });

  it("UN COMPTE DÉSACTIVÉ NE REÇOIT PLUS DE COURRIEL — mais garde sa notification", async () => {
    const parti = await creerAgent("Parti");
    await prisma.user.update({ where: { id: parti }, data: { actif: false } });
    const envois = vi.spyOn(file, "publier");

    await notifications.notifier({
      userId: parti, type: "conge_decide", titre: "Décision", contenu: "…",
    });

    // Son adresse peut avoir été réattribuée, et sa boîte n'est plus relevée.
    expect(envois).not.toHaveBeenCalled();
    expect(await notifsDe(parti)).toHaveLength(1);
    envois.mockRestore();
  });

  it("le courriel porte le titre et le contenu de la notification", async () => {
    const envois = vi.spyOn(file, "publier");
    await notifications.notifier({
      userId: agent, type: "conge_decide", titre: "Congé approuvé", contenu: "Du 1 au 5.",
    });

    expect(envois).toHaveBeenCalledWith(
      FILE_COURRIEL,
      expect.objectContaining({ sujet: "Congé approuvé", corps: "Du 1 au 5." }),
    );
    envois.mockRestore();
  });
});

// ════════════════════════════════════════════════════════════════════════════
// Vague 7-4 — dette de traçabilité.
// ════════════════════════════════════════════════════════════════════════════

describe("RG-NTF-02 — le traitement planifié est protégé contre les exécutions concurrentes : une seule instance envoie", () => {
  /**
   * Une file de substitution : elle n'exécute rien, elle **enregistre ce qu'on
   * lui demande**. C'est le seul moyen d'observer le verrou, qui est une
   * option passée à `pg-boss` et non un comportement qu'on puisse déclencher.
   */
  function fileEspionnee() {
    const planifications: { nom: string; cron: string; options: Record<string, unknown> }[] = [];
    const faussaire = {
      createQueue: async () => undefined,
      work: async () => undefined,
      schedule: async (nom: string, cron: string, _donnees: unknown, options: Record<string, unknown>) => {
        planifications.push({ nom, cron, options });
      },
    };
    const service = new FileService();
    // La file est réputée démarrée : c'est l'état dans lequel `planifier`
    // s'exécute en production, et `demarrer()` n'est pas le sujet ici.
    const interne = service as unknown as { boss: unknown; demarrage: Promise<void> };
    interne.boss = faussaire;
    interne.demarrage = Promise.resolve();
    return { service, planifications };
  }

  it("le travail périodique est déclaré avec un VERROU D'INSTANCE UNIQUE, pas seulement avec un cron", async () => {
    /*
     * Sans `singletonKey`, deux exemplaires de l'application déclarant le même
     * travail l'exécuteraient tous les deux à 7 h : chaque agent recevrait
     * l'alerte en double, et l'idempotence journalière ne rattraperait rien
     * puisque les deux exécutions se lisent avant de s'écrire.
     *
     * Le verrou ne s'observe pas en le déclenchant — il vit chez `pg-boss`.
     * Ce qui se vérifie ici, c'est qu'on le DEMANDE.
     */
    const { service, planifications } = fileEspionnee();

    await service.planifier({
      nom: "notifications.alertes-echeance",
      cron: "0 7 * * *",
      traitement: async () => undefined,
    });

    expect(planifications).toHaveLength(1);
    expect(planifications[0]!.options["singletonKey"]).toBe("notifications.alertes-echeance");
  });

  it("RG-NTF-01 — et le fuseau accompagne le cron : « 7 h » n'est pas une heure sans fuseau", async () => {
    const { service, planifications } = fileEspionnee();
    await service.planifier({ nom: "t", cron: "0 7 * * *", traitement: async () => undefined });
    expect(planifications[0]!.options["tz"]).toBeTruthy();
  });

  it("deux déclarations du MÊME travail portent la MÊME clé — un verrou ne vaut que s'il est partagé", async () => {
    /*
     * Une clé dérivée du nom du travail, et non de l'instance : si chaque
     * exemplaire fabriquait la sienne, il y aurait autant de verrous que
     * d'instances, donc aucun verrou.
     */
    const a = fileEspionnee();
    const b = fileEspionnee();
    const travail = { nom: "notifications.alertes-echeance", cron: "0 7 * * *", traitement: async () => undefined };

    await a.service.planifier(travail);
    await b.service.planifier(travail);

    expect(a.planifications[0]!.options["singletonKey"]).toBe(
      b.planifications[0]!.options["singletonKey"],
    );
  });
});
