import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { execFileSync } from "node:child_process";
import path from "node:path";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { MODELES_ROLES } from "@rationarium/contracts";

/**
 * `RG-TSK-18`, `RG-TSK-19` — écrire sur une tâche n'est pas la lire.
 *
 * `exigerLisible` gardait les écritures comme les lectures : `tasks:readAll`
 * (référent fonctionnel, responsable technique…) ou la portée globale de
 * `users:readAll` (support informatique, RH…) donnaient la main sur TOUTES les
 * tâches de l'instance. Les comptes portent ici les permissions RÉELLES de
 * leur modèle de rôle, pas un jeu composé pour l'occasion : c'est la
 * combinaison livrée qui ouvrait le trou.
 */

const RACINE_DB = path.resolve(import.meta.dirname, "../../../../packages/db");
const MOT_DE_PASSE = "Corr3ct-Horse-Battery!";
const jour = (s: string) => new Date(`${s}T00:00:00.000Z`);

let pg: StartedPostgreSqlContainer;
let app: NestFastifyApplication;
let prisma: import("@rationarium/db").PrismaClient;

type Compte = { id: string; jeton: string };

const appel = (methode: string, url: string, jeton: string, corps?: unknown) =>
  app.inject({
    method: methode as "GET",
    url,
    cookies: { rationarium_session: jeton },
    ...(corps !== undefined ? { payload: corps as object } : {}),
  });

const permissionsDu = (code: string): string[] => {
  const modele = MODELES_ROLES.find((m) => m.code === code);
  if (!modele) throw new Error(`modèle de rôle inconnu : ${code}`);
  return [...modele.permissions];
};

async function compte(
  login: string,
  permissions: string[],
  departementId: string | null = null,
): Promise<Compte> {
  const { hacherMotDePasse } = await import("../auth/mots-de-passe.js");
  const role = await prisma.role.create({
    data: {
      code: `T_${login.toUpperCase()}`,
      nom: login,
      permissions: { create: [...new Set(permissions)].map((permission) => ({ permission })) },
    },
  });
  const { id } = await prisma.user.create({
    data: {
      login,
      email: `${login}@exemple.fr`,
      motDePasseHash: await hacherMotDePasse(MOT_DE_PASSE),
      prenom: "Test",
      nom: login,
      motDePasseAChanger: false,
      roleId: role.id,
      departementId,
    },
  });
  const connexion = await app.inject({
    method: "POST",
    url: "/api/auth/login",
    payload: { identifiant: login, motDePasse: MOT_DE_PASSE },
  });
  if (connexion.statusCode !== 200) throw new Error(`connexion refusée : ${connexion.body}`);
  return { id, jeton: connexion.cookies.find((c) => c.name === "rationarium_session")!.value };
}

let referent: Compte;
let support: Compte;
let manager: Compte;
let agentA: Compte;
let agentB: Compte;
let membre: Compte;
let gestionnaire: Compte;
let projet: string;

/** Une tâche du projet, assignée à l'agent du département B. */
async function tacheDuDepartementB(titre: string) {
  return (
    await prisma.task.create({
      data: {
        titre, projectId: projet, dateFin: jour("2027-03-01"),
        assignes: { create: [{ userId: agentB.id, porteur: true }] },
      },
    })
  ).id;
}

const ligne = (id: string) => prisma.task.findUniqueOrThrow({ where: { id } });

const modifierTitre = async (id: string, jeton: string, titre: string) =>
  appel("PATCH", `/api/taches/${id}`, jeton, { version: (await ligne(id)).version, titre });

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

  const direction = await prisma.direction.create({ data: { nom: "Direction générale" } });
  const depA = await prisma.departement.create({ data: { nom: "Département A", directionId: direction.id } });
  const depB = await prisma.departement.create({ data: { nom: "Département B", directionId: direction.id } });

  referent = await compte("referent", permissionsDu("FUNCTIONAL_REFERENT"));
  support = await compte("support", permissionsDu("IT_SUPPORT"));
  manager = await compte("manager", permissionsDu("MANAGER"), depA.id);
  agentA = await compte("agenta", permissionsDu("BASIC_USER"), depA.id);
  agentB = await compte("agentb", permissionsDu("BASIC_USER"), depB.id);
  membre = await compte("membre", permissionsDu("BASIC_USER"));
  gestionnaire = await compte("gestionnaire", ["tasks:read", "tasks:update", "tasks:manage_any"]);

  projet = (
    await prisma.project.create({
      data: {
        nom: "Projet du département B",
        dateDebut: jour("2027-01-01"),
        dateFin: jour("2027-12-31"),
        membres: { create: [{ userId: membre.id, roleProjet: "membre" }] },
      },
    })
  ).id;
}, 300_000);

