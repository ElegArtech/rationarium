import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { creerClient, type PrismaClient } from "@trame/db";
import { UtilisateursService, ErreurUtilisateur } from "./utilisateurs.service.js";
import { AuditService } from "../commun/audit.service.js";
import { PerimetreService } from "../commun/perimetre.service.js";
import { AuthService } from "../auth/auth.service.js";

/** L-07 — utilisateurs et annuaire, criticité haute. */

const RACINE_DB = path.resolve(import.meta.dirname, "../../../../packages/db");
const MDP = "Motdepasse1!";

let pg: StartedPostgreSqlContainer;
let prisma: PrismaClient;
let users: UtilisateursService;
let perimetres: PerimetreService;
let auth: AuthService;
let karim: string;
let deptA: string;
let deptB: string;
let svcA: string;
let svcB: string;

const uuid = () => crypto.randomUUID();
const nouveau = (p = "agent") => {
  const s = uuid().slice(0, 8);
  return { prenom: "T", nom: "Test", email: `${p}-${s}@x.fr`, login: `${p}-${s}`, motDePasse: MDP };
};

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
  users = new UtilisateursService(prisma as never, audit, perimetres);
  auth = new AuthService(prisma as never, audit);

  deptA = uuid();
  deptB = uuid();
  await prisma.departement.create({ data: { id: deptA, nom: "Département A" } });
  await prisma.departement.create({ data: { id: deptB, nom: "Département B" } });
  svcA = uuid();
  svcB = uuid();
  await prisma.service.create({ data: { id: svcA, nom: "Service A", departementId: deptA } });
  await prisma.service.create({ data: { id: svcB, nom: "Service B", departementId: deptB } });

  const k = await users.creer({ ...nouveau("karim"), departementId: deptA }, uuid());
  karim = k.id;
}, 240_000);

afterAll(async () => {
  await prisma?.$disconnect();
  await pg?.stop();
});

const globalP = () => perimetres.resoudre(karim, new Set(["users:manage_any"]));

describe("RG-USR-01 — unicité, avec des messages DISTINCTS", () => {
  it("email et login en doublon ne donnent pas le même code", async () => {
    const d = nouveau();
    await users.creer(d, karim);
    await expect(users.creer({ ...nouveau(), email: d.email }, karim)).rejects.toMatchObject({
      code: "email_deja_pris",
    });
    await expect(users.creer({ ...nouveau(), login: d.login }, karim)).rejects.toMatchObject({
      code: "login_deja_pris",
    });
  });

  it("l'email est normalisé en minuscules", async () => {
    const d = nouveau();
    const u = await users.creer({ ...d, email: d.email.toUpperCase() }, karim);
    expect(u.email).toBe(d.email.toLowerCase());
  });
});

describe("RG-USR-08 — les services dépendent du département", () => {
  it("un service d'un autre département est refusé", async () => {
    await expect(
      users.creer({ ...nouveau(), departementId: deptA, serviceIds: [svcB] }, karim),
    ).rejects.toMatchObject({ code: "service_hors_departement" });
  });

  it("un service du bon département passe", async () => {
    const u = await users.creer(
      { ...nouveau(), departementId: deptA, serviceIds: [svcA] },
      karim,
    );
    const rattachements = await prisma.userService.count({ where: { userId: u.id } });
    expect(rattachements).toBe(1);
  });

  it("ce n'est pas qu'une règle de formulaire : elle protège le cloisonnement", async () => {
    // Rattacher un agent du département A à un service du département B
    // élargirait son périmètre de lecture à B (RG-SCOPE-01). Le contrôle
    // serveur est donc une règle de cloisonnement, pas d'ergonomie.
    await expect(
      users.creer({ ...nouveau(), departementId: deptA, serviceIds: [svcA, svcB] }, karim),
    ).rejects.toMatchObject({ code: "service_hors_departement" });
  });
});

