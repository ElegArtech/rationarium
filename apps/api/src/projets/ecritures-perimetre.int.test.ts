import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { execFileSync } from "node:child_process";
import path from "node:path";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { creerClient, type PrismaClient } from "@rationarium/db";
import { modeleParCode } from "@rationarium/contracts";
import { hacherMotDePasse } from "../auth/mots-de-passe.js";

/**
 * `RG-PRJ-13` — les ÉCRITURES d'un projet, de ses jalons et de ses épopées
 * contrôlent le périmètre, et pas seulement la permission.
 *
 * Le défaut : la garde de chaque route exigeait la permission (`projects:update`,
 * `milestones:create`…), et le service écrivait sur l'identifiant reçu. Un chef
 * de projet pouvait donc renommer, annuler, archiver ou supprimer le projet d'un
 * autre, et en refaire la feuille de route, en devinant son identifiant. C'est
 * le miroir, côté écriture, de « la LISTE filtre, l'adresse directe non ».
 *
 * La suite passe par HTTP : c'est la garde PUIS le service qu'il faut voir
 * ensemble. Chaque refus vérifie aussi que la ligne en base n'a pas bougé — un
 * 403 rendu APRÈS l'écriture serait un refus de façade.
 */

const RACINE_DB = path.resolve(import.meta.dirname, "../../../../packages/db");
const date = (jour: string) => new Date(`${jour}T00:00:00.000Z`);

let pg: StartedPostgreSqlContainer;
let app: NestFastifyApplication;
let prisma: PrismaClient;

type Acteur = { id: string; jeton: string };

/** `PROJECT_LEAD`, rattaché à rien. Le seul ajout est `projects:delete`, que le
 *  modèle ne porte pas : sans lui, la garde refuserait `DELETE` avant que le
 *  périmètre ait un mot à dire, et le test ne prouverait rien. */
let horsProjet: Acteur;
let chef: Acteur;
let membre: Acteur;
let portefeuille: Acteur;
/** `projects:manage_any` SANS permission de gestion globale des personnes :
 *  c'est la permission de domaine qui doit suffire, pas `perimetre.global`. */
let gestionnaire: Acteur;
let createur: string;

const MOT_DE_PASSE = "Bonjour12!";

async function compte(
  login: string,
  modeleCode: string,
  ajouts: string[] = [],
): Promise<Acteur> {
  const modele = modeleParCode(modeleCode);
  if (!modele) throw new Error(`Modèle ${modeleCode} absent du catalogue.`);
  const permissions = [...new Set([...modele.permissions, ...ajouts])];
  const role = await prisma.role.create({
    data: {
      code: `T_${login.toUpperCase()}`,
      nom: login,
      permissions: { create: permissions.map((permission) => ({ permission })) },
    },
  });
  const id = crypto.randomUUID();
  await prisma.user.create({
    data: {
      id,
      login,
      email: `${login}@exemple.test`,
      prenom: login,
      nom: "SEC03",
      roleId: role.id,
      motDePasseHash: await hacherMotDePasse(MOT_DE_PASSE),
      motDePasseAChanger: false,
    },
  });
  const connexion = await app.inject({
    method: "POST",
    url: "/api/auth/login",
    payload: { identifiant: login, motDePasse: MOT_DE_PASSE },
  });
  if (connexion.statusCode !== 200) throw new Error(`connexion refusée : ${connexion.body}`);
  return {
    id,
    jeton: connexion.cookies.find((c) => c.name === "rationarium_session")!.value,
  };
}

const appel = (
  acteur: Acteur,
  methode: "GET" | "POST" | "PATCH" | "DELETE",
  url: string,
  corps?: object,
) =>
  app.inject({
    method: methode,
    url: `/api${url}`,
    cookies: { rationarium_session: acteur.jeton },
    ...(corps ? { payload: corps } : {}),
  });

