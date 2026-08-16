import { defineConfig } from "vitest/config";

/**
 * Tests unitaires. Les parcours Playwright (`e2e/`) et les tests
 * d'intégration (`*.int.test.ts`) ont leurs propres commandes : ils ne
 * s'exécutent pas sous Vitest, et les laisser être ramassés ici rendrait la
 * boucle rapide rouge sans raison.
 */
export default defineConfig({
  test: {
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    exclude: ["**/node_modules/**", "e2e/**", "**/*.int.test.ts"],
  },
});
