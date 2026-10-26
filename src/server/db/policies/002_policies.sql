-- Row Level Security = the privacy mechanism (ARCHITECTURE §4). Idempotent: drop then create.
--
-- Two rules the whole file obeys:
--   1. The *role* gate is CURRENT_USER, not a settable GUC. `SET LOCAL ROLE` is the only way to
--      become app_owned / app_friend, so a request cannot claim friendship by setting app.role.
--   2. There is deliberately NO read policy for app_owned on claims, pools, contributions,
--      card_entries or gift_cards. Absence is the mechanism: SELECT returns zero rows rather
--      than an error, so the route can answer 404. A 403 would confirm the row exists — and
--      "who claimed what" is exactly what the owner must not learn.

-- ---------------------------------------------------------------------------
-- Scope helpers. SECURITY DEFINER because they read membership/circle tables that are
-- themselves under RLS; without them, policies would recurse into their own subqueries.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION app_user_id() RETURNS uuid
  LANGUAGE sql STABLE SET search_path = public AS
$$ SELECT NULLIF(current_setting('app.user_id', true), '')::uuid $$;

CREATE OR REPLACE FUNCTION app_circle_id() RETURNS uuid
  LANGUAGE sql STABLE SET search_path = public AS
$$ SELECT NULLIF(current_setting('app.circle_id', true), '')::uuid $$;

