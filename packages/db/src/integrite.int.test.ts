import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { Client } from "pg";

/**
 * L-02 — les garde-fous d'intégrité mordent-ils vraiment ?
 *
 * `C15` impose que les règles de non-chevauchement et d'unicité soient
 * doublées en base. Ces tests ne vérifient pas que l'application les respecte —
 * ils vérifient que **la base les refuse**, même si l'application demandait le
 * contraire. C'est la différence entre une règle et une intention.
 *
 * Chaque test cite la règle qu'il couvre.
 */

const RACINE = path.resolve(import.meta.dirname, "..");

let pg: StartedPostgreSqlContainer;
let db: Client;

/** Identifiants engendrés à la volée : chaque test travaille sur ses données. */
const uuid = () => crypto.randomUUID();

async function poserUnAgent(): Promise<string> {
  const id = uuid();
  await db.query(
    `INSERT INTO users (id, login, email, "motDePasseHash", prenom, nom, "modifieLe")
     VALUES ($1, $2, $3, 'x', 'Agent', 'Témoin', now())`,
    [id, `login-${id.slice(0, 8)}`, `${id.slice(0, 8)}@test.local`],
  );
  return id;
}

async function poserUnTypeDeConge(): Promise<string> {
  const id = uuid();
  await db.query(
    `INSERT INTO leave_types (id, code, nom, "modifieLe") VALUES ($1, $2, 'Congé annuel', now())`,
    [id, `CA-${id.slice(0, 8)}`],
  );
  return id;
}

async function poserUnConge(
  userId: string,
  typeId: string,
  debut: string,
  fin: string,
  statut = "pending",
) {
  return db.query(
    `INSERT INTO leaves (id, "userId", "typeId", "dateDebut", "dateFin", "joursOuvres", statut, "modifieLe")
     VALUES ($1, $2, $3, $4, $5, 1, $6, now())`,
    [uuid(), userId, typeId, debut, fin, statut],
  );
}

beforeAll(async () => {
  pg = await new PostgreSqlContainer("postgres:18-alpine").start();
  execFileSync(
    "pnpm",
    ["exec", "prisma", "migrate", "deploy"],
    { cwd: RACINE, env: { ...process.env, DATABASE_URL: pg.getConnectionUri() }, stdio: "pipe" },
  );
  db = new Client({ connectionString: pg.getConnectionUri() });
  await db.connect();
});

afterAll(async () => {
  await db?.end();
  await pg?.stop();
});

describe("C15 — chevauchement de congés gardé par la base", () => {
  it("RG-CNG-25 — refuse un congé chevauchant un congé approuvé du même agent", async () => {
    const agent = await poserUnAgent();
    const type = await poserUnTypeDeConge();
    await poserUnConge(agent, type, "2026-09-01", "2026-09-10", "approved");

    await expect(
      poserUnConge(agent, type, "2026-09-05", "2026-09-15", "pending"),
    ).rejects.toThrow(/leaves_pas_de_chevauchement/);
  });

  it("RG-CNG-26 — refuse un congé chevauchant une demande en attente", async () => {
    const agent = await poserUnAgent();
    const type = await poserUnTypeDeConge();
    await poserUnConge(agent, type, "2026-10-01", "2026-10-05", "pending");

    await expect(poserUnConge(agent, type, "2026-10-05", "2026-10-08")).rejects.toThrow(
      /leaves_pas_de_chevauchement/,
    );
  });

  it("la contrainte est bornée à l'agent : deux agents peuvent partir aux mêmes dates", async () => {
    const a = await poserUnAgent();
    const b = await poserUnAgent();
    const type = await poserUnTypeDeConge();
    await poserUnConge(a, type, "2026-11-01", "2026-11-10", "approved");
    await expect(poserUnConge(b, type, "2026-11-01", "2026-11-10", "approved")).resolves.toBeTruthy();
  });

  it("un congé refusé ou annulé ne bloque plus rien — la contrainte est filtrée sur le statut", async () => {
    const agent = await poserUnAgent();
    const type = await poserUnTypeDeConge();
    await poserUnConge(agent, type, "2026-12-01", "2026-12-10", "refused");
    await poserUnConge(agent, type, "2026-12-11", "2026-12-15", "cancelled");
    await expect(poserUnConge(agent, type, "2026-12-01", "2026-12-15", "pending")).resolves.toBeTruthy();
  });

  it("la borne haute est incluse : deux congés jointifs au jour près sont refusés s'ils se touchent", async () => {
    const agent = await poserUnAgent();
    const type = await poserUnTypeDeConge();
    await poserUnConge(agent, type, "2027-01-04", "2027-01-08", "approved");
    // Le 8 est le dernier jour d'absence : un congé qui commence le 8 chevauche.
    await expect(poserUnConge(agent, type, "2027-01-08", "2027-01-12")).rejects.toThrow(
      /leaves_pas_de_chevauchement/,
    );
    // Le 9 ne chevauche pas.
    await expect(poserUnConge(agent, type, "2027-01-09", "2027-01-12")).resolves.toBeTruthy();
  });
});

