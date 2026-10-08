import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { execFileSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";

/**
 * `RG-DOC-03`, `RG-DOC-04` — commentaires et pièces jointes, sur la chaîne
 * HTTP complète.
 *
 * `consulter` et `telecharger` héritaient déjà du droit de lire le porteur ;
 * `fil`, `commenter` et `joindre` non. Le fil d'une tâche confidentielle se
 * lisait donc avec `comments:read` seul, et l'on commentait ou déposait une
 * pièce sur n'importe quel projet de l'instance en connaissant son
 * identifiant — `RG-SCOPE-04` contourné par la porte d'à côté.
 */

const RACINE_DB = path.resolve(import.meta.dirname, "../../../../packages/db");
const MOT_DE_PASSE = "Corr3ct-Horse-Battery!";
const MIO = 1024 * 1024;

let pg: StartedPostgreSqlContainer;
let app: NestFastifyApplication;
let prisma: import("@rationarium/db").PrismaClient;
let stockage: string;

type Compte = { id: string; jeton: string };

const appel = (methode: string, url: string, jeton: string, corps?: unknown) =>
  app.inject({
    method: methode as "GET",
    url,
    cookies: { rationarium_session: jeton },
    ...(corps !== undefined ? { payload: corps as object } : {}),
  });

async function compte(login: string, permissions: string[]): Promise<Compte> {
  const { hacherMotDePasse } = await import("../auth/mots-de-passe.js");
  const role = await prisma.role.create({
    data: {
      code: login.toUpperCase().replaceAll(".", "_"),
      nom: login,
      permissions: { create: permissions.map((permission) => ({ permission })) },
    },
  });
  const { id } = await prisma.user.create({
    data: {
      login,
      email: `${login}@exemple.test`,
      motDePasseHash: await hacherMotDePasse(MOT_DE_PASSE),
      prenom: "Test",
      nom: login,
      motDePasseAChanger: false,
      roleId: role.id,
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

const CONTRIBUTEUR = ["comments:read", "comments:create", "documents:create", "documents:read"];

let contributeur: Compte;
let projetVisible: string;
let projetInvisible: string;
let tacheConfidentielle: string;
let tacheVisible: string;

beforeAll(async () => {
  stockage = await mkdtemp(path.join(os.tmpdir(), "rationarium-documents-"));
  process.env["RATIONARIUM_DOCUMENTS"] = stockage;

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
  /*
   * D08 — la limite de corps est posée dans `main.ts` par SEC-02. Tant
   * qu'elle n'y est pas, Fastify garde son défaut de 1 Mio et refuse une
   * pièce de 5 Mio avant tout contrôleur : on la pose ICI, pour ce test
   * seulement. Dès que `main.ts` porte la limite, ce bloc ne fait rien et le
   * test exerce l'assemblage réel.
   */
  const fastify = app.getHttpAdapter().getInstance();
  if ((fastify.initialConfig.bodyLimit ?? 0) < 32 * MIO) {
    fastify.removeContentTypeParser("application/json");
    fastify.addContentTypeParser(
      "application/json",
      { parseAs: "string", bodyLimit: 32 * MIO },
      fastify.getDefaultJsonParser("error", "error"),
    );
  }
  await fastify.ready();

  const { creerClient } = await import("@rationarium/db");
  prisma = creerClient(pg.getConnectionUri());

  contributeur = await compte("contributeur", CONTRIBUTEUR);

  const dates = { dateDebut: new Date("2027-01-01T00:00:00.000Z"), dateFin: new Date("2027-12-31T00:00:00.000Z") };
  projetVisible = (
    await prisma.project.create({
      data: { nom: "Projet visible", ...dates, membres: { create: [{ userId: contributeur.id, roleProjet: "membre" }] } },
    })
  ).id;
  projetInvisible = (await prisma.project.create({ data: { nom: "Projet d'ailleurs", ...dates } })).id;

  // L'assigné d'une tâche confidentielle ne la lit pas sans `tasks:read_confidential`.
  tacheConfidentielle = (
    await prisma.task.create({
      data: {
        titre: "Dossier disciplinaire",
        confidentielle: true,
        assignes: { create: [{ userId: contributeur.id }] },
      },
    })
  ).id;
  tacheVisible = (
    await prisma.task.create({
      data: { titre: "Tâche ordinaire", assignes: { create: [{ userId: contributeur.id }] } },
    })
  ).id;
  await prisma.comment.create({
    data: { contenu: "Motif confidentiel", auteurId: contributeur.id, taskId: tacheConfidentielle },
  });
  await prisma.comment.create({
    data: { contenu: "Échange de projet", auteurId: contributeur.id, projectId: projetInvisible },
  });
}, 300_000);

afterAll(async () => {
  await prisma?.$disconnect();
  await app?.close();
  await pg?.stop();
  if (stockage) await rm(stockage, { recursive: true, force: true });
});

const piece = (octets: number, cible: Record<string, string>) => ({
  nom: "piece.bin",
  typeMime: "application/octet-stream",
  contenuBase64: Buffer.alloc(octets, 7).toString("base64"),
  ...cible,
});

describe("RG-DOC-03 — fil, commentaire et pièce jointe héritent du droit de lire le porteur", () => {
  it("RG-DOC-03 — le fil d'une tâche confidentielle est refusé à son assigné sans permission", async () => {
    const r = await appel("GET", `/api/documents/commentaires/fil?taskId=${tacheConfidentielle}`, contributeur.jeton);
    expect(r.statusCode).toBe(403);
    expect(r.json()).toMatchObject({ cle: "erreurs:horsPerimetre" });
    expect(r.body).not.toContain("Motif confidentiel");
  });

  it("RG-DOC-03 — le fil d'un projet non visible est refusé", async () => {
    const r = await appel("GET", `/api/documents/commentaires/fil?projectId=${projetInvisible}`, contributeur.jeton);
    expect(r.statusCode).toBe(403);
    expect(r.body).not.toContain("Échange de projet");
  });

  it("RG-DOC-03 — le fil exige une cible : sans projectId ni taskId, 400", async () => {
    const r = await appel("GET", "/api/documents/commentaires/fil", contributeur.jeton);
    expect(r.statusCode).toBe(400);
  });

  it("RG-DOC-03 — contre-témoin : le fil d'une tâche lisible se lit", async () => {
    const r = await appel("GET", `/api/documents/commentaires/fil?taskId=${tacheVisible}`, contributeur.jeton);
    expect(r.statusCode).toBe(200);
  });

  it("RG-DOC-03 — commenter un projet non visible est refusé, et rien n'est écrit", async () => {
    const r = await appel("POST", "/api/documents/commentaires", contributeur.jeton, {
      contenu: "Intrusion",
      projectId: projetInvisible,
    });
    expect(r.statusCode).toBe(403);
    expect(r.json()).toMatchObject({ cle: "erreurs:horsPerimetre" });
    expect(await prisma.comment.count({ where: { contenu: "Intrusion" } })).toBe(0);
  });

  it("RG-DOC-03 — commenter une tâche lisible en la rattachant à un projet non visible est refusé", async () => {
    const r = await appel("POST", "/api/documents/commentaires", contributeur.jeton, {
      contenu: "Rattachement forgé",
      taskId: tacheVisible,
      projectId: projetInvisible,
    });
    expect(r.statusCode).toBe(403);
  });

  it("RG-DOC-03 — contre-témoin : commenter un projet dont on est membre réussit", async () => {
    const r = await appel("POST", "/api/documents/commentaires", contributeur.jeton, {
      contenu: "Point d'avancement",
      projectId: projetVisible,
    });
    expect(r.statusCode).toBe(201);
  });

  it("RG-DOC-03 — joindre une pièce à une tâche confidentielle non lisible est refusé, et rien n'est écrit", async () => {
    const r = await appel("POST", "/api/documents", contributeur.jeton, piece(16, { taskId: tacheConfidentielle }));
    expect(r.statusCode).toBe(403);
    expect(r.json()).toMatchObject({ cle: "erreurs:horsPerimetre" });
    expect(await prisma.document.count({ where: { taskId: tacheConfidentielle } })).toBe(0);
  });
});

describe("RG-DOC-04 — une pièce jointe pèse au plus 20 Mio", () => {
  it("RG-DOC-04 — une pièce de 21 Mio est refusée en 413, avec la clé et le plafond", async () => {
    const r = await appel("POST", "/api/documents", contributeur.jeton, piece(21 * MIO, { projectId: projetVisible }));
    expect(r.statusCode).toBe(413);
    expect(r.json()).toMatchObject({
      cle: "erreurs:fichierTropVolumineux",
      detail: { maxOctets: 20_971_520 },
    });
  });

  it("RG-DOC-04 — une pièce de 5 Mio est acceptée (D08)", async () => {
    const r = await appel("POST", "/api/documents", contributeur.jeton, piece(5 * MIO, { projectId: projetVisible }));
    expect(r.statusCode).toBe(201);
    const { id } = r.json() as { id: string };
    expect((await prisma.document.findUniqueOrThrow({ where: { id } })).tailleOctets).toBe(5 * MIO);
  });
});

describe("RG-DOC-05 — agir sur la contribution d'autrui exige la permission dédiée, puis de lire son porteur", () => {
  /*
   * Un rôle composé sur mesure : il gère les contributions des autres, sans
   * portée globale ni lecture des tâches confidentielles. C'est le cas que la
   * permission seule laissait passer.
   */
  const GESTIONNAIRE = [
    "documents:update", "documents:delete", "documents:manage_any",
    "comments:update", "comments:delete", "comments:manage_any",
  ];
  let gestionnaire: Compte;
  let documentConfidentiel: string;
  let documentVisible: string;
  let commentaireConfidentiel: string;
  let commentaireInvisible: string;

  beforeAll(async () => {
    gestionnaire = await compte("gestionnaire", GESTIONNAIRE);
    await prisma.projectMember.create({ data: { projectId: projetVisible, userId: gestionnaire.id, roleProjet: "membre" } });
    const fichier = { empreinte: "0".repeat(64), tailleOctets: 4, typeMime: "text/plain", auteurId: contributeur.id };
    documentConfidentiel = (await prisma.document.create({ data: { nom: "rapport-secret.txt", taskId: tacheConfidentielle, ...fichier } })).id;
    documentVisible = (await prisma.document.create({ data: { nom: "compte-rendu.txt", projectId: projetVisible, ...fichier } })).id;
    commentaireConfidentiel = (
      await prisma.comment.create({ data: { contenu: "Témoignage", auteurId: contributeur.id, taskId: tacheConfidentielle } })
    ).id;
    commentaireInvisible = (
      await prisma.comment.create({ data: { contenu: "Arbitrage", auteurId: contributeur.id, projectId: projetInvisible } })
    ).id;
  });

  it("RG-DOC-05 — renommer la pièce d'autrui sur une tâche confidentielle illisible est refusé, rien ne change", async () => {
    const r = await appel("PATCH", `/api/documents/${documentConfidentiel}`, gestionnaire.jeton, { nom: "renomme.txt", version: 1 });
    expect(r.statusCode).toBe(403);
    expect(r.json()).toMatchObject({ cle: "erreurs:horsPerimetre" });
    expect((await prisma.document.findUniqueOrThrow({ where: { id: documentConfidentiel } })).nom).toBe("rapport-secret.txt");
  });

  it("RG-DOC-05 — supprimer la pièce d'autrui sur une tâche confidentielle illisible est refusé, elle reste", async () => {
    const r = await appel("DELETE", `/api/documents/${documentConfidentiel}`, gestionnaire.jeton);
    expect(r.statusCode).toBe(403);
    expect(await prisma.document.count({ where: { id: documentConfidentiel } })).toBe(1);
  });

  it("RG-DOC-05 — modifier le commentaire d'autrui sur une tâche confidentielle illisible est refusé", async () => {
    const r = await appel("PATCH", `/api/documents/commentaires/${commentaireConfidentiel}`, gestionnaire.jeton, { contenu: "Réécrit", version: 1 });
    expect(r.statusCode).toBe(403);
    expect((await prisma.comment.findUniqueOrThrow({ where: { id: commentaireConfidentiel } })).contenu).toBe("Témoignage");
  });

  it("RG-DOC-05 — supprimer le commentaire d'autrui sur un projet non visible est refusé, il reste", async () => {
    const r = await appel("DELETE", `/api/documents/commentaires/${commentaireInvisible}`, gestionnaire.jeton);
    expect(r.statusCode).toBe(403);
    expect(r.json()).toMatchObject({ cle: "erreurs:horsPerimetre" });
    expect(await prisma.comment.count({ where: { id: commentaireInvisible } })).toBe(1);
  });

  it("RG-DOC-05 — contre-témoin : sur un projet visible, la permission dédiée suffit à renommer la pièce d'autrui", async () => {
    const r = await appel("PATCH", `/api/documents/${documentVisible}`, gestionnaire.jeton, { nom: "compte-rendu-final.txt", version: 1 });
    expect(r.statusCode).toBe(200);
    expect((await prisma.document.findUniqueOrThrow({ where: { id: documentVisible } })).nom).toBe("compte-rendu-final.txt");
  });

  it("RG-DOC-05 — contre-témoin : l'auteur garde la main sur sa contribution, porteur illisible compris", async () => {
    const sien = await prisma.comment.create({
      data: { contenu: "Ma note", auteurId: gestionnaire.id, taskId: tacheConfidentielle },
    });
    const r = await appel("PATCH", `/api/documents/commentaires/${sien.id}`, gestionnaire.jeton, { contenu: "Ma note corrigée", version: sien.version });
    expect(r.statusCode).toBe(200);
  });
});

describe("RG-DOC-06 — modifier un commentaire ou renommer un document exige la version lue", () => {
  /*
   * `RG-GEN-07` — la version était incrémentée sans jamais être confrontée sur
   * le commentaire, et facultative sur le renommage : deux fenêtres qui
   * corrigeaient le même commentaire gardaient la seconde correction, et la
   * première disparaissait sans que personne le sache.
   */
  let auteur: Compte;
  let commentaire: string;
  let document: string;

  beforeAll(async () => {
    auteur = await compte("auteur", [...CONTRIBUTEUR, "comments:update", "documents:update"]);
    // Assigné : la consultation du document exige de lire sa tâche (`RG-DOC-03`).
    await prisma.taskAssignee.create({ data: { taskId: tacheVisible, userId: auteur.id } });
    commentaire = (
      await prisma.comment.create({ data: { contenu: "Première version", auteurId: auteur.id, taskId: tacheVisible } })
    ).id;
    document = (
      await prisma.document.create({
        data: {
          nom: "plan.txt", taskId: tacheVisible, empreinte: "1".repeat(64),
          tailleOctets: 4, typeMime: "text/plain", auteurId: auteur.id,
        },
      })
    ).id;
  });

  it("RG-DOC-06 — le fil rend la version de chaque commentaire", async () => {
    const r = await appel("GET", `/api/documents/commentaires/fil?taskId=${tacheVisible}`, contributeur.jeton);
    expect(r.statusCode).toBe(200);
    const ligne = (r.json() as { id: string; version: number }[]).find((c) => c.id === commentaire);
    expect(ligne?.version).toBe(1);
  });

  it("RG-DOC-06 — modifier un commentaire SANS version est refusé en 400, rien n'est écrit", async () => {
    const r = await appel("PATCH", `/api/documents/commentaires/${commentaire}`, auteur.jeton, { contenu: "Sans version" });
    expect(r.statusCode).toBe(400);
    const relu = await prisma.comment.findUniqueOrThrow({ where: { id: commentaire } });
    expect(relu.contenu).toBe("Première version");
    expect(relu.version).toBe(1);
  });

  it("RG-DOC-06 — une version PÉRIMÉE est refusée en 409, et la correction concurrente reste", async () => {
    // Une autre fenêtre a corrigé entre-temps : la version en base est passée à 2.
    const premiere = await appel("PATCH", `/api/documents/commentaires/${commentaire}`, auteur.jeton, { contenu: "Fenêtre A", version: 1 });
    expect(premiere.statusCode).toBe(200);

    const seconde = await appel("PATCH", `/api/documents/commentaires/${commentaire}`, auteur.jeton, { contenu: "Fenêtre B", version: 1 });
    expect(seconde.statusCode).toBe(409);
    expect(seconde.json()).toMatchObject({ cle: "erreurs:conflitDeVersion" });
    const relu = await prisma.comment.findUniqueOrThrow({ where: { id: commentaire } });
    expect(relu.contenu).toBe("Fenêtre A");
    expect(relu.version).toBe(2);
  });

  it("RG-DOC-06 — renommer un document SANS version est refusé en 400, rien n'est écrit", async () => {
    const r = await appel("PATCH", `/api/documents/${document}`, auteur.jeton, { nom: "sans-version.txt" });
    expect(r.statusCode).toBe(400);
    const relu = await prisma.document.findUniqueOrThrow({ where: { id: document } });
    expect(relu.nom).toBe("plan.txt");
    expect(relu.version).toBe(1);
  });

  it("RG-DOC-06 — renommer avec la version LUE réussit, puis la même version est refusée en 409", async () => {
    const lu = await appel("GET", `/api/documents/${document}`, auteur.jeton);
    expect(lu.statusCode).toBe(200);
    const { version } = lu.json() as { version: number };

    const r = await appel("PATCH", `/api/documents/${document}`, auteur.jeton, { nom: "plan-v2.txt", version });
    expect(r.statusCode).toBe(200);
    const encore = await appel("PATCH", `/api/documents/${document}`, auteur.jeton, { nom: "plan-v3.txt", version });
    expect(encore.statusCode).toBe(409);
    expect(encore.json()).toMatchObject({ cle: "erreurs:conflitDeVersion" });
    expect((await prisma.document.findUniqueOrThrow({ where: { id: document } })).nom).toBe("plan-v2.txt");
  });
});

describe("C14, RG-AUTH-09 — une pièce jointe ne se lit pas par le détour de l'avatar", () => {
  /*
   * Avatars et pièces jointes partagent un magasin adressé par empreinte.
   * `GET /documents/:id` rendait l'empreinte à tout porteur de
   * `documents:read`, et `PATCH /auth/me` acceptait n'importe quelle chaîne
   * comme `avatarFichier` : il suffisait de se poser l'empreinte d'une image
   * jointe comme avatar pour la lire par `GET /auth/me/avatar`, sans
   * `documents:download`.
   */
  it("un observateur sans documents:download ne récupère ni l'empreinte, ni le contenu", async () => {
    const { createHash } = await import("node:crypto");
    const { ecrireContenu } = await import("./stockage.js");
    const observateur = await compte("observateur", ["documents:read"]);
    await prisma.taskAssignee.create({ data: { taskId: tacheVisible, userId: observateur.id } });

    const image = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), Buffer.from("organigramme")]);
    const empreinte = createHash("sha256").update(image).digest("hex");
    await ecrireContenu(empreinte, image);
    const { id } = await prisma.document.create({
      data: {
        nom: "organigramme.png", taskId: tacheVisible, empreinte,
        tailleOctets: image.byteLength, typeMime: "image/png", auteurId: contributeur.id,
      },
    });

    // Le téléchargement lui est refusé : c'est la règle que le détour contournait.
    expect((await appel("GET", `/api/documents/${id}/telecharger`, observateur.jeton)).statusCode).toBe(403);

    const consultation = await appel("GET", `/api/documents/${id}`, observateur.jeton);
    expect(consultation.statusCode).toBe(200);
    expect(consultation.json()).not.toHaveProperty("empreinte");
    expect(consultation.body).not.toContain(empreinte);

    const moi = await appel("GET", "/api/auth/me", observateur.jeton);
    const { version } = moi.json() as { version: number };
    const pose = await appel("PATCH", "/api/auth/me", observateur.jeton, { avatarFichier: empreinte, version });
    expect(pose.statusCode).toBe(400);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: observateur.id } })).avatarFichier).toBeNull();

    const avatar = await appel("GET", "/api/auth/me/avatar", observateur.jeton);
    expect(avatar.statusCode).toBe(404);
    expect(avatar.rawPayload.includes(Buffer.from("organigramme"))).toBe(false);
  });

  it("le dépôt d'une pièce ne rend pas non plus l'empreinte", async () => {
    const r = await appel("POST", "/api/documents", contributeur.jeton, piece(16, { projectId: projetVisible }));
    expect(r.statusCode).toBe(201);
    expect(r.json()).not.toHaveProperty("empreinte");
  });
});

