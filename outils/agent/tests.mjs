/* global URL */
/**
 * Point d'entrée de `node --test outils/agent/`.
 *
 * Node.js 24 ne parcourt pas un dossier passé à `--test` : il le résout comme
 * un module, par le champ `main` du `package.json`. Ce fichier charge donc
 * chaque `*.test.mjs` du dossier. `node --test 'outils/agent/*.test.mjs'`
 * donne le même résultat, un fichier par processus.
 */
import { readdirSync } from "node:fs";

const ici = new URL(".", import.meta.url);
for (const nom of readdirSync(ici).filter((n) => n.endsWith(".test.mjs")).sort()) {
  await import(new URL(nom, ici).href);
}
