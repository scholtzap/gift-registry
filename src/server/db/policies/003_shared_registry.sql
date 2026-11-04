-- Shared registry (docs/plans/shared-registry-and-circles.md Q1): canonical
-- receiver-owned items plus per-circle link rows carrying the visible flag.
--
-- Same two rules as 002_policies.sql: the role gate is CURRENT_USER, and there is
-- deliberately NO friend policy on `registry_items` — a friend reads linked wishes
-- only through the circle projection, never the canonical row. Absence is the
-- mechanism, so a friend counts zero canonical rows rather than erroring.
--
-- The `private` kill-switch hides an item everywhere: the link policies still admit
-- the row, and the view builders filter it, because RLS decides which rows exist
-- and the projection decides what renders (the event-date precedent).

-- Registry authorship, for the link write policies. SECURITY DEFINER because it
-- reads a table that is itself under RLS.
CREATE OR REPLACE FUNCTION app_registry_item_owner(r uuid) RETURNS uuid
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS
$$ SELECT owner_user_id FROM registry_items WHERE id = r $$;

ALTER TABLE registry_items   ENABLE ROW LEVEL SECURITY;
ALTER TABLE circle_item_links ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- registry_items — the receiver reads their own canonical rows under either role;
-- anyone else reads only what a visible, non-private link puts in their circle.
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS registry_owner_self ON registry_items;
CREATE POLICY registry_owner_self ON registry_items FOR ALL TO app_owned, app_friend
  USING (owner_user_id = app_user_id())
  WITH CHECK (owner_user_id = app_user_id());

DROP POLICY IF EXISTS registry_owner_linked ON registry_items;
CREATE POLICY registry_owner_linked ON registry_items FOR SELECT TO app_owned
  USING (
    NOT private
    AND EXISTS (
      SELECT 1 FROM circle_item_links l
      WHERE l.registry_item_id = registry_items.id
        AND l.visible
        AND app_actor_owns_circle(l.circle_id)
    )
  );

DROP POLICY IF EXISTS registry_friend_linked ON registry_items;
CREATE POLICY registry_friend_linked ON registry_items FOR SELECT TO app_friend
  USING (
    NOT private
    AND EXISTS (
      SELECT 1 FROM circle_item_links l
      WHERE l.registry_item_id = registry_items.id
        AND l.visible
        AND l.circle_id = app_circle_id()
        AND app_actor_joined_circle(l.circle_id)
    )
  );

-- ---------------------------------------------------------------------------
-- circle_item_links — owners manage links in circles they own; friends read only
-- the visible ones in the circle they are scoped to. No friend write policy.
-- Q5: proxy circles (no owner) admit no canonical registry — the insert check
-- requires a real owner on the circle.
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS links_owner_manage ON circle_item_links;
CREATE POLICY links_owner_manage ON circle_item_links FOR ALL TO app_owned
  USING (app_actor_owns_circle(circle_id))
  WITH CHECK (
    app_actor_owns_circle(circle_id)
    AND added_by_user_id = app_user_id()
    AND app_registry_item_owner(registry_item_id) = app_user_id()
    AND EXISTS (
      SELECT 1 FROM circles c
      WHERE c.id = circle_id AND c.owner_user_id IS NOT NULL AND c.status = 'active'
    )
  );

DROP POLICY IF EXISTS links_friend_read ON circle_item_links;
CREATE POLICY links_friend_read ON circle_item_links FOR SELECT TO app_friend
  USING (
    visible
    AND circle_id = app_circle_id()
    AND app_actor_joined_circle(circle_id)
  );
