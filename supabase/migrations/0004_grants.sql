-- Tables created via a raw SQL migration (as opposed to the Dashboard's
-- Table Editor) don't automatically pick up PostgREST's default role
-- grants, confirmed live: every query against every table came back
-- "permission denied" even using the service_role key, which RLS never
-- blocks - this is a plain Postgres GRANT gap, a layer below RLS. RLS
-- (0002_rls.sql) stays the real access-control decision for anon/
-- authenticated; these grants just let PostgREST attempt the query at all.

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
GRANT SELECT ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO anon, authenticated, service_role;

-- So the same gap doesn't reappear for every table added in later
-- migrations (Phase 3 onward).
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role;