/** Un projet d'autrui : créé par `createur`, dirigé par `chef`, `membre` inscrit. */
async function projet(statut: "active" | "cancelled" = "active") {
  const p = await prisma.project.create({
    data: {
      nom: `P-${crypto.randomUUID().slice(0, 8)}`,
      statut,
      dateDebut: date("2026-01-01"),
      dateFin: date("2026-12-31"),
      createurId: createur,
      chefId: chef.id,
      membres: { create: [{ userId: membre.id, roleProjet: "Membre" }] },
    },
  });
  const jalon = await prisma.milestone.create({
    data: { nom: "Lancement", projectId: p.id, dateEcheance: date("2026-06-30") },
  });
  const epopee = await prisma.epic.create({ data: { nom: "Socle", projectId: p.id } });
  return { projet: p, jalon, epopee };
}

const instantane = async (projectId: string) => ({
  projet: await prisma.project.findUnique({ where: { id: projectId } }),
  jalons: await prisma.milestone.findMany({ where: { projectId }, orderBy: { id: "asc" } }),
  epopees: await prisma.epic.findMany({ where: { projectId }, orderBy: { id: "asc" } }),
});

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
  prisma = creerClient(pg.getConnectionUri());

  horsProjet = await compte("lead.hors", "PROJECT_LEAD", ["projects:delete"]);
  chef = await compte("lead.chef", "PROJECT_LEAD", ["projects:delete"]);
  membre = await compte("lead.membre", "PROJECT_LEAD", ["projects:delete"]);
  portefeuille = await compte("ines.portefeuille", "PORTFOLIO_MANAGER");
  gestionnaire = await compte("gestion.domaine", "BASIC_USER", [
    "projects:manage_any",
    "projects:update",
    "projects:delete",
    "milestones:create",
    "epics:create",
  ]);
  createur = (await compte("createur", "BASIC_USER")).id;
}, 300_000);

afterAll(async () => {
  await prisma?.$disconnect();
  await app?.close();
  await pg?.stop();
});

/** Les douze gestes refusés, avec ce qu'il faut pour les composer. */
const GESTES: {
  nom: string;
  statut?: "cancelled";
  requete: (c: Awaited<ReturnType<typeof projet>>) => {
    methode: "POST" | "PATCH" | "DELETE";
    url: string;
    corps?: object;
  };
}[] = [
  {
    nom: "PATCH /projets/:id",
    requete: ({ projet: p }) => ({
      methode: "PATCH", url: `/projets/${p.id}`, corps: { nom: "Détourné", version: p.version },
    }),
  },
  { nom: "POST /projets/:id/annuler", requete: ({ projet: p }) => ({ methode: "POST", url: `/projets/${p.id}/annuler` }) },
  {
    nom: "POST /projets/:id/restaurer",
    statut: "cancelled",
    requete: ({ projet: p }) => ({ methode: "POST", url: `/projets/${p.id}/restaurer` }),
  },
  {
    nom: "POST /projets/:id/archiver",
    requete: ({ projet: p }) => ({ methode: "POST", url: `/projets/${p.id}/archiver`, corps: { archive: true } }),
  },
  { nom: "DELETE /projets/:id", requete: ({ projet: p }) => ({ methode: "DELETE", url: `/projets/${p.id}` }) },
  {
    nom: "POST /projets/:id/jalons",
    requete: ({ projet: p }) => ({
      methode: "POST", url: `/projets/${p.id}/jalons`, corps: { nom: "Intrus", dateEcheance: "2026-07-01" },
    }),
  },
  {
    nom: "PATCH /projets/jalons/:id",
    requete: ({ jalon: j }) => ({
      methode: "PATCH", url: `/projets/jalons/${j.id}`, corps: { nom: "Renommé", version: j.version },
    }),
  },
  {
    nom: "POST /projets/jalons/:id/marquer",
    requete: ({ jalon: j }) => ({
      methode: "POST", url: `/projets/jalons/${j.id}/marquer`, corps: { atteint: true, version: j.version },
    }),
  },
  { nom: "DELETE /projets/jalons/:id", requete: ({ jalon: j }) => ({ methode: "DELETE", url: `/projets/jalons/${j.id}` }) },
  {
    nom: "POST /projets/:id/epopees",
    requete: ({ projet: p }) => ({ methode: "POST", url: `/projets/${p.id}/epopees`, corps: { nom: "Intruse" } }),
  },
  {
    nom: "PATCH /projets/epopees/:id",
    requete: ({ epopee: e }) => ({
      methode: "PATCH", url: `/projets/epopees/${e.id}`, corps: { nom: "Renommée", version: e.version },
    }),
  },
  { nom: "DELETE /projets/epopees/:id", requete: ({ epopee: e }) => ({ methode: "DELETE", url: `/projets/epopees/${e.id}` }) },
];

