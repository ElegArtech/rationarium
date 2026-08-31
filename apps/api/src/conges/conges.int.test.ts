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
    const pose = await conges.attribuerSolde(
      { userId: beneficiaire, typeId: type, annee: 2026, joursAttribues: 25 },
      beneficiaire,
    );
    // La seconde attribution porte la version lue : depuis la correction de
    // `RG-CNG-23`, une réattribution sans version est traitée comme un conflit.
    await conges.attribuerSolde(
      { userId: beneficiaire, typeId: type, annee: 2026, joursAttribues: 28, version: pose.version },
      beneficiaire,
    );

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
    // Quelqu'un d'autre passe entre-temps, avec la version qu'il vient de lire.
    await conges.attribuerSolde(
      { userId: beneficiaire, typeId: type, annee: 2026, joursAttribues: 30, version: pose.version },
      beneficiaire,
    );

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
    const pose = await conges.attribuerSolde(
      { userId: beneficiaire, typeId: type, annee: 2026, joursAttribues: 25 },
      beneficiaire,
    );
    await conges.attribuerSolde(
      { userId: beneficiaire, typeId: type, annee: 2026, joursAttribues: 30, version: pose.version },
      beneficiaire,
    );

    const trace = await prisma.auditLog.findFirst({
      where: { action: "leave.balance_set" },
      orderBy: { horodatage: "desc" },
    });
    expect(JSON.stringify(trace?.detail)).toContain("25");
    expect(JSON.stringify(trace?.detail)).toContain("30");
  });
});

/* ══════════════════════════════════════════════════════════════════════════ *
 *  Les exigences et règles que `design/tracabilite.json` portait encore en   *
 *  dette pour le module M10.                                                *
 *                                                                            *
 *  Chaque assertion est écrite depuis le texte de `cadrage/01`, pas depuis   *
 *  le code : c'est la seule façon qu'un test a de trouver un écart plutôt    *
 *  que de le figer. Deux d'entre elles ont trouvé un défaut réel :   *
 *  le troisième échelon du validateur, qui n'existait pas, et la version    *
 *  facultative de l'attribution de solde. Les deux sont corrigés.          *
 * ══════════════════════════════════════════════════════════════════════════ */

/** Un service, éventuellement doté d'un manager. */
async function creerService(departementId: string, managerId?: string) {
  const id = uuid();
  await prisma.service.create({
    data: {
      id,
      nom: `S-${id.slice(0, 8)}`,
      departementId,
      ...(managerId ? { managerId } : {}),
    },
  });
  return id;
}

async function rattacher(userId: string, serviceId: string) {
  await prisma.userService.create({ data: { userId, serviceId } });
}

const jourDe = (d: Date) => d.toISOString().slice(0, 10);

describe("EX-CNG-02 — créer une demande : type, dates, demi-journée, motif", () => {
  it("EX-CNG-02 — les quatre attributs déposés sont ceux qu'on relit", async () => {
    const u = await agent();
    await attribuer(u, typeAvecValidation, 2027, 25);

    const conge = await conges.deposer(
      {
        userId: u,
        typeId: typeAvecValidation,
        dateDebut: utc("2027-03-01"),
        dateFin: utc("2027-03-05"),
        demiJourneeDebut: "afternoon",
        motif: "Semaine de mars",
      },
      u,
    );

    const relu = await prisma.leave.findUniqueOrThrow({ where: { id: conge.id } });
    expect(relu.userId).toBe(u);
    expect(relu.typeId).toBe(typeAvecValidation);
    expect(jourDe(relu.dateDebut)).toBe("2027-03-01");
    expect(jourDe(relu.dateFin)).toBe("2027-03-05");
    expect(relu.demiJourneeDebut).toBe("afternoon");
    expect(relu.demiJourneeFin).toBeNull();
    expect(relu.motif).toBe("Semaine de mars");
    // Le type exige une validation : la demande naît en attente, pas approuvée.
    expect(relu.statut).toBe("pending");
  });

  it("EX-CNG-02 — la demi-journée entre au décompte, en début comme en fin", async () => {
    const entiere = await agent();
    const debut = await agent();
    const fin = await agent();
    const deuxBouts = await agent();
    for (const u of [entiere, debut, fin, deuxBouts]) {
      await attribuer(u, typeAvecValidation, 2027, 25);
    }

    const plage = { dateDebut: utc("2027-03-15"), dateFin: utc("2027-03-19") } as const;
    const deposer = async (userId: string, demi: Record<string, unknown>) =>
      Number(
        (await conges.deposer({ userId, typeId: typeAvecValidation, ...plage, ...demi }, userId))
          .joursOuvres,
      );

    // Lundi 15 au vendredi 19 mars 2027 : cinq jours ouvrés pleins.
    expect(await deposer(entiere, {})).toBe(5);
    expect(await deposer(debut, { demiJourneeDebut: "afternoon" })).toBe(4.5);
    expect(await deposer(fin, { demiJourneeFin: "morning" })).toBe(4.5);
    expect(
      await deposer(deuxBouts, { demiJourneeDebut: "afternoon", demiJourneeFin: "morning" }),
    ).toBe(4);
  });
});

