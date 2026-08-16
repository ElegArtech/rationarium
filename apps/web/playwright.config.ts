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
   * L'application est servie **construite**, pas en développement.
   *
   * Le serveur de développement transforme les modules à la demande. Sous onze
   * ouvriers en parallèle et à froid, les dernières vues chargées dépassaient
   * cinq secondes et quatre tests tombaient — de façon parfaitement
   * reproductible, mais seulement au premier lancement après un redémarrage.
   * Un échec qui n'arrive qu'une fois sur trois est pire qu'un échec franc :
   * il apprend à relancer plutôt qu'à chercher.
   *
   * Servir le lot de construction supprime la classe entière du problème, et
   * teste au passage l'artefact que les utilisateurs recevront — pas une
   * version transformée à la volée.
   */
  webServer: {
    command: "pnpm build && pnpm exec vite preview --port 4173 --strictPort",
    url: "http://localhost:4173",
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
  projects: [
    { name: "a11y", testMatch: /.*\.a11y\.spec\.ts/ },
    { name: "e2e", testMatch: /.*\.e2e\.spec\.ts/ },
    { name: "perf", testMatch: /.*\.perf\.spec\.ts/ },
  ],
});