describe("RG-PRJ-13 — un chef de projet NON RATTACHÉ n'écrit rien sur le projet d'autrui", () => {
  for (const geste of GESTES) {
    it(`RG-PRJ-13 — ${geste.nom} : 403 erreurs:horsPerimetre, et la base est inchangée`, async () => {
      const cas = await projet(geste.statut);
      const avant = await instantane(cas.projet.id);
      const { methode, url, corps } = geste.requete(cas);

      const r = await appel(horsProjet, methode, url, corps);

      expect(r.statusCode).toBe(403);
      expect((r.json() as { cle: string }).cle).toBe("erreurs:horsPerimetre");
      expect(await instantane(cas.projet.id)).toEqual(avant);
    });
  }
});

describe("RG-PRJ-13 — le porteur du projet, lui, écrit", () => {
  it("RG-PRJ-13 — le chef modifie, annule, restaure, archive son projet", async () => {
    const { projet: p } = await projet();
    const modifie = await appel(chef, "PATCH", `/projets/${p.id}`, { nom: "Renommé par son chef", version: p.version });
    expect(modifie.statusCode).toBe(200);
    expect((await prisma.project.findUniqueOrThrow({ where: { id: p.id } })).nom).toBe("Renommé par son chef");

    expect((await appel(chef, "POST", `/projets/${p.id}/annuler`)).statusCode).toBe(201);
    expect((await prisma.project.findUniqueOrThrow({ where: { id: p.id } })).statut).toBe("cancelled");
    expect((await appel(chef, "POST", `/projets/${p.id}/restaurer`)).statusCode).toBe(201);
    expect((await prisma.project.findUniqueOrThrow({ where: { id: p.id } })).statut).toBe("active");
    expect((await appel(chef, "POST", `/projets/${p.id}/archiver`, { archive: true })).statusCode).toBe(201);
    expect((await prisma.project.findUniqueOrThrow({ where: { id: p.id } })).archive).toBe(true);
  });

  it("RG-PRJ-13 — le chef supprime définitivement son projet", async () => {
    const { projet: p } = await projet();
    const r = await appel(chef, "DELETE", `/projets/${p.id}`);
    expect(r.statusCode).toBe(200);
    expect(await prisma.project.findUnique({ where: { id: p.id } })).toBeNull();
  });

  it("RG-PRJ-13 — le créateur et le sponsor sont porteurs au même titre que le chef", async () => {
    const sponsor = await compte("lead.sponsor", "PROJECT_LEAD");
    const createurLead = await compte("lead.createur", "PROJECT_LEAD");
    const a = await prisma.project.create({
      data: {
        nom: "Sponsorisé", dateDebut: date("2026-01-01"), dateFin: date("2026-12-31"),
        sponsorId: sponsor.id,
      },
    });
    const b = await prisma.project.create({
      data: {
        nom: "Créé", dateDebut: date("2026-01-01"), dateFin: date("2026-12-31"),
        createurId: createurLead.id,
      },
    });
    expect((await appel(sponsor, "POST", `/projets/${a.id}/annuler`)).statusCode).toBe(201);
    expect((await appel(createurLead, "POST", `/projets/${b.id}/annuler`)).statusCode).toBe(201);
  });
});

