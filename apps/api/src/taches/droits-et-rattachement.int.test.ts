import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { creerClient, type PrismaClient } from "@rationarium/db";
import { TachesService, ErreurTache } from "./taches.service.js";
import { AuditService } from "../commun/audit.service.js";
import { NotificationsService } from "../notifications/notifications.service.js";
import { FileService } from "../notifications/file.service.js";
import { PerimetreService, type Perimetre } from "../commun/perimetre.service.js";

/**
 * Les cinq trous de la vague 7-5, plus les deux écritures d'ensemble sans
 * version. Tous **trouvés par sonde, aucun par un test rouge** : c'est la
 * famille de défauts la plus coûteuse du dépôt, celle qui survit à toutes les
 * boucles vertes parce qu'une fonctionnalité absente ne fait échouer personne.
 *
 * Chaque suite ici sépare volontairement les droits : un acteur qui détient
 * exactement ce que la règle discute, et rien de plus. Passer `manage_any`
 * partout, comme le font les autres suites du module, rendrait ces tests verts
 * **avec et sans les correctifs** — c'est le faux témoin consigné dans
 * `CLAUDE.md`, et il est d'autant plus dangereux qu'il a l'air plus robuste.
 */

const RACINE_DB = path.resolve(import.meta.dirname, "../../../../packages/db");
const uuid = () => crypto.randomUUID();

let pg: StartedPostgreSqlContainer;
let prisma: PrismaClient;
let taches: TachesService;
let perimetres: PerimetreService;

/** Les deux droits de création réunis : le corps décide lequel s'applique. */
const CREER = new Set(["tasks:create", "tasks:create_standalone"]) as ReadonlySet<string>;
/** Seulement le droit de créer DANS un projet. */
const CREER_DANS_PROJET = new Set(["tasks:create"]) as ReadonlySet<string>;
/** Seulement le droit de créer HORS projet. */
const CREER_HORS_PROJET = new Set(["tasks:create_standalone"]) as ReadonlySet<string>;
/** La gestion globale : elle lève l'appartenance et la réserve d'assignation. */
const GESTION_GLOBALE = new Set([
  "tasks:create",
  "tasks:create_standalone",
  "tasks:delete",
  "tasks:manage_any",
]) as ReadonlySet<string>;
const SUPPRIMER = new Set(["tasks:delete"]) as ReadonlySet<string>;

const utc = (s: string) => new Date(`${s}T00:00:00.000Z`);

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

/** Un projet, et facultativement ses membres. */
async function projet(membres: string[] = []) {
  const id = uuid();
  await prisma.project.create({
    data: {
      id,
      nom: `P-${id.slice(0, 8)}`,
      dateDebut: utc("2026-01-01"),
      dateFin: utc("2026-12-31"),
      ...(membres.length > 0
        ? { membres: { create: membres.map((userId) => ({ userId, roleProjet: "developpeur" })) } }
        : {}),
    },
  });
  return id;
}

/** Le périmètre RÉEL d'un compte, jamais un périmètre fabriqué à la main. */
const perimetreDe = (userId: string, permissions: ReadonlySet<string>): Promise<Perimetre> =>
  perimetres.resoudre(userId, permissions);

const versionDe = async (id: string) =>
  (await prisma.task.findUniqueOrThrow({ where: { id }, select: { version: true } })).version;

beforeAll(async () => {
  pg = await new PostgreSqlContainer("postgres:18-alpine").start();
  execFileSync("pnpm", ["exec", "prisma", "migrate", "deploy"], {
    cwd: RACINE_DB,
    env: { ...process.env, DATABASE_URL: pg.getConnectionUri() },
    stdio: "pipe",
  });
  prisma = creerClient(pg.getConnectionUri());
  perimetres = new PerimetreService(prisma as never);
  taches = new TachesService(
    prisma as never,
    new AuditService(prisma as never),
    perimetres,
    new NotificationsService(prisma as never, new FileService()),
  );
}, 240_000);

afterAll(async () => {
  await prisma?.$disconnect();
  await pg?.stop();
});

