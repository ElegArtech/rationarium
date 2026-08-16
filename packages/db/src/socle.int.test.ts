import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";

/**
 * Test de socle — vague 0.
 *
 * Il ne teste aucune règle de gestion : il n'y en a pas encore. Il prouve que
 * la boucle `pnpm test:int` est RÉELLE, c'est-à-dire qu'elle démarre un
 * PostgreSQL 18 véritable et y exécute du SQL.
 *
 * C'est le critère de sortie de la question 3 du gate pour cette boucle : une
 * boucle qui n'a jamais tourné n'est pas une boucle, c'est une intention.
 *
 * Il vérifie aussi les deux capacités de PostgreSQL dont dépend l'intégrité du
 * modèle (C15) : l'extension `btree_gist` et les contraintes d'exclusion.
 * Les découvrir absentes en vague 3 coûterait beaucoup plus cher qu'ici.
 */
describe("socle d'intégration", () => {
  let pg: StartedPostgreSqlContainer;

  beforeAll(async () => {
    pg = await new PostgreSqlContainer("postgres:18-alpine").start();
  });

  afterAll(async () => {
    await pg?.stop();
  });

  it("démarre un PostgreSQL 18 réel", async () => {
    const { Client } = await import("pg");
    const client = new Client({ connectionString: pg.getConnectionUri() });
    await client.connect();
    const { rows } = await client.query("SHOW server_version");
    await client.end();
    expect(rows[0].server_version).toMatch(/^18\./);
  });

  it("C15 — supporte les contraintes d'exclusion GiST sur daterange", async () => {
    const { Client } = await import("pg");
    const client = new Client({ connectionString: pg.getConnectionUri() });
    await client.connect();

    // C'est le garde-fou de RG-CNG-25..27 : deux congés du même agent ne
    // peuvent pas se chevaucher, et la base l'interdit sans sérialiser.
    await client.query("CREATE EXTENSION IF NOT EXISTS btree_gist");
    await client.query(`
      CREATE TABLE temoin_conges (
        id serial PRIMARY KEY,
        user_id int NOT NULL,
        periode daterange NOT NULL,
        EXCLUDE USING gist (user_id WITH =, periode WITH &&)
      )`);

    await client.query(
      "INSERT INTO temoin_conges (user_id, periode) VALUES (1, daterange('2026-09-01','2026-09-10'))",
    );

    // Chevauchement sur le même agent : refusé par la base.
    await expect(
      client.query(
        "INSERT INTO temoin_conges (user_id, periode) VALUES (1, daterange('2026-09-05','2026-09-15'))",
      ),
    ).rejects.toThrow(/exclusion constraint/i);

    // Même période, autre agent : accepté.
    await client.query(
      "INSERT INTO temoin_conges (user_id, periode) VALUES (2, daterange('2026-09-05','2026-09-15'))",
    );

    await client.end();
  });
});