describe("EX-CNG-03 — modifier une demande en attente", () => {
  it("EX-CNG-03 — les dates, la demi-journée et le motif changent, et le décompte est REFAIT", async () => {
    const u = await agent();
    await attribuer(u, typeAvecValidation, 2027, 25);

    const conge = await conges.deposer(
      {
        userId: u,
        typeId: typeAvecValidation,
        dateDebut: utc("2027-05-03"),
        dateFin: utc("2027-05-07"),
        motif: "Première idée",
      },
      u,
    );
    expect(Number(conge.joursOuvres)).toBe(5);

    await conges.modifier(
      conge.id,
      {
        dateDebut: utc("2027-05-03"),
        dateFin: utc("2027-05-05"),
        demiJourneeFin: "morning",
        motif: "Finalement trois jours",
      },
      u,
    );

    const relu = await prisma.leave.findUniqueOrThrow({
      where: { id: conge.id },
      include: { repartitions: true },
    });
    expect(jourDe(relu.dateFin)).toBe("2027-05-05");
    expect(relu.demiJourneeFin).toBe("morning");
    expect(relu.motif).toBe("Finalement trois jours");
    // Lundi 3 au mercredi 5, moins l'après-midi du 5 : 2,5 jours.
    expect(Number(relu.joursOuvres)).toBe(2.5);
    // La répartition suit, sinon le solde continuerait de retenir cinq jours.
    expect(relu.repartitions.map((r) => [r.annee, Number(r.jours)])).toEqual([[2027, 2.5]]);
    expect((await conges.solde(u, typeAvecValidation, 2027)).engages).toBe(2.5);
  });

  it("EX-CNG-03 — une demande DÉJÀ DÉCIDÉE ne se modifie plus", async () => {
    const u = await agent();
    await attribuer(u, typeSansValidation, 2027, 25);

    // Type sans validation : la demande naît approuvée.
    const conge = await conges.deposer(
      {
        userId: u,
        typeId: typeSansValidation,
        dateDebut: utc("2027-06-07"),
        dateFin: utc("2027-06-11"),
      },
      u,
    );
    expect(conge.statut).toBe("approved");

    await expect(
      conges.modifier(conge.id, { dateDebut: utc("2027-06-07"), dateFin: utc("2027-06-09") }, u),
    ).rejects.toMatchObject({ code: "statut_incompatible" });

    const relu = await prisma.leave.findUniqueOrThrow({ where: { id: conge.id } });
    expect(jourDe(relu.dateFin)).toBe("2027-06-11");
  });
});

describe("RG-CNG-27 — une modification créant un chevauchement est refusée", () => {
  it("RG-CNG-27 — étendre une demande jusque sur une autre est refusé, et la demande reste INTACTE", async () => {
    const u = await agent();
    await attribuer(u, typeAvecValidation, 2027, 25);

    const enMars = await conges.deposer(
      {
        userId: u,
        typeId: typeAvecValidation,
        dateDebut: utc("2027-03-01"),
        dateFin: utc("2027-03-05"),
      },
      u,
    );
    const enAvril = await conges.deposer(
      {
        userId: u,
        typeId: typeAvecValidation,
        dateDebut: utc("2027-04-05"),
        dateFin: utc("2027-04-09"),
      },
      u,
    );

    // Ramener la demande d'avril sur mars la ferait mordre sur la première.
    await expect(
      conges.modifier(enAvril.id, { dateDebut: utc("2027-03-03"), dateFin: utc("2027-04-09") }, u),
    ).rejects.toMatchObject({ code: "chevauchement" });

    const relu = await prisma.leave.findUniqueOrThrow({ where: { id: enAvril.id } });
    expect(jourDe(relu.dateDebut)).toBe("2027-04-05");
    expect(Number(relu.joursOuvres)).toBe(5);
    // Et la demande visée n'a rien perdu non plus.
    const premiere = await prisma.leave.findUniqueOrThrow({ where: { id: enMars.id } });
    expect(jourDe(premiere.dateFin)).toBe("2027-03-05");
  });

  it("RG-CNG-27 — une demande qui ne chevauche QU'ELLE-MÊME se modifie sans obstacle", async () => {
    const u = await agent();
    await attribuer(u, typeAvecValidation, 2027, 25);

    const conge = await conges.deposer(
      {
        userId: u,
        typeId: typeAvecValidation,
        dateDebut: utc("2027-03-15"),
        dateFin: utc("2027-03-19"),
      },
      u,
    );

    // Sans l'exclusion de sa propre ligne, ce prolongement se refuserait
    // lui-même : la nouvelle plage recouvre l'ancienne.
    await conges.modifier(conge.id, { dateDebut: utc("2027-03-15"), dateFin: utc("2027-03-26") }, u);

    const relu = await prisma.leave.findUniqueOrThrow({ where: { id: conge.id } });
    expect(jourDe(relu.dateFin)).toBe("2027-03-26");
    expect(Number(relu.joursOuvres)).toBe(10);
  });
});

