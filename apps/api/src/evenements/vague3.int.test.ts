import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { creerClient, type PrismaClient } from "@rationarium/db";
import { EvenementsService, ErreurEvenement } from "./evenements.service.js";
import { TeletravailService } from "../teletravail/teletravail.service.js";
import { ActiviteService, ErreurActivite } from "../activite/activite.service.js";
import { AuditService } from "../commun/audit.service.js";
import { PerimetreService } from "../commun/perimetre.service.js";

/**
 * `RG-TLT-07` — « agir sur le télétravail d'autrui exige une permission
 * dédiée » — est appliquée depuis la vague 7. Ces tests posent et génèrent du
 * télétravail pour d'autres agents : ils portent donc les droits d'un encadrant.
 * Les tests de REFUS vivent dans `teletravail/teletravail.int.test.ts`.
 */
const DROITS_ENCADRANT: ReadonlySet<string> = new Set([
  "telework:read",
  "telework:create",
  "telework:generate",
  "telework:read_team",
  "telework:manage_any",
  "telework:manage_rules",
]);

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

/** Le jeu de permissions d'un compte à vue complète — `RG-SCOPE-03`. */
const PERMISSIONS_GLOBALES: ReadonlySet<string> = new Set(["users:manage_any"]);
const globalP = () => perimetres.resoudre(acteur, PERMISSIONS_GLOBALES);

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

    const r = await evenements.arreterRecurrence(
      evenement.id, utc("2026-03-16"), acteur, await globalP(), PERMISSIONS_GLOBALES,
    );
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
      evenements.arreterRecurrence(
        occurrence.id, utc("2026-05-18"), acteur, await globalP(), PERMISSIONS_GLOBALES,
      ),
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
    await expect(
      evenements.ajouterParticipant(evenement.id, u, acteur, await globalP(), PERMISSIONS_GLOBALES),
    ).rejects.toMatchObject({ code: "participant_en_double" });
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

// ── L-42 — modifier et supprimer un événement ──────────────────────────────

/**
 * `EX-EVT-06`, `RG-EVT-07`, `RG-GEN-07`.
 *
 * Le test qui compte de ce lot est celui de la cascade : le schéma déclare
 * `parent Event? @relation("Serie", onDelete: Cascade)`, donc supprimer le
 * parent d'une série efface TOUTE la série, le passé compris. Aucun contrôle
 * applicatif ne pouvait le voir — la ligne visée disparaît bien, et c'est ce
 * qui disparaît EN PLUS qu'il faut aller compter.
 */
