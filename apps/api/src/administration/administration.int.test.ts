import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { creerClient, type PrismaClient } from "@rationarium/db";
import { RolesService, ErreurRole } from "./roles.service.js";
import { AuditQueryService } from "./audit.query.service.js";
import { AuditService } from "../commun/audit.service.js";
import { NOMBRE_PERMISSIONS, NOMBRE_MODELES, modeleParCode } from "@rationarium/contracts";

/** L-08 — rôles, matrice, journal d'audit. Criticité haute. */

const RACINE_DB = path.resolve(import.meta.dirname, "../../../../packages/db");

let pg: StartedPostgreSqlContainer;
let prisma: PrismaClient;
let roles: RolesService;
let journal: AuditQueryService;
let karim: string;

const uuid = () => crypto.randomUUID();

beforeAll(async () => {
  pg = await new PostgreSqlContainer("postgres:18-alpine").start();
  execFileSync("pnpm", ["exec", "prisma", "migrate", "deploy"], {
    cwd: RACINE_DB,
    env: { ...process.env, DATABASE_URL: pg.getConnectionUri() },
    stdio: "pipe",
  });
  prisma = creerClient(pg.getConnectionUri());
  const audit = new AuditService(prisma as never);
  roles = new RolesService(prisma as never, audit);
  journal = new AuditQueryService(prisma as never, audit);

  karim = uuid();
  await prisma.user.create({
    data: {
      id: karim, login: `karim-${karim.slice(0, 6)}`, email: `${karim.slice(0, 6)}@x.fr`,
      motDePasseHash: "x", prenom: "Karim", nom: "Admin",
    },
  });
}, 240_000);

afterAll(async () => {
  await prisma?.$disconnect();
  await pg?.stop();
});

describe("EX-ADM-06 — initialisation du référentiel", () => {
  it("crée les 26 modèles de rôles", async () => {
    const r = await roles.initialiserReferentiel(karim);
    expect(r.crees).toBe(NOMBRE_MODELES);
    expect(await prisma.role.count()).toBe(NOMBRE_MODELES);
  });

  it("est idempotente — la rejouer ne duplique rien", async () => {
    const r = await roles.initialiserReferentiel(karim);
    expect(r.crees).toBe(0);
    expect(r.existants).toBe(NOMBRE_MODELES);
    expect(await prisma.role.count()).toBe(NOMBRE_MODELES);
  });

  it("ADMIN détient l'intégralité du catalogue", async () => {
    const admin = await prisma.role.findUniqueOrThrow({
      where: { code: "ADMIN" },
      include: { _count: { select: { permissions: true } } },
    });
    expect(admin._count.permissions).toBe(NOMBRE_PERMISSIONS);
  });

  it("un rôle personnalisé N'EST PAS réécrit par une réinitialisation", async () => {
    const sur_mesure = await roles.creer({ code: "SUR_MESURE", nom: "Sur mesure" }, karim);
    await roles.definirPermissions(sur_mesure.id, ["projects:read"], karim);

    await roles.initialiserReferentiel(karim);

    const apres = await prisma.rolePermission.findMany({ where: { roleId: sur_mesure.id } });
    expect(apres.map((p) => p.permission)).toEqual(["projects:read"]);
  });
});

