/**
 * La pile de recette — hors produit.
 *
 * Elle établit les deux capacités que l'étape de recette suppose et que le
 * socle technique n'avait pas décidées :
 *
 *   1. **ouvrir le produit sous une persona donnée** — par la connexion réelle,
 *      avec un compte réel, jamais par une porte dérobée dans le produit ;
 *   2. **remettre le produit à zéro entre deux parcours** — par restauration
 *      d'un instantané de la base, jamais par une route d'administration.
 *
 * Aucune de ces deux capacités n'ajoute une ligne au produit livré. C'est la
 * condition posée par l'étape : le mécanisme de recette ne doit pas apparaître
 * dans les sources livrées.
 *
 * ── La topologie ────────────────────────────────────────────────────────────
 *
 * Un serveur PostgreSQL de recette (conteneur `rationarium-recette-db`, port
 * 55433) porte une base **modèle** — migrée, amorcée, peuplée du second jeu —
 * et une base **par ouvrier** Playwright, clonée du modèle. Chaque ouvrier
 * porte son serveur applicatif et son serveur web : deux parcours joués en
 * parallèle ne se voient pas.
 *
 * La remise à zéro rejoue un instantané SQL du modèle dans la base de
 * l'ouvrier. Elle ne redémarre pas le serveur applicatif : le lot de
 * connexions survit à un `TRUNCATE`.
 */
import { spawn } from "node:child_process";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const ICI = fileURLToPath(new URL(".", import.meta.url));
export const RACINE = resolve(ICI, "../..");

export const CONTENEUR = "rationarium-recette-db";
export const HOTE = "127.0.0.1";
export const PORT_BASE = 55433;
export const UTILISATEUR = "rationarium";
export const MOTDEPASSE = "rationarium";
export const BASE_MODELE = "recette_modele";
export const BASE_ADMIN = "postgres";

/** Le mot de passe de tous les comptes de recette. Il ne vit que dans ce dossier. */
export const MOTDEPASSE_RECETTE = "Recette-2026!";

export const INSTANTANE = resolve(ICI, "instantane.sql");

export const urlDe = (base) =>
  `postgresql://${UTILISATEUR}:${MOTDEPASSE}@${HOTE}:${PORT_BASE}/${base}`;

// ── Utilitaires ─────────────────────────────────────────────────────────────

export function executer(commande, args, options = {}) {
  return new Promise((ok, ko) => {
    const p = spawn(commande, args, { stdio: ["ignore", "pipe", "pipe"], ...options });
    let sortie = "";
    let erreur = "";
    p.stdout?.on("data", (d) => (sortie += d));
    p.stderr?.on("data", (d) => (erreur += d));
    p.on("error", ko);
    p.on("close", (code) =>
      code === 0
        ? ok(sortie)
        : ko(new Error(`${commande} ${args.join(" ")} → ${code}\n${sortie}\n${erreur}`)),
    );
  });
}

async function avecClient(base, travail) {
  const client = new pg.Client({
    host: HOTE,
    port: PORT_BASE,
    user: UTILISATEUR,
    password: MOTDEPASSE,
    database: base,
  });
  await client.connect();
  try {
    return await travail(client);
  } finally {
    await client.end();
  }
}

export const dormir = (ms) => new Promise((ok) => setTimeout(ok, ms));

// ── Le modèle ───────────────────────────────────────────────────────────────

/**
 * Construit la base modèle de bout en bout : migration, amorçage, second jeu,
 * puis instantané.
 *
 * Rejouable. Elle détruit et refait la base modèle : c'est ce qu'on lui
 * demande, et c'est le seul endroit du harnais qui détruise quoi que ce soit.
 */
export async function preparerModele({ aujourdhui = null } = {}) {
  await avecClient(BASE_ADMIN, async (c) => {
    await c.query(
      `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()`,
      [BASE_MODELE],
    );
    await c.query(`DROP DATABASE IF EXISTS "${BASE_MODELE}"`);
    await c.query(`CREATE DATABASE "${BASE_MODELE}"`);
  });

  const env = { ...process.env, DATABASE_URL: urlDe(BASE_MODELE) };

  await executer("pnpm", ["exec", "prisma", "migrate", "deploy"], {
    cwd: resolve(RACINE, "packages/db"),
    env,
  });

  await executer("node", ["dist/exploitation/amorcage.js"], {
    cwd: resolve(RACINE, "apps/api"),
    env: {
      ...env,
      RATIONARIUM_ADMIN_LOGIN: "admin",
      RATIONARIUM_ADMIN_EMAIL: "admin@valpierre.fr",
      RATIONARIUM_ADMIN_MOTDEPASSE: MOTDEPASSE_RECETTE,
    },
  });

  await executer("node", ["recette/jeu2.mjs"], {
    cwd: RACINE,
    env: aujourdhui ? { ...env, RECETTE_AUJOURDHUI: aujourdhui } : env,
  });

  await prendreInstantane();
}

/**
 * L'instantané de la base modèle, en INSERT plutôt qu'en COPY.
 *
 * `pg_dump --inserts` produit un fichier rejouable par une seule requête
 * simple — ce que le pilote `pg` sait faire, et pas `COPY … FROM stdin`. Le
 * jeu est un jeu d'illustration, pas de la volumétrie : le coût est de
 * quelques centaines de millisecondes.
 */
