import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { creerClient, type PrismaClient } from "@rationarium/db";
import { TeletravailService } from "./teletravail.service.js";
import { AuditService } from "../commun/audit.service.js";
import { PerimetreService, type Perimetre } from "../commun/perimetre.service.js";

/**
 * `RG-TLT-07` — « Agir sur le télétravail d'autrui exige une permission dédiée,
 * distincte selon l'action. »
 *
 * **La règle était énoncée au cadrage et tenue nulle part.** `basculer`,
 * `generer` et `statistiques` recevaient `userId` et `acteurId` et ne les
 * comparaient jamais ; les trois routes qui les servent font retomber `userId`
 * sur l'acteur *par défaut*, ce qui donne l'apparence d'un contrôle là où il n'y
 * en avait aucun. Tout porteur de `telework:create` — c'est-à-dire tout agent —
 * pouvait poser du télétravail sur le calendrier de n'importe qui.
 *
 * Le balayage de L-38 l'a trouvée sur `basculer` ; le contrôle de L-40 a montré
 * que **trois routes** passaient par cette absence, pas une.
 *
 * Ce fichier est neuf : `teletravail/` était le seul module métier substantiel
 * sans test à son nom, ses règles vivant dans `evenements/vague3.int.test.ts`
 * qui en mélange trois.
 */

const RACINE_DB = path.resolve(import.meta.dirname, "../../../../packages/db");
const utc = (s: string) => new Date(`${s}T00:00:00.000Z`);
const uuid = () => crypto.randomUUID();

let pg: StartedPostgreSqlContainer;
let prisma: PrismaClient;
let teletravail: TeletravailService;

/** Les droits d'un agent ordinaire : il saisit son télétravail, pas celui d'autrui. */
const AGENT: ReadonlySet<string> = new Set([
  "telework:read",
  "telework:create",
  "telework:update",
  "telework:generate",
]);

/** Les droits d'un encadrant : le bloc `ENCADREMENT` du catalogue de rôles. */
const ENCADRANT: ReadonlySet<string> = new Set([
  ...AGENT,
  "telework:read_team",
  "telework:manage_any",
  "telework:manage_rules",
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
  const perimetres = new PerimetreService(prisma as never);
  teletravail = new TeletravailService(prisma as never, audit, perimetres);
}, 180_000);

afterAll(async () => {
  await prisma?.$disconnect();
  await pg?.stop();
});

