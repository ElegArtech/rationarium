import js from "@eslint/js";
import tseslint from "typescript-eslint";

/**
 * Configuration ESLint du dépôt.
 *
 * Les règles typées (`recommendedTypeChecked`) sont conditionnées à un risque
 * de compatibilité : typescript-eslint 8.67.0 déclare `typescript >=4.8.4 <6.1.0`,
 * or le socle retenait TypeScript 7.0.2.
 */
export default tseslint.config(
  {
    ignores: [
      "**/dist/**",
      "**/node_modules/**",
      "**/.turbo/**",
      "packages/db/src/generated/**",
      "mockups/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.ts", "**/*.tsx"],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // Interdits structurels du harnais.
      "no-restricted-syntax": [
        "error",
        {
          selector: "TSEnumDeclaration",
          message:
            "Les vocabulaires sont définis une seule fois dans @rationarium/contracts (docs/reference-fonctionnelle.md § 4.1). Pas d'énumération locale.",
        },
      ],
    },
  },
);
