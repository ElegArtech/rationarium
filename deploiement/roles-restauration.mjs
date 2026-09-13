import { readFileSync } from "node:fs";
const litteral = (s) => "'" + s.replaceAll("'", "''") + "'";
// pg_dumpall crée les rôles avant de les configurer. Le propriétaire de la base
// existe déjà sur la cible ; seules les créations en double sont tolérées.
const sql = readFileSync(0, "utf8").replace(/^CREATE ROLE .+;$/gm, (commande) =>
  "DO " + litteral("BEGIN EXECUTE " + litteral(commande) + "; EXCEPTION WHEN duplicate_object THEN NULL; END") + ";"
);
process.stdout.write(sql);
