-- Per-user dashboard archive (hide from active list only). Expand-only.
ALTER TABLE "memberships" ADD COLUMN "dashboard_hidden" BOOLEAN NOT NULL DEFAULT false;
