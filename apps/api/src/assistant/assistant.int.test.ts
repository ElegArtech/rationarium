import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { execFileSync } from "node:child_process";
import path from "node:path";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { PERMISSIONS, modeleParCode } from "@rationarium/contracts";

/**
 * M22 — assistant de suivi, de bout en bout, sur PostgreSQL réel.
 *
 * Le point que seule cette chaîne peut prouver : une action de l'agent passe
 * par la route existante, au nom du propriétaire du jeton, avec ses gardes,
 * son périmètre et ses règles métier — et elle se défait.
 */

const RACINE_DB = path.resolve(import.meta.dirname, "../../../../packages/db");
const MOT_DE_PASSE = "Corr3ct-Horse-Battery!";

let pg: StartedPostgreSqlContainer;
let app: NestFastifyApplication;
let prisma: import("@rationarium/db").PrismaClient;

let cookieAdmin: string;
let cookieChef: string;
let chefId: string;
let autreId: string;
let projetChef: string;
let projetAutre: string;
let jalonChef: string;
let tacheChef: string;
let tacheConfidentielle: string;
let jeton: string;
let jetonId: string;

const preuve = (date = "2026-10-01", complement: Record<string, unknown> = {}) => ({
  source: "courriel",
  reference: "<message-1@exemple.test>",
  date,
  extrait: "Le dossier a été déposé ce matin.",
  ...complement,
});

const action = (type: string, charge: Record<string, unknown>, complement: Record<string, unknown> = {}) => ({
  type,
  charge,
  justification: "Constaté dans le courrier du projet.",
  preuves: [preuve()],
  ...complement,
});

const guichet = (methode: "GET" | "POST", url: string, corps?: unknown, cle = jeton) =>
  app.inject({
    method: methode,
    url: `/api/agent/v1${url}`,
    headers: { authorization: `Bearer ${cle}` },
    ...(corps === undefined ? {} : { payload: corps as Record<string, unknown> }),
  });

const session = (methode: "GET" | "POST" | "PUT", url: string, cookie: string, corps?: unknown) =>
  app.inject({
    method: methode,
    url: `/api${url}`,
    cookies: { rationarium_session: cookie },
    ...(corps === undefined ? {} : { payload: corps as Record<string, unknown> }),
  });

type Resultat = {
  etat: string;
  cibleId: string | null;
  version: number | null;
  actionId: string;
  rejouee: boolean;
  motif: { regle?: string; cle: string; statut: number } | null;
};

const agir = async (passageId: string, actions: unknown[], cle = jeton): Promise<Resultat[]> => {
  const r = await guichet("POST", `/passages/${passageId}/actions`, { actions }, cle);
  expect(r.statusCode, r.body).toBe(201);
  return (r.json() as { resultats: Resultat[] }).resultats;
};

/** Ouvre un passage manuel et le fait prendre par l'agent. */
const ouvrirPassage = async (): Promise<string> => {
  const cree = await session("POST", "/assistant/passages", cookieChef, {});
  expect(cree.statusCode, cree.body).toBe(201);
  const id = (cree.json() as { id: string }).id;
  const pris = await guichet("POST", `/passages/${id}/prise`);
  expect(pris.statusCode, pris.body).toBe(201);
  return id;
};

const terminer = async (passageId: string, bilan: Record<string, unknown> = {}) => {
  const r = await guichet("POST", `/passages/${passageId}/fin`, { etat: "terminee", bilan });
  expect(r.statusCode, r.body).toBe(201);
};

