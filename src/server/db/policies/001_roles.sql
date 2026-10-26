-- RLS principal roles. Applied by `pnpm db:policies` after `prisma migrate`.
--
-- The application logs in as one owner-of-tables role and `SET LOCAL ROLE` to one of
-- these two per transaction. They are NOLOGIN on purpose: nothing can connect as them
-- directly, so the only way to be `app_friend` is to have been granted membership and
-- to have switched into it inside a transaction that also sets app.* GUCs.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_owned') THEN
    CREATE ROLE app_owned NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_friend') THEN
    CREATE ROLE app_friend NOLOGIN;
  END IF;
END
$$;

-- The login role must be able to switch into both. %I quotes an identifier taken from
-- the server itself, never from user input.
DO $$
BEGIN
  EXECUTE format('GRANT app_owned TO %I', CURRENT_USER);
  EXECUTE format('GRANT app_friend TO %I', CURRENT_USER);
END
$$;

GRANT USAGE ON SCHEMA public TO app_owned, app_friend;

-- Table-level privileges are deliberately symmetric: the *only* asymmetry in this
-- system is row-level. If the owner side had no SELECT grant on `claims` an owner query
-- would raise 42501 (permission denied) which confirms the table has rows to find. With
-- a grant and no read policy the owner gets zero rows, and the route can honestly 404.
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_owned, app_friend;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_owned, app_friend;