afterAll(async () => {
  await prisma?.$disconnect();
  await app?.close();
  await pg?.stop();
});

describe("RG-TSK-18 — modifier une tâche exige un lien avec elle, pas une lecture élargie", () => {
  it("RG-TSK-18 — le référent fonctionnel (tasks:readAll) ne modifie pas la tâche d'un projet dont il n'est pas membre", async () => {
    const t = await tacheDuDepartementB("Recette du module");
    const r = await modifierTitre(t, referent.jeton, "Détourné");
    expect(r.statusCode).toBe(403);
    expect(r.json()).toMatchObject({ cle: "erreurs:horsPerimetre" });
    expect((await ligne(t)).titre).toBe("Recette du module");
  });

  it("RG-TSK-18 — le support informatique (users:readAll, portée globale) non plus", async () => {
    const t = await tacheDuDepartementB("Migration des postes");
    const r = await modifierTitre(t, support.jeton, "Détourné");
    expect(r.statusCode).toBe(403);
    expect(r.json()).toMatchObject({ cle: "erreurs:horsPerimetre" });
    expect((await ligne(t)).titre).toBe("Migration des postes");
  });

  it("RG-TSK-18 — le manager modifie la tâche d'un agent de SON département, sans être membre du projet", async () => {
    const t = (
      await prisma.task.create({
        data: {
          titre: "Rapport d'équipe", projectId: projet,
          assignes: { create: [{ userId: agentA.id, porteur: true }] },
        },
      })
    ).id;
    const r = await modifierTitre(t, manager.jeton, "Rapport d'équipe relu");
    expect(r.statusCode).toBe(200);
    expect((await ligne(t)).titre).toBe("Rapport d'équipe relu");
  });

  it("RG-TSK-18 — le manager ne modifie pas la tâche d'un agent d'un AUTRE département", async () => {
    const t = await tacheDuDepartementB("Inventaire");
    const r = await modifierTitre(t, manager.jeton, "Détourné");
    expect(r.statusCode).toBe(403);
    expect(r.json()).toMatchObject({ cle: "erreurs:horsPerimetre" });
    expect((await ligne(t)).titre).toBe("Inventaire");
  });

  it("RG-TSK-18 — l'assigné modifie sa tâche", async () => {
    const t = await tacheDuDepartementB("Saisie des relevés");
    const r = await modifierTitre(t, agentB.jeton, "Saisie des relevés faite");
    expect(r.statusCode).toBe(200);
    expect((await ligne(t)).titre).toBe("Saisie des relevés faite");
  });

  it("RG-TSK-18 — le membre du projet modifie une tâche du projet sans y être assigné", async () => {
    const t = await tacheDuDepartementB("Plan de charge");
    const r = await modifierTitre(t, membre.jeton, "Plan de charge validé");
    expect(r.statusCode).toBe(200);
    expect((await ligne(t)).titre).toBe("Plan de charge validé");
  });

  it("RG-TSK-18 — tasks:manage_any modifie toute tâche", async () => {
    const t = await tacheDuDepartementB("Arbitrage");
    const r = await modifierTitre(t, gestionnaire.jeton, "Arbitrage rendu");
    expect(r.statusCode).toBe(200);
    expect((await ligne(t)).titre).toBe("Arbitrage rendu");
  });

  it("RG-TSK-18 — la LECTURE reste ouverte : le référent lit la fiche qu'il ne peut pas modifier", async () => {
    const t = await tacheDuDepartementB("Lecture seule");
    const r = await appel("GET", `/api/taches/${t}`, referent.jeton);
    expect(r.statusCode).toBe(200);
  });

  it("RG-TSK-18 — les assignés, les sous-tâches et les deux déplacements sont refusés au référent", async () => {
    const t = await tacheDuDepartementB("Autour de la tâche");
    const v = (await ligne(t)).version;

    const assignes = await appel("PUT", `/api/taches/${t}/assignes`, referent.jeton, {
      version: v, userIds: [referent.id],
    });
    expect(assignes.statusCode).toBe(403);

    const sousTache = await appel("POST", `/api/taches/${t}/sous-taches`, referent.jeton, { libelle: "Ajoutée" });
    expect(sousTache.statusCode).toBe(403);

    const deplacer = await appel("POST", `/api/taches/${t}/deplacer`, referent.jeton, {
      version: v, nouvelleDate: "2027-04-01",
    });
    expect(deplacer.statusCode).toBe(403);

    const planning = await appel("PATCH", "/api/planning/taches/deplacer", referent.jeton, {
      taskId: t, version: v, nouvelleDate: "2027-04-01",
    });
    expect(planning.statusCode).toBe(403);

    // Rien n'a bougé : assignés, sous-tâches, échéance, version.
    const apres = await prisma.task.findUniqueOrThrow({
      where: { id: t },
      include: { assignes: true, sousTaches: true },
    });
    expect(apres.assignes.map((a) => a.userId)).toEqual([agentB.id]);
    expect(apres.sousTaches).toHaveLength(0);
    expect(apres.dateFin?.toISOString().slice(0, 10)).toBe("2027-03-01");
    expect(apres.version).toBe(v);
  });

  it("RG-TSK-18 — contre-témoin : l'assigné déplace sa tâche par les deux routes", async () => {
    const t = await tacheDuDepartementB("Déplacée");
    const v = (await ligne(t)).version;
    const planning = await appel("PATCH", "/api/planning/taches/deplacer", agentB.jeton, {
      taskId: t, version: v, nouvelleDate: "2027-04-01",
    });
    expect(planning.statusCode).toBe(200);
    const directe = await appel("POST", `/api/taches/${t}/deplacer`, agentB.jeton, {
      version: v + 1, nouvelleDate: "2027-05-03",
    });
    expect(directe.statusCode).toBe(201);
    expect((await ligne(t)).dateFin?.toISOString().slice(0, 10)).toBe("2027-05-03");
  });
});