describe("RG-USR-02 — nul n'agit sur soi-même", () => {
  it("on ne se désactive pas", async () => {
    await expect(users.desactiver(karim, karim)).rejects.toMatchObject({
      code: "soi_meme_interdit",
    });
  });

  it("on ne se supprime pas", async () => {
    await expect(users.supprimerDefinitivement(karim, karim)).rejects.toMatchObject({
      code: "soi_meme_interdit",
    });
  });

  it("RG-USR-05 — un administrateur ne réinitialise pas SON mot de passe par cet outil", async () => {
    await expect(users.reinitialiserMotDePasse(karim, "Nouveau12!", karim)).rejects.toMatchObject({
      code: "soi_meme_interdit",
    });
  });
});

describe("EX-USR-05 — désactivation réversible", () => {
  it("désactive et coupe les sessions ouvertes immédiatement", async () => {
    const d = nouveau();
    const u = await users.creer(d, karim);
    // Le compte créé par un tiers doit changer son mot de passe : on le pose
    // directement pour ouvrir une session.
    await prisma.user.update({ where: { id: u.id }, data: { motDePasseAChanger: false } });
    const { jeton } = await auth.connecter(d.login, MDP);

    await users.desactiver(u.id, karim);

    expect((await prisma.user.findUniqueOrThrow({ where: { id: u.id } })).actif).toBe(false);
    // Sans la coupure de session, la désactivation ne prendrait effet qu'à la
    // prochaine connexion — c'est-à-dire jamais pour quelqu'un déjà connecté.
    await expect(auth.resoudreSession(jeton)).resolves.toBeNull();
  });

  it("et se réactive — c'est ce qui la distingue de la suppression", async () => {
    const u = await users.creer(nouveau(), karim);
    await users.desactiver(u.id, karim);
    await users.reactiver(u.id, karim);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: u.id } })).actif).toBe(true);
  });
});

describe("RG-USR-03 — contrôle de dépendances avant suppression définitive", () => {
  it("un compte vierge se supprime", async () => {
    const u = await users.creer(nouveau(), karim);
    const impact = await users.impactSuppression(u.id);
    expect(impact.blocages).toEqual([]);
    await expect(users.supprimerDefinitivement(u.id, karim)).resolves.toBeUndefined();
    expect(await prisma.user.findUnique({ where: { id: u.id } })).toBeNull();
  });

  it("du temps déclaré BLOQUE, et le blocage est nommé et chiffré", async () => {
    const u = await users.creer(nouveau(), karim);
    const projet = uuid();
    await prisma.project.create({
      data: {
        id: projet, nom: `P-${projet.slice(0, 6)}`,
        dateDebut: new Date("2026-01-01"), dateFin: new Date("2026-12-31"),
      },
    });
    await prisma.timeEntry.create({
      data: { userId: u.id, projectId: projet, date: new Date("2026-03-02"), heures: 4 },
    });

    const impact = await users.impactSuppression(u.id);
    expect(impact.blocages).toContainEqual({ objet: "saisies de temps", nombre: 1 });

    const erreur = await users
      .supprimerDefinitivement(u.id, karim)
      .catch((e: ErreurUtilisateur) => e);
    expect((erreur as ErreurUtilisateur).code).toBe("suppression_bloquee");
    expect((erreur as ErreurUtilisateur).detail?.blocages).toHaveLength(1);
    // Le compte est toujours là : un refus ne supprime rien à moitié.
    expect(await prisma.user.findUnique({ where: { id: u.id } })).not.toBeNull();
  });

  it("des to-do n'empêchent pas — elles s'effacent, et sont annoncées comme telles", async () => {
    const u = await users.creer(nouveau(), karim);
    await prisma.todo.create({ data: { userId: u.id, libelle: "Penser à" } });

    const impact = await users.impactSuppression(u.id);
    expect(impact.blocages).toEqual([]);
    expect(impact.effacements).toContainEqual({ objet: "to-do personnelles", nombre: 1 });
    await expect(users.supprimerDefinitivement(u.id, karim)).resolves.toBeUndefined();
  });

  it("le contrôle est REJOUÉ à l'exécution, pas seulement à l'affichage", async () => {
    const u = await users.creer(nouveau(), karim);
    const impact = await users.impactSuppression(u.id);
    expect(impact.blocages).toEqual([]);

    // Entre la confirmation et l'exécution, une saisie apparaît.
    const projet = uuid();
    await prisma.project.create({
      data: {
        id: projet, nom: `P-${projet.slice(0, 6)}`,
        dateDebut: new Date("2026-01-01"), dateFin: new Date("2026-12-31"),
      },
    });
    await prisma.timeEntry.create({
      data: { userId: u.id, projectId: projet, date: new Date("2026-03-02"), heures: 2 },
    });

    // Se fier au contrôle d'affichage serait un « dernier arrivé gagne » déguisé.
    await expect(users.supprimerDefinitivement(u.id, karim)).rejects.toMatchObject({
      code: "suppression_bloquee",
    });
  });

  it("RG-USR-04 — la trace précède la suppression, sinon acteur et cible sont perdus", async () => {
    const u = await users.creer(nouveau(), karim);
    await users.supprimerDefinitivement(u.id, karim);
    const trace = await prisma.auditLog.findFirst({
      where: { action: "user.delete_permanently", entiteId: u.id },
    });
    expect(trace).not.toBeNull();
    expect(trace!.acteurId).toBe(karim);
  });
});

