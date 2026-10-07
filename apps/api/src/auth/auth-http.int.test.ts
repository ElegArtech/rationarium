import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { execFileSync } from "node:child_process";
import path from "node:path";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { creerClient, type PrismaClient } from "@rationarium/db";
import { PERMISSIONS } from "@rationarium/contracts";
import { hacherMotDePasse } from "./mots-de-passe.js";

/**
 * SEC-02 — l'authentification vue depuis la surface HTTP, application
 * assemblée comme en production (`creerApplication`).
 *
 * Les règles de ce fichier ne vivent pas dans un service : elles vivent dans la
 * garde globale, dans la configuration Fastify, dans l'omission globale de
 * Prisma. Seule l'application assemblée les exerce.
 */

const RACINE_DB = path.resolve(import.meta.dirname, "../../../../packages/db");
const MDP = "Corr3ct-Horse-Battery!";

let pg: StartedPostgreSqlContainer;
let app: NestFastifyApplication;
let prisma: PrismaClient;
let jetonAdmin: string;

const appel = (
  methode: string,
  url: string,
  options: { jeton?: string; corps?: unknown; ip?: string } = {},
) =>
  app.inject({
    method: methode as "GET",
    url,
    ...(options.jeton ? { cookies: { rationarium_session: options.jeton } } : {}),
    ...(options.corps !== undefined ? { payload: options.corps as object } : {}),
    ...(options.ip ? { headers: { "x-forwarded-for": options.ip } } : {}),
  });

async function compte(
  login: string,
  permissions: readonly string[],
  options: { motDePasseAChanger?: boolean } = {},
) {
  const role = await prisma.role.create({
    data: {
      code: `SEC02_${login.toUpperCase().replaceAll(/[^A-Z0-9]/g, "_")}`,
      nom: login,
      permissions: { create: permissions.map((permission) => ({ permission })) },
    },
  });
  const u = await prisma.user.create({
    data: {
      login,
      email: `${login}@exemple.fr`,
      motDePasseHash: await hacherMotDePasse(MDP),
      prenom: "Test",
      nom: login,
      roleId: role.id,
      motDePasseAChanger: options.motDePasseAChanger ?? false,
    },
  });
  const connexion = await appel("POST", "/api/auth/login", {
    corps: { identifiant: login, motDePasse: MDP },
  });
  if (connexion.statusCode !== 200) throw new Error(`connexion refusée : ${connexion.body}`);
  return {
    id: u.id,
    jeton: connexion.cookies.find((c) => c.name === "rationarium_session")!.value,
  };
}

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
  jetonAdmin = (await compte("sec02.admin", PERMISSIONS)).jeton;
}, 300_000);

afterAll(async () => {
  await prisma?.$disconnect();
  await app?.close();
  await pg?.stop();
});

describe("RG-AUTH-14 — le haché d'un mot de passe ne sort jamais du serveur", () => {
  it("POST puis PATCH /api/utilisateurs ne rendent pas la clé motDePasseHash", async () => {
    const creation = await appel("POST", "/api/utilisateurs", {
      jeton: jetonAdmin,
      corps: {
        prenom: "Nouvel",
        nom: "Agent",
        email: "nouvel.agent@exemple.fr",
        login: "nouvel.agent",
        motDePasse: "Bonjour12!",
      },
    });
    expect(creation.statusCode).toBe(201);
    const cree = creation.json() as Record<string, unknown>;
    expect(cree).toHaveProperty("id");
    expect(Object.keys(cree)).not.toContain("motDePasseHash");

    const modification = await appel("PATCH", `/api/utilisateurs/${String(cree.id)}`, {
      jeton: jetonAdmin,
      corps: { version: cree.version, prenom: "Renommé" },
    });
    expect(modification.statusCode).toBe(200);
    const modifie = modification.json() as Record<string, unknown>;
    expect(modifie).toHaveProperty("prenom", "Renommé");
    expect(Object.keys(modifie)).not.toContain("motDePasseHash");
  });

  it("aucune réponse lue de GET /api/utilisateurs ne porte la clé", async () => {
    const r = await appel("GET", "/api/utilisateurs", { jeton: jetonAdmin });
    expect(r.statusCode).toBe(200);
    expect(r.body).not.toContain("motDePasseHash");
  });

  it("le haché reste écrit en base : la connexion fonctionne toujours", async () => {
    const r = await appel("POST", "/api/auth/login", {
      corps: { identifiant: "nouvel.agent", motDePasse: "Bonjour12!" },
    });
    expect(r.statusCode).toBe(200);
  });
});

describe("RG-AUTH-11 — tant qu'un changement est imposé, le serveur refuse le reste", () => {
  it("refuse GET /api/utilisateurs en 403 avec la clé, accepte /auth/me, puis rouvre après changement", async () => {
    const impose = await compte("sec02.impose", ["users:read"], { motDePasseAChanger: true });

    const refus = await appel("GET", "/api/utilisateurs", { jeton: impose.jeton });
    expect(refus.statusCode).toBe(403);
    expect(refus.json()).toMatchObject({ cle: "auth:erreurs.changementMotDePasseRequis" });

    const moi = await appel("GET", "/api/auth/me", { jeton: impose.jeton });
    expect(moi.statusCode).toBe(200);
    expect(moi.json()).toMatchObject({ motDePasseAChanger: true });

    const change = await appel("POST", "/api/auth/change-password", {
      jeton: impose.jeton,
      corps: { actuel: MDP, nouveau: "Nouv3au-Secret!", confirmation: "Nouv3au-Secret!" },
    });
    expect(change.statusCode).toBe(200);

    const apres = await appel("GET", "/api/utilisateurs", { jeton: impose.jeton });
    expect(apres.statusCode).toBe(200);
  });

  it("refuse aussi une route personnelle autre que /auth/me, et une écriture", async () => {
    const impose = await compte("sec02.impose2", ["users:read"], { motDePasseAChanger: true });

    const profil = await appel("PATCH", "/api/auth/me", {
      jeton: impose.jeton,
      corps: { prenom: "Contourné", version: 1 },
    });
    expect(profil.statusCode).toBe(403);
    expect(profil.json()).toMatchObject({ cle: "auth:erreurs.changementMotDePasseRequis" });

    // La déconnexion reste possible : on ne retient personne.
    const sortie = await appel("POST", "/api/auth/logout", { jeton: impose.jeton });
    expect(sortie.statusCode).toBe(204);
  });
});

