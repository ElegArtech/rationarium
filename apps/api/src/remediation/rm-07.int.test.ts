import { beforeAll, afterAll, it, expect } from "vitest";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { execFileSync } from "node:child_process";
import path from "node:path";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { creerClient, type PrismaClient } from "@rationarium/db";
import { hacherMotDePasse } from "../auth/mots-de-passe.js";

let pg: StartedPostgreSqlContainer;
let app: NestFastifyApplication;
let prisma: PrismaClient;
let manager: { id: string; jeton: string };
let basic: { id: string; jeton: string };
let membre: { id: string; jeton: string };
let dehors: { id: string; jeton: string };
let serviceId: string;
let typeId: string;
const date = (jour: string) => new Date(`${jour}T00:00:00Z`);
const appel = (acteur: { jeton: string }, methode: "GET" | "POST" | "DELETE", url: string, payload?: object) =>
  app.inject({ method: methode, url: `/api${url}`, cookies: { rationarium_session: acteur.jeton }, ...(payload ? { payload } : {}) });

async function compte(departementId: string, droits: string[]) {
  const id = crypto.randomUUID();
  const role = await prisma.role.create({ data: { code: id, nom: id, permissions: { create: droits.map((permission) => ({ permission })) } } });
  await prisma.user.create({ data: { id, login: id, email: `${id}@x.fr`, prenom: "Agent", nom: id, departementId, roleId: role.id, motDePasseHash: await hacherMotDePasse("Bonjour12!"), motDePasseAChanger: false } });
  const connexion = await app.inject({ method: "POST", url: "/api/auth/login", payload: { identifiant: id, motDePasse: "Bonjour12!" } });
  expect(connexion.statusCode).toBe(200);
  return { id, jeton: connexion.cookies.find((c) => c.name === "rationarium_session")!.value };
}

beforeAll(async () => {
  pg = await new PostgreSqlContainer("postgres:18-alpine").start();
  execFileSync("pnpm", ["exec", "prisma", "migrate", "deploy"], { cwd: path.resolve(import.meta.dirname, "../../../../packages/db"), env: { ...process.env, DATABASE_URL: pg.getConnectionUri() }, stdio: "pipe" });
  process.env.DATABASE_URL = pg.getConnectionUri();
  const { creerApplication } = await import("../main.js");
  app = await creerApplication(); await app.init(); await app.getHttpAdapter().getInstance().ready();
  prisma = creerClient(pg.getConnectionUri());
  const direction = await prisma.direction.create({ data: { nom: "Direction RM07" } });
  const dept = await prisma.departement.create({ data: { nom: "Département A", directionId: direction.id } });
  const autre = await prisma.departement.create({ data: { nom: "Département B", directionId: direction.id } });
  const socle = ["telework:read", "telework:create", "telework:manage_rules", "telework:generate", "leaves:read", "leaves:create", "time_tracking:read", "time_tracking:create"];
  manager = await compte(dept.id, [...socle, "users:read", "telework:read_team", "telework:manage_any", "leaves:approve", "leaves:declare_for_other", "leaves:manage_delegations", "time_tracking:read_team", "time_tracking:declare_for_third_party", "time_tracking:validate_without_entry"]);
  basic = await compte(dept.id, socle); membre = await compte(dept.id, socle); dehors = await compte(autre.id, socle);
  const service = await prisma.service.create({ data: { nom: "Service A", departementId: dept.id, managerId: manager.id } }); serviceId = service.id;
  await prisma.userService.createMany({ data: [manager, basic, membre].map((u) => ({ userId: u.id, serviceId })) });
  const type = await prisma.leaveType.create({ data: { code: "RM07", nom: "Congé", validationRequise: true } }); typeId = type.id;
}, 240_000);
afterAll(async () => { await prisma?.$disconnect(); await app?.close(); await pg?.stop(); });

it("RG-TLT-07 — permission personnelle puis périmètre équipe sur les lectures et écritures", async () => {
  const query = (id: string) => `/teletravail?userId=${id}&debut=2026-09-01&fin=2026-09-30`;
  expect((await appel(basic, "GET", query(basic.id))).statusCode).toBe(200);
  expect((await appel(basic, "GET", query(membre.id))).statusCode).toBe(403);
  expect((await appel(manager, "GET", query(membre.id))).statusCode).toBe(200);
  expect((await appel(manager, "GET", query(dehors.id))).statusCode).toBe(403);
  expect((await appel(manager, "POST", "/teletravail", { userId: dehors.id, date: "2026-09-10", etat: "telework" })).statusCode).toBe(403);
  expect(await prisma.telework.count({ where: { userId: dehors.id } })).toBe(0);
});

