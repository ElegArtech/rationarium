import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

/**
 * `RG-AST-20` — en mode relais, le serveur n'émet aucun appel réseau sortant
 * pour le module. Le modèle de langage tourne sur le poste de l'utilisateur ;
 * le serveur ne fait que ranger, servir et exécuter par ses propres routes.
 *
 * Le contrôle est statique : aucun fichier du module n'importe un client
 * réseau, ni n'appelle `fetch`. `fastify.inject` reste permis, puisqu'il
 * s'exécute dans le processus sans ouvrir de connexion.
 */

const DOSSIER = import.meta.dirname;
const INTERDITS = [
  /from\s+["'](node:)?(http|https|net|tls|dgram|undici)["']/,
  /\bfetch\s*\(/,
  /from\s+["'](axios|got|node-fetch|ky|@anthropic-ai\/[^"']+|openai)["']/,
];

const sources = readdirSync(DOSSIER).filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"));

describe("RG-AST-20 — aucun appel réseau sortant", () => {
  it("le contrôle porte bien sur les sources du module", () => {
    expect(sources.length).toBeGreaterThanOrEqual(8);
  });

  it("RG-AST-20 — aucun fichier du module n'importe un client réseau ni n'appelle fetch", () => {
    const fautifs = sources.filter((f) => {
      const texte = readFileSync(path.join(DOSSIER, f), "utf8");
      return INTERDITS.some((motif) => motif.test(texte));
    });
    expect(fautifs).toEqual([]);
  });
});
