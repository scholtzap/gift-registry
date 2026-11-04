-- Expand-only: where the gift is handed over. Null on every existing circle.
ALTER TABLE "circles" ADD COLUMN "location_note" TEXT;
