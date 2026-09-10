import { beforeAll, afterAll, it, expect, vi } from "vitest";
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
const date = (jour: string) => new Date(`${jour}T00:00:00Z`);
const appel = (acteur: { jeton: string }, methode: "GET" | "POST" | "DELETE" | "PATCH", url: string, payload?: object) =>
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
  vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-09-10T10:00:00Z"));
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
  manager = await compte(dept.id, [...socle, "planning:read", "planning:export_ics", "planning:import_ics", "tasks:update", "events:create", "events:update", "events:read", "predefined_tasks:assign", "predefined_tasks:generate", "predefined_tasks:update", "predefined_tasks:read", "users:read", "telework:read_team", "telework:manage_any", "leaves:approve", "leaves:declare_for_other", "leaves:manage_delegations", "time_tracking:read_team", "time_tracking:declare_for_third_party", "time_tracking:validate_without_entry"]);
  basic = await compte(dept.id, socle); membre = await compte(dept.id, socle); dehors = await compte(autre.id, socle);
  const service = await prisma.service.create({ data: { nom: "Service A", departementId: dept.id, managerId: manager.id } }); serviceId = service.id;
  await prisma.userService.createMany({ data: [manager, basic, membre].map((u) => ({ userId: u.id, serviceId })) });
}, 240_000);
afterAll(async () => { await prisma?.$disconnect(); await app?.close(); await pg?.stop(); vi.useRealTimers(); });


