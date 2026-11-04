-- Email OTP (docs/plans/otp-return-path.md). Expand-only: new nullable
-- identity columns, one boolean with a default, one nullable code key.
-- Previous image keeps inserting phone-only users and phone-keyed codes.
-- `email` and `email_hash` are intentionally absent from the app-role column
-- grant in src/server/db/policies/001_roles.sql.

ALTER TABLE "users" ADD COLUMN "email" TEXT;
ALTER TABLE "users" ADD COLUMN "email_hash" TEXT;

CREATE UNIQUE INDEX "users_email_key" ON "users"("email");
CREATE UNIQUE INDEX "users_email_hash_key" ON "users"("email_hash");

ALTER TABLE "circles" ADD COLUMN "discoverable" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "otp_codes" ADD COLUMN "identifier_hash" TEXT;
UPDATE "otp_codes" SET "identifier_hash" = "phone_e164_hash" WHERE "identifier_hash" IS NULL;
CREATE INDEX "otp_codes_identifier_hash_expires_at_idx" ON "otp_codes"("identifier_hash", "expires_at");

-- Widen the identity check. Phone-only and BSUID-only rows still pass.
-- Email-only rows pass. Rolling the app back does not require rolling this
-- check back: the previous image never inserts an email-only user.
ALTER TABLE "users" DROP CONSTRAINT "users_has_identifier";
ALTER TABLE "users" ADD CONSTRAINT "users_has_identifier"
  CHECK ("bsuid" IS NOT NULL OR "phone_e164" IS NOT NULL OR "email" IS NOT NULL);
