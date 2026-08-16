import { creerClient } from "./index.js";
import { exporterTout } from "./reversibilite.js";

/**
 * C14 — l'export de réversibilité, en ligne de commande.
 *
 *     DATABASE_URL=… node dist/reversibilite-cli.js /var/exports/trame-2027-01
 *
 * Un outil d'exploitant, pas un point d'entrée HTTP. Motif : l'export porte sur
 * **toute** la base, sans périmètre organisationnel ni filtre de
 * confidentialité — ce que le catalogue des 24 domaines de permissions de
 * `cadrage/01 § 3.2` ne sait pas exprimer, et il ne se complète pas par
 * initiative. Le rendre accessible en HTTP demanderait d'inventer une
 * permission ; le laisser à l'exploitant, qui a déjà accès à la base, n'ajoute
 * aucun droit à personne.
 *
 * Voir `docs/audits/L-29-exploitation.md § 5` pour la question laissée ouverte.
 */

const dossier = process.argv[2];
const url = process.env["DATABASE_URL"];

if (!dossier) {
  console.error("emploi : node dist/reversibilite-cli.js <dossier de destination>");
  process.exit(2);
}
if (!url) {
  console.error("DATABASE_URL manquante.");
  process.exit(2);
}

const prisma = creerClient(url);
try {
  const manifeste = await exporterTout(prisma, dossier, new Date().toISOString());
  const total = manifeste.tables.reduce((n, t) => n + t.lignes, 0);
  for (const table of manifeste.tables) {
    console.log(`${String(table.lignes).padStart(9)}  ${table.table}`);
  }
  console.log(`\n${manifeste.tables.length} tables, ${total} ligne(s) → ${dossier}`);
  console.log(`schéma : ${manifeste.schema ?? "inconnu"}`);
} finally {
  await prisma.$disconnect();
}
