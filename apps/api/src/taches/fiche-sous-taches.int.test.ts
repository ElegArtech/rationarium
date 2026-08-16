import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { creerClient, type PrismaClient } from "@trame/db";
import { TachesService } from "./taches.service.js";
import { AuditService } from "../commun/audit.service.js";
import { NotificationsService } from "../notifications/notifications.service.js";
import { FileService } from "../notifications/file.service.js";
import { PerimetreService } from "../commun/perimetre.service.js";

/**
 * L-33 — les points d'entrée ajoutés pour les vues 12, 16 et 17 : fiche
 * agrégée, modification versionnée, sous-tâches ordonnées.
 */

const RACINE_DB = path.resolve(import.meta.dirname, "../../../../packages/db");
const utc = (s: string) => new Date(`${s}T00:00:00.000Z`);

let pg: StartedPostgreSqlContainer;
let prisma: PrismaClient;
let taches: TachesService;
let acteur: string;
let projet: string;

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

const tache = (titre: string, donnees: Record<string, unknown> = {}) =>
  prisma.task.create({ data: { titre, projectId: projet, ...donnees } });

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
  taches = new TachesService(
    prisma as never,
    new AuditService(prisma as never),
    new PerimetreService(prisma as never),
    notifications,
  );
  acteur = await agent("Acteur", "Test");
  const p = await prisma.project.create({
    data: { nom: "Projet des tâches", dateDebut: utc("2026-01-01"), dateFin: utc("2026-12-31") },
  });
  projet = p.id;
}, 240_000);

afterAll(async () => {
  await prisma?.$disconnect();
  await pg?.stop();
});

describe("EX-TSK-13 — la fiche rassemble les objets liés", () => {
  it("elle porte sous-tâches, dépendances des deux côtés, RACI et commentaires", async () => {
    const a = await agent("Ana", "Lyste");
    const t = await tache("Tâche centrale", {
      description: "Un objet dense.",
      assignes: { create: { userId: a } },
    });
    const prerequis = await tache("Ce qui précède", { dateFin: utc("2026-05-01") });
    const suivante = await tache("Ce qui suit", { dateDebut: utc("2026-06-01") });

    await taches.ajouterDependance(t.id, prerequis.id, acteur);
    await taches.ajouterDependance(suivante.id, t.id, acteur);
    await taches.attribuerRaci(t.id, a, "responsible", acteur);
    await taches.ajouterSousTache(t.id, "Première étape", acteur);
    await prisma.comment.create({ data: { contenu: "Un mot", taskId: t.id, auteurId: a } });

    const fiche = await taches.fiche(t.id);

    expect(fiche.sousTaches).toHaveLength(1);
    expect(fiche.raci[0]?.role).toBe("responsible");
    expect(fiche.commentaires).toHaveLength(1);
    // Les deux sens sont distincts : « dépend de » n'est pas « bloque ».
    expect(fiche.dependances.dependDe.map((x) => x.titre)).toEqual(["Ce qui précède"]);
    expect(fiche.dependances.bloque.map((x) => x.titre)).toEqual(["Ce qui suit"]);
  });

  it("une tâche inexistante est refusée, pas rendue vide", async () => {
    await expect(taches.fiche(crypto.randomUUID())).rejects.toMatchObject({
      code: "introuvable",
    });
  });

  it("le hors-projet est NOMMÉ, pas déduit d'un champ vide", async () => {
    const t = await prisma.task.create({ data: { titre: "Réunion transverse" } });
    const fiche = await taches.fiche(t.id);
    expect(fiche.horsProjet).toBe(true);
    expect(fiche.project).toBeNull();
  });
});

describe("RG-GEN-07 — la concurrence est détectée, jamais écrasée", () => {
  it("une version périmée est refusée en conflit", async () => {
    const t = await tache("Éditée à deux");

    await taches.modifier(t.id, { version: t.version, titre: "Première écriture" }, acteur);

    // Le second éditeur a lu la version 1 : son écriture ne doit pas passer.
    await expect(
      taches.modifier(t.id, { version: t.version, titre: "Seconde écriture" }, acteur),
    ).rejects.toMatchObject({ code: "conflit_de_version" });

    const apres = await prisma.task.findUniqueOrThrow({ where: { id: t.id } });
    expect(apres.titre).toBe("Première écriture");
  });

  it("le refus dit la version attendue et celle reçue", async () => {
    const t = await tache("Conflit chiffré");
    await taches.modifier(t.id, { version: 1, statut: "doing" }, acteur);

    const erreur: unknown = await taches
      .modifier(t.id, { version: 1, statut: "done" }, acteur)
      .then(() => null, (e: unknown) => e);

    // Le chiffre est le message utile : « conflit » sans les deux versions
    // laisse l'utilisateur deviner s'il a lu trop tôt ou trop tard.
    expect((erreur as { detail?: unknown }).detail).toMatchObject({ attendue: 2, recue: 1 });
  });

  it("la version s'incrémente à chaque écriture", async () => {
    const t = await tache("Compteur");
    const un = await taches.modifier(t.id, { version: 1, avancement: 30 }, acteur);
    expect(un.version).toBe(2);
    const deux = await taches.modifier(t.id, { version: 2, avancement: 60 }, acteur);
    expect(deux.version).toBe(3);
  });

  it("une fin antérieure au début est refusée", async () => {
    const t = await tache("Dates inversées");
    await expect(
      taches.modifier(
        t.id,
        { version: 1, dateDebut: utc("2026-09-01"), dateFin: utc("2026-08-01") },
        acteur,
      ),
    ).rejects.toMatchObject({ code: "dates_incoherentes" });
  });
});

