-- CreateEnum
CREATE TYPE "StatutProjet" AS ENUM ('draft', 'active', 'paused', 'done', 'cancelled');

-- CreateEnum
CREATE TYPE "StatutTache" AS ENUM ('todo', 'doing', 'review', 'done', 'blocked');

-- CreateEnum
CREATE TYPE "StatutJalon" AS ENUM ('pending', 'doing', 'done');

-- CreateEnum
CREATE TYPE "Priorite" AS ENUM ('low', 'normal', 'high', 'critical');

-- CreateEnum
CREATE TYPE "RoleRaci" AS ENUM ('responsible', 'accountable', 'consulted', 'informed');

-- CreateEnum
CREATE TYPE "StatutConge" AS ENUM ('pending', 'approved', 'refused', 'cancelled', 'cancellation_requested');

-- CreateEnum
CREATE TYPE "DemiJournee" AS ENUM ('morning', 'afternoon');

-- CreateEnum
CREATE TYPE "PeriodeJournee" AS ENUM ('morning', 'afternoon', 'full_day');

-- CreateEnum
CREATE TYPE "EtatTeletravail" AS ENUM ('telework', 'office', 'undeclared');

-- CreateEnum
CREATE TYPE "TypeActivite" AS ENUM ('development', 'meeting', 'support', 'training', 'other');

-- CreateEnum
CREATE TYPE "CategorieCompetence" AS ENUM ('technical', 'methodology', 'soft_skill', 'business');

-- CreateEnum
CREATE TYPE "NiveauCompetence" AS ENUM ('beginner', 'intermediate', 'expert', 'master');

-- CreateEnum
CREATE TYPE "TypeTiers" AS ENUM ('individual', 'organisation');

-- CreateEnum
CREATE TYPE "DureeTachePredefinie" AS ENUM ('half_day', 'full_day', 'time_slot');

