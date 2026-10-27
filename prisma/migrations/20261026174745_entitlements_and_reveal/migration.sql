-- Expand-only, so the previous image tag still runs against the newer schema: three new
-- enums, two columns with non-volatile defaults, one new table. Nothing is dropped or
-- renamed, and no backfill is needed because every default is the pre-existing behaviour.
--
-- Projection declarations (the repo guardrail requires one per new column):
--   * `entitlements` is rendered by **neither** projection. It is actor-private: the row is
--     read only by `can(actor, capability)` inside that actor's own transaction and shown only
--     on their own settings screen. An owner must not learn a friend's AI settings and a friend
--     must not learn the owner's, so its RLS policy is `user_id = app_user_id()` for both roles.
--   * `users.plan` is actor-private for the same reason; it is read by the gate, never rendered.
--   * `items.reveal_ok` is **friend_only** — it is the author's veto, set by the friend who added
--     a secret suggestion, and the owner must not learn the suggestion exists at all.
--   * `items.revealed_at` / `revealed_by_user_id` become **owner_visible** at the moment of the
--     reveal, which is when the item's status turns `revealed` and `items_owner_read` admits it.

-- CreateEnum
CREATE TYPE "UserPlan" AS ENUM ('free', 'premium', 'internal');

-- CreateEnum
CREATE TYPE "AiCapability" AS ENUM ('voice_transcribe', 'photo_extract', 'link_expand', 'card_pun', 'card_art', 'assistant_reply', 'deal_search');

-- CreateEnum
CREATE TYPE "EntitlementSource" AS ENUM ('user', 'plan_default', 'admin', 'subscription');

-- AlterTable
ALTER TABLE "items" ADD COLUMN     "reveal_ok" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "revealed_at" TIMESTAMPTZ(6),
ADD COLUMN     "revealed_by_user_id" UUID;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "plan" "UserPlan" NOT NULL DEFAULT 'free';

-- CreateTable
CREATE TABLE "entitlements" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "capability" "AiCapability" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "source" "EntitlementSource" NOT NULL DEFAULT 'user',
    "expires_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "entitlements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "entitlements_user_id_idx" ON "entitlements"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "entitlements_user_id_capability_key" ON "entitlements"("user_id", "capability");

-- AddForeignKey
ALTER TABLE "entitlements" ADD CONSTRAINT "entitlements_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "items" ADD CONSTRAINT "items_revealed_by_user_id_fkey" FOREIGN KEY ("revealed_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
