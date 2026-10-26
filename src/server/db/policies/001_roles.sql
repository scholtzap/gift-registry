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

-- The one deliberate exception to the symmetry above, and it is not about rows.
--
-- RLS filters *rows*, never *columns*, and the grant above is table-wide — so a role legitimately
-- allowed to read its circle's roster reads every column of those rows too, which is
-- `phone_e164` and `bsuid` for the whole group. `users_circle_roster` is correct and this still
-- leaks: the roster is the row set a friend may see, and a phone number is not.
--
-- It has to be done by narrowing the grant, not by revoking afterwards: a table-level SELECT
-- implies SELECT on every column of it, so `REVOKE SELECT (phone_e164) ON users` executes cleanly
-- and changes nothing (verified — `attacl` stays NULL and `has_column_privilege` stays true).
--
-- `phone_e164` stays plaintext in the column, contrary to the security report's proposed fix: the
-- WhatsApp Cloud API addresses recipients by number, so the send path must read it. It reads it on
-- the login role, because service paths (webhook, gate, sender) have no session to switch out of.
--
-- Two consequences to respect rather than "fix":
--   * a bare `include`/`select: {}` of a user relation now raises 42501, because Prisma expands it
--     into every column. Name the columns. Failing closed on a query that asks for too much is the
--     point — re-granting the column is not the answer.
--   * a column added to `users` by a later migration is invisible to both roles until it is added
--     to the list below. Also the point.
REVOKE SELECT, INSERT, UPDATE ON users FROM app_owned, app_friend;
GRANT SELECT (id, display_name, plan, created_at),
      INSERT (id, display_name, plan),
      UPDATE (id, display_name, plan) ON users TO app_owned, app_friend;
