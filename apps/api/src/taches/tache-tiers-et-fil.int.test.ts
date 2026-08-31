import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { creerClient, type PrismaClient } from "@rationarium/db";
import { TachesService } from "./taches.service.js";
import { TiersService, ErreurTiers } from "../tiers/tiers.service.js";
import { DocumentsService } from "../documents/documents.service.js";
import { AuditService } from "../commun/audit.service.js";
import { NotificationsService } from "../notifications/notifications.service.js";
import { FileService } from "../notifications/file.service.js";
import { PerimetreService } from "../commun/perimetre.service.js";

/**
 * `EX-TSK-16` et `EX-TSK-17` — ce qui vient se GREFFER sur une tâche.
 *
 * Ces deux exigences sont énoncées au domaine des tâches et exécutées ailleurs :
 * le tiers par `TiersService`, le commentaire et la pièce jointe par
 * `DocumentsService`. C'est précisément ce qui les rendait invisibles à tout
 * test — chaque module éprouvait sa moitié, aucun n'éprouvait le raccord.
 *
 * Le raccord, ici, c'est la **fiche de la tâche** : elle est le seul endroit
 * où l'utilisateur voit un tiers assigné, un commentaire écrit ou un document
 * joint. Une greffe qui n'y remonte pas n'existe pas pour l'exigence, même si
 * la ligne est en base.
 */

const RACINE_DB = path.resolve(import.meta.dirname, "../../../../packages/db");
const uuid = () => crypto.randomUUID();

let pg: StartedPostgreSqlContainer;
let prisma: PrismaClient;
let taches: TachesService;
let tiers: TiersService;
let documents: DocumentsService;
let perimetres: PerimetreService;
let acteur: string;

const TOUTES = new Set(["tasks:manage_any", "tasks:read_confidential"]) as ReadonlySet<string>;
const perimetreGlobal = () => perimetres.resoudre(acteur, new Set(["tasks:manage_any"]));

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

async function tiersExterne(actif = true) {
  const t = await prisma.thirdParty.create({
    data: { type: "organisation", organisation: `Presta ${uuid().slice(0, 6)}`, actif },
  });
  return t.id;
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
  taches = new TachesService(
    prisma as never,
    audit,
    perimetres,
    new NotificationsService(prisma as never, new FileService()),
  );
  tiers = new TiersService(prisma as never, audit);
  documents = new DocumentsService(prisma as never, audit);
  acteur = await agent();
}, 240_000);

afterAll(async () => {
  await prisma?.$disconnect();
  await pg?.stop();
});

// ════════════════════════════════════════════════════════════════════════════

describe("EX-TSK-16 — assigner un TIERS EXTERNE à une tâche", () => {
  it("EX-TSK-16 — le tiers assigné REMONTE SUR LA FICHE de la tâche", async () => {
    const t = await taches.creer({ titre: "Audit réseau" }, acteur);
    const externe = await tiersExterne();

    // Avant : la fiche ne montre aucun tiers. Sans cette moitié, l'assertion
    // d'après passerait sur une fiche qui les montrerait tous.
    const avant = await taches.fiche(t.id, await perimetreGlobal(), TOUTES);
    expect(avant.tiers).toEqual([]);

    await tiers.assignerALaTache(t.id, externe, acteur);

    const apres = await taches.fiche(t.id, await perimetreGlobal(), TOUTES);
    expect(apres.tiers.map((x) => x.id)).toEqual([externe]);
    expect(apres.tiers[0]?.organisation).toMatch(/^Presta /);
  });

  it("EX-TSK-16 — la liste de candidats propose le tiers, puis CESSE de le proposer", async () => {
    /*
     * « Assigner » suppose qu'on puisse choisir : un geste sans liste de
     * candidats n'est pas un geste. Et la liste doit dire la même chose que
     * l'écriture — proposer ce que le serveur refusera est une promesse non
     * tenue.
     */
    const t = await taches.creer({ titre: "Câblage" }, acteur);
    const externe = await tiersExterne();

    const avant = await tiers.candidatsPourTache(t.id);
    expect(avant.map((c) => c.id)).toContain(externe);

    await tiers.assignerALaTache(t.id, externe, acteur);

    const apres = await tiers.candidatsPourTache(t.id);
    expect(apres.map((c) => c.id)).not.toContain(externe);
    await expect(tiers.assignerALaTache(t.id, externe, acteur)).rejects.toBeInstanceOf(ErreurTiers);
  });

  it("EX-TSK-16 — sur une tâche DE PROJET, seul un tiers rattaché au projet est assignable", async () => {
    const projet = await prisma.project.create({
      data: {
        nom: `P-${uuid().slice(0, 6)}`,
        dateDebut: new Date("2026-01-01T00:00:00.000Z"),
        dateFin: new Date("2026-12-31T00:00:00.000Z"),
      },
    });
    const t = await taches.creer({ titre: "Lot 1", projectId: projet.id }, acteur);
    const etranger = await tiersExterne();
    const rattache = await tiersExterne();
    await prisma.projectThirdParty.create({
      data: { projectId: projet.id, thirdPartyId: rattache },
    });

    await expect(
      tiers.assignerALaTache(t.id, etranger, acteur),
    ).rejects.toMatchObject({ code: "non_rattache_au_projet" });
    expect((await tiers.candidatsPourTache(t.id)).map((c) => c.id)).toEqual([rattache]);

    await tiers.assignerALaTache(t.id, rattache, acteur);
    const fiche = await taches.fiche(t.id, await perimetreGlobal(), TOUTES);
    expect(fiche.tiers.map((x) => x.id)).toEqual([rattache]);
  });
});

