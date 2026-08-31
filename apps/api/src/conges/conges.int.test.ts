import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { creerClient, type PrismaClient } from "@rationarium/db";
import { CongesService, ErreurConge } from "./conges.service.js";
import { CalendrierService } from "../parametrage/calendrier.service.js";
import { AuditService } from "../commun/audit.service.js";
import { NotificationsService } from "../notifications/notifications.service.js";
import { FileService } from "../notifications/file.service.js";
import { PerimetreService } from "../commun/perimetre.service.js";

/**
 * L-15 — congés. Le module le plus riche en règles du cadrage, et la
 * criticité la plus haute avec l'authentification.
 */

const RACINE_DB = path.resolve(import.meta.dirname, "../../../../packages/db");
const utc = (s: string) => new Date(`${s}T00:00:00.000Z`);

let pg: StartedPostgreSqlContainer;
let prisma: PrismaClient;
let conges: CongesService;
let perimetres: PerimetreService;
let typeAvecValidation: string;
let typeSansValidation: string;

const uuid = () => crypto.randomUUID();

async function agent(departementId?: string) {
  const id = uuid();
  await prisma.user.create({
    data: {
      id, login: `u-${id.slice(0, 8)}`, email: `${id.slice(0, 8)}@x.fr`,
      motDePasseHash: "x", prenom: "A", nom: "T",
      ...(departementId ? { departementId } : {}),
    },
  });
  return id;
}

async function departement() {
  const id = uuid();
  await prisma.departement.create({ data: { id, nom: `D-${id.slice(0, 8)}` } });
  return id;
}

/** Un type de congé actif, avec un code unique. */
async function creerType() {
  const id = uuid();
  await prisma.leaveType.create({
    data: { id, code: `X${id.slice(0, 4)}`, nom: "Type" },
  });
  return id;
}

async function attribuer(userId: string | null, typeId: string, annee: number, jours: number) {
  await prisma.leaveBalance.create({
    data: { userId, typeId, annee, joursAttribues: jours },
  });
}

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
  const audit = new AuditService(prisma as never);
  perimetres = new PerimetreService(prisma as never);
  conges = new CongesService(
    prisma as never,
    audit,
    perimetres,
    new CalendrierService(prisma as never, audit),
    notifications,
  );

  const t1 = uuid();
  await prisma.leaveType.create({
    data: { id: t1, code: "CA", nom: "Congé annuel", validationRequise: true },
  });
  typeAvecValidation = t1;

  const t2 = uuid();
  await prisma.leaveType.create({
    data: { id: t2, code: "RTT", nom: "RTT", validationRequise: false },
  });
  typeSansValidation = t2;
}, 240_000);

afterAll(async () => {
  await prisma?.$disconnect();
  await pg?.stop();
});

describe("RG-CNG-20 — le solde compte les ENGAGÉS, pas seulement les consommés", () => {
  it("une demande en attente réserve son solde", async () => {
    const u = await agent();
    await attribuer(u, typeAvecValidation, 2026, 25);

    // Lundi 2 au vendredi 6 mars : 5 jours ouvrés.
    await conges.deposer(
      { userId: u, typeId: typeAvecValidation, dateDebut: utc("2026-03-02"), dateFin: utc("2026-03-06") },
      u,
    );

    const s = await conges.solde(u, typeAvecValidation, 2026);
    expect(s.attribues).toBe(25);
    expect(s.engages).toBe(5);
    expect(s.consommes).toBe(0);
    expect(s.disponibles).toBe(20);
  });

  it("sans cela, dix demandes couvrant tout le droit passeraient toutes", async () => {
    const u = await agent();
    await attribuer(u, typeAvecValidation, 2026, 10);

    await conges.deposer(
      { userId: u, typeId: typeAvecValidation, dateDebut: utc("2026-04-06"), dateFin: utc("2026-04-17") },
      u,
    );
    // 10 jours ouvrés déposés : le solde est à zéro, la suivante doit échouer.
    await expect(
      conges.deposer(
        { userId: u, typeId: typeAvecValidation, dateDebut: utc("2026-05-04"), dateFin: utc("2026-05-08") },
        u,
      ),
    ).rejects.toMatchObject({ code: "solde_insuffisant" });
  });

  it("RG-CNG-24 — le solde propre l'emporte sur le défaut global", async () => {
    const type = uuid();
    await prisma.leaveType.create({ data: { id: type, code: `X${type.slice(0, 4)}`, nom: "Type" } });
    await attribuer(null, type, 2026, 5);
    const parDefaut = await agent();
    const specifique = await agent();
    await attribuer(specifique, type, 2026, 30);

    expect((await conges.solde(parDefaut, type, 2026)).attribues).toBe(5);
    expect((await conges.solde(specifique, type, 2026)).attribues).toBe(30);
  });
});

