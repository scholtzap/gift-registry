-- Two dates, and the writer of the event date (docs/plans/birthday-and-event-countdown.md).
--
-- Expand-only: every statement here leaves the previous image running, because `event_date`
-- only loses a NOT NULL and the new columns are nullable. Nothing is renamed or dropped.
--
-- CHECKs live here rather than in schema.prisma for the same reason the earlier ones do: Prisma
-- 7.10.1 does not introspect them, so a future `migrate dev` may propose dropping them. It is
-- wrong; keep them.

-- AlterTable
ALTER TABLE "circles" ADD COLUMN     "birth_day" SMALLINT,
ADD COLUMN     "birth_month" SMALLINT,
ADD COLUMN     "birth_year" SMALLINT,
ADD COLUMN     "event_date_set_by_user_id" UUID,
ALTER COLUMN "event_date" DROP NOT NULL;

-- Backfill before the invariants below: up to now the owner who created the circle was the only
-- writer of `event_date`, so naming them is the truth for every existing row, seeded demo
-- circle included.
UPDATE "circles" SET "event_date_set_by_user_id" = "owner_user_id" WHERE "event_date" IS NOT NULL;

-- A birthday is a calendar day, not a free integer. Day-in-month is validated in code, because
-- it needs the month and (for 29 February) the optional year together, and a leap-year rule in
-- SQL is a rule nobody will re-derive correctly under pressure.
ALTER TABLE "circles" ADD CONSTRAINT "circles_birth_month_range"
  CHECK ("birth_month" IS NULL OR "birth_month" BETWEEN 1 AND 12);

ALTER TABLE "circles" ADD CONSTRAINT "circles_birth_day_range"
  CHECK ("birth_day" IS NULL OR "birth_day" BETWEEN 1 AND 31);

ALTER TABLE "circles" ADD CONSTRAINT "circles_birth_year_range"
  CHECK ("birth_year" IS NULL OR "birth_year" BETWEEN 1900 AND 2200);

-- The writer only means something next to a date. One-directional on purpose: the FK is
-- `ON DELETE SET NULL`, so when the friend who wrote the date is deleted the date survives with
-- a null writer. A two-way equality would make that deletion fail, and a null writer is read as
-- "not the owner" — which hides the date from the owner, the safe direction for a surprise.
ALTER TABLE "circles" ADD CONSTRAINT "circles_event_date_writer_needs_a_date"
  CHECK ("event_date_set_by_user_id" IS NULL OR "event_date" IS NOT NULL);

-- AddForeignKey
ALTER TABLE "circles" ADD CONSTRAINT "circles_event_date_set_by_user_id_fkey" FOREIGN KEY ("event_date_set_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