describe("EX-CNG-04 — supprimer une demande", () => {
  it("EX-CNG-04 — la demande disparaît AVEC sa répartition, et le solde engagé est rendu", async () => {
    const u = await agent();
    await attribuer(u, typeAvecValidation, 2027, 25);

    const conge = await conges.deposer(
      {
        userId: u,
        typeId: typeAvecValidation,
        dateDebut: utc("2027-09-06"),
        dateFin: utc("2027-09-10"),
      },
      u,
    );
    expect((await conges.solde(u, typeAvecValidation, 2027)).engages).toBe(5);

    await conges.supprimer(conge.id, u);

    expect(await prisma.leave.findUnique({ where: { id: conge.id } })).toBeNull();
    // Une répartition orpheline laisserait le solde retenu sans demande visible.
    expect(await prisma.leaveYearAllocation.count({ where: { leaveId: conge.id } })).toBe(0);
    const solde = await conges.solde(u, typeAvecValidation, 2027);
    expect(solde.engages).toBe(0);
    expect(solde.disponibles).toBe(25);
  });

  it("EX-CNG-04 — la suppression est tracée AVANT l'effacement, sinon elle ne laisserait aucune trace", async () => {
    const u = await agent();
    await attribuer(u, typeAvecValidation, 2027, 25);
    const conge = await conges.deposer(
      {
        userId: u,
        typeId: typeAvecValidation,
        dateDebut: utc("2027-10-04"),
        dateFin: utc("2027-10-08"),
      },
      u,
    );

    await conges.supprimer(conge.id, u);

    const trace = await prisma.auditLog.findFirst({
      where: { action: "leave.delete", entiteId: conge.id },
    });
    expect(trace).not.toBeNull();
    expect(trace?.acteurId).toBe(u);
  });
});

describe("EX-CNG-06 — demander l'annulation d'un congé approuvé", () => {
  /** Un congé approuvé, par le chemin du type sans validation requise. */
  async function congeApprouve(annee: number) {
    const u = await agent();
    await attribuer(u, typeSansValidation, annee, 25);
    const conge = await conges.deposer(
      {
        userId: u,
        typeId: typeSansValidation,
        dateDebut: utc(`${annee}-11-01`),
        dateFin: utc(`${annee}-11-05`),
      },
      u,
    );
    return { u, conge };
  }

  it("EX-CNG-06 — le congé passe en « annulation demandée » SANS être annulé, et reste consommé", async () => {
    const { u, conge } = await congeApprouve(2027);
    expect((await conges.solde(u, typeSansValidation, 2027)).consommes).toBe(5);

    await conges.demanderAnnulation(conge.id, u);

    const relu = await prisma.leave.findUniqueOrThrow({ where: { id: conge.id } });
    expect(relu.statut).toBe("cancellation_requested");
    expect(relu.statut).not.toBe("cancelled");
    // Tant que la demande n'est pas acceptée, les jours restent pris : les
    // rendre tout de suite ouvrirait un solde que la décision peut reprendre.
    expect((await conges.solde(u, typeSansValidation, 2027)).consommes).toBe(5);

    const trace = await prisma.auditLog.findFirst({
      where: { action: "leave.cancellation_request", entiteId: conge.id },
    });
    expect(trace?.acteurId).toBe(u);
  });

  it("RG-CNG-05 — une demande EN ATTENTE ne peut pas faire l'objet d'une demande d'annulation", async () => {
    const u = await agent();
    await attribuer(u, typeAvecValidation, 2027, 25);
    const conge = await conges.deposer(
      {
        userId: u,
        typeId: typeAvecValidation,
        dateDebut: utc("2027-02-01"),
        dateFin: utc("2027-02-05"),
      },
      u,
    );
    expect(conge.statut).toBe("pending");

    await expect(conges.demanderAnnulation(conge.id, u)).rejects.toMatchObject({
      code: "statut_incompatible",
    });
    const relu = await prisma.leave.findUniqueOrThrow({ where: { id: conge.id } });
    expect(relu.statut).toBe("pending");
  });

  it("RG-CNG-05 — une demande REFUSÉE ne peut pas faire l'objet d'une demande d'annulation", async () => {
    const u = await agent();
    await attribuer(u, typeAvecValidation, 2027, 25);
    const conge = await conges.deposer(
      {
        userId: u,
        typeId: typeAvecValidation,
        dateDebut: utc("2027-04-05"),
        dateFin: utc("2027-04-09"),
      },
      u,
    );
    const decideur = await agent();
    await conges.refuser(conge.id, "Effectifs insuffisants", decideur);

    await expect(conges.demanderAnnulation(conge.id, u)).rejects.toMatchObject({
      code: "statut_incompatible",
    });
    expect((await prisma.leave.findUniqueOrThrow({ where: { id: conge.id } })).statut).toBe(
      "refused",
    );
  });

  it("RG-CNG-05 — un congé DÉJÀ ANNULÉ ne s'annule pas une seconde fois", async () => {
    const { u, conge } = await congeApprouve(2028);
    const decideur = await agent();
    await conges.demanderAnnulation(conge.id, u);
    await conges.traiterAnnulation(conge.id, true, decideur);
    expect((await prisma.leave.findUniqueOrThrow({ where: { id: conge.id } })).statut).toBe(
      "cancelled",
    );

    await expect(conges.demanderAnnulation(conge.id, u)).rejects.toMatchObject({
      code: "statut_incompatible",
    });
  });
});

