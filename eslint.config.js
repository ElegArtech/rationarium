import js from "@eslint/js";
import tseslint from "typescript-eslint";

/**
 * Configuration ESLint du dépôt.
 *
 * Les règles typées (`recommendedTypeChecked`) sont conditionnées au risque R1
 * de cadrage/03 : typescript-eslint 8.67.0 déclare `typescript >=4.8.4 <6.1.0`,
 * or le socle retenait TypeScript 7.0.2. Voir docs/adr/ADR-0014 pour le
 * verdict de la vérification et le repli appliqué.
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
      // Interdits structurels du harnais, voir CLAUDE.md.
      "no-restricted-syntax": [
        "error",
        {
          selector: "TSEnumDeclaration",
          message:
            "Les vocabulaires sont définis une seule fois dans @rationarium/contracts (cadrage/01 § 4.1). Pas d'énumération locale.",
        },
      ],
    },
  },
);
