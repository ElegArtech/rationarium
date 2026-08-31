import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { Client } from "pg";
import { creerClient } from "./index.js";
import { peuplerMaquette } from "./maquette.js";

/**
 * Le jeu de données des maquettes — celui que mesure la boucle de conformité.
 *
 * Il porte une charge inhabituelle pour un jeu de démonstration : **un état
 * qu'aucune donnée ne porte rend la classe inerte et le libellé absent**. La
 * vue paraît alors incomplète alors que c'est le jeu de données qui l'est, et
 * l'agent qui « corrige » la vue invente du balisage. Ces tests gardent la
 * couverture des états, pas le contenu.
 *
 * Ils gardent aussi son idempotence. Elle a été vérifiée à la main une fois —
 * ce qui ne vaut que pour ce jour-là. Un jeu qui se duplique au rejeu casse
 * silencieusement toute mesure ultérieure : les comptes changent, les vues
 * cessent de correspondre, et rien ne dit pourquoi.
 */

const RACINE = path.resolve(import.meta.dirname, "..");

let pg: StartedPostgreSqlContainer;
let db: Client;
let url: string;

beforeAll(async () => {
  pg = await new PostgreSqlContainer("postgres:18-alpine").start();
  url = pg.getConnectionUri();
  execFileSync("pnpm", ["exec", "prisma", "migrate", "deploy"], {
    cwd: RACINE,
    env: { ...process.env, DATABASE_URL: url },
    stdio: "pipe",
  });
  db = new Client({ connectionString: url });
  await db.connect();

  /*
   * Le jeu se pose SUR une instance amorcée — il ne crée pas le premier
   * administrateur, sous peine d'en faire une seconde source de vérité à côté
   * de l'amorçage. Le test pose donc le compte lui-même, comme l'amorçage le
   * ferait, sinon il mesurerait un chemin que le produit n'emprunte jamais.
   *
   * C'est ce que ce test a trouvé du premier coup : la commande `db:maquette`
   * échouait sur une base neuve avec une trace Prisma, sans dire qu'il fallait
   * amorcer d'abord.
   */
  await db.query(
    `INSERT INTO users (id, login, email, "motDePasseHash", prenom, nom, "modifieLe")
     VALUES (gen_random_uuid(), 'admin', 'admin@test.local', 'x', 'Compte', 'Amorce', now())`,
  );
}, 300_000);

afterAll(async () => {
  await db?.end();
  await pg?.stop();
});

/** Le projet que mesurent les vues 11, 13 et 15. */
const PROJET_MESURE = "0000700a-0000-4000-8000-000000000000";

const compter = async (table: string): Promise<number> => {
  const { rows } = await db.query(`SELECT count(*)::int AS n FROM ${table}`);
  return rows[0].n as number;
};

