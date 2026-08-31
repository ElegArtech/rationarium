import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { creerClient, type PrismaClient } from "@rationarium/db";
import { TempsService } from "./temps.service.js";
import { AuditService } from "../commun/audit.service.js";
import { PerimetreService } from "../commun/perimetre.service.js";

/**
 * `RG-TMP-04` — « Déclarer pour un tiers exige une permission dédiée. »
 *
 * **Trois branches se contredisaient.** La règle est au cadrage. La permission
 * `time_tracking:declare_for_third_party` est au catalogue. Et : aucun modèle de
 * rôle ne la détenait, aucun code ne l'exigeait. Pire, `temps.service.ts`
 * **calculait** `pourAutrui` pour le journal d'audit sans jamais rien refuser —
 * la trace disait exactement ce que le contrôle aurait dû empêcher.
 *
 * Trouvé par le balayage des 191 routes du lot L-38, laissé ouvert parce que
 * l'appliquer sans revoir les modèles de rôles aurait rendu la déclaration pour
 * autrui impossible à tout le monde.
 *
 * `RG-TMP-03` écrit « l'acteur d'une saisie (agent **ou** tiers) » : les deux
 * sont des sortes d'acteur. « Déclarer pour un tiers » couvre donc aussi bien un
 * collègue qu'un intervenant extérieur — précision portée dans `cadrage/01`.
 */

const RACINE_DB = path.resolve(import.meta.dirname, "../../../../packages/db");
const utc = (s: string) => new Date(`${s}T00:00:00.000Z`);
const uuid = () => crypto.randomUUID();

let pg: StartedPostgreSqlContainer;
let prisma: PrismaClient;
let temps: TempsService;
let perimetres: PerimetreService;
let projet: string;

/** Un agent ordinaire : il déclare son temps, pas celui d'autrui. */
const AGENT: ReadonlySet<string> = new Set(["time_tracking:read", "time_tracking:create"]);

/** L'encadrement, qui porte désormais la permission dédiée. */
const ENCADRANT: ReadonlySet<string> = new Set([
  ...AGENT,
  "time_tracking:read_team",
  "time_tracking:declare_for_third_party",
]);

