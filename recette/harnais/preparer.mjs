/**
 * Prépare la base modèle de la recette : migration, amorçage, second jeu,
 * instantané. Rejouable, et destructif pour la seule base modèle.
 *
 *     node recette/harnais/preparer.mjs [--aujourdhui 2027-03-15]
 */
import { preparerModele, BASE_MODELE, INSTANTANE } from "./pile.mjs";

const i = process.argv.indexOf("--aujourdhui");
const aujourdhui = i === -1 ? null : process.argv[i + 1];

const debut = Date.now();
await preparerModele({ aujourdhui });
console.log(
  `base modèle « ${BASE_MODELE} » prête en ${((Date.now() - debut) / 1000).toFixed(1)} s`,
);
console.log(`instantané : ${INSTANTANE}`);