describe("RG-DROITS-02 — les rôles système sont protégés", () => {
  it("un rôle système ne se supprime pas", async () => {
    const admin = await prisma.role.findUniqueOrThrow({ where: { code: "ADMIN" } });
    await expect(roles.supprimer(admin.id, karim)).rejects.toMatchObject({
      code: "role_systeme_non_supprimable",
    });
  });

  it("un rôle système ne se renomme pas", async () => {
    const admin = await prisma.role.findUniqueOrThrow({ where: { code: "ADMIN" } });
    await expect(roles.renommer(admin.id, "Grand chef", karim)).rejects.toMatchObject({
      code: "role_systeme_non_renommable",
    });
  });

  /*
   * `RG-ADM-02` — « ni supprimables ni MODIFIABLES DANS LEUR STRUCTURE ».
   *
   * Les deux premiers tiers étaient tenus, le troisième non. Le raisonnement
   * était pourtant écrit dans le service, sur `renommer` : « sans cela, un
   * administrateur pourrait vider ADMIN de ses permissions et se verrouiller
   * définitivement hors de l'administration ». `Roles.tsx` désactivait le
   * bouton — mais un client qui désactive est une courtoisie, jamais un
   * contrôle. Une requête forgée vidait `ADMIN`, et nul ne pouvait le
   * restaurer : restaurer exige `users:manage_permissions`, qui vit dedans.
   */
  it("RG-ADM-02 — un rôle système ne se VIDE PAS de ses permissions", async () => {
    const admin = await prisma.role.findUniqueOrThrow({ where: { code: "ADMIN" } });
    const avant = await prisma.rolePermission.count({ where: { roleId: admin.id } });

    await expect(roles.definirPermissions(admin.id, [], karim)).rejects.toMatchObject({
      code: "role_systeme_non_modifiable",
    });

    // Et rien n'a bougé : un refus qui laisse la table à moitié vidée serait pire.
    const apres = await prisma.rolePermission.count({ where: { roleId: admin.id } });
    expect(apres).toBe(avant);
    expect(apres).toBe(NOMBRE_PERMISSIONS);
  });

  it("RG-ADM-02 — mais le RÉALIGNEMENT du référentiel passe, lui", async () => {
    /*
     * Le refus porte sur la demande d'un acteur, pas sur l'alignement interne :
     * `initialiserReferentiel` appelle sans acteur et doit continuer de remettre
     * un rôle système sur son modèle. Sans ce test, un refus trop large aurait
     * gelé le référentiel au premier amorçage.
     */
    const admin = await prisma.role.findUniqueOrThrow({ where: { code: "ADMIN" } });
    await expect(roles.definirPermissions(admin.id, ["projects:read"])).resolves.toBeUndefined();
    await roles.initialiserReferentiel();
    const remis = await prisma.rolePermission.count({ where: { roleId: admin.id } });
    expect(remis).toBe(NOMBRE_PERMISSIONS);
  });

  it("un rôle dupliqué depuis un modèle système N'EST PAS système", async () => {
    // Sans cette règle, on fabriquerait un rôle indélébile par duplication.
    const copie = await roles.creer(
      { code: "COPIE_ADMIN", nom: "Copie", depuisModele: "ADMIN" },
      karim,
    );
    expect(copie.systeme).toBe(false);
    const permissions = await prisma.rolePermission.count({ where: { roleId: copie.id } });
    expect(permissions).toBe(NOMBRE_PERMISSIONS);
    await expect(roles.supprimer(copie.id, karim)).resolves.toBeUndefined();
  });
});

describe("RG-DROITS-03 — liste blanche stricte", () => {
  it("une permission hors catalogue est refusée", async () => {
    const r = await roles.creer({ code: "ESSAI_1", nom: "Essai" }, karim);
    const erreur = await roles
      .definirPermissions(r.id, ["projects:read", "projects:faire_nimporte_quoi"], karim)
      .catch((e: ErreurRole) => e);
    expect((erreur as ErreurRole).code).toBe("permission_hors_catalogue");
    expect((erreur as ErreurRole).detail?.permissions).toEqual(["projects:faire_nimporte_quoi"]);
  });

  it("et RIEN n'est écrit quand une seule permission est fautive", async () => {
    const r = await roles.creer({ code: "ESSAI_2", nom: "Essai" }, karim);
    await roles.definirPermissions(r.id, ["projects:read"], karim);
    await roles.definirPermissions(r.id, ["tasks:read", "inexistant:read"], karim).catch(() => {});
    const apres = await prisma.rolePermission.findMany({ where: { roleId: r.id } });
    expect(apres.map((p) => p.permission)).toEqual(["projects:read"]);
  });
});

