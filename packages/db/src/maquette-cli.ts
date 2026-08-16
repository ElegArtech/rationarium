import { creerClient } from "./index.js";
import { peuplerMaquette } from "./maquette.js";

/**
 * Le jeu de données des maquettes, en ligne de commande.
 *
 *     DATABASE_URL=… node dist/maquette-cli.js [login]
 *
 * Il alimente l'instance de démonstration et **l'instance que mesure
 * `scripts/ui-conformite.mjs`**. C'est sa raison d'être : un état que la
 * maquette dessine mais qu'aucune donnée ne porte rend la classe inerte et le
 * libellé absent — la vue paraît incomplète alors que c'est le jeu de données
 * qui l'est.
 *
 * Il était jusqu'ici exporté sans jamais être appelé : il ne s'appliquait qu'à
 * la main, donc pas deux fois de la même façon. **Un jeu de données sans point
 * d'entrée n'est pas reproductible**, et c'est exactement ce qu'on lui demande.
 *
 * L'opération est idempotente : les identifiants sont stables, tout passe par
 * `upsert`. La rejouer sur une base déjà peuplée la remet à l'état attendu
 * sans rien dupliquer.
 */

const url = process.env["DATABASE_URL"];
const compte = process.argv[2] ?? "admin";

if (!url) {
  console.error("DATABASE_URL manquante.");
  process.exit(2);
}

const prisma = creerClient(url);
try {
  const compte_rendu = await peuplerMaquette(prisma, compte);
  for (const [quoi, combien] of Object.entries(compte_rendu)) {
    console.log(`${String(combien).padStart(6)}  ${quoi}`);
  }
  console.log(`\njeu des maquettes appliqué sur le compte « ${compte} »`);
} finally {
  await prisma.$disconnect();
}