-- CreateTable
CREATE TABLE "directions" (
    "id" UUID NOT NULL,
    "nom" TEXT NOT NULL,
    "description" TEXT,
    "responsableId" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "creeLe" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "modifieLe" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "directions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "departements" (
    "id" UUID NOT NULL,
    "nom" TEXT NOT NULL,
    "description" TEXT,
    "directionId" UUID,
    "responsableId" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "creeLe" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "modifieLe" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "departements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "services" (
    "id" UUID NOT NULL,
    "nom" TEXT NOT NULL,
    "description" TEXT,
    "departementId" UUID NOT NULL,
    "managerId" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "creeLe" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "modifieLe" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "services_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "login" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "motDePasseHash" TEXT NOT NULL,
    "prenom" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "avatarFichier" TEXT,
    "avatarPredefini" TEXT,
    "langue" TEXT NOT NULL DEFAULT 'fr',
    "theme" TEXT NOT NULL DEFAULT 'auto',
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "motDePasseAChanger" BOOLEAN NOT NULL DEFAULT true,
    "derniereConnexion" TIMESTAMP(3),
    "echecsConnexion" INTEGER NOT NULL DEFAULT 0,
    "verrouilleJusqua" TIMESTAMP(3),
    "departementId" UUID,
    "roleId" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "creeLe" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "modifieLe" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_services" (
    "userId" UUID NOT NULL,
    "serviceId" UUID NOT NULL,

    CONSTRAINT "user_services_pkey" PRIMARY KEY ("userId","serviceId")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" UUID NOT NULL,
    "jetonHash" TEXT NOT NULL,
    "userId" UUID NOT NULL,
    "derniereActivite" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expireLe" TIMESTAMP(3) NOT NULL,
    "adresseIp" TEXT,
    "agentUtilisateur" TEXT,
    "creeLe" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "password_reset_tokens" (
    "id" UUID NOT NULL,
    "jetonHash" TEXT NOT NULL,
    "userId" UUID NOT NULL,
    "expireLe" TIMESTAMP(3) NOT NULL,
    "utiliseLe" TIMESTAMP(3),
    "creeLe" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "description" TEXT,
    "systeme" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "creeLe" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "modifieLe" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_permissions" (
    "roleId" UUID NOT NULL,
    "permission" TEXT NOT NULL,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("roleId","permission")
);

-- CreateTable
CREATE TABLE "projects" (
    "id" UUID NOT NULL,
    "nom" TEXT NOT NULL,
    "description" TEXT,
    "statut" "StatutProjet" NOT NULL DEFAULT 'draft',
    "priorite" "Priorite" NOT NULL DEFAULT 'normal',
    "dateDebut" DATE NOT NULL,
    "dateFin" DATE NOT NULL,
    "budgetHeures" DECIMAL(10,2),
    "icone" TEXT,
    "archive" BOOLEAN NOT NULL DEFAULT false,
    "chefId" UUID,
    "sponsorId" UUID,
    "createurId" UUID,
    "departementId" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "creeLe" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "modifieLe" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_members" (
    "projectId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "roleProjet" TEXT NOT NULL,
    "tauxAllocation" INTEGER,

    CONSTRAINT "project_members_pkey" PRIMARY KEY ("projectId","userId")
);

-- CreateTable
CREATE TABLE "project_snapshots" (
    "id" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "date" DATE NOT NULL,
    "progression" INTEGER NOT NULL,
    "tachesTotal" INTEGER NOT NULL,
    "tachesFinies" INTEGER NOT NULL,
    "heuresConsommees" DECIMAL(10,2) NOT NULL,

    CONSTRAINT "project_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "milestones" (
    "id" UUID NOT NULL,
    "nom" TEXT NOT NULL,
    "description" TEXT,
    "dateEcheance" DATE NOT NULL,
    "statut" "StatutJalon" NOT NULL DEFAULT 'pending',
    "projectId" UUID NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "creeLe" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "modifieLe" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "milestones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "epics" (
    "id" UUID NOT NULL,
    "nom" TEXT NOT NULL,
    "description" TEXT,
    "projectId" UUID NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "creeLe" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "modifieLe" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "epics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tasks" (
    "id" UUID NOT NULL,
    "titre" TEXT NOT NULL,
    "description" TEXT,
    "statut" "StatutTache" NOT NULL DEFAULT 'todo',
    "priorite" "Priorite" NOT NULL DEFAULT 'normal',
    "dateDebut" DATE,
    "dateFin" DATE,
    "heureDebut" TEXT,
    "heureFin" TEXT,
    "estimationHeures" DECIMAL(8,2),
    "avancement" INTEGER NOT NULL DEFAULT 0,
    "confidentielle" BOOLEAN NOT NULL DEFAULT false,
    "interventionExterieure" BOOLEAN NOT NULL DEFAULT false,
    "projectId" UUID,
    "milestoneId" UUID,
    "epicId" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "creeLe" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "modifieLe" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_assignees" (
    "taskId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "porteur" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "task_assignees_pkey" PRIMARY KEY ("taskId","userId")
);

-- CreateTable
CREATE TABLE "subtasks" (
    "id" UUID NOT NULL,
    "taskId" UUID NOT NULL,
    "libelle" TEXT NOT NULL,
    "fait" BOOLEAN NOT NULL DEFAULT false,
    "ordre" INTEGER NOT NULL,

    CONSTRAINT "subtasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_dependencies" (
    "taskId" UUID NOT NULL,
    "prerequisId" UUID NOT NULL,

    CONSTRAINT "task_dependencies_pkey" PRIMARY KEY ("taskId","prerequisId")
);

-- CreateTable
CREATE TABLE "task_raci" (
    "taskId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "role" "RoleRaci" NOT NULL,

    CONSTRAINT "task_raci_pkey" PRIMARY KEY ("taskId","userId","role")
);

-- CreateTable
CREATE TABLE "leave_types" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "description" TEXT,
    "icone" TEXT,
    "couleur" TEXT,
    "remunere" BOOLEAN NOT NULL DEFAULT true,
    "validationRequise" BOOLEAN NOT NULL DEFAULT true,
    "limiteAnnuelle" DECIMAL(5,1),
    "ordre" INTEGER NOT NULL DEFAULT 0,
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "systeme" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "creeLe" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "modifieLe" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "leave_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leaves" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "typeId" UUID NOT NULL,
    "dateDebut" DATE NOT NULL,
    "dateFin" DATE NOT NULL,
    "demiJourneeDebut" "DemiJournee",
    "demiJourneeFin" "DemiJournee",
    "joursOuvres" DECIMAL(5,1) NOT NULL,
    "statut" "StatutConge" NOT NULL DEFAULT 'pending',
    "motif" TEXT,
    "motifRefus" TEXT,
    "validateurId" UUID,
    "decideLe" TIMESTAMP(3),
    "autoValide" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "creeLe" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "modifieLe" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "leaves_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leave_year_allocations" (
    "leaveId" UUID NOT NULL,
    "annee" INTEGER NOT NULL,
    "jours" DECIMAL(5,1) NOT NULL,

    CONSTRAINT "leave_year_allocations_pkey" PRIMARY KEY ("leaveId","annee")
);

-- CreateTable
CREATE TABLE "leave_balances" (
    "id" UUID NOT NULL,
    "userId" UUID,
    "typeId" UUID NOT NULL,
    "annee" INTEGER NOT NULL,
    "joursAttribues" DECIMAL(5,1) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "creeLe" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "modifieLe" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "leave_balances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leave_delegations" (
    "id" UUID NOT NULL,
    "delegantId" UUID NOT NULL,
    "delegueId" UUID NOT NULL,
    "dateDebut" DATE NOT NULL,
    "dateFin" DATE NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "creeLe" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "modifieLe" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "leave_delegations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "telework" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "date" DATE NOT NULL,
    "etat" "EtatTeletravail" NOT NULL DEFAULT 'undeclared',
    "issuDeRegle" BOOLEAN NOT NULL DEFAULT false,
    "exception" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "creeLe" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "modifieLe" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "telework_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "telework_rules" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "jourSemaine" INTEGER NOT NULL,
    "dateDebut" DATE NOT NULL,
    "dateFin" DATE,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "creeLe" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "modifieLe" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "telework_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "predefined_tasks" (
    "id" UUID NOT NULL,
    "nom" TEXT NOT NULL,
    "description" TEXT,
    "couleur" TEXT,
    "icone" TEXT,
    "dureeParDefaut" "DureeTachePredefinie" NOT NULL DEFAULT 'full_day',
    "heureDebut" TEXT,
    "heureFin" TEXT,
    "teletravailAutorise" BOOLEAN NOT NULL DEFAULT true,
    "poids" INTEGER NOT NULL DEFAULT 1,
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "creeLe" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "modifieLe" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "predefined_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "predefined_task_assignments" (
    "id" UUID NOT NULL,
    "predefinedTaskId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "date" DATE NOT NULL,
    "periode" "PeriodeJournee" NOT NULL DEFAULT 'full_day',
    "realisee" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "creeLe" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "modifieLe" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "predefined_task_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "predefined_task_recurrences" (
    "id" UUID NOT NULL,
    "predefinedTaskId" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "frequence" INTEGER NOT NULL DEFAULT 1,
    "jourSemaine" INTEGER,
    "jourMois" INTEGER,
    "ordinal" INTEGER,
    "dateDebut" DATE NOT NULL,
    "dateFin" DATE,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "creeLe" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "modifieLe" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "predefined_task_recurrences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "events" (
    "id" UUID NOT NULL,
    "titre" TEXT NOT NULL,
    "description" TEXT,
    "date" DATE NOT NULL,
    "journeeEntiere" BOOLEAN NOT NULL DEFAULT false,
    "heureDebut" TEXT,
    "heureFin" TEXT,
    "interventionExterieure" BOOLEAN NOT NULL DEFAULT false,
    "projectId" UUID,
    "parentId" UUID,
    "recurrenceFrequence" INTEGER,
    "recurrenceJourSemaine" INTEGER,
    "recurrenceFin" DATE,
    "version" INTEGER NOT NULL DEFAULT 1,
    "creeLe" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "modifieLe" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_participants" (
    "eventId" UUID NOT NULL,
    "userId" UUID NOT NULL,

    CONSTRAINT "event_participants_pkey" PRIMARY KEY ("eventId","userId")
);

-- CreateTable
CREATE TABLE "time_entries" (
    "id" UUID NOT NULL,
    "userId" UUID,
    "thirdPartyId" UUID,
    "date" DATE NOT NULL,
    "heures" DECIMAL(5,2) NOT NULL,
    "typeActivite" "TypeActivite" NOT NULL DEFAULT 'development',
    "projectId" UUID,
    "taskId" UUID,
    "description" TEXT,
    "creeLe" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "time_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_time_waivers" (
    "taskId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "task_time_waivers_pkey" PRIMARY KEY ("taskId","userId")
);

-- CreateTable
CREATE TABLE "skills" (
    "id" UUID NOT NULL,
    "nom" TEXT NOT NULL,
    "categorie" "CategorieCompetence" NOT NULL,
    "description" TEXT,
    "effectifRequis" INTEGER NOT NULL DEFAULT 1,
    "version" INTEGER NOT NULL DEFAULT 1,
    "creeLe" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "modifieLe" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "skills_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_skills" (
    "userId" UUID NOT NULL,
    "skillId" UUID NOT NULL,
    "niveau" "NiveauCompetence" NOT NULL,

    CONSTRAINT "user_skills_pkey" PRIMARY KEY ("userId","skillId")
);

-- CreateTable
CREATE TABLE "third_parties" (
    "id" UUID NOT NULL,
    "type" "TypeTiers" NOT NULL,
    "organisation" TEXT,
    "contactNom" TEXT,
    "contactEmail" TEXT,
    "contactTelephone" TEXT,
    "notes" TEXT,
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "creeLe" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "modifieLe" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "third_parties_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_third_parties" (
    "projectId" UUID NOT NULL,
    "thirdPartyId" UUID NOT NULL,

    CONSTRAINT "project_third_parties_pkey" PRIMARY KEY ("projectId","thirdPartyId")
);

-- CreateTable
CREATE TABLE "task_third_parties" (
    "taskId" UUID NOT NULL,
    "thirdPartyId" UUID NOT NULL,

    CONSTRAINT "task_third_parties_pkey" PRIMARY KEY ("taskId","thirdPartyId")
);

-- CreateTable
CREATE TABLE "clients" (
    "id" UUID NOT NULL,
    "nom" TEXT NOT NULL,
    "contactNom" TEXT,
    "contactEmail" TEXT,
    "contactTelephone" TEXT,
    "adresse" TEXT,
    "notes" TEXT,
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "creeLe" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "modifieLe" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "clients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_clients" (
    "projectId" UUID NOT NULL,
    "clientId" UUID NOT NULL,

    CONSTRAINT "project_clients_pkey" PRIMARY KEY ("projectId","clientId")
);

-- CreateTable
CREATE TABLE "documents" (
    "id" UUID NOT NULL,
    "nom" TEXT NOT NULL,
    "empreinte" TEXT NOT NULL,
    "tailleOctets" INTEGER NOT NULL,
    "typeMime" TEXT NOT NULL,
    "auteurId" UUID,
    "projectId" UUID,
    "taskId" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "creeLe" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "modifieLe" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "comments" (
    "id" UUID NOT NULL,
    "contenu" TEXT NOT NULL,
    "auteurId" UUID,
    "projectId" UUID,
    "taskId" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "creeLe" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "modifieLe" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "todos" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "libelle" TEXT NOT NULL,
    "fait" BOOLEAN NOT NULL DEFAULT false,
    "ordre" INTEGER NOT NULL DEFAULT 0,
    "creeLe" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "modifieLe" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "todos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "holidays" (
    "id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "libelle" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'legal',
    "ouvre" BOOLEAN NOT NULL DEFAULT false,
    "recurrent" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "creeLe" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "modifieLe" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "holidays_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "school_vacations" (
    "id" UUID NOT NULL,
    "libelle" TEXT NOT NULL,
    "dateDebut" DATE NOT NULL,
    "dateFin" DATE NOT NULL,
    "zone" TEXT NOT NULL,
    "anneeScolaire" TEXT NOT NULL,
    "importee" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "creeLe" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "modifieLe" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "school_vacations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settings" (
    "cle" TEXT NOT NULL,
    "valeur" TEXT NOT NULL,
    "public" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "modifieLe" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "settings_pkey" PRIMARY KEY ("cle")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "titre" TEXT NOT NULL,
    "contenu" TEXT NOT NULL,
    "lien" TEXT,
    "lue" BOOLEAN NOT NULL DEFAULT false,
    "creeLe" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_log" (
    "id" UUID NOT NULL,
    "horodatage" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "action" TEXT NOT NULL,
    "typeEntite" TEXT NOT NULL,
    "entiteId" TEXT,
    "acteurId" UUID,
    "systeme" BOOLEAN NOT NULL DEFAULT false,
    "detail" JSONB,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id","horodatage")
);

-- CreateIndex
CREATE UNIQUE INDEX "directions_nom_key" ON "directions"("nom");

-- CreateIndex
CREATE INDEX "departements_directionId_idx" ON "departements"("directionId");

-- CreateIndex
CREATE UNIQUE INDEX "departements_nom_key" ON "departements"("nom");

-- CreateIndex
CREATE INDEX "services_departementId_idx" ON "services"("departementId");

-- CreateIndex
CREATE UNIQUE INDEX "services_departementId_nom_key" ON "services"("departementId", "nom");

-- CreateIndex
CREATE UNIQUE INDEX "users_login_key" ON "users"("login");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_departementId_idx" ON "users"("departementId");

-- CreateIndex
CREATE INDEX "users_roleId_idx" ON "users"("roleId");

-- CreateIndex
CREATE INDEX "users_actif_idx" ON "users"("actif");

-- CreateIndex
CREATE INDEX "user_services_serviceId_idx" ON "user_services"("serviceId");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_jetonHash_key" ON "sessions"("jetonHash");

-- CreateIndex
CREATE INDEX "sessions_userId_idx" ON "sessions"("userId");

-- CreateIndex
CREATE INDEX "sessions_expireLe_idx" ON "sessions"("expireLe");

-- CreateIndex
CREATE UNIQUE INDEX "password_reset_tokens_jetonHash_key" ON "password_reset_tokens"("jetonHash");

-- CreateIndex
CREATE INDEX "password_reset_tokens_userId_idx" ON "password_reset_tokens"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "roles_code_key" ON "roles"("code");

-- CreateIndex
CREATE INDEX "role_permissions_permission_idx" ON "role_permissions"("permission");

-- CreateIndex
CREATE INDEX "projects_statut_idx" ON "projects"("statut");

-- CreateIndex
CREATE INDEX "projects_departementId_idx" ON "projects"("departementId");

-- CreateIndex
CREATE INDEX "projects_chefId_idx" ON "projects"("chefId");

-- CreateIndex
CREATE INDEX "projects_archive_idx" ON "projects"("archive");

-- CreateIndex
CREATE INDEX "project_members_userId_idx" ON "project_members"("userId");

-- CreateIndex
CREATE INDEX "project_snapshots_projectId_idx" ON "project_snapshots"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "project_snapshots_projectId_date_key" ON "project_snapshots"("projectId", "date");

-- CreateIndex
CREATE INDEX "milestones_projectId_idx" ON "milestones"("projectId");

-- CreateIndex
CREATE INDEX "milestones_dateEcheance_idx" ON "milestones"("dateEcheance");

-- CreateIndex
CREATE UNIQUE INDEX "milestones_projectId_nom_key" ON "milestones"("projectId", "nom");

-- CreateIndex
CREATE INDEX "epics_projectId_idx" ON "epics"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "epics_projectId_nom_key" ON "epics"("projectId", "nom");

-- CreateIndex
CREATE INDEX "tasks_projectId_idx" ON "tasks"("projectId");

-- CreateIndex
CREATE INDEX "tasks_statut_idx" ON "tasks"("statut");

-- CreateIndex
CREATE INDEX "tasks_dateFin_idx" ON "tasks"("dateFin");

-- CreateIndex
CREATE INDEX "tasks_milestoneId_idx" ON "tasks"("milestoneId");

-- CreateIndex
CREATE INDEX "task_assignees_userId_idx" ON "task_assignees"("userId");

-- CreateIndex
CREATE INDEX "subtasks_taskId_idx" ON "subtasks"("taskId");

-- CreateIndex
CREATE UNIQUE INDEX "subtasks_taskId_ordre_key" ON "subtasks"("taskId", "ordre");

-- CreateIndex
CREATE INDEX "task_dependencies_prerequisId_idx" ON "task_dependencies"("prerequisId");

-- CreateIndex
CREATE INDEX "task_raci_userId_idx" ON "task_raci"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "leave_types_code_key" ON "leave_types"("code");

-- CreateIndex
CREATE INDEX "leaves_userId_dateDebut_dateFin_idx" ON "leaves"("userId", "dateDebut", "dateFin");

-- CreateIndex
CREATE INDEX "leaves_statut_idx" ON "leaves"("statut");

-- CreateIndex
CREATE INDEX "leaves_validateurId_idx" ON "leaves"("validateurId");

-- CreateIndex
CREATE INDEX "leave_balances_typeId_annee_idx" ON "leave_balances"("typeId", "annee");

-- CreateIndex
CREATE UNIQUE INDEX "leave_balances_userId_typeId_annee_key" ON "leave_balances"("userId", "typeId", "annee");

-- CreateIndex
CREATE INDEX "leave_delegations_delegantId_active_idx" ON "leave_delegations"("delegantId", "active");

-- CreateIndex
CREATE INDEX "leave_delegations_delegueId_active_idx" ON "leave_delegations"("delegueId", "active");

-- CreateIndex
CREATE INDEX "telework_date_idx" ON "telework"("date");

-- CreateIndex
CREATE UNIQUE INDEX "telework_userId_date_key" ON "telework"("userId", "date");

-- CreateIndex
CREATE INDEX "telework_rules_userId_active_idx" ON "telework_rules"("userId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "telework_rules_userId_jourSemaine_dateDebut_key" ON "telework_rules"("userId", "jourSemaine", "dateDebut");

-- CreateIndex
CREATE UNIQUE INDEX "predefined_tasks_nom_key" ON "predefined_tasks"("nom");

-- CreateIndex
CREATE INDEX "predefined_task_assignments_date_idx" ON "predefined_task_assignments"("date");

-- CreateIndex
CREATE INDEX "predefined_task_assignments_predefinedTaskId_date_idx" ON "predefined_task_assignments"("predefinedTaskId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "predefined_task_assignments_userId_predefinedTaskId_date_pe_key" ON "predefined_task_assignments"("userId", "predefinedTaskId", "date", "periode");

-- CreateIndex
CREATE INDEX "predefined_task_recurrences_predefinedTaskId_active_idx" ON "predefined_task_recurrences"("predefinedTaskId", "active");

-- CreateIndex
CREATE INDEX "events_date_idx" ON "events"("date");

-- CreateIndex
CREATE INDEX "events_projectId_idx" ON "events"("projectId");

-- CreateIndex
CREATE INDEX "events_parentId_idx" ON "events"("parentId");

-- CreateIndex
CREATE INDEX "event_participants_userId_idx" ON "event_participants"("userId");

-- CreateIndex
CREATE INDEX "time_entries_userId_date_idx" ON "time_entries"("userId", "date");

-- CreateIndex
CREATE INDEX "time_entries_projectId_idx" ON "time_entries"("projectId");

-- CreateIndex
CREATE INDEX "time_entries_taskId_idx" ON "time_entries"("taskId");

-- CreateIndex
CREATE UNIQUE INDEX "skills_nom_key" ON "skills"("nom");

-- CreateIndex
CREATE INDEX "user_skills_skillId_idx" ON "user_skills"("skillId");

-- CreateIndex
CREATE INDEX "project_third_parties_thirdPartyId_idx" ON "project_third_parties"("thirdPartyId");

-- CreateIndex
CREATE INDEX "task_third_parties_thirdPartyId_idx" ON "task_third_parties"("thirdPartyId");

-- CreateIndex
CREATE UNIQUE INDEX "clients_nom_key" ON "clients"("nom");

-- CreateIndex
CREATE INDEX "project_clients_clientId_idx" ON "project_clients"("clientId");

-- CreateIndex
CREATE INDEX "documents_projectId_idx" ON "documents"("projectId");

-- CreateIndex
CREATE INDEX "documents_taskId_idx" ON "documents"("taskId");

-- CreateIndex
CREATE INDEX "comments_projectId_idx" ON "comments"("projectId");

-- CreateIndex
CREATE INDEX "comments_taskId_idx" ON "comments"("taskId");

-- CreateIndex
CREATE INDEX "todos_userId_idx" ON "todos"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "holidays_date_key" ON "holidays"("date");

-- CreateIndex
CREATE INDEX "school_vacations_dateDebut_dateFin_idx" ON "school_vacations"("dateDebut", "dateFin");

-- CreateIndex
CREATE UNIQUE INDEX "school_vacations_zone_anneeScolaire_libelle_key" ON "school_vacations"("zone", "anneeScolaire", "libelle");

-- CreateIndex
CREATE INDEX "notifications_userId_lue_idx" ON "notifications"("userId", "lue");

-- CreateIndex
CREATE INDEX "notifications_creeLe_idx" ON "notifications"("creeLe");

-- CreateIndex
CREATE INDEX "audit_log_typeEntite_entiteId_idx" ON "audit_log"("typeEntite", "entiteId");

-- CreateIndex
CREATE INDEX "audit_log_acteurId_idx" ON "audit_log"("acteurId");

-- CreateIndex
CREATE INDEX "audit_log_action_idx" ON "audit_log"("action");

-- AddForeignKey
ALTER TABLE "directions" ADD CONSTRAINT "directions_responsableId_fkey" FOREIGN KEY ("responsableId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "departements" ADD CONSTRAINT "departements_directionId_fkey" FOREIGN KEY ("directionId") REFERENCES "directions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "departements" ADD CONSTRAINT "departements_responsableId_fkey" FOREIGN KEY ("responsableId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "services" ADD CONSTRAINT "services_departementId_fkey" FOREIGN KEY ("departementId") REFERENCES "departements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "services" ADD CONSTRAINT "services_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_departementId_fkey" FOREIGN KEY ("departementId") REFERENCES "departements"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_services" ADD CONSTRAINT "user_services_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_services" ADD CONSTRAINT "user_services_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "services"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_chefId_fkey" FOREIGN KEY ("chefId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_sponsorId_fkey" FOREIGN KEY ("sponsorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_createurId_fkey" FOREIGN KEY ("createurId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_snapshots" ADD CONSTRAINT "project_snapshots_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "milestones" ADD CONSTRAINT "milestones_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "epics" ADD CONSTRAINT "epics_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_milestoneId_fkey" FOREIGN KEY ("milestoneId") REFERENCES "milestones"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_epicId_fkey" FOREIGN KEY ("epicId") REFERENCES "epics"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_assignees" ADD CONSTRAINT "task_assignees_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_assignees" ADD CONSTRAINT "task_assignees_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subtasks" ADD CONSTRAINT "subtasks_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_dependencies" ADD CONSTRAINT "task_dependencies_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_dependencies" ADD CONSTRAINT "task_dependencies_prerequisId_fkey" FOREIGN KEY ("prerequisId") REFERENCES "tasks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_raci" ADD CONSTRAINT "task_raci_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_raci" ADD CONSTRAINT "task_raci_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leaves" ADD CONSTRAINT "leaves_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leaves" ADD CONSTRAINT "leaves_typeId_fkey" FOREIGN KEY ("typeId") REFERENCES "leave_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leaves" ADD CONSTRAINT "leaves_validateurId_fkey" FOREIGN KEY ("validateurId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_year_allocations" ADD CONSTRAINT "leave_year_allocations_leaveId_fkey" FOREIGN KEY ("leaveId") REFERENCES "leaves"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_balances" ADD CONSTRAINT "leave_balances_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_balances" ADD CONSTRAINT "leave_balances_typeId_fkey" FOREIGN KEY ("typeId") REFERENCES "leave_types"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_delegations" ADD CONSTRAINT "leave_delegations_delegantId_fkey" FOREIGN KEY ("delegantId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_delegations" ADD CONSTRAINT "leave_delegations_delegueId_fkey" FOREIGN KEY ("delegueId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "telework" ADD CONSTRAINT "telework_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "telework_rules" ADD CONSTRAINT "telework_rules_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "predefined_task_assignments" ADD CONSTRAINT "predefined_task_assignments_predefinedTaskId_fkey" FOREIGN KEY ("predefinedTaskId") REFERENCES "predefined_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "predefined_task_assignments" ADD CONSTRAINT "predefined_task_assignments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "predefined_task_recurrences" ADD CONSTRAINT "predefined_task_recurrences_predefinedTaskId_fkey" FOREIGN KEY ("predefinedTaskId") REFERENCES "predefined_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_participants" ADD CONSTRAINT "event_participants_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_participants" ADD CONSTRAINT "event_participants_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_thirdPartyId_fkey" FOREIGN KEY ("thirdPartyId") REFERENCES "third_parties"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_skills" ADD CONSTRAINT "user_skills_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_skills" ADD CONSTRAINT "user_skills_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "skills"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_third_parties" ADD CONSTRAINT "project_third_parties_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_third_parties" ADD CONSTRAINT "project_third_parties_thirdPartyId_fkey" FOREIGN KEY ("thirdPartyId") REFERENCES "third_parties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_third_parties" ADD CONSTRAINT "task_third_parties_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_third_parties" ADD CONSTRAINT "task_third_parties_thirdPartyId_fkey" FOREIGN KEY ("thirdPartyId") REFERENCES "third_parties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_clients" ADD CONSTRAINT "project_clients_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_clients" ADD CONSTRAINT "project_clients_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_auteurId_fkey" FOREIGN KEY ("auteurId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comments" ADD CONSTRAINT "comments_auteurId_fkey" FOREIGN KEY ("auteurId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comments" ADD CONSTRAINT "comments_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comments" ADD CONSTRAINT "comments_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "todos" ADD CONSTRAINT "todos_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