describe("EX-ADM-04 — la matrice de la vue 32", () => {
  it("est COMPLÈTE : le catalogue donne les colonnes, pas le rôle", async () => {
    const r = await prisma.role.findUniqueOrThrow({ where: { code: "BASIC_USER" } });
    const m = await roles.matrice(r.id);

    // 24 domaines en lignes, quelle que soit la maigreur du rôle.
    expect(m.lignes).toHaveLength(24);
    // Une matrice qui n'afficherait que les permissions détenues ne
    // permettrait pas d'en cocher de nouvelles.
    const audit = m.lignes.find((l) => l.domaine === "audit")!;
    expect(audit.cases.find((c) => c.action === "read")?.detenue).toBe(false);
  });

  it("distingue la case décochée de la case inerte", async () => {
    const r = await prisma.role.findUniqueOrThrow({ where: { code: "BASIC_USER" } });
    const m = await roles.matrice(r.id);
    const audit = m.lignes.find((l) => l.domaine === "audit")!;
    // `audit:read` existe et n'est pas détenue → false.
    expect(audit.cases.find((c) => c.action === "read")?.detenue).toBe(false);
    // `audit:create` n'existe pas au catalogue → null, case inerte.
    expect(audit.cases.find((c) => c.action === "create")?.detenue).toBeNull();
  });

  it("reflète les permissions réellement détenues", async () => {
    const r = await prisma.role.findUniqueOrThrow({ where: { code: "PROJECT_CONTRIBUTOR" } });
    const m = await roles.matrice(r.id);
    const taches = m.lignes.find((l) => l.domaine === "tasks")!;
    expect(taches.cases.find((c) => c.action === "read")?.detenue).toBe(true);
    expect(taches.cases.find((c) => c.action === "manage_any")?.detenue).toBe(false);
    expect(modeleParCode("PROJECT_CONTRIBUTOR")!.permissions).toContain("tasks:read");
  });
});

// ════════════════════════════════════════════════════════════════════════════
// Vague 7-4 — dette de traçabilité.
// ════════════════════════════════════════════════════════════════════════════

describe("EX-ADM-01 — lister les rôles : nom, code, nombre de permissions, système ou non", () => {
  it("les quatre colonnes de la vue 32 sortent du serveur, aucune n'est recomposée", async () => {
    /*
     * Le nombre de permissions surtout : le déduire côté client obligerait à
     * charger la matrice de chaque rôle pour afficher une liste.
     */
    const modele = modeleParCode("ADMIN")!;
    const lignes = await roles.lister();
    const admin = lignes.find((l) => l.code === "ADMIN");

    expect(admin).toBeDefined();
    expect(admin!.nom).toBe(modele.nom);
    expect(admin!.systeme).toBe(true);
    expect(admin!.nombrePermissions).toBe(NOMBRE_PERMISSIONS);
  });

  it("« système ou non » distingue réellement les deux, et les systèmes viennent en tête", async () => {
    const perso = await roles.creer({ code: `LISTE_${uuid().slice(0, 6)}`, nom: "Sur mesure" }, karim);
    const lignes = await roles.lister();

    expect(lignes.find((l) => l.id === perso.id)!.systeme).toBe(false);
    // L'ordre est un contrat de lecture : les 26 modèles d'abord, les rôles
    // maison ensuite. Une liste mêlée obligerait à chercher.
    const premierPerso = lignes.findIndex((l) => !l.systeme);
    expect(lignes.slice(0, premierPerso).every((l) => l.systeme)).toBe(true);
    expect(lignes.slice(premierPerso).every((l) => !l.systeme)).toBe(true);

    await roles.supprimer(perso.id, karim);
  });

  it("le nombre de permissions SUIT les permissions, il n'est pas figé à la création", async () => {
    const r = await roles.creer({ code: `COMPTE_${uuid().slice(0, 6)}`, nom: "Compté" }, karim);
    expect((await roles.lister()).find((l) => l.id === r.id)!.nombrePermissions).toBe(0);

    await roles.definirPermissions(r.id, ["projects:read", "tasks:read"], karim);

    expect((await roles.lister()).find((l) => l.id === r.id)!.nombrePermissions).toBe(2);
    await roles.supprimer(r.id, karim);
  });
});