const connecter = async (identifiant: string): Promise<string> => {
  const r = await app.inject({ method: "POST", url: "/api/auth/login", payload: { identifiant, motDePasse: MOT_DE_PASSE } });
  if (r.statusCode !== 200) throw new Error(`connexion refusée : ${r.body}`);
  return r.cookies.find((c) => c.name === "rationarium_session")!.value;
};

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

  const { creerClient } = await import("@rationarium/db");
  prisma = creerClient(pg.getConnectionUri());
  const { hacherMotDePasse } = await import("../auth/mots-de-passe.js");
  const hache = await hacherMotDePasse(MOT_DE_PASSE);

  const roleAdmin = await prisma.role.create({
    data: { code: "TEST_ADMIN", nom: "TEST_ADMIN", permissions: { create: PERMISSIONS.map((permission) => ({ permission })) } },
  });
  const roleChef = await prisma.role.create({
    data: {
      code: "TEST_CHEF",
      nom: "TEST_CHEF",
      permissions: { create: modeleParCode("PROJECT_LEAD")!.permissions.map((permission) => ({ permission })) },
    },
  });
  const utilisateur = (login: string, roleId: string) =>
    prisma.user.create({
      data: {
        login,
        email: `${login}@exemple.test`,
        motDePasseHash: hache,
        prenom: "Test",
        nom: login,
        motDePasseAChanger: false,
        roleId,
      },
    });
  await utilisateur("admin", roleAdmin.id);
  chefId = (await utilisateur("chef", roleChef.id)).id;
  autreId = (await utilisateur("autre", roleChef.id)).id;
  cookieAdmin = await connecter("admin");
  cookieChef = await connecter("chef");

  const projet = (nom: string, chef: string) =>
    prisma.project.create({
      data: {
        nom,
        statut: "active",
        dateDebut: new Date("2026-09-01T00:00:00.000Z"),
        dateFin: new Date("2026-12-31T00:00:00.000Z"),
        chefId: chef,
        createurId: chef,
      },
    });
  projetChef = (await projet("Dossier suivi", chefId)).id;
  projetAutre = (await projet("Dossier d'autrui", autreId)).id;
  jalonChef = (
    await prisma.milestone.create({
      data: { projectId: projetChef, nom: "Dépôt", dateEcheance: new Date("2026-11-15T00:00:00.000Z") },
    })
  ).id;
  tacheChef = (
    await prisma.task.create({
      data: { titre: "Déposer le dossier", projectId: projetChef, milestoneId: jalonChef, assignes: { create: [{ userId: chefId }] } },
    })
  ).id;
  tacheConfidentielle = (
    await prisma.task.create({
      data: { titre: "Note confidentielle", projectId: projetChef, milestoneId: jalonChef, confidentielle: true },
    })
  ).id;
}, 300_000);

afterAll(async () => {
  await prisma?.$disconnect();
  await app?.close();
  await pg?.stop();
});

describe("M22 — module désactivé", () => {
  it("RG-AST-01 — désactivé par défaut, le module répond introuvable et ne déclare aucun traitement", async () => {
    const etat = await session("GET", "/assistant/etat", cookieChef);
    expect(etat.statusCode).toBe(200);
    expect(etat.json()).toEqual({ actif: false, mode: "desactive" });
    const jetons = await session("GET", "/assistant/jetons", cookieChef);
    expect(jetons.statusCode).toBe(404);
    expect(jetons.json()).toMatchObject({ cle: "erreurs:introuvable" });
    const planifies = await prisma.$queryRaw<{ name: string }[]>`SELECT name FROM pgboss.schedule WHERE name LIKE 'assistant.%'`;
    expect(planifies).toEqual([]);
  });

  it("RG-AST-01 — les réglages publics du paramétrage ne montrent ni n'acceptent les clés de l'assistant", async () => {
    const ecrit = await session("PUT", "/parametrage", cookieAdmin, { reglages: { "assistant.mode": "relais" } });
    expect(ecrit.statusCode).toBe(400);
    const lu = await app.inject({ method: "GET", url: "/api/parametrage" });
    expect(Object.keys(lu.json() as object).some((c) => c.startsWith("assistant."))).toBe(false);
  });
});

