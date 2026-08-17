-- CreateEnum
CREATE TYPE "NatureClient" AS ENUM ('internal', 'external');

-- AlterTable
ALTER TABLE "clients" ADD COLUMN     "nature" "NatureClient" NOT NULL DEFAULT 'internal';

-- AlterTable
ALTER TABLE "project_third_parties" ADD COLUMN     "role" TEXT;

-- AlterTable
ALTER TABLE "third_parties" ADD COLUMN     "adresse" TEXT;

-- AlterTable
ALTER TABLE "time_entries" ADD COLUMN     "creeParId" UUID;

-- AddForeignKey
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_creeParId_fkey" FOREIGN KEY ("creeParId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
