import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { creerClient, type PrismaClient } from "@trame/db";
import { EvenementsService, ErreurEvenement } from "./evenements.service.js";
import { TeletravailService, ErreurTeletravail } from "../teletravail/teletravail.service.js";
import { ActiviteService, ErreurActivite } from "../activite/activite.service.js";
import { AuditService } from "../commun/audit.service.js";
import { PerimetreService } from "../commun/perimetre.service.js";

/** L-14, L-16, L-17 — événements, télétravail, activité récurrente. */

const RACINE_DB = path.resolve(import.meta.dirname, "../../../../packages/db");
const utc = (s: string) => new Date(`${s}T00:00:00.000Z`);

let pg: StartedPostgreSqlContainer;
let prisma: PrismaClient;
let evenements: EvenementsService;
let teletravail: TeletravailService;
let activite: ActiviteService;
let perimetres: PerimetreService;
let acteur: string;

const uuid = () => crypto.randomUUID();

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
  evenements = new EvenementsService(prisma as never, audit, perimetres);
  teletravail = new TeletravailService(prisma as never, audit, perimetres);
  activite = new ActiviteService(prisma as never, audit, perimetres);
  acteur = await agent();
}, 240_000);

afterAll(async () => {
  await prisma?.$disconnect();
  await pg?.stop();
});

const globalP = () => perimetres.resoudre(acteur, new Set(["users:manage_any"]));

// ══════════════════════════════ L-14 — Événements ══════════════════════════

describe("RG-EVT-02 — l'horizon de récurrence est plafonné", () => {
  it("une récurrence au-delà de l'horizon est refusée, et le refus dit la limite", async () => {
    // Sans plafond, une récurrence hebdomadaire sans fin engendrerait des
    // milliers d'occurrences.
    const erreur = await evenements
      .creer(
        {
          titre: "Réunion sans fin", date: utc("2026-01-05"), journeeEntiere: true,
          recurrence: { frequenceSemaines: 1, jourSemaine: 1, jusqua: utc("2036-01-05") },
        },
        acteur,
      )
      .catch((e: ErreurEvenement) => e);
    expect((erreur as ErreurEvenement).code).toBe("horizon_depasse");
    expect((erreur as ErreurEvenement).detail?.horizonAnnees).toBe(2);
  });

  it("l'horizon est un PARAMÈTRE — parti pris n° 3", async () => {
    await prisma.setting.upsert({
      where: { cle: "events.horizonRecurrenceAnnees" },
      create: { cle: "events.horizonRecurrenceAnnees", valeur: "10" },
      update: { valeur: "10" },
    });
    await expect(
      evenements.creer(
        {
          titre: "Longue série", date: utc("2026-01-05"), journeeEntiere: true,
          recurrence: { frequenceSemaines: 26, jourSemaine: 1, jusqua: utc("2030-01-05") },
        },
        acteur,
      ),
    ).resolves.toBeTruthy();
    await prisma.setting.update({
      where: { cle: "events.horizonRecurrenceAnnees" },
      data: { valeur: "2" },
    });
  });
});

describe("RG-EVT-03, RG-EVT-04 — arrêter une récurrence", () => {
  it("supprime les occurrences FUTURES et conserve les passées", async () => {
    const { evenement, occurrences } = await evenements.creer(
      {
        titre: "Point hebdo", date: utc("2026-02-02"), journeeEntiere: true,
        recurrence: { frequenceSemaines: 1, jourSemaine: 1, jusqua: utc("2026-04-27") },
      },
      acteur,
    );
    expect(occurrences).toBeGreaterThan(10);

    const r = await evenements.arreterRecurrence(evenement.id, utc("2026-03-16"), acteur);
    expect(r.supprimees).toBeGreaterThan(0);

    const restantes = await prisma.event.findMany({ where: { parentId: evenement.id } });
    // Effacer tout détruirait de l'historique ; ne rien effacer laisserait des
    // réunions fantômes au calendrier.
    expect(restantes.every((e) => e.date < utc("2026-03-16"))).toBe(true);
    expect(restantes.length).toBeGreaterThan(0);
  });

  it("seul un PARENT peut voir sa récurrence arrêtée", async () => {
    const { evenement } = await evenements.creer(
      {
        titre: "Série", date: utc("2026-05-04"), journeeEntiere: true,
        recurrence: { frequenceSemaines: 1, jourSemaine: 1, jusqua: utc("2026-06-01") },
      },
      acteur,
    );
    const occurrence = await prisma.event.findFirstOrThrow({ where: { parentId: evenement.id } });
    await expect(
      evenements.arreterRecurrence(occurrence.id, utc("2026-05-18"), acteur),
    ).rejects.toMatchObject({ code: "pas_un_parent" });
  });
});