describe("EX-CNG-08 — déclarer un congé pour un collaborateur", () => {
  /** Le geste du contrôleur : vérifier le droit de déclarer, PUIS déposer. */
  async function declarerPour(
    collaborateurId: string,
    manager: { id: string; permissions: Set<string> },
    plage: { dateDebut: Date; dateFin: Date },
  ) {
    const perimetre = await perimetres.resoudre(manager.id, manager.permissions);
    await conges.verifierDeclarationPourAutrui(collaborateurId, perimetre, manager.permissions);
    return conges.deposer(
      { userId: collaborateurId, typeId: typeAvecValidation, ...plage },
      manager.id,
    );
  }

  it("EX-CNG-08 — le congé est au nom de l'AGENT, déjà approuvé, et tracé au nom du manager", async () => {
    const dept = await departement();
    const manager = await agent(dept);
    const collaborateur = await agent(dept);
    await prisma.departement.update({ where: { id: dept }, data: { responsableId: manager } });
    await attribuer(collaborateur, typeAvecValidation, 2027, 25);

    const conge = await declarerPour(
      collaborateur,
      { id: manager, permissions: new Set(["leaves:declare_for_other"]) },
      { dateDebut: utc("2027-06-07"), dateFin: utc("2027-06-11") },
    );

    expect(conge.userId).toBe(collaborateur);
    expect(conge.userId).not.toBe(manager);
    // RG-CNG-14 — le manager est validateur de fait.
    expect(conge.statut).toBe("approved");
    expect(conge.validateurId).toBe(manager);
    // Les jours sont pris sur le solde du collaborateur, pas sur celui du manager.
    expect((await conges.solde(collaborateur, typeAvecValidation, 2027)).consommes).toBe(5);

    const trace = await prisma.auditLog.findFirst({
      where: { action: "leave.create_approved", entiteId: conge.id },
    });
    expect(trace?.acteurId).toBe(manager);
    expect(JSON.stringify(trace?.detail)).toContain('"pourAutrui":true');
  });

  it("EX-CNG-08 — sans la permission dédiée, déclarer pour autrui est refusé même dans son périmètre", async () => {
    const dept = await departement();
    const manager = await agent(dept);
    const collaborateur = await agent(dept);
    await prisma.departement.update({ where: { id: dept }, data: { responsableId: manager } });

    const perimetre = await perimetres.resoudre(manager, new Set());
    // Le collaborateur EST dans le périmètre : c'est bien la permission qui manque.
    expect(perimetre.utilisateurs.has(collaborateur)).toBe(true);
    await expect(
      conges.verifierDeclarationPourAutrui(collaborateur, perimetre, new Set()),
    ).rejects.toMatchObject({ code: "hors_perimetre" });
  });

  it("EX-CNG-08 — la permission ne dit pas SUR QUI : un agent d'un autre département est refusé", async () => {
    const deptA = await departement();
    const deptB = await departement();
    const manager = await agent(deptA);
    const etranger = await agent(deptB);
    await prisma.departement.update({ where: { id: deptA }, data: { responsableId: manager } });

    const permissions = new Set(["leaves:declare_for_other"]);
    const perimetre = await perimetres.resoudre(manager, permissions);
    expect(perimetre.utilisateurs.has(etranger)).toBe(false);
    await expect(
      conges.verifierDeclarationPourAutrui(etranger, perimetre, permissions),
    ).rejects.toMatchObject({ code: "hors_perimetre" });
  });

  it("EX-CNG-08 — un collaborateur INACTIF est refusé, permission et périmètre fussent-ils bons", async () => {
    const dept = await departement();
    const manager = await agent(dept);
    const parti = await agent(dept);
    await prisma.departement.update({ where: { id: dept }, data: { responsableId: manager } });

    const permissions = new Set(["leaves:declare_for_other"]);
    const perimetre = await perimetres.resoudre(manager, permissions);
    expect(perimetre.utilisateurs.has(parti)).toBe(true);

    await prisma.user.update({ where: { id: parti }, data: { actif: false } });
    await expect(
      conges.verifierDeclarationPourAutrui(parti, perimetre, permissions),
    ).rejects.toMatchObject({ code: "collaborateur_inactif" });
  });
});