describe("RG-PRJ-13 — le membre simple structure la feuille de route, pas le projet", () => {
  it("RG-PRJ-13 — un membre crée, modifie, marque et supprime un jalon", async () => {
    const { projet: p } = await projet();
    const cree = await appel(membre, "POST", `/projets/${p.id}/jalons`, {
      nom: "Recette", dateEcheance: "2026-09-30",
    });
    expect(cree.statusCode).toBe(201);
    const jalon = cree.json() as { id: string; version: number };

    const modifie = await appel(membre, "PATCH", `/projets/jalons/${jalon.id}`, {
      nom: "Recette usager", version: jalon.version,
    });
    expect(modifie.statusCode).toBe(200);
    const marque = await appel(membre, "POST", `/projets/jalons/${jalon.id}/marquer`, {
      atteint: true, version: (modifie.json() as { version: number }).version,
    });
    expect(marque.statusCode).toBe(201);
    expect((await prisma.milestone.findUniqueOrThrow({ where: { id: jalon.id } })).statut).toBe("done");

    expect((await appel(membre, "DELETE", `/projets/jalons/${jalon.id}`)).statusCode).toBe(200);
    expect(await prisma.milestone.findUnique({ where: { id: jalon.id } })).toBeNull();
  });

  it("RG-PRJ-13 — un membre crée, modifie et supprime une épopée", async () => {
    const { projet: p } = await projet();
    const cree = await appel(membre, "POST", `/projets/${p.id}/epopees`, { nom: "Usagers" });
    expect(cree.statusCode).toBe(201);
    const e = cree.json() as { id: string; version: number };
    expect((await appel(membre, "PATCH", `/projets/epopees/${e.id}`, { nom: "Usagers 2", version: e.version })).statusCode).toBe(200);
    expect((await appel(membre, "DELETE", `/projets/epopees/${e.id}`)).statusCode).toBe(200);
  });

  it("RG-PRJ-13 — un membre n'annule pas le projet, ne le modifie pas, ne le supprime pas", async () => {
    const { projet: p } = await projet();
    const avant = await instantane(p.id);

    for (const [methode, url, corps] of [
      ["POST", `/projets/${p.id}/annuler`, undefined],
      ["PATCH", `/projets/${p.id}`, { nom: "Par un membre", version: p.version }],
      ["POST", `/projets/${p.id}/archiver`, { archive: true }],
      ["DELETE", `/projets/${p.id}`, undefined],
    ] as const) {
      const r = await appel(membre, methode, url, corps);
      expect(r.statusCode, `${methode} ${url}`).toBe(403);
      expect((r.json() as { cle: string }).cle).toBe("erreurs:horsPerimetre");
    }
    expect(await instantane(p.id)).toEqual(avant);
  });
});

describe("RG-PRJ-13 — `projects:manage_any` lève le contrôle de rattachement", () => {
  it("RG-PRJ-13 — PORTFOLIO_MANAGER modifie, annule, restaure et archive un projet où il n'est rien", async () => {
    const { projet: p } = await projet();
    expect((await appel(portefeuille, "PATCH", `/projets/${p.id}`, { nom: "Arbitré", version: p.version })).statusCode).toBe(200);
    expect((await appel(portefeuille, "POST", `/projets/${p.id}/annuler`)).statusCode).toBe(201);
    expect((await appel(portefeuille, "POST", `/projets/${p.id}/restaurer`)).statusCode).toBe(201);
    expect((await appel(portefeuille, "POST", `/projets/${p.id}/archiver`, { archive: true })).statusCode).toBe(201);
    const apres = await prisma.project.findUniqueOrThrow({ where: { id: p.id } });
    expect(apres.nom).toBe("Arbitré");
    expect(apres.archive).toBe(true);
  });

  it("RG-PRJ-13 — la permission de DOMAINE suffit, sans gestion globale des personnes", async () => {
    const { projet: p } = await projet();
    expect((await appel(gestionnaire, "POST", `/projets/${p.id}/jalons`, { nom: "Comité", dateEcheance: "2026-10-01" })).statusCode).toBe(201);
    expect((await appel(gestionnaire, "POST", `/projets/${p.id}/epopees`, { nom: "Pilotage" })).statusCode).toBe(201);
    expect((await appel(gestionnaire, "DELETE", `/projets/${p.id}`)).statusCode).toBe(200);
  });
});
