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

/**
 * `EX-TLT-04` — « Configurer des jours fixes récurrents : jour de la semaine,
 * date de début, date de fin facultative, **actif**. »
 *
 * Les trois premières facettes se posaient par `creerRegle`. La quatrième ne se
 * posait par RIEN : `TeleworkRule.active` avait un défaut à `true` et aucun
 * chemin ne l'écrivait — pas plus qu'il n'existait de modification ou de
 * suppression. Une règle posée était définitive, et le `active: true` que
 * `generer()` mettait en filtre n'écartait jamais rien.
 *
 * Les tests qui suivent couvrent la facette manquante ET les deux verbes
 * absents, cas de refus compris.
 */
describe("EX-TLT-04 — une règle se modifie, se désactive et se supprime", () => {
  it("EX-TLT-04 — DÉSACTIVER une règle la retire de la génération, sans l'effacer", async () => {
    /*
     * Le cœur de la facette « actif ». Un test qui se contenterait de relire
     * `active === false` ne prouverait que la persistance ; ce qui compte est
     * l'EFFET — que la règle cesse de produire des jours. Piège consigné :
     * « un réglage qui s'enregistre n'est pas un réglage qui s'applique ».
     */
    const moi = await agent();
    const regle = await teletravail.creerRegle(
      { userId: moi, jourSemaine: 4, dateDebut: utc("2028-03-01") },
      moi,
      AGENT,
    );

    // Active : les jeudis de mars 2028 sont les 2, 9, 16, 23 et 30.
    const avant = await teletravail.generer(moi, utc("2028-03-01"), utc("2028-03-31"), moi, AGENT);
    expect(avant.crees).toBe(5);

    await teletravail.modifierRegle(
      regle.id,
      { version: regle.version, active: false },
      moi,
      AGENT,
    );

    // Désactivée : avril ne produit plus rien, alors que la règle court encore.
    const apres = await teletravail.generer(moi, utc("2028-04-01"), utc("2028-04-30"), moi, AGENT);
    expect(apres).toEqual({ crees: 0, ignores: 0 });

    // Et elle reste VISIBLE : c'est elle qui explique pourquoi les jours ont
    // cessé d'apparaître. La faire disparaître laisserait un calendrier changé
    // sans raison lisible.
    const liste = await teletravail.regles(moi);
    expect(liste.find((r) => r.id === regle.id)?.active).toBe(false);
  });

  it("EX-TLT-04 — RÉACTIVER une règle la remet en production de jours", async () => {
    /*
     * Le versant nominal du précédent : sans lui, une implémentation qui
     * écrirait `active: false` en dur passerait le premier test.
     */
    const moi = await agent();
    const regle = await teletravail.creerRegle(
      { userId: moi, jourSemaine: 4, dateDebut: utc("2028-05-01") },
      moi,
      AGENT,
    );
    const eteinte = await teletravail.modifierRegle(
      regle.id,
      { version: regle.version, active: false },
      moi,
      AGENT,
    );
    expect(
      await teletravail.generer(moi, utc("2028-05-01"), utc("2028-05-31"), moi, AGENT),
    ).toEqual({ crees: 0, ignores: 0 });

    await teletravail.modifierRegle(
      regle.id,
      { version: eteinte.version, active: true },
      moi,
      AGENT,
    );
    // Les jeudis de mai 2028 : 4, 11, 18, 25.
    expect(
      (await teletravail.generer(moi, utc("2028-05-01"), utc("2028-05-31"), moi, AGENT)).crees,
    ).toBe(4);
  });

  it("EX-TLT-04 — MODIFIER le jour de la semaine change les jours produits", async () => {
    const moi = await agent();
    const regle = await teletravail.creerRegle(
      { userId: moi, jourSemaine: 1, dateDebut: utc("2028-06-01") },
      moi,
      AGENT,
    );
    await teletravail.modifierRegle(
      regle.id,
      { version: regle.version, jourSemaine: 3 },
      moi,
      AGENT,
    );

    await teletravail.generer(moi, utc("2028-06-01"), utc("2028-06-30"), moi, AGENT);
    const poses = await prisma.telework.findMany({
      where: { userId: moi },
      orderBy: { date: "asc" },
    });
    // Les MERCREDIS de juin 2028 — 7, 14, 21, 28 —, pas les lundis.
    expect(poses.map((j) => j.date.toISOString().slice(0, 10))).toEqual([
      "2028-06-07",
      "2028-06-14",
      "2028-06-21",
      "2028-06-28",
    ]);
  });

  it("EX-TLT-04 — la date de fin s'EFFACE par `null`, et l'absence du champ la laisse", async () => {
    /*
     * « Date de fin FACULTATIVE » : une règle bornée doit pouvoir se rouvrir.
     * `undefined` et `null` disent deux choses différentes ; les confondre
     * rendrait la borne définitive — le même trou, un cran plus bas.
     */
    const moi = await agent();
    const regle = await teletravail.creerRegle(
      { userId: moi, jourSemaine: 2, dateDebut: utc("2028-07-04"), dateFin: utc("2028-07-18") },
      moi,
      AGENT,
    );
    expect(regle.dateFin).not.toBeNull();

    // Le champ absent : la borne reste.
    const inchangee = await teletravail.modifierRegle(
      regle.id,
      { version: regle.version, jourSemaine: 2 },
      moi,
      AGENT,
    );
    expect(inchangee.dateFin).not.toBeNull();

    // `null` : la borne saute.
    const ouverte = await teletravail.modifierRegle(
      regle.id,
      { version: inchangee.version, dateFin: null },
      moi,
      AGENT,
    );
    expect(ouverte.dateFin).toBeNull();
  });

  it("EX-TLT-04 — SUPPRIMER une règle la retire, sans effacer les jours déjà posés", async () => {
    /*
     * Les jours générés sont des déclarations à part entière une fois posées.
     * Les emporter avec la règle réécrirait un passé que d'autres ont pu
     * consulter — la désactivation est le geste réversible, pas la suppression.
     */
    const moi = await agent();
    const regle = await teletravail.creerRegle(
      { userId: moi, jourSemaine: 5, dateDebut: utc("2028-08-01") },
      moi,
      AGENT,
    );
    await teletravail.generer(moi, utc("2028-08-01"), utc("2028-08-31"), moi, AGENT);
    const posesAvant = await prisma.telework.count({ where: { userId: moi } });
    expect(posesAvant).toBeGreaterThan(0);

    await teletravail.supprimerRegle(regle.id, moi, AGENT);

    expect((await teletravail.regles(moi)).map((r) => r.id)).not.toContain(regle.id);
    expect(await prisma.telework.count({ where: { userId: moi } })).toBe(posesAvant);
  });

  it("EX-TLT-04, RG-GEN-07 — REFUSE une modification portant une version périmée", async () => {
    const moi = await agent();
    const regle = await teletravail.creerRegle(
      { userId: moi, jourSemaine: 1, dateDebut: utc("2028-09-04") },
      moi,
      AGENT,
    );
    // Une première écriture passe et incrémente la version.
    await teletravail.modifierRegle(regle.id, { version: regle.version, active: false }, moi, AGENT);

    // La seconde rejoue la version d'origine : c'est le cas de concurrence.
    await expect(
      teletravail.modifierRegle(regle.id, { version: regle.version, active: true }, moi, AGENT),
    ).rejects.toMatchObject({ code: "conflit_de_version" });

    // Et rien n'a bougé : un conflit détecté puis appliqué serait pire que rien.
    const relue = await prisma.teleworkRule.findUniqueOrThrow({ where: { id: regle.id } });
    expect(relue.active).toBe(false);
  });

  it("EX-TLT-04, RG-TLT-03 — REFUSE une modification qui fabriquerait un doublon", async () => {
    const moi = await agent();
    await teletravail.creerRegle(
      { userId: moi, jourSemaine: 1, dateDebut: utc("2028-10-02") },
      moi,
      AGENT,
    );
    const seconde = await teletravail.creerRegle(
      { userId: moi, jourSemaine: 2, dateDebut: utc("2028-10-02") },
      moi,
      AGENT,
    );

    // Déplacer la seconde sur le lundi la ferait entrer en collision.
    await expect(
      teletravail.modifierRegle(
        seconde.id,
        { version: seconde.version, jourSemaine: 1 },
        moi,
        AGENT,
      ),
    ).rejects.toMatchObject({ code: "regle_en_double" });
  });

  it("EX-TLT-04, RG-TLT-03 — l'unicité est DOUBLÉE EN BASE, pas seulement contrôlée", async () => {
    /*
     * `C15` : un contrôle applicatif seul est contournable par concurrence —
     * deux modifications visant le même couple se croisent entre le
     * `findUnique` et l'`update`. On force l'écriture sous le service pour
     * vérifier que la base refuse quand même.
     */
    const moi = await agent();
    await teletravail.creerRegle(
      { userId: moi, jourSemaine: 3, dateDebut: utc("2028-11-01") },
      moi,
      AGENT,
    );
    const seconde = await teletravail.creerRegle(
      { userId: moi, jourSemaine: 4, dateDebut: utc("2028-11-01") },
      moi,
      AGENT,
    );

    await expect(
      prisma.teleworkRule.update({ where: { id: seconde.id }, data: { jourSemaine: 3 } }),
    ).rejects.toMatchObject({ code: "P2002" });
  });

  it("RG-TLT-07 — REFUSE de modifier la règle d'un autre sans telework:manage_any", async () => {
    const proprietaire = await agent();
    const intrus = await agent();
    const regle = await teletravail.creerRegle(
      { userId: proprietaire, jourSemaine: 1, dateDebut: utc("2029-01-01") },
      proprietaire,
      AGENT,
    );

    await expect(
      teletravail.modifierRegle(
        regle.id,
        { version: regle.version, active: false },
        intrus,
        // L'intrus a bien `telework:manage_rules` : la garde de route le
        // laisse passer. C'est le périmètre qui l'arrête, et il n'existait pas.
        new Set([...AGENT, "telework:manage_rules"]),
      ),
    ).rejects.toMatchObject({
      code: "autrui_sans_permission",
      detail: { permission: "telework:manage_any" },
    });

    const intacte = await prisma.teleworkRule.findUniqueOrThrow({ where: { id: regle.id } });
    expect(intacte.active).toBe(true);
  });

  it("RG-TLT-07 — REFUSE de SUPPRIMER la règle d'un autre, et un encadrant le peut", async () => {
    const membre = await agent();
    const intrus = await agent();
    const chef = await agent();
    const regle = await teletravail.creerRegle(
      { userId: membre, jourSemaine: 2, dateDebut: utc("2029-02-01") },
      membre,
      AGENT,
    );

    await expect(
      teletravail.supprimerRegle(regle.id, intrus, new Set([...AGENT, "telework:manage_rules"])),
    ).rejects.toMatchObject({ code: "autrui_sans_permission" });
    expect(await prisma.teleworkRule.count({ where: { id: regle.id } })).toBe(1);

    // Le versant nominal : l'encadrement, lui, agit sur son équipe.
    await teletravail.supprimerRegle(regle.id, chef, ENCADRANT);
    expect(await prisma.teleworkRule.count({ where: { id: regle.id } })).toBe(0);
  });

  it("RG-TLT-07 — REFUSE de POSER une règle sur le calendrier d'un autre", async () => {
    /*
     * Le trou voisin, trouvé en portant les deux verbes manquants : `creerRegle`
     * ne comparait pas non plus `userId` à l'acteur. Tout porteur de
     * `telework:manage_rules` pouvait poser des jours fixes sur le calendrier
     * de n'importe qui.
     */
    const moi = await agent();
    const autre = await agent();
    await expect(
      teletravail.creerRegle(
        { userId: autre, jourSemaine: 1, dateDebut: utc("2029-03-05") },
        moi,
        new Set([...AGENT, "telework:manage_rules"]),
      ),
    ).rejects.toMatchObject({ code: "autrui_sans_permission" });
    expect(await prisma.teleworkRule.count({ where: { userId: autre } })).toBe(0);
  });

  it("EX-TLT-04 — la lecture rend de quoi composer l'écriture : `version` est là", async () => {
    /*
     * Le raccord entre les deux moitiés. `regles()` doit rendre le `version`
     * que `modifierRegle` exige, sinon aucune requête n'est composable et le
     * diagnostic tiré serait « la route n'existe pas » — piège déjà payé sur
     * `PATCH /auth/me`.
     */
    const moi = await agent();
    await teletravail.creerRegle(
      { userId: moi, jourSemaine: 5, dateDebut: utc("2029-04-06") },
      moi,
      AGENT,
    );

    const lue = (await teletravail.regles(moi))[0]!;
    expect(typeof lue.version).toBe("number");
    await expect(
      teletravail.modifierRegle(lue.id, { version: lue.version, active: false }, moi, AGENT),
    ).resolves.toMatchObject({ active: false });
  });

  it("EX-TLT-04 — la modification et la suppression sont TRACÉES au journal", async () => {
    const moi = await agent();
    const regle = await teletravail.creerRegle(
      { userId: moi, jourSemaine: 1, dateDebut: utc("2029-05-07") },
      moi,
      AGENT,
    );
    await teletravail.modifierRegle(regle.id, { version: regle.version, active: false }, moi, AGENT);
    await teletravail.supprimerRegle(regle.id, moi, AGENT);

    const traces = await prisma.auditLog.findMany({
      where: { entiteId: regle.id },
      select: { action: true },
    });
    expect(traces.map((t) => t.action)).toEqual(
      expect.arrayContaining(["telework.rule_update", "telework.rule_delete"]),
    );
  });
});
