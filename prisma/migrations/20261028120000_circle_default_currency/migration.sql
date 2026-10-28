-- Circle-level default currency for new items; existing rows keep their currency.
-- Expand-only: adding a defaulted column leaves the previous image working.
ALTER TABLE "circles" ADD COLUMN "default_currency" CHAR(3) NOT NULL DEFAULT 'USD';
