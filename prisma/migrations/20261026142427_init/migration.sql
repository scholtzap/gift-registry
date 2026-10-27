-- CreateEnum
CREATE TYPE "AttributeKind" AS ENUM ('ring_size', 'shoe_size', 'top', 'bottom', 'colour', 'other');

-- CreateEnum
CREATE TYPE "AttributeVisibility" AS ENUM ('friends', 'private');

-- CreateEnum
CREATE TYPE "CircleStatus" AS ENUM ('active', 'closed');

-- CreateEnum
CREATE TYPE "AllowlistStatus" AS ENUM ('pending', 'accepted', 'removed');

-- CreateEnum
CREATE TYPE "MembershipRole" AS ENUM ('owner', 'friend');

-- CreateEnum
CREATE TYPE "MembershipStatus" AS ENUM ('active', 'removed');

-- CreateEnum
CREATE TYPE "ItemVisibility" AS ENUM ('owner_visible', 'friend_only');

-- CreateEnum
CREATE TYPE "ItemStatus" AS ENUM ('active', 'tombstoned', 'revealed');

-- CreateEnum
CREATE TYPE "TombstoneReason" AS ENUM ('bought_self', 'no_longer_wants', 'duplicate');

-- CreateEnum
CREATE TYPE "ClaimKind" AS ENUM ('solo', 'pool_member');

-- CreateEnum
CREATE TYPE "ClaimStatus" AS ENUM ('claimed', 'fulfilled', 'released');

-- CreateEnum
CREATE TYPE "PoolStatus" AS ENUM ('open', 'funded', 'purchased', 'pivot_needed');

-- CreateEnum
CREATE TYPE "ContributionStatus" AS ENUM ('promised', 'marked_paid', 'settled');

-- CreateEnum
CREATE TYPE "IngestKind" AS ENUM ('audio', 'image', 'text', 'url');

-- CreateEnum
CREATE TYPE "IngestStatus" AS ENUM ('received', 'converted', 'transcribed', 'parsed', 'confirmed', 'failed');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "bsuid" TEXT,
    "phone_e164" TEXT,
    "display_name" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attributes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "kind" "AttributeKind" NOT NULL,
    "value_text" TEXT NOT NULL,
    "unit" TEXT,
    "visibility" "AttributeVisibility" NOT NULL DEFAULT 'friends',
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "attributes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "circles" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "occasion" TEXT NOT NULL,
    "event_date" DATE NOT NULL,
    "owner_user_id" UUID NOT NULL,
    "share_slug" TEXT NOT NULL,
    "status" "CircleStatus" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "circles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "allowlist_entries" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "circle_id" UUID NOT NULL,
    "phone_e164_hash" TEXT NOT NULL,
    "added_by" UUID NOT NULL,
    "status" "AllowlistStatus" NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "allowlist_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "memberships" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "circle_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role" "MembershipRole" NOT NULL DEFAULT 'friend',
    "status" "MembershipStatus" NOT NULL DEFAULT 'active',
    "joined_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "circle_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "canonical_url" TEXT,
    "retailer" TEXT,
    "price_minor" INTEGER,
    "currency" CHAR(3) NOT NULL DEFAULT 'ZAR',
    "image_path" TEXT,
    "added_by_user_id" UUID NOT NULL,
    "visibility" "ItemVisibility" NOT NULL DEFAULT 'owner_visible',
    "status" "ItemStatus" NOT NULL DEFAULT 'active',
    "tombstone_reason" "TombstoneReason",
    "confirmed" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tombstoned_at" TIMESTAMPTZ(6),

    CONSTRAINT "items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "claims" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "item_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "pool_id" UUID,
    "kind" "ClaimKind" NOT NULL,
    "status" "ClaimStatus" NOT NULL DEFAULT 'claimed',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "claims_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pools" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "item_id" UUID NOT NULL,
    "buyer_user_id" UUID NOT NULL,
    "target_minor" INTEGER NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'ZAR',
    "status" "PoolStatus" NOT NULL DEFAULT 'open',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pools_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contributions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "pool_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "amount_minor" INTEGER NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'ZAR',
    "status" "ContributionStatus" NOT NULL DEFAULT 'promised',
    "paid_at" TIMESTAMPTZ(6),
    "note" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contributions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ingest_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "wa_message_id" TEXT NOT NULL,
    "circle_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "kind" "IngestKind" NOT NULL,
    "media_path" TEXT,
    "media_expires_at" TIMESTAMPTZ(6),
    "model_used" TEXT,
    "draft" JSONB,
    "item_id" UUID,
    "status" "IngestStatus" NOT NULL DEFAULT 'received',
    "error" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ingest_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ledger_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "circle_id" UUID NOT NULL,
    "entity" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "actor_user_id" UUID,
    "action" TEXT NOT NULL,
    "payload" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ledger_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "card_entries" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "item_id" UUID NOT NULL,
    "contributor_user_id" UUID NOT NULL,
    "display_name_shown" TEXT NOT NULL,
    "anonymous" BOOLEAN NOT NULL DEFAULT false,
    "message" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "card_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gift_cards" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "item_id" UUID NOT NULL,
    "pun" TEXT NOT NULL,
    "tagline" TEXT NOT NULL,
    "model_used" TEXT,
    "art_path" TEXT,
    "art_prompt" TEXT,
    "rendered_png_path" TEXT,
    "rendered_at" TIMESTAMPTZ(6),
    "created_by_user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gift_cards_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_bsuid_key" ON "users"("bsuid");

