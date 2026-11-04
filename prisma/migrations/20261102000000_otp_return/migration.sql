-- OTP return path (docs/plans/otp-return-path.md): single-use login codes keyed
-- by phone hash. Expand-only: one new table, no backfill, previous image keeps
-- running. Row-level security is applied, not migrated (src/server/db/policies/
-- 004_otp_codes.sql): the table carries a deny-all policy for the app roles so
-- the /health privacy gate stays green while only the login role reads rows.

CREATE TABLE "otp_codes" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "phone_e164_hash" TEXT NOT NULL,
  "user_id" UUID NOT NULL,
  "code_hash" TEXT NOT NULL,
  "expires_at" TIMESTAMPTZ(6) NOT NULL,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "used" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "otp_codes_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "otp_codes_phone_e164_hash_expires_at_idx" ON "otp_codes"("phone_e164_hash", "expires_at");

ALTER TABLE "otp_codes" ADD CONSTRAINT "otp_codes_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
