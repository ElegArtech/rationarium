import { defineConfig } from "vitest/config";

/**
 * Tests d'intégration : PostgreSQL réel via Testcontainers, jamais un simulacre.
 *
 * Motif, rappelé dans .claude/rules/tests.md : l'essentiel de l'intégrité de ce
 * produit est garanti par des contraintes de base — contraintes d'exclusion
 * GiST, index uniques composites, droits SQL révoqués sur le journal d'audit.
 * Un simulacre ne les exécute pas, donc ne les teste pas.
 */
export default defineConfig({
  test: {
    include: ["**/*.int.test.ts"],
    // Démarrer un conteneur coûte quelques secondes.
    testTimeout: 120_000,
    hookTimeout: 180_000,
    // Une seule instance : les conteneurs ne se partagent pas entre processus.
    pool: "forks",
    maxForks: 1,
    minForks: 1,
  },
});