-- CreateIndex
CREATE UNIQUE INDEX "users_phone_e164_key" ON "users"("phone_e164");

-- CreateIndex
CREATE INDEX "attributes_user_id_idx" ON "attributes"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "attributes_user_id_kind_value_text_key" ON "attributes"("user_id", "kind", "value_text");

-- CreateIndex
CREATE UNIQUE INDEX "circles_share_slug_key" ON "circles"("share_slug");

-- CreateIndex
CREATE INDEX "circles_owner_user_id_idx" ON "circles"("owner_user_id");

-- CreateIndex
CREATE INDEX "allowlist_entries_circle_id_status_idx" ON "allowlist_entries"("circle_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "allowlist_entries_circle_id_phone_e164_hash_key" ON "allowlist_entries"("circle_id", "phone_e164_hash");

-- CreateIndex
CREATE INDEX "memberships_user_id_status_idx" ON "memberships"("user_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "memberships_circle_id_user_id_key" ON "memberships"("circle_id", "user_id");

-- CreateIndex
CREATE INDEX "items_circle_id_status_idx" ON "items"("circle_id", "status");

-- CreateIndex
CREATE INDEX "items_circle_id_visibility_idx" ON "items"("circle_id", "visibility");

-- CreateIndex
CREATE INDEX "claims_pool_id_idx" ON "claims"("pool_id");

-- CreateIndex
CREATE UNIQUE INDEX "claims_item_id_user_id_key" ON "claims"("item_id", "user_id");

-- CreateIndex
CREATE INDEX "pools_item_id_status_idx" ON "pools"("item_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "contributions_pool_id_user_id_key" ON "contributions"("pool_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "ingest_events_wa_message_id_key" ON "ingest_events"("wa_message_id");

-- CreateIndex
CREATE INDEX "ingest_events_circle_id_status_idx" ON "ingest_events"("circle_id", "status");

-- CreateIndex
CREATE INDEX "ledger_events_circle_id_created_at_idx" ON "ledger_events"("circle_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "card_entries_item_id_contributor_user_id_key" ON "card_entries"("item_id", "contributor_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "gift_cards_item_id_key" ON "gift_cards"("item_id");

-- AddForeignKey
ALTER TABLE "attributes" ADD CONSTRAINT "attributes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "circles" ADD CONSTRAINT "circles_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "allowlist_entries" ADD CONSTRAINT "allowlist_entries_circle_id_fkey" FOREIGN KEY ("circle_id") REFERENCES "circles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "allowlist_entries" ADD CONSTRAINT "allowlist_entries_added_by_fkey" FOREIGN KEY ("added_by") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_circle_id_fkey" FOREIGN KEY ("circle_id") REFERENCES "circles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "items" ADD CONSTRAINT "items_circle_id_fkey" FOREIGN KEY ("circle_id") REFERENCES "circles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "items" ADD CONSTRAINT "items_added_by_user_id_fkey" FOREIGN KEY ("added_by_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "claims" ADD CONSTRAINT "claims_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "claims" ADD CONSTRAINT "claims_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "claims" ADD CONSTRAINT "claims_pool_id_fkey" FOREIGN KEY ("pool_id") REFERENCES "pools"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pools" ADD CONSTRAINT "pools_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pools" ADD CONSTRAINT "pools_buyer_user_id_fkey" FOREIGN KEY ("buyer_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contributions" ADD CONSTRAINT "contributions_pool_id_fkey" FOREIGN KEY ("pool_id") REFERENCES "pools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contributions" ADD CONSTRAINT "contributions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ingest_events" ADD CONSTRAINT "ingest_events_circle_id_fkey" FOREIGN KEY ("circle_id") REFERENCES "circles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ingest_events" ADD CONSTRAINT "ingest_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ingest_events" ADD CONSTRAINT "ingest_events_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_events" ADD CONSTRAINT "ledger_events_circle_id_fkey" FOREIGN KEY ("circle_id") REFERENCES "circles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_events" ADD CONSTRAINT "ledger_events_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "card_entries" ADD CONSTRAINT "card_entries_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "card_entries" ADD CONSTRAINT "card_entries_contributor_user_id_fkey" FOREIGN KEY ("contributor_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gift_cards" ADD CONSTRAINT "gift_cards_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gift_cards" ADD CONSTRAINT "gift_cards_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
