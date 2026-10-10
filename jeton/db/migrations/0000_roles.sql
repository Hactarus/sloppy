-- 0000_roles.sql — database roles (PostgreSQL 16)
-- Run as a role allowed to CREATE ROLE. Roles are NOLOGIN groups; operations
-- creates the real login roles and GRANTs these groups to them, e.g.
--   CREATE ROLE jeton_api LOGIN PASSWORD '...' IN ROLE jeton_app;
--   CREATE ROLE jeton_accountant LOGIN PASSWORD '...' IN ROLE jeton_auditor;
-- Migrations themselves run as the table OWNER (jeton_owner or the DB owner),
-- which the API must NOT use at runtime.

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'jeton_app') THEN
    CREATE ROLE jeton_app NOLOGIN;      -- runtime role of the API server
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'jeton_auditor') THEN
    CREATE ROLE jeton_auditor NOLOGIN;  -- read-only (accountant, verification tool)
  END IF;
END
$$;