describe("RG-CNG-21 — le refus de solde est CHIFFRÉ", () => {
  it("dit les jours demandés, disponibles et manquants, pour l'année concernée", async () => {
    const u = await agent();
    await attribuer(u, typeAvecValidation, 2026, 3);

    const erreur = await conges
      .deposer(
        { userId: u, typeId: typeAvecValidation, dateDebut: utc("2026-06-01"), dateFin: utc("2026-06-05") },
        u,
      )
      .catch((e: ErreurConge) => e);

    expect((erreur as ErreurConge).code).toBe("solde_insuffisant");
    // « Solde insuffisant » sans chiffres oblige l'agent à les chercher ailleurs.
    expect((erreur as ErreurConge).detail).toMatchObject({
      annee: 2026, demandes: 5, disponibles: 3, manquants: 2,
    });
  });
});

describe("RG-CNG-19 — une demande à cheval sur deux années", () => {
  it("est répartie, et CHAQUE année est contrôlée contre son propre solde", async () => {
    const u = await agent();
    await attribuer(u, typeAvecValidation, 2026, 25);
    await attribuer(u, typeAvecValidation, 2027, 25);

    const c = await conges.deposer(
      { userId: u, typeId: typeAvecValidation, dateDebut: utc("2026-12-28"), dateFin: utc("2027-01-08") },
      u,
    );

    const parts = await prisma.leaveYearAllocation.findMany({ where: { leaveId: c.id } });
    expect(parts.map((p) => p.annee).sort()).toEqual([2026, 2027]);
    expect(parts.reduce((n, p) => n + Number(p.jours), 0)).toBe(Number(c.joursOuvres));
  });

  it("un solde suffisant sur une seule des deux années ne suffit pas", async () => {
    const u = await agent();
    await attribuer(u, typeAvecValidation, 2026, 25);
    await attribuer(u, typeAvecValidation, 2027, 1);

    await expect(
      conges.deposer(
        { userId: u, typeId: typeAvecValidation, dateDebut: utc("2026-12-28"), dateFin: utc("2027-01-08") },
        u,
      ),
    ).rejects.toMatchObject({ code: "solde_insuffisant", detail: { annee: 2027 } });
  });
});

describe("RG-CNG-25..27 — chevauchement", () => {
  it("une demande chevauchant un congé approuvé est refusée", async () => {
    const u = await agent();
    await attribuer(u, typeSansValidation, 2026, 25);
    await conges.deposer(
      { userId: u, typeId: typeSansValidation, dateDebut: utc("2026-09-07"), dateFin: utc("2026-09-11") },
      u,
    );
    await expect(
      conges.deposer(
        { userId: u, typeId: typeSansValidation, dateDebut: utc("2026-09-09"), dateFin: utc("2026-09-15") },
        u,
      ),
    ).rejects.toMatchObject({ code: "chevauchement" });
  });

  it("un congé refusé ne bloque plus", async () => {
    const u = await agent();
    await attribuer(u, typeAvecValidation, 2026, 25);
    const c = await conges.deposer(
      { userId: u, typeId: typeAvecValidation, dateDebut: utc("2026-10-05"), dateFin: utc("2026-10-09") },
      u,
    );
    await conges.refuser(c.id, "Effectif insuffisant", await agent());
    await expect(
      conges.deposer(
        { userId: u, typeId: typeAvecValidation, dateDebut: utc("2026-10-05"), dateFin: utc("2026-10-09") },
        u,
      ),
    ).resolves.toBeTruthy();
  });

  it("la base refuse aussi, indépendamment du contrôle applicatif", async () => {
    const u = await agent();
    await attribuer(u, typeSansValidation, 2026, 25);
    await conges.deposer(
      { userId: u, typeId: typeSansValidation, dateDebut: utc("2026-11-02"), dateFin: utc("2026-11-06") },
      u,
    );
    // Écriture directe, contournant le service : la contrainte GiST doit tenir.
    await expect(
      prisma.leave.create({
        data: {
          userId: u, typeId: typeSansValidation,
          dateDebut: utc("2026-11-04"), dateFin: utc("2026-11-10"),
          joursOuvres: 5, statut: "approved",
        },
      }),
    ).rejects.toThrow(/leaves_pas_de_chevauchement|exclusion/i);
  });
});

