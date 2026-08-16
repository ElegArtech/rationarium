import { mkdir, writeFile, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import type { PrismaClient } from "./generated/client.js";

/**
 * **C14 — la réversibilité.**
 *
 * `cadrage/01 § 7` : « Toutes les données sont exportables dans des formats
 * ouverts. » C'est une exigence d'exploitation, pas une fonction de produit :
 * elle protège la collectivité contre l'enfermement, et elle ne vaut que si
 * l'export est **intégral**. Un export qui couvre les tables qu'on a pensé à
 * lister n'est pas une réversibilité — c'est une sélection, et personne ne
 * s'en aperçoit avant d'en avoir besoin.
 *
 * D'où le parti pris central de ce module : **la liste des tables n'est écrite
 * nulle part.** Elle est lue dans le catalogue de PostgreSQL au moment de
 * l'export. Une table ajoutée par une migration future y entre sans qu'on
 * touche à ce fichier ; une table oubliée est impossible.
 *
 * Deux formats, et ils ne servent pas la même chose :
 *
 *   - **JSON Lines** — le format de reprise. Il distingue `null` de la chaîne
 *     vide, garde les objets JSON tels quels, et se relit ligne par ligne sans
 *     charger le fichier. C'est lui que `reimporterTout` sait relire, et c'est
 *     sur lui que porte l'épreuve d'aller-retour.
 *   - **CSV** — le format de lecture. Tableur, base tierce, contrôle humain.
 *     Il ne sait pas dire `null` : c'est précisément pourquoi il n'est pas le
 *     format de reprise.
 *
 * Le pendant de ce module est `deploiement/sauvegarde.sh` : `pg_dump` reste la
 * **sauvegarde** — plus fidèle, plus rapide, et restaurable telle quelle. Ce
 * module n'est pas une sauvegarde ; c'est la porte de sortie.
 */

// ── Le catalogue, lu dans la base ──────────────────────────────────────────

type Colonne = { nom: string; type: string; udt: string };

/**
 * Les tables à exporter.
 *
 * Trois exclusions, chacune motivée :
 *   - `_prisma_migrations` est l'histoire de l'outil, pas la donnée du métier ;
 *     la restaurer sur une base déjà migrée créerait un conflit.
 *   - les **partitions** (`relispartition`) : leurs lignes sont déjà lues par
 *     la table mère. Les exporter les compterait deux fois.
 *   - les schémas autres que `public` — `pgboss` porte une file de travaux,
 *     c'est-à-dire un état d'exécution, pas une donnée à emporter.
 */
export async function listerTables(prisma: PrismaClient): Promise<string[]> {
  const lignes = await prisma.$queryRawUnsafe<{ relname: string }[]>(`
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind IN ('r', 'p')
      AND NOT c.relispartition
      AND c.relname <> '_prisma_migrations'
    ORDER BY c.relname
  `);
  return lignes.map((l) => l.relname);
}

async function colonnesDe(prisma: PrismaClient, table: string): Promise<Colonne[]> {
  const lignes = await prisma.$queryRawUnsafe<
    { column_name: string; data_type: string; udt_name: string }[]
  >(
    `SELECT column_name, data_type, udt_name
     FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = $1
     ORDER BY ordinal_position`,
    table,
  );
  return lignes.map((l) => ({ nom: l.column_name, type: l.data_type, udt: l.udt_name }));
}

/**
 * Les colonnes de la clé primaire, pour un ordre de lecture stable.
 *
 * Sans `ORDER BY`, PostgreSQL rend les lignes dans l'ordre physique : deux
 * exports de la même base peuvent différer ligne pour ligne. Un export non
 * reproductible se compare mal, et une comparaison est la seule façon de
 * vérifier qu'il est complet.
 */
async function clePrimaire(prisma: PrismaClient, table: string): Promise<string[]> {
  const lignes = await prisma.$queryRawUnsafe<{ attname: string }[]>(
    `SELECT a.attname
     FROM pg_index i
     JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
     WHERE i.indrelid = ('public.' || quote_ident($1))::regclass AND i.indisprimary`,
    table,
  );
  return lignes.map((l) => l.attname);
}

// ── Sérialisation ──────────────────────────────────────────────────────────

/**
 * `JSON.stringify` ne sait pas écrire un `bigint`, et rend un `Decimal` sous
 * une forme illisible. Les deux existent dans ce schéma ; les laisser passer
 * ferait échouer l'export au premier enregistrement concerné, c'est-à-dire en
 * production et pas en développement.
 */
const remplacer = (_cle: string, valeur: unknown): unknown => {
  if (typeof valeur === "bigint") return valeur.toString();
  if (valeur instanceof Date) return valeur.toISOString();
  if (valeur !== null && typeof valeur === "object" && "toFixed" in valeur) {
    return String(valeur);
  }
  return valeur;
};

/** Une valeur, telle qu'un tableur doit la lire. */
function versChampCsv(valeur: unknown): string {
  if (valeur === null || valeur === undefined) return "";
  if (valeur instanceof Date) return valeur.toISOString();
  const texte =
    typeof valeur === "object" ? JSON.stringify(valeur, remplacer) : String(valeur);
  // Guillemet doublé, champ encadré dès qu'il porte un séparateur ou un saut
  // de ligne. C'est le minimum du RFC 4180, et c'est aussi tout ce dont un
  // tableur a besoin.
  return /["\n\r,;]/.test(texte) ? `"${texte.replaceAll('"', '""')}"` : texte;
}

// ── Export ─────────────────────────────────────────────────────────────────

export type LigneManifeste = { table: string; lignes: number; jsonl: string; csv: string };

export type Manifeste = {
  produit: "trame";
  /** La dernière migration appliquée : la forme qu'avait la base ce jour-là. */
  schema: string | null;
  exporteLe: string;
  tables: LigneManifeste[];
};

const LOT = 2_000;

/**
 * Exporte **toute** la base dans un dossier.
 *
 * La lecture est paginée : à la volumétrie cible — 20 000 tâches, cinq ans
 * d'historique —, charger une table entière en mémoire avant de l'écrire n'est
 * pas une optimisation manquée, c'est un plantage.
 */
export async function exporterTout(
  prisma: PrismaClient,
  dossier: string,
  horodatage = "1970-01-01T00:00:00.000Z",
): Promise<Manifeste> {
  await mkdir(dossier, { recursive: true });

  const tables = await listerTables(prisma);
  const manifeste: Manifeste = {
    produit: "trame",
    schema: await derniereMigration(prisma),
    exporteLe: horodatage,
    tables: [],
  };

  for (const table of tables) {
    const colonnes = await colonnesDe(prisma, table);
    const pk = await clePrimaire(prisma, table);
    const ordre = pk.length > 0 ? `ORDER BY ${pk.map((c) => `"${c}"`).join(", ")}` : "";

    const jsonl: string[] = [];
    // Le BOM : Excel lit un CSV UTF-8 sans lui comme du latin-1, et affiche
    // « Éléonore » en mojibake. Même choix qu'aux exports de L-22 et L-24.
    const csv: string[] = ["﻿" + colonnes.map((c) => versChampCsv(c.nom)).join(",")];

    let decalage = 0;
    for (;;) {
      const lot = await prisma.$queryRawUnsafe<Record<string, unknown>[]>(
        `SELECT * FROM "${table}" ${ordre} LIMIT ${LOT} OFFSET ${decalage}`,
      );
      if (lot.length === 0) break;
      for (const ligne of lot) {
        jsonl.push(JSON.stringify(ligne, remplacer));
        csv.push(colonnes.map((c) => versChampCsv(ligne[c.nom])).join(","));
      }
      decalage += lot.length;
      if (lot.length < LOT) break;
    }

    const fichierJsonl = `${table}.jsonl`;
    const fichierCsv = `${table}.csv`;
    await writeFile(path.join(dossier, fichierJsonl), jsonl.map((l) => `${l}\n`).join(""), "utf8");
    await writeFile(path.join(dossier, fichierCsv), `${csv.join("\r\n")}\r\n`, "utf8");

    manifeste.tables.push({
      table,
      lignes: jsonl.length,
      jsonl: fichierJsonl,
      csv: fichierCsv,
    });
  }

  await writeFile(
    path.join(dossier, "manifeste.json"),
    `${JSON.stringify(manifeste, null, 2)}\n`,
    "utf8",
  );
  return manifeste;
}

async function derniereMigration(prisma: PrismaClient): Promise<string | null> {
  const lignes = await prisma.$queryRawUnsafe<{ migration_name: string }[]>(
    `SELECT migration_name FROM _prisma_migrations
     WHERE finished_at IS NOT NULL ORDER BY finished_at DESC LIMIT 1`,
  );
  return lignes[0]?.migration_name ?? null;
}

// ── Reprise ────────────────────────────────────────────────────────────────

/**
 * Relit un export dans une base **vide mais migrée**.
 *
 * Cette fonction n'est pas une procédure de restauration : la restauration se
 * fait par `pg_restore`, et elle est éprouvée par `sauvegarde.int.test.ts`.
 * Elle existe pour **prouver que l'export est complet et fidèle** — un export
 * qu'on ne sait pas relire n'a jamais été vérifié, il a seulement été produit.
 *
 * `session_replication_role = replica` suspend les déclencheurs de clé
 * étrangère le temps de la reprise. Sans cela, il faudrait ordonner
 * quarante-deux tables par leurs dépendances, et l'ordre serait faux dès la
 * prochaine relation ajoutée. La contrainte n'est pas supprimée : elle est
 * inactive pendant la transaction, et la base la revérifie ensuite — la
 * fonction s'en assure.
 */
export async function reimporterTout(
  prisma: PrismaClient,
  dossier: string,
): Promise<{ table: string; lignes: number }[]> {
  const brut = await readFile(path.join(dossier, "manifeste.json"), "utf8");
  const manifeste = JSON.parse(brut) as Manifeste;

  const fichiers = new Set(await readdir(dossier));
  for (const entree of manifeste.tables) {
    if (!fichiers.has(entree.jsonl)) {
      throw new Error(`export incomplet : ${entree.jsonl} annoncé au manifeste, absent du dossier`);
    }
  }

  const repris: { table: string; lignes: number }[] = [];

  /*
   * Tout dans UNE transaction, et ce n'est pas qu'une question d'atomicité :
   * `SET` vaut pour une session, et le pilote puise dans une réserve de
   * connexions. Un `SET` émis hors transaction s'appliquerait à une connexion
   * quelconque, et les insertions suivantes partiraient sur une autre — les
   * déclencheurs seraient toujours actifs, et l'échec dirait « violation de
   * clé étrangère » sans qu'on voie pourquoi.
   */
  await prisma.$transaction(
    async (tx) => {
      await tx.$executeRawUnsafe("SET LOCAL session_replication_role = replica");
      for (const entree of manifeste.tables) {
        const contenu = await readFile(path.join(dossier, entree.jsonl), "utf8");
        const lignes = contenu
          .split("\n")
          .filter((l) => l.length > 0)
          .map((l) => JSON.parse(l) as Record<string, unknown>);
        if (lignes.length === 0) {
          repris.push({ table: entree.table, lignes: 0 });
          continue;
        }

        const colonnes = await colonnesDe(tx as PrismaClient, entree.table);
        await insererParLots(tx as PrismaClient, entree.table, colonnes, lignes);
        repris.push({ table: entree.table, lignes: lignes.length });
      }
    },
    { maxWait: 30_000, timeout: 900_000 },
  );

  return repris;
}

/**
 * Insère avec un **transtypage explicite par colonne**.
 *
 * Les paramètres arrivent en texte : sans `::uuid`, `::jsonb`, `::date`,
 * PostgreSQL refuse ou, pire, accepte en devinant. Le type vient du catalogue,
 * donc il est juste par construction, y compris pour une colonne ajoutée plus
 * tard.
 */
async function insererParLots(
  prisma: PrismaClient,
  table: string,
  colonnes: Colonne[],
  lignes: Record<string, unknown>[],
): Promise<void> {
  const noms = colonnes.map((c) => `"${c.nom}"`).join(", ");
  // 65 535 paramètres au maximum dans un message de liaison PostgreSQL.
  const parLot = Math.max(1, Math.floor(60_000 / colonnes.length));

  for (let debut = 0; debut < lignes.length; debut += parLot) {
    const lot = lignes.slice(debut, debut + parLot);
    const parametres: unknown[] = [];
    const tuples = lot.map((ligne) => {
      const places = colonnes.map((c) => {
        parametres.push(normaliser(ligne[c.nom]));
        return `$${parametres.length}::${typeSql(c)}`;
      });
      return `(${places.join(", ")})`;
    });
    await prisma.$executeRawUnsafe(
      `INSERT INTO "${table}" (${noms}) VALUES ${tuples.join(", ")}`,
      ...parametres,
    );
  }
}

/**
 * Le type du catalogue, sous la forme qu'un transtypage accepte.
 *
 * `data_type` suffit pour les types de base, mais il rend `USER-DEFINED` pour
 * une énumération et `ARRAY` pour un tableau : c'est `udt_name` qui porte le
 * nom réel. Transtyper une énumération en `text` échouerait — PostgreSQL n'a
 * pas de conversion implicite du texte vers une énumération, et l'insertion
 * serait refusée à la première ligne.
 */
function typeSql(colonne: Colonne): string {
  switch (colonne.type) {
    case "character varying":
      return "text";
    case "timestamp without time zone":
      return "timestamp";
    case "timestamp with time zone":
      return "timestamptz";
    case "ARRAY":
      // `udt_name` d'un tableau est le type d'élément préfixé d'un souligné.
      return `"${colonne.udt.replace(/^_/, "")}"[]`;
    case "USER-DEFINED":
      // Les noms d'énumération engendrés par Prisma sont en casse mixte : sans
      // guillemets, PostgreSQL les replierait en minuscules et ne les
      // trouverait pas.
      return `"${colonne.udt}"`;
    default:
      return colonne.type;
  }
}

function normaliser(valeur: unknown): unknown {
  if (valeur === undefined) return null;
  // Un tableau part en littéral PostgreSQL — `{a,b}` —, pas en JSON : le
  // transtypage vers `text[]` ne relit pas `["a","b"]`.
  if (Array.isArray(valeur)) {
    return `{${valeur
      .map((v) => (v === null ? "NULL" : `"${String(v).replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`))
      .join(",")}}`;
  }
  // Un objet vient d'une colonne `jsonb` : il repart en texte, le transtypage
  // le relit.
  if (valeur !== null && typeof valeur === "object") return JSON.stringify(valeur, remplacer);
  return valeur;
}
