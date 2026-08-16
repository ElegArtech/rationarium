-- ════════════════════════════════════════════════════════════════════════════
-- Journal d'audit inaltérable — RG-ADM-01, cadrage/01 § 7 Traçabilité.
--
-- « Le journal est en lecture seule. Aucune interface ne permet de le modifier. »
--
-- Une interface qui ne le modifie pas ne suffit pas : il faut que la base le
-- REFUSE. Deux mécanismes distincts, tous deux nécessaires :
--
--   1. Le partitionnement mensuel, pour que la rétention se règle par
--      détachement de partition et non par purge ligne à ligne (§ 9.7).
--   2. La révocation des droits UPDATE et DELETE au rôle applicatif, pour que
--      l'inaltérabilité ne dépende d'aucun code.
--
-- Vérifié par les tests d'intégration : une tentative d'UPDATE doit échouer.
-- ════════════════════════════════════════════════════════════════════════════

-- ── Partitionnement mensuel ─────────────────────────────────────────────────
-- Prisma engendre une table ordinaire ; on la remplace par une table
-- partitionnée. La table est vide à ce stade : aucune donnée à reprendre.

DROP TABLE IF EXISTS "audit_log";

CREATE TABLE "audit_log" (
  "id"         UUID        NOT NULL DEFAULT gen_random_uuid(),
  "horodatage" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "action"     TEXT        NOT NULL,
  "typeEntite" TEXT        NOT NULL,
  "entiteId"   TEXT,
  "acteurId"   UUID,
  "systeme"    BOOLEAN     NOT NULL DEFAULT false,
  "detail"     JSONB,
  CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id", "horodatage")
) PARTITION BY RANGE ("horodatage");

-- BRIN plutôt que B-tree : le journal est écrit dans l'ordre chronologique,
-- l'index tient en quelques pages là où un B-tree grossirait indéfiniment.
CREATE INDEX "audit_log_horodatage_brin" ON "audit_log" USING brin ("horodatage");
CREATE INDEX "audit_log_entite"  ON "audit_log" ("typeEntite", "entiteId");
CREATE INDEX "audit_log_acteur"  ON "audit_log" ("acteurId");
CREATE INDEX "audit_log_action"  ON "audit_log" ("action");

-- Partition par défaut : aucune écriture ne peut échouer faute de partition.
-- C'est le filet — RG-NTF-04 vaut aussi ici, une trace ne doit jamais empêcher
-- une action métier d'aboutir.
CREATE TABLE "audit_log_defaut" PARTITION OF "audit_log" DEFAULT;

-- Fonction de création des partitions mensuelles, appelée par le traitement
-- planifié. Idempotente : la rejouer ne casse rien.
CREATE OR REPLACE FUNCTION creer_partition_audit(mois DATE)
RETURNS void AS $$
DECLARE
  debut DATE := date_trunc('month', mois)::date;
  fin   DATE := (date_trunc('month', mois) + interval '1 month')::date;
  nom   TEXT := 'audit_log_' || to_char(debut, 'YYYY_MM');
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = nom) THEN
    EXECUTE format(
      'CREATE TABLE %I PARTITION OF "audit_log" FOR VALUES FROM (%L) TO (%L)',
      nom, debut, fin
    );
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Les partitions du mois courant et des deux suivants.
SELECT creer_partition_audit(CURRENT_DATE);
SELECT creer_partition_audit((CURRENT_DATE + interval '1 month')::date);
SELECT creer_partition_audit((CURRENT_DATE + interval '2 months')::date);

-- ── Rôle applicatif : INSERT et SELECT, rien d'autre ────────────────────────
-- Le rôle propriétaire du schéma reste omnipotent — il faut bien migrer et
-- détacher les partitions. C'est le rôle que l'APPLICATION emploie qui est
-- bridé, et c'est lui seul qui compte : l'application ne doit pas pouvoir
-- réécrire l'histoire, même si son code le lui demandait.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'trame_app') THEN
    CREATE ROLE trame_app NOLOGIN;
  END IF;
END $$;

GRANT USAGE ON SCHEMA public TO trame_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO trame_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO trame_app;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO trame_app;

-- Puis on retire ce qui ne doit jamais être accordé sur le journal.
REVOKE UPDATE, DELETE, TRUNCATE ON "audit_log" FROM trame_app;
REVOKE UPDATE, DELETE, TRUNCATE ON "audit_log_defaut" FROM trame_app;

-- Et sur toutes les partitions à venir : la révocation doit survivre à la
-- création d'une partition, sinon elle serait contournée le mois prochain.
CREATE OR REPLACE FUNCTION brider_partition_audit()
RETURNS event_trigger AS $$
DECLARE
  objet record;
BEGIN
  FOR objet IN SELECT * FROM pg_event_trigger_ddl_commands()
  WHERE command_tag = 'CREATE TABLE'
  LOOP
    IF objet.object_identity LIKE 'public.audit_log%' THEN
      EXECUTE format('REVOKE UPDATE, DELETE, TRUNCATE ON %s FROM trame_app', objet.object_identity);
    END IF;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

DROP EVENT TRIGGER IF EXISTS bride_partitions_audit;
CREATE EVENT TRIGGER bride_partitions_audit
  ON ddl_command_end WHEN TAG IN ('CREATE TABLE')
  EXECUTE FUNCTION brider_partition_audit();
