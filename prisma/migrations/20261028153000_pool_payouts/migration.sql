-- Pool payout details for manual settlement. One row per pool, written by the buyer.
-- Friends never move money through Piñata; the buyer records where pledgers should
-- send their share by hand, and flips share_consent when the details may be shown.
-- Expand-only: a new table, so the previous image keeps running.
CREATE TABLE "pool_payouts" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "pool_id" UUID NOT NULL,
  "buyer_user_id" UUID NOT NULL,
  "account_holder" TEXT NOT NULL,
  "bank_name" TEXT NOT NULL,
  "account_number" TEXT NOT NULL,
  "branch_code" TEXT NOT NULL,
  "account_type" TEXT,
  "reference_prefix" TEXT,
  "share_consent" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "pool_payouts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "pool_payouts_pool_id_key" ON "pool_payouts"("pool_id");
CREATE INDEX "pool_payouts_buyer_user_id_idx" ON "pool_payouts"("buyer_user_id");

ALTER TABLE "pool_payouts" ADD CONSTRAINT "pool_payouts_pool_id_fkey"
  FOREIGN KEY ("pool_id") REFERENCES "pools"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "pool_payouts" ADD CONSTRAINT "pool_payouts_buyer_user_id_fkey"
  FOREIGN KEY ("buyer_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
