import "reflect-metadata";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { creerClient, type PrismaClient } from "@rationarium/db";
import { MODELES_ROLES } from "@rationarium/contracts";
import { RolesService } from "../administration/roles.service.js";
import { AuditService } from "../commun/audit.service.js";
import { PerimetreService } from "../commun/perimetre.service.js";
import { OrganisationService } from "../organisation/organisation.service.js";
import { UtilisateursService } from "../utilisateurs/utilisateurs.service.js";
import { TiersService } from "../tiers/tiers.service.js";

const RACINE_DB = path.resolve(import.meta.dirname, "../../../../packages/db");
const uuid = () => crypto.randomUUID();
const motDePasse = "Motdepasse1!";

let pg: StartedPostgreSqlContainer;
let prisma: PrismaClient;
let roles: RolesService;
let organisation: OrganisationService;
let utilisateurs: UtilisateursService;
let tiers: TiersService;
let perimetres: PerimetreService;
let acteurId: string;

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
  roles = new RolesService(prisma as never, audit);
  organisation = new OrganisationService(prisma as never, audit, perimetres);
  utilisateurs = new UtilisateursService(prisma as never, audit, perimetres);
  tiers = new TiersService(prisma as never, audit, perimetres);
  acteurId = (await prisma.user.create({ data: {
    login: `admin-${uuid()}`, email: `${uuid()}@exemple.fr`, motDePasseHash: "test",
    prenom: "Karim", nom: "Admin",
  } })).id;
}, 240_000);

afterAll(async () => {
  await prisma?.$disconnect();
  await pg?.stop();
});