describe("EX-CNG-09 — consulter son solde par type et par année", () => {
  it("EX-CNG-09 — une ligne PAR TYPE ACTIF, chacune avec son propre décompte", async () => {
    const u = await agent();
    await attribuer(u, typeAvecValidation, 2029, 25);
    // Rien d'attribué sur le second type : la ligne doit exister quand même,
    // sinon un solde à zéro serait indistinguable d'un type absent du produit.
    await conges.deposer(
      {
        userId: u,
        typeId: typeAvecValidation,
        dateDebut: utc("2029-03-05"),
        dateFin: utc("2029-03-09"),
      },
      u,
    );

    const lignes = await conges.soldes(u, 2029);
    const actifs = await prisma.leaveType.count({ where: { actif: true } });
    expect(lignes.length).toBe(actifs);

    const ca = lignes.find((l) => l.type.id === typeAvecValidation);
    const rtt = lignes.find((l) => l.type.id === typeSansValidation);
    expect(ca?.solde).toMatchObject({ annee: 2029, attribues: 25, engages: 5, disponibles: 20 });
    expect(rtt?.solde).toMatchObject({ annee: 2029, attribues: 0, engages: 0, disponibles: 0 });
    // Le nom voyage avec le solde : la vue 19 l'affiche sans second appel.
    expect(ca?.type.nom).toBe("Congé annuel");
  });

  it("EX-CNG-09 — chaque année a son propre solde, et elles ne se mélangent pas", async () => {
    const u = await agent();
    await attribuer(u, typeAvecValidation, 2029, 25);
    await attribuer(u, typeAvecValidation, 2030, 10);
    await conges.deposer(
      {
        userId: u,
        typeId: typeAvecValidation,
        dateDebut: utc("2029-05-07"),
        dateFin: utc("2029-05-11"),
      },
      u,
    );

    const en2029 = (await conges.soldes(u, 2029)).find((l) => l.type.id === typeAvecValidation);
    const en2030 = (await conges.soldes(u, 2030)).find((l) => l.type.id === typeAvecValidation);

    expect(en2029?.solde).toMatchObject({ annee: 2029, attribues: 25, engages: 5, disponibles: 20 });
    // La consommation de 2029 ne doit pas entamer le droit de 2030.
    expect(en2030?.solde).toMatchObject({ annee: 2030, attribues: 10, engages: 0, disponibles: 10 });
  });
});

describe("EX-CNG-10 — définir des soldes par agent, ou un solde par défaut global", () => {
  it("EX-CNG-10 — le défaut global s'écrit SANS agent et sert tout le monde d'une seule ligne", async () => {
    const type = await creerType();
    const gestionnaire = await agent();
    const a = await agent();
    const b = await agent();

    await conges.attribuerSolde(
      { userId: null, typeId: type, annee: 2029, joursAttribues: 12 },
      gestionnaire,
    );

    const lignes = await prisma.leaveBalance.findMany({ where: { typeId: type, annee: 2029 } });
    expect(lignes.length).toBe(1);
    expect(lignes[0]?.userId).toBeNull();
    expect((await conges.solde(a, type, 2029)).attribues).toBe(12);
    expect((await conges.solde(b, type, 2029)).attribues).toBe(12);
  });

  it("EX-CNG-10 — l'allocation par agent est indépendante : bouger le défaut ne la déplace pas", async () => {
    const type = await creerType();
    const gestionnaire = await agent();
    const particulier = await agent();
    const ordinaire = await agent();

    const global = await conges.attribuerSolde(
      { userId: null, typeId: type, annee: 2029, joursAttribues: 12 },
      gestionnaire,
    );
    await conges.attribuerSolde(
      { userId: particulier, typeId: type, annee: 2029, joursAttribues: 30 },
      gestionnaire,
    );

    // Le défaut change ; l'agent doté d'une allocation propre n'en dépend plus.
    await conges.attribuerSolde(
      { userId: null, typeId: type, annee: 2029, joursAttribues: 5, version: global.version },
      gestionnaire,
    );

    expect((await conges.solde(particulier, type, 2029)).attribues).toBe(30);
    expect((await conges.solde(ordinaire, type, 2029)).attribues).toBe(5);
  });
});

describe("EX-CNG-11 — déléguer temporairement son pouvoir de validation", () => {
  it("EX-CNG-11 — la délégation ne vaut que DANS sa fenêtre : avant, aux bornes, après", async () => {
    const dept = await departement();
    const manager = await agent(dept);
    const demandeur = await agent(dept);
    const delegue = await agent(dept);
    await prisma.departement.update({ where: { id: dept }, data: { responsableId: manager } });

    await conges.creerDelegation(
      {
        delegantId: manager,
        delegueId: delegue,
        dateDebut: utc("2029-07-01"),
        dateFin: utc("2029-07-31"),
      },
      manager,
    );

    // « Temporairement » se vérifie aux quatre moments, pas au seul milieu :
    // une borne exclue d'un côté passerait inaperçue en ne testant que le centre.
    expect(await conges.determinerValidateur(demandeur, utc("2029-06-30"))).toBe(manager);
    expect(await conges.determinerValidateur(demandeur, utc("2029-07-01"))).toBe(delegue);
    expect(await conges.determinerValidateur(demandeur, utc("2029-07-31"))).toBe(delegue);
    expect(await conges.determinerValidateur(demandeur, utc("2029-08-01"))).toBe(manager);
  });

  it("EX-CNG-11 — le congé déposé pendant la fenêtre part chez le DÉLÉGUÉ", async () => {
    const dept = await departement();
    const manager = await agent(dept);
    const demandeur = await agent(dept);
    const delegue = await agent(dept);
    await prisma.departement.update({ where: { id: dept }, data: { responsableId: manager } });
    await attribuer(demandeur, typeAvecValidation, 2029, 25);

    await conges.creerDelegation(
      {
        delegantId: manager,
        delegueId: delegue,
        dateDebut: utc("2029-09-01"),
        dateFin: utc("2029-09-30"),
      },
      manager,
    );

    const conge = await conges.deposer(
      {
        userId: demandeur,
        typeId: typeAvecValidation,
        dateDebut: utc("2029-09-03"),
        dateFin: utc("2029-09-07"),
      },
      demandeur,
    );
    expect(conge.validateurId).toBe(delegue);
    expect(conge.validateurId).not.toBe(manager);
  });
});