// ── EX-TSK-04 — les horaires ────────────────────────────────────────────────

describe("EX-TSK-04 — les horaires d'une tâche s'écrivent, pas seulement se lisent", () => {
  it("EX-TSK-04 — la création enregistre l'heure de début et l'heure de fin", async () => {
    const a = await agent();
    const t = await taches.creer(
      { titre: "Réunion de service", heureDebut: "09:00", heureFin: "10:30" },
      a,
      CREER,
    );

    // Relu EN BASE, pas dans la valeur de retour : c'est l'écriture qui
    // manquait, et Zod comme Prisma retirent un champ inconnu en silence.
    const ligne = await prisma.task.findUniqueOrThrow({ where: { id: t.id } });
    expect(ligne.heureDebut).toBe("09:00");
    expect(ligne.heureFin).toBe("10:30");
  });

  it("EX-TSK-04 — la modification les corrige après coup", async () => {
    const a = await agent();
    const t = await taches.creer(
      { titre: "Point hebdomadaire", heureDebut: "14:00", heureFin: "15:00" },
      a,
      CREER,
    );

    await taches.modifier(t.id, { version: t.version, heureFin: "16:00" }, a, CREER);

    const ligne = await prisma.task.findUniqueOrThrow({ where: { id: t.id } });
    expect(ligne.heureDebut).toBe("14:00");
    expect(ligne.heureFin).toBe("16:00");
  });

  it("EX-TSK-04 — et elle les efface : `null` remet la tâche en journée entière", async () => {
    const a = await agent();
    const t = await taches.creer(
      { titre: "Atelier", heureDebut: "09:00", heureFin: "12:00" },
      a,
      CREER,
    );

    await taches.modifier(
      t.id,
      { version: t.version, heureDebut: null, heureFin: null },
      a,
      CREER,
    );

    const ligne = await prisma.task.findUniqueOrThrow({ where: { id: t.id } });
    expect(ligne.heureDebut).toBeNull();
    expect(ligne.heureFin).toBeNull();
  });

  it("EX-TSK-04 — une fin qui précède son début est refusée à la création", async () => {
    const a = await agent();
    await expect(
      taches.creer({ titre: "Inversée", heureDebut: "15:00", heureFin: "09:00" }, a, CREER),
    ).rejects.toMatchObject({ code: "horaires_incoherents" });
  });

  it("EX-TSK-04 — le refus porte sur l'état RÉSULTANT, pas sur le corps reçu", async () => {
    // Ne changer QUE l'heure de fin doit être confronté au début DÉJÀ EN BASE.
    // Sans cela la règle ne tiendrait que sur les saisies complètes — et une
    // modification partielle poserait une plage inversée sans un mot.
    const a = await agent();
    const t = await taches.creer(
      { titre: "Créneau", heureDebut: "14:00", heureFin: "16:00" },
      a,
      CREER,
    );

    await expect(
      taches.modifier(t.id, { version: t.version, heureFin: "11:00" }, a, CREER),
    ).rejects.toMatchObject({ code: "horaires_incoherents" });

    const ligne = await prisma.task.findUniqueOrThrow({ where: { id: t.id } });
    expect(ligne.heureFin).toBe("16:00");
  });
});

// ── RG-TSK-02 — deux droits distincts ───────────────────────────────────────