describe("RM-09 — administration contractuelle sur PostgreSQL réel", () => {
  it("EX-ADM-06 — initialise tous les modèles, se rejoue sans doublon et préserve un rôle personnalisé", async () => {
    const personnalise = await prisma.role.create({ data: {
      code: "SUR_MESURE", nom: "Sur mesure", permissions: {
        create: { permission: "projects:read" },
      },
    } });
    const premier = await roles.initialiserReferentiel(acteurId);
    const second = await roles.initialiserReferentiel(acteurId);
    expect(premier.crees).toBe(MODELES_ROLES.length);
    expect(second).toEqual({ crees: 0, existants: MODELES_ROLES.length, collisions: [] });
    expect(await prisma.role.count()).toBe(MODELES_ROLES.length + 1);
    expect(await prisma.rolePermission.findMany({
      where: { roleId: personnalise.id }, select: { permission: true },
    })).toEqual([{ permission: "projects:read" }]);
    const trace = await prisma.auditLog.findFirst({
      where: { action: "role.seed", acteurId }, orderBy: { horodatage: "desc" },
    });
    expect(trace?.detail).toMatchObject({ crees: 0, existants: MODELES_ROLES.length });
  });

  it("RG-GEN-07 et RG-ORG-01 — détache un département par version, puis refuse le rejeu périmé", async () => {
    const direction = await organisation.creerDirection({ nom: `Direction ${uuid()}` }, acteurId);
    const departement = await organisation.creerDepartement({
      nom: `Département ${uuid()}`, directionId: direction.id,
    }, acteurId);
    await organisation.creerService({ nom: "Service supprimé avec le département", departementId: departement.id }, acteurId);
    expect(await organisation.impactSuppressionDirection(direction.id)).toMatchObject({
      nom: direction.nom,
      departements: [departement.nom],
      supprimable: false,
    });
    expect(await organisation.impactSuppressionDepartement(departement.id)).toMatchObject({
      nom: departement.nom,
      servicesSupprimes: ["Service supprimé avec le département"],
    });
    const detache = await organisation.renommer(
      "departement", departement.id,
      { version: departement.version, directionId: null },
      acteurId,
    );
    expect((await prisma.departement.findUniqueOrThrow({ where: { id: detache.id } })).directionId)
      .toBeNull();
    await expect(organisation.renommer(
      "departement", departement.id,
      { version: departement.version, directionId: direction.id },
      acteurId,
    )).rejects.toMatchObject({ code: "conflit_de_version" });
    await expect(organisation.supprimerDirection(direction.id, acteurId)).resolves.toBeUndefined();
  });

  it("EX-USR-04, RG-DROITS-03 et P-170 — change le rôle atomiquement et journalise les deux noms lisibles", async () => {
    const ancien = await prisma.role.create({ data: { code: `ANCIEN_${uuid().slice(0, 6)}`, nom: "Chef de projet" } });
    const nouveau = await prisma.role.create({ data: { code: `NOUVEAU_${uuid().slice(0, 6)}`, nom: "Contributeur projet" } });
    const compte = await utilisateurs.creer({
      prenom: "Ophélie", nom: "Bardin", email: `${uuid()}@exemple.fr`,
      login: `ophelie-${uuid()}`, motDePasse, roleId: ancien.id,
    }, acteurId, new Set(["users:manage_roles"]));
    await utilisateurs.modifier(
      compte.id,
      { version: compte.version, roleId: nouveau.id },
      acteurId,
      new Set(["users:update", "users:manage_roles"]),
    );
    const trace = await prisma.auditLog.findFirst({
      where: { action: "user.update", entiteId: compte.id },
      orderBy: { horodatage: "desc" },
    });
    expect(trace?.detail).toMatchObject({
      avant: { role: "Chef de projet" },
      apres: { role: "Contributeur projet" },
    });
    expect(JSON.stringify(trace?.detail)).not.toContain(ancien.id);
    expect(JSON.stringify(trace?.detail)).not.toContain(nouveau.id);
  });

  it("RG-USR-01 — une collision concurrente reste traduite distinctement selon email ou identifiant", async () => {
    const email = `${uuid()}@exemple.fr`;
    const login = `collision-${uuid()}`;
    const creer = (suffixe: string) => utilisateurs.creer({
      prenom: "Test", nom: suffixe, email, login: `${login}-${suffixe}`,
      motDePasse,
    }, acteurId, new Set());
    const resultats = await Promise.allSettled([creer("a"), creer("b")]);
    expect(resultats.filter(({ status }) => status === "fulfilled")).toHaveLength(1);
    const rejet = resultats.find(({ status }) => status === "rejected");
    expect(rejet).toMatchObject({ status: "rejected", reason: { code: "email_deja_pris" } });

    const emailA = `${uuid()}@exemple.fr`;
    const emailB = `${uuid()}@exemple.fr`;
    const parLogin = (courriel: string) => utilisateurs.creer({
      prenom: "Test", nom: "Login", email: courriel, login,
      motDePasse,
    }, acteurId, new Set());
    const logins = await Promise.allSettled([parLogin(emailA), parLogin(emailB)]);
    const rejetLogin = logins.find(({ status }) => status === "rejected");
    expect(rejetLogin).toMatchObject({ status: "rejected", reason: { code: "login_deja_pris" } });
  });

  it("EX-USR-05 et RG-GEN-07 — désactivation et réactivation sont réversibles sans accepter une version périmée", async () => {
    const compte = await utilisateurs.creer({
      prenom: "Compte", nom: "Cyclique", email: `${uuid()}@exemple.fr`,
      login: `cycle-${uuid()}`, motDePasse,
    }, acteurId, new Set());
    await utilisateurs.desactiver(compte.id, acteurId, compte.version);
    await expect(utilisateurs.reactiver(
      compte.id, acteurId, compte.version,
    )).rejects.toMatchObject({ code: "conflit_de_version" });
    await utilisateurs.reactiver(compte.id, acteurId, compte.version + 1);
    expect(await prisma.user.findUniqueOrThrow({ where: { id: compte.id } })).toMatchObject({
      actif: true,
      version: compte.version + 2,
    });
  });

  it("EX-TSK-16, RG-TRS-04 et RG-SCOPE-02 — l'assignation d'un tiers ne révèle ni ne modifie une tâche hors périmètre", async () => {
    const autre = await prisma.user.create({ data: {
      login: `hors-${uuid()}`, email: `${uuid()}@exemple.fr`, motDePasseHash: "test",
      prenom: "Hors", nom: "Périmètre",
    } });
    const projet = await prisma.project.create({ data: {
      nom: `Projet étranger ${uuid()}`, chefId: autre.id,
      dateDebut: new Date("2026-01-01T00:00:00.000Z"),
      dateFin: new Date("2026-12-31T00:00:00.000Z"),
    } });
    const tache = await prisma.task.create({ data: { titre: "Tâche étrangère", projectId: projet.id } });
    const externe = await prisma.thirdParty.create({ data: {
      type: "organisation", organisation: "Prestataire étranger",
      projets: { create: { projectId: projet.id } },
    } });
    const droits = new Set(["third_parties:assign", "tasks:read"]);
    const perimetre = await perimetres.resoudre(acteurId, droits);
    await expect(tiers.candidatsPourTache(tache.id, perimetre, droits))
      .rejects.toMatchObject({ code: "introuvable" });
    await expect(tiers.assignerALaTache(
      tache.id, externe.id, acteurId, perimetre, droits,
    )).rejects.toMatchObject({ code: "introuvable" });
    expect(await prisma.taskThirdParty.count({ where: { taskId: tache.id } })).toBe(0);
  });
});
