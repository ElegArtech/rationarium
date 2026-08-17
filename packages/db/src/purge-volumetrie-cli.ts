import { creerClient } from "./index.js";

/**
 * Retire le jeu de VOLUMÉTRIE d'une instance, sans toucher au reste.
 *
 *     DATABASE_URL=… node dist/purge-volumetrie-cli.js
 *
 * ## Pourquoi cette commande existe
 *
 * Les deux jeux ont longtemps cohabité dans la même base, et cela rendait la
 * conformité de rendu **fausse** — pas approximative : fausse.
 *
 * La synthèse « hors présentiel » de la vue 07 passe en alerte à 40 %. Avec
 * les cinq agents du jeu de maquette, quatre absents font 80 %. Avec les 125
 * personnes de la volumétrie par-dessus, les mêmes quatre absents font 3 %, et
 * l'état `is-high` que la maquette dessine devient **statistiquement
 * inatteignable**. Deux agents ont fait le même constat, séparément, sur les
 * vues 07 et 30 : le classement par criticité de la vue 30 ne remonte plus que
 * des projets de volumétrie, tous critiques et sans icône.
 *
 * Une boucle qu'on ne peut pas satisfaire cesse d'être lue. C'est le motif.
 *
 * ## Pourquoi c'est sans danger
 *
 * La boucle de performance ne lit pas cette base : `budgets.int.test.ts` sème
 * sa propre volumétrie dans son propre conteneur. Rien d'autre n'en dépend.
 *
 * L'opération est **réversible** : `peupler()` la reconstruit à l'identique.
 *
 * ## Comment les deux jeux se distinguent
 *
 * Par construction, et non par heuristique. La volumétrie engendre ses
 * identifiants par `uuidDe(prefixe, i)` avec neuf préfixes connus ; le jeu des
 * maquettes par `idStable(lettre, n)`, dont le premier bloc finit toujours par
 * `0a`. Les deux familles ne peuvent pas se confondre.
 */

/** Les neuf préfixes de `volumetrie.ts`, tels que `uuidDe` les pose. */
const PREFIXES = ["0c", "a1", "a2", "a3", "b1", "c1", "d1", "e1", "f1"].map(
  (p) => `${p.padStart(8, "0")}-%`,
);

const url = process.env["DATABASE_URL"];
if (!url) {
  console.error("DATABASE_URL manquante.");
  process.exit(2);
}

const prisma = creerClient(url);

/*
 * L'ordre suit les dépendances : ce qui référence disparaît avant ce qui est
 * référencé. Les cascades du schéma emportent le reste — assignations, congés,
 * télétravail, saisies, participations.
 */
const TABLES = [
  "time_entries",
  "predefined_task_assignments",
  "task_assignees",
  "task_dependencies",
  "subtasks",
  "tasks",
  "milestones",
  "project_members",
  "project_clients",
  "project_third_parties",
  "project_snapshots",
  "projects",
  "user_services",
  "leaves",
  "telework",
  "event_participants",
  "users",
  "services",
  "departements",
  "directions",
  "clients",
  "third_parties",
  // Les compétences de volumétrie s'appellent « Compétence 1 »… et n'ont
  // aucun détenteur : la matrice de la vue 22 n'y montre que des écarts.
  "user_skills",
  "skills",
];

try {
  /*
   * Une saisie de temps exige un rattachement — projet OU tâche
   * (`time_entries_rattachement_requis`). Supprimer un projet met son
   * `projectId` à `NULL` par cascade, ce qui laisse la ligne sans aucun
   * rattachement : la base refuse, et la suppression du projet échoue.
   *
   * Le garde-fou fait exactement son travail. C'est donc à la commande de
   * DÉLIER avant de supprimer, en retirant d'abord les saisies qui ne
   * tiennent qu'à ce que l'on efface.
   */
  const deliees = await prisma.$executeRawUnsafe(`
    DELETE FROM "time_entries"
     WHERE ("projectId" IS NOT NULL AND "projectId"::text LIKE '000000c1-%')
        OR ("taskId" IS NOT NULL AND "taskId"::text LIKE '000000e1-%')
  `);
  if (deliees > 0) console.log(`${String(deliees).padStart(8)}  time_entries (déliées)`);

  let total = deliees;
  for (const table of TABLES) {
    const colonne = table === "users" || table === "projects" ? "id" : "id";
    let supprimees = 0;
    for (const motif of PREFIXES) {
      try {
        supprimees += await prisma.$executeRawUnsafe(
          `DELETE FROM "${table}" WHERE "${colonne}"::text LIKE $1`,
          motif,
        );
      } catch {
        /*
         * Ce préfixe-là ne passe pas — clé composite, ou dépendance qu'une
         * table plus haut n'a pas encore libérée. On passe au suivant.
         *
         * `continue`, jamais `break` : un `break` sortait de la boucle des
         * préfixes au premier refus, et les 4 000 tâches de volumétrie
         * restaient en place pendant que la commande annonçait avoir purgé.
         * Une commande qui échoue à moitié en annonçant un succès est pire
         * que celle qui échoue franchement.
         */
        continue;
      }
    }
    if (supprimees > 0) {
      console.log(`${String(supprimees).padStart(8)}  ${table}`);
      total += supprimees;
    }
  }
  console.log(`\n${total} ligne(s) de volumétrie retirée(s).`);
  console.log("Réversible : `peupler()` la reconstruit à l'identique.");
} finally {
  await prisma.$disconnect();
}
