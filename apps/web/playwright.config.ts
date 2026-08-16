import { defineConfig, devices } from "@playwright/test";

/**
 * Trois projets, trois natures de contrôle.
 *
 *   a11y — axe-core, exécutable dès la vague 0 sur les maquettes gelées,
 *          puis sur l'application. C'est le seul des trois qui n'attend rien.
 *   e2e  — parcours de bout en bout : exige l'application (à partir de L-05).
 *   perf — budgets de cadrage/01 § 7. À partir de ADR-0015, la mesure porte
 *          sur la REQUÊTE agrégée, pas sur la peinture.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  reporter: [["list"]],
  use: {
    ...devices["Desktop Chrome"],
    viewport: { width: 1600, height: 1000 },
    baseURL: "http://localhost:4173",
    /**
     * Le client suit la langue du navigateur quand aucune préférence n'est
     * mémorisée. Sans cette ligne, les tests s'exécutaient en anglais — ce que
     * le premier lancement a révélé, et qui est le comportement voulu, pas un
     * défaut. La fixer ici rend les attentes lisibles ; le bilinguisme se teste
     * en basculant explicitement.
     */
    locale: "fr-FR",
  },
  /**
   * L'application est servie par Vite pour les tests qui l'exercent.
   * Les contrôles a11y de la vague 0 portent sur les maquettes gelées, lues
   * depuis le disque : ils n'ont pas besoin du serveur, mais le partager ne
   * leur coûte rien.
   */
  webServer: {
    command: "pnpm dev --port 4173 --strictPort",
    url: "http://localhost:4173",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [
    { name: "a11y", testMatch: /.*\.a11y\.spec\.ts/ },
    { name: "e2e", testMatch: /.*\.e2e\.spec\.ts/ },
    { name: "perf", testMatch: /.*\.perf\.spec\.ts/ },
  ],
});
