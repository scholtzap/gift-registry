# Ledger worker output

## Scope and result

Changed only:

- `C:/Users/apsch/Documents/personal/gifts-registry/src/server/ledger/index.ts`
- `C:/Users/apsch/Documents/personal/gifts-registry/tests/ledger/transitions.test.ts`
- `C:/Users/apsch/Documents/personal/gifts-registry/docs/operations/parallel-agent-outputs/ledger.md`

Ordinary owner-authored gift claims, releases, pool opening, contributions, paid-total funding, and friend-only item confirmation now succeed through actor-scoped transactions on real PostgreSQL. Secret suggestion items and their actual `item.added` events are owner-hidden under the parent's applied policy repair. Group purchase, circle creation, and owner tombstone/pool pivot remain fail-closed.

No SQL, schema, policies, configuration, dependencies, other source files, or tests were edited. No Git operations, live APIs, subagents, secrets, policy mutation, or deliberate red-proof run were used. Changes remain uncommitted as instructed.

## Locking and authorization

`lockItem` now acquires the transaction-scoped lock:

```sql
SELECT pg_advisory_xact_lock(
  hashtextextended('ledger:item:' || $1::uuid::text, 0)
);
```

The implementation uses parameterized Prisma SQL. PostgreSQL's UUID cast canonicalizes case/spelling before hashing; all actors targeting the same item use the same key. Commit or rollback automatically releases the lock. The subsequent item lookup is an ordinary RLS-protected SELECT, not `SELECT FOR UPDATE`, so friends do not need UPDATE permission on owner-authored items.

`claimItem`, `releaseClaim`, and `createPool` use this lock directly. `contribute`, `markPaid`, and `purchasePool` resolve the pool through RLS, acquire its item lock, then acquire the pool-row lock and re-read the pool. The row-lock query checks the item association and circle. The ordering is always item advisory lock, then pool row, then purchase claims. The internal pool-member claim helper runs only after this shared lock has been acquired.

Actual PostgreSQL role, actor and circle GUCs, active circle, active membership with the matching role, and circle ownership versus friend role are still verified. No role switch or login-role fallback was added. Advisory locking is cooperative serialization for these ledger operations, not a replacement for RLS or a database uniqueness constraint against arbitrary direct writes.

## Public behavior

All exports retain `(tx: Tx, actor: Actor, ...)`; the caller obtains `tx` with `db.withActor(actor, ...)` and owns commit/rollback. Let errors escape the transaction callback. State and append-only events share that transaction.

- `claimItem` reserves an active confirmed item once; competing friends cannot both win. A released solo claim can be reused.
- `releaseClaim` releases only the actor's own solo claim, with idempotent retries.
- `createPool` excludes solo reservations, assigns the actor as buyer, and creates their pool-member claim. Identical buyer/target retries return the same pool.
- `contribute` creates the actor's positive ZAR promise and pool-member claim. Same-amount retries reuse the contribution; conflicting amounts are rejected. Promises alone do not fund a pool.
- `markPaid` marks only the actor's own contribution. Database-read paid amounts and BigInt arithmetic drive the funding threshold; simultaneous payments emit one funding event.
- `addItem` is human confirmation. Owner items are `owner_visible`; friend items are `friend_only`. Parsed own ingest events are locked and confirmed once, including simultaneous retries. The friend's real item event is appended normally, not disguised as another entity.
- Item prices accept integer minor units from **0** through **2147483647**. Unknown price stays omitted/undefined in input and is stored as NULL; it is not coerced to zero. Pool targets and contribution amounts remain strictly positive. Fractional, non-finite, negative, out-of-range, unsupported, and mixed legacy currency values are rejected as appropriate.
- Singleton buyer-only funded purchase still settles the buyer's paid contribution and fulfills their own claim. Successful multi-user purchase is not claimed.

## Real PostgreSQL evidence

The test server reported **PostgreSQL 16.15**. Read-only policy inspection initially found the old owner-event filter still deployed, then observed the parent's applied `actor_user_id = app_user_id()` repair before the friend-add success run. This worker did not apply it.