describe("RG-CNG-13, RG-CNG-14 — approbation automatique", () => {
  it("un type sans validation requise est approuvé directement", async () => {
    const u = await agent();
    await attribuer(u, typeSansValidation, 2026, 25);
    const c = await conges.deposer(
      { userId: u, typeId: typeSansValidation, dateDebut: utc("2026-07-06"), dateFin: utc("2026-07-08") },
      u,
    );
    expect(c.statut).toBe("approved");
    expect(c.decideLe).not.toBeNull();
  });

  it("un congé déclaré par un manager pour un collaborateur est approuvé, et tracé à SON nom", async () => {
    const manager = await agent();
    const collaborateur = await agent();
    await attribuer(collaborateur, typeAvecValidation, 2026, 25);

    const c = await conges.deposer(
      {
        userId: collaborateur, typeId: typeAvecValidation,
        dateDebut: utc("2026-08-03"), dateFin: utc("2026-08-07"),
      },
      manager,
    );
    expect(c.statut).toBe("approved");
    expect(c.validateurId).toBe(manager);

    const trace = await prisma.auditLog.findFirst({
      where: { entiteId: c.id, action: "leave.create_approved" },
    });
    expect(trace?.acteurId).toBe(manager);
  });
});

describe("RG-CNG-10 — la délégation est CANTONNÉE au département du demandeur", () => {
  it("un délégué du département B ne valide JAMAIS pour un agent du département A", async () => {
    const deptA = await departement();
    const deptB = await departement();

    const managerA = await agent(deptA);
    const agentA = await agent(deptA);
    const delegueB = await agent(deptB);

    await prisma.departement.update({
      where: { id: deptA },
      data: { responsableId: managerA },
    });

    // Le manager de A délègue à quelqu'un de B.
    await conges.creerDelegation(
      { delegantId: managerA, delegueId: delegueB, dateDebut: utc("2026-01-01"), dateFin: utc("2026-12-31") },
      managerA,
    );

    // Une délégation lue sans cantonnement ouvrirait la validation des congés
    // du département A à quelqu'un qui n'y a aucun rôle.
    const validateur = await conges.determinerValidateur(agentA, utc("2026-06-01"));
    expect(validateur).toBe(managerA);
    expect(validateur).not.toBe(delegueB);
  });

  it("un délégué du MÊME département prend bien la main", async () => {
    const dept = await departement();
    const manager = await agent(dept);
    const agentDuDept = await agent(dept);
    const delegue = await agent(dept);

    await prisma.departement.update({ where: { id: dept }, data: { responsableId: manager } });
    await conges.creerDelegation(
      { delegantId: manager, delegueId: delegue, dateDebut: utc("2026-01-01"), dateFin: utc("2026-12-31") },
      manager,
    );

    expect(await conges.determinerValidateur(agentDuDept, utc("2026-06-01"))).toBe(delegue);
  });

  it("hors de la période de délégation, le délégant reprend la main", async () => {
    const dept = await departement();
    const manager = await agent(dept);
    const agentDuDept = await agent(dept);
    const delegue = await agent(dept);

    await prisma.departement.update({ where: { id: dept }, data: { responsableId: manager } });
    await conges.creerDelegation(
      { delegantId: manager, delegueId: delegue, dateDebut: utc("2026-07-01"), dateFin: utc("2026-07-31") },
      manager,
    );

    expect(await conges.determinerValidateur(agentDuDept, utc("2026-07-15"))).toBe(delegue);
    expect(await conges.determinerValidateur(agentDuDept, utc("2026-09-15"))).toBe(manager);
  });

  it("RG-CNG-11 — un délégué inactif est refusé", async () => {
    const manager = await agent();
    const inactif = await agent();
    await prisma.user.update({ where: { id: inactif }, data: { actif: false } });
    await expect(
      conges.creerDelegation(
        { delegantId: manager, delegueId: inactif, dateDebut: utc("2026-01-01"), dateFin: utc("2026-12-31") },
        manager,
      ),
    ).rejects.toMatchObject({ code: "delegue_inactif" });
  });

  it("RG-CNG-12 — seul le délégant, ou un administrateur, désactive", async () => {
    const manager = await agent();
    const delegue = await agent();
    const tiers = await agent();
    const d = await conges.creerDelegation(
      { delegantId: manager, delegueId: delegue, dateDebut: utc("2026-01-01"), dateFin: utc("2026-12-31") },
      manager,
    );

    await expect(conges.desactiverDelegation(d.id, tiers, new Set())).rejects.toMatchObject({
      code: "hors_perimetre",
    });
    await expect(
      conges.desactiverDelegation(d.id, tiers, new Set(["leaves:manage_delegations"])),
    ).resolves.toBeUndefined();
  });
});