describe("RG-TLT-07 — agir sur le télétravail d'autrui", () => {
  it("RG-TLT-07 — REFUSE de poser du télétravail sur le calendrier d'un autre", async () => {
    const moi = await agent();
    const autre = await agent();

    await expect(
      teletravail.basculer(autre, utc("2026-09-07"), "telework", moi, AGENT),
    ).rejects.toMatchObject({
      code: "autrui_sans_permission",
      detail: { permission: "telework:manage_any" },
    });

    // Et rien n'a été écrit : un refus qui laisse une trace serait pire.
    const pose = await prisma.telework.count({ where: { userId: autre } });
    expect(pose).toBe(0);
  });

  it("RG-TLT-07 — laisse chacun poser le SIEN, c'est le cas nominal", async () => {
    const moi = await agent();
    await expect(
      teletravail.basculer(moi, utc("2026-09-08"), "telework", moi, AGENT),
    ).resolves.toBeDefined();
  });

  it("RG-TLT-07 — un encadrant, lui, pose celui de son équipe", async () => {
    const chef = await agent();
    const membre = await agent();
    await expect(
      teletravail.basculer(membre, utc("2026-09-09"), "telework", chef, ENCADRANT),
    ).resolves.toBeDefined();
  });

  it("RG-TLT-07 — REFUSE de GÉNÉRER pour un autre sans telework:manage_any", async () => {
    /*
     * `generer` est l'action la plus lourde : elle pose des dizaines de jours
     * d'un coup. C'est celle où l'absence de contrôle coûtait le plus.
     */
    const moi = await agent();
    const autre = await agent();
    await expect(
      teletravail.generer(autre, utc("2026-09-01"), utc("2026-09-30"), moi, AGENT),
    ).rejects.toMatchObject({ code: "autrui_sans_permission" });
  });

  it("RG-TLT-07 — LIRE les statistiques d'un autre demande read_team, pas manage_any", async () => {
    /*
     * « Distincte selon l'action » : consulter et écrire ne sont pas le même
     * geste et ne se gouvernent pas de la même permission. Un encadrant qui
     * consulte n'a pas besoin du droit d'écrire.
     */
    const moi = await agent();
    const autre = await agent();

    await expect(teletravail.statistiques(autre, 2026, moi, AGENT)).rejects.toMatchObject({
      code: "autrui_sans_permission",
      detail: { permission: "telework:read_team" },
    });

    const lecteur: ReadonlySet<string> = new Set(["telework:read", "telework:read_team"]);
    await expect(teletravail.statistiques(autre, 2026, moi, lecteur)).resolves.toBeDefined();
  });

  it("RG-TLT-07 — consulter SES propres statistiques ne demande rien de plus", async () => {
    const moi = await agent();
    await expect(teletravail.statistiques(moi, 2026, moi, AGENT)).resolves.toMatchObject({
      annee: 2026,
    });
  });

  it("le champ `annee` porte bien l'ANNÉE, pas un décompte", async () => {
    /*
     * Trouvé en écrivant les tests ci-dessus : `statistiques` rendait
     * `annee: jours.length`. Le champ nommé « année » portait un nombre de
     * jours. Personne ne l'avait vu parce que personne n'appelait la route —
     * aucun écran ne la consommait, donc aucune assertion ne portait sur sa
     * forme. C'est le défaut que « une capacité sans client » cache par nature.
     */
    const moi = await agent();
    await prisma.telework.create({
      data: { userId: moi, date: utc("2026-03-10"), etat: "telework" },
    });
    const s = await teletravail.statistiques(moi, 2026, moi, AGENT);
    expect(s.annee).toBe(2026);
    expect(s.total).toBe(1);
    expect(s.parMois[2]).toBe(1);
  });
});

/**
 * Les exigences de consultation et de génération — `EX-TLT-01` à `EX-TLT-07`.
 *
 * Toutes travaillent sur **2027**, hors des fenêtres de la suite `RG-TLT-07`
 * ci-dessus, et chacune sur un agent qu'elle fabrique : le télétravail est une
 * donnée par agent et par date, donc deux tests qui partagent l'un ou l'autre
 * se contaminent sans qu'aucune assertion ne le dise.
 *
 * Repères calendaires employés, tous vérifiables : le 1ᵉʳ mars 2027 est un
 * lundi, le 1ᵉʳ avril un jeudi, le 1ᵉʳ mai un samedi.
 */

/** Un périmètre étroit, construit à la main — `RG-SCOPE-01`. */
const perimetreDe = (moi: string, visibles: string[]): Perimetre => ({
  userId: moi,
  global: false,
  departements: new Set(),
  utilisateurs: new Set([moi, ...visibles]),
  confidentiel: false,
});

