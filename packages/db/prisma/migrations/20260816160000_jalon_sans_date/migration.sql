-- Jalon sans date d'échéance.
--
-- MOTIF. `cadrage/02`, vue 13, décrit explicitement l'état « Aucune date » et
-- l'aide de saisie « Facultative. Sans date, le jalon reste en fin de
-- chronologie. » Le modèle initial déclarait la colonne obligatoire : un état
-- prévu par la spécification était inatteignable.
--
-- RÉVERSIBILITÉ. Le retour arrière est possible tant qu'aucun jalon sans date
-- n'existe ; il est écrit ci-dessous en commentaire plutôt qu'exécuté, parce
-- qu'un retour arrière qui détruirait des lignes doit être une décision, pas
-- un automatisme.
--
--   UPDATE milestones SET "dateEcheance" = CURRENT_DATE WHERE "dateEcheance" IS NULL;
--   ALTER TABLE "milestones" ALTER COLUMN "dateEcheance" SET NOT NULL;

ALTER TABLE "milestones" ALTER COLUMN "dateEcheance" DROP NOT NULL;

-- L'index existant reste utile : PostgreSQL indexe les NULL en B-tree, et le
-- tri de la feuille de route s'appuie dessus. On lui adjoint l'ordre effectif
-- du tri, pour que « les jalons sans date en dernier » ne coûte pas un tri
-- complet sur un projet chargé.
DROP INDEX IF EXISTS "milestones_dateEcheance_idx";
CREATE INDEX "milestones_dateEcheance_idx"
  ON "milestones" ("projectId", "dateEcheance" ASC NULLS LAST);
