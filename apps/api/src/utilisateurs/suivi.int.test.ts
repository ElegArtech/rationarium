import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { creerClient, type PrismaClient } from "@rationarium/db";
import { UtilisateursService } from "./utilisateurs.service.js";
import { AuditService } from "../commun/audit.service.js";
import { PerimetreService } from "../commun/perimetre.service.js";

/**
 * L-36 — le suivi individuel. Vue 28.
 *
 * Le point que ces tests protègent : **chaque chiffre a son étendue**. Les
 * heures et les jours de télétravail suivent la période demandée ; le solde de
 * congés suit l'année civile ; les tâches actives valent à l'instant. Un test
 * qui ne vérifierait que le total confondrait les trois.
 */

const RACINE_DB = path.resolve(import.meta.dirname, "../../../../packages/db");
const utc = (s: string) => new Date(`${s}T00:00:00.000Z`);

let pg: StartedPostgreSqlContainer;
let prisma: PrismaClient;
let utilisateurs: UtilisateursService;
let agent: string;
let projet: string;

beforeAll(async () => {
  pg = await new PostgreSqlContainer("postgres:18-alpine").start();
  execFileSync("pnpm", ["exec", "prisma", "migrate", "deploy"], {
    cwd: RACINE_DB,
    env: { ...process.env, DATABASE_URL: pg.getConnectionUri() },
    stdio: "pipe",
  });
  prisma = creerClient(pg.getConnectionUri());
  utilisateurs = new UtilisateursService(
    prisma as never,
    new AuditService(prisma as never),
    new PerimetreService(prisma as never),
  );

  const u = await prisma.user.create({
    data: {
      login: "suivi.agent", email: "suivi.agent@x.fr", motDePasseHash: "x",
      prenom: "Suivie", nom: "Agente",
    },
  });
  agent = u.id;

  const p = await prisma.project.create({
    data: { nom: "Projet du suivi", dateDebut: utc("2026-01-01"), dateFin: utc("2026-12-31") },
  });
  projet = p.id;
}, 240_000);

afterAll(async () => {
  await prisma?.$disconnect();
  await pg?.stop();
});

const AOUT = { debut: utc("2026-08-01"), fin: utc("2026-08-31") };

describe("EX-USR-07 — chaque chiffre porte son étendue", () => {
  it("les heures saisies suivent la PÉRIODE, pas tout l'historique", async () => {
    await prisma.timeEntry.createMany({
      data: [
        { userId: agent, projectId: projet, date: utc("2026-08-05"), heures: 6 },
        { userId: agent, projectId: projet, date: utc("2026-08-06"), heures: 4 },
        // Hors période : ne doit pas être compté.
        { userId: agent, projectId: projet, date: utc("2026-07-15"), heures: 8 },
      ],
    });

    const suivi = await utilisateurs.suiviIndividuel(agent, AOUT);
    expect(suivi.statistiques.heuresSaisies).toBe(10);
    expect(suivi.temps).toHaveLength(2);
  });

  it("les jours de télétravail suivent la PÉRIODE, et seulement l'état télétravail", async () => {
    await prisma.telework.createMany({
      data: [
        { userId: agent, date: utc("2026-08-04"), etat: "telework" },
        { userId: agent, date: utc("2026-08-11"), etat: "telework" },
        // Un jour au bureau n'est pas un jour de télétravail.
        { userId: agent, date: utc("2026-08-12"), etat: "office" },
        // Hors période.
        { userId: agent, date: utc("2026-09-01"), etat: "telework" },
      ],
    });

    const suivi = await utilisateurs.suiviIndividuel(agent, AOUT);
    expect(suivi.statistiques.joursTeletravail).toBe(2);
  });

  it("le solde de congés suit l'ANNÉE CIVILE, pas la période", async () => {
    const type = await prisma.leaveType.create({
      data: { code: "CA_SUIVI", nom: "Congés annuels" },
    });
    const conge = await prisma.leave.create({
      data: {
        userId: agent, typeId: type.id,
        dateDebut: utc("2026-02-10"), dateFin: utc("2026-02-14"),
        statut: "approved", joursOuvres: 5,
      },
    });
    await prisma.leaveYearAllocation.create({
      data: { leaveId: conge.id, annee: 2026, jours: 5 },
    });

    // Février est HORS de la fenêtre d'août — et pourtant le congé compte :
    // un droit à congés ne se découpe pas en périodes glissantes.
    const suivi = await utilisateurs.suiviIndividuel(agent, AOUT);
    expect(suivi.statistiques.congesAnnee).toBe(5);
    expect(suivi.periode.annee).toBe(2026);
  });

  it("les tâches actives valent à L'INSTANT, quelle que soit la période", async () => {
    await prisma.task.create({
      data: {
        titre: "En cours", projectId: projet, statut: "doing",
        assignes: { create: { userId: agent } },
      },
    });
    await prisma.task.create({
      data: {
        titre: "Terminée", projectId: projet, statut: "done",
        assignes: { create: { userId: agent } },
      },
    });
    await prisma.task.create({
      data: {
        titre: "Bloquée", projectId: projet, statut: "blocked",
        assignes: { create: { userId: agent } },
      },
    });

    const suivi = await utilisateurs.suiviIndividuel(agent, AOUT);
    expect(suivi.statistiques.tachesActives).toBe(2);
    expect(suivi.statistiques.tachesTerminees).toBe(1);
    expect(suivi.statistiques.tachesBloquees).toBe(1);
  });

  it("une période qui ne couvre rien ne casse pas les autres chiffres", async () => {
    const vide = { debut: utc("2020-01-01"), fin: utc("2020-01-31") };
    const suivi = await utilisateurs.suiviIndividuel(agent, vide);

    expect(suivi.statistiques.heuresSaisies).toBe(0);
    expect(suivi.statistiques.joursTeletravail).toBe(0);
    // Les tâches actives ne dépendent pas de la période : elles restent là.
    expect(suivi.statistiques.tachesActives).toBe(2);
    // Le solde suit l'année de la FIN de période : 2020, donc rien.
    expect(suivi.statistiques.congesAnnee).toBe(0);
  });

  it("les projets actifs sont dédupliqués", async () => {
    await prisma.task.create({
      data: {
        titre: "Deuxième sur le même projet", projectId: projet, statut: "todo",
        assignes: { create: { userId: agent } },
      },
    });
    const suivi = await utilisateurs.suiviIndividuel(agent, AOUT);
    // Trois tâches actives sur un seul projet : le compte de projets est 1.
    expect(suivi.statistiques.projetsActifs).toBe(1);
  });

  it("un agent inexistant est refusé, pas rendu vide", async () => {
    await expect(
      utilisateurs.suiviIndividuel(crypto.randomUUID(), AOUT),
    ).rejects.toMatchObject({ code: "introuvable" });
  });

  it("l'identité rassemble rôle, département et services", async () => {
    const dep = await prisma.departement.create({ data: { nom: "Département du suivi" } });
    const svc = await prisma.service.create({
      data: { nom: "Service du suivi", departementId: dep.id },
    });
    await prisma.user.update({ where: { id: agent }, data: { departementId: dep.id } });
    await prisma.userService.create({ data: { userId: agent, serviceId: svc.id } });

    const suivi = await utilisateurs.suiviIndividuel(agent, AOUT);
    expect(suivi.agent.departement?.nom).toBe("Département du suivi");
    expect(suivi.agent.services.map((s) => s.nom)).toEqual(["Service du suivi"]);
  });
});