describe("RG-ADM-01 — journal d'audit inaltérable", () => {
  it("le rôle applicatif peut écrire et lire", async () => {
    await db.query("SET ROLE rationarium_app");
    await db.query(
      `INSERT INTO audit_log (action, "typeEntite", "entiteId") VALUES ('leave.approve', 'Leave', $1)`,
      [uuid()],
    );
    const { rows } = await db.query(`SELECT count(*)::int AS n FROM audit_log`);
    expect(rows[0].n).toBeGreaterThan(0);
    await db.query("RESET ROLE");
  });

  it("le rôle applicatif ne peut PAS modifier une trace", async () => {
    await db.query("SET ROLE rationarium_app");
    await expect(db.query(`UPDATE audit_log SET action = 'falsifie'`)).rejects.toThrow(
      /permission denied/i,
    );
    await db.query("RESET ROLE");
  });

  it("le rôle applicatif ne peut PAS supprimer une trace", async () => {
    await db.query("SET ROLE rationarium_app");
    await expect(db.query(`DELETE FROM audit_log`)).rejects.toThrow(/permission denied/i);
    await expect(db.query(`TRUNCATE audit_log`)).rejects.toThrow(/permission denied/i);
    await db.query("RESET ROLE");
  });

  it("la table est partitionnée, avec une partition par défaut qui empêche tout refus d'écriture", async () => {
    const { rows } = await db.query(
      `SELECT c.relname FROM pg_inherits i
       JOIN pg_class c ON c.oid = i.inhrelid
       JOIN pg_class p ON p.oid = i.inhparent
       WHERE p.relname = 'audit_log'`,
    );
    const noms = rows.map((r) => r.relname);
    expect(noms).toContain("audit_log_defaut");
    expect(noms.length).toBeGreaterThanOrEqual(4);
  });

  it("une partition créée après coup hérite de la révocation", async () => {
    await db.query(`SELECT creer_partition_audit('2028-06-15'::date)`);
    const { rows } = await db.query(
      `SELECT has_table_privilege('rationarium_app', 'audit_log_2028_06', 'UPDATE') AS peut`,
    );
    expect(rows[0].peut).toBe(false);
  });
});

describe("Cohérence des périodes — quatre règles, une même forme", () => {
  it("RG-PRJ-01 — refuse un projet dont la fin précède le début", async () => {
    await expect(
      db.query(
        `INSERT INTO projects (id, nom, "dateDebut", "dateFin", "modifieLe")
         VALUES ($1, 'Projet incohérent', '2026-06-01', '2026-05-01', now())`,
        [uuid()],
      ),
    ).rejects.toThrow(/projects_periode_coherente/);
  });

  it("RG-TSK-08 — refuse une tâche dont la fin précède le début", async () => {
    await expect(
      db.query(
        `INSERT INTO tasks (id, titre, "dateDebut", "dateFin", "modifieLe")
         VALUES ($1, 'Tâche incohérente', '2026-06-10', '2026-06-01', now())`,
        [uuid()],
      ),
    ).rejects.toThrow(/tasks_periode_coherente/);
  });

  it("RG-TSK-01 — mais une tâche sans dates est un cas nominal", async () => {
    await expect(
      db.query(`INSERT INTO tasks (id, titre, "modifieLe") VALUES ($1, 'Tâche hors projet', now())`, [
        uuid(),
      ]),
    ).resolves.toBeTruthy();
  });
});

