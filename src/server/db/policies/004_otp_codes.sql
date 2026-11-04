-- OTP return path (docs/plans/otp-return-path.md): login codes are login-role
-- state only. RLS is on and the single policy admits nothing to either app
-- role, so a scoped connection counts zero rows rather than erroring; the
-- table owner (the login role the migrations run as) bypasses RLS, which is
-- the only read path the ledger uses. The deny rule exists so the /health
-- privacy gate (every table needs RLS plus at least one policy) stays green.

ALTER TABLE otp_codes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS otp_no_app_access ON otp_codes;
CREATE POLICY otp_no_app_access ON otp_codes FOR ALL TO app_owned, app_friend
  USING (false)
  WITH CHECK (false);