describe("EX-DOC-02 — le type servi au téléchargement ne vient pas tel quel du déposant", () => {
  /*
   * `typeMime` était une chaîne libre, rendue telle quelle en `Content-Type` :
   * avec un retour chariot, le téléchargement tombait en 500 ; avec
   * `text/javascript`, la route servait un script depuis l'origine de
   * l'application.
   */
  let lecteur: Compte;

  beforeAll(async () => {
    lecteur = await compte("lecteur", ["documents:read", "documents:download"]);
    await prisma.taskAssignee.create({ data: { taskId: tacheVisible, userId: lecteur.id } });
  });

  async function deposerEnBase(nom: string, typeMime: string, contenu: string) {
    const { createHash } = await import("node:crypto");
    const { ecrireContenu } = await import("./stockage.js");
    const octets = Buffer.from(contenu);
    const empreinte = createHash("sha256").update(octets).digest("hex");
    await ecrireContenu(empreinte, octets);
    return (
      await prisma.document.create({
        data: { nom, taskId: tacheVisible, empreinte, tailleOctets: octets.byteLength, typeMime, auteurId: contributeur.id },
      })
    ).id;
  }

  it("EX-DOC-01 — un type déclaré avec CR/LF est refusé au dépôt en 400, et rien n'est écrit", async () => {
    const avant = await prisma.document.count();
    const r = await appel("POST", "/api/documents", contributeur.jeton, {
      ...piece(4, { projectId: projetVisible }),
      typeMime: "text/plain\r\nX-Injecte: 1",
    });
    expect(r.statusCode).toBe(400);
    expect(await prisma.document.count()).toBe(avant);
  });

  it("EX-DOC-01 — un type sans la forme type/sous-type est refusé au dépôt", async () => {
    const r = await appel("POST", "/api/documents", contributeur.jeton, {
      ...piece(4, { projectId: projetVisible }),
      typeMime: "pas un type",
    });
    expect(r.statusCode).toBe(400);
  });

  it("EX-DOC-02 — un document déclaré text/javascript se sert en octet-stream, nosniff et sandbox", async () => {
    const id = await deposerEnBase("outil.js", "text/javascript", "alert(document.cookie)");
    const r = await appel("GET", `/api/documents/${id}/telecharger`, lecteur.jeton);
    expect(r.statusCode).toBe(200);
    expect(r.headers["content-type"]).toBe("application/octet-stream");
    expect(r.headers["x-content-type-options"]).toBe("nosniff");
    expect(r.headers["content-security-policy"]).toBe("sandbox");
    expect(String(r.headers["content-disposition"])).toMatch(/^attachment;/);
  });

  it("EX-DOC-02 — un type hérité portant CR/LF se télécharge sans erreur interne", async () => {
    const id = await deposerEnBase("ancien.txt", "text/plain\r\nX-Injecte: 1", "ancien");
    const r = await appel("GET", `/api/documents/${id}/telecharger`, lecteur.jeton);
    expect(r.statusCode).toBe(200);
    expect(r.headers["content-type"]).toBe("application/octet-stream");
    expect(r.headers["x-injecte"]).toBeUndefined();
  });

  it("EX-DOC-02 — contre-témoin : un PDF reste servi en application/pdf", async () => {
    const id = await deposerEnBase("cahier.pdf", "application/pdf", "%PDF-1.7 cahier");
    const r = await appel("GET", `/api/documents/${id}/telecharger`, lecteur.jeton);
    expect(r.statusCode).toBe(200);
    expect(r.headers["content-type"]).toBe("application/pdf");
    expect(r.headers["content-security-policy"]).toBe("sandbox");
  });
});