describe("RG-TSK-02 — créer dans un projet et créer hors projet sont deux droits", () => {
  it("RG-TSK-02 — `tasks:create` seul ne crée PAS une tâche hors projet", async () => {
    const a = await agent();
    await expect(
      taches.creer({ titre: "Réunion" }, a, CREER_DANS_PROJET),
    ).rejects.toMatchObject({
      code: "droit_de_creation_manquant",
      detail: { permission: "tasks:create_standalone" },
    });
  });

  it("RG-TSK-02 — `tasks:create_standalone` seul ne crée PAS une tâche de projet", async () => {
    const a = await agent();
    const p = await projet([a]);
    await expect(
      taches.creer({ titre: "Lot 1", projectId: p }, a, CREER_HORS_PROJET),
    ).rejects.toMatchObject({
      code: "droit_de_creation_manquant",
      detail: { permission: "tasks:create" },
    });
  });

  it("RG-TSK-02 — `tasks:create_standalone` seul crée BIEN une tâche hors projet", async () => {
    // Le versant qui manquait au produit : douze modèles de rôles détiennent
    // ce droit sans `tasks:create`, et la route n'exigeait que le second — ils
    // ne pouvaient donc rien créer du tout.
    const a = await agent();
    const t = await taches.creer({ titre: "Sollicitation" }, a, CREER_HORS_PROJET);
    expect(t.projectId).toBeNull();
  });

  it("RG-TSK-02 — sans aucun des deux, la création est refusée", async () => {
    const a = await agent();
    const p = await projet([a]);
    const aucun = new Set(["tasks:read", "tasks:update"]) as ReadonlySet<string>;

    await expect(taches.creer({ titre: "X" }, a, aucun)).rejects.toBeInstanceOf(ErreurTache);
    await expect(
      taches.creer({ titre: "Y", projectId: p }, a, aucun),
    ).rejects.toMatchObject({ code: "droit_de_creation_manquant" });
  });
});

// ── RG-TSK-03 — l'appartenance au projet ────────────────────────────────────

describe("RG-TSK-03 — créer dans un projet exige d'en être membre", () => {
  it("RG-TSK-03 — un agent SANS LIEN avec le projet est refusé", async () => {
    const membre = await agent();
    const etranger = await agent();
    const p = await projet([membre]);

    await expect(
      taches.creer({ titre: "Intrusion", projectId: p }, etranger, CREER),
    ).rejects.toMatchObject({ code: "pas_membre_du_projet" });

    expect(await prisma.task.count({ where: { projectId: p } })).toBe(0);
  });

  it("RG-TSK-03 — un membre du projet crée sans réserve", async () => {
    const membre = await agent();
    const p = await projet([membre]);
    const t = await taches.creer({ titre: "Lot", projectId: p }, membre, CREER);
    expect(t.projectId).toBe(p);
  });

  it("RG-TSK-03 — le chef de projet aussi, sans être « membre » au sens de la table", async () => {
    // `RG-SCOPE-02` définit l'accès au projet par créateur, chef, sponsor OU
    // membre. Une définition plus étroite ici rendrait visible en lecture ce
    // qui serait refusé en écriture.
    const chef = await agent();
    const id = uuid();
    await prisma.project.create({
      data: {
        id, nom: `P-${id.slice(0, 8)}`, chefId: chef,
        dateDebut: utc("2026-01-01"), dateFin: utc("2026-12-31"),
      },
    });

    const t = await taches.creer({ titre: "Cadrage", projectId: id }, chef, CREER);
    expect(t.projectId).toBe(id);
  });

  it("RG-TSK-03 — la gestion globale lève l'appartenance", async () => {
    const gestionnaire = await agent();
    const autre = await agent();
    const p = await projet([autre]);

    const t = await taches.creer({ titre: "Pilotage", projectId: p }, gestionnaire, GESTION_GLOBALE);
    expect(t.projectId).toBe(p);
  });
});

// ── EX-TSK-15 — rattacher et détacher a posteriori ──────────────────────────