describe("Unicités métier", () => {
  it("RG-TLT-01 — un seul enregistrement de télétravail par agent et par date", async () => {
    const agent = await poserUnAgent();
    const poser = () =>
      db.query(
        `INSERT INTO telework (id, "userId", date, etat, "modifieLe") VALUES ($1, $2, '2026-09-14', 'telework', now())`,
        [uuid(), agent],
      );
    await expect(poser()).resolves.toBeTruthy();
    await expect(poser()).rejects.toThrow(/telework_userId_date_key|duplicate key/);
  });

  it("RG-ACT-01 — une assignation est unique pour agent × tâche × date × période", async () => {
    const agent = await poserUnAgent();
    const tache = uuid();
    await db.query(
      `INSERT INTO predefined_tasks (id, nom, "modifieLe") VALUES ($1, $2, now())`,
      [tache, `Permanence ${tache.slice(0, 6)}`],
    );
    const poser = () =>
      db.query(
        `INSERT INTO predefined_task_assignments (id, "predefinedTaskId", "userId", date, periode, "modifieLe")
         VALUES ($1, $2, $3, '2026-09-14', 'morning', now())`,
        [uuid(), tache, agent],
      );
    await expect(poser()).resolves.toBeTruthy();
    await expect(poser()).rejects.toThrow(/duplicate key/);
  });

  it("RG-TSK-04 — une tâche ne peut pas dépendre d'elle-même", async () => {
    const t = uuid();
    await db.query(`INSERT INTO tasks (id, titre, "modifieLe") VALUES ($1, 'T', now())`, [t]);
    await expect(
      db.query(`INSERT INTO task_dependencies ("taskId", "prerequisId") VALUES ($1, $1)`, [t]),
    ).rejects.toThrow(/task_dependencies_pas_de_boucle/);
  });
});

describe("Contraintes de forme métier", () => {
  it("RG-TMP-01 — une saisie de temps référence au minimum une tâche ou un projet", async () => {
    const agent = await poserUnAgent();
    await expect(
      db.query(
        `INSERT INTO time_entries (id, "userId", date, heures) VALUES ($1, $2, '2026-09-14', 3)`,
        [uuid(), agent],
      ),
    ).rejects.toThrow(/time_entries_rattachement_requis/);
  });

  it("RG-TMP-03 — un acteur et un seul : l'agent ou le tiers, jamais les deux", async () => {
    const agent = await poserUnAgent();
    const tiers = uuid();
    await db.query(
      `INSERT INTO third_parties (id, type, "modifieLe") VALUES ($1, 'individual', now())`,
      [tiers],
    );
    const projet = uuid();
    await db.query(
      `INSERT INTO projects (id, nom, "dateDebut", "dateFin", "modifieLe")
       VALUES ($1, $2, '2026-01-01', '2026-12-31', now())`,
      [projet, `P-${projet.slice(0, 6)}`],
    );
    await expect(
      db.query(
        `INSERT INTO time_entries (id, "userId", "thirdPartyId", "projectId", date, heures)
         VALUES ($1, $2, $3, $4, '2026-09-14', 3)`,
        [uuid(), agent, tiers, projet],
      ),
    ).rejects.toThrow(/time_entries_acteur_unique/);
  });

  it("RG-ACT-02 — une tâche prédéfinie « créneau horaire » exige ses horaires", async () => {
    await expect(
      db.query(
        `INSERT INTO predefined_tasks (id, nom, "dureeParDefaut", "modifieLe")
         VALUES ($1, $2, 'time_slot', now())`,
        [uuid(), `Astreinte ${Date.now()}`],
      ),
    ).rejects.toThrow(/predefined_tasks_creneau_horaire/);
  });

  it("RG-TRS-01 — une personne morale ne porte pas de contact nommé", async () => {
    await expect(
      db.query(
        `INSERT INTO third_parties (id, type, organisation, "contactNom", "modifieLe")
         VALUES ($1, 'organisation', 'Société X', 'Jean Dupont', now())`,
        [uuid()],
      ),
    ).rejects.toThrow(/third_parties_contact_selon_type/);
  });

  it("RG-CMP-01 — l'effectif requis d'une compétence est strictement positif", async () => {
    await expect(
      db.query(
        `INSERT INTO skills (id, nom, categorie, "effectifRequis", "modifieLe")
         VALUES ($1, $2, 'technical', 0, now())`,
        [uuid(), `Compétence ${Date.now()}`],
      ),
    ).rejects.toThrow(/skills_effectif_requis_positif/);
  });

  it("l'avancement d'une tâche reste borné entre 0 et 100", async () => {
    await expect(
      db.query(`INSERT INTO tasks (id, titre, avancement, "modifieLe") VALUES ($1, 'T', 150, now())`, [
        uuid(),
      ]),
    ).rejects.toThrow(/tasks_avancement_borne/);
  });
});

describe("Recherche globale — D7, pg_trgm plutôt qu'un moteur dédié", () => {
  it("les index trigrammes existent sur ce qui se cherche", async () => {
    const { rows } = await db.query(
      `SELECT indexname FROM pg_indexes WHERE indexname LIKE '%_trgm'`,
    );
    const noms = rows.map((r) => r.indexname);
    expect(noms).toEqual(
      expect.arrayContaining(["projects_nom_trgm", "tasks_titre_trgm", "users_nom_trgm"]),
    );
  });
});