describe("EX-TLT-01, EX-TLT-02, EX-TLT-03 — le planning mensuel, le clic et le cumul", () => {
  it("EX-TLT-01 — le planning rend LE MOIS ENTIER jour à jour, les jours sans déclaration compris", async () => {
    /*
     * C'est un calendrier, pas une liste de déclarations : un mois de mars qui
     * ne rendrait que les jours déclarés laisserait la vue 20 fabriquer
     * elle-même les cases manquantes, donc inventer le calendrier. Mars 2027
     * commence un lundi et compte 31 jours.
     */
    const moi = await agent();
    await teletravail.basculer(moi, utc("2027-03-03"), "telework", moi, AGENT);

    const { calendrier } = await teletravail.planning(moi, utc("2027-03-01"), utc("2027-03-31"));

    expect(calendrier).toHaveLength(31);
    expect(calendrier[0]?.date).toBe("2027-03-01");
    expect(calendrier[30]?.date).toBe("2027-03-31");

    const parDate = new Map(calendrier.map((j) => [j.date, j]));
    expect(parDate.get("2027-03-03")?.etat).toBe("telework");
    // Le jour voisin n'a rien été déclaré : il EXISTE quand même, et il le dit.
    expect(parDate.get("2027-03-04")?.etat).toBe("undeclared");
    // Le samedi et le dimanche sont marqués, le vendredi ne l'est pas.
    expect(parDate.get("2027-03-05")?.weekend).toBe(false);
    expect(parDate.get("2027-03-06")?.weekend).toBe(true);
    expect(parDate.get("2027-03-07")?.weekend).toBe(true);
  });

  it("EX-TLT-02 — basculer aller ET retour laisse UNE seule ligne, pas deux", async () => {
    /*
     * « D'un clic » se lit dans les deux sens : poser, puis reprendre. Le piège
     * est que le retour au non déclaré s'écrive comme une seconde ligne — la
     * date porterait alors deux vérités, ce que `RG-TLT-01` interdit. Le
     * numéro de version est la preuve que la seconde écriture a bien REMPLACÉ
     * la première.
     */
    const moi = await agent();

    const pose = await teletravail.basculer(moi, utc("2027-03-10"), "telework", moi, AGENT);
    expect(pose.etat).toBe("telework");

    const repris = await teletravail.basculer(moi, utc("2027-03-10"), "undeclared", moi, AGENT);
    expect(repris.etat).toBe("undeclared");
    expect(repris.id).toBe(pose.id);
    expect(repris.version).toBe(pose.version + 1);

    expect(await prisma.telework.count({ where: { userId: moi } })).toBe(1);
  });

  it("EX-TLT-03 — le cumul compte les trois états, et les NON DÉCLARÉS excluent le week-end", async () => {
    /*
     * Avril 2027 : 30 jours, 8 de week-end, donc 22 jours ouvrés. Cinq sont
     * déclarés — trois en télétravail, deux au bureau. Il reste 17 jours ouvrés
     * muets. Un décompte naïf en rendrait 25 : c'est cet écart-là que
     * l'assertion tient. Le cumul dit ce qui MANQUE, pas seulement ce qui est.
     */
    const moi = await agent();
    for (const jour of ["2027-04-05", "2027-04-06", "2027-04-07"]) {
      await teletravail.basculer(moi, utc(jour), "telework", moi, AGENT);
    }
    for (const jour of ["2027-04-08", "2027-04-09"]) {
      await teletravail.basculer(moi, utc(jour), "office", moi, AGENT);
    }

    const { cumul } = await teletravail.planning(moi, utc("2027-04-01"), utc("2027-04-30"));
    expect(cumul).toEqual({ teletravail: 3, bureau: 2, nonDeclares: 17 });
  });
});