describe("EX-CNG-12 — consulter les délégations données et reçues, et les désactiver", () => {
  it("EX-CNG-12 — chacun la voit du bon côté : donnée chez le délégant, reçue chez le délégué", async () => {
    const manager = await agent();
    const delegue = await agent();
    const d = await conges.creerDelegation(
      {
        delegantId: manager,
        delegueId: delegue,
        dateDebut: utc("2029-01-01"),
        dateFin: utc("2029-12-31"),
      },
      manager,
    );

    const coteDelegant = await conges.delegations(manager);
    expect(coteDelegant.donnees.map((x) => x.id)).toContain(d.id);
    expect(coteDelegant.recues.map((x) => x.id)).not.toContain(d.id);
    // La personne est nommée, sinon la liste n'affiche que des identifiants.
    expect(coteDelegant.donnees.find((x) => x.id === d.id)?.delegue.id).toBe(delegue);

    const coteDelegue = await conges.delegations(delegue);
    expect(coteDelegue.recues.map((x) => x.id)).toContain(d.id);
    expect(coteDelegue.donnees.map((x) => x.id)).not.toContain(d.id);
    expect(coteDelegue.recues.find((x) => x.id === d.id)?.delegant.id).toBe(manager);
  });

  it("EX-CNG-12 — désactiver rend la main au délégant, et la délégation reste VISIBLE, inactive", async () => {
    const dept = await departement();
    const manager = await agent(dept);
    const demandeur = await agent(dept);
    const delegue = await agent(dept);
    await prisma.departement.update({ where: { id: dept }, data: { responsableId: manager } });

    const d = await conges.creerDelegation(
      {
        delegantId: manager,
        delegueId: delegue,
        dateDebut: utc("2029-01-01"),
        dateFin: utc("2029-12-31"),
      },
      manager,
    );
    expect(await conges.determinerValidateur(demandeur, utc("2029-06-01"))).toBe(delegue);

    await conges.desactiverDelegation(d.id, manager, new Set());

    expect(await conges.determinerValidateur(demandeur, utc("2029-06-01"))).toBe(manager);
    // Désactiver n'est pas supprimer : l'historique des délégations se consulte.
    const apres = (await conges.delegations(manager)).donnees.find((x) => x.id === d.id);
    expect(apres).toBeDefined();
    expect(apres?.active).toBe(false);
  });
});

describe("EX-CNG-15 — consulter les congés de ses subordonnés", () => {
  it("EX-CNG-15 — le responsable voit les congés de son département, et RIEN de l'autre", async () => {
    const sien = await departement();
    const autre = await departement();
    const responsable = await agent(sien);
    const subordonne = await agent(sien);
    const etranger = await agent(autre);
    await prisma.departement.update({ where: { id: sien }, data: { responsableId: responsable } });

    for (const u of [subordonne, etranger]) await attribuer(u, typeSansValidation, 2029, 25);
    const duSubordonne = await conges.deposer(
      {
        userId: subordonne,
        typeId: typeSansValidation,
        dateDebut: utc("2029-10-01"),
        dateFin: utc("2029-10-05"),
      },
      subordonne,
    );
    const deLEtranger = await conges.deposer(
      {
        userId: etranger,
        typeId: typeSansValidation,
        dateDebut: utc("2029-10-01"),
        dateFin: utc("2029-10-05"),
      },
      etranger,
    );

    // Aucune permission de gestion globale : c'est le PÉRIMÈTRE qui décide.
    const perimetre = await perimetres.resoudre(responsable, new Set(["leaves:read"]));
    expect(perimetre.global).toBe(false);
    const vus = new Set((await conges.lister(perimetre, {}, responsable)).map((c) => c.id));

    expect(vus.has(duSubordonne.id)).toBe(true);
    expect(vus.has(deLEtranger.id)).toBe(false);
  });

  it("EX-CNG-15 — hors de tout périmètre, un agent ne voit que les siens", async () => {
    const dept = await departement();
    const simple = await agent(dept);
    const etranger = await agent(await departement());
    for (const u of [simple, etranger]) await attribuer(u, typeSansValidation, 2030, 25);

    const sien = await conges.deposer(
      {
        userId: simple,
        typeId: typeSansValidation,
        dateDebut: utc("2030-03-04"),
        dateFin: utc("2030-03-08"),
      },
      simple,
    );
    const deLEtranger = await conges.deposer(
      {
        userId: etranger,
        typeId: typeSansValidation,
        dateDebut: utc("2030-03-04"),
        dateFin: utc("2030-03-08"),
      },
      etranger,
    );

    const perimetre = await perimetres.resoudre(simple, new Set(["leaves:read"]));
    const vus = new Set((await conges.lister(perimetre, {}, simple)).map((c) => c.id));
    expect(vus.has(sien.id)).toBe(true);
    expect(vus.has(deLEtranger.id)).toBe(false);
  });
});