describe("EX-EVT-06, RG-EVT-07 — modifier et supprimer un événement", () => {
  /** Une série hebdomadaire, parent inclus, rendue dans l'ordre des dates. */
  async function serieHebdo(titre: string, depart: string, jusqua: string) {
    const { evenement } = await evenements.creer(
      {
        titre, date: utc(depart), journeeEntiere: true,
        recurrence: { frequenceSemaines: 1, jourSemaine: 1, jusqua: utc(jusqua) },
      },
      acteur,
    );
    const membres = await prisma.event.findMany({
      where: { OR: [{ id: evenement.id }, { parentId: evenement.id }] },
      orderBy: { date: "asc" },
    });
    return { parent: evenement, membres };
  }

  it("EX-EVT-06 — un événement isolé se modifie, puis se supprime", async () => {
    const { evenement } = await evenements.creer(
      { titre: "Point technique", date: utc("2027-01-05"), heureDebut: "09:00", heureFin: "10:00" },
      acteur,
    );

    const modifie = await evenements.modifier(
      evenement.id,
      { version: evenement.version, titre: "Point technique élargi", heureFin: "11:00" },
      acteur,
      await globalP(),
      PERMISSIONS_GLOBALES,
    );
    expect(modifie.titre).toBe("Point technique élargi");
    expect(modifie.heureFin).toBe("11:00");
    // `RG-GEN-07` — l'écriture incrémente la version, sinon la lecture suivante
    // rejouerait indéfiniment la même.
    expect(modifie.version).toBe(evenement.version + 1);

    const r = await evenements.supprimer(
      evenement.id, { version: modifie.version }, acteur, await globalP(), PERMISSIONS_GLOBALES,
    );
    expect(r.supprimees).toBe(1);
    expect(await prisma.event.findUnique({ where: { id: evenement.id } })).toBeNull();
  });

  it("EX-EVT-06 — la cohérence des horaires se juge sur l'état RÉSULTANT, pas sur le corps reçu", async () => {
    const { evenement } = await evenements.creer(
      { titre: "Atelier", date: utc("2027-01-12"), heureDebut: "14:00", heureFin: "16:00" },
      acteur,
    );
    // Seule `heureFin` change, et elle passe avant une `heureDebut` qui n'est
    // pas dans la requête : licite requête par requête, incohérent en résultat.
    await expect(
      evenements.modifier(
        evenement.id, { version: evenement.version, heureFin: "10:00" },
        acteur, await globalP(), PERMISSIONS_GLOBALES,
      ),
    ).rejects.toMatchObject({ code: "horaires_incoherents" });
  });

  it("RG-EVT-07 — la portée est EXIGÉE sur une série, et REFUSÉE hors série", async () => {
    const { parent, membres } = await serieHebdo("Comité", "2027-02-01", "2027-03-29");
    const occurrence = membres[2]!;

    // Sur une série, l'omettre laisserait le serveur choisir : le brief de la
    // vue 18 veut la distinction « explicite au moment de l'action ».
    await expect(
      evenements.modifier(
        occurrence.id, { version: occurrence.version, titre: "X" },
        acteur, await globalP(), PERMISSIONS_GLOBALES,
      ),
    ).rejects.toMatchObject({ code: "portee_requise" });
    await expect(
      evenements.supprimer(
        parent.id, { version: parent.version }, acteur, await globalP(), PERMISSIONS_GLOBALES,
      ),
    ).rejects.toMatchObject({ code: "portee_requise" });

    // Hors série, la question n'a pas d'objet : l'accepter donnerait raison à
    // un client qui croit agir sur une série inexistante.
    const { evenement: isole } = await evenements.creer(
      { titre: "Réunion unique", date: utc("2027-02-02"), journeeEntiere: true },
      acteur,
    );
    await expect(
      evenements.modifier(
        isole.id, { version: isole.version, portee: "serie", titre: "X" },
        acteur, await globalP(), PERMISSIONS_GLOBALES,
      ),
    ).rejects.toMatchObject({ code: "portee_sans_serie" });
    await expect(
      evenements.supprimer(
        isole.id, { version: isole.version, portee: "occurrence" },
        acteur, await globalP(), PERMISSIONS_GLOBALES,
      ),
    ).rejects.toMatchObject({ code: "portee_sans_serie" });

    // Le refus n'a rien détruit : c'est un refus, pas un effet de bord.
    expect(await prisma.event.findUnique({ where: { id: isole.id } })).not.toBeNull();
  });

  it("RG-EVT-07 — « cette occurrence seulement » ne touche QUE l'occurrence visée", async () => {
    const { parent, membres } = await serieHebdo("Revue de sprint", "2027-04-05", "2027-05-31");
    const cible = membres[3]!;

    await evenements.modifier(
      cible.id,
      { version: cible.version, portee: "occurrence", titre: "Revue de sprint — exception" },
      acteur, await globalP(), PERMISSIONS_GLOBALES,
    );

    const apres = await prisma.event.findMany({
      where: { OR: [{ id: parent.id }, { parentId: parent.id }] },
    });
    const renommes = apres.filter((e) => e.titre === "Revue de sprint — exception");
    expect(renommes.map((e) => e.id)).toEqual([cible.id]);
    expect(apres).toHaveLength(membres.length);
  });

  it("RG-EVT-07 — « toute la série » ne réécrit PAS le passé", async () => {
    const { parent, membres } = await serieHebdo("Permanence", "2027-06-07", "2027-08-02");
    const cible = membres[3]!;
    const passe = membres.filter((m) => m.date < cible.date);
    const depuis = membres.filter((m) => m.date >= cible.date);
    expect(passe.length).toBeGreaterThan(0);
    expect(depuis.length).toBeGreaterThan(1);

    await evenements.modifier(
      cible.id,
      { version: cible.version, portee: "serie", titre: "Permanence renforcée" },
      acteur, await globalP(), PERMISSIONS_GLOBALES,
    );

    const apres = await prisma.event.findMany({
      where: { OR: [{ id: parent.id }, { parentId: parent.id }] },
    });
    // Les occurrences déjà tenues gardent leur libellé : réécrire leur titre
    // réécrirait l'histoire de ceux qui y étaient.
    for (const m of passe) {
      expect(apres.find((e) => e.id === m.id)?.titre, m.date.toISOString()).toBe("Permanence");
    }
    for (const m of depuis) {
      expect(apres.find((e) => e.id === m.id)?.titre, m.date.toISOString()).toBe(
        "Permanence renforcée",
      );
    }
  });

  it("RG-EVT-07 — la date ne se propage jamais à une série", async () => {
    const { membres } = await serieHebdo("Comité de suivi", "2027-09-06", "2027-10-25");
    const cible = membres[2]!;
    await expect(
      evenements.modifier(
        cible.id,
        { version: cible.version, portee: "serie", date: utc("2027-09-07") },
        acteur, await globalP(), PERMISSIONS_GLOBALES,
      ),
    ).rejects.toMatchObject({ code: "date_non_propageable" });

    // La même date, en portée « occurrence », est parfaitement légitime.
    const deplacee = await evenements.modifier(
      cible.id,
      { version: cible.version, portee: "occurrence", date: utc("2027-09-22") },
      acteur, await globalP(), PERMISSIONS_GLOBALES,
    );
    expect(deplacee.date.toISOString().slice(0, 10)).toBe("2027-09-22");
  });

  /* ══════════════════════════════════════════════════════════════════════════
   * LE TEST QUI COMPTE : la suppression ne détruit jamais le passé.
   * ══════════════════════════════════════════════════════════════════════════ */

  it("RG-EVT-07 — SUPPRIMER « TOUTE LA SÉRIE » NE DÉTRUIT PAS LE PASSÉ", async () => {
    const { parent, membres } = await serieHebdo("Point hebdomadaire", "2028-01-03", "2028-02-28");
    const cible = membres[4]!;
    const passe = membres.filter((m) => m.date < cible.date);
    const futur = membres.filter((m) => m.date >= cible.date);
    expect(passe).toHaveLength(4);
    expect(futur.length).toBeGreaterThan(1);

    const r = await evenements.supprimer(
      cible.id, { version: cible.version, portee: "serie" },
      acteur, await globalP(), PERMISSIONS_GLOBALES,
    );
    expect(r.supprimees).toBe(futur.length);

    const restantes = await prisma.event.findMany({
      where: { OR: [{ id: parent.id }, { parentId: parent.id }] },
      orderBy: { date: "asc" },
    });
    // Exactement le passé, ligne par ligne : « il en reste » ne suffirait pas,
    // c'est « il reste CELLES-LÀ » qui prouve que rien d'antérieur n'est parti.
    expect(restantes.map((e) => e.id)).toEqual(passe.map((m) => m.id));
    // Et la série déclare sa nouvelle fin, comme RG-EVT-04 le fait pour l'arrêt.
    const parentApres = await prisma.event.findUniqueOrThrow({ where: { id: parent.id } });
    expect(parentApres.recurrenceFin?.toISOString().slice(0, 10)).toBe("2028-01-31");
  });

  it("RG-EVT-07 — SUPPRIMER LE PARENT N'EMPORTE PAS LA SÉRIE AVEC LUI (cascade)", async () => {
    /*
     * `onDelete: Cascade` sur la relation « Serie » : sans promotion préalable
     * de la plus ancienne occurrence conservée, cette suppression efface les
     * autres — des réunions déjà tenues, disparues d'un coup, sans une seule
     * erreur. C'est le défaut que ce lot existe pour empêcher.
     */
    const { parent, membres } = await serieHebdo("Réunion de service", "2028-04-03", "2028-05-29");
    const suite = membres.filter((m) => m.id !== parent.id);
    expect(suite.length).toBeGreaterThan(5);

    const r = await evenements.supprimer(
      parent.id, { version: parent.version, portee: "occurrence" },
      acteur, await globalP(), PERMISSIONS_GLOBALES,
    );
    expect(r.supprimees).toBe(1);

    const restantes = await prisma.event.findMany({
      where: { id: { in: suite.map((m) => m.id) } },
      orderBy: { date: "asc" },
    });
    expect(restantes.map((e) => e.id)).toEqual(suite.map((m) => m.id));

    // La série a survécu ET elle a toujours un parent : le plus ancien des
    // survivants a été promu, et les autres lui sont rattachés. Une série sans
    // parent ne pourrait plus voir sa récurrence arrêtée (`RG-EVT-03`).
    const promu = restantes[0]!;
    expect(promu.parentId).toBeNull();
    expect(promu.recurrenceFrequence).toBe(1);
    expect(promu.recurrenceFin?.toISOString().slice(0, 10)).toBe("2028-05-29");
    expect(restantes.slice(1).every((e) => e.parentId === promu.id)).toBe(true);

    // Et le parent promu accepte bien l'arrêt de récurrence — la série est
    // réellement réparée, pas seulement debout.
    await expect(
      evenements.arreterRecurrence(
        promu.id, utc("2028-05-01"), acteur, await globalP(), PERMISSIONS_GLOBALES,
      ),
    ).resolves.toMatchObject({ supprimees: expect.any(Number) });
  });

  it("RG-EVT-07 — supprimer « toute la série » depuis le parent efface la série entière", async () => {
    const { parent, membres } = await serieHebdo("Comité éphémère", "2028-07-03", "2028-08-07");
    const r = await evenements.supprimer(
      parent.id, { version: parent.version, portee: "serie" },
      acteur, await globalP(), PERMISSIONS_GLOBALES,
    );
    expect(r.supprimees).toBe(membres.length);
    expect(await prisma.event.count({ where: { id: { in: membres.map((m) => m.id) } } })).toBe(0);
  });

  it("RG-GEN-07 — une version périmée est refusée en conflit_de_version, à la modification comme à la suppression", async () => {
    const { evenement } = await evenements.creer(
      { titre: "Séance de cadrage", date: utc("2028-10-02"), journeeEntiere: true },
      acteur,
    );
    const perimee = evenement.version;

    // Quelqu'un d'autre écrit d'abord.
    await evenements.modifier(
      evenement.id, { version: perimee, titre: "Séance de cadrage (v2)" },
      acteur, await globalP(), PERMISSIONS_GLOBALES,
    );

    const echecModification = await evenements
      .modifier(
        evenement.id, { version: perimee, titre: "Écrasement" },
        acteur, await globalP(), PERMISSIONS_GLOBALES,
      )
      .catch((e: ErreurEvenement) => e);
    expect((echecModification as ErreurEvenement).code).toBe("conflit_de_version");
    expect((echecModification as ErreurEvenement).detail).toMatchObject({ recue: perimee });

    // La concurrence est DÉTECTÉE, jamais écrasée : l'écriture perdante n'a
    // rien changé.
    const intact = await prisma.event.findUniqueOrThrow({ where: { id: evenement.id } });
    expect(intact.titre).toBe("Séance de cadrage (v2)");

    await expect(
      evenements.supprimer(
        evenement.id, { version: perimee }, acteur, await globalP(), PERMISSIONS_GLOBALES,
      ),
    ).rejects.toMatchObject({ code: "conflit_de_version" });
    // Et surtout : le refus n'a pas supprimé la ligne au passage.
    expect(await prisma.event.findUnique({ where: { id: evenement.id } })).not.toBeNull();
  });

  it("RG-GEN-07 — la version se réclame sur l'occurrence VISÉE, et seule la portée suit", async () => {
    const { parent, membres } = await serieHebdo("Brief matinal", "2029-01-01", "2029-02-05");
    const cible = membres[2]!;
    await evenements.modifier(
      cible.id, { version: cible.version, portee: "serie", titre: "Brief matinal étendu" },
      acteur, await globalP(), PERMISSIONS_GLOBALES,
    );
    const apres = await prisma.event.findMany({
      where: { OR: [{ id: parent.id }, { parentId: parent.id }] },
      orderBy: { date: "asc" },
    });
    for (const m of membres) {
      const maintenant = apres.find((e) => e.id === m.id)!;
      const attendue = m.date >= cible.date ? m.version + 1 : m.version;
      expect(maintenant.version, m.date.toISOString()).toBe(attendue);
    }
  });

  it("EX-EVT-06 — hors périmètre, un événement ne se modifie ni ne se supprime", async () => {
    const participant = await agent();
    const etranger = await agent();
    const { evenement } = await evenements.creer(
      {
        titre: "Réunion fermée", date: utc("2029-03-05"), journeeEntiere: true,
        participantIds: [participant],
      },
      acteur,
    );

    const pEtranger = await perimetres.resoudre(etranger, new Set());
    await expect(
      evenements.modifier(
        evenement.id, { version: evenement.version, titre: "Intrusion" },
        etranger, pEtranger, new Set(),
      ),
    ).rejects.toMatchObject({ code: "hors_perimetre" });
    await expect(
      evenements.supprimer(
        evenement.id, { version: evenement.version }, etranger, pEtranger, new Set(),
      ),
    ).rejects.toMatchObject({ code: "hors_perimetre" });
    expect(await prisma.event.findUnique({ where: { id: evenement.id } })).not.toBeNull();

    /*
     * L'assertion inverse, sans laquelle la précédente ne prouve rien : le
     * participant, lui, PEUT agir — sans périmètre global ni lecture élargie.
     * Un contrôle qui refuserait tout le monde passerait le premier cas.
     */
    const pParticipant = await perimetres.resoudre(participant, new Set());
    const modifie = await evenements.modifier(
      evenement.id, { version: evenement.version, titre: "Réunion fermée (déplacée)" },
      participant, pParticipant, new Set(),
    );
    expect(modifie.titre).toBe("Réunion fermée (déplacée)");
  });

  it("EX-EVT-06 — la suppression est portée au journal d'audit", async () => {
    const { evenement } = await evenements.creer(
      { titre: "Séance à tracer", date: utc("2029-05-07"), journeeEntiere: true },
      acteur,
    );
    await evenements.supprimer(
      evenement.id, { version: evenement.version }, acteur, await globalP(), PERMISSIONS_GLOBALES,
    );
    const trace = await prisma.auditLog.findFirst({
      where: { typeEntite: "Event", entiteId: evenement.id, action: "event.delete" },
    });
    expect(trace).not.toBeNull();
  });
});