export async function prendreInstantane() {
  const sql = await executer("docker", [
    "exec",
    CONTENEUR,
    "pg_dump",
    "--data-only",
    "--inserts",
    "--no-owner",
    "--no-privileges",
    "--schema",
    "public",
    "--exclude-table",
    "public._prisma_migrations",
    "--username",
    UTILISATEUR,
    BASE_MODELE,
  ]);
  /*
   * PostgreSQL 18 encadre son export de méta-commandes `psql` — `\restrict`
   * et `\unrestrict`. Elles n'ont aucun sens pour un pilote qui parle le
   * protocole : le rejeu s'arrêtait sur « syntax error at or near "\" », un
   * message qui ne dit ni le fichier, ni la ligne, ni que la cause n'est pas
   * du SQL. On ne garde que ce qui en est.
   */
  const propre = sql
    .split("\n")
    .filter((l) => !l.startsWith("\\"))
    .join("\n");
  writeFileSync(INSTANTANE, propre, "utf8");
  return propre.length;
}

/** La liste des tables à vider, dans l'ordre indifférent : les contraintes sont suspendues. */
async function tables(client) {
  const { rows } = await client.query(`
    SELECT c.relname AS nom
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public'
       AND c.relkind IN ('r', 'p')
       AND c.relispartition = false
       AND c.relname <> '_prisma_migrations'
     ORDER BY c.relname
  `);
  return rows.map((r) => r.nom);
}

// ── Les bases d'ouvrier ─────────────────────────────────────────────────────

export const baseOuvrier = (index) => `recette_o${index}`;

export async function clonerBase(index) {
  const nom = baseOuvrier(index);
  await avecClient(BASE_ADMIN, async (c) => {
    await c.query(
      `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()`,
      [nom],
    );
    await c.query(`DROP DATABASE IF EXISTS "${nom}"`);
    await c.query(`CREATE DATABASE "${nom}" TEMPLATE "${BASE_MODELE}"`);
  });
  return nom;
}

/**
 * Remet la base d'un ouvrier dans l'état du modèle.
 *
 * `session_replication_role = replica` suspend les déclencheurs de clé
 * étrangère : l'ordre des insertions cesse de compter, et l'instantané se
 * rejoue tel quel. Les contraintes d'exclusion GiST, elles, restent actives —
 * ce sont des index, pas des déclencheurs — et c'est très bien ainsi : un
 * instantané qui ne se rejouerait pas serait un instantané incohérent.
 */
export async function reinitialiser(index) {
  const sql = readFileSync(INSTANTANE, "utf8");
  await avecClient(baseOuvrier(index), async (c) => {
    const noms = await tables(c);
    await c.query("BEGIN");
    await c.query("SET session_replication_role = replica");
    await c.query(
      `TRUNCATE TABLE ${noms.map((n) => `"${n}"`).join(", ")} RESTART IDENTITY CASCADE`,
    );
    await c.query(sql);
    // `pg_dump` vide le `search_path` de la session : sans ce retour, toute
    // requête non qualifiée qui suit échoue sur « relation … does not exist ».
    await c.query("SET search_path = public");
    await c.query("COMMIT");
  });
}

// ── Les serveurs ────────────────────────────────────────────────────────────

export async function attendre(url, { limite = 60_000 } = {}) {
  const fin = Date.now() + limite;
  let derniere = null;
  while (Date.now() < fin) {
    try {
      const r = await fetch(url);
      if (r.ok) return true;
      derniere = `${r.status}`;
    } catch (e) {
      derniere = e.message;
    }
    await dormir(250);
  }
  throw new Error(`${url} n'a pas répondu en ${limite} ms (dernier : ${derniere})`);
}

export async function demarrerApi({ port, base, journal = null }) {
  const p = spawn("node", ["dist/main.js"], {
    cwd: resolve(RACINE, "apps/api"),
    env: {
      ...process.env,
      NODE_ENV: "production",
      PORT: String(port),
      DATABASE_URL: urlDe(base),
      COOKIE_SECRET: "recette-rationarium",
      RATIONARIUM_FUSEAU: "Europe/Paris",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const lignes = [];
  p.stdout.on("data", (d) => lignes.push(String(d)));
  p.stderr.on("data", (d) => lignes.push(String(d)));
  try {
    await attendre(`http://${HOTE}:${port}/api/sante/pret`);
  } catch (e) {
    p.kill("SIGKILL");
    throw new Error(`${e.message}\n${lignes.join("")}`);
  }
  if (journal) {
    mkdirSync(resolve(journal, ".."), { recursive: true });
  }
  return { processus: p, lignes, port };
}

export async function arreter(processus) {
  if (!processus || processus.killed) return;
  processus.kill("SIGTERM");
  for (let i = 0; i < 40 && processus.exitCode === null; i += 1) await dormir(50);
  if (processus.exitCode === null) processus.kill("SIGKILL");
}

export function instantanePresent() {
  return existsSync(INSTANTANE);
}
