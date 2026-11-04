-- M22, version 1.1.1 — la création d'un projet par l'agent attend la validation de son
-- propriétaire (`RG-AST-21`), et les actions qui en dépendent attendent avec elle (`RG-AST-22`).
--
-- PORTÉE. Deux valeurs d'état, trois colonnes et deux index sur `agent_actions`. Aucune autre
-- table n'est touchée ; les lignes existantes gardent leur état.
--
-- RÉVERSIBILITÉ. Le retour arrière retire les colonnes et les index :
--
--   ALTER TABLE "agent_actions" DROP COLUMN "dependDeId", DROP COLUMN "decideParId", DROP COLUMN "decideLe";
--
-- PostgreSQL ne retire pas une valeur d'énumération : `a_valider` et `rejetee` restent déclarées,
-- sans effet tant qu'aucune ligne ne les porte. Les lignes qui les portent se ramènent d'abord à
-- `refusee`.



ALTER TYPE "EtatActionAgent" ADD VALUE 'a_valider';
ALTER TYPE "EtatActionAgent" ADD VALUE 'rejetee';

-- AlterTable
ALTER TABLE "agent_actions" ADD COLUMN     "decideLe" TIMESTAMP(3),
ADD COLUMN     "decideParId" UUID,
ADD COLUMN     "dependDeId" UUID;

-- CreateIndex
CREATE INDEX "agent_actions_proprietaireId_etat_idx" ON "agent_actions"("proprietaireId", "etat");

-- CreateIndex
CREATE INDEX "agent_actions_dependDeId_idx" ON "agent_actions"("dependDeId");

-- AddForeignKey
ALTER TABLE "agent_actions" ADD CONSTRAINT "agent_actions_dependDeId_fkey" FOREIGN KEY ("dependDeId") REFERENCES "agent_actions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_actions" ADD CONSTRAINT "agent_actions_decideParId_fkey" FOREIGN KEY ("decideParId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