describe("M22 — réglages et jetons", () => {
  it("EX-AST-01 — l'administrateur active le module ; un chef de projet ne le peut pas", async () => {
    const refuse = await session("PUT", "/assistant/reglages", cookieChef, {
      mode: "relais", planification: "", jalonObligatoire: true, conservationJours: 180, actionsParPassage: 500, validationProjets: true,
    });
    expect(refuse.statusCode).toBe(403);
    const r = await session("PUT", "/assistant/reglages", cookieAdmin, {
      mode: "relais", planification: "", jalonObligatoire: true, conservationJours: 180, actionsParPassage: 500, validationProjets: true,
    });
    expect(r.statusCode, r.body).toBe(200);
    expect(r.json()).toMatchObject({ mode: "relais" });
    expect((await session("GET", "/assistant/etat", cookieChef)).json()).toMatchObject({ actif: true, mode: "relais" });
  });

  it("EX-AST-02 — le jeton n'est montré qu'à sa création, et seule son empreinte est conservée", async () => {
    const r = await session("POST", "/assistant/jetons", cookieChef, { libelle: "Poste principal" });
    expect(r.statusCode, r.body).toBe(201);
    const cree = r.json() as { id: string; jeton: string };
    jeton = cree.jeton;
    jetonId = cree.id;
    expect(jeton).toMatch(/^rat_/);
    const liste = await session("GET", "/assistant/jetons", cookieChef);
    expect(liste.body).not.toContain(jeton);
    const enBase = await prisma.agentJeton.findUniqueOrThrow({ where: { id: jetonId } });
    expect(JSON.stringify(enBase)).not.toContain(jeton);
  });

  it("RG-AST-02 — le jeton n'ouvre que le guichet, et le cookie n'ouvre pas le guichet", async () => {
    const etat = await guichet("GET", "/etat");
    expect(etat.statusCode, etat.body).toBe(200);
    expect(etat.json()).toMatchObject({ proprietaire: { id: chefId } });

    const surSession = await app.inject({ method: "GET", url: "/api/projets", headers: { authorization: `Bearer ${jeton}` } });
    expect(surSession.statusCode).toBe(401);
    const cookieSurGuichet = await app.inject({ method: "GET", url: "/api/agent/v1/etat", cookies: { rationarium_session: cookieChef } });
    expect(cookieSurGuichet.statusCode).toBe(401);
  });

  it("RG-AST-02 — un en-tête d'appel interne forgé de l'extérieur n'ouvre rien", async () => {
    const r = await app.inject({ method: "GET", url: "/api/projets", headers: { "x-rationarium-interne": "invente" } });
    expect(r.statusCode).toBe(401);
  });

  it("RG-AST-03 — un jeton révoqué est refusé à la requête suivante, et le refus est tracé", async () => {
    const autre = (await session("POST", "/assistant/jetons", cookieChef, { libelle: "Ancien poste" })).json() as { id: string; jeton: string };
    expect((await guichet("GET", "/etat", undefined, autre.jeton)).statusCode).toBe(200);
    expect((await session("POST", `/assistant/jetons/${autre.id}/revoquer`, cookieChef)).statusCode).toBe(201);
    const r = await guichet("GET", "/etat", undefined, autre.jeton);
    expect(r.statusCode).toBe(401);
    expect(r.json()).toMatchObject({ cle: "assistant:erreurs.jetonInvalide" });
    const trace = await prisma.auditLog.findFirst({ where: { action: "agent_token.refused", entiteId: autre.id } });
    expect(trace).not.toBeNull();
  });
});