describe("RG-CNG-22 — le solde est REJOUÉ à l'approbation", () => {
  it("une allocation réduite entre-temps fait échouer l'approbation", async () => {
    const u = await agent();
    const validateur = await agent();
    await attribuer(u, typeAvecValidation, 2026, 10);

    const c = await conges.deposer(
      { userId: u, typeId: typeAvecValidation, dateDebut: utc("2026-02-02"), dateFin: utc("2026-02-06") },
      u,
    );

    // L'administration réduit le droit annuel après le dépôt.
    await prisma.leaveBalance.updateMany({
      where: { userId: u, typeId: typeAvecValidation, annee: 2026 },
      data: { joursAttribues: 2 },
    });

    await expect(conges.approuver(c.id, validateur, new Set())).rejects.toMatchObject({
      code: "solde_insuffisant",
    });

    // Le congé reste en attente : on n'écrit pas contre une réalité différente.
    const apres = await prisma.leave.findUniqueOrThrow({ where: { id: c.id } });
    expect(apres.statut).toBe("pending");
  });

  it("un solde toujours suffisant laisse passer l'approbation", async () => {
    const u = await agent();
    const validateur = await agent();
    await attribuer(u, typeAvecValidation, 2026, 25);
    const c = await conges.deposer(
      { userId: u, typeId: typeAvecValidation, dateDebut: utc("2026-02-09"), dateFin: utc("2026-02-13") },
      u,
    );
    await conges.approuver(c.id, validateur, new Set());

    const apres = await prisma.leave.findUniqueOrThrow({ where: { id: c.id } });
    expect(apres.statut).toBe("approved");

    const s = await conges.solde(u, typeAvecValidation, 2026);
    expect(s.consommes).toBe(5);
    expect(s.engages).toBe(0);
  });
});