describe("EX-TSK-17 — commenter et joindre des documents", () => {
  it("EX-TSK-17 — le commentaire remonte sur la fiche, avec SON AUTEUR et dans l'ordre", async () => {
    const auteur = await agent();
    const second = await agent();
    const t = await taches.creer({ titre: "Note de cadrage" }, acteur);

    const fraiche = await taches.fiche(t.id, await perimetreGlobal(), TOUTES);
    expect(fraiche.commentaires).toEqual([]);

    await documents.commenter({ contenu: "Premier point", taskId: t.id }, auteur);
    await documents.commenter({ contenu: "Second point", taskId: t.id }, second);

    const fiche = await taches.fiche(t.id, await perimetreGlobal(), TOUTES);
    // L'ordre est celui de l'écriture : un fil qui se réordonne est un fil
    // qu'on ne peut plus suivre.
    expect(fiche.commentaires.map((c) => c.contenu)).toEqual(["Premier point", "Second point"]);
    // `auteur` est nullable au schéma — un compte supprimé laisse son fil.
    // L'optionnel n'affaiblit pas l'assertion : un auteur perdu rendrait
    // `undefined`, et l'égalité tomberait.
    expect(fiche.commentaires.map((c) => c.auteur?.id)).toEqual([auteur, second]);
  });

  it("EX-TSK-17 — un commentaire d'UNE AUTRE tâche ne se glisse pas dans le fil", async () => {
    const a = await taches.creer({ titre: "A" }, acteur);
    const b = await taches.creer({ titre: "B" }, acteur);
    await documents.commenter({ contenu: "Pour A", taskId: a.id }, acteur);
    await documents.commenter({ contenu: "Pour B", taskId: b.id }, acteur);

    const fiche = await taches.fiche(a.id, await perimetreGlobal(), TOUTES);
    expect(fiche.commentaires.map((c) => c.contenu)).toEqual(["Pour A"]);
  });

  it("EX-TSK-17 — le document joint remonte sur la fiche, avec sa taille et son auteur", async () => {
    const auteur = await agent();
    const t = await taches.creer({ titre: "Compte rendu" }, acteur);
    const contenu = Buffer.from("compte rendu du 3 mars");

    await documents.joindre(
      { nom: "cr.txt", contenu, typeMime: "text/plain", taskId: t.id },
      auteur,
    );

    const fiche = await taches.fiche(t.id, await perimetreGlobal(), TOUTES);
    expect(fiche.documents).toHaveLength(1);
    expect(fiche.documents[0]?.nom).toBe("cr.txt");
    expect(fiche.documents[0]?.tailleOctets).toBe(contenu.byteLength);
    expect(fiche.documents[0]?.typeMime).toBe("text/plain");
  });

  it("EX-TSK-17 — un document joint AU PROJET n'apparaît pas sur la fiche de la tâche", async () => {
    /*
     * `joindre` accepte l'un ou l'autre rattachement. S'ils se mélangeaient,
     * la fiche d'une tâche déverserait toutes les pièces du projet — et
     * l'assertion précédente passerait quand même.
     */
    const projet = await prisma.project.create({
      data: {
        nom: `P-${uuid().slice(0, 6)}`,
        dateDebut: new Date("2026-01-01T00:00:00.000Z"),
        dateFin: new Date("2026-12-31T00:00:00.000Z"),
      },
    });
    const t = await taches.creer({ titre: "Lot", projectId: projet.id }, acteur);
    await documents.joindre(
      { nom: "charte.pdf", contenu: Buffer.from("%PDF"), typeMime: "application/pdf", projectId: projet.id },
      acteur,
    );

    const fiche = await taches.fiche(t.id, await perimetreGlobal(), TOUTES);
    expect(fiche.documents).toEqual([]);
  });
});