describe("RG-CNG-08 — le validateur est déterminé à la création", () => {
  it("RG-CNG-08 — le manager du SERVICE l'emporte sur le responsable du département", async () => {
    const dept = await departement();
    const responsableDept = await agent(dept);
    const managerService = await agent(dept);
    const demandeur = await agent(dept);
    await prisma.departement.update({
      where: { id: dept },
      data: { responsableId: responsableDept },
    });
    const svc = await creerService(dept, managerService);
    await rattacher(demandeur, svc);
    await attribuer(demandeur, typeAvecValidation, 2029, 25);

    const conge = await conges.deposer(
      {
        userId: demandeur,
        typeId: typeAvecValidation,
        dateDebut: utc("2029-11-05"),
        dateFin: utc("2029-11-09"),
      },
      demandeur,
    );

    expect(conge.validateurId).toBe(managerService);
    expect(conge.validateurId).not.toBe(responsableDept);
  });

  it("RG-CNG-08 — à défaut de manager de service, c'est le responsable du département", async () => {
    const dept = await departement();
    const responsableDept = await agent(dept);
    const demandeur = await agent(dept);
    await prisma.departement.update({
      where: { id: dept },
      data: { responsableId: responsableDept },
    });
    // Un service SANS manager : l'échelon est vide, on descend au suivant.
    const svc = await creerService(dept);
    await rattacher(demandeur, svc);
    await attribuer(demandeur, typeAvecValidation, 2029, 25);

    const conge = await conges.deposer(
      {
        userId: demandeur,
        typeId: typeAvecValidation,
        dateDebut: utc("2029-12-03"),
        dateFin: utc("2029-12-07"),
      },
      demandeur,
    );

    expect(conge.validateurId).toBe(responsableDept);
  });

  it("RG-CNG-08 — « à la création » : changer de manager ensuite ne DÉPLACE PAS le validateur", async () => {
    const dept = await departement();
    const premier = await agent(dept);
    const second = await agent(dept);
    const demandeur = await agent(dept);
    const svc = await creerService(dept, premier);
    await rattacher(demandeur, svc);
    await attribuer(demandeur, typeAvecValidation, 2030, 25);

    const conge = await conges.deposer(
      {
        userId: demandeur,
        typeId: typeAvecValidation,
        dateDebut: utc("2030-05-06"),
        dateFin: utc("2030-05-10"),
      },
      demandeur,
    );
    expect(conge.validateurId).toBe(premier);

    // Le service change de main pendant que la demande attend.
    await prisma.service.update({ where: { id: svc }, data: { managerId: second } });

    // La demande garde SON validateur : c'est le sens de « déterminé à la
    // création ». Une demande qui changerait de destinataire en cours de route
    // disparaîtrait de la liste « à valider » de celui qui l'avait ouverte.
    const relu = await prisma.leave.findUniqueOrThrow({ where: { id: conge.id } });
    expect(relu.validateurId).toBe(premier);
    // Une demande déposée maintenant, elle, irait au nouveau.
    expect(await conges.determinerValidateur(demandeur, utc("2030-05-06"))).toBe(second);
  });

  /*
   * ─────────────────────────────────────────────────────────────────────────
   * DÉFAUT TROUVÉ PAR CE TEST, DEPUIS CORRIGÉ — le troisième échelon
   * de `RG-CNG-08`.
   *
   * La règle énumère trois échelons : « le manager du service, à défaut le
   * responsable du département, À DÉFAUT UN DÉTENTEUR DE LA PERMISSION DE
   * GESTION GLOBALE ». `determinerValidateur` s'arrête au deuxième et rend
   * `null` ; `deposer` crée alors la demande avec `validateurId` à `null`.
   *
   * Conséquence : la demande d'un agent sans manager de service ni responsable
   * de département n'apparaît dans la liste « à valider » de personne —
   * `lister` filtre sur `validateurId = acteur`. Elle est déposée, elle
   * retient du solde engagé, et elle n'atteindra jamais un décideur.
   *
   * L'assertion ci-dessous est celle du cadrage, telle quelle. Elle est
   * marquée `fails` plutôt qu'ajustée : le jour où le troisième échelon sera
   * implémenté, ce test deviendra rouge et exigera le retrait du marqueur.
   * ─────────────────────────────────────────────────────────────────────────
   */
  it(
    "RG-CNG-08 — à défaut des deux, un détenteur de la permission de gestion globale",
    async () => {
      // Un département sans responsable, un agent sans service.
      const dept = await departement();
      const demandeur = await agent(dept);

      const roleGlobal = uuid();
      await prisma.role.create({
        data: {
          id: roleGlobal,
          code: `ADM-${roleGlobal.slice(0, 8)}`,
          nom: "Gestion globale des congés",
          permissions: { create: [{ permission: "leaves:manage_any" }] },
        },
      });
      const administrateur = await agent();
      await prisma.user.update({ where: { id: administrateur }, data: { roleId: roleGlobal } });

      expect(await conges.determinerValidateur(demandeur, utc("2029-06-01"))).toBe(administrateur);
    },
  );
});