describe("RG-EVT-01, RG-EVT-05 — participants et plage", () => {
  it("un participant ne s'ajoute pas deux fois", async () => {
    const u = await agent();
    const { evenement } = await evenements.creer(
      { titre: "Atelier", date: utc("2026-06-08"), journeeEntiere: true, participantIds: [u] },
      acteur,
    );
    await expect(evenements.ajouterParticipant(evenement.id, u, acteur)).rejects.toMatchObject({
      code: "participant_en_double",
    });
  });

  it("une plage incomplète est refusée — ce serait un export déguisé", async () => {
    const p = await globalP();
    await expect(
      evenements.surPlage(p, new Set(["events:readAll"]), null, utc("2026-12-31")),
    ).rejects.toMatchObject({ code: "plage_incomplete" });
  });

  it("sans lecture élargie, on ne voit que les événements où l'on participe", async () => {
    const participant = await agent();
    const etranger = await agent();
    await evenements.creer(
      {
        titre: "Privée", date: utc("2026-07-06"), journeeEntiere: true,
        participantIds: [participant],
      },
      acteur,
    );

    const pEtranger = await perimetres.resoudre(etranger, new Set());
    const vus = await evenements.surPlage(pEtranger, new Set(), utc("2026-07-01"), utc("2026-07-31"));
    expect(vus.map((e) => e.titre)).not.toContain("Privée");

    const pParticipant = await perimetres.resoudre(participant, new Set());
    const siens = await evenements.surPlage(
      pParticipant, new Set(), utc("2026-07-01"), utc("2026-07-31"),
    );
    expect(siens.map((e) => e.titre)).toContain("Privée");
  });

  it("des horaires incohérents sont refusés", async () => {
    await expect(
      evenements.creer(
        { titre: "R", date: utc("2026-08-03"), heureDebut: "14:00", heureFin: "10:00" },
        acteur,
      ),
    ).rejects.toMatchObject({ code: "horaires_incoherents" });
  });
});

// ══════════════════════════════ L-16 — Télétravail ═════════════════════════

describe("RG-TLT-02 — trois états, et « bureau » n'est pas « non déclaré »", () => {
  it("distingue déclaré et non déclaré", async () => {
    const u = await agent();
    await teletravail.basculer(u, utc("2026-03-02"), "office", acteur);

    const p = await teletravail.planning(u, utc("2026-03-02"), utc("2026-03-06"));
    const lundi = p.calendrier.find((j) => j.date === "2026-03-02")!;
    const mardi = p.calendrier.find((j) => j.date === "2026-03-03")!;

    // La première dit « j'ai répondu », la seconde « je n'ai rien dit ».
    // Les confondre ferait passer un oubli pour une présence.
    expect(lundi.etat).toBe("office");
    expect(mardi.etat).toBe("undeclared");
    expect(p.cumul.bureau).toBe(1);
    expect(p.cumul.nonDeclares).toBe(4);
  });

  it("le week-end est distingué et n'entre pas dans les non déclarés", async () => {
    const u = await agent();
    const p = await teletravail.planning(u, utc("2026-03-02"), utc("2026-03-08"));
    expect(p.calendrier.filter((j) => j.weekend)).toHaveLength(2);
    expect(p.cumul.nonDeclares).toBe(5);
  });

  it("RG-TLT-06 — une plage de plus de 366 jours est refusée", async () => {
    const u = await agent();
    await expect(
      teletravail.planning(u, utc("2026-01-01"), utc("2027-06-01")),
    ).rejects.toMatchObject({ code: "plage_trop_longue" });
  });
});

