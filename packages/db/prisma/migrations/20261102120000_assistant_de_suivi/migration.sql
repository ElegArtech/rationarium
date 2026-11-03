-- M22 — assistant de suivi (`docs/assistant/SPEC-PHASE-1.md`, lot L-A1).
--
-- PORTÉE. Quatre tables neuves et trois énumérations. Aucune table existante
-- n'est modifiée : les relations ajoutées au schéma ne portent leurs clés que
-- du côté des nouvelles tables.
--
-- INTÉGRITÉ EN BASE (C15). `RG-AST-15` — un propriétaire n'a qu'un passage
-- actif à la fois. Le service le vérifie et rend le refus métier ; l'index
-- unique partiel en fin de fichier garantit qu'aucune concurrence ne le
-- contourne.
--
-- DROITS. Les droits par défaut posés par `20261008090000_role_applicatif_restreint`
-- donnent à `rationarium_app` la lecture et l'écriture de ces tables.
--
-- RÉVERSIBILITÉ. Le retour arrière supprime les tables du module, puis ses
-- énumérations, dans cet ordre :
--
--   DROP TABLE "agent_actions", "agent_passages", "projet_suivis", "agent_jetons";
--   DROP TYPE "EtatActionAgent", "EtatPassage", "DeclenchementPassage";
--
-- Le reste de la base n'en dépend pas : aucune donnée métier n'est perdue.

-- CreateEnum
CREATE TYPE "DeclenchementPassage" AS ENUM ('planifie', 'manuel');

-- CreateEnum
CREATE TYPE "EtatPassage" AS ENUM ('en_attente', 'prise', 'en_cours', 'terminee', 'echec', 'interrompue', 'annulee');

-- CreateEnum
CREATE TYPE "EtatActionAgent" AS ENUM ('effectuee', 'refusee', 'defaite');

-- CreateTable
CREATE TABLE "agent_jetons" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "libelle" TEXT NOT NULL,
    "empreinte" TEXT NOT NULL,
    "typesAutorises" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "expireLe" TIMESTAMP(3) NOT NULL,
    "dernierUsage" TIMESTAMP(3),
    "revoqueLe" TIMESTAMP(3),
    "creeLe" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_jetons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "projet_suivis" (
    "id" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "consigne" TEXT,
    "sources" JSONB NOT NULL DEFAULT '[]',
    "silenceJours" INTEGER,
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "creeLe" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "modifieLe" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "projet_suivis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_passages" (
    "id" UUID NOT NULL,
    "proprietaireId" UUID NOT NULL,
    "declenchement" "DeclenchementPassage" NOT NULL,
    "demandeurId" UUID,
    "projectIds" UUID[] DEFAULT ARRAY[]::UUID[],
    "etat" "EtatPassage" NOT NULL DEFAULT 'en_attente',
    "jetonId" UUID,
    "progression" TEXT,
    "signeDeVie" TIMESTAMP(3),
    "priseLe" TIMESTAMP(3),
    "finLe" TIMESTAMP(3),
    "bilan" JSONB,
    "erreur" TEXT,
    "creeLe" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_passages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_actions" (
    "id" UUID NOT NULL,
    "passageId" UUID NOT NULL,
    "jetonId" UUID,
    "proprietaireId" UUID NOT NULL,
    "projectId" UUID,
    "type" TEXT NOT NULL,
    "reference" TEXT,
    "cibleType" TEXT,
    "cibleId" UUID,
    "charge" JSONB NOT NULL,
    "avant" JSONB,
    "apres" JSONB,
    "versionApres" INTEGER,
    "justification" TEXT NOT NULL,
    "preuves" JSONB NOT NULL,
    "empreinte" TEXT NOT NULL,
    "etat" "EtatActionAgent" NOT NULL,
    "motifRefus" JSONB,
    "defaiteParId" UUID,
    "defaiteLe" TIMESTAMP(3),
    "creeLe" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_actions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "agent_jetons_empreinte_key" ON "agent_jetons"("empreinte");

-- CreateIndex
CREATE INDEX "agent_jetons_userId_idx" ON "agent_jetons"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "projet_suivis_projectId_key" ON "projet_suivis"("projectId");

-- CreateIndex
CREATE INDEX "agent_passages_proprietaireId_creeLe_idx" ON "agent_passages"("proprietaireId", "creeLe");

-- CreateIndex
CREATE INDEX "agent_passages_etat_idx" ON "agent_passages"("etat");

-- CreateIndex
CREATE INDEX "agent_actions_proprietaireId_creeLe_idx" ON "agent_actions"("proprietaireId", "creeLe");

-- CreateIndex
CREATE INDEX "agent_actions_projectId_creeLe_idx" ON "agent_actions"("projectId", "creeLe");

-- CreateIndex
CREATE INDEX "agent_actions_empreinte_idx" ON "agent_actions"("empreinte");

-- CreateIndex
CREATE INDEX "agent_actions_passageId_idx" ON "agent_actions"("passageId");

-- AddForeignKey
ALTER TABLE "agent_jetons" ADD CONSTRAINT "agent_jetons_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projet_suivis" ADD CONSTRAINT "projet_suivis_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_passages" ADD CONSTRAINT "agent_passages_proprietaireId_fkey" FOREIGN KEY ("proprietaireId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_passages" ADD CONSTRAINT "agent_passages_demandeurId_fkey" FOREIGN KEY ("demandeurId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_passages" ADD CONSTRAINT "agent_passages_jetonId_fkey" FOREIGN KEY ("jetonId") REFERENCES "agent_jetons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_actions" ADD CONSTRAINT "agent_actions_passageId_fkey" FOREIGN KEY ("passageId") REFERENCES "agent_passages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_actions" ADD CONSTRAINT "agent_actions_jetonId_fkey" FOREIGN KEY ("jetonId") REFERENCES "agent_jetons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_actions" ADD CONSTRAINT "agent_actions_proprietaireId_fkey" FOREIGN KEY ("proprietaireId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_actions" ADD CONSTRAINT "agent_actions_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_actions" ADD CONSTRAINT "agent_actions_defaiteParId_fkey" FOREIGN KEY ("defaiteParId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- RG-AST-15 — un seul passage actif par propriétaire.
CREATE UNIQUE INDEX "agent_passages_un_actif_par_proprietaire"
  ON "agent_passages"("proprietaireId")
  WHERE "etat" IN ('en_attente', 'prise', 'en_cours');
