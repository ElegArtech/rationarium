import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { creerClient, type PrismaClient } from "@rationarium/db";
import { TempsService, ErreurTemps } from "./temps.service.js";
import { DocumentsService } from "../documents/documents.service.js";
import { AuditService } from "../commun/audit.service.js";
import { PerimetreService } from "../commun/perimetre.service.js";

/** L-18 et L-19 — temps passé, documents et commentaires. */

const RACINE_DB = path.resolve(import.meta.dirname, "../../../../packages/db");
const utc = (s: string) => new Date(`${s}T00:00:00.000Z`);

let pg: StartedPostgreSqlContainer;
let prisma: PrismaClient;
let temps: TempsService;
let documents: DocumentsService;
let perimetres: PerimetreService;
let acteur: string;
let projet: string;

const uuid = () => crypto.randomUUID();

async function agent() {
  const id = uuid();
  await prisma.user.create({
    data: {
      id, login: `u-${id.slice(0, 8)}`, email: `${id.slice(0, 8)}@x.fr`,
      motDePasseHash: "x", prenom: "A", nom: "T",
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
  temps = new TempsService(prisma as never, audit, perimetres);
  documents = new DocumentsService(prisma as never, audit);

  acteur = await agent();
  projet = uuid();
  await prisma.project.create({
    data: {
      id: projet, nom: `P-${projet.slice(0, 8)}`,
      dateDebut: utc("2026-01-01"), dateFin: utc("2026-12-31"),
    },
  });
}, 240_000);

afterAll(async () => {
  await prisma?.$disconnect();
  await pg?.stop();
});

const globalP = () => perimetres.resoudre(acteur, new Set(["users:manage_any"]));

// ══════════════════════════════ L-18 — Temps passé ═════════════════════════

describe("RG-TMP-01, RG-TMP-03 — forme d'une saisie", () => {
  it("une saisie sans tâche ni projet est refusée", async () => {
    const u = await agent();
    await expect(
      temps.saisir({ userId: u, date: utc("2026-03-02"), heures: 3 }, acteur),
    ).rejects.toMatchObject({ code: "rattachement_requis" });
  });

  it("un acteur ambigu — agent ET tiers, ou ni l'un ni l'autre — est refusé", async () => {
    const u = await agent();
    const t = await prisma.thirdParty.create({ data: { type: "individual", contactNom: "X" } });
    await expect(
      temps.saisir(
        { userId: u, thirdPartyId: t.id, projectId: projet, date: utc("2026-03-02"), heures: 3 },
        acteur,
      ),
    ).rejects.toMatchObject({ code: "acteur_ambigu" });
    await expect(
      temps.saisir({ projectId: projet, date: utc("2026-03-02"), heures: 3 }, acteur),
    ).rejects.toMatchObject({ code: "acteur_ambigu" });
  });

  it("l'acteur n'est PAS modifiable après création", async () => {
    // Corriger l'acteur en place réécrirait l'histoire de deux personnes.
    await expect(temps.modifierActeur()).rejects.toMatchObject({
      code: "acteur_non_modifiable",
    });
  });

  it("EX-TMP-08 — déclarer pour un tiers externe", async () => {
    const t = await prisma.thirdParty.create({ data: { type: "individual", contactNom: "Presta" } });
    await expect(
      temps.saisir({ thirdPartyId: t.id, projectId: projet, date: utc("2026-03-02"), heures: 7 }, acteur),
    ).resolves.toBeTruthy();
  });
});

describe("RG-TMP-02 — le plafond journalier, chiffré", () => {
  it("le dépassement est refusé avec le total constaté ET le plafond", async () => {
    const u = await agent();
    await temps.saisir({ userId: u, projectId: projet, date: utc("2026-04-06"), heures: 8 }, acteur);

    const erreur = await temps
      .saisir({ userId: u, projectId: projet, date: utc("2026-04-06"), heures: 6 }, acteur)
      .catch((e: ErreurTemps) => e);

    expect((erreur as ErreurTemps).code).toBe("plafond_journalier");
    // Refuser sans dire combien on a déjà déclaré oblige l'agent à recompter.
    expect((erreur as ErreurTemps).detail).toMatchObject({
      dejaDeclare: 8, demande: 6, total: 14, plafond: 12,
    });
  });

  it("le plafond est un PARAMÈTRE — parti pris n° 3", async () => {
    await prisma.setting.upsert({
      where: { cle: "time_tracking.plafondJournalier" },
      create: { cle: "time_tracking.plafondJournalier", valeur: "4" },
      update: { valeur: "4" },
    });
    const u = await agent();
    await expect(
      temps.saisir({ userId: u, projectId: projet, date: utc("2026-04-07"), heures: 5 }, acteur),
    ).rejects.toMatchObject({ code: "plafond_journalier", detail: { plafond: 4 } });

    await prisma.setting.update({
      where: { cle: "time_tracking.plafondJournalier" },
      data: { valeur: "12" },
    });
  });

  it("le plafond porte sur la JOURNÉE, pas sur la saisie", async () => {
    const u = await agent();
    // Trois saisies de 5 h le même jour : la troisième dépasse.
    await temps.saisir({ userId: u, projectId: projet, date: utc("2026-04-13"), heures: 5 }, acteur);
    await temps.saisir({ userId: u, projectId: projet, date: utc("2026-04-13"), heures: 5 }, acteur);
    await expect(
      temps.saisir({ userId: u, projectId: projet, date: utc("2026-04-13"), heures: 5 }, acteur),
    ).rejects.toMatchObject({ code: "plafond_journalier" });

    // Mais le lendemain repart à zéro.
    await expect(
      temps.saisir({ userId: u, projectId: projet, date: utc("2026-04-14"), heures: 5 }, acteur),
    ).resolves.toBeTruthy();
  });
});

describe("RG-TMP-05 — filtrer sur autrui exige une permission", () => {
  it("sans permission, c'est refusé", async () => {
    const u = await agent();
    const autre = await agent();
    const p = await perimetres.resoudre(u, new Set());
    await expect(temps.lister(p, new Set(), { userId: autre })).rejects.toMatchObject({
      code: "hors_perimetre",
    });
  });

  it("avec la permission, la lecture reste bornée au périmètre", async () => {
    const u = await agent();
    const p = await perimetres.resoudre(u, new Set());
    await expect(
      temps.lister(p, new Set(["time_tracking:read_team"]), { userId: u }),
    ).resolves.toBeTruthy();
  });

  it("sans filtre, on ne voit que ses propres saisies", async () => {
    const u = await agent();
    const autre = await agent();
    await temps.saisir({ userId: u, projectId: projet, date: utc("2026-05-04"), heures: 2 }, acteur);
    await temps.saisir({ userId: autre, projectId: projet, date: utc("2026-05-04"), heures: 3 }, acteur);

    const p = await perimetres.resoudre(u, new Set());
    const r = await temps.lister(p, new Set());
    expect(r.saisies.every((s) => s.userId === u)).toBe(true);
    expect(r.cumul.heures).toBe(2);
  });
});

describe("EX-TMP-07 — rapports agrégés en base", () => {
  it("par projet, en nommant le hors-projet", async () => {
    const u = await agent();
    const tache = await prisma.task.create({ data: { titre: "Hors projet" } });
    await temps.saisir({ userId: u, projectId: projet, date: utc("2026-06-01"), heures: 4 }, acteur);
    await temps.saisir({ userId: u, taskId: tache.id, date: utc("2026-06-01"), heures: 3 }, acteur);

    const p = await globalP();
    const r = await temps.rapport(p, "projet", { debut: utc("2026-06-01"), fin: utc("2026-06-30") });
    // Parti pris n° 2 : le hors-projet est nommé, jamais laissé vide.
    expect(r.some((l) => l.libelle === "Hors projet")).toBe(true);
  });

  it("par type d'activité", async () => {
    const u = await agent();
    await temps.saisir(
      { userId: u, projectId: projet, date: utc("2026-07-06"), heures: 2, typeActivite: "meeting" },
      acteur,
    );
    const p = await globalP();
    const r = await temps.rapport(p, "type", { debut: utc("2026-07-01"), fin: utc("2026-07-31") });
    expect(r.some((l) => l.cle === "meeting")).toBe(true);
  });
});

describe("RG-TMP-06 — distinguer « oublié » de « rien à déclarer »", () => {
  it("une tâche terminée sans temps ressort dans la liste", async () => {
    const u = await agent();
    const t = await prisma.task.create({
      data: { titre: "Terminée", projectId: projet, statut: "done", assignes: { create: { userId: u } } },
    });
    const liste = await temps.tachesNonDeclarees(u);
    expect(liste.map((x) => x.id)).toContain(t.id);
  });

  it("une fois validée sans déclaration, elle en sort", async () => {
    const u = await agent();
    const t = await prisma.task.create({
      data: { titre: "Rien à déclarer", projectId: projet, statut: "done", assignes: { create: { userId: u } } },
    });
    await temps.validerSansDeclaration(t.id, u, u);

    // Sans cette trace, la liste ressortirait indéfiniment et finirait ignorée.
    const liste = await temps.tachesNonDeclarees(u);
    expect(liste.map((x) => x.id)).not.toContain(t.id);
  });

  it("RG-TMP-07 — la saisie rapide compte TOUS les contributeurs", async () => {
    const a = await agent();
    const b = await agent();
    const t = await prisma.task.create({ data: { titre: "Partagée", projectId: projet } });
    await temps.saisir({ userId: a, taskId: t.id, date: utc("2026-08-03"), heures: 2 }, acteur);
    await temps.saisir({ userId: b, taskId: t.id, date: utc("2026-08-03"), heures: 3 }, acteur);

    const ctx = await temps.contexteSaisieRapide(t.id);
    // Savoir que quelqu'un d'autre a déjà déclaré évite les doubles saisies.
    expect(ctx.heuresDeclarees).toBe(5);
    expect(ctx.contributeurs).toBe(2);
  });
});

// ═══════════════════════ L-19 — Documents et commentaires ══════════════════

describe("C14 — le stockage est adressé par EMPREINTE, jamais par nom", () => {
  it("le chemin dérive de l'empreinte, réparti sur deux niveaux", async () => {
    const chemin = documents.cheminDeStockage("abcdef0123456789");
    expect(chemin).toBe("ab/cd/abcdef0123456789");
  });

  it("deux fichiers homonymes ne se écrasent pas", async () => {
    const a = await documents.joindre(
      { nom: "rapport.pdf", contenu: Buffer.from("contenu A"), typeMime: "application/pdf", projectId: projet },
      acteur,
    );
    const b = await documents.joindre(
      { nom: "rapport.pdf", contenu: Buffer.from("contenu B"), typeMime: "application/pdf", projectId: projet },
      acteur,
    );
    expect(a.empreinte).not.toBe(b.empreinte);
    expect(documents.cheminDeStockage(a.empreinte)).not.toBe(
      documents.cheminDeStockage(b.empreinte),
    );
  });

  it("un nom hostile ne participe pas au chemin", async () => {
    const d = await documents.joindre(
      {
        nom: "../../etc/passwd", contenu: Buffer.from("x"),
        typeMime: "text/plain", projectId: projet,
      },
      acteur,
    );
    // Le nom reste une métadonnée d'affichage ; il ne peut pas s'échapper.
    expect(documents.cheminDeStockage(d.empreinte)).not.toContain("..");
    expect(d.nom).toBe("../../etc/passwd");
  });
});

describe("RG-DOC-02 — lecture ET téléchargement sont tracés", () => {
  it("la consultation laisse une trace", async () => {
    const d = await documents.joindre(
      { nom: "note.txt", contenu: Buffer.from("n"), typeMime: "text/plain", projectId: projet },
      acteur,
    );
    const lecteur = await agent();
    await documents.consulter(d.id, lecteur);

    const trace = await prisma.auditLog.findFirst({
      where: { action: "document.read", entiteId: d.id },
    });
    expect(trace?.acteurId).toBe(lecteur);
  });

  it("le téléchargement est tracé DISTINCTEMENT de la consultation", async () => {
    const d = await documents.joindre(
      { nom: "export.csv", contenu: Buffer.from("a;b"), typeMime: "text/csv", projectId: projet },
      acteur,
    );
    const lecteur = await agent();
    await documents.consulter(d.id, lecteur);
    await documents.telecharger(d.id, lecteur);

    const actions = (
      await prisma.auditLog.findMany({ where: { entiteId: d.id } })
    ).map((t) => t.action);

    // Consulter et télécharger ne sont pas le même geste : le second sort la
    // donnée du système. Les confondre les rendrait indiscernables.
    expect(actions).toContain("document.read");
    expect(actions).toContain("document.download");
  });

  it("la création et la suppression sont tracées aussi", async () => {
    const d = await documents.joindre(
      { nom: "temporaire.txt", contenu: Buffer.from("t"), typeMime: "text/plain", taskId: null, projectId: projet },
      acteur,
    );
    await documents.supprimer(d.id, acteur, new Set());
    const actions = (
      await prisma.auditLog.findMany({ where: { entiteId: d.id } })
    ).map((t) => t.action);
    expect(actions).toContain("document.create");
    expect(actions).toContain("document.delete");
  });
});

describe("RG-DOC-01 — on agit sur SES contributions", () => {
  it("supprimer le document d'autrui est refusé sans permission", async () => {
    const auteur = await agent();
    const intrus = await agent();
    const d = await documents.joindre(
      { nom: "privé.txt", contenu: Buffer.from("p"), typeMime: "text/plain", projectId: projet },
      auteur,
    );
    await expect(documents.supprimer(d.id, intrus, new Set())).rejects.toMatchObject({
      code: "pas_son_contenu",
    });
    await expect(
      documents.supprimer(d.id, intrus, new Set(["documents:manage_any"])),
    ).resolves.toBeUndefined();
  });

  it("modifier le commentaire d'autrui est refusé sans permission", async () => {
    const auteur = await agent();
    const intrus = await agent();
    const c = await documents.commenter({ contenu: "Le mien", projectId: projet }, auteur);

    await expect(
      documents.modifierCommentaire(c.id, "Détourné", intrus, new Set()),
    ).rejects.toMatchObject({ code: "pas_son_contenu" });

    await expect(
      documents.modifierCommentaire(c.id, "Corrigé", auteur, new Set()),
    ).resolves.toBeUndefined();
  });

  it("un commentaire sans rattachement est refusé", async () => {
    await expect(documents.commenter({ contenu: "Orphelin" }, acteur)).rejects.toMatchObject({
      code: "rattachement_requis",
    });
  });

  it("le fil est ordonné du plus ancien au plus récent", async () => {
    const tache = await prisma.task.create({ data: { titre: "Fil", projectId: projet } });
    await documents.commenter({ contenu: "Premier", taskId: tache.id }, acteur);
    await documents.commenter({ contenu: "Second", taskId: tache.id }, acteur);
    const fil = await documents.fil({ taskId: tache.id });
    expect(fil.map((c) => c.contenu)).toEqual(["Premier", "Second"]);
  });
});
