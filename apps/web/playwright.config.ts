import { defineConfig, devices } from "@playwright/test";

/**
 * Deux projets, deux natures de contrôle.
 *
 *   a11y — axe-core sur les maquettes gelées puis sur l'application, plus les
 *          parcours clavier qu'aucune analyse statique ne voit (L-25).
 *   e2e  — parcours de bout en bout : exige l'application (à partir de L-05).
 *
 * Il n'y a **pas** de projet `perf`. `ADR-0015` a établi que le budget de
 * `cadrage/01 § 7` se dépense côté serveur, dans l'agrégat de `RG-PLN-01` : la
 * mesure vit dans `apps/api/src/perf`, sur PostgreSQL réel à la volumétrie
 * cible. La placer ici aurait mesuré la peinture, qu'`ADR-0015` a déjà
 * démontrée non problématique — 52 ms pour 500 ressources sur 31 jours.
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
   *
   * **`reuseExistingServer` est faux, y compris hors intégration continue.**
   * Il valait `!process.env.CI`, et un aperçu resté vivant d'un lancement
   * précédent servait alors un lot **périmé** : la suite tombait sur du code
   * qui n'existait plus, et l'échec ressemblait à un défaut de test. Le coût
   * d'une reconstruction est de quelques secondes ; celui d'un faux échec est
   * une demi-heure de recherche au mauvais endroit.
   */
  webServer: {
    command: "pnpm build && pnpm exec vite preview --port 4173 --strictPort",
    url: "http://localhost:4173",
    reuseExistingServer: false,
    timeout: 180_000,
  },
  projects: [
    { name: "a11y", testMatch: /.*\.a11y\.spec\.ts/ },
    { name: "e2e", testMatch: /.*\.e2e\.spec\.ts/ },
  ],
});
