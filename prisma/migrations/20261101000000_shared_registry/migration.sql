-- Shared registry and circles dashboard (docs/plans/shared-registry-and-circles.md Q1).
-- Canonical receiver-owned items plus per-circle link rows carrying the visible flag.
-- Expand-only: two new tables, so the previous image keeps running. No backfill of
-- the per-circle `items` table: the greenfield rule (Q2) means the canonical tables
-- start empty and existing rows are untouched.

CREATE TABLE "registry_items" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "owner_user_id" UUID NOT NULL,
  "title" TEXT NOT NULL,
  "canonical_url" TEXT,
  "retailer" TEXT,
  "price_minor" INTEGER,
  "currency" CHAR(3) NOT NULL DEFAULT 'USD',
  "image_path" TEXT,
  -- Sharewear-style kill-switch: true hides the item in every circle even when a link is visible.
  "private" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "registry_items_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "registry_items_owner_user_id_idx" ON "registry_items"("owner_user_id");

ALTER TABLE "registry_items" ADD CONSTRAINT "registry_items_owner_user_id_fkey"
  FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "circle_item_links" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "registry_item_id" UUID NOT NULL,
  "circle_id" UUID NOT NULL,
  -- Per-circle visibility. New links are hidden until the receiver previews the circle (Q4).
  "visible" BOOLEAN NOT NULL DEFAULT false,
  -- The mandatory per-circle preview stamps this; showing requires a stamp.
  "previewed_at" TIMESTAMPTZ(6),
  "added_by_user_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "circle_item_links_pkey" PRIMARY KEY ("id")
);

-- Idempotency key (Q1): repeated links upsert on (item, circle), never duplicate.
CREATE UNIQUE INDEX "circle_item_links_registry_item_id_circle_id_key" ON "circle_item_links"("registry_item_id", "circle_id");
CREATE INDEX "circle_item_links_circle_id_visible_idx" ON "circle_item_links"("circle_id", "visible");

ALTER TABLE "circle_item_links" ADD CONSTRAINT "circle_item_links_registry_item_id_fkey"
  FOREIGN KEY ("registry_item_id") REFERENCES "registry_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "circle_item_links" ADD CONSTRAINT "circle_item_links_circle_id_fkey"
  FOREIGN KEY ("circle_id") REFERENCES "circles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "circle_item_links" ADD CONSTRAINT "circle_item_links_added_by_user_id_fkey"
  FOREIGN KEY ("added_by_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