describe("RG-CNG-09 — nul n'approuve sa propre demande", () => {
  it("sans permission d'auto-validation, c'est refusé", async () => {
    const u = await agent();
    await attribuer(u, typeAvecValidation, 2026, 25);
    const c = await conges.deposer(
      { userId: u, typeId: typeAvecValidation, dateDebut: utc("2026-03-09"), dateFin: utc("2026-03-13") },
      u,
    );
    await expect(conges.approuver(c.id, u, new Set())).rejects.toMatchObject({
      code: "auto_validation_interdite",
    });
  });

  it("avec la permission, c'est permis ET TRACÉ comme tel", async () => {
    const u = await agent();
    await attribuer(u, typeAvecValidation, 2026, 25);
    const c = await conges.deposer(
      { userId: u, typeId: typeAvecValidation, dateDebut: utc("2026-03-16"), dateFin: utc("2026-03-20") },
      u,
    );
    await conges.approuver(c.id, u, new Set(["leaves:self_approve"]));

    const apres = await prisma.leave.findUniqueOrThrow({ where: { id: c.id } });
    expect(apres.statut).toBe("approved");
    // Le cadrage exige que le cas soit tracé comme tel.
    expect(apres.autoValide).toBe(true);
  });
});

describe("RG-CNG-01 à 07 — cycle de vie", () => {
  it("RG-CNG-04 — un congé approuvé ne s'annule pas directement", async () => {
    const u = await agent();
    await attribuer(u, typeSansValidation, 2026, 25);
    const c = await conges.deposer(
      { userId: u, typeId: typeSansValidation, dateDebut: utc("2026-04-06"), dateFin: utc("2026-04-10") },
      u,
    );
    expect(c.statut).toBe("approved");

    // Il passe par une demande d'annulation.
    await conges.demanderAnnulation(c.id, u);
    const apres = await prisma.leave.findUniqueOrThrow({ where: { id: c.id } });
    expect(apres.statut).toBe("cancellation_requested");
  });

  it("RG-CNG-07 — on ne demande l'annulation que de SES congés", async () => {
    const u = await agent();
    const autre = await agent();
    await attribuer(u, typeSansValidation, 2026, 25);
    const c = await conges.deposer(
      { userId: u, typeId: typeSansValidation, dateDebut: utc("2026-05-04"), dateFin: utc("2026-05-08") },
      u,
    );
    await expect(conges.demanderAnnulation(c.id, autre)).rejects.toMatchObject({
      code: "pas_son_conge",
    });
  });

  it("EX-CNG-07, RG-CNG-06 — une annulation refusée rend le congé à l'état approuvé", async () => {
    const u = await agent();
    const validateur = await agent();
    await attribuer(u, typeSansValidation, 2026, 25);
    const c = await conges.deposer(
      { userId: u, typeId: typeSansValidation, dateDebut: utc("2026-06-01"), dateFin: utc("2026-06-05") },
      u,
    );
    await conges.demanderAnnulation(c.id, u);
    await conges.traiterAnnulation(c.id, false, validateur);

    const apres = await prisma.leave.findUniqueOrThrow({ where: { id: c.id } });
    expect(apres.statut).toBe("approved");
  });

  it("RG-CNG-03 — seules les demandes en attente ou refusées se suppriment", async () => {
    const u = await agent();
    await attribuer(u, typeSansValidation, 2026, 25);
    const approuve = await conges.deposer(
      { userId: u, typeId: typeSansValidation, dateDebut: utc("2026-06-08"), dateFin: utc("2026-06-12") },
      u,
    );
    await expect(conges.supprimer(approuve.id, u)).rejects.toMatchObject({
      code: "statut_incompatible",
    });

    await attribuer(u, typeAvecValidation, 2026, 25);
    const enAttente = await conges.deposer(
      { userId: u, typeId: typeAvecValidation, dateDebut: utc("2026-06-15"), dateFin: utc("2026-06-19") },
      u,
    );
    await expect(conges.supprimer(enAttente.id, u)).resolves.toBeUndefined();
  });

  it("RG-CNG-02 — une demande déjà décidée ne se réapprouve pas", async () => {
    const u = await agent();
    const validateur = await agent();
    await attribuer(u, typeAvecValidation, 2026, 25);
    const c = await conges.deposer(
      { userId: u, typeId: typeAvecValidation, dateDebut: utc("2026-09-14"), dateFin: utc("2026-09-18") },
      u,
    );
    await conges.approuver(c.id, validateur, new Set());
    await expect(conges.approuver(c.id, validateur, new Set())).rejects.toMatchObject({
      code: "statut_incompatible",
    });
  });
});