it("RG-SCOPE-01, EX-PLN-15 — ressource hors périmètre ne remplace pas le prédicat de la grille et de l’export", async () => {
  await prisma.event.create({ data: { titre: "Secret ailleurs", date: date("2026-09-10"), journeeEntiere: true, participants: { create: { userId: dehors.id } } } });
  const q = `?debut=2026-09-01&fin=2026-09-30&ressourceId=${dehors.id}`;
  expect((await appel(manager, "GET", `/planning${q}`)).body).not.toContain(dehors.id);
  expect((await appel(manager, "GET", `/planning/ics${q}`)).body).not.toContain("Secret ailleurs");
  const propre = await prisma.event.create({ data: { titre: "Visible propre", date: date("2026-09-10"), participants: { create: { userId: manager.id } } } });
  expect((await appel(manager, "GET", `/planning/ics?debut=2026-09-01&fin=2026-09-30&ressourceId=${manager.id}`)).body).toContain(propre.titre);
  expect((await appel(manager, "GET", `/planning/ics?debut=2026-09-01&fin=2026-09-30&ressourceId=${membre.id}`)).body).not.toContain(propre.titre);
});
it("RG-PLN-04, RG-SCOPE-02 — geste télétravail refuse cible extérieure avant mutation", async () => {
  expect((await appel(manager, "PATCH", "/planning/teletravail", { userId: dehors.id, date: "2026-09-15", etat: "telework", version: 0 })).statusCode).toBe(403);
  expect(await prisma.telework.count({ where: { userId: dehors.id } })).toBe(0);
});
it("EX-ACT-02/05/06, RG-SCOPE-02 — assignation, génération et réalisation refusent les agents extérieurs", async () => {
  const t = await prisma.predefinedTask.create({ data: { nom: "Accueil RM05" } });
  const r = await prisma.predefinedTaskRecurrence.create({ data: { predefinedTaskId: t.id, type: "weekly", jourSemaine: 2, dateDebut: date("2026-09-01") } });
  expect(r.id).toBeTruthy();
  expect((await appel(manager, "POST", "/activite/assignations", { predefinedTaskId: t.id, userIds: [membre.id, dehors.id], date: "2026-09-15", periode: "full_day" })).statusCode).toBe(403);
  expect((await appel(manager, "POST", "/activite/generer", { predefinedTaskId: t.id, userIds: [dehors.id], debut: "2026-09-15", fin: "2026-09-15" })).statusCode).toBe(403);
  expect(await prisma.predefinedTaskAssignment.count({ where: { predefinedTaskId: t.id } })).toBe(0);
  const a = await prisma.predefinedTaskAssignment.create({ data: { predefinedTaskId: t.id, userId: dehors.id, date: date("2026-09-15"), periode: "full_day" } });
  expect((await appel(manager, "POST", "/activite/assignations/realisation", { assignationId: a.id, realisee: true, version: 1 })).statusCode).toBe(403);
  expect((await prisma.predefinedTaskAssignment.findUniqueOrThrow({ where: { id: a.id } })).realisee).toBe(false);
});
it("EX-EVT-04, RG-EVT-01, RG-SCOPE-02 — service invité borné et dédupliqué avec les participants individuels", async () => {
  const body = { titre: "Invitation", date: "2026-09-17", journeeEntiere: true };
  expect((await appel(manager, "POST", "/evenements", { ...body, participantIds: [dehors.id] })).statusCode).toBe(403);
  const dept = (await prisma.user.findUniqueOrThrow({ where: { id: dehors.id } })).departementId!;
  const service = await prisma.service.create({ data: { nom: "Extérieur", departementId: dept } });
  await prisma.userService.create({ data: { serviceId: service.id, userId: dehors.id } });
  expect((await appel(manager, "POST", "/evenements", { ...body, serviceIds: [service.id] })).statusCode).toBe(403);
  const projet = await prisma.project.create({ data: { nom: "Projet extérieur", chefId: dehors.id, dateDebut: date("2026-01-01"), dateFin: date("2026-12-31") } });
  expect((await appel(manager, "POST", "/evenements", { ...body, projectId: projet.id, participantIds: [manager.id] })).statusCode).toBe(403);
  expect(await prisma.event.count({ where: { titre: body.titre } })).toBe(0);
  const ok = await appel(manager, "POST", "/evenements", { ...body, serviceIds: [serviceId], participantIds: [membre.id] });
  expect(ok.statusCode).toBe(201);
  expect(await prisma.eventParticipant.count({ where: { eventId: ok.json<{ evenement: { id: string } }>().evenement.id } })).toBe(3);
});
it("EX-PLN-15 — aperçu sans écriture, erreurs de dates isolées et confirmation rejouable", async () => {
  const contenu = "BEGIN:VCALENDAR\nBEGIN:VEVENT\nUID:rm05-ok\nSUMMARY:Import test\nDTSTART;VALUE=DATE:20260916\nEND:VEVENT\nBEGIN:VEVENT\nSUMMARY:Impossible\nDTSTART;VALUE=DATE:20261340\nEND:VEVENT\nEND:VCALENDAR";
  const avant = await prisma.event.count();
  const audits = await prisma.auditLog.count({ where: { action: "event.create" } });
  const vue = await appel(manager, "POST", "/planning/ics/apercu", { contenu });
  expect(vue.statusCode).toBe(201);
  expect(vue.json()).toMatchObject({ crees: 1, ignores: 1, existants: 0 });
  expect(await prisma.event.count()).toBe(avant);
  expect(await prisma.auditLog.count({ where: { action: "event.create" } })).toBe(audits);
  expect((await appel(manager, "POST", "/planning/ics", { contenu })).json()).toMatchObject({ crees: 1, ignores: 1, existants: 0 });
  expect((await appel(manager, "POST", "/planning/ics", { contenu })).json()).toMatchObject({ crees: 0, ignores: 1, existants: 1 });
});