describe("EX-TSK-15 — rattacher ou détacher une tâche d'un projet a posteriori", () => {
  it("EX-TSK-15 — une tâche née hors projet se rattache, et la base le montre", async () => {
    const a = await agent();
    const p = await projet([a]);
    const t = await taches.creer({ titre: "Réunion devenue lot" }, a, CREER);
    expect(t.projectId).toBeNull();

    await taches.modifier(t.id, { version: t.version, projectId: p }, a, CREER);

    // La lecture en base, pas la valeur de retour : le défaut était que Zod
    // retirait le champ et que l'appelant croyait avoir rattaché.
    const ligne = await prisma.task.findUniqueOrThrow({ where: { id: t.id } });
    expect(ligne.projectId).toBe(p);
  });

  it("EX-TSK-15 — une tâche de projet en sort, et redevient hors projet", async () => {
    const a = await agent();
    const p = await projet([a]);
    const t = await taches.creer({ titre: "Lot devenu transverse", projectId: p }, a, CREER);

    await taches.modifier(t.id, { version: t.version, projectId: null }, a, CREER);

    const ligne = await prisma.task.findUniqueOrThrow({ where: { id: t.id } });
    expect(ligne.projectId).toBeNull();
  });

  it("RG-JAL-04 — détacher du projet DÉTACHE AUSSI le jalon et l'épopée", async () => {
    // Sans cela on obtient exactement l'état que la règle interdit : une tâche
    // hors projet rattachée à un jalon — et rien, ni au serveur ni en base, ne
    // pouvait plus la ramener à un état valide.
    const a = await agent();
    const p = await projet([a]);
    const jalon = await prisma.milestone.create({
      data: { nom: "J", dateEcheance: utc("2026-06-30"), projectId: p },
    });
    const epopee = await prisma.epic.create({ data: { nom: "E", projectId: p } });
    const t = await taches.creer(
      { titre: "Rattachée", projectId: p, milestoneId: jalon.id, epicId: epopee.id },
      a,
      CREER,
    );

    await taches.modifier(t.id, { version: t.version, projectId: null }, a, CREER);

    const ligne = await prisma.task.findUniqueOrThrow({ where: { id: t.id } });
    expect(ligne.projectId).toBeNull();
    expect(ligne.milestoneId).toBeNull();
    expect(ligne.epicId).toBeNull();
  });

  it("RG-JAL-03 — changer de projet détache le jalon de l'ANCIEN projet", async () => {
    const a = await agent();
    const depuis = await projet([a]);
    const vers = await projet([a]);
    const jalon = await prisma.milestone.create({
      data: { nom: "J", dateEcheance: utc("2026-06-30"), projectId: depuis },
    });
    const t = await taches.creer(
      { titre: "Déménagée", projectId: depuis, milestoneId: jalon.id },
      a,
      CREER,
    );

    await taches.modifier(t.id, { version: t.version, projectId: vers }, a, CREER);

    const ligne = await prisma.task.findUniqueOrThrow({ where: { id: t.id } });
    expect(ligne.projectId).toBe(vers);
    expect(ligne.milestoneId).toBeNull();
  });

  it("EX-TSK-15 — rattacher ET désigner un jalon du projet d'arrivée, en une écriture", async () => {
    const a = await agent();
    const p = await projet([a]);
    const jalon = await prisma.milestone.create({
      data: { nom: "Arrivée", dateEcheance: utc("2026-09-30"), projectId: p },
    });
    const t = await taches.creer({ titre: "Transverse" }, a, CREER);

    await taches.modifier(
      t.id,
      { version: t.version, projectId: p, milestoneId: jalon.id },
      a,
      CREER,
    );

    const ligne = await prisma.task.findUniqueOrThrow({ where: { id: t.id } });
    expect(ligne.projectId).toBe(p);
    expect(ligne.milestoneId).toBe(jalon.id);
  });

  it("RG-JAL-03 — un jalon d'un AUTRE projet que celui d'arrivée est refusé", async () => {
    const a = await agent();
    const p = await projet([a]);
    const ailleurs = await projet([a]);
    const jalon = await prisma.milestone.create({
      data: { nom: "Ailleurs", dateEcheance: utc("2026-09-30"), projectId: ailleurs },
    });
    const t = await taches.creer({ titre: "Transverse" }, a, CREER);

    await expect(
      taches.modifier(
        t.id,
        { version: t.version, projectId: p, milestoneId: jalon.id },
        a,
        CREER,
      ),
    ).rejects.toMatchObject({ code: "jalon_autre_projet" });
  });

  it("RG-TSK-03 — rattacher à un projet dont on n'est pas membre est refusé", async () => {
    // Changer le projet d'une tâche change QUI LA VOIT (`RG-SCOPE-02`) : c'est
    // le même geste que d'y créer une tâche, donc la même condition.
    const a = await agent();
    const autre = await agent();
    const p = await projet([autre]);
    const t = await taches.creer({ titre: "Convoitée" }, a, CREER);

    await expect(
      taches.modifier(t.id, { version: t.version, projectId: p }, a, CREER),
    ).rejects.toMatchObject({ code: "pas_membre_du_projet" });

    expect((await prisma.task.findUniqueOrThrow({ where: { id: t.id } })).projectId).toBeNull();
  });

  it("EX-TSK-15 — le rattachement respecte `RG-GEN-07` : une version périmée est refusée", async () => {
    const a = await agent();
    const p = await projet([a]);
    const t = await taches.creer({ titre: "Concurrente" }, a, CREER);

    await taches.modifier(t.id, { version: t.version, titre: "Renommée" }, a, CREER);
    await expect(
      taches.modifier(t.id, { version: t.version, projectId: p }, a, CREER),
    ).rejects.toMatchObject({ code: "conflit_de_version" });
  });
});