describe("RG-CNG-23 — l'allocation modifiée pendant le traitement fait ÉCHOUER l'opération", () => {
  it("RG-CNG-23 — le refus laisse la réalité concurrente en place, et laisse RECOMMENCER", async () => {
    const type = await creerType();
    const beneficiaire = await agent();
    const premier = await agent();
    const second = await agent();

    const lue = await conges.attribuerSolde(
      { userId: beneficiaire, typeId: type, annee: 2029, joursAttribues: 25 },
      premier,
    );

    // Le second gestionnaire écrit pendant que le premier compose son geste.
    await conges.attribuerSolde(
      { userId: beneficiaire, typeId: type, annee: 2029, joursAttribues: 30, version: lue.version },
      second,
    );

    await expect(
      conges.attribuerSolde(
        { userId: beneficiaire, typeId: type, annee: 2029, joursAttribues: 8, version: lue.version },
        premier,
      ),
    ).rejects.toMatchObject({ code: "allocation_modifiee" });

    // « Plutôt que d'écrire contre une réalité différente » : le refus n'a
    // touché à rien — ni la valeur du second, ni la version, qu'un refus qui
    // l'incrémenterait ferait échouer le geste suivant sans raison.
    const apresRefus = await prisma.leaveBalance.findUniqueOrThrow({
      where: { userId_typeId_annee: { userId: beneficiaire, typeId: type, annee: 2029 } },
    });
    expect(Number(apresRefus.joursAttribues)).toBe(30);
    expect(apresRefus.version).toBe(lue.version + 1);

    // « et l'utilisateur invité à recommencer » : sur la version fraîche, ça passe.
    await conges.attribuerSolde(
      {
        userId: beneficiaire,
        typeId: type,
        annee: 2029,
        joursAttribues: 8,
        version: apresRefus.version,
      },
      premier,
    );
    expect((await conges.solde(beneficiaire, type, 2029)).attribues).toBe(8);
  });

  /*
   * ─────────────────────────────────────────────────────────────────────────
   * DÉFAUT TROUVÉ PAR CE TEST, DEPUIS CORRIGÉ — la protection était
   * FACULTATIVE.
   *
   * `attribuerSolde` ne compare les versions que si l'appelant en fournit
   * une : `if (existante && donnees.version !== undefined && …)`. Le schéma du
   * contrôleur (`PUT /conges/soldes`) déclare `version` en `optional()`. Un
   * client qui l'omet écrase donc l'écriture d'un autre sans que rien ne le
   * signale — c'est exactement le « dernier arrivé gagne » que `RG-GEN-07`
   * interdit, et le contraire de ce que `RG-CNG-23` promet.
   *
   * Une protection facultative n'en est pas une : elle ne protège que celui
   * qui y pense. L'assertion ci-dessous est celle de la règle, non ajustée.
   * ─────────────────────────────────────────────────────────────────────────
   */
  it(
    "RG-CNG-23 — une attribution SANS version n'écrase pas une écriture concurrente",
    async () => {
      const type = await creerType();
      const beneficiaire = await agent();
      const premier = await agent();
      const second = await agent();

      const pose = await conges.attribuerSolde(
        { userId: beneficiaire, typeId: type, annee: 2029, joursAttribues: 25 },
        premier,
      );
      // Le second passe avec la version qu'il vient de lire : son écriture est
      // légitime, c'est celle du premier qui arrive après coup.
      await conges.attribuerSolde(
        { userId: beneficiaire, typeId: type, annee: 2029, joursAttribues: 30, version: pose.version },
        second,
      );

      await expect(
        conges.attribuerSolde(
          { userId: beneficiaire, typeId: type, annee: 2029, joursAttribues: 8 },
          premier,
        ),
      ).rejects.toMatchObject({ code: "allocation_modifiee" });
    },
  );
});

describe("RG-CNG-08 — la route nomme le validateur, elle ne rend pas qu'un identifiant", () => {
  it("RG-CNG-08 — le validateur déterminé est rendu AVEC son nom", async () => {
    /*
     * La route est gardée par `leaves:read`. L'annuaire, lui, l'est par
     * `users:read`, qu'un agent ordinaire n'a pas : le client qui avait le
     * droit d'appeler la route n'avait pas celui de traduire sa réponse, et
     * la fenêtre de demande retombait sur une formule générique.
     */
    const dept = await departement();
    const chef = await agent(dept);
    await prisma.departement.update({ where: { id: dept }, data: { responsableId: chef } });
    const demandeur = await agent(dept);

    const rendu = await conges.validateurNomme(demandeur, utc("2029-06-01"));
    expect(rendu.validateurId).toBe(chef);
    expect(rendu.validateur).toMatchObject({ id: chef });
    expect(rendu.validateur?.prenom).toBeTruthy();
    expect(rendu.validateur?.nom).toBeTruthy();
  });

  it("RG-CNG-08 — sans validateur déterminé, les deux champs sont nuls", async () => {
    // Aucun manager, aucun responsable, et aucun détenteur de la gestion
    // globale : le cas où la règle n'a personne à désigner.
    await prisma.rolePermission.deleteMany({ where: { permission: "leaves:manage_any" } });
    const isole = await agent(await departement());
    const rendu = await conges.validateurNomme(isole, utc("2029-06-02"));
    expect(rendu.validateurId).toBeNull();
    expect(rendu.validateur).toBeNull();
  });
});