it("EX-USR-09, EX-TLT-07, RG-TLT-02 — les deux présences concordent, le congé prime, le samedi ne devient pas non déclaré", async () => {
  await prisma.telework.create({ data: { userId: membre.id, date: date("2026-09-10"), etat: "telework" } });
  await prisma.leave.create({ data: { userId: membre.id, typeId, dateDebut: date("2026-09-10"), dateFin: date("2026-09-10"), joursOuvres: 1, statut: "approved" } });
  const users = await appel(manager, "GET", "/utilisateurs/presence?jour=2026-09-10");
  const equipe = await appel(manager, "GET", "/teletravail/equipe?date=2026-09-10");
  expect(users.statusCode).toBe(200); expect(equipe.statusCode).toBe(200);
  const presence = users.json<{ id: string; etat: string }[]>();
  const teletravail = equipe.json<{ id: string; enConge: boolean; nonOuvre: boolean }[]>();
  expect(teletravail.map((a) => a.id)).toEqual(presence.map((a) => a.id));
  expect(presence.find((a) => a.id === membre.id)?.etat).toBe("conge");
  expect(teletravail.find((a) => a.id === membre.id)?.enConge).toBe(true);
  const samedi = await appel(manager, "GET", "/teletravail/equipe?date=2026-09-12");
  expect(samedi.json<{ nonOuvre: boolean }[]>().every((a) => a.nonOuvre)).toBe(true);
});

it("EX-CNG-05, EX-CNG-15 — le validateur voit le service et seulement les absences concomitantes de son service", async () => {
  const demande = await prisma.leave.create({ data: { userId: basic.id, typeId, dateDebut: date("2026-09-10"), dateFin: date("2026-09-11"), joursOuvres: 2, statut: "pending", validateurId: manager.id } });
  await prisma.leave.create({ data: { userId: dehors.id, typeId, dateDebut: date("2026-09-10"), dateFin: date("2026-09-10"), joursOuvres: 1, statut: "approved" } });
  const reponse = await appel(manager, "GET", "/conges?aValider=true");
  expect(reponse.statusCode).toBe(200);
  const lignes = reponse.json<{ id: string; user: { services: { id: string }[] }; absencesConcomitantes: { user: { id: string } }[] }[]>();
  const ligne = lignes.find((l) => l.id === demande.id)!;
  expect(ligne.user.services.map((s) => s.id)).toEqual([serviceId]);
  expect(ligne.absencesConcomitantes.map((a) => a.user.id)).toEqual([membre.id]);
});

it("EX-CNG-08, RG-CNG-15 — candidats, soldes et validateur restent dans la cible autorisée", async () => {
  const candidats = await appel(manager, "GET", "/conges/candidats");
  expect(candidats.statusCode).toBe(200);
  expect(candidats.json<{ id: string }[]>().map((a) => a.id)).toContain(membre.id);
  expect(candidats.json<{ id: string }[]>().map((a) => a.id)).not.toContain(dehors.id);
  expect((await appel(basic, "GET", "/conges/candidats")).statusCode).toBe(403);
  for (const prefixe of ["/conges/soldes?annee=2026&", "/conges/validateur?date=2026-09-10&", "/conges/delegations?"]) {
    expect((await appel(basic, "GET", `${prefixe}userId=${membre.id}`)).statusCode).toBe(403);
    expect((await appel(manager, "GET", `${prefixe}userId=${membre.id}`)).statusCode).toBe(200);
    expect((await appel(manager, "GET", `${prefixe}userId=${dehors.id}`)).statusCode).toBe(403);
  }
  expect((await appel(manager, "POST", "/conges", { userId: dehors.id, typeId, dateDebut: "2026-10-01", dateFin: "2026-10-01" })).statusCode).toBe(403);
});

it("RG-TMP-04, RG-TMP-05 — déclarer pour autrui ne permet ni une cible ni un projet hors périmètre", async () => {
  const projet = await prisma.project.create({ data: { nom: "Projet temps", chefId: manager.id, dateDebut: date("2026-01-01"), dateFin: date("2026-12-31") } });
  const corps = { userId: membre.id, projectId: projet.id, date: "2026-09-10", heures: 1 };
  expect((await appel(basic, "POST", "/temps", corps)).statusCode).toBe(403);
  expect((await appel(manager, "POST", "/temps", corps)).statusCode).toBe(201);
  expect((await appel(manager, "POST", "/temps", { ...corps, userId: dehors.id })).statusCode).toBe(403);
  expect((await appel(manager, "GET", `/temps?userId=${dehors.id}`)).statusCode).toBe(403);
  const externe = await prisma.project.create({ data: { nom: "Projet externe", chefId: dehors.id, dateDebut: date("2026-01-01"), dateFin: date("2026-12-31") } });
  expect((await appel(manager, "POST", "/temps", { ...corps, projectId: externe.id })).statusCode).toBe(403);
  expect(await prisma.timeEntry.count({ where: { userId: dehors.id } })).toBe(0);
});