// ── RG-TSK-14 — la suppression ──────────────────────────────────────────────

describe("RG-TSK-14 — sans permission élargie, on ne supprime que ses propres tâches", () => {
  it("RG-TSK-14 — `tasks:delete` seul ne suffit PAS sur la tâche d'un autre", async () => {
    const proprietaire = await agent();
    const autre = await agent();
    const t = await taches.creer(
      { titre: "Celle d'un autre", assigneIds: [proprietaire] },
      proprietaire,
      CREER,
    );

    // L'acteur voit la tâche — il faut que le refus vienne de `RG-TSK-14`, pas
    // du périmètre, sans quoi le test ne prouverait pas ce qu'il annonce.
    const p = await perimetreDe(autre, new Set(["tasks:readAll"]));
    await expect(
      taches.supprimer(t.id, autre, p, new Set([...SUPPRIMER, "tasks:readAll"])),
    ).rejects.toMatchObject({ code: "suppression_reservee_aux_assignes" });

    expect(await prisma.task.count({ where: { id: t.id } })).toBe(1);
  });

  it("RG-TSK-14 — l'assigné supprime la sienne", async () => {
    const a = await agent();
    const t = await taches.creer({ titre: "La mienne", assigneIds: [a] }, a, CREER);

    const p = await perimetreDe(a, SUPPRIMER);
    await expect(taches.supprimer(t.id, a, p, SUPPRIMER)).resolves.toBeUndefined();
    expect(await prisma.task.count({ where: { id: t.id } })).toBe(0);
  });

  it("RG-TSK-14 — la permission élargie `tasks:manage_any` supprime celle d'autrui", async () => {
    const proprietaire = await agent();
    const gestionnaire = await agent();
    const t = await taches.creer(
      { titre: "Supprimable par le gestionnaire", assigneIds: [proprietaire] },
      proprietaire,
      CREER,
    );

    const p = await perimetreDe(gestionnaire, GESTION_GLOBALE);
    await expect(taches.supprimer(t.id, gestionnaire, p, GESTION_GLOBALE)).resolves.toBeUndefined();
    expect(await prisma.task.count({ where: { id: t.id } })).toBe(0);
  });

  it("RG-TSK-14 — une tâche HORS PÉRIMÈTRE ne se supprime pas non plus", async () => {
    // Permission d'abord, périmètre ensuite : la garde a laissé passer
    // `tasks:delete`, le cloisonnement s'applique quand même. Le refus ne
    // renseigne pas sur l'existence de la ligne.
    const proprietaire = await agent();
    const etranger = await agent();
    const t = await taches.creer(
      { titre: "Ailleurs", assigneIds: [proprietaire] },
      proprietaire,
      CREER,
    );

    const p = await perimetreDe(etranger, SUPPRIMER);
    await expect(taches.supprimer(t.id, etranger, p, SUPPRIMER)).rejects.toMatchObject({
      code: "hors_perimetre",
    });
    expect(await prisma.task.count({ where: { id: t.id } })).toBe(1);
  });
});

// ── RG-GEN-07 — les deux poses d'ensemble ───────────────────────────────────