describe("EX-USR-01, EX-USR-02 — annuaire filtré", () => {
  it("la liste respecte le périmètre", async () => {
    const dansA = await users.creer({ ...nouveau(), departementId: deptA }, karim);
    const dansB = await users.creer({ ...nouveau(), departementId: deptB }, karim);

    const p = await perimetres.resoudre(dansA.id, new Set());
    const vus = (await users.lister(p)).map((u) => u.id);
    expect(vus).toContain(dansA.id);
    expect(vus).not.toContain(dansB.id);
  });

  it("recherche sur nom, prénom, email et identifiant", async () => {
    const d = { ...nouveau(), prenom: "Sylvestre", departementId: deptA };
    await users.creer(d, karim);
    const p = await globalP();
    const vus = await users.lister(p, { recherche: "sylvestre" });
    expect(vus.some((u) => u.prenom === "Sylvestre")).toBe(true);
  });

  it("filtre par statut actif", async () => {
    const u = await users.creer({ ...nouveau(), departementId: deptA }, karim);
    await users.desactiver(u.id, karim);
    const p = await globalP();
    const inactifs = await users.lister(p, { actif: false });
    expect(inactifs.map((x) => x.id)).toContain(u.id);
    const actifs = await users.lister(p, { actif: true });
    expect(actifs.map((x) => x.id)).not.toContain(u.id);
  });
});

describe("EX-USR-09 — présence du jour", () => {
  it("distingue présent, en congé et en télétravail", async () => {
    const present = await users.creer({ ...nouveau(), departementId: deptA }, karim);
    const enConge = await users.creer({ ...nouveau(), departementId: deptA }, karim);
    const enTt = await users.creer({ ...nouveau(), departementId: deptA }, karim);

    const type = uuid();
    await prisma.leaveType.create({ data: { id: type, code: `CA${type.slice(0, 4)}`, nom: "Congé annuel" } });
    const jour = new Date("2026-04-15");
    await prisma.leave.create({
      data: {
        userId: enConge.id, typeId: type,
        dateDebut: jour, dateFin: jour, joursOuvres: 1, statut: "approved",
      },
    });
    await prisma.telework.create({ data: { userId: enTt.id, date: jour, etat: "telework" } });

    const p = await globalP();
    const presence = await users.presenceDuJour(p, jour);
    const par = new Map(presence.map((x) => [x.id, x]));

    expect(par.get(present.id)?.etat).toBe("present");
    expect(par.get(enConge.id)?.etat).toBe("conge");
    expect(par.get(enConge.id)?.typeConge).toBe("Congé annuel");
    expect(par.get(enTt.id)?.etat).toBe("teletravail");
  });
});
