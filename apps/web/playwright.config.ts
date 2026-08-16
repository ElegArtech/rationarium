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
  },
  projects: [
    { name: "a11y", testMatch: /.*\.a11y\.spec\.ts/ },
    { name: "e2e", testMatch: /.*\.e2e\.spec\.ts/ },
    { name: "perf", testMatch: /.*\.perf\.spec\.ts/ },
  ],
});