describe("EX-TLT-06 — générer les plannings sur une plage", () => {
  it("EX-TLT-06 — la génération ne pose QUE dans la plage demandée, et marque les jours qu'elle produit", async () => {
    /*
     * La règle court depuis le 1ᵉʳ mai et n'a pas de fin ; c'est la plage
     * demandée qui borne la génération. Les mardis de mai 2027 sont les 4, 11,
     * 18 et 25 : le 4 tombe sous la règle et HORS de la plage. Un contrôle qui
     * se contenterait de compter trois jours ne verrait pas la différence entre
     * « le bon compte » et « les bonnes dates ».
     */
    const moi = await agent();
    await teletravail.creerRegle(
      { userId: moi, jourSemaine: 2, dateDebut: utc("2027-05-01") },
      moi,
    );

    const r = await teletravail.generer(moi, utc("2027-05-10"), utc("2027-05-31"), moi, AGENT);
    expect(r).toEqual({ crees: 3, ignores: 0 });

    const poses = await prisma.telework.findMany({
      where: { userId: moi },
      orderBy: { date: "asc" },
    });
    expect(poses.map((j) => j.date.toISOString().slice(0, 10))).toEqual([
      "2027-05-11",
      "2027-05-18",
      "2027-05-25",
    ]);
    // `RG-TLT-04` — un jour issu d'une règle est signalé comme tel, sans quoi
    // la régénération ne saurait pas ce qu'elle a le droit de reprendre.
    expect(poses.every((j) => j.issuDeRegle)).toBe(true);
    expect(poses.every((j) => j.etat === "telework")).toBe(true);
  });

  it("EX-TLT-06 — élargir la plage complète le début du mois sans redoubler ce qui existe", async () => {
    const moi = await agent();
    await teletravail.creerRegle(
      { userId: moi, jourSemaine: 2, dateDebut: utc("2027-05-01") },
      moi,
    );

    await teletravail.generer(moi, utc("2027-05-10"), utc("2027-05-31"), moi, AGENT);
    const elargie = await teletravail.generer(moi, utc("2027-05-01"), utc("2027-05-31"), moi, AGENT);

    // Le seul mardi neuf est le 4 ; les trois autres sont ignorés, jamais
    // recréés — `RG-TLT-05` veut les deux nombres, et ils ne disent pas la même
    // chose.
    expect(elargie).toEqual({ crees: 1, ignores: 3 });
    expect(await prisma.telework.count({ where: { userId: moi } })).toBe(4);
  });
});

describe("EX-TLT-07 — le télétravail de l'équipe à une date", () => {
  it("EX-TLT-07 — l'équipe entière est rendue, muets compris, et personne d'autre", async () => {
    /*
     * La vue répond à « qui est là aujourd'hui ». Elle ne peut donc pas se
     * limiter à ceux qui ont déclaré quelque chose : un agent absent de la
     * liste se lirait comme un agent absent du service. Et elle s'arrête au
     * périmètre — c'est ce que le quatrième agent, hors périmètre et pourtant
     * en télétravail ce jour-là, sert à prouver.
     */
    const chef = await agent();
    const claire = await agent();
    const marc = await agent();
    const ines = await agent();
    const zoe = await agent();

    await teletravail.basculer(claire, utc("2027-06-15"), "telework", chef, ENCADRANT);
    await teletravail.basculer(marc, utc("2027-06-15"), "office", chef, ENCADRANT);
    await teletravail.basculer(zoe, utc("2027-06-15"), "telework", chef, ENCADRANT);

    const equipe = await teletravail.equipeALaDate(
      perimetreDe(chef, [claire, marc, ines]),
      utc("2027-06-15"),
    );
    const parAgent = new Map(equipe.map((a) => [a.id, a.etat]));

    expect(parAgent.get(claire)).toBe("telework");
    expect(parAgent.get(marc)).toBe("office");
    // Ines n'a rien dit : elle est là, et son silence est nommé.
    expect(parAgent.get(ines)).toBe("undeclared");
    expect(parAgent.has(zoe)).toBe(false);
    expect(equipe).toHaveLength(4); // le chef et ses trois agents
  });

  it("EX-TLT-07 — la date interrogée est celle-là, pas la veille", async () => {
    const chef = await agent();
    const claire = await agent();
    await teletravail.basculer(claire, utc("2027-06-16"), "telework", chef, ENCADRANT);

    const veille = await teletravail.equipeALaDate(
      perimetreDe(chef, [claire]),
      utc("2027-06-15"),
    );
    expect(veille.find((a) => a.id === claire)?.etat).toBe("undeclared");

    const leJour = await teletravail.equipeALaDate(
      perimetreDe(chef, [claire]),
      utc("2027-06-16"),
    );
    expect(leJour.find((a) => a.id === claire)?.etat).toBe("telework");
  });

  it("EX-TLT-07 — un compte désactivé sort de l'équipe", async () => {
    const chef = await agent();
    const parti = await agent();
    await prisma.user.update({ where: { id: parti }, data: { actif: false } });

    const equipe = await teletravail.equipeALaDate(
      perimetreDe(chef, [parti]),
      utc("2027-06-17"),
    );
    expect(equipe.map((a) => a.id)).not.toContain(parti);
  });
});