describe("M22 — plans de suivi et passages", () => {
  it("EX-AST-03 — le chef déclare le plan de suivi de son projet ; une version périmée est refusée", async () => {
    const cree = await session("PUT", `/assistant/suivis/${projetChef}`, cookieChef, {
      consigne: "Suivre le dépôt du dossier.",
      sources: [{ type: "courriel", designation: "tag:dossier", libelle: "Courrier du dossier" }],
      silenceJours: 14,
    });
    expect(cree.statusCode, cree.body).toBe(200);
    expect(cree.json()).toMatchObject({ version: 1, actif: true, silenceJours: 14 });
    const perime = await session("PUT", `/assistant/suivis/${projetChef}`, cookieChef, { silenceJours: 7, version: 0 });
    expect(perime.statusCode).toBe(409);
    expect(perime.json()).toMatchObject({ cle: "assistant:erreurs.conflitVersion" });
  });

  it("EX-AST-03 — un plan de suivi ne se modifie que sur un projet qu'on porte", async () => {
    const r = await session("PUT", `/assistant/suivis/${projetAutre}`, cookieChef, { consigne: "Intrusion." });
    expect(r.statusCode).toBe(403);
  });

  it("EX-AST-04, RG-AST-15 — un passage se lance à la main, et un seul est actif à la fois", async () => {
    const premier = await session("POST", "/assistant/passages", cookieChef, {});
    expect(premier.statusCode, premier.body).toBe(201);
    const second = await session("POST", "/assistant/passages", cookieChef, {});
    expect(second.statusCode).toBe(409);
    expect(second.json()).toMatchObject({ cle: "assistant:erreurs.passageActif", regle: "RG-AST-15" });

    const suivant = await guichet("GET", "/passages/suivant?attendre=0");
    expect((suivant.json() as { passage: { id: string } }).passage.id).toBe((premier.json() as { id: string }).id);
    const id = (premier.json() as { id: string }).id;
    expect((await guichet("POST", `/passages/${id}/prise`)).statusCode).toBe(201);
    expect((await guichet("POST", `/passages/${id}/prise`)).statusCode).toBe(409);
    await terminer(id);
  });

  it("RG-AST-14 — le contexte ne contient que ce que le propriétaire peut lire", async () => {
    const id = await ouvrirPassage();
    const r = await guichet("GET", `/passages/${id}/contexte`);
    expect(r.statusCode, r.body).toBe(200);
    const contexte = r.json() as {
      projets: { id: string; taches: { id: string }[]; suivi: unknown }[];
      autresProjets: { id: string }[];
    };
    expect(contexte.projets.map((p) => p.id)).toEqual([projetChef]);
    const taches = contexte.projets[0]!.taches.map((t) => t.id);
    expect(taches).toContain(tacheChef);
    expect(taches).not.toContain(tacheConfidentielle);
    expect(r.body).not.toContain(projetAutre);
    await terminer(id);
  });
});

