-- ════════════════════════════════════════════════════════════════════════════
-- Garde-fous d'intégrité — ce que Prisma ne sait pas déclarer.
--
-- C15 impose que les règles de non-chevauchement et d'unicité soient DOUBLÉES
-- en base. L'application émet le message métier rédigé ; la base garantit
-- qu'aucune concurrence ne peut le contourner. C'est la seule façon d'honorer
-- ces règles sans sérialiser les écritures.
-- ════════════════════════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS btree_gist;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ── RG-CNG-25..27 — chevauchement de congés ─────────────────────────────────
-- Deux congés du même agent ne peuvent se chevaucher. Filtré sur les statuts
-- « en attente » et « approuvé » : un congé refusé ou annulé ne bloque rien.
-- La borne haute est incluse (dateFin est le dernier jour d'absence).
ALTER TABLE "leaves"
  ADD CONSTRAINT "leaves_pas_de_chevauchement"
  EXCLUDE USING gist (
    "userId" WITH =,
    daterange("dateDebut", "dateFin", '[]') WITH &&
  )
  WHERE ("statut" IN ('pending', 'approved', 'cancellation_requested'));

-- ── Cohérence des périodes ──────────────────────────────────────────────────
-- RG-PRJ-01, RG-TSK-08, RG-CNG-28, RG-PRM-04 : la date de fin est postérieure
-- ou égale à la date de début. Quatre règles, une même forme.
ALTER TABLE "projects"
  ADD CONSTRAINT "projects_periode_coherente" CHECK ("dateFin" >= "dateDebut");

ALTER TABLE "tasks"
  ADD CONSTRAINT "tasks_periode_coherente"
  CHECK ("dateDebut" IS NULL OR "dateFin" IS NULL OR "dateFin" >= "dateDebut");

ALTER TABLE "leaves"
  ADD CONSTRAINT "leaves_periode_coherente" CHECK ("dateFin" >= "dateDebut");

ALTER TABLE "school_vacations"
  ADD CONSTRAINT "school_vacations_periode_coherente" CHECK ("dateFin" >= "dateDebut");

ALTER TABLE "leave_delegations"
  ADD CONSTRAINT "leave_delegations_periode_coherente" CHECK ("dateFin" >= "dateDebut");

ALTER TABLE "telework_rules"
  ADD CONSTRAINT "telework_rules_periode_coherente"
  CHECK ("dateFin" IS NULL OR "dateFin" >= "dateDebut");

-- ── RG-TSK-04 — une tâche ne dépend pas d'elle-même ─────────────────────────
-- Le cycle complet reste un contrôle applicatif ; la boucle immédiate, non.
ALTER TABLE "task_dependencies"
  ADD CONSTRAINT "task_dependencies_pas_de_boucle" CHECK ("taskId" <> "prerequisId");

-- ── RG-TMP-01 — une saisie référence au minimum une tâche ou un projet ──────
ALTER TABLE "time_entries"
  ADD CONSTRAINT "time_entries_rattachement_requis"
  CHECK ("projectId" IS NOT NULL OR "taskId" IS NOT NULL);

-- Un acteur, et un seul : l'agent ou le tiers, jamais les deux, jamais aucun.
ALTER TABLE "time_entries"
  ADD CONSTRAINT "time_entries_acteur_unique"
  CHECK (("userId" IS NULL) <> ("thirdPartyId" IS NULL));

-- ── RG-TMP-02 — heures déclarées strictement positives ──────────────────────
ALTER TABLE "time_entries"
  ADD CONSTRAINT "time_entries_heures_positives" CHECK ("heures" > 0);

-- ── RG-ACT-02 — durée « créneau horaire » : horaires obligatoires ───────────
ALTER TABLE "predefined_tasks"
  ADD CONSTRAINT "predefined_tasks_creneau_horaire"
  CHECK (
    "dureeParDefaut" <> 'time_slot'
    OR ("heureDebut" IS NOT NULL AND "heureFin" IS NOT NULL)
  );

-- Poids de 1 à 5, pour l'équilibrage de charge.
ALTER TABLE "predefined_tasks"
  ADD CONSTRAINT "predefined_tasks_poids" CHECK ("poids" BETWEEN 1 AND 5);

-- ── RG-CNG-18 — la demi-journée simple ne vaut que pour un congé d'un jour ──
ALTER TABLE "leaves"
  ADD CONSTRAINT "leaves_demi_journee_simple"
  CHECK (
    "dateDebut" <> "dateFin"
    OR "demiJourneeFin" IS NULL
    OR "demiJourneeDebut" = "demiJourneeFin"
  );

-- ── RG-TRS-01 — une personne morale ne porte pas de contact nommé ───────────
ALTER TABLE "third_parties"
  ADD CONSTRAINT "third_parties_contact_selon_type"
  CHECK ("type" <> 'organisation' OR "contactNom" IS NULL);

-- ── Avancement et progression bornés ────────────────────────────────────────
ALTER TABLE "tasks"
  ADD CONSTRAINT "tasks_avancement_borne" CHECK ("avancement" BETWEEN 0 AND 100);

ALTER TABLE "project_snapshots"
  ADD CONSTRAINT "project_snapshots_progression_bornee" CHECK ("progression" BETWEEN 0 AND 100);

ALTER TABLE "project_members"
  ADD CONSTRAINT "project_members_allocation_bornee"
  CHECK ("tauxAllocation" IS NULL OR "tauxAllocation" BETWEEN 0 AND 100);

-- ── RG-CMP-01 — effectif requis strictement positif ─────────────────────────
ALTER TABLE "skills"
  ADD CONSTRAINT "skills_effectif_requis_positif" CHECK ("effectifRequis" >= 1);

-- ── Jour de semaine : 0 = dimanche … 6 = samedi ─────────────────────────────
ALTER TABLE "telework_rules"
  ADD CONSTRAINT "telework_rules_jour_semaine" CHECK ("jourSemaine" BETWEEN 0 AND 6);

-- ── Recherche globale — pg_trgm sur ce qui se cherche ───────────────────────
CREATE INDEX "projects_nom_trgm" ON "projects" USING gin ("nom" gin_trgm_ops);
CREATE INDEX "tasks_titre_trgm"  ON "tasks"    USING gin ("titre" gin_trgm_ops);
CREATE INDEX "users_nom_trgm"    ON "users"    USING gin (("prenom" || ' ' || "nom") gin_trgm_ops);

-- ── RG-PLN-01 — index déterminants du budget de 2 s ─────────────────────────
-- La vue Mois d'un département agrège tâches, congés, télétravail, événements
-- et assignations sur une période. Ces index portent chacune des jointures.
CREATE INDEX "leaves_periode_gist"
  ON "leaves" USING gist ("userId", daterange("dateDebut", "dateFin", '[]'));

CREATE INDEX "tasks_periode" ON "tasks" ("dateDebut", "dateFin")
  WHERE "dateDebut" IS NOT NULL;