Every validation run used the existing Vitest configuration with the programmatic `startVitest` override `{ run: true, globalSetup: [] }`. A `configResolved` guard refused execution if any global setup remained. This avoided the normal setup's migrations/policy application while testing the already-prepared database. `LEAK_SKIP_POLICIES` was never used. Commands used the Qoder-managed Node executable with `ELECTRON_RUN_AS_NODE=1`.

**Final ledger suite: 26 passed, no skipped tests.** Evidence includes:

- Successful claim of an owner-authored item while a friend UPDATE of that same item affects zero rows; owner projection and readable ledger remain unchanged.
- Two simultaneous competing friends produce exactly one solo reservation and one reservation error; only the winner can release it, after which the other friend can claim it.
- Simultaneous solo claim versus pool opening yields exactly one reservation mechanism, never both.
- Duplicate claims, release/reclaim, pool opening, contribution promises, and paid retries return stable rows with deduplicated events.
- Different friends can contribute and mark paid on an owner-authored item. Concurrent payments fund once, while owner claim/pool/contribution reads remain empty and owner projection/events remain unchanged.
- `pg_locks` shows an actual waiting advisory lock for a competing claim. Aborting the holder rolls back its claim/event, releases the lock, and lets the other friend claim. The holder uses uppercase UUID text and the waiter lowercase, proving canonical keys.
- Parameterized tests for `contribute`, `markPaid`, and `purchasePool` observe their blocked advisory locks and absence of a pool `RowShareLock` until the item lock is released, then verify successful completion.
- Contribution rollback removes both the new member claim and promise/event; pool-creation rollback removes pool/claim/events; paid/funding rollback preserves promised/open state and event counts. Subsequent calls succeed.
- Concurrent friend ingest confirmation inserts one secret item/event. The owner cannot read either by ID or through a broad ledger scan; their view stays identical. Another friend sees and claims the suggestion.
- Owner draft confirmation, zero versus unknown item prices, positive-only pool/contribution money, scope/role/membership denial, mixed legacy currencies, and fulfilled-claim preservation.

Final focused regression run: **58 passed** across ledger (26), owner blindness (16), projections (5), and entitlements (11). Separate final circle-link run: **23 passed**. Total across the five files in these final runs: **81 passed, no skips**. `tsc --noEmit --incremental false` passed after fixing the new tests' strict-indexing errors.

An earlier combined regression found 12 circle-link failures and missing `handleCircleGet`/`handleCirclePost` exports in concurrently edited route files outside this worker's scope. The exports recovered without this worker editing them; the final typecheck and circle-link rerun passed. Existing pg query-deprecation warnings and the entitlement suite's intentional fail-closed log remain.

## Remaining blockers

1. **Group purchase:** RLS permits only own claim updates. `purchasePool` compares readable active claims with lockable claims before mutation and raises `ledger_policy_blocked:purchase_claims` when another contributor's claim cannot be transitioned. The real group test preserves funded pool, marked-paid contributions, claimed reservations, and no purchase event. A narrow safe database mechanism is still required.
2. **Circle creation:** no owner membership INSERT policy/mechanism exists. `createCircle` validates its owner session/input and raises `ledger_policy_blocked:circle_membership` before creating an orphan circle. Creation, stable slug, owner membership, and allowlist remain unimplemented as an atomic operation.
3. **Owner tombstone/pivot:** owners cannot read/update surviving pools. `tombstoneItem` validates role, scope, ownership and reason, then raises `ledger_policy_blocked:tombstone_pool_pivot`. The real test confirms unchanged owner view, pool, and events. Atomic tombstone with money-preserving pivot needs an owner-safe database mechanism.

No payment integration, pivot/refund/reallocation workflow, promise resizing/cancellation, reveal/card/notification work, or route wiring was added. The removed item-lock and secret-event blockers are not presented as fixes for the remaining three mechanisms.