it("RG-GEN-07, RG-PLN-04 — deux bascules fondées sur la même version ne s’écrasent pas", async () => {
  const body = { userId: membre.id, date: "2026-09-20", etat: "telework", version: 0 };
  expect((await appel(manager, "PATCH", "/planning/teletravail", body)).statusCode).toBe(200);
  expect((await appel(manager, "PATCH", "/planning/teletravail", { ...body, etat: "office" })).statusCode).toBe(409);
  const actuel = await prisma.telework.findUniqueOrThrow({ where: { userId_date: { userId: membre.id, date: date(body.date) } } });
  expect(actuel.etat).toBe("telework");
  expect((await appel(manager, "PATCH", "/planning/teletravail", { ...body, etat: "office", version: actuel.version })).statusCode).toBe(200);
});
it("RG-EVT-03/04, RG-GEN-07 — arrêt parent atomique, passé intact et version périmée refusée", async () => {
  const parent = await prisma.event.create({ data: { titre: "Parent ancien", date: date("2020-01-01"), recurrenceFrequence: 1, recurrenceFin: date("2030-12-31"), participants: { create: { userId: manager.id } } } });
  const passe = await prisma.event.create({ data: { titre: "Passé", parentId: parent.id, date: date("2020-01-08"), participants: { create: { userId: manager.id } } } });
  const futur = await prisma.event.create({ data: { titre: "Futur", parentId: parent.id, date: date("2030-01-01"), participants: { create: { userId: manager.id } } } });
  const avant = await prisma.event.findUniqueOrThrow({ where: { id: passe.id }, include: { participants: true } });
  expect((await appel(manager, "POST", `/evenements/${futur.id}/arreter`, { aPartirDe: "2020-01-01", version: 1 })).statusCode).toBe(422);
  const r = await appel(manager, "POST", `/evenements/${parent.id}/arreter`, { aPartirDe: "2020-01-01", version: 1 });
  expect(r.statusCode).toBe(201); expect(r.json()).toMatchObject({ supprimees: 1 });
  expect(await prisma.event.findUniqueOrThrow({ where: { id: passe.id }, include: { participants: true } })).toEqual(avant);
  expect((await appel(manager, "POST", `/evenements/${parent.id}/arreter`, { aPartirDe: "2031-01-01", version: 1 })).statusCode).toBe(409);
});

it("EX-ACT-06, RG-GEN-07 — réalisation autorisée versionnée et colonnes inactives conservées", async () => {
  const t = await prisma.predefinedTask.create({ data: { nom: "Permanence passée", actif: false } });
  const a = await prisma.predefinedTaskAssignment.create({ data: { predefinedTaskId: t.id, userId: membre.id, date: date("2026-09-15"), periode: "full_day" } });
  const body = { assignationId: a.id, realisee: true, version: 1 };
  expect((await appel(basic, "POST", "/activite/assignations/realisation", body)).statusCode).toBe(403);
  expect((await appel(manager, "POST", "/activite/assignations/realisation", body)).statusCode).toBe(201);
  expect((await appel(manager, "POST", "/activite/assignations/realisation", { ...body, realisee: false })).statusCode).toBe(409);
  const grille = await appel(manager, "GET", "/planning/activite?debut=2026-09-15&fin=2026-09-15");
  expect(grille.json<{ colonnes: { id: string; actif: boolean }[] }>().colonnes.find((c) => c.id === t.id)?.actif).toBe(false);
  expect((await prisma.predefinedTaskAssignment.findUniqueOrThrow({ where: { id: a.id } })).realisee).toBe(true);
});
it("EX-ACT-02/05, RG-ACT-05/06 — génération nominale comptée et activité désactivée refusée", async () => {
  const t = await prisma.predefinedTask.create({ data: { nom: "Accueil génération" } });
  await prisma.predefinedTaskRecurrence.create({ data: { predefinedTaskId: t.id, type: "weekly", jourSemaine: 2, dateDebut: date("2026-09-01") } });
  const body = { predefinedTaskId: t.id, userIds: [membre.id], debut: "2026-09-15", fin: "2026-09-15" };
  expect((await appel(basic, "POST", "/activite/generer", body)).statusCode).toBe(403);
  expect((await appel(manager, "POST", "/activite/generer", body)).json()).toMatchObject({ crees: 1, ignores: 0 });
  expect((await appel(manager, "POST", "/activite/generer", body)).json()).toMatchObject({ crees: 0, ignores: 1 });
  await prisma.predefinedTask.update({ where: { id: t.id }, data: { actif: false } });
  expect((await appel(manager, "POST", "/activite/generer", { ...body, debut: "2026-09-22", fin: "2026-09-22" })).statusCode).toBe(409);
});
it("EX-PLN-15, RG-SCOPE-01 — UID exact, rejeu concurrent et autre importateur sans fuite", async () => {
  const fichier = (uid: string) => `BEGIN:VCALENDAR\nBEGIN:VEVENT\nUID:${uid}\nSUMMARY:Calendrier personnel\nDTSTART;VALUE=DATE:20260916\nEND:VEVENT\nEND:VCALENDAR`;
  const contenu = fichier("rm05-prefix-long");
  const [a, b] = await Promise.all([appel(manager, "POST", "/planning/ics", { contenu }), appel(manager, "POST", "/planning/ics", { contenu })]);
  expect([a.json<{ crees: number }>().crees, b.json<{ crees: number }>().crees].sort()).toEqual([0, 1]);
  expect((await appel(manager, "POST", "/planning/ics/apercu", { contenu: fichier("rm05-prefix") })).json()).toMatchObject({ crees: 1, existants: 0 });
  const dept = (await prisma.user.findUniqueOrThrow({ where: { id: dehors.id } })).departementId!;
  const autre = await compte(dept, ["planning:import_ics"]);
  expect((await appel(autre, "POST", "/planning/ics/apercu", { contenu })).json()).toMatchObject({ crees: 1, existants: 0 });
  expect((await appel(basic, "POST", "/planning/ics/apercu", { contenu })).statusCode).toBe(403);
});