describe("RG-TSK-19 — poser la confidentialité exige de pouvoir lire le confidentiel", () => {
  it("RG-TSK-19 — créer une tâche confidentielle sans tasks:read_confidential est refusé, rien n'est créé", async () => {
    const r = await appel("POST", "/api/taches", agentB.jeton, {
      titre: "Dossier sensible", confidentielle: true,
    });
    expect(r.statusCode).toBe(403);
    expect(r.json()).toMatchObject({ cle: "erreurs:champHorsPermission" });
    expect(await prisma.task.count({ where: { titre: "Dossier sensible" } })).toBe(0);
  });

  it("RG-TSK-19 — marquer confidentielle sa propre tâche sans tasks:read_confidential est refusé", async () => {
    const t = await tacheDuDepartementB("À masquer");
    const r = await appel("PATCH", `/api/taches/${t}`, agentB.jeton, {
      version: (await ligne(t)).version, confidentielle: true,
    });
    expect(r.statusCode).toBe(403);
    expect(r.json()).toMatchObject({ cle: "erreurs:champHorsPermission" });
    expect((await ligne(t)).confidentielle).toBe(false);
  });

  it("RG-TSK-19 — `confidentielle: false` reste permis : la fiche l'envoie à chaque enregistrement", async () => {
    const t = await tacheDuDepartementB("Formulaire complet");
    const r = await appel("PATCH", `/api/taches/${t}`, agentB.jeton, {
      version: (await ligne(t)).version, confidentielle: false, titre: "Formulaire complet relu",
    });
    expect(r.statusCode).toBe(200);
  });

  it("RG-TSK-19 — contre-témoin : avec tasks:read_confidential, la création confidentielle passe", async () => {
    const habilite = await compte("habilite", [...permissionsDu("BASIC_USER"), "tasks:read_confidential"]);
    const r = await appel("POST", "/api/taches", habilite.jeton, {
      titre: "Enquête interne", confidentielle: true,
    });
    expect(r.statusCode).toBe(201);
    const creee = await prisma.task.findFirstOrThrow({ where: { titre: "Enquête interne" } });
    expect(creee.confidentielle).toBe(true);
  });
});