describe("RG-CNG-29 à 31 — référentiel des types", () => {
  it("un type désactivé n'est plus sélectionnable", async () => {
    const type = uuid();
    await prisma.leaveType.create({
      data: { id: type, code: `Z${type.slice(0, 4)}`, nom: "Désactivé", actif: false },
    });
    const u = await agent();
    await attribuer(u, type, 2026, 25);
    await expect(
      conges.deposer(
        { userId: u, typeId: type, dateDebut: utc("2026-10-12"), dateFin: utc("2026-10-16") },
        u,
      ),
    ).rejects.toMatchObject({ code: "type_inactif" });
  });

  it("EX-CNG-13, RG-CNG-31 — un type utilisé est DÉSACTIVÉ, pas supprimé, et le compte est rendu", async () => {
    const type = uuid();
    await prisma.leaveType.create({ data: { id: type, code: `U${type.slice(0, 4)}`, nom: "Utilisé" } });
    const u = await agent();
    await attribuer(u, type, 2026, 25);
    await conges.deposer(
      { userId: u, typeId: type, dateDebut: utc("2026-11-09"), dateFin: utc("2026-11-13") },
      u,
    );

    const r = await conges.supprimerType(type, u);
    expect(r.desactive).toBe(true);
    expect(r.conges).toBe(1);
    expect(await prisma.leaveType.findUnique({ where: { id: type } })).not.toBeNull();
  });

  it("RG-CNG-30 — un type SYSTÈME est désactivé même sans congé", async () => {
    const type = uuid();
    await prisma.leaveType.create({
      data: { id: type, code: `S${type.slice(0, 4)}`, nom: "Système", systeme: true },
    });
    const r = await conges.supprimerType(type, await agent());
    expect(r.desactive).toBe(true);
    expect(r.systeme).toBe(true);
  });

  it("un type inutilisé et non système se supprime réellement", async () => {
    const type = uuid();
    await prisma.leaveType.create({ data: { id: type, code: `L${type.slice(0, 4)}`, nom: "Libre" } });
    const r = await conges.supprimerType(type, await agent());
    expect(r.desactive).toBe(false);
    expect(await prisma.leaveType.findUnique({ where: { id: type } })).toBeNull();
  });
});

describe("EX-CNG-01 — consultation filtrée", () => {
  it("« à valider » ne rend que ce qui attend CET acteur", async () => {
    const dept = await departement();
    const manager = await agent(dept);
    const agentDuDept = await agent(dept);
    await prisma.departement.update({ where: { id: dept }, data: { responsableId: manager } });
    await attribuer(agentDuDept, typeAvecValidation, 2026, 25);

    await conges.deposer(
      {
        userId: agentDuDept, typeId: typeAvecValidation,
        dateDebut: utc("2026-12-07"), dateFin: utc("2026-12-11"),
      },
      agentDuDept,
    );

    const p = await perimetres.resoudre(manager, new Set(["leaves:manage_any"]));
    const aValider = await conges.lister(p, { aValider: true }, manager);
    expect(aValider.length).toBeGreaterThan(0);
    expect(aValider.every((c) => c.validateurId === manager)).toBe(true);
  });
});