it("EX-PLN-15, RG-SCOPE-04, RG-PLN-07 — export rend toutes les occupations visibles et aucune tâche confidentielle", async () => {
  const tache = await prisma.task.create({ data: { titre: "Livrable visible ICS", dateDebut: date("2026-09-01"), dateFin: date("2026-09-30"), assignes: { create: { userId: membre.id } } } });
  await prisma.task.create({ data: { titre: "Secret ICS", confidentielle: true, dateDebut: date("2026-09-01"), dateFin: date("2026-09-30"), assignes: { create: { userId: membre.id } } } });
  await prisma.telework.create({ data: { userId: membre.id, date: date("2026-09-21"), etat: "telework" } });
  const t = await prisma.predefinedTask.create({ data: { nom: "Permanence ICS" } });
  await prisma.predefinedTaskAssignment.create({ data: { predefinedTaskId: t.id, userId: membre.id, date: date("2026-09-21"), periode: "full_day" } });
  const q = `?debut=2026-09-21&fin=2026-09-21&ressourceId=${membre.id}`;
  const grille = await appel(manager, "GET", `/planning${q}`);
  expect(grille.body).toContain(tache.titre); expect(grille.body).not.toContain("Secret ICS");
  const ics = await appel(manager, "GET", `/planning/ics${q}`);
  expect(ics.body).toContain(tache.titre); expect(ics.body).toContain("Permanence ICS"); expect(ics.body).toContain("Télétravail");
  expect(ics.body).not.toContain("Secret ICS"); expect(ics.body).toContain("DTSTART;VALUE=DATE:20260921"); expect(ics.body).not.toContain("20260901");
});

it("EX-PLN-15, RG-EVT-02 — une règle hebdomadaire importée crée une vraie série et respecte l’horizon", async () => {
  const fichier = (fin: string, frequence = "WEEKLY") => `BEGIN:VCALENDAR\nBEGIN:VEVENT\nUID:serie-${fin}\nSUMMARY:Réunion hebdomadaire importée\nDTSTART;VALUE=DATE:20260914\nRRULE:FREQ=${frequence};INTERVAL=2;BYDAY=MO;UNTIL=${fin}\nEND:VEVENT\nEND:VCALENDAR`;
  const contenu = fichier("20261012");
  expect((await appel(manager, "POST", "/planning/ics/apercu", { contenu })).json()).toMatchObject({ crees: 1, ignores: 0 });
  expect((await appel(manager, "POST", "/planning/ics", { contenu })).json()).toMatchObject({ crees: 1, ignores: 0 });
  const parent = await prisma.event.findFirstOrThrow({ where: { titre: "Réunion hebdomadaire importée", parentId: null }, include: { participants: true } });
  expect(parent.recurrenceFrequence).toBe(2); expect(parent.recurrenceJourSemaine).toBe(1);
  const enfants = await prisma.event.findMany({ where: { parentId: parent.id }, include: { participants: true }, orderBy: { date: "asc" } });
  expect(enfants.map((e) => e.date.toISOString().slice(0, 10))).toEqual(["2026-09-28", "2026-10-12"]);
  expect(enfants.every((e) => e.participants[0]?.userId === manager.id)).toBe(true);
  expect((await appel(manager, "POST", "/planning/ics/apercu", { contenu: fichier("20301012") })).json()).toMatchObject({ crees: 0, ignores: 1, erreurs: [{ motif: "horizon_depasse" }] });
  expect((await appel(manager, "POST", "/planning/ics/apercu", { contenu: fichier("20261012", "MONTHLY") })).json()).toMatchObject({ crees: 0, ignores: 1, erreurs: [{ motif: "recurrence_non_prise_en_charge" }] });
});

