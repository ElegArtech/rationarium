import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { creerClient, type PrismaClient } from "@rationarium/db";
import { TempsService, ErreurTemps } from "./temps.service.js";
import { DocumentsService } from "../documents/documents.service.js";
import { AuditService } from "../commun/audit.service.js";
import { PerimetreService } from "../commun/perimetre.service.js";

/**
 * Les droits de l'acteur, désormais transmis au service.
 *
 * `RG-TMP-04` — « déclarer pour un tiers exige une permission dédiée » — est
 * appliquée depuis la vague 7. Ces tests déclarent pour d'autres agents : ils
 * doivent donc porter la permission, comme le ferait un encadrant réel. Ceux qui
 * prouvent le REFUS vivent dans `temps.int.test.ts`.
 */
const DROITS_ENCADRANT: ReadonlySet<string> = new Set([
  "time_tracking:read",
  "time_tracking:create",
  "time_tracking:read_team",
  "time_tracking:declare_for_third_party",
]);

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
      temps.saisir({ userId: u, date: utc("2026-03-02"), heures: 3 }, acteur, DROITS_ENCADRANT),
    ).rejects.toMatchObject({ code: "rattachement_requis" });
  });

  it("un acteur ambigu — agent ET tiers, ou ni l'un ni l'autre — est refusé", async () => {
    const u = await agent();
    const t = await prisma.thirdParty.create({ data: { type: "individual", contactNom: "X" } });
    await expect(
      temps.saisir(
        { userId: u, thirdPartyId: t.id, projectId: projet, date: utc("2026-03-02"), heures: 3 },
        acteur,
        DROITS_ENCADRANT,
      ),
    ).rejects.toMatchObject({ code: "acteur_ambigu" });
    await expect(
      temps.saisir({ projectId: projet, date: utc("2026-03-02"), heures: 3 }, acteur, DROITS_ENCADRANT),
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
      temps.saisir({ thirdPartyId: t.id, projectId: projet, date: utc("2026-03-02"), heures: 7 }, acteur, DROITS_ENCADRANT),
    ).resolves.toBeTruthy();
  });
});

describe("RG-TMP-02 — le plafond journalier, chiffré", () => {
  it("le dépassement est refusé avec le total constaté ET le plafond", async () => {
    const u = await agent();
    await temps.saisir({ userId: u, projectId: projet, date: utc("2026-04-06"), heures: 8 }, acteur, DROITS_ENCADRANT);

    const erreur = await temps
      .saisir(
        { userId: u, projectId: projet, date: utc("2026-04-06"), heures: 6 },
        acteur,
        DROITS_ENCADRANT,
      )
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
      temps.saisir({ userId: u, projectId: projet, date: utc("2026-04-07"), heures: 5 }, acteur, DROITS_ENCADRANT),
    ).rejects.toMatchObject({ code: "plafond_journalier", detail: { plafond: 4 } });

    await prisma.setting.update({
      where: { cle: "time_tracking.plafondJournalier" },
      data: { valeur: "12" },
    });
  });

  it("le plafond porte sur la JOURNÉE, pas sur la saisie", async () => {
    const u = await agent();
    // Trois saisies de 5 h le même jour : la troisième dépasse.
    await temps.saisir({ userId: u, projectId: projet, date: utc("2026-04-13"), heures: 5 }, acteur, DROITS_ENCADRANT);
    await temps.saisir({ userId: u, projectId: projet, date: utc("2026-04-13"), heures: 5 }, acteur, DROITS_ENCADRANT);
    await expect(
      temps.saisir({ userId: u, projectId: projet, date: utc("2026-04-13"), heures: 5 }, acteur, DROITS_ENCADRANT),
    ).rejects.toMatchObject({ code: "plafond_journalier" });

    // Mais le lendemain repart à zéro.
    await expect(
      temps.saisir({ userId: u, projectId: projet, date: utc("2026-04-14"), heures: 5 }, acteur, DROITS_ENCADRANT),
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
    await temps.saisir({ userId: u, projectId: projet, date: utc("2026-05-04"), heures: 2 }, acteur, DROITS_ENCADRANT);
    await temps.saisir({ userId: autre, projectId: projet, date: utc("2026-05-04"), heures: 3 }, acteur, DROITS_ENCADRANT);

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
    await temps.saisir({ userId: u, projectId: projet, date: utc("2026-06-01"), heures: 4 }, acteur, DROITS_ENCADRANT);
    await temps.saisir({ userId: u, taskId: tache.id, date: utc("2026-06-01"), heures: 3 }, acteur, DROITS_ENCADRANT);

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
      DROITS_ENCADRANT,
    );
    const p = await globalP();
    const r = await temps.rapport(p, "type", { debut: utc("2026-07-01"), fin: utc("2026-07-31") });
    expect(r.some((l) => l.cle === "meeting")).toBe(true);
  });
});