describe("RG-CNG-24 — les jours S'ATTRIBUENT, par beneficiaire ou globalement", () => {
  /*
   * Rien ne les attribuait. `leaveBalance` n'était écrite nulle part : ni
   * route, ni import, ni amorçage. Sur une instance neuve, `attribues` valait
   * zéro pour tout le monde et `RG-CNG-20` refusait TOUTE demande — le module
   * entier était inutilisable.
   *
   * Aucun contrôle ne pouvait le dire : chaque test fabriquait son allocation
   * en base avant de commencer, donc chacun mesurait un monde où le problème
   * n'existe pas. C'est le même piège que celui du jeu d'essai qui ment avec
   * le code, sous une autre forme.
   */
  it("une allocation propre à l'beneficiaire ouvre son solde", async () => {
    const beneficiaire = await agent();
    const type = await creerType();

    expect((await conges.solde(beneficiaire, type, 2026)).attribues).toBe(0);
    await conges.attribuerSolde(
      { userId: beneficiaire, typeId: type, annee: 2026, joursAttribues: 25 },
      beneficiaire,
    );
    expect((await conges.solde(beneficiaire, type, 2026)).attribues).toBe(25);
  });

  it("le défaut global sert tout le monde, et l'allocation propre le SURCLASSE", async () => {
    const a = await agent();
    const b = await agent();
    const type = await creerType();

    await conges.attribuerSolde(
      { userId: null, typeId: type, annee: 2026, joursAttribues: 25 },
      a,
    );
    expect((await conges.solde(a, type, 2026)).attribues).toBe(25);
    expect((await conges.solde(b, type, 2026)).attribues).toBe(25);

    await conges.attribuerSolde({ userId: b, typeId: type, annee: 2026, joursAttribues: 30 }, a);
    expect((await conges.solde(b, type, 2026)).attribues).toBe(30);
    // Le défaut n'a pas bougé pour les autres.
    expect((await conges.solde(a, type, 2026)).attribues).toBe(25);
  });

  it("réattribuer met à jour, sans créer de seconde ligne", async () => {
    const beneficiaire = await agent();
    const type = await creerType();
    await conges.attribuerSolde({ userId: beneficiaire, typeId: type, annee: 2026, joursAttribues: 25 }, beneficiaire);
    await conges.attribuerSolde({ userId: beneficiaire, typeId: type, annee: 2026, joursAttribues: 28 }, beneficiaire);

    expect((await conges.solde(beneficiaire, type, 2026)).attribues).toBe(28);
    expect(
      await prisma.leaveBalance.count({ where: { userId: beneficiaire, typeId: type, annee: 2026 } }),
    ).toBe(1);
  });

  it("RG-GEN-07 — une version périmée est REFUSÉE, jamais écrasée", async () => {
    const beneficiaire = await agent();
    const type = await creerType();
    const pose = await conges.attribuerSolde(
      { userId: beneficiaire, typeId: type, annee: 2026, joursAttribues: 25 },
      beneficiaire,
    );
    // Quelqu'un d'autre passe entre-temps.
    await conges.attribuerSolde({ userId: beneficiaire, typeId: type, annee: 2026, joursAttribues: 30 }, beneficiaire);

    await expect(
      conges.attribuerSolde(
        { userId: beneficiaire, typeId: type, annee: 2026, joursAttribues: 12, version: pose.version },
        beneficiaire,
      ),
    ).rejects.toMatchObject({ code: "allocation_modifiee" });
    // La valeur du second reste : rien n'a été écrasé.
    expect((await conges.solde(beneficiaire, type, 2026)).attribues).toBe(30);
  });

  it("un type inactif n'accepte pas d'attribution", async () => {
    const beneficiaire = await agent();
    const type = await creerType();
    await prisma.leaveType.update({ where: { id: type }, data: { actif: false } });

    await expect(
      conges.attribuerSolde({ userId: beneficiaire, typeId: type, annee: 2026, joursAttribues: 25 }, beneficiaire),
    ).rejects.toMatchObject({ code: "type_inactif" });
  });

  it("RG-ADM — l'attribution est tracée, avec l'avant et l'après", async () => {
    const beneficiaire = await agent();
    const type = await creerType();
    await conges.attribuerSolde({ userId: beneficiaire, typeId: type, annee: 2026, joursAttribues: 25 }, beneficiaire);
    await conges.attribuerSolde({ userId: beneficiaire, typeId: type, annee: 2026, joursAttribues: 30 }, beneficiaire);

    const trace = await prisma.auditLog.findFirst({
      where: { action: "leave.balance_set" },
      orderBy: { horodatage: "desc" },
    });
    expect(JSON.stringify(trace?.detail)).toContain("25");
    expect(JSON.stringify(trace?.detail)).toContain("30");
  });
});