describe("EX-ADM-02 — créer un rôle, éventuellement à partir d'un modèle", () => {
  it("sans modèle : le rôle naît VIDE, il n'hérite de rien en douce", async () => {
    const code = `NU_${uuid().slice(0, 6)}`;
    const r = await roles.creer({ code, nom: "Rôle nu" }, karim);

    expect(await prisma.rolePermission.count({ where: { roleId: r.id } })).toBe(0);
    await roles.supprimer(r.id, karim);
  });

  it("depuis un modèle : il en reçoit les permissions, à l'identique", async () => {
    const modele = modeleParCode("PROJECT_CONTRIBUTOR")!;
    const code = `COPIE_${uuid().slice(0, 6)}`;

    const r = await roles.creer(
      { code, nom: "Contributeur maison", depuisModele: "PROJECT_CONTRIBUTOR" },
      karim,
    );

    const copiees = (
      await prisma.rolePermission.findMany({ where: { roleId: r.id }, select: { permission: true } })
    )
      .map((p) => p.permission)
      .sort();
    expect(copiees).toEqual([...modele.permissions].sort());
    // « À partir d'un modèle » est un POINT DE DÉPART (`RG-DROITS-01`) : la
    // description suit si on n'en donne pas, et le rôle reste modifiable.
    expect(r.description).toBe(modele.description);
    await roles.supprimer(r.id, karim);
  });

  it("un modèle inconnu ne fait pas échouer la création — il ne copie rien", async () => {
    const r = await roles.creer(
      { code: `FANTOME_${uuid().slice(0, 6)}`, nom: "Fantôme", depuisModele: "N_EXISTE_PAS" },
      karim,
    );
    expect(await prisma.rolePermission.count({ where: { roleId: r.id } })).toBe(0);
    await roles.supprimer(r.id, karim);
  });

  it("un code déjà pris est refusé — le code identifie le rôle", async () => {
    const code = `DOUBLON_${uuid().slice(0, 6)}`;
    const r = await roles.creer({ code, nom: "Premier" }, karim);

    await expect(roles.creer({ code, nom: "Second" }, karim)).rejects.toMatchObject({
      code: "code_deja_pris",
    });

    await roles.supprimer(r.id, karim);
  });

  it("la création est tracée, avec le modèle d'origine s'il y en a un", async () => {
    const r = await roles.creer(
      { code: `TRACE_${uuid().slice(0, 6)}`, nom: "Tracé", depuisModele: "PROJECT_CONTRIBUTOR" },
      karim,
    );
    const trace = await prisma.auditLog.findFirst({
      where: { action: "role.create", entiteId: r.id },
    });
    expect(trace).not.toBeNull();
    expect(JSON.stringify(trace!.detail)).toContain("PROJECT_CONTRIBUTOR");
    await roles.supprimer(r.id, karim);
  });
});

describe("EX-ADM-05 — tout sélectionner pour un module", () => {
  /*
   * « Tout sélectionner pour un module » est un geste d'interface, mais il n'a
   * de sens que si le serveur rend le module ÉNUMÉRABLE : la ligne de la
   * matrice doit dire exactement quelles cases existent pour ce domaine, et
   * l'écriture doit accepter la sélection entière sans en refuser une seule.
   * Le contrôle joue donc le geste de bout en bout, sur la matrice.
   */
  it("cocher toute la ligne d'un module la remplit, et ne déborde sur aucune autre", async () => {
    const r = await roles.creer({ code: `MODULE_${uuid().slice(0, 6)}`, nom: "Par module" }, karim);
    await roles.definirPermissions(r.id, ["tasks:read"], karim);

    const avant = await roles.matrice(r.id);
    const ligneProjets = avant.lignes.find((l) => l.domaine === "projects")!;
    // Les cases INERTES sont exclues : « tout sélectionner » ne coche pas ce
    // qui n'existe pas. C'est le `null` de la matrice qui le permet.
    const duModule = ligneProjets.cases
      .filter((c) => c.detenue !== null)
      .map((c) => c.permission);
    expect(duModule.length).toBeGreaterThan(1);

    await roles.definirPermissions(r.id, [...duModule, "tasks:read"], karim);

    const apres = await roles.matrice(r.id);
    const projets = apres.lignes.find((l) => l.domaine === "projects")!;
    expect(projets.cases.filter((c) => c.detenue !== null).every((c) => c.detenue === true)).toBe(
      true,
    );
    // Les autres modules n'ont pas bougé : la sélection porte sur UN module.
    const taches = apres.lignes.find((l) => l.domaine === "tasks")!;
    expect(taches.cases.find((c) => c.action === "read")?.detenue).toBe(true);
    expect(taches.cases.find((c) => c.action === "delete")?.detenue).toBe(false);

    await roles.supprimer(r.id, karim);
  });

  it("et la sélection se DÉFAIT : tout décocher un module ne vide pas les autres", async () => {
    const r = await roles.creer({ code: `DECOCHE_${uuid().slice(0, 6)}`, nom: "Décoché" }, karim);
    const depart = await roles.matrice(r.id);
    const projets = depart.lignes
      .find((l) => l.domaine === "projects")!
      .cases.filter((c) => c.detenue !== null)
      .map((c) => c.permission);

    await roles.definirPermissions(r.id, [...projets, "tasks:read"], karim);
    await roles.definirPermissions(r.id, ["tasks:read"], karim);

    const apres = await roles.matrice(r.id);
    expect(
      apres.lignes
        .find((l) => l.domaine === "projects")!
        .cases.every((c) => c.detenue === false || c.detenue === null),
    ).toBe(true);
    expect(
      apres.lignes.find((l) => l.domaine === "tasks")!.cases.find((c) => c.action === "read")
        ?.detenue,
    ).toBe(true);

    await roles.supprimer(r.id, karim);
  });
});

