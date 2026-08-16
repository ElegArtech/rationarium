/**
 * Discipline du CSS — garde-fou du design system (risque R8 de cadrage/03).
 *
 * La règle portante est la dernière : aucune couleur littérale hors
 * `socle.css`. C'est ce qui empêche mécaniquement la dérive du contrat de
 * style, celle où un composant réinvente une nuance au lieu d'employer un
 * jeton. Voir docs/design/DESIGN.md.
 */
export default {
  rules: {
    "color-no-invalid-hex": true,
    "no-duplicate-selectors": true,
    "declaration-block-no-duplicate-properties": [
      true,
      { ignore: ["consecutive-duplicates-with-different-values"] },
    ],
  },
  overrides: [
    {
      // Partout SAUF le socle : les couleurs passent par les jetons.
      files: ["apps/web/src/**/*.css"],
      ignoreFiles: ["apps/web/src/styles/socle.css"],
      rules: {
        "color-no-hex": [
          true,
          {
            message:
              "Couleur littérale interdite : employer un jeton de socle.css (voir docs/design/DESIGN.md).",
          },
        ],
        "color-named": [
          "never",
          {
            message:
              "Couleur nommée interdite : employer un jeton de socle.css (voir docs/design/DESIGN.md).",
          },
        ],
        "function-disallowed-list": [
          ["rgb", "rgba", "hsl", "hsla"],
          {
            message:
              "Fonction de couleur interdite hors socle.css : employer un jeton.",
          },
        ],
      },
    },
  ],
};