describe("M22 — l'agent agit", () => {
  let passage: string;

  beforeAll(async () => {
    passage = await ouvrirPassage();
  });

  it("RG-AST-04 — une action est écrite tout de suite, par la route existante, au nom du propriétaire", async () => {
    const [jalon, tache] = await agir(passage, [
      action("jalon_creer", { projectId: projetChef, nom: "Réponse du service", dateEcheance: "2026-12-01" }, { reference: "reponse" }),
      action("tache_creer", { projectId: projetChef, milestoneId: "@reponse", titre: "Relancer le service" }),
    ]);
    expect(jalon).toMatchObject({ etat: "effectuee", rejouee: false });
    expect(tache).toMatchObject({ etat: "effectuee" });
    const creee = await prisma.task.findUniqueOrThrow({
      where: { id: tache!.cibleId! },
      include: { assignes: true },
    });
    expect(creee.milestoneId).toBe(jalon!.cibleId);
    expect(creee.assignes.map((a) => a.userId)).toEqual([chefId]);
  });

  it("RG-AST-04 — un refus de la route est rendu à l'agent, et rien n'est écrit", async () => {
    const [r] = await agir(passage, [
      action("tache_creer", { projectId: projetAutre, milestoneId: jalonChef, titre: "Hors de mon projet" }),
    ]);
    expect(r).toMatchObject({ etat: "refusee" });
    expect(r!.motif!.statut).toBe(403);
    expect(await prisma.task.count({ where: { titre: "Hors de mon projet" } })).toBe(0);
  });

  it("RG-AST-07 — une action sans preuve, ou à l'extrait trop long, est refusée", async () => {
    const [sansPreuve, tropLong] = await agir(passage, [
      action("commentaire_ajouter", { projectId: projetChef, contenu: "Sans preuve." }, { preuves: [] }),
      action("commentaire_ajouter", { projectId: projetChef, contenu: "Trop long." }, { preuves: [preuve("2026-10-01", { extrait: "x".repeat(281) })] }),
    ]);
    expect(sansPreuve!.motif).toMatchObject({ regle: "RG-AST-07" });
    expect(tropLong!.motif).toMatchObject({ regle: "RG-AST-07" });
  });

  it("RG-AST-08 — une tâche de projet sans jalon est refusée", async () => {
    const [r] = await agir(passage, [action("tache_creer", { projectId: projetChef, titre: "Sans jalon" })]);
    expect(r!.motif).toMatchObject({ regle: "RG-AST-08", statut: 422 });
  });

  it("RG-AST-09 — un projet commence à la date d'une de ses preuves, jamais à celle du passage", async () => {
    const charge = { nom: "Affaire nouvelle", dateDebut: "2026-08-14", dateFin: "2027-03-31", statut: "active" };
    const [nonAtteste] = await agir(passage, [action("projet_creer", charge)]);
    expect(nonAtteste!.motif).toMatchObject({ regle: "RG-AST-09" });

    const [atteste] = await agir(passage, [
      action(
        "projet_creer",
        { ...charge, suivi: { sources: [{ type: "depot", designation: "exemple/affaire" }] } },
        { preuves: [preuve("2026-08-14")], reference: "affaire" },
      ),
    ]);
    // RG-AST-21 — la création attend la validation ; une fois validée, le projet existe.
    expect(atteste).toMatchObject({ etat: "a_valider" });
    const validation = await session("POST", `/assistant/actions/${atteste!.actionId}/valider`, cookieChef);
    expect(validation.statusCode, validation.body).toBe(201);
    const cree = (validation.json() as { projet: { cibleId: string } }).projet.cibleId;
    const projet = await prisma.project.findUniqueOrThrow({ where: { id: cree }, include: { suivi: true } });
    expect(projet.dateDebut.toISOString().slice(0, 10)).toBe("2026-08-14");
    expect(projet.chefId).toBe(chefId);
    expect(projet.suivi?.sources).toEqual([{ type: "depot", designation: "exemple/affaire" }]);
  });

  it("RG-AST-21, RG-AST-22, EX-AST-10 — un projet proposé attend sa validation, avec ses actions dépendantes", async () => {
    const [projet, jalon, tache] = await agir(passage, [
      action("projet_creer", { nom: "Affaire à valider", dateDebut: "2026-10-01", dateFin: "2027-01-31", statut: "active" },
        { preuves: [preuve("2026-10-01")], reference: "avalider" }),
      action("jalon_creer", { projectId: "@avalider", nom: "Première échéance", dateEcheance: "2026-12-01" }, { reference: "echeance" }),
      action("tache_creer", { projectId: "@avalider", milestoneId: "@echeance", titre: "Premier travail" }),
    ]);
    expect([projet!.etat, jalon!.etat, tache!.etat]).toEqual(["a_valider", "a_valider", "a_valider"]);
    expect(await prisma.project.count({ where: { nom: "Affaire à valider" } })).toBe(0);
    const etat = (await session("GET", "/assistant/etat", cookieChef)).json() as { aValider: number };
    expect(etat.aValider).toBeGreaterThanOrEqual(1);

    // Une dépendante ne se valide pas seule.
    expect((await session("POST", `/assistant/actions/${jalon!.actionId}/valider`, cookieChef)).statusCode).toBe(409);

    const r = await session("POST", `/assistant/actions/${projet!.actionId}/valider`, cookieChef);
    expect(r.statusCode, r.body).toBe(201);
    const corps = r.json() as { projet: { etat: string; cibleId: string }; dependantes: { etat: string }[] };
    expect(corps.projet.etat).toBe("effectuee");
    expect(corps.dependantes.map((d) => d.etat)).toEqual(["effectuee", "effectuee"]);
    const creee = await prisma.task.findFirstOrThrow({ where: { titre: "Premier travail" }, include: { milestone: true } });
    expect(creee.projectId).toBe(corps.projet.cibleId);
    expect(creee.milestone?.nom).toBe("Première échéance");
  });

  it("RG-AST-21, RG-AST-12 — un projet rejeté n'écrit rien et n'est pas reproposé", async () => {
    const proposition = action("projet_creer", { nom: "Alerte de sécurité", dateDebut: "2026-09-16", dateFin: "2026-12-31" },
      { preuves: [preuve("2026-09-16")] });
    const [r] = await agir(passage, [proposition]);
    expect(r!.etat).toBe("a_valider");
    const rejet = await session("POST", `/assistant/actions/${r!.actionId}/rejeter`, cookieChef, { motif: "Ce n'est pas une affaire." });
    expect(rejet.statusCode, rejet.body).toBe(201);
    expect(await prisma.project.count({ where: { nom: "Alerte de sécurité" } })).toBe(0);
    const [encore] = await agir(passage, [proposition]);
    expect(encore!.motif).toMatchObject({ regle: "RG-AST-12" });
  });

  it("jalon sans date — un jalon dont l'événement n'est pas programmé se crée sans échéance", async () => {
    const [r] = await agir(passage, [action("jalon_creer", { projectId: projetChef, nom: "Troisième séance" })]);
    expect(r, JSON.stringify(r)).toMatchObject({ etat: "effectuee" });
    expect((await prisma.milestone.findUniqueOrThrow({ where: { id: r!.cibleId! } })).dateEcheance).toBeNull();
  });

  it("RG-AST-10 — une référence inconnue est refusée : rien ne se rapproche par libellé", async () => {
    const [r] = await agir(passage, [action("tache_creer", { projectId: projetChef, milestoneId: "@inconnu", titre: "Orpheline" })]);
    expect(r!.motif).toMatchObject({ regle: "RG-AST-10" });
  });

  it("RG-AST-11 — l'agent n'annule pas un projet", async () => {
    const [r] = await agir(passage, [action("projet_modifier", { projectId: projetChef, version: 1, statut: "cancelled" })]);
    expect(r!.motif).toMatchObject({ regle: "RG-AST-11" });
    expect((await prisma.project.findUniqueOrThrow({ where: { id: projetChef } })).statut).toBe("active");
  });

  it("RG-AST-06 — une version périmée est refusée en conflit, sans rien écraser", async () => {
    const [r] = await agir(passage, [action("tache_modifier", { taskId: tacheChef, version: 99, statut: "done" })]);
    expect(r!.motif).toMatchObject({ regle: "RG-AST-06", statut: 409 });
    expect((await prisma.task.findUniqueOrThrow({ where: { id: tacheChef } })).statut).toBe("todo");
  });

  it("RG-AST-12 — une action rejouée dans le même passage rend son premier résultat", async () => {
    const commentaire = action("commentaire_ajouter", { projectId: projetChef, contenu: "Le dossier est parti." });
    const [premier] = await agir(passage, [commentaire]);
    const [rejoue] = await agir(passage, [commentaire]);
    expect(rejoue).toMatchObject({ etat: "effectuee", rejouee: true, actionId: premier!.actionId });
    expect(await prisma.comment.count({ where: { contenu: "Le dossier est parti." } })).toBe(1);
  });

  it("RG-AST-13 — une action qui désigne une entité refusée dans le même lot est refusée à son tour", async () => {
    const [jalon, tache] = await agir(passage, [
      action("jalon_creer", { projectId: projetAutre, nom: "Jalon refusé", dateEcheance: "2026-12-01" }, { reference: "refuse" }),
      action("tache_creer", { projectId: projetAutre, milestoneId: "@refuse", titre: "Tâche dépendante" }),
    ]);
    expect(jalon).toMatchObject({ etat: "refusee" });
    expect(tache!.motif).toMatchObject({ regle: "RG-AST-10" });
  });

  it("RG-AST-17 — chaque action est tracée avec son passage et son jeton", async () => {
    const trace = await prisma.auditLog.findFirst({ where: { action: "agent.action", acteurId: chefId } });
    expect(trace?.detail).toMatchObject({ passageId: passage, jetonId });
  });

  it("temps et événements — l'agent lit les temps déclarés, saisit du temps et crée un rendez-vous", async () => {
    const [temps, evenement] = await agir(passage, [
      action("temps_saisir", { date: "2026-10-01", heures: 1.5, projectId: projetChef, taskId: tacheChef, description: "Préparation du dépôt." }),
      action("evenement_creer", { titre: "Rendez-vous au service", date: "2026-11-20", heureDebut: "10:00", heureFin: "11:00", projectId: projetChef }),
    ]);
    expect(temps).toMatchObject({ etat: "effectuee" });
    expect(evenement).toMatchObject({ etat: "effectuee" });
    const saisie = await prisma.timeEntry.findUniqueOrThrow({ where: { id: temps!.cibleId! } });
    expect(saisie.userId).toBe(chefId);
    const lus = await guichet("GET", `/passages/${passage}/temps?du=2026-10-01&au=2026-10-31`);
    expect((lus.json() as { saisies: { id: string }[] }).saisies.map((s) => s.id)).toContain(temps!.cibleId);
  });

  it("EX-AST-06 — le journal montre l'état avant et après d'une modification", async () => {
    const version = (await prisma.task.findUniqueOrThrow({ where: { id: tacheChef } })).version;
    const [r] = await agir(passage, [action("tache_modifier", { taskId: tacheChef, version, statut: "done" })]);
    expect(r).toMatchObject({ etat: "effectuee" });
    const liste = await session("GET", `/assistant/actions?passageId=${passage}`, cookieChef);
    const ligne = (liste.json() as { id: string; avant: unknown; apres: unknown }[]).find((a) => a.id === r!.actionId)!;
    expect(ligne.avant).toEqual({ statut: "todo", avancement: 0 });
    expect(ligne.apres).toMatchObject({ statut: "done", avancement: 100 });
  });

  it("EX-AST-07, RG-AST-18 — défaire rétablit l'état d'avant, et supprime une création", async () => {
    const modif = (await session("GET", `/assistant/actions?passageId=${passage}&etat=effectuee`, cookieChef)).json() as {
      id: string; type: string; cibleId: string;
    }[];
    const cloture = modif.find((a) => a.type === "tache_modifier")!;
    const defaite = await session("POST", `/assistant/actions/${cloture.id}/defaire`, cookieChef);
    expect(defaite.statusCode, defaite.body).toBe(201);
    const tache = await prisma.task.findUniqueOrThrow({ where: { id: tacheChef } });
    expect(tache.statut).toBe("todo");
    expect(tache.avancement).toBe(0);

    const creation = modif.find((a) => a.type === "tache_creer")!;
    expect((await session("POST", `/assistant/actions/${creation.id}/defaire`, cookieChef)).statusCode).toBe(201);
    expect(await prisma.task.findUnique({ where: { id: creation.cibleId } })).toBeNull();
  });

  it("RG-AST-18 — une entité modifiée depuis l'action n'est pas défaite", async () => {
    const [r] = await agir(passage, [action("commentaire_ajouter", { taskId: tacheChef, contenu: "Point d'étape." })]);
    await prisma.comment.update({ where: { id: r!.cibleId! }, data: { contenu: "Corrigé à la main.", version: { increment: 1 } } });
    const defaite = await session("POST", `/assistant/actions/${r!.actionId}/defaire`, cookieChef);
    expect(defaite.statusCode).toBe(409);
    expect(defaite.json()).toMatchObject({ cle: "assistant:erreurs.modifieeDepuis" });
  });

  it("RG-AST-12 — une action défaite n'est pas refaite par un passage suivant", async () => {
    const charge = { projectId: projetChef, milestoneId: jalonChef, titre: "Tâche défaite" };
    const [cree] = await agir(passage, [action("tache_creer", charge)]);
    expect((await session("POST", `/assistant/actions/${cree!.actionId}/defaire`, cookieChef)).statusCode).toBe(201);
    await terminer(passage);

    const suivant = await ouvrirPassage();
    const [refaite] = await agir(suivant, [action("tache_creer", charge)]);
    expect(refaite!.motif).toMatchObject({ regle: "RG-AST-12" });
    await terminer(suivant);
  });

  it("EX-AST-08, EX-AST-09 — la fin du passage notifie son bilan, et l'historique le décompte", async () => {
    const notification = await prisma.notification.findFirst({
      where: { userId: chefId, type: "assistant_passage", lien: `/assistant?passage=${passage}` },
    });
    expect(notification).not.toBeNull();
    const historique = (await session("GET", "/assistant/passages", cookieChef)).json() as {
      id: string; actions: { effectuees: number; refusees: number; defaites: number };
    }[];
    const ligne = historique.find((p) => p.id === passage)!;
    expect(ligne.actions.effectuees).toBeGreaterThan(0);
    expect(ligne.actions.refusees).toBeGreaterThan(0);
    expect(ligne.actions.defaites).toBeGreaterThan(0);
  });

  it("EX-AST-08 — un passage sans action ni point ouvert ne notifie rien", async () => {
    const id = await ouvrirPassage();
    await terminer(id);
    expect(await prisma.notification.count({ where: { lien: `/assistant?passage=${id}` } })).toBe(0);
  });
});