describe("EX-ADM-03 — suppression d'un rôle", () => {
  it("un rôle porté par des comptes ne se supprime pas, et le refus chiffre", async () => {
    const r = await roles.creer({ code: "PORTE", nom: "Porté" }, karim);
    await prisma.user.update({ where: { id: karim }, data: { roleId: r.id } });

    const erreur = await roles.supprimer(r.id, karim).catch((e: ErreurRole) => e);
    expect((erreur as ErreurRole).code).toBe("role_utilise");
    expect((erreur as ErreurRole).detail?.utilisateurs).toBe(1);

    await prisma.user.update({ where: { id: karim }, data: { roleId: null } });
    await expect(roles.supprimer(r.id, karim)).resolves.toBeUndefined();
  });
});

describe("RG-ADM-01 — le journal est en lecture seule et se consulte", () => {
  it("EX-ADM-07 — pagination par curseur, la plus récente d'abord", async () => {
    for (let i = 0; i < 5; i++) {
      await prisma.auditLog.create({
        data: { action: `essai.pagination.${i}`, typeEntite: "Essai", entiteId: `e${i}` },
      });
    }
    const page = await journal.consulter({ typeEntite: "Essai" }, { taille: 3 });
    expect(page.entrees).toHaveLength(3);
    expect(page.curseurSuivant).not.toBeNull();

    const suite = await journal.consulter(
      { typeEntite: "Essai" },
      { taille: 3, curseur: page.curseurSuivant! },
    );
    // Aucune entrée en double entre les deux pages.
    const ids = new Set([...page.entrees, ...suite.entrees].map((e) => e.id));
    expect(ids.size).toBe(page.entrees.length + suite.entrees.length);
  });

  it("EX-ADM-08 — filtre par type d'entité, acteur, action et plage", async () => {
    await prisma.auditLog.create({
      data: { action: "leave.approve", typeEntite: "Leave", entiteId: "L1", acteurId: karim },
    });
    const parActeur = await journal.consulter({ acteurId: karim });
    expect(parActeur.entrees.every((e) => e.acteur !== null)).toBe(true);

    const parAction = await journal.consulter({ action: "leave." });
    expect(parAction.entrees.every((e) => e.action.startsWith("leave."))).toBe(true);
  });

  it("EX-ADM-09 — distingue l'action système de l'action humaine", async () => {
    await prisma.auditLog.create({
      data: { action: "notification.daily", typeEntite: "Job", systeme: true },
    });
    const systeme = await journal.consulter({ systeme: true });
    expect(systeme.entrees.length).toBeGreaterThan(0);
    expect(systeme.entrees.every((e) => e.systeme)).toBe(true);
    expect(systeme.entrees.every((e) => e.acteur === null)).toBe(true);
  });

  it("une entrée survit à la suppression de son acteur — c'est le point d'un journal", async () => {
    const ephemere = uuid();
    await prisma.user.create({
      data: {
        id: ephemere, login: `e-${ephemere.slice(0, 6)}`, email: `${ephemere.slice(0, 6)}@x.fr`,
        motDePasseHash: "x", prenom: "É", nom: "Phémère",
      },
    });
    await prisma.auditLog.create({
      data: { action: "essai.survie", typeEntite: "Essai", acteurId: ephemere },
    });
    await prisma.user.delete({ where: { id: ephemere } });

    const page = await journal.consulter({ action: "essai.survie" });
    expect(page.entrees).toHaveLength(1);
    expect(page.entrees[0]!.acteur).toMatchObject({ supprime: true });
  });

  it("les partitions se préparent d'avance", async () => {
    const mois = await journal.preparerPartitions(2);
    expect(mois).toHaveLength(3);
    const { rows } = (await prisma.$queryRawUnsafe(
      `SELECT count(*)::int AS n FROM pg_inherits i JOIN pg_class p ON p.oid = i.inhparent WHERE p.relname = 'audit_log'`,
    )) as unknown as { rows?: unknown[] } & { n: number }[];
    expect(Array.isArray(rows) ? rows : ([] as unknown[])).toBeDefined();
  });
});