describe("RG-TLT-04, RG-TLT-05 — règles et exceptions", () => {
  it("la génération crée les jours et rend compte des ignorés", async () => {
    const u = await agent();
    // Lundi = 1.
    await teletravail.creerRegle({ userId: u, jourSemaine: 1, dateDebut: utc("2026-03-01") }, acteur);

    const premier = await teletravail.generer(u, utc("2026-03-01"), utc("2026-03-31"), acteur);
    expect(premier.crees).toBe(5);
    expect(premier.ignores).toBe(0);

    const second = await teletravail.generer(u, utc("2026-03-01"), utc("2026-03-31"), acteur);
    expect(second.crees).toBe(0);
    expect(second.ignores).toBe(5);
  });

  it("UNE EXCEPTION POSÉE À LA MAIN SURVIT À LA RÉGÉNÉRATION", async () => {
    const u = await agent();
    await teletravail.creerRegle({ userId: u, jourSemaine: 2, dateDebut: utc("2026-04-01") }, acteur);
    await teletravail.generer(u, utc("2026-04-01"), utc("2026-04-30"), acteur);

    // L'agent corrige un mardi : il sera au bureau ce jour-là.
    await teletravail.basculer(u, utc("2026-04-14"), "office", acteur);
    const apresBascule = await prisma.telework.findUniqueOrThrow({
      where: { userId_date: { userId: u, date: utc("2026-04-14") } },
    });
    expect(apresBascule.exception).toBe(true);

    await teletravail.generer(u, utc("2026-04-01"), utc("2026-04-30"), acteur);

    // Sans le marquage d'exception, la régénération annulerait silencieusement
    // l'ajustement de l'agent.
    const apresRegeneration = await prisma.telework.findUniqueOrThrow({
      where: { userId_date: { userId: u, date: utc("2026-04-14") } },
    });
    expect(apresRegeneration.etat).toBe("office");
  });

  it("RG-TLT-03 — une règle est unique pour jour de semaine × date de début", async () => {
    const u = await agent();
    await teletravail.creerRegle({ userId: u, jourSemaine: 3, dateDebut: utc("2026-05-01") }, acteur);
    await expect(
      teletravail.creerRegle({ userId: u, jourSemaine: 3, dateDebut: utc("2026-05-01") }, acteur),
    ).rejects.toMatchObject({ code: "regle_en_double" });
  });

  it("EX-TLT-05 — l'aperçu d'une règle est une CLÉ, pas du texte figé", async () => {
    const apercu = teletravail.apercuRegle({ jourSemaine: 2, dateDebut: utc("2026-01-05") });
    // RG-GEN-08 interdit toute chaîne figée, y compris ici où la tentation de
    // concaténer est forte.
    expect(apercu.cle).toBe("teletravail.regle.sansFin");
    expect(apercu.valeurs.jour).toBe(2);
  });
});

// ═══════════════════════ L-17 — Activité récurrente ════════════════════════

