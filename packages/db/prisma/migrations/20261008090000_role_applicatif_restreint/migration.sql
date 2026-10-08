-- Rôle applicatif restreint — RG-ADM-01, ADR-20261008-role-applicatif.
--
-- MOTIF. Jusqu'à 1.0.1, l'application se connectait en superutilisateur : la
-- révocation d'UPDATE, DELETE et TRUNCATE sur le journal d'audit visait
-- `rationarium_app`, que rien n'employait. Le conteneur `migrations` crée
-- désormais un rôle de connexion membre de `rationarium_app` ; cette migration
-- lui donne ce qui lui manquait pour fonctionner sans rien d'autre.
--
-- PORTÉE. Aucune structure de table : des droits et un attribut de fonction.
--
-- RETOUR ARRIÈRE.
--   ALTER FUNCTION creer_partition_audit(date) SECURITY INVOKER RESET search_path;  (corps qualifié conservé)
--   GRANT EXECUTE ON FUNCTION creer_partition_audit(date) TO PUBLIC;
--   GRANT INSERT, UPDATE, DELETE ON "_prisma_migrations" TO rationarium_app;
--   ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE USAGE, SELECT ON SEQUENCES FROM rationarium_app;

-- 1. Les partitions mensuelles du journal. `CREATE TABLE … PARTITION OF` exige
--    d'être propriétaire de `audit_log` : la fonction s'exécute donc avec les
--    droits de son propriétaire, sur un chemin de recherche figé, et n'est
--    exécutable que par le rôle bridé. Son seul paramètre est une date, le
--    nom de partition est composé par `format(%I)`, et chaque objet est
--    qualifié par son schéma : le chemin de recherche ne contient que le
--    catalogue, une table créée sans schéma y serait refusée.
CREATE OR REPLACE FUNCTION creer_partition_audit(mois DATE)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  debut DATE := date_trunc('month', mois)::date;
  fin   DATE := (date_trunc('month', mois) + interval '1 month')::date;
  nom   TEXT := 'audit_log_' || to_char(debut, 'YYYY_MM');
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = nom
  ) THEN
    EXECUTE format(
      'CREATE TABLE public.%I PARTITION OF public."audit_log" FOR VALUES FROM (%L) TO (%L)',
      nom, debut, fin
    );
  END IF;
END;
$$;
REVOKE EXECUTE ON FUNCTION creer_partition_audit(date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION creer_partition_audit(date) TO rationarium_app;

-- 2. L'historique des migrations se lit (sonde `/api/sante/pret`) et ne
--    s'écrit pas : seul le propriétaire migre.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON "_prisma_migrations" FROM rationarium_app;

-- 3. Les droits par défaut couvraient les tables futures, pas les séquences.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO rationarium_app;