// ══════════════════════════════ L-16 — Télétravail ═════════════════════════

describe("RG-TLT-02 — trois états, et « bureau » n'est pas « non déclaré »", () => {
  it("distingue déclaré et non déclaré", async () => {
    const u = await agent();
    await teletravail.basculer(u, utc("2026-03-02"), "office", acteur, DROITS_ENCADRANT);

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
    await teletravail.creerRegle({ userId: u, jourSemaine: 1, dateDebut: utc("2026-03-01") }, acteur, DROITS_ENCADRANT);

    const premier = await teletravail.generer(u, utc("2026-03-01"), utc("2026-03-31"), acteur, DROITS_ENCADRANT);
    expect(premier.crees).toBe(5);
    expect(premier.ignores).toBe(0);

    const second = await teletravail.generer(u, utc("2026-03-01"), utc("2026-03-31"), acteur, DROITS_ENCADRANT);
    expect(second.crees).toBe(0);
    expect(second.ignores).toBe(5);
  });

  it("UNE EXCEPTION POSÉE À LA MAIN SURVIT À LA RÉGÉNÉRATION", async () => {
    const u = await agent();
    await teletravail.creerRegle({ userId: u, jourSemaine: 2, dateDebut: utc("2026-04-01") }, acteur, DROITS_ENCADRANT);
    await teletravail.generer(u, utc("2026-04-01"), utc("2026-04-30"), acteur, DROITS_ENCADRANT);

    // L'agent corrige un mardi : il sera au bureau ce jour-là.
    await teletravail.basculer(u, utc("2026-04-14"), "office", acteur, DROITS_ENCADRANT);
    const apresBascule = await prisma.telework.findUniqueOrThrow({
      where: { userId_date: { userId: u, date: utc("2026-04-14") } },
    });
    expect(apresBascule.exception).toBe(true);

    await teletravail.generer(u, utc("2026-04-01"), utc("2026-04-30"), acteur, DROITS_ENCADRANT);

    // Sans le marquage d'exception, la régénération annulerait silencieusement
    // l'ajustement de l'agent.
    const apresRegeneration = await prisma.telework.findUniqueOrThrow({
      where: { userId_date: { userId: u, date: utc("2026-04-14") } },
    });
    expect(apresRegeneration.etat).toBe("office");
  });

  it("RG-TLT-03 — une règle est unique pour jour de semaine × date de début", async () => {
    const u = await agent();
    await teletravail.creerRegle({ userId: u, jourSemaine: 3, dateDebut: utc("2026-05-01") }, acteur, DROITS_ENCADRANT);
    await expect(
      teletravail.creerRegle({ userId: u, jourSemaine: 3, dateDebut: utc("2026-05-01") }, acteur, DROITS_ENCADRANT),
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

describe("EX-ACT-01 — le catalogue tel que la vue 34 le lit", () => {
  it("RG-ACT-05 — une tâche désactivée n'est rendue que si on la demande, et garde ses assignations", async () => {
    const active = await activite.creerTache({ nom: `Zactive ${uuid().slice(0, 6)}` }, acteur);
    const eteinte = await activite.creerTache({ nom: `Zeteinte ${uuid().slice(0, 6)}` }, acteur);
    const u = await agent();
    const p = await globalP();
    await activite.assigner(eteinte.id, [u], utc("2026-06-08"), "full_day", acteur, p);
    await prisma.predefinedTask.update({ where: { id: eteinte.id }, data: { actif: false } });

    const parDefaut = await activite.catalogue();
    expect(parDefaut.map((t) => t.id)).toContain(active.id);
    expect(parDefaut.map((t) => t.id)).not.toContain(eteinte.id);

    const complet = await activite.catalogue(true);
    const retrouvee = complet.find((t) => t.id === eteinte.id);
    // Elle reste au catalogue AVEC son passé : la faire disparaître
    // rattacherait ces assignations à un objet introuvable.
    expect(retrouvee?._count.assignations).toBe(1);
  });

  it("les règles de récurrence accompagnent la tâche, actives d'abord", async () => {
    const t = await activite.creerTache({ nom: `Zregles ${uuid().slice(0, 6)}` }, acteur);
    await prisma.predefinedTaskRecurrence.createMany({
      data: [
        {
          predefinedTaskId: t.id, type: "weekly", frequence: 1, jourSemaine: 2,
          dateDebut: utc("2026-09-01"), active: false,
        },
        {
          predefinedTaskId: t.id, type: "monthly_date", frequence: 1, jourMois: 31,
          dateDebut: utc("2026-01-01"), active: true,
        },
      ],
    });

    const tache = (await activite.catalogue()).find((x) => x.id === t.id);
    // La vue 34 rend chaque règle en une phrase : elle a besoin des champs de
    // chaque type, et de l'ordre qui met l'active en tête.
    expect(tache?.recurrences.map((r) => r.active)).toEqual([true, false]);
    expect(tache?.recurrences[0]?.jourMois).toBe(31);
  });

  it("les tâches actives précèdent les inactives, puis l'ordre est alphabétique", async () => {
    const noms = (await activite.catalogue(true)).map((t) => t.actif);
    // Une liste où l'actif et l'inactif s'entremêlent se relit mal.
    expect([...noms].sort((a, b) => Number(b) - Number(a))).toEqual(noms);
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

/**
 * `EX-EVT-08` — ajouter et retirer un participant.
 *
 * **Le contrôle de périmètre manquait sur les deux routes.** L-42 l'avait
 * signalé en corrigeant le même défaut sur `arreterRecurrence` : la garde
 * vérifiait `events:update`, et rien ne vérifiait que l'appelant **voit**
 * l'événement. Or le prédicat de visibilité d'un événement est « je suis
 * participant » : on pouvait donc s'inviter soi-même à une réunion qu'on n'a pas
 * le droit de voir, et l'y voir ensuite. `.claude/rules/api.md` : « un point
 * d'entrée qui vérifie la permission mais pas le périmètre est un défaut de
 * cloisonnement, pas une optimisation ».
 */
describe("EX-EVT-08 — les participants, et leur cloisonnement", () => {
  it("EX-EVT-08 — un participant s'ajoute puis se retire", async () => {
    const u = await agent();
    const { evenement } = await evenements.creer(
      { titre: "Comité", date: utc("2026-06-15"), journeeEntiere: true, participantIds: [] },
      acteur,
    );
    const p = await globalP();

    await evenements.ajouterParticipant(evenement.id, u, acteur, p, PERMISSIONS_GLOBALES);
    expect(await prisma.eventParticipant.count({ where: { eventId: evenement.id } })).toBe(1);

    await evenements.retirerParticipant(evenement.id, u, acteur, p, PERMISSIONS_GLOBALES);
    expect(await prisma.eventParticipant.count({ where: { eventId: evenement.id } })).toBe(0);
  });

  it("EX-EVT-08 — s'INVITER à un événement qu'on ne voit pas est refusé", async () => {
    /*
     * Le cas que l'absence de contrôle rendait possible, et le seul qui compte :
     * l'invitation était le moyen d'obtenir la visibilité qu'on n'avait pas.
     */
    const etranger = await agent();
    const { evenement } = await evenements.creer(
      { titre: "Bureau restreint", date: utc("2026-06-16"), journeeEntiere: true, participantIds: [] },
      acteur,
    );
    const pEtranger = await perimetres.resoudre(etranger, new Set());

    await expect(
      evenements.ajouterParticipant(evenement.id, etranger, etranger, pEtranger, new Set()),
    ).rejects.toMatchObject({ code: "hors_perimetre" });

    expect(await prisma.eventParticipant.count({ where: { eventId: evenement.id } })).toBe(0);
  });

  it("EX-EVT-08 — retirer quelqu'un d'un événement invisible est refusé de même", async () => {
    const membre = await agent();
    const etranger = await agent();
    const { evenement } = await evenements.creer(
      { titre: "Bureau", date: utc("2026-06-17"), journeeEntiere: true, participantIds: [membre] },
      acteur,
    );
    const pEtranger = await perimetres.resoudre(etranger, new Set());

    await expect(
      evenements.retirerParticipant(evenement.id, membre, etranger, pEtranger, new Set()),
    ).rejects.toMatchObject({ code: "hors_perimetre" });

    expect(await prisma.eventParticipant.count({ where: { eventId: evenement.id } })).toBe(1);
  });
});

// ═══════════ L-14 — les exigences de création et de consultation ═══════════

/**
 * Ces suites travaillent toutes sur **2027**, hors des fenêtres employées plus
 * haut. Ce n'est pas une coquetterie : `surPlage` sous périmètre global rend
 * *tous* les événements de l'instance, et les suites de ce fichier en sèment
 * des dizaines sur 2026. Une plage partagée ferait dépendre le verdict de
 * l'ordre d'exécution — le contraire d'un test.
 *
 * Chaque lecture est en outre bornée à un participant fabriqué pour elle : la
 * plage isole le calendrier, le participant isole la suite.
 */

/** Un projet minimal — `Project` exige ses deux dates. */
async function projet2027(nom: string) {
  const id = uuid();
  await prisma.project.create({
    data: { id, nom, dateDebut: utc("2027-01-01"), dateFin: utc("2027-12-31") },
  });
  return id;
}

/** Un service peuplé — `Service` exige son département. */
async function serviceAvec(nom: string, membres: string[]) {
  const departementId = uuid();
  await prisma.departement.create({ data: { id: departementId, nom: `Dép. ${nom}` } });
  const id = uuid();
  await prisma.service.create({ data: { id, nom, departementId } });
  await prisma.userService.createMany({
    data: membres.map((userId) => ({ userId, serviceId: id })),
  });
  return id;
}

describe("EX-EVT-03, EX-EVT-04, EX-EVT-05 — créer un événement", () => {
  it("EX-EVT-03 — les huit champs de l'exigence font l'aller-retour, un par un", async () => {
    /*
     * L'exigence énumère : « titre, description, date, journée entière ou
     * horaires, projet, participants, intervention extérieure ». Le test suit
     * cette liste littéralement. Un `toBeDefined()` sur l'objet créé aurait
     * passé même si le service avait avalé la moitié des champs.
     */
    const projet = await projet2027(`Refonte ${uuid().slice(0, 6)}`);
    const claire = await agent();
    const marc = await agent();

    const { evenement } = await evenements.creer(
      {
        titre: "Atelier de cadrage",
        description: "Ordre du jour : périmètre, jalons, budget.",
        date: utc("2027-05-10"),
        journeeEntiere: false,
        heureDebut: "09:00",
        heureFin: "10:30",
        projectId: projet,
        interventionExterieure: true,
        participantIds: [claire, marc],
      },
      acteur,
    );

    const relu = await prisma.event.findUniqueOrThrow({
      where: { id: evenement.id },
      include: { participants: true },
    });
    expect(relu.titre).toBe("Atelier de cadrage");
    expect(relu.description).toBe("Ordre du jour : périmètre, jalons, budget.");
    expect(relu.date.toISOString().slice(0, 10)).toBe("2027-05-10");
    expect(relu.journeeEntiere).toBe(false);
    expect(relu.heureDebut).toBe("09:00");
    expect(relu.heureFin).toBe("10:30");
    expect(relu.projectId).toBe(projet);
    expect(relu.interventionExterieure).toBe(true);
    expect(relu.participants.map((p) => p.userId).sort()).toEqual([claire, marc].sort());
  });

  it("EX-EVT-03 — « journée entière » et « horaires » sont deux BRANCHES, pas deux champs cumulés", async () => {
    /*
     * L'exigence dit « journée entière **ou** horaires ». Les deux événements
     * sont créés côte à côte et comparés : ce qui prouve l'alternative, c'est
     * l'écart entre les deux, pas l'un des deux seul.
     */
    const { evenement: horaire } = await evenements.creer(
      { titre: "Point produit", date: utc("2027-05-11"), heureDebut: "14:00", heureFin: "15:00" },
      acteur,
    );
    const { evenement: journee } = await evenements.creer(
      { titre: "Séminaire", date: utc("2027-05-11"), journeeEntiere: true },
      acteur,
    );

    expect([horaire.journeeEntiere, horaire.heureDebut, horaire.heureFin]).toEqual([
      false,
      "14:00",
      "15:00",
    ]);
    expect([journee.journeeEntiere, journee.heureDebut, journee.heureFin]).toEqual([
      true,
      null,
      null,
    ]);
  });

  it("EX-EVT-04 — inviter un service invite TOUS ses membres, et personne d'autre", async () => {
    const claire = await agent();
    const marc = await agent();
    const ines = await agent();
    const zoe = await agent();
    const etudes = await serviceAvec(`Études ${uuid().slice(0, 6)}`, [claire, marc, ines]);
    await serviceAvec(`Exploitation ${uuid().slice(0, 6)}`, [zoe]);

    const { evenement } = await evenements.creer(
      {
        titre: "Réunion de service",
        date: utc("2027-05-12"),
        journeeEntiere: true,
        serviceIds: [etudes],
      },
      acteur,
    );

    const invites = await prisma.eventParticipant.findMany({ where: { eventId: evenement.id } });
    expect(invites.map((p) => p.userId).sort()).toEqual([claire, marc, ines].sort());
    // La moitié qui compte : inviter un service n'invite pas l'organisation.
    expect(invites.map((p) => p.userId)).not.toContain(zoe);
  });

  it("EX-EVT-04 — un agent nommé EN PLUS de son service n'est invité qu'une fois", async () => {
    /*
     * `EventParticipant` a une clé primaire composite : un doublon ferait
     * échouer la création entière. Inviter un service dont on a aussi nommé un
     * membre est pourtant le geste le plus ordinaire de la vue 18.
     */
    const claire = await agent();
    const marc = await agent();
    const etudes = await serviceAvec(`Études bis ${uuid().slice(0, 6)}`, [claire, marc]);

    const { evenement } = await evenements.creer(
      {
        titre: "Revue de service",
        date: utc("2027-05-13"),
        journeeEntiere: true,
        serviceIds: [etudes],
        participantIds: [claire],
      },
      acteur,
    );

    expect(await prisma.eventParticipant.count({ where: { eventId: evenement.id } })).toBe(2);
  });

  it("EX-EVT-05 — « toutes les 2 semaines, le lundi, jusqu'au 26 avril » engendre QUATRE occurrences, aux dates dites", async () => {
    /*
     * Le 1ᵉʳ mars 2027 est un lundi. Une fréquence de deux semaines pose donc
     * les 15 et 29 mars, les 12 et 26 avril — et rien au-delà de la date de
     * fin. Compter les occurrences sans les nommer laisserait passer un pas de
     * calcul faux qui rendrait le bon compte.
     */
    const participant = await agent();
    const { evenement, occurrences } = await evenements.creer(
      {
        titre: "Comité de pilotage",
        date: utc("2027-03-01"),
        journeeEntiere: true,
        participantIds: [participant],
        recurrence: { frequenceSemaines: 2, jourSemaine: 1, jusqua: utc("2027-04-26") },
      },
      acteur,
    );

    expect(occurrences).toBe(4);
    const filles = await prisma.event.findMany({
      where: { parentId: evenement.id },
      orderBy: { date: "asc" },
      include: { participants: true },
    });
    expect(filles.map((e) => e.date.toISOString().slice(0, 10))).toEqual([
      "2027-03-15",
      "2027-03-29",
      "2027-04-12",
      "2027-04-26",
    ]);

    // Le parent porte les paramètres de la série ; les occurrences n'en portent
    // aucun — sinon chacune serait une série à son tour.
    expect(evenement.recurrenceFrequence).toBe(2);
    expect(evenement.recurrenceJourSemaine).toBe(1);
    expect(evenement.recurrenceFin?.toISOString().slice(0, 10)).toBe("2027-04-26");
    expect(filles.every((e) => e.recurrenceFrequence === null)).toBe(true);

    // Une occurrence hérite du contenu ET des invités : une série est une
    // réunion répétée, pas quatre réunions homonymes.
    expect(filles.every((e) => e.titre === "Comité de pilotage")).toBe(true);
    expect(filles.every((e) => e.participants.length === 1)).toBe(true);
  });

  it("EX-EVT-05 — sans clause de récurrence, l'événement reste SEUL", async () => {
    const { evenement, occurrences } = await evenements.creer(
      { titre: "Point isolé", date: utc("2027-03-02"), journeeEntiere: true },
      acteur,
    );
    expect(occurrences).toBe(0);
    expect(evenement.recurrenceFrequence).toBeNull();
    expect(evenement.recurrenceFin).toBeNull();
    expect(await prisma.event.count({ where: { parentId: evenement.id } })).toBe(0);
  });
});

describe("EX-EVT-01, EX-EVT-02, EX-EVT-09 — consulter, filtrer, cibler", () => {
  it("EX-EVT-01 — une seule requête sert LA LISTE ET LE CALENDRIER : ordre chronologique, horaires et invités compris", async () => {
    /*
     * La liste et le calendrier ne sont pas deux lectures : c'est la même,
     * rendue deux fois. Ce qui doit donc tenir en une réponse, c'est l'ordre
     * (le calendrier place, la liste énumère), les horaires (le calendrier
     * positionne dans la journée), le projet et les invités (la liste les
     * affiche en colonne). Les événements sont créés dans le désordre exprès.
     */
    const lecteur = await agent();
    const nomProjet = `Portail ${uuid().slice(0, 6)}`;
    const projet = await projet2027(nomProjet);

    await evenements.creer(
      { titre: "Comité", date: utc("2027-06-03"), journeeEntiere: true, participantIds: [lecteur] },
      acteur,
    );
    await evenements.creer(
      {
        titre: "Point produit",
        date: utc("2027-06-01"),
        heureDebut: "14:00",
        heureFin: "15:00",
        projectId: projet,
        participantIds: [lecteur],
      },
      acteur,
    );
    await evenements.creer(
      {
        titre: "Revue",
        date: utc("2027-06-01"),
        heureDebut: "09:00",
        heureFin: "10:00",
        participantIds: [lecteur],
      },
      acteur,
    );

    const vus = await evenements.surPlage(
      await globalP(),
      PERMISSIONS_GLOBALES,
      utc("2027-06-01"),
      utc("2027-06-03"),
      { userId: lecteur },
    );

    expect(vus.map((e) => e.titre)).toEqual(["Revue", "Point produit", "Comité"]);
    // Ce dont le calendrier a besoin pour placer une case dans une journée.
    expect(vus[0]?.heureDebut).toBe("09:00");
    expect(vus[2]?.journeeEntiere).toBe(true);
    // Ce dont la liste a besoin pour remplir ses colonnes, sans seconde requête.
    expect(vus[1]?.project?.nom).toBe(nomProjet);
    expect(vus[0]?.participants.map((p) => p.user.id)).toEqual([lecteur]);
    expect(vus[0]?.participants[0]?.user.prenom).toBe("A");
  });

  it("EX-EVT-02 — le filtre par projet ne rend QUE ce projet, pas les événements sans projet", async () => {
    const lecteur = await agent();
    const portail = await projet2027(`Portail ${uuid().slice(0, 6)}`);
    const finances = await projet2027(`Finances ${uuid().slice(0, 6)}`);

    for (const [titre, projectId] of [
      ["Atelier portail", portail],
      ["Atelier finances", finances],
      ["Réunion de service", null],
    ] as [string, string | null][]) {
      await evenements.creer(
        {
          titre,
          date: utc("2027-07-05"),
          journeeEntiere: true,
          projectId,
          participantIds: [lecteur],
        },
        acteur,
      );
    }

    const filtres = await evenements.surPlage(
      await globalP(),
      PERMISSIONS_GLOBALES,
      utc("2027-07-01"),
      utc("2027-07-31"),
      { projectId: portail, userId: lecteur },
    );
    expect(filtres.map((e) => e.titre)).toEqual(["Atelier portail"]);

    // Le témoin : sans le filtre, les trois sont là. Sans lui, l'assertion
    // ci-dessus passerait tout aussi bien sur une plage vide.
    const tous = await evenements.surPlage(
      await globalP(),
      PERMISSIONS_GLOBALES,
      utc("2027-07-01"),
      utc("2027-07-31"),
      { userId: lecteur },
    );
    expect(tous).toHaveLength(3);
  });

  it("EX-EVT-09 — les événements D'UN AGENT sont les siens, et rien de ce qui se tient sans lui", async () => {
    const claire = await agent();
    const marc = await agent();

    await evenements.creer(
      {
        titre: "Entretien de Claire",
        date: utc("2027-08-10"),
        journeeEntiere: true,
        participantIds: [claire],
      },
      acteur,
    );
    await evenements.creer(
      {
        titre: "Entretien de Marc",
        date: utc("2027-08-10"),
        journeeEntiere: true,
        participantIds: [marc],
      },
      acteur,
    );
    await evenements.creer(
      {
        titre: "Réunion commune",
        date: utc("2027-08-11"),
        journeeEntiere: true,
        participantIds: [claire, marc],
      },
      acteur,
    );

    const deClaire = await evenements.surPlage(
      await globalP(),
      PERMISSIONS_GLOBALES,
      utc("2027-08-10"),
      utc("2027-08-11"),
      { userId: claire },
    );
    expect(deClaire.map((e) => e.titre)).toEqual(["Entretien de Claire", "Réunion commune"]);
    expect(deClaire.map((e) => e.titre)).not.toContain("Entretien de Marc");
  });

  it("EX-EVT-09 — la plage est INCLUSIVE à ses deux bornes, et exclut ce qui les déborde", async () => {
    /*
     * Une borne exclusive à droite ferait manquer le dernier jour du mois
     * affiché — un défaut qui ne se voit qu'au 31, donc pas tous les mois.
     */
    const lecteur = await agent();
    for (const date of ["2027-09-30", "2027-10-01", "2027-10-31", "2027-11-01"]) {
      await evenements.creer(
        { titre: `Jalon ${date}`, date: utc(date), journeeEntiere: true, participantIds: [lecteur] },
        acteur,
      );
    }

    const octobre = await evenements.surPlage(
      await globalP(),
      PERMISSIONS_GLOBALES,
      utc("2027-10-01"),
      utc("2027-10-31"),
      { userId: lecteur },
    );
    expect(octobre.map((e) => e.date.toISOString().slice(0, 10))).toEqual([
      "2027-10-01",
      "2027-10-31",
    ]);
  });
});

describe("EX-EVT-07 — arrêter une récurrence", () => {
  it("EX-EVT-07 — l'arrêt supprime les occurrences futures, garde les passées, et la série DÉCLARE sa nouvelle fin", async () => {
    /*
     * Le second effet est celui qu'on oublie : sans repositionner
     * `recurrenceFin`, la série continue d'annoncer une fin d'août alors
     * qu'elle s'arrête à la mi-juillet, et toute regénération future recréerait
     * ce qu'on vient de supprimer.
     *
     * Le 7 juin 2027 est un lundi ; la série hebdomadaire va jusqu'au 30 août,
     * soit douze occurrences après le parent — 84 jours, donc douze pas de
     * sept, la dernière tombant exactement sur la date de fin.
     */
    const { evenement, occurrences } = await evenements.creer(
      {
        titre: "Point hebdo 2027",
        date: utc("2027-06-07"),
        journeeEntiere: true,
        recurrence: { frequenceSemaines: 1, jourSemaine: 1, jusqua: utc("2027-08-30") },
      },
      acteur,
    );
    expect(occurrences).toBe(12);

    const arret = await evenements.arreterRecurrence(
      evenement.id,
      utc("2027-07-19"),
      acteur,
      await globalP(),
      PERMISSIONS_GLOBALES,
    );
    expect(arret.supprimees).toBe(7);

    const restantes = await prisma.event.findMany({
      where: { parentId: evenement.id },
      orderBy: { date: "asc" },
    });
    expect(restantes.map((e) => e.date.toISOString().slice(0, 10))).toEqual([
      "2027-06-14",
      "2027-06-21",
      "2027-06-28",
      "2027-07-05",
      "2027-07-12",
    ]);

    const parent = await prisma.event.findUniqueOrThrow({ where: { id: evenement.id } });
    expect(parent.recurrenceFin?.toISOString().slice(0, 10)).toBe("2027-07-19");
  });

  it("EX-EVT-07 — arrêter deux fois à la même date ne supprime rien de plus", async () => {
    const { evenement } = await evenements.creer(
      {
        titre: "Point hebdo bis",
        date: utc("2027-06-07"),
        journeeEntiere: true,
        recurrence: { frequenceSemaines: 1, jourSemaine: 1, jusqua: utc("2027-07-26") },
      },
      acteur,
    );
    const premier = await evenements.arreterRecurrence(
      evenement.id,
      utc("2027-07-05"),
      acteur,
      await globalP(),
      PERMISSIONS_GLOBALES,
    );
    expect(premier.supprimees).toBe(4);

    const second = await evenements.arreterRecurrence(
      evenement.id,
      utc("2027-07-05"),
      acteur,
      await globalP(),
      PERMISSIONS_GLOBALES,
    );
    expect(second.supprimees).toBe(0);
    expect(await prisma.event.count({ where: { parentId: evenement.id } })).toBe(3);
  });
});

// ═════════════ L-17 — l'assignation en masse et la génération ══════════════

describe("EX-ACT-03 — assigner en masse", () => {
  it("EX-ACT-03 — un seul appel assigne TROIS agents à la même date et à la même période", async () => {
    const tache = await activite.creerTache({ nom: `Accueil ${uuid().slice(0, 6)}` }, acteur);
    const trio = [await agent(), await agent(), await agent()];

    const r = await activite.assigner(
      tache.id,
      trio,
      utc("2027-10-04"),
      "full_day",
      acteur,
      await globalP(),
    );
    expect(r.crees).toBe(3);

    const posees = await prisma.predefinedTaskAssignment.findMany({
      where: { predefinedTaskId: tache.id },
    });
    expect(posees.map((a) => a.userId).sort()).toEqual([...trio].sort());
    expect(posees.every((a) => a.periode === "full_day")).toBe(true);
    expect(posees.every((a) => a.date.toISOString().slice(0, 10) === "2027-10-04")).toBe(true);
  });

  it("EX-ACT-03 — UN SEUL agent incompatible annule le lot ENTIER : aucun des trois n'est posé", async () => {
    /*
     * C'est la question propre à l'assignation en masse, et elle n'a pas de
     * réponse évidente : poser les compatibles et signaler les autres, ou tout
     * refuser ? Le produit refuse tout — un lot à moitié posé laisserait
     * l'encadrant croire sa permanence couverte alors qu'il lui manque
     * quelqu'un. Le contrôle vérifie donc les deux moitiés : le refus NOMME
     * l'incompatible (`RG-ACT-03`), et la base est intacte.
     */
    const tache = await activite.creerTache(
      { nom: `Astreinte ${uuid().slice(0, 6)}`, teletravailAutorise: false },
      acteur,
    );
    const claire = await agent();
    const marc = await agent();
    const ines = await agent();
    await prisma.telework.create({
      data: { userId: marc, date: utc("2027-10-05"), etat: "telework" },
    });

    const erreur = await activite
      .assigner(
        tache.id,
        [claire, marc, ines],
        utc("2027-10-05"),
        "full_day",
        acteur,
        await globalP(),
      )
      .catch((e: ErreurActivite) => e);

    expect((erreur as ErreurActivite).code).toBe("agent_indisponible");
    const nommes = (erreur as ErreurActivite).detail?.agents as { motif: string }[];
    expect(nommes).toHaveLength(1);
    expect(nommes[0]?.motif).toBe("en_teletravail");

    expect(
      await prisma.predefinedTaskAssignment.count({ where: { predefinedTaskId: tache.id } }),
    ).toBe(0);
  });
});

describe("EX-ACT-05 — générer les assignations sur une plage donnée", () => {
  it("EX-ACT-05 — la génération ne pose QUE dans la plage demandée, pas partout où la règle s'applique", async () => {
    /*
     * La règle court depuis le 1ᵉʳ septembre et n'a pas de fin ; c'est la plage
     * demandée qui borne la génération, et elle seule. Le 1ᵉʳ septembre 2027 est
     * un mercredi : il tombe sous la règle et **hors** de la plage. Une
     * génération qui l'aurait posé aurait rendu le même compte si l'on s'était
     * contenté de compter les lignes.
     */
    const tache = await activite.creerTache({ nom: `Permanence ${uuid().slice(0, 6)}` }, acteur);
    const u = await agent();
    await prisma.predefinedTaskRecurrence.create({
      data: {
        predefinedTaskId: tache.id,
        type: "weekly",
        frequence: 1,
        jourSemaine: 3,
        dateDebut: utc("2027-09-01"),
        active: true,
      },
    });

    const r = await activite.genererDepuisRecurrences(
      tache.id,
      utc("2027-09-06"),
      utc("2027-09-30"),
      [u],
      acteur,
    );
    expect(r).toMatchObject({ crees: 4, ignores: 0, dates: 4 });

    const posees = await prisma.predefinedTaskAssignment.findMany({
      where: { predefinedTaskId: tache.id },
      orderBy: { date: "asc" },
    });
    expect(posees.map((a) => a.date.toISOString().slice(0, 10))).toEqual([
      "2027-09-08",
      "2027-09-15",
      "2027-09-22",
      "2027-09-29",
    ]);
  });

  it("EX-ACT-05 — élargir la plage complète le passé sans redoubler ce qui existe", async () => {
    const tache = await activite.creerTache(
      { nom: `Permanence bis ${uuid().slice(0, 6)}` },
      acteur,
    );
    const u = await agent();
    await prisma.predefinedTaskRecurrence.create({
      data: {
        predefinedTaskId: tache.id,
        type: "weekly",
        frequence: 1,
        jourSemaine: 3,
        dateDebut: utc("2027-09-01"),
        active: true,
      },
    });

    await activite.genererDepuisRecurrences(
      tache.id,
      utc("2027-09-06"),
      utc("2027-09-30"),
      [u],
      acteur,
    );
    const elargie = await activite.genererDepuisRecurrences(
      tache.id,
      utc("2027-09-01"),
      utc("2027-10-06"),
      [u],
      acteur,
    );

    // Les deux mercredis neufs — le 1ᵉʳ septembre et le 6 octobre —, et les
    // quatre déjà posés comptés comme ignorés, jamais comme créés.
    expect(elargie).toMatchObject({ crees: 2, ignores: 4, dates: 6 });
    expect(
      await prisma.predefinedTaskAssignment.count({ where: { predefinedTaskId: tache.id } }),
    ).toBe(6);
  });
});