describe("RG-ACT-04 — le piège calendaire : le 31 février", () => {
  it("ramène au dernier jour du mois quand le jour n'existe pas", async () => {
    // Une construction naïve new Date(2026, 1, 31) déborderait sur mars.
    expect(activite.dateMensuelle(2026, 1, 31).toISOString().slice(0, 10)).toBe("2026-02-28");
    expect(activite.dateMensuelle(2028, 1, 31).toISOString().slice(0, 10)).toBe("2028-02-29");
    expect(activite.dateMensuelle(2026, 3, 31).toISOString().slice(0, 10)).toBe("2026-04-30");
  });

  it("laisse la date intacte quand elle existe", async () => {
    expect(activite.dateMensuelle(2026, 0, 15).toISOString().slice(0, 10)).toBe("2026-01-15");
    expect(activite.dateMensuelle(2026, 0, 31).toISOString().slice(0, 10)).toBe("2026-01-31");
  });

  it("calcule les récurrences ordinales — « le 3ᵉ mardi », « le dernier vendredi »", async () => {
    // Mars 2026 : les mardis sont les 3, 10, 17, 24, 31.
    expect(activite.dateOrdinale(2026, 2, 2, 3)?.toISOString().slice(0, 10)).toBe("2026-03-17");
    expect(activite.dateOrdinale(2026, 2, 2, -1)?.toISOString().slice(0, 10)).toBe("2026-03-31");
    // Un 5ᵉ lundi qui n'existe pas rend null plutôt qu'une date fausse.
    expect(activite.dateOrdinale(2026, 1, 1, 5)).toBeNull();
  });
});

describe("RG-ACT-02, RG-ACT-05 — catalogue", () => {
  it("une durée « créneau horaire » exige ses horaires", async () => {
    await expect(
      activite.creerTache({ nom: `Astreinte ${uuid().slice(0, 6)}`, dureeParDefaut: "time_slot" }, acteur),
    ).rejects.toMatchObject({ code: "creneau_sans_horaires" });
  });

  it("une tâche inactive n'est plus assignable, mais le passé est conservé", async () => {
    const t = await activite.creerTache({ nom: `Ancienne ${uuid().slice(0, 6)}` }, acteur);
    const u = await agent();
    const p = await globalP();
    await activite.assigner(t.id, [u], utc("2026-06-01"), "full_day", acteur, p);

    await prisma.predefinedTask.update({ where: { id: t.id }, data: { actif: false } });

    await expect(
      activite.assigner(t.id, [u], utc("2026-06-02"), "full_day", acteur, p),
    ).rejects.toMatchObject({ code: "tache_inactive" });

    // Le passé subsiste.
    expect(
      await prisma.predefinedTaskAssignment.count({ where: { predefinedTaskId: t.id } }),
    ).toBe(1);
  });
});

describe("RG-ACT-03 — l'inéligibilité est NOMMÉE, agent par agent", () => {
  it("dit pourquoi chaque agent est inéligible, plutôt que de les masquer", async () => {
    const t = await activite.creerTache(
      { nom: `Accueil ${uuid().slice(0, 6)}`, teletravailAutorise: false },
      acteur,
    );
    const date = utc("2026-09-14");

    const dispo = await agent();
    const assigne = await agent();
    const enConge = await agent();
    const enTt = await agent();

    const p = await globalP();
    await activite.assigner(t.id, [assigne], date, "full_day", acteur, p);

    const type = uuid();
    await prisma.leaveType.create({ data: { id: type, code: `C${type.slice(0, 4)}`, nom: "Congé annuel" } });
    await prisma.leave.create({
      data: {
        userId: enConge, typeId: type, dateDebut: date, dateFin: date,
        joursOuvres: 1, statut: "approved",
      },
    });
    await prisma.telework.create({ data: { userId: enTt, date, etat: "telework" } });

    const eligibilite = await activite.eligibilite(t.id, date, "full_day", p);
    const parId = new Map(eligibilite.map((e) => [e.userId, e]));

    // Masquer les inéligibles priverait le manager de l'information qui
    // compte : POURQUOI il ne peut pas l'assigner.
    expect(parId.get(dispo)?.motif).toBeNull();
    expect(parId.get(assigne)?.motif).toBe("deja_assigne");
    expect(parId.get(enConge)?.motif).toBe("en_conge");
    expect(parId.get(enConge)?.detail).toBe("Congé annuel");
    expect(parId.get(enTt)?.motif).toBe("en_teletravail");
  });

  it("le refus d'assignation NOMME les agents incompatibles", async () => {
    const t = await activite.creerTache(
      { nom: `Permanence ${uuid().slice(0, 6)}`, teletravailAutorise: false },
      acteur,
    );
    const date = utc("2026-09-21");
    const u = await agent();
    await prisma.telework.create({ data: { userId: u, date, etat: "telework" } });

    const p = await globalP();
    const erreur = await activite
      .assigner(t.id, [u], date, "full_day", acteur, p)
      .catch((e: ErreurActivite) => e);

    expect((erreur as ErreurActivite).code).toBe("agent_indisponible");
    expect((erreur as ErreurActivite).detail?.agents).toHaveLength(1);
  });

  it("le télétravail n'empêche rien quand la tâche l'autorise", async () => {
    const t = await activite.creerTache(
      { nom: `Astreinte ${uuid().slice(0, 6)}`, teletravailAutorise: true },
      acteur,
    );
    const date = utc("2026-09-28");
    const u = await agent();
    await prisma.telework.create({ data: { userId: u, date, etat: "telework" } });

    const p = await globalP();
    await expect(activite.assigner(t.id, [u], date, "full_day", acteur, p)).resolves.toMatchObject({
      crees: 1,
    });
  });
});

