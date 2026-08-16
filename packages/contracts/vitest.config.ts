import { defineConfig } from "vitest/config";

/** Tests unitaires. Les tests d'intégration relèvent de `pnpm test:int`. */
export default defineConfig({
  test: {
    include: ["src/**/*.{test,spec}.ts"],
    exclude: ["**/node_modules/**", "**/*.int.test.ts"],
  },
});