describe("RG-GEN-07 — poser une liste ENTIÈRE exige la version lue", () => {
  it("RG-GEN-07 — la liste des assignés refuse une version périmée, et n'écrase rien", async () => {
    const a = await agent();
    const b = await agent();
    const c = await agent();
    const t = await taches.creer({ titre: "Équipe", assigneIds: [a] }, a, CREER);
    const lue = await versionDe(t.id);

    await taches.definirAssignes(t.id, [a, b], lue, a);

    // Une seconde fenêtre, ouverte avant la première et qui enregistre après.
    await expect(taches.definirAssignes(t.id, [a, c], lue, a)).rejects.toMatchObject({
      code: "conflit_de_version",
    });

    const restants = await prisma.taskAssignee.findMany({ where: { taskId: t.id } });
    expect(new Set(restants.map((l) => l.userId))).toEqual(new Set([a, b]));
  });

  it("RG-GEN-07 — poser les assignés incrémente la version de la tâche", async () => {
    // Sans incrément, la fiche resterait composable indéfiniment avec la même
    // version : le contrôle serait posé et n'attraperait jamais rien.
    const a = await agent();
    const b = await agent();
    const t = await taches.creer({ titre: "Compteur", assigneIds: [a] }, a, CREER);
    const avant = await versionDe(t.id);

    const r = await taches.definirAssignes(t.id, [a, b], avant, a);

    expect(r.version).toBe(avant + 1);
    expect(await versionDe(t.id)).toBe(avant + 1);
  });

  it("RG-GEN-07 — l'ordre des sous-tâches refuse une version périmée", async () => {
    const a = await agent();
    const t = await taches.creer({ titre: "Ordonnée" }, a, CREER);
    const un = await taches.ajouterSousTache(t.id, "Un", a);
    const deux = await taches.ajouterSousTache(t.id, "Deux", a);
    const lue = await versionDe(t.id);

    await taches.reordonnerSousTaches(t.id, [deux.id, un.id], lue);

    await expect(
      taches.reordonnerSousTaches(t.id, [un.id, deux.id], lue),
    ).rejects.toMatchObject({ code: "conflit_de_version" });

    const restantes = await prisma.subtask.findMany({
      where: { taskId: t.id },
      orderBy: { ordre: "asc" },
    });
    expect(restantes.map((s) => s.libelle)).toEqual(["Deux", "Un"]);
  });
});

// ── Le fil de commentaires de la fiche ──────────────────────────────────────

describe("RG-DROITS-03 — `comments:read` garde AUSSI le fil embarqué dans la fiche", () => {
  const LECTURE = new Set(["tasks:readAll", "tasks:read_confidential"]) as ReadonlySet<string>;

  it("RG-DROITS-03 — sans `comments:read`, le fil est ABSENT de la fiche, pas vide", async () => {
    // Une permission garde une route, pas un champ. `GET
    // /documents/commentaires/fil` exige `comments:read` ; cette fiche-ci,
    // gardée par `tasks:read`, rendait le même fil par l'autre porte.
    const a = await agent();
    const t = await taches.creer({ titre: "Commentée" }, a, CREER);
    await prisma.comment.create({ data: { taskId: t.id, contenu: "Secret", auteurId: a } });

    const p = await perimetreDe(a, LECTURE);
    const fiche = await taches.fiche(t.id, p, LECTURE);

    expect(fiche).not.toHaveProperty("commentaires");
  });

  it("RG-DROITS-03 — avec `comments:read`, le fil est rendu", async () => {
    const a = await agent();
    const t = await taches.creer({ titre: "Commentée aussi" }, a, CREER);
    await prisma.comment.create({ data: { taskId: t.id, contenu: "Visible", auteurId: a } });

    const droits = new Set([...LECTURE, "comments:read"]) as ReadonlySet<string>;
    const p = await perimetreDe(a, droits);
    const fiche = await taches.fiche(t.id, p, droits);

    expect(fiche.commentaires?.map((c) => c.contenu)).toEqual(["Visible"]);
  });
});