describe("EX-TMP-06, RG-TMP-06 — consulter les tâches terminées sans temps déclaré, et les valider sans déclaration", () => {
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
    await temps.saisir({ userId: a, taskId: t.id, date: utc("2026-08-03"), heures: 2 }, acteur, DROITS_ENCADRANT);
    await temps.saisir({ userId: b, taskId: t.id, date: utc("2026-08-03"), heures: 3 }, acteur, DROITS_ENCADRANT);

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

// ════════════════════════════════════════════════════════════════════════════
// Vague 7-4 — dette de traçabilité. M12 et M15.
// ════════════════════════════════════════════════════════════════════════════

describe("EX-TMP-03 — saisir du temps : date, durée, type d'activité, projet, tâche, description", () => {
  it("les six champs de l'exigence sont enregistrés, pas seulement les deux qui comptent", async () => {
    const u = await agent();
    const t = await prisma.task.create({ data: { titre: "Ourdir", projectId: projet } });

    const saisie = await temps.saisir(
      {
        userId: u,
        date: utc("2026-09-14"),
        heures: 3.5,
        typeActivite: "meeting",
        projectId: projet,
        taskId: t.id,
        description: "Comité de pilotage",
      },
      u,
    );

    const relu = await prisma.timeEntry.findUniqueOrThrow({ where: { id: saisie.id } });
    expect(relu.date.toISOString().slice(0, 10)).toBe("2026-09-14");
    expect(Number(relu.heures)).toBe(3.5);
    expect(relu.typeActivite).toBe("meeting");
    expect(relu.projectId).toBe(projet);
    expect(relu.taskId).toBe(t.id);
    expect(relu.description).toBe("Comité de pilotage");
  });

  it("le type d'activité a un défaut, il n'est jamais nul", async () => {
    const u = await agent();
    const saisie = await temps.saisir(
      { userId: u, date: utc("2026-09-15"), heures: 1, projectId: projet },
      u,
    );
    expect((await prisma.timeEntry.findUniqueOrThrow({ where: { id: saisie.id } })).typeActivite)
      .toBe("development");
  });

  it("la saisie est tracée, avec l'auteur ET la personne pour qui elle est posée", async () => {
    const u = await agent();
    const saisie = await temps.saisir(
      { userId: u, date: utc("2026-09-16"), heures: 2, projectId: projet },
      acteur,
      DROITS_ENCADRANT,
    );
    const trace = await prisma.auditLog.findFirst({
      where: { action: "time_entry.create", entiteId: saisie.id },
    });
    expect(trace!.acteurId).toBe(acteur);
    expect(JSON.stringify(trace!.detail)).toContain(u);
  });
});

describe("EX-TMP-01 — consulter ses saisies avec cumul : nombre d'entrées, total d'heures", () => {
  it("le cumul compte les ENTRÉES et somme les HEURES — deux grandeurs, pas une", async () => {
    /*
     * Le piège est celui de la fiche du tiers, qui affichait « 184 h » et
     * « sur 12 saisies » depuis un seul nombre : juste dans un libellé, faux
     * dans l'autre.
     */
    const u = await agent();
    const p = await perimetres.resoudre(u, new Set());
    await temps.saisir({ userId: u, date: utc("2026-10-01"), heures: 2.5, projectId: projet }, u);
    await temps.saisir({ userId: u, date: utc("2026-10-02"), heures: 4, projectId: projet }, u);
    await temps.saisir({ userId: u, date: utc("2026-10-03"), heures: 1.5, projectId: projet }, u);

    const { cumul } = await temps.lister(p, new Set(["time_tracking:read"]));

    expect(cumul.entrees).toBe(3);
    expect(cumul.heures).toBe(8);
  });

  it("un journal vide rend zéro et zéro — jamais NaN, jamais une liste sans total", async () => {
    const u = await agent();
    const p = await perimetres.resoudre(u, new Set());
    const { saisies, cumul } = await temps.lister(p, new Set(["time_tracking:read"]));
    expect(saisies).toEqual([]);
    expect(cumul).toMatchObject({ entrees: 0, heures: 0 });
  });
});

describe("EX-TMP-02 — filtrer par projet et par plage de dates", () => {
  it("le filtre par projet écarte l'autre projet, et le cumul suit le filtre", async () => {
    const u = await agent();
    const p = await perimetres.resoudre(u, new Set());
    const autre = await prisma.project.create({
      data: { nom: `Autre-${uuid().slice(0, 8)}`, dateDebut: utc("2026-01-01"), dateFin: utc("2026-12-31") },
    });
    await temps.saisir({ userId: u, date: utc("2026-11-02"), heures: 3, projectId: projet }, u);
    await temps.saisir({ userId: u, date: utc("2026-11-03"), heures: 5, projectId: autre.id }, u);

    const filtre = await temps.lister(p, new Set(["time_tracking:read"]), { projectId: projet });

    expect(filtre.saisies.map((s) => s.projectId)).toEqual([projet]);
    // Un cumul qui ignorerait le filtre afficherait 8 h sous une liste de 3 h.
    expect(filtre.cumul.heures).toBe(3);
  });

  it("la plage de dates est INCLUSIVE à ses deux bornes", async () => {
    /*
     * Une borne exclusive est invisible à la lecture et fausse un mois entier :
     * « du 1er au 31 » qui omet le 31 se remarque une fois par an.
     */
    const u = await agent();
    const p = await perimetres.resoudre(u, new Set());
    await temps.saisir({ userId: u, date: utc("2026-11-30"), heures: 1, projectId: projet }, u);
    await temps.saisir({ userId: u, date: utc("2026-12-01"), heures: 2, projectId: projet }, u);
    await temps.saisir({ userId: u, date: utc("2026-12-31"), heures: 3, projectId: projet }, u);
    await temps.saisir({ userId: u, date: utc("2027-01-01"), heures: 4, projectId: projet }, u);

    const decembre = await temps.lister(p, new Set(["time_tracking:read"]), {
      debut: utc("2026-12-01"),
      fin: utc("2026-12-31"),
    });

    expect(decembre.cumul.entrees).toBe(2);
    expect(decembre.cumul.heures).toBe(5);
  });
});

describe("EX-TMP-04 — supprimer une saisie", () => {
  it("la ligne disparaît, et le cumul du journal en tient compte", async () => {
    const u = await agent();
    const p = await perimetres.resoudre(u, new Set());
    const a = await temps.saisir({ userId: u, date: utc("2026-12-10"), heures: 2, projectId: projet }, u);
    await temps.saisir({ userId: u, date: utc("2026-12-11"), heures: 3, projectId: projet }, u);

    await temps.supprimer(a.id, u);

    expect(await prisma.timeEntry.findUnique({ where: { id: a.id } })).toBeNull();
    const { cumul } = await temps.lister(p, new Set(["time_tracking:read"]));
    expect(cumul).toMatchObject({ entrees: 1, heures: 3 });
  });

  it("la trace précède la suppression — après, il n'y a plus rien à nommer", async () => {
    const u = await agent();
    const s = await temps.saisir({ userId: u, date: utc("2026-12-12"), heures: 1, projectId: projet }, u);
    await temps.supprimer(s.id, u);

    const trace = await prisma.auditLog.findFirst({
      where: { action: "time_entry.delete", entiteId: s.id },
    });
    expect(trace).not.toBeNull();
    expect(trace!.acteurId).toBe(u);
  });

  it("la suppression LIBÈRE le plafond de la journée", async () => {
    /*
     * Sans cela, une saisie corrigée resterait comptée : on ne pourrait pas
     * remplacer une erreur de 8 h par une valeur juste le même jour.
     */
    const u = await agent();
    const trop = await temps.saisir({ userId: u, date: utc("2026-12-20"), heures: 12, projectId: projet }, u);
    await expect(
      temps.saisir({ userId: u, date: utc("2026-12-20"), heures: 1, projectId: projet }, u),
    ).rejects.toMatchObject({ code: "plafond_journalier" });

    await temps.supprimer(trop.id, u);

    await expect(
      temps.saisir({ userId: u, date: utc("2026-12-20"), heures: 1, projectId: projet }, u),
    ).resolves.toMatchObject({ userId: u });
  });
});

describe("EX-TMP-05 — saisir rapidement depuis le tableau de bord, au niveau de la tâche", () => {
  it("le contexte de la tâche précède la saisie, et la saisie le fait bouger", async () => {
    /*
     * « Rapidement » veut dire : sans quitter la page et sans rien choisir de
     * plus que la durée. Le rattachement se déduit donc de la TÂCHE — le
     * contexte est ce qui rend la frappe unique possible.
     */
    const u = await agent();
    const t = await prisma.task.create({ data: { titre: "Rapide", projectId: projet } });

    expect(await temps.contexteSaisieRapide(t.id)).toMatchObject({
      heuresDeclarees: 0,
      entrees: 0,
      contributeurs: 0,
    });

    await temps.saisir({ userId: u, taskId: t.id, date: utc("2026-12-22"), heures: 2 }, u);

    expect(await temps.contexteSaisieRapide(t.id)).toMatchObject({
      heuresDeclarees: 2,
      entrees: 1,
      contributeurs: 1,
    });
  });

  it("la saisie au niveau de la tâche se passe de projet — RG-TMP-01 est satisfaite par la tâche", async () => {
    const u = await agent();
    const t = await prisma.task.create({ data: { titre: "Sans projet donné", projectId: projet } });
    const s = await temps.saisir({ userId: u, taskId: t.id, date: utc("2026-12-23"), heures: 1 }, u);
    expect(s.projectId).toBeNull();
    expect(s.taskId).toBe(t.id);
  });
});

describe("RG-TMP-04 — déclarer pour un tiers exige une permission dédiée — DÉFAUT CONSIGNÉ, règle non tenue", () => {
  /*
   * DÉFAUT CONSIGNÉ, NON CORRIGÉ — ce lot n'écrit pas de code de production.
   *
   * `time_tracking:declare_for_third_party` est au catalogue de permissions
   * (`packages/contracts/src/permissions.ts`) et NOMMÉE par le cadrage
   * (`01 § 3.2`, « permissions nommées »). Elle n'est vérifiée NULLE PART :
   * `TempsController.saisir` ne garde la route que par
   * `time_tracking:create`, et `TempsService.saisir` ne reçoit même pas les
   * permissions de l'appelant. Quiconque peut saisir du temps peut en
   * déclarer pour un prestataire.
   *
   * Le contrôle exprime la règle telle qu'elle est écrite : un acteur qui ne
   * détient rien déclare pour un prestataire, et cela doit être refusé. Il
   * échoue — le service ne reçoit même pas les permissions de l'appelant, il
   * n'a donc aucun endroit où loger le refus. `RG-TMP-04` reste en dette dans
   * `design/tracabilite.json`, avec sa raison.
   */
  /*
   * **Le défaut consigné ici a été corrigé, et le marqueur a fait son travail.**
   *
   * Ce contrôle était un `it.fails` : il exprimait la règle telle qu'écrite et
   * échouait, parce que `time_tracking:declare_for_third_party` était au
   * catalogue, nommée par le cadrage, et vérifiée nulle part — le service ne
   * recevait même pas les permissions de l'appelant, il n'avait donc aucun
   * endroit où loger le refus.
   *
   * Le jour où le correctif est arrivé, il est passé au rouge (« expect test to
   * fail ») et a forcé sa propre reprise. C'est exactement ce pour quoi il était
   * posé. Il devient un test ordinaire.
   *
   * Le cas complet — collègue, tiers externe, encadrant — vit dans
   * `apps/api/src/temps/temps.int.test.ts`.
   */
  it("RG-TMP-04 — un acteur sans la permission NE déclare PAS pour un tiers", async () => {
    const quidam = await agent();
    const prestataire = await prisma.thirdParty.create({
      data: { type: "organisation", organisation: `Presta-${uuid().slice(0, 8)}` },
    });

    await expect(
      temps.saisir(
        { thirdPartyId: prestataire.id, date: utc("2026-12-28"), heures: 4, projectId: projet },
        quidam,
        new Set(["time_tracking:create"]),
      ),
    ).rejects.toMatchObject({ code: "autrui_sans_permission" });
  });
});

describe("EX-DOC-01 — joindre un document à un projet ou à une tâche", () => {
  it("sur un projet : le document porte son rattachement, sa taille et son auteur", async () => {
    const contenu = Buffer.from("Délibération du conseil");
    const doc = await documents.joindre(
      { nom: "deliberation.pdf", contenu, typeMime: "application/pdf", projectId: projet },
      acteur,
    );

    const relu = await prisma.document.findUniqueOrThrow({ where: { id: doc.id } });
    expect(relu.projectId).toBe(projet);
    expect(relu.taskId).toBeNull();
    expect(relu.auteurId).toBe(acteur);
    expect(relu.tailleOctets).toBe(contenu.byteLength);
    expect(relu.typeMime).toBe("application/pdf");
  });

  it("sur une tâche : le rattachement est l'autre, pas les deux", async () => {
    const t = await prisma.task.create({ data: { titre: "Pièce jointe", projectId: projet } });
    const doc = await documents.joindre(
      { nom: "note.txt", contenu: Buffer.from("note"), typeMime: "text/plain", taskId: t.id },
      acteur,
    );
    const relu = await prisma.document.findUniqueOrThrow({ where: { id: doc.id } });
    expect(relu.taskId).toBe(t.id);
    expect(relu.projectId).toBeNull();
  });

  it("SANS RATTACHEMENT, C'EST REFUSÉ — un document qui ne pend à rien est introuvable", async () => {
    await expect(
      documents.joindre({ nom: "orphelin.pdf", contenu: Buffer.from("x"), typeMime: "application/pdf" }, acteur),
    ).rejects.toMatchObject({ code: "rattachement_requis" });
  });
});

describe("EX-DOC-02 — consulter, télécharger, renommer, supprimer un document", () => {
  const joindre = (nom: string) =>
    documents.joindre(
      { nom, contenu: Buffer.from(nom), typeMime: "text/plain", projectId: projet },
      acteur,
    );

  it("consulter rend les métadonnées ; télécharger rend EN PLUS le chemin de stockage", async () => {
    /*
     * La distinction n'est pas cosmétique : le chemin est ce qui sort la
     * donnée du système. Le rendre à la consultation ferait du téléchargement
     * une formalité, et de sa permission dédiée une décoration.
     */
    const doc = await joindre("rapport.txt");

    const vu = await documents.consulter(doc.id, acteur);
    expect(vu).not.toHaveProperty("chemin");

    const telecharge = await documents.telecharger(doc.id, acteur);
    expect(telecharge.chemin).toBe(documents.cheminDeStockage(doc.empreinte));
  });

  it("renommer change le NOM et rien d'autre — le contenu est adressé par empreinte", async () => {
    const doc = await joindre("faute-de-frape.txt");

    await documents.renommer(doc.id, "sans-faute.txt", acteur, new Set());

    const relu = await prisma.document.findUniqueOrThrow({ where: { id: doc.id } });
    expect(relu.nom).toBe("sans-faute.txt");
    expect(relu.empreinte).toBe(doc.empreinte);
    expect(relu.tailleOctets).toBe(doc.tailleOctets);
    // `RG-GEN-07` — le renommage est une écriture : la version bouge.
    expect(relu.version).toBe(doc.version + 1);
  });

  /**
   * `RG-DOC-01` — **`supprimer` l'appliquait, `renommer` non.**
   *
   * Trouvé par l'agent qui branchait la vue 17, en lisant les deux méthodes
   * l'une après l'autre : quiconque détenait `documents:update` renommait la
   * pièce d'autrui, et le client ne masquait plus que par courtoisie — la
   * configuration exacte de l'interdit « ne jamais contrôler un droit côté
   * client seul ».
   */
  it("RG-DOC-01 — renommer le document d'AUTRUI est refusé, comme le supprimer", async () => {
    const doc = await joindre("pas-a-moi.txt");
    const intrus = await agent();

    await expect(
      documents.renommer(doc.id, "detourne.txt", intrus, new Set(["documents:update"])),
    ).rejects.toMatchObject({ code: "pas_son_contenu" });

    // Et rien n'a bougé, version comprise.
    const relu = await prisma.document.findUniqueOrThrow({ where: { id: doc.id } });
    expect(relu.nom).toBe("pas-a-moi.txt");
    expect(relu.version).toBe(doc.version);
  });

  it("RG-DOC-01 — la permission d'exception, elle, passe", async () => {
    const doc = await joindre("archive.txt");
    const bibliothecaire = await agent();
    await expect(
      documents.renommer(doc.id, "range.txt", bibliothecaire, new Set(["documents:manage_any"])),
    ).resolves.toBeUndefined();
  });

  it("RG-GEN-07 — une version périmée refuse le renommage plutôt que d'écraser", async () => {
    const doc = await joindre("concurrent.txt");
    await expect(
      documents.renommer(doc.id, "trop-tard.txt", acteur, new Set(), doc.version + 9),
    ).rejects.toMatchObject({ code: "conflit_de_version" });
  });

  it("supprimer efface la ligne, et son auteur n'a besoin d'aucune permission d'exception", async () => {
    const doc = await joindre("a-jeter.txt");
    await documents.supprimer(doc.id, acteur, new Set());
    expect(await prisma.document.findUnique({ where: { id: doc.id } })).toBeNull();
  });

  it("les quatre gestes refusent un document inconnu, aucun ne le tait", async () => {
    const inconnu = "00000000-0000-4000-8000-000000000000";
    await expect(documents.consulter(inconnu, acteur)).rejects.toMatchObject({ code: "introuvable" });
    await expect(documents.telecharger(inconnu, acteur)).rejects.toMatchObject({ code: "introuvable" });
    await expect(documents.renommer(inconnu, "x", acteur, new Set())).rejects.toMatchObject({
      code: "introuvable",
    });
    await expect(documents.supprimer(inconnu, acteur, new Set())).rejects.toMatchObject({
      code: "introuvable",
    });
  });
});

describe("EX-DOC-03 — commenter un projet ou une tâche", () => {
  it("un commentaire de projet porte son auteur et son rattachement", async () => {
    const c = await documents.commenter({ contenu: "Point d'étape", projectId: projet }, acteur);
    const relu = await prisma.comment.findUniqueOrThrow({ where: { id: c.id } });
    expect(relu.auteurId).toBe(acteur);
    expect(relu.projectId).toBe(projet);
    expect(relu.taskId).toBeNull();
    expect(relu.contenu).toBe("Point d'étape");
  });

  it("le fil d'un projet ne ramène pas les commentaires de ses tâches", async () => {
    /*
     * Deux fils distincts : mêler les deux ferait remonter dans la fiche du
     * projet une discussion de tâche, hors de son contexte.
     */
    const p = await prisma.project.create({
      data: { nom: `Fils-${uuid().slice(0, 8)}`, dateDebut: utc("2026-01-01"), dateFin: utc("2026-12-31") },
    });
    const t = await prisma.task.create({ data: { titre: "Tâche du fil", projectId: p.id } });
    await documents.commenter({ contenu: "Sur le projet", projectId: p.id }, acteur);
    await documents.commenter({ contenu: "Sur la tâche", taskId: t.id }, acteur);

    expect((await documents.fil({ projectId: p.id })).map((c) => c.contenu)).toEqual([
      "Sur le projet",
    ]);
    expect((await documents.fil({ taskId: t.id })).map((c) => c.contenu)).toEqual(["Sur la tâche"]);
  });

  it("le fil nomme l'auteur de chaque message", async () => {
    const p = await prisma.project.create({
      data: { nom: `Auteur-${uuid().slice(0, 8)}`, dateDebut: utc("2026-01-01"), dateFin: utc("2026-12-31") },
    });
    await documents.commenter({ contenu: "Signé", projectId: p.id }, acteur);
    const fil = await documents.fil({ projectId: p.id });
    expect(fil[0]!.auteur).toMatchObject({ id: acteur });
  });
});

describe("EX-DOC-04 — modifier et supprimer SES PROPRES commentaires", () => {
  it("l'auteur modifie le sien, sans permission d'exception", async () => {
    const u = await agent();
    const c = await documents.commenter({ contenu: "Avant", projectId: projet }, u);

    await documents.modifierCommentaire(c.id, "Après", u, new Set());

    const relu = await prisma.comment.findUniqueOrThrow({ where: { id: c.id } });
    expect(relu.contenu).toBe("Après");
    expect(relu.version).toBe(c.version + 1);
  });

  it("l'auteur supprime le sien", async () => {
    const u = await agent();
    const c = await documents.commenter({ contenu: "À retirer", projectId: projet }, u);
    await documents.supprimerCommentaire(c.id, u, new Set());
    expect(await prisma.comment.findUnique({ where: { id: c.id } })).toBeNull();
  });

  it("MAIS PAS CEUX D'AUTRUI : la suppression du commentaire d'un autre est refusée", async () => {
    const auteur = await agent();
    const intrus = await agent();
    const c = await documents.commenter({ contenu: "Le mien", projectId: projet }, auteur);

    await expect(
      documents.supprimerCommentaire(c.id, intrus, new Set()),
    ).rejects.toMatchObject({ code: "pas_son_contenu" });
    expect(await prisma.comment.findUnique({ where: { id: c.id } })).not.toBeNull();
  });

  it("un commentaire inconnu est refusé, il n'est pas « déjà supprimé »", async () => {
    const inconnu = "00000000-0000-4000-8000-000000000000";
    await expect(
      documents.modifierCommentaire(inconnu, "x", acteur, new Set()),
    ).rejects.toMatchObject({ code: "introuvable" });
    await expect(
      documents.supprimerCommentaire(inconnu, acteur, new Set()),
    ).rejects.toMatchObject({ code: "introuvable" });
  });
});