async function agent() {
  const id = uuid();
  await prisma.user.create({
    data: {
      id,
      login: `u-${id.slice(0, 8)}`,
      email: `${id.slice(0, 8)}@x.fr`,
      motDePasseHash: "x",
      prenom: "A",
      nom: "T",
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
  temps = new TempsService(prisma as never, audit, perimetres);

  const p = await prisma.project.create({
    data: { nom: "Refonte", dateDebut: utc("2026-01-01"), dateFin: utc("2026-12-31") },
  });
  projet = p.id;
}, 180_000);

afterAll(async () => {
  await prisma?.$disconnect();
  await pg?.stop();
});

const saisie = (userId: string) => ({
  userId,
  date: utc("2026-09-10"),
  heures: 2,
  projectId: projet,
});

describe("RG-TMP-04 — déclarer pour quelqu'un d'autre", () => {
  it("RG-TMP-04 — REFUSE de déclarer du temps sur le compte d'un collègue", async () => {
    const moi = await agent();
    const autre = await agent();

    await expect(temps.saisir(saisie(autre), moi, AGENT)).rejects.toMatchObject({
      code: "autrui_sans_permission",
      detail: { permission: "time_tracking:declare_for_third_party" },
    });

    // Rien n'a été écrit : le refus est total.
    expect(await prisma.timeEntry.count({ where: { userId: autre } })).toBe(0);
  });

  it("RG-TMP-04 — laisse chacun déclarer le SIEN, c'est le cas nominal", async () => {
    const moi = await agent();
    await expect(temps.saisir(saisie(moi), moi, AGENT)).resolves.toBeDefined();
  });

  it("RG-TMP-04 — un encadrant déclare pour son équipe", async () => {
    const chef = await agent();
    const membre = await agent();
    await expect(temps.saisir(saisie(membre), chef, ENCADRANT)).resolves.toBeDefined();
  });

  it("RG-TMP-04 — REFUSE aussi de déclarer pour un intervenant EXTÉRIEUR", async () => {
    /*
     * Le cas que la permission nomme littéralement. Il était aussi ouvert que
     * l'autre : `thirdPartyId` passait sans le moindre contrôle.
     */
    const moi = await agent();
    const tiers = await prisma.thirdParty.create({
      data: { type: "individual", contactNom: "Durand" },
    });

    await expect(
      temps.saisir(
        { thirdPartyId: tiers.id, date: utc("2026-09-11"), heures: 3, projectId: projet },
        moi,
        AGENT,
      ),
    ).rejects.toMatchObject({ code: "autrui_sans_permission", detail: { champ: "thirdPartyId" } });
  });

  it("le journal d'audit TRAÇAIT `pourAutrui` sans que rien ne le refuse", async () => {
    /*
     * Le test qui nomme la nature du défaut. La trace existait, le contrôle non
     * — un journal qui décrit une situation que rien n'empêche donne
     * l'impression que la règle est tenue.
     */
    const chef = await agent();
    const membre = await agent();
    await temps.saisir(saisie(membre), chef, ENCADRANT);

    const trace = await prisma.auditLog.findFirst({
      where: { action: "time_entry.create", acteurId: chef },
      orderBy: { horodatage: "desc" },
    });
    expect((trace?.detail as { pourAutrui?: boolean } | null)?.pourAutrui).toBe(true);
  });
});

// ══════════════ Trois défauts voisins, trouvés au balayage de la vague ══════

describe("RG-TMP-07 — le non-déclaré se compte par personne, pas par tâche", () => {
  /*
   * Le filtre s'écrivait `saisiesTemps: { none: {} }` — aucune saisie de qui
   * que ce soit. Sur une tâche partagée, la déclaration d'un AUTRE contributeur
   * suffisait donc à faire disparaître la tâche de ma liste alors que je
   * n'avais rien déclaré. `GET /tableau` appelle la même méthode et héritait du
   * même oubli.
   */
  it("RG-TMP-07 — une tâche partagée reste dans MA liste quand un AUTRE a déclaré", async () => {
    const moi = await agent();
    const collegue = await agent();
    const tache = await prisma.task.create({
      data: {
        titre: "Partagée et terminée",
        projectId: projet,
        statut: "done",
        assignes: { create: [{ userId: moi }, { userId: collegue }] },
      },
    });

    // Le collègue déclare. Moi, rien.
    await temps.saisir(
      { userId: collegue, taskId: tache.id, date: utc("2026-04-06"), heures: 2 },
      collegue,
      AGENT,
    );

    const mienne = await temps.tachesNonDeclarees(moi);
    expect(mienne.map((x) => x.id)).toContain(tache.id);
  });

  it("RG-TMP-07 — et elle SORT de la liste de celui qui a déclaré, lui", async () => {
    /*
     * Le versant nominal, sans lequel le test précédent passerait sur un filtre
     * simplement supprimé : la borne doit encore écarter mes propres saisies.
     */
    const moi = await agent();
    const collegue = await agent();
    const tache = await prisma.task.create({
      data: {
        titre: "Partagée, déclarée par le collègue",
        projectId: projet,
        statut: "done",
        assignes: { create: [{ userId: moi }, { userId: collegue }] },
      },
    });
    await temps.saisir(
      { userId: collegue, taskId: tache.id, date: utc("2026-04-07"), heures: 2 },
      collegue,
      AGENT,
    );

    const sienne = await temps.tachesNonDeclarees(collegue);
    expect(sienne.map((x) => x.id)).not.toContain(tache.id);
  });
});

describe("EX-TMP-07 — le rapport par type d'activité nomme ce qu'il rend", () => {
  it("EX-TMP-07 — l'axe « type » rend un `codeActivite`, non un champ `libelle` qui porte un code", async () => {
    const moi = await agent();
    await temps.saisir(
      {
        userId: moi, projectId: projet, date: utc("2026-04-13"),
        heures: 2, typeActivite: "meeting",
      },
      moi,
      AGENT,
    );
    const p = await perimetres.resoudre(moi, new Set(["users:manage_any"]));

    const lignes = await temps.rapport(p, "type", {
      debut: utc("2026-04-13"),
      fin: utc("2026-04-13"),
    });
    const ligne = lignes.find((l) => l.cle === "meeting");
    expect(ligne).toBeDefined();
    expect(ligne).toMatchObject({ codeActivite: "meeting" });
    // Le nom qui mentait n'est plus rendu du tout : le contrat ne promet plus
    // un libellé là où il n'y a qu'un code à traduire (`RG-GEN-08`).
    expect(ligne).not.toHaveProperty("libelle");
  });

  it("EX-TMP-07 — l'axe « projet », lui, rend bien un LIBELLÉ, et il n'a pas changé", async () => {
    const moi = await agent();
    await temps.saisir(
      { userId: moi, projectId: projet, date: utc("2026-04-14"), heures: 1 },
      moi,
      AGENT,
    );
    const p = await perimetres.resoudre(moi, new Set(["users:manage_any"]));

    const lignes = await temps.rapport(p, "projet", {
      debut: utc("2026-04-14"),
      fin: utc("2026-04-14"),
    });
    expect(lignes.some((l) => "libelle" in l && l.libelle === "Refonte")).toBe(true);
  });
});

describe("EX-TMP-01 — `heures` a UNE forme dans tout le module", () => {
  it("EX-TMP-01 — `GET /temps` rend `heures` en NOMBRE, comme `GET /temps/rapport`", async () => {
    /*
     * `Decimal` de Prisma se sérialise en chaîne. `lister()` rendait donc
     * `"2.5"` là où `rapport()` rend `2.5` : deux formes pour le même champ
     * dans le même module, et un client obligé de convertir dans un cas et pas
     * dans l'autre sans que rien ne dise lequel.
     */
    const moi = await agent();
    await temps.saisir(
      { userId: moi, projectId: projet, date: utc("2026-04-20"), heures: 2.5 },
      moi,
      AGENT,
    );
    const p = await perimetres.resoudre(moi, new Set());

    const { saisies } = await temps.lister(p, AGENT);
    const posee = saisies.find((s) => s.date.toISOString().startsWith("2026-04-20"));
    expect(posee).toBeDefined();
    expect(typeof posee!.heures).toBe("number");
    expect(posee!.heures).toBe(2.5);

    const lignes = await temps.rapport(
      await perimetres.resoudre(moi, new Set(["users:manage_any"])),
      "projet",
      { debut: utc("2026-04-20"), fin: utc("2026-04-20") },
    );
    // La même valeur, la même forme, des deux côtés.
    expect(typeof lignes[0]!.heures).toBe("number");
  });
});