describe("RG-ACT-06 — la génération rend compte", () => {
  it("créées et ignorées sont comptées séparément", async () => {
    const t = await activite.creerTache({ nom: `Garde ${uuid().slice(0, 6)}` }, acteur);
    const u = await agent();
    await prisma.predefinedTaskRecurrence.create({
      data: {
        predefinedTaskId: t.id, type: "weekly", frequence: 1,
        jourSemaine: 1, dateDebut: utc("2026-10-01"),
      },
    });

    const premier = await activite.genererDepuisRecurrences(
      t.id, utc("2026-10-01"), utc("2026-10-31"), [u], acteur,
    );
    expect(premier.crees).toBeGreaterThan(0);
    expect(premier.ignores).toBe(0);

    const second = await activite.genererDepuisRecurrences(
      t.id, utc("2026-10-01"), utc("2026-10-31"), [u], acteur,
    );
    expect(second.crees).toBe(0);
    expect(second.ignores).toBe(premier.crees);
  });

  it("une récurrence mensuelle à date fixe respecte RG-ACT-04", async () => {
    const t = await activite.creerTache({ nom: `Mensuelle ${uuid().slice(0, 6)}` }, acteur);
    const u = await agent();
    await prisma.predefinedTaskRecurrence.create({
      data: {
        predefinedTaskId: t.id, type: "monthly_fixed",
        jourMois: 31, dateDebut: utc("2026-01-01"),
      },
    });

    await activite.genererDepuisRecurrences(t.id, utc("2026-02-01"), utc("2026-02-28"), [u], acteur);
    const assignations = await prisma.predefinedTaskAssignment.findMany({
      where: { predefinedTaskId: t.id },
    });
    expect(assignations).toHaveLength(1);
    expect(assignations[0]!.date.toISOString().slice(0, 10)).toBe("2026-02-28");
  });
});

describe("EX-ACT-07 — la grille d'activité inverse les axes", () => {
  it("jours en lignes, tâches en colonnes", async () => {
    const t = await activite.creerTache({ nom: `Grille ${uuid().slice(0, 6)}` }, acteur);
    const u = await agent();
    const p = await globalP();
    await activite.assigner(t.id, [u], utc("2026-11-02"), "full_day", acteur, p);

    const g = await activite.grille(utc("2026-11-02"), utc("2026-11-06"), p);
    expect(g.lignes).toHaveLength(5);
    expect(g.colonnes.some((c) => c.id === t.id)).toBe(true);

    const lundi = g.lignes.find((l) => l.date === "2026-11-02")!;
    const cellule = lundi.cellules.find((c) => c.tacheId === t.id)!;
    expect(cellule.agents).toHaveLength(1);
  });
});