describe("EX-TSK-09 — les sous-tâches portent un ordre explicite", () => {
  it("elles s'ajoutent à la suite, jamais en tête", async () => {
    const t = await tache("Liste ordonnée");
    await taches.ajouterSousTache(t.id, "Un", acteur);
    await taches.ajouterSousTache(t.id, "Deux", acteur);
    await taches.ajouterSousTache(t.id, "Trois", acteur);

    const fiche = await taches.fiche(t.id);
    expect(fiche.sousTaches.map((s) => s.libelle)).toEqual(["Un", "Deux", "Trois"]);
    expect(fiche.sousTaches.map((s) => s.ordre)).toEqual([0, 1, 2]);
  });

  it("le réordonnancement ne viole pas l'unicité (taskId, ordre)", async () => {
    const t = await tache("Réordonnée");
    const a = await taches.ajouterSousTache(t.id, "A", acteur);
    const b = await taches.ajouterSousTache(t.id, "B", acteur);
    const c = await taches.ajouterSousTache(t.id, "C", acteur);

    // Échanger deux rangs en écriture directe violerait la contrainte : c'est
    // pourquoi le service décale hors plage avant de réécrire.
    const apres = await taches.reordonnerSousTaches(t.id, [c.id, a.id, b.id]);
    expect(apres.map((s) => s.libelle)).toEqual(["C", "A", "B"]);
    expect(apres.map((s) => s.ordre)).toEqual([0, 1, 2]);
  });

  it("cocher une sous-tâche ne touche pas les autres", async () => {
    const t = await tache("Cases");
    const a = await taches.ajouterSousTache(t.id, "À faire", acteur);
    await taches.ajouterSousTache(t.id, "Intacte", acteur);

    await taches.basculerSousTache(a.id, true);
    const fiche = await taches.fiche(t.id);
    expect(fiche.sousTaches.map((s) => s.fait)).toEqual([true, false]);
  });

  it("supprimer une sous-tâche laisse les rangs utilisables", async () => {
    const t = await tache("Suppression");
    const a = await taches.ajouterSousTache(t.id, "A", acteur);
    await taches.ajouterSousTache(t.id, "B", acteur);
    await taches.supprimerSousTache(a.id);

    // Le rang 0 est libre : une nouvelle sous-tâche prend le rang suivant du
    // maximum, pas le premier trou — l'ordre reste celui de l'ajout.
    const c = await taches.ajouterSousTache(t.id, "C", acteur);
    expect(c.ordre).toBe(2);
  });
});

describe("EX-TSK-11, EX-TSK-14 — retirer un lien", () => {
  it("retirer une dépendance libère la suppression", async () => {
    const t = await tache("Prérequise");
    const dependante = await tache("Dépendante");
    await taches.ajouterDependance(dependante.id, t.id, acteur);

    await expect(taches.supprimer(t.id, acteur)).rejects.toMatchObject({
      code: "supprimee_avec_dependantes",
    });

    await taches.retirerDependance(dependante.id, t.id, acteur);
    await expect(taches.supprimer(t.id, acteur)).resolves.toBeUndefined();
  });

  it("retirer un rôle RACI n'enlève pas les autres rôles de la personne", async () => {
    const t = await tache("RACI multiple");
    const a = await agent("Poly", "Valente");
    await taches.attribuerRaci(t.id, a, "responsible", acteur);
    await taches.attribuerRaci(t.id, a, "consulted", acteur);

    await taches.retirerRaci(t.id, a, "responsible", acteur);
    const fiche = await taches.fiche(t.id);
    expect(fiche.raci.map((r) => r.role)).toEqual(["consulted"]);
  });

  it("le retrait de dépendance est tracé", async () => {
    const t = await tache("Trace");
    const p = await tache("Son prérequis");
    await taches.ajouterDependance(t.id, p.id, acteur);
    await taches.retirerDependance(t.id, p.id, acteur);

    const trace = await prisma.auditLog.findFirst({
      where: { action: "task.dependency_remove", entiteId: t.id },
    });
    expect(trace?.acteurId).toBe(acteur);
  });
});