it("EX-TMP-08 — le tiers externe autorisé est enregistré et filtrable, celui d'un autre projet est refusé", async () => {
  const projet = await prisma.project.create({ data: { nom: "Prestation", chefId: manager.id, dateDebut: date("2026-01-01"), dateFin: date("2026-12-31") } });
  const tiers = await prisma.thirdParty.create({ data: { type: "organisation", organisation: "Prestataire" } });
  const horsScope = await prisma.thirdParty.create({ data: { type: "organisation", organisation: "Non rattaché" } });
  await prisma.projectThirdParty.create({ data: { projectId: projet.id, thirdPartyId: tiers.id } });
  const corps = { thirdPartyId: tiers.id, projectId: projet.id, date: "2026-09-10", heures: 2 };
  expect((await appel(manager, "POST", "/temps", corps)).statusCode).toBe(201);
  expect((await appel(manager, "POST", "/temps", { ...corps, thirdPartyId: horsScope.id })).statusCode).toBe(403);
  const lecture = await appel(manager, "GET", `/temps?thirdPartyId=${tiers.id}`);
  expect(lecture.statusCode).toBe(200);
  expect(await prisma.timeEntry.count({ where: { thirdPartyId: tiers.id, creeParId: manager.id } })).toBe(1);
  expect(await prisma.timeEntry.count({ where: { thirdPartyId: horsScope.id } })).toBe(0);
});


it("RG-SCOPE-04 — un taskId de corps ne remplace jamais la cible de renoncement portée par la route", async () => {
  const visible = await prisma.task.create({ data: { titre: "Visible", statut: "done", assignes: { create: { userId: manager.id } } } });
  const interdite = await prisma.task.create({ data: { titre: "Interdite", statut: "done", assignes: { create: { userId: dehors.id } } } });
  const refus = await appel(manager, "POST", `/temps/renoncement/${interdite.id}`, { taskId: visible.id });
  expect(refus.statusCode).toBe(403);
  expect(await prisma.taskTimeWaiver.count({ where: { taskId: interdite.id } })).toBe(0);
  expect((await appel(manager, "POST", `/temps/renoncement/${visible.id}`)).statusCode).toBe(201);
});

it("RG-GEN-08 — les refus de cible RH exposent une clé traduisible et non une phrase française", async () => {
  const refus = await appel(manager, "GET", `/teletravail?userId=${dehors.id}&debut=2026-09-01&fin=2026-09-30`);
  expect(refus.statusCode).toBe(403);
  expect(refus.json()).toMatchObject({ cle: "erreurs:horsPerimetre" });
  const invalide = await appel(manager, "GET", "/teletravail?userId=invalide&debut=2026-09-01&fin=2026-09-30");
  expect(invalide.statusCode).toBe(400);
  expect(invalide.json()).toMatchObject({ cle: "erreurs:donneesInvalides" });
});

it("RG-SCOPE-02, RG-TMP-05 — un auteur du département ne révèle ni nom ni heures de ses prestations sur un projet inaccessible", async () => {
  const prive = await prisma.project.create({ data: { nom: "Dossier inaccessible RM07", chefId: dehors.id, dateDebut: date("2026-01-01"), dateFin: date("2026-12-31") } });
  const visible = await prisma.project.create({ data: { nom: "Prestation visible RM07", chefId: manager.id, dateDebut: date("2026-01-01"), dateFin: date("2026-12-31") } });
  const tiers = await prisma.thirdParty.create({ data: { type: "organisation", organisation: "Cabinet RM07" } });
  await prisma.timeEntry.createMany({ data: [
    { thirdPartyId: tiers.id, creeParId: basic.id, projectId: prive.id, date: date("2026-11-17"), heures: 7 },
    { thirdPartyId: tiers.id, creeParId: basic.id, projectId: visible.id, date: date("2026-11-17"), heures: 2 },
  ] });
  const liste = await appel(manager, "GET", `/temps?userId=${basic.id}&debut=2026-11-17&fin=2026-11-17`);
  expect(liste.statusCode).toBe(200);
  expect(liste.json()).toMatchObject({ cumul: { entrees: 1, heures: 2 } });
  expect(liste.body).not.toContain(prive.nom);
  expect(liste.body).not.toContain(prive.id);
  const rapport = await appel(manager, "GET", "/temps/rapport?axe=projet&debut=2026-11-17&fin=2026-11-17");
  expect(rapport.statusCode).toBe(200);
  expect(rapport.json()).toEqual([{ cle: visible.id, libelle: visible.nom, heures: 2, entrees: 1 }]);
});