CREATE OR REPLACE FUNCTION app_actor_owns_circle(c uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS
$$ SELECT c IS NOT NULL AND EXISTS (
     SELECT 1 FROM circles ci WHERE ci.id = c AND ci.owner_user_id = app_user_id()) $$;

CREATE OR REPLACE FUNCTION app_actor_joined_circle(c uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS
$$ SELECT c IS NOT NULL AND EXISTS (
     SELECT 1 FROM memberships m WHERE m.circle_id = c AND m.user_id = app_user_id()
       AND m.status = 'active') $$;

CREATE OR REPLACE FUNCTION app_circle_of_item(i uuid) RETURNS uuid
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS
$$ SELECT circle_id FROM items WHERE id = i $$;

CREATE OR REPLACE FUNCTION app_circle_of_pool(p uuid) RETURNS uuid
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS
$$ SELECT it.circle_id FROM pools po JOIN items it ON it.id = po.item_id WHERE po.id = p $$;

CREATE OR REPLACE FUNCTION app_buyer_of_pool(p uuid) RETURNS uuid
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS
$$ SELECT buyer_user_id FROM pools WHERE id = p $$;

-- Circles are one gift target per circle, so "whose attributes are these" resolves
-- through the circle's owner.
CREATE OR REPLACE FUNCTION app_circle_of_gift_target(u uuid) RETURNS uuid
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS
$$ SELECT id FROM circles WHERE owner_user_id = u $$;

-- Roster scope, and the one predicate in this file that is easiest to get catastrophically
-- wrong. It must be about *this row's* membership. An earlier version asked only "is the
-- session scoped to a circle the actor belongs to", which is true for every row at once and
-- so returned the entire `users` table — `phone_e164` and `bsuid` for people in other circles
-- included. `tests/leak/owner-blindness.test.ts` pins both readings.
CREATE OR REPLACE FUNCTION app_actor_in_circle_roster(u uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS
$$ SELECT app_circle_id() IS NOT NULL
     AND (app_actor_owns_circle(app_circle_id()) OR app_actor_joined_circle(app_circle_id()))
     AND (
       u = (SELECT ci.owner_user_id FROM circles ci WHERE ci.id = app_circle_id())
       OR EXISTS (SELECT 1 FROM memberships m
                  WHERE m.circle_id = app_circle_id() AND m.user_id = u AND m.status = 'active')
     ) $$;

-- The gate compares hashes, never numbers: the app hashes the caller's own E.164 phone
-- and this session's hash is the only one a friend role is allowed to match against.
CREATE OR REPLACE FUNCTION app_phone_hash() RETURNS text
  LANGUAGE sql STABLE SET search_path = public AS
$$ SELECT NULLIF(current_setting('app.phone_hash', true), '') $$;

ALTER TABLE users             ENABLE ROW LEVEL SECURITY;
ALTER TABLE attributes        ENABLE ROW LEVEL SECURITY;
ALTER TABLE entitlements      ENABLE ROW LEVEL SECURITY;
ALTER TABLE circles           ENABLE ROW LEVEL SECURITY;
ALTER TABLE allowlist_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE memberships       ENABLE ROW LEVEL SECURITY;
ALTER TABLE items             ENABLE ROW LEVEL SECURITY;
ALTER TABLE claims            ENABLE ROW LEVEL SECURITY;
ALTER TABLE pools             ENABLE ROW LEVEL SECURITY;
ALTER TABLE contributions     ENABLE ROW LEVEL SECURITY;
ALTER TABLE ingest_events     ENABLE ROW LEVEL SECURITY;
ALTER TABLE ledger_events     ENABLE ROW LEVEL SECURITY;
ALTER TABLE card_entries      ENABLE ROW LEVEL SECURITY;
ALTER TABLE gift_cards        ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- users — either side may read the roster of the circle it is already scoped to.
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS users_self ON users;
CREATE POLICY users_self ON users FOR SELECT TO app_owned, app_friend
  USING (id = app_user_id());

DROP POLICY IF EXISTS users_circle_roster ON users;
CREATE POLICY users_circle_roster ON users FOR SELECT TO app_owned, app_friend
  USING (app_actor_in_circle_roster(id));

DROP POLICY IF EXISTS users_self_update ON users;
CREATE POLICY users_self_update ON users FOR UPDATE TO app_owned, app_friend
  USING (id = app_user_id()) WITH CHECK (id = app_user_id());

DROP POLICY IF EXISTS users_self_insert ON users;
CREATE POLICY users_self_insert ON users FOR INSERT TO app_owned, app_friend
  WITH CHECK (id = app_user_id());

-- ---------------------------------------------------------------------------
-- entitlements — actor-private AI switches. Self-only on every verb, and there is deliberately
-- no owner-side or circle-side policy: absence is the mechanism again. An owner cannot read a
-- friend's AI settings, a friend cannot read the owner's, and `can()` therefore cannot pick up
-- a consent that is not the caller's own (SPEC.md: consent is the actor's, budget is the owner's).
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS entitlements_self_read ON entitlements;
CREATE POLICY entitlements_self_read ON entitlements FOR SELECT TO app_owned, app_friend
  USING (user_id = app_user_id());

DROP POLICY IF EXISTS entitlements_self_insert ON entitlements;
CREATE POLICY entitlements_self_insert ON entitlements FOR INSERT TO app_owned, app_friend
  WITH CHECK (user_id = app_user_id());

DROP POLICY IF EXISTS entitlements_self_update ON entitlements;
CREATE POLICY entitlements_self_update ON entitlements FOR UPDATE TO app_owned, app_friend
  USING (user_id = app_user_id()) WITH CHECK (user_id = app_user_id());

-- Deleting your own row is how a switch returns to the plan default, so it is a supported verb
-- rather than an admin action.
DROP POLICY IF EXISTS entitlements_self_delete ON entitlements;
CREATE POLICY entitlements_self_delete ON entitlements FOR DELETE TO app_owned, app_friend
  USING (user_id = app_user_id());

-- ---------------------------------------------------------------------------
-- attributes — owner-authored about themselves; friends see only `friends`-visible rows
-- belonging to the person their circle is gifting for.
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS attributes_owner_write ON attributes;
CREATE POLICY attributes_owner_write ON attributes FOR ALL TO app_owned
  USING (user_id = app_user_id()) WITH CHECK (user_id = app_user_id());

DROP POLICY IF EXISTS attributes_friend_read ON attributes;
CREATE POLICY attributes_friend_read ON attributes FOR SELECT TO app_friend
  USING (
    visibility = 'friends'
    AND app_actor_joined_circle(app_circle_id())
    AND app_circle_of_gift_target(user_id) = app_circle_id()
  );

-- ---------------------------------------------------------------------------
-- circles
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS circles_owner_read ON circles;
CREATE POLICY circles_owner_read ON circles FOR SELECT TO app_owned
  USING (app_actor_owns_circle(id));

DROP POLICY IF EXISTS circles_friend_read ON circles;
CREATE POLICY circles_friend_read ON circles FOR SELECT TO app_friend
  USING (id = app_circle_id() AND app_actor_joined_circle(id));

DROP POLICY IF EXISTS circles_owner_write ON circles;
CREATE POLICY circles_owner_write ON circles FOR ALL TO app_owned
  USING (app_actor_owns_circle(id)) WITH CHECK (owner_user_id = app_user_id());

-- ---------------------------------------------------------------------------
-- memberships
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS memberships_owner_read ON memberships;
CREATE POLICY memberships_owner_read ON memberships FOR SELECT TO app_owned
  USING (app_actor_owns_circle(circle_id));

DROP POLICY IF EXISTS memberships_friend_read ON memberships;
CREATE POLICY memberships_friend_read ON memberships FOR SELECT TO app_friend
  USING (app_actor_joined_circle(circle_id));

-- `circle_id = app_circle_id()` is the conjunct that makes this a *join* rather than a
-- global write right. Without it the predicate says "anyone may add a friend membership for
-- themselves to any circle", which is the uncorrelated-policy bug class this repo has already
-- been burned by once (see `app_actor_in_circle_roster` above). Today the gate writes on the
-- login role, so this is not reachable through the route — it becomes reachable the moment
-- anyone joins a circle while scoped, which is what an in-app "accept this invite" flow does.
--
-- Note for that feature: it cannot use Prisma `create` on this policy. INSERT ... RETURNING is
-- filtered by the table's SELECT policy (`memberships_friend_read`, which needs an *existing*
-- membership), so a first join is rejected as 42501 by the read half, not the write half. Join
-- on the login role the way the gate does, then read it back scoped.
DROP POLICY IF EXISTS memberships_self_join ON memberships;
CREATE POLICY memberships_self_join ON memberships FOR INSERT TO app_friend
  WITH CHECK (
    user_id = app_user_id()
    AND role = 'friend'
    AND status = 'active'
    AND circle_id = app_circle_id()
  );

-- ---------------------------------------------------------------------------
-- items — the one table where both roles read, with different predicates.
-- Owner: own circle, never a secret suggestion, never a tombstone (their own soft delete).
-- Friend: the whole circle ledger including tombstones, which survive for them.
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS items_owner_read ON items;
CREATE POLICY items_owner_read ON items FOR SELECT TO app_owned
  USING (
    app_actor_owns_circle(circle_id)
    AND status <> 'tombstoned'
    AND (visibility = 'owner_visible' OR status = 'revealed')
  );

DROP POLICY IF EXISTS items_friend_read ON items;
CREATE POLICY items_friend_read ON items FOR SELECT TO app_friend
  USING (circle_id = app_circle_id() AND app_actor_joined_circle(circle_id));

DROP POLICY IF EXISTS items_owner_update ON items;
DROP POLICY IF EXISTS items_owner_insert ON items;
DROP POLICY IF EXISTS items_owner_write ON items;
-- FOR UPDATE and FOR INSERT, never FOR ALL: a policy with no command clause also covers
-- SELECT, and `USING (app_actor_owns_circle(circle_id))` alone would hand the owner back the
-- secret suggestion and their own tombstones — the two rows this table must hide from them.
CREATE POLICY items_owner_update ON items FOR UPDATE TO app_owned
  USING (app_actor_owns_circle(circle_id) AND visibility = 'owner_visible')
  WITH CHECK (app_actor_owns_circle(circle_id));

CREATE POLICY items_owner_insert ON items FOR INSERT TO app_owned
  WITH CHECK (visibility = 'owner_visible' AND app_actor_owns_circle(circle_id));

DROP POLICY IF EXISTS items_friend_insert ON items;
CREATE POLICY items_friend_insert ON items FOR INSERT TO app_friend
  WITH CHECK (
    added_by_user_id = app_user_id()
    AND visibility = 'friend_only'
    AND app_actor_joined_circle(circle_id)
    AND circle_id = app_circle_id()
  );

DROP POLICY IF EXISTS items_friend_update ON items;
CREATE POLICY items_friend_update ON items FOR UPDATE TO app_friend
  USING (added_by_user_id = app_user_id() AND app_actor_joined_circle(circle_id))
  WITH CHECK (app_actor_joined_circle(circle_id));

-- ---------------------------------------------------------------------------
-- claims / pools / contributions — friend-scoped. Owner-blind by absence.
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS claims_friend_read ON claims;
CREATE POLICY claims_friend_read ON claims FOR SELECT TO app_friend
  USING (app_actor_joined_circle(app_circle_of_item(item_id)));

DROP POLICY IF EXISTS claims_friend_insert ON claims;
CREATE POLICY claims_friend_insert ON claims FOR INSERT TO app_friend
  WITH CHECK (
    user_id = app_user_id()
    AND app_actor_joined_circle(app_circle_of_item(item_id))
    AND (kind <> 'pool_member' OR app_circle_of_pool(pool_id) = app_circle_of_item(item_id))
  );

DROP POLICY IF EXISTS claims_friend_release ON claims;
CREATE POLICY claims_friend_release ON claims FOR UPDATE TO app_friend
  USING (user_id = app_user_id()) WITH CHECK (user_id = app_user_id());

DROP POLICY IF EXISTS pools_friend_read ON pools;
CREATE POLICY pools_friend_read ON pools FOR SELECT TO app_friend
  USING (app_actor_joined_circle(app_circle_of_item(item_id)));

DROP POLICY IF EXISTS pools_friend_open ON pools;
CREATE POLICY pools_friend_open ON pools FOR INSERT TO app_friend
  WITH CHECK (
    buyer_user_id = app_user_id()
    AND app_actor_joined_circle(app_circle_of_item(item_id))
  );

DROP POLICY IF EXISTS pools_friend_update ON pools;
CREATE POLICY pools_friend_update ON pools FOR UPDATE TO app_friend
  USING (app_actor_joined_circle(app_circle_of_item(item_id)))
  WITH CHECK (app_actor_joined_circle(app_circle_of_item(item_id)));

DROP POLICY IF EXISTS contributions_friend_read ON contributions;
CREATE POLICY contributions_friend_read ON contributions FOR SELECT TO app_friend
  USING (app_actor_joined_circle(app_circle_of_pool(pool_id)));

DROP POLICY IF EXISTS contributions_friend_promise ON contributions;
CREATE POLICY contributions_friend_promise ON contributions FOR INSERT TO app_friend
  WITH CHECK (
    user_id = app_user_id()
    AND app_actor_joined_circle(app_circle_of_pool(pool_id))
  );

DROP POLICY IF EXISTS contributions_friend_update ON contributions;
CREATE POLICY contributions_friend_update ON contributions FOR UPDATE TO app_friend
  USING (user_id = app_user_id() OR app_buyer_of_pool(pool_id) = app_user_id())
  WITH CHECK (user_id = app_user_id() OR app_buyer_of_pool(pool_id) = app_user_id());

-- ---------------------------------------------------------------------------
-- ingest_events — each side sees its own intake, nothing about anyone else's.
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS ingest_self ON ingest_events;
CREATE POLICY ingest_self ON ingest_events FOR ALL TO app_owned, app_friend
  USING (user_id = app_user_id() AND circle_id = app_circle_id())
  WITH CHECK (user_id = app_user_id() AND circle_id = app_circle_id());

-- ---------------------------------------------------------------------------
-- ledger_events — append-only history. The owner may read it, but friend-scoped
-- entities are filtered out here rather than trusting the writer not to log them.
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS ledger_owner_read ON ledger_events;
CREATE POLICY ledger_owner_read ON ledger_events FOR SELECT TO app_owned
  USING (
    app_actor_owns_circle(circle_id)
    AND entity NOT IN ('claim', 'pool', 'contribution', 'card_entry', 'gift_card')
  );

DROP POLICY IF EXISTS ledger_friend_read ON ledger_events;
CREATE POLICY ledger_friend_read ON ledger_events FOR SELECT TO app_friend
  USING (app_actor_joined_circle(circle_id));

DROP POLICY IF EXISTS ledger_friend_append ON ledger_events;
CREATE POLICY ledger_friend_append ON ledger_events FOR INSERT TO app_friend
  WITH CHECK (app_actor_joined_circle(circle_id));

DROP POLICY IF EXISTS ledger_owner_append ON ledger_events;
CREATE POLICY ledger_owner_append ON ledger_events FOR INSERT TO app_owned
  WITH CHECK (
    app_actor_owns_circle(circle_id)
    AND entity NOT IN ('claim', 'pool', 'contribution', 'card_entry', 'gift_card')
  );

-- ---------------------------------------------------------------------------
-- allowlist_entries — hashed phone numbers only; friends resolve their own hash on join.
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS allowlist_owner_write ON allowlist_entries;
CREATE POLICY allowlist_owner_write ON allowlist_entries FOR ALL TO app_owned
  USING (app_actor_owns_circle(circle_id))
  WITH CHECK (app_actor_owns_circle(circle_id) AND added_by = app_user_id());

DROP POLICY IF EXISTS allowlist_friend_read_own_hash ON allowlist_entries;
CREATE POLICY allowlist_friend_read_own_hash ON allowlist_entries FOR SELECT TO app_friend
  USING (
    circle_id = app_circle_id()
    AND phone_e164_hash = app_phone_hash()
  );

-- ---------------------------------------------------------------------------
-- card_entries / gift_cards — friend-scoped in full (F10). They carry contributor
-- names and messages, i.e. who bought what, so the owner role has no read policy.
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS card_entries_friend_read ON card_entries;
CREATE POLICY card_entries_friend_read ON card_entries FOR SELECT TO app_friend
  USING (app_actor_joined_circle(app_circle_of_item(item_id)));

DROP POLICY IF EXISTS card_entries_friend_write ON card_entries;
CREATE POLICY card_entries_friend_write ON card_entries FOR INSERT TO app_friend
  WITH CHECK (
    contributor_user_id = app_user_id()
    AND app_actor_joined_circle(app_circle_of_item(item_id))
  );

DROP POLICY IF EXISTS gift_cards_friend_read ON gift_cards;
CREATE POLICY gift_cards_friend_read ON gift_cards FOR SELECT TO app_friend
  USING (app_actor_joined_circle(app_circle_of_item(item_id)));

DROP POLICY IF EXISTS gift_cards_friend_update ON gift_cards;
DROP POLICY IF EXISTS gift_cards_friend_insert ON gift_cards;
DROP POLICY IF EXISTS gift_cards_friend_write ON gift_cards;
CREATE POLICY gift_cards_friend_update ON gift_cards FOR UPDATE TO app_friend
  USING (app_actor_joined_circle(app_circle_of_item(item_id)))
  WITH CHECK (app_actor_joined_circle(app_circle_of_item(item_id)));

CREATE POLICY gift_cards_friend_insert ON gift_cards FOR INSERT TO app_friend
  WITH CHECK (
    created_by_user_id = app_user_id()
    AND app_actor_joined_circle(app_circle_of_item(item_id))
  );