describe("M22 — bornes du jeton et traitements planifiés", () => {
  it("RG-AST-05 — un jeton borné à certains types refuse les autres", async () => {
    const borne = (
      await session("POST", "/assistant/jetons", cookieChef, { libelle: "Commentaires seuls", typesAutorises: ["commentaire_ajouter"] })
    ).json() as { jeton: string };
    const cree = await session("POST", "/assistant/passages", cookieChef, {});
    const id = (cree.json() as { id: string }).id;
    expect((await guichet("POST", `/passages/${id}/prise`, undefined, borne.jeton)).statusCode).toBe(201);
    const [r] = await agir(id, [action("tache_creer", { projectId: projetChef, milestoneId: jalonChef, titre: "Interdite" })], borne.jeton);
    expect(r!.motif).toMatchObject({ regle: "RG-AST-05", statut: 403 });
    await terminer(id);
  });

  it("RG-AST-15 — un passage muet depuis trente minutes est interrompu, et son propriétaire averti", async () => {
    const id = await ouvrirPassage();
    await prisma.agentPassage.update({ where: { id }, data: { signeDeVie: new Date(Date.now() - 31 * 60_000) } });
    const { PassagesService } = await import("./passages.service.js");
    await app.get(PassagesService).interrompreLesMuets();
    expect((await prisma.agentPassage.findUniqueOrThrow({ where: { id } })).etat).toBe("interrompue");
    expect(await prisma.notification.count({ where: { type: "assistant_passage_echec", lien: `/assistant?passage=${id}` } })).toBe(1);
  });

  it("EX-AST-05, RG-AST-16 — la planification crée un passage par propriétaire, et chaque traitement n'est planifié qu'une fois", async () => {
    const reglages = { mode: "relais", planification: "0 7 * * 1-5", jalonObligatoire: true, conservationJours: 180, actionsParPassage: 500, validationProjets: true };
    expect((await session("PUT", "/assistant/reglages", cookieAdmin, reglages)).statusCode).toBe(200);
    expect((await session("PUT", "/assistant/reglages", cookieAdmin, reglages)).statusCode).toBe(200);
    const planifies = await prisma.$queryRaw<{ name: string }[]>`SELECT name FROM pgboss.schedule WHERE name LIKE 'assistant.%' ORDER BY name`;
    expect(planifies.map((p) => p.name)).toEqual(["assistant.conservation", "assistant.interruption", "assistant.passages"]);

    const { PlanificationAssistantService } = await import("./planification.service.js");
    await app.get(PlanificationAssistantService).planifierPassages();
    const planifie = await prisma.agentPassage.findFirst({ where: { proprietaireId: chefId, declenchement: "planifie" } });
    expect(planifie?.etat).toBe("en_attente");
  });

  it("RG-AST-19 — les extraits échus sont effacés ; la source, la référence et la date restent", async () => {
    const ancienne = await prisma.agentAction.findFirstOrThrow({ where: { etat: "effectuee", proprietaireId: chefId } });
    await prisma.agentAction.update({ where: { id: ancienne.id }, data: { creeLe: new Date("2025-01-01T00:00:00.000Z") } });
    const { PassagesService } = await import("./passages.service.js");
    await app.get(PassagesService).purgerLesExtraits(180);
    const purgee = await prisma.agentAction.findUniqueOrThrow({ where: { id: ancienne.id } });
    const preuves = purgee.preuves as Record<string, unknown>[];
    expect(preuves[0]).not.toHaveProperty("extrait");
    expect(preuves[0]).toMatchObject({ source: "courriel", reference: "<message-1@exemple.test>", date: "2026-10-01" });
  });

  it("RG-AST-01 — désactivé à chaud, le module retire ses traitements et ferme le guichet", async () => {
    const r = await session("PUT", "/assistant/reglages", cookieAdmin, {
      mode: "desactive", planification: "0 7 * * 1-5", jalonObligatoire: true, conservationJours: 180, actionsParPassage: 500, validationProjets: true,
    });
    expect(r.statusCode).toBe(200);
    const planifies = await prisma.$queryRaw<{ name: string }[]>`SELECT name FROM pgboss.schedule WHERE name LIKE 'assistant.%'`;
    expect(planifies).toEqual([]);
    expect((await guichet("GET", "/etat")).statusCode).toBe(404);
  });
});
