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
    await teletravail.creerRegle({ userId: u, jourSemaine: 1, dateDebut: utc("2026-03-01") }, acteur);

    const premier = await teletravail.generer(u, utc("2026-03-01"), utc("2026-03-31"), acteur, DROITS_ENCADRANT);
    expect(premier.crees).toBe(5);
    expect(premier.ignores).toBe(0);

    const second = await teletravail.generer(u, utc("2026-03-01"), utc("2026-03-31"), acteur, DROITS_ENCADRANT);
    expect(second.crees).toBe(0);
    expect(second.ignores).toBe(5);
  });

  it("UNE EXCEPTION POSÉE À LA MAIN SURVIT À LA RÉGÉNÉRATION", async () => {
    const u = await agent();
    await teletravail.creerRegle({ userId: u, jourSemaine: 2, dateDebut: utc("2026-04-01") }, acteur);
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