it("RG-PLN-07, RG-GEN-08 — export sans droit activité masque la permanence et traduit le télétravail", async () => {
  const dept = (await prisma.user.findUniqueOrThrow({ where: { id: membre.id } })).departementId!;
  const lecteur = await compte(dept, ["planning:read", "planning:export_ics"]);
  const t = await prisma.predefinedTask.create({ data: { nom: "Permanence sans autorisation" } });
  await prisma.predefinedTaskAssignment.create({ data: { predefinedTaskId: t.id, userId: lecteur.id, date: date("2026-09-23"), periode: "full_day" } });
  await prisma.telework.create({ data: { userId: lecteur.id, date: date("2026-09-23"), etat: "telework" } });
  const r = await appel(lecteur, "GET", `/planning/ics?debut=2026-09-23&fin=2026-09-23&ressourceId=${lecteur.id}&langue=en`);
  expect(r.statusCode).toBe(200); expect(r.body).not.toContain(t.nom);
  expect(r.body).toContain("Remote work"); expect(r.body).not.toContain("Télétravail");
});

it("RG-GEN-07, EX-PLN-10 — versions obsolètes refusées sur les deux routes de déplacement", async () => {
  const t = await prisma.task.create({ data: { titre: "Déplacement", dateDebut: date("2026-09-01"), dateFin: date("2026-09-03"), assignes: { create: { userId: manager.id } } } });
  const corps = { taskId: t.id, version: 1, nouvelleDate: "2026-09-05" };
  expect((await appel(manager, "PATCH", "/planning/taches/deplacer", corps)).statusCode).toBe(200);
  expect((await appel(manager, "POST", `/taches/${t.id}/deplacer`, { version: 1, nouvelleDate: "2026-09-08" })).statusCode).toBe(409);
  expect((await appel(manager, "PATCH", "/planning/taches/deplacer", { ...corps, nouvelleDate: "2026-09-10" })).statusCode).toBe(409);
  const apres = await prisma.task.findUniqueOrThrow({ where: { id: t.id } });
  expect(apres.dateDebut).toEqual(date("2026-09-05")); expect(apres.dateFin).toEqual(date("2026-09-07"));
});
it("RG-TSK-11, M20 — réassignation multi conserve les dates et alimente le journal", async () => {
  const t = await prisma.task.create({ data: { titre: "Multi déplacement", dateDebut: date("2026-09-01"), dateFin: date("2026-09-03"), assignes: { create: [manager, membre].map((u) => ({ userId: u.id })) } } });
  const r = await appel(manager, "PATCH", "/planning/taches/deplacer", { taskId: t.id, version: 1, nouvelleDate: "2026-09-10", ancienAssigneId: membre.id, nouvelAssigneId: basic.id });
  expect(r.statusCode).toBe(200); expect(r.json()).toMatchObject({ assigneModifie: true, dateModifiee: false });
  expect(await prisma.auditLog.count({ where: { entiteId: t.id, action: "task.planning_move" } })).toBe(1);
  const apres = await prisma.task.findUniqueOrThrow({ where: { id: t.id }, include: { assignes: true } });
  expect(apres.dateDebut).toEqual(t.dateDebut); expect(apres.dateFin).toEqual(t.dateFin);
  expect(apres.version).toBe(2); expect(apres.assignes.map((a) => a.userId).sort()).toEqual([manager.id, basic.id].sort());
});