describe("RG-AUTH-12 — connexion et réinitialisation limitées en débit par adresse IP", () => {
  /**
   * Chaque essai vise un identifiant DIFFÉRENT : sans cela, le verrouillage de
   * l'identifiant (429 lui aussi, même clé) répondrait avant la limite de
   * débit, et le test passerait sans elle.
   */
  it("la 11e connexion en une minute depuis une même adresse est refusée en 429", async () => {
    const reponses = [];
    for (let i = 0; i < 11; i++) {
      reponses.push(
        await appel("POST", "/api/auth/login", {
          ip: "203.0.113.11",
          corps: { identifiant: `debit-${i}`, motDePasse: "Faux1234!" },
        }),
      );
    }
    expect(reponses.slice(0, 10).map((r) => r.statusCode)).toEqual(Array(10).fill(401));
    const onzieme = reponses[10]!;
    expect(onzieme.statusCode).toBe(429);
    expect(onzieme.json()).toMatchObject({ cle: "auth:erreurs.compteVerrouille" });

    // Une autre adresse n'est pas pénalisée par la première.
    const autre = await appel("POST", "/api/auth/login", {
      ip: "203.0.113.12",
      corps: { identifiant: "debit-autre", motDePasse: "Faux1234!" },
    });
    expect(autre.statusCode).toBe(401);
  });

  it("la 6e demande de réinitialisation en une minute est refusée en 429", async () => {
    const reponses = [];
    for (let i = 0; i < 6; i++) {
      reponses.push(
        await appel("POST", "/api/auth/forgot-password", {
          ip: "203.0.113.21",
          corps: { email: `inconnu${i}@exemple.fr` },
        }),
      );
    }
    expect(reponses.slice(0, 5).map((r) => r.statusCode)).toEqual([202, 202, 202, 202, 202]);
    expect(reponses[5]!.statusCode).toBe(429);
    expect(reponses[5]!.json()).toMatchObject({ cle: "auth:erreurs.tropDeDemandes" });
  });

  it("la 6e inscription en une minute est refusée en 429", async () => {
    const reponses = [];
    for (let i = 0; i < 6; i++) {
      reponses.push(
        await appel("POST", "/api/auth/signup", {
          ip: "203.0.113.31",
          corps: {
            prenom: "A",
            nom: "B",
            email: `inscrit${i}@exemple.fr`,
            login: `inscrit${i}`,
            motDePasse: "Bonjour12!",
            confirmation: "Bonjour12!",
          },
        }),
      );
    }
    expect(reponses.slice(0, 5).map((r) => r.statusCode)).not.toContain(429);
    expect(reponses[5]!.statusCode).toBe(429);
    expect(reponses[5]!.json()).toMatchObject({ cle: "auth:erreurs.tropDeDemandes" });
  });

  it("la limite globale dépassée rend 429 et une clé, jamais une erreur interne", async () => {
    let derniere;
    for (let i = 0; i < 301; i++) {
      derniere = await appel("GET", "/api/auth/acces", { ip: "203.0.113.41" });
    }
    expect(derniere!.statusCode).toBe(429);
    expect(derniere!.json()).toMatchObject({ cle: "auth:erreurs.tropDeDemandes" });
  });
});

describe("D08 — taille des corps de requête", () => {
  it("un avatar de 3 Mio est refusé en 413 avec la clé et le plafond", async () => {
    const moi = await appel("GET", "/api/auth/me", { jeton: jetonAdmin });
    const version = (moi.json() as { version: number }).version;
    // Signature PNG suivie de 3 Mio : le format est valide, seule la taille fautive.
    const contenu = Buffer.concat([
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
      Buffer.alloc(3 * 1024 * 1024),
    ]);
    const r = await appel("POST", "/api/auth/me/avatar", {
      jeton: jetonAdmin,
      corps: { contenuBase64: contenu.toString("base64"), typeMime: "image/png", version },
    });
    expect(r.statusCode).toBe(413);
    expect(r.json()).toMatchObject({
      cle: "erreurs:fichierTropVolumineux",
      detail: { maxOctets: 2_097_152 },
    });
  });

  it("un corps JSON de 25 Mio vers /api/documents est lu, pas refusé pour sa taille", async () => {
    // 18,75 Mio de contenu → 25 Mio de base64. Sans rattachement : le refus
    // métier 422 prouve que le corps a été lu jusqu'au bout.
    const contenu = Buffer.alloc(Math.floor((25 * 1024 * 1024 * 3) / 4), 1);
    const r = await appel("POST", "/api/documents", {
      jeton: jetonAdmin,
      corps: {
        nom: "volumineux.bin",
        contenuBase64: contenu.toString("base64"),
        typeMime: "application/octet-stream",
      },
    });
    expect(r.statusCode).not.toBe(413);
    expect(r.statusCode).toBe(422);
  });
});