describe("le jeu de données des maquettes", () => {
  it("REFUSE UNE BASE NON AMORCÉE, et le dit en français", async () => {
    /*
     * `RG-GEN-03` — un message d'erreur se rédige et il est actionnable. Une
     * trace `findUniqueOrThrow` disait « une contrainte a échoué » : vrai,
     * inutilisable.
     */
    const prisma = creerClient(url);
    try {
      await expect(peuplerMaquette(prisma, "compte-qui-nexiste-pas")).rejects.toThrow(
        /instance déjà amorcée/,
      );
    } finally {
      await prisma.$disconnect();
    }
  }, 60_000);

  it("REJOUÉ, IL NE DUPLIQUE RIEN", async () => {
    const prisma = creerClient(url);
    try {
      await peuplerMaquette(prisma);
      const premier = {
        projets: await compter("projects"),
        taches: await compter("tasks"),
        agents: await compter("users"),
        conges: await compter("leaves"),
        permanences: await compter("predefined_tasks"),
      };

      // Deux rejeux, pas un : une duplication qui n'apparaît qu'au troisième
      // passage est exactement le genre de défaut qu'un seul rejeu manque.
      await peuplerMaquette(prisma);
      await peuplerMaquette(prisma);

      expect({
        projets: await compter("projects"),
        taches: await compter("tasks"),
        agents: await compter("users"),
        conges: await compter("leaves"),
        permanences: await compter("predefined_tasks"),
      }).toEqual(premier);
    } finally {
      await prisma.$disconnect();
    }
  }, 300_000);

  it("REJOUÉ UNE SEMAINE PLUS TARD, il se réancre sans se refuser lui-même", async () => {
    /*
     * Le défaut que ce test a trouvé, et que le rejeu à date constante ne
     * pouvait pas voir : **tout le jeu est ancré sur le lundi de la semaine
     * courante**. Rejoué une semaine plus tard, les nouvelles dates de congés
     * chevauchaient celles que le rejeu n'avait pas encore réécrites, et la
     * contrainte d'exclusion `RG-CNG-25` refusait l'insertion à mi-parcours.
     *
     * L'idempotence ne valait donc qu'à date constante. Un jeu ancré sur
     * « aujourd'hui » pourrit avec le calendrier — c'est le genre de défaut
     * qui n'apparaît qu'un lundi, sur la machine de quelqu'un d'autre.
     */
    const prisma = creerClient(url);
    try {
      const base = new Date("2026-03-02T00:00:00Z");
      await peuplerMaquette(prisma, "admin", base);
      const semaineSuivante = new Date("2026-03-09T00:00:00Z");
      await expect(peuplerMaquette(prisma, "admin", semaineSuivante)).resolves.toBeTruthy();
      const encoreApres = new Date("2026-03-30T00:00:00Z");
      await expect(peuplerMaquette(prisma, "admin", encoreApres)).resolves.toBeTruthy();

      // Et il faut revenir à aujourd'hui : les tests suivants lisent le jeu.
      await peuplerMaquette(prisma);
    } finally {
      await prisma.$disconnect();
    }
  }, 300_000);

  it("UNE LIGNE CORROMPUE EST RESTAURÉE PAR LE REJEU — le contrôle générique", async () => {
    /*
     * Le piège qui s'est payé CINQ fois dans ce fichier : un champ absent de la
     * clause `update` d'un `upsert` ne change jamais. Les identifiants sont
     * stables, donc la ligne existe et paraît juste — seule la valeur ment.
     *
     * Aucun des contrôles précédents ne pouvait le voir : ils rejouent le jeu
     * sur lui-même, où rien n'a divergé. Celui-ci CORROMPT d'abord, puis
     * rejoue, puis vérifie la restauration. Il ne connaît aucun des cinq cas
     * nommément — il les attrape tous, et attrapera le sixième.
     */
    const prisma = creerClient(url);
    try {
      await peuplerMaquette(prisma);

      const avant = {
        statutProjet: (await db.query(
          `SELECT statut FROM projects WHERE id = $1`, [PROJET_MESURE],
        )).rows[0].statut,
        jalonTache: (await db.query(
          `SELECT "milestoneId" FROM tasks WHERE titre = 'Plan de tests'`,
        )).rows[0].milestoneId,
        evenementExterne: (await db.query(
          `SELECT "interventionExterieure" FROM events WHERE titre = 'Comité · EXT'`,
        )).rows[0].interventionExterieure,
        roleMembre: (await db.query(
          `SELECT "roleProjet" FROM project_members WHERE "projectId" = $1 ORDER BY "roleProjet" LIMIT 1`,
          [PROJET_MESURE],
        )).rows[0].roleProjet,
      };

      // On casse. Chacune de ces colonnes a déjà menti en vrai.
      await db.query(`UPDATE projects SET statut = 'draft' WHERE id = $1`, [PROJET_MESURE]);
      await db.query(`UPDATE tasks SET "milestoneId" = NULL WHERE titre = 'Plan de tests'`);
      await db.query(`UPDATE events SET "interventionExterieure" = false WHERE titre = 'Comité · EXT'`);
      await db.query(`UPDATE project_members SET "roleProjet" = 'observateur' WHERE "projectId" = $1`, [PROJET_MESURE]);

      await peuplerMaquette(prisma);

      expect((await db.query(`SELECT statut FROM projects WHERE id = $1`, [PROJET_MESURE])).rows[0].statut)
        .toBe(avant.statutProjet);
      expect((await db.query(`SELECT "milestoneId" FROM tasks WHERE titre = 'Plan de tests'`)).rows[0].milestoneId)
        .toBe(avant.jalonTache);
      expect((await db.query(`SELECT "interventionExterieure" FROM events WHERE titre = 'Comité · EXT'`)).rows[0].interventionExterieure)
        .toBe(avant.evenementExterne);
      expect((await db.query(
        `SELECT "roleProjet" FROM project_members WHERE "projectId" = $1 ORDER BY "roleProjet" LIMIT 1`,
        [PROJET_MESURE],
      )).rows[0].roleProjet).toBe(avant.roleMembre);
    } finally {
      await prisma.$disconnect();
    }
  }, 300_000);

  it("LÈVE le drapeau de changement de mot de passe sur le compte connecté", async () => {
    /*
     * L'amorçage le pose à `true` pour que le premier administrateur change le
     * mot de passe engendré. Les quatre autres agents du jeu le reçoivent à
     * `false` à leur création ; celui-là, non.
     *
     * Conséquence : `connecter()` réussissait, puis TOUTES les routes
     * redirigeaient vers `/mot-de-passe-impose`. Une mesure de rendu relevait
     * donc la vue 05 sur les trente-cinq vues, et annonçait quatre-vingt-dix
     * écarts sur la vue 19 dont aucun n'était réel. Le jeu de maquette existe
     * pour qu'une instance soit REGARDABLE ; un compte qui ne peut aller nulle
     * part ne l'est pas.
     */
    const prisma = creerClient(url);
    try {
      await peuplerMaquette(prisma);
      const moi = await prisma.user.findFirstOrThrow({ where: { prenom: "Camille" } });
      expect(moi.motDePasseAChanger).toBe(false);
    } finally {
      await prisma.$disconnect();
    }
  }, 300_000);

  it("rattache CHAQUE agent à un service — sinon le filtre s'affiche vide", async () => {
    /*
     * Un sélecteur vide se lit « il n'y a pas de service », pas « personne
     * n'y est rattaché ». Les cinq agents n'appartenaient à aucun service :
     * les filtres des vues 07 et 09 n'avaient rien à proposer.
     */
    const { rows } = await db.query(
      `SELECT count(DISTINCT us."userId")::int AS n
       FROM user_services us JOIN users u ON u.id = us."userId"
       WHERE u.login = 'admin' OR u.email LIKE '%@roqueville.fr'`,
    );
    expect(rows[0].n).toBeGreaterThanOrEqual(5);
  });

  it("porte LES QUATRE PRIORITÉS et LES CINQ STATUTS de tâche", async () => {
    /*
     * Sans cette couverture, « Basse », « Critique », « Bloqué » et « En revue »
     * n'ont aucune donnée qui les porte : les libellés n'apparaissent nulle
     * part et la boucle de conformité les compte comme des textes manquants.
     * C'est arrivé, sur cinq vues à la fois.
     */
    const { rows: priorites } = await db.query(
      `SELECT DISTINCT priorite FROM tasks WHERE id::text LIKE '0000740a%' ORDER BY priorite`,
    );
    expect(priorites.map((r) => r.priorite).sort()).toEqual(
      ["critical", "high", "low", "normal"].sort(),
    );

    const { rows: statuts } = await db.query(
      `SELECT DISTINCT statut FROM tasks WHERE id::text LIKE '0000740a%' ORDER BY statut`,
    );
    expect(statuts.map((r) => r.statut).sort()).toEqual(
      ["blocked", "doing", "done", "review", "todo"].sort(),
    );
  });

  it("porte UN PROJET ANNULÉ — `is-cancelled` n'a aucune autre source", async () => {
    const { rows } = await db.query(
      `SELECT count(*)::int AS n FROM projects
       WHERE id::text LIKE '0000700a%' AND statut = 'cancelled'`,
    );
    expect(rows[0].n).toBeGreaterThan(0);
  });

  it("les quatre priorités et les cinq statuts vivent SUR LE PROJET MESURÉ", async () => {
    /*
     * Le piège que ce test garde : les états existaient en base, mais répartis
     * sur trois projets. Les vues 11, 13 et 15 ne mesurent QUE le premier —
     * elles n'avaient donc rien à montrer, et la couverture globale disait le
     * contraire. Une couverture qui ne se lit pas là où on regarde n'en est
     * pas une.
     */
    const projetMesure = PROJET_MESURE;

    const { rows: priorites } = await db.query(
      `SELECT DISTINCT priorite FROM tasks WHERE "projectId" = $1`,
      [projetMesure],
    );
    expect(priorites.map((r) => r.priorite).sort()).toEqual(
      ["critical", "high", "low", "normal"].sort(),
    );

    const { rows: statuts } = await db.query(
      `SELECT DISTINCT statut FROM tasks WHERE "projectId" = $1`,
      [projetMesure],
    );
    expect(statuts.map((r) => r.statut).sort()).toEqual(
      ["blocked", "doing", "done", "review", "todo"].sort(),
    );
  });
});