it("RG-GEN-07 — un échec de réassignation restaure l’ancien assigné, les dates et la version", async () => {
  const t = await prisma.task.create({ data: { titre: "Atomicité", dateDebut: date("2026-09-01"), dateFin: date("2026-09-03"), assignes: { create: { userId: manager.id } } } });
  const avant = await prisma.task.findUniqueOrThrow({ where: { id: t.id }, include: { assignes: true } });
  const { TachesService } = await import("../taches/taches.service.js");
  await expect(app.get(TachesService).deplacerDepuisPlanning(t.id, {
    version: 1, ancienAssigneId: manager.id, nouvelAssigneId: crypto.randomUUID(), nouvelleDate: date("2026-09-10"),
  }, manager.id)).rejects.toThrow();
  expect(await prisma.task.findUniqueOrThrow({ where: { id: t.id }, include: { assignes: true } })).toEqual(avant);
  expect(await prisma.auditLog.count({ where: { entiteId: t.id, action: "task.planning_move" } })).toBe(0);
});
it("EX-PLN-15 — les demi-journées exportées sont des repères explicites sans bloquer la journée entière", async () => {
  const type = await prisma.leaveType.create({ data: { code: "DEMIICS", nom: "Congé partiel" } });
  const c = await prisma.leave.create({ data: { userId: manager.id, typeId: type.id, dateDebut: date("2026-09-24"), dateFin: date("2026-09-24"), demiJourneeDebut: "afternoon", joursOuvres: 0.5, statut: "approved" } });
  const t = await prisma.predefinedTask.create({ data: { nom: "Accueil matinal", heureDebut: "08:00", heureFin: "18:00" } });
  const a = await prisma.predefinedTaskAssignment.create({ data: { predefinedTaskId: t.id, userId: manager.id, date: date("2026-09-25"), periode: "morning" } });
  const r = await appel(manager, "GET", `/planning/ics?debut=2026-09-24&fin=2026-09-25&ressourceId=${manager.id}`);
  const blocs = r.body.replaceAll(/\r\n[ \t]/g, "").split("BEGIN:VEVENT");
  const conge = blocs.find((b) => b.includes(`cng-${c.id}`))!;
  const permanence = blocs.find((b) => b.includes(`act-${a.id}`))!;
  expect(conge).toContain("Début en demi-journée"); expect(conge).toContain("X-RATIONARIUM-HALF-DAY-START:afternoon"); expect(conge).toContain("TRANSP:TRANSPARENT");
  expect(permanence).toContain("Matinée"); expect(permanence).toContain("X-RATIONARIUM-PERIOD:morning"); expect(permanence).toContain("TRANSP:TRANSPARENT");
  expect(permanence).not.toContain("180000");
});
it("EX-EVT-05, RG-EVT-02 — fin de récurrence facultative bornée par le réglage global", async () => {
  await prisma.setting.upsert({ where: { cle: "events.horizonRecurrenceAnnees" }, create: { cle: "events.horizonRecurrenceAnnees", valeur: "1" }, update: { valeur: "1" } });
  const r = await appel(manager, "POST", "/evenements", { titre: "Sans fin saisie", date: "2026-09-14", journeeEntiere: true, participantIds: [manager.id], recurrence: { frequenceSemaines: 4, jourSemaine: 1 } });
  expect(r.statusCode).toBe(201); expect(r.json<{ evenement: { recurrenceFin: string } }>().evenement.recurrenceFin).toBe("2027-09-14T00:00:00.000Z");
});

it("EX-EVT-04 — invitation de service active ignore ses anciens membres mais refuse une cible inactive explicite", async () => {
  const dept = (await prisma.user.findUniqueOrThrow({ where: { id: membre.id } })).departementId!;
  const ancien = await prisma.user.create({ data: { login: crypto.randomUUID(), email: `${crypto.randomUUID()}@x.fr`, motDePasseHash: "x", prenom: "Ancien", nom: "Compte", departementId: dept, actif: false, services: { create: { serviceId } } } });
  const body = { titre: "Service avec ancien compte", date: "2026-09-29", journeeEntiere: true };
  expect((await appel(manager, "POST", "/evenements", { ...body, participantIds: [ancien.id] })).statusCode).toBe(403);
  const r = await appel(manager, "POST", "/evenements", { ...body, serviceIds: [serviceId] });
  expect(r.statusCode).toBe(201);
  const participants = await prisma.eventParticipant.findMany({ where: { eventId: r.json<{ evenement: { id: string } }>().evenement.id } });
  expect(participants.map((p) => p.userId).sort()).toEqual([manager.id, basic.id, membre.id].sort());
});
