-- New items, pools and contributions default to US dollars; existing rows keep their currency.
-- Expand-only: changing a column default leaves the previous image working.
ALTER TABLE "items" ALTER COLUMN "currency" SET DEFAULT 'USD';
ALTER TABLE "pools" ALTER COLUMN "currency" SET DEFAULT 'USD';
ALTER TABLE "contributions" ALTER COLUMN "currency" SET DEFAULT 'USD';
