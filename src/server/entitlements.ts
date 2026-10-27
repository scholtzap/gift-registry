import type { Actor, Tx } from '@/server/db/client';
import { AiCapability, UserPlan } from '@/generated/prisma/enums';

/**
 * One gate in front of every model-spending path. Nothing calls a Meta model without passing
 * through `can()` first, because a capability that runs after the user switched it off is a
 * consent failure, and consent failures rank with privacy leaks rather than with bugs.
 *
 * Consent is the **actor's**: the switch that gates a call belongs to whoever triggered it, so a
 * friend who turned transcription off never has their own voice note transcribed inside someone
 * else's circle. Budget is the circle owner's — but no tier limit exists in v1, so the owner's
 * plan is not read here yet. When limits arrive they attach to this function; callers do not
 * change, which is the entire reason there is one gate instead of a check per feature.
 *
 * The read runs on the caller's transaction, so it is inside the actor's `SET LOCAL ROLE` and
 * RLS decides whose entitlement rows exist. There is no way to ask the gate about another user.
 */

export type { AiCapability, UserPlan };

export const AI_CAPABILITIES = Object.values(AiCapability);

/**
 * What a plan grants when the user has never touched the switch. A row always wins over this,
 * which is what makes "turn it off" survive a plan change and "turn it back on" survive a
 * downgrade the user paid for.
 *
 * `internal` exists so the seeded demo cast and the recording never hit a tier wall, and so a
 * judge can be given an account that behaves like a paid one without a billing provider.
 * `deal_search` is off everywhere: the switch exists before the feature does, so reviving the
 * deferred deal spike is a data change, not a migration.
 */
export const PLAN_DEFAULTS: Record<UserPlan, ReadonlySet<AiCapability>> = {
  free: new Set<AiCapability>([
    AiCapability.voice_transcribe,
    AiCapability.photo_extract,
    AiCapability.link_expand,
    AiCapability.card_pun,
  ]),
  premium: new Set<AiCapability>([
    AiCapability.voice_transcribe,
    AiCapability.photo_extract,
    AiCapability.link_expand,
    AiCapability.card_pun,
    AiCapability.card_art,
    AiCapability.assistant_reply,
  ]),
  internal: new Set<AiCapability>(AI_CAPABILITIES),
};

/**
 * The reason shown when a capability is off. Never inferred by the caller and never a silent
 * no-op: the degraded screen renders this string, so "why did this not work?" has one answer
 * that is the same in the UI, in the log and in the support conversation.
 */
export const DEGRADED_COPY: Record<AiCapability, string> = {
  [AiCapability.voice_transcribe]: 'Voice intake is off. Type the gift instead.',
  [AiCapability.photo_extract]: 'Photo details are off. Add the gift by hand from the menu.',
  [AiCapability.link_expand]: 'Link details are off. Paste the link, then fill in the title and price yourself.',
  [AiCapability.card_pun]: 'Card wording is off. Write your own line.',
  [AiCapability.card_art]: 'Generated card art is off. The card ships as the plain version.',
  [AiCapability.assistant_reply]: 'The assistant is off. The fixed menu still works.',
  [AiCapability.deal_search]: 'Deal search is off. Friends see the link you pasted, unchanged.',
};

/**
 * How each switch is named in the actor's own settings screen, kept beside `DEGRADED_COPY` so
 * the row and the message it degrades to can never call the same capability two different
 * things. Descriptions state what the switch permits and nothing else: no audience, no tier,
 * no claim about a feature that does not exist yet.
 */
export const CAPABILITY_COPY: Record<AiCapability, { label: string; description: string }> = {
  [AiCapability.voice_transcribe]: {
    label: 'Voice intake',
    description: 'Turn a spoken note into an item draft, which you confirm before it is added.',
  },
  [AiCapability.photo_extract]: {
    label: 'Photo details',
    description: 'Read a title and price from a product photo into the same kind of draft.',
  },
  [AiCapability.link_expand]: {
    label: 'Link details',
    description: 'Fill in the title, retailer and price from a link you paste.',
  },
  [AiCapability.card_pun]: {
    label: 'Card wording',
    description: 'Suggest the line at the top of the gift card. Your own messages are never rewritten.',
  },
  [AiCapability.card_art]: {
    label: 'Card artwork',
    description: 'Generate the artwork that sits on the gift card.',
  },
  [AiCapability.assistant_reply]: {
    label: 'Assistant replies',
    description: 'Let the assistant write the words of a status answer. It never decides what happens next.',
  },
  [AiCapability.deal_search]: {
    label: 'Deal search',
    description: 'Search the open web for a cheaper way to buy a gift.',
  },
};

/** A capability the actor switched off. Degrade visibly; do not retry, do not spend a token. */
export class CapabilityOffError extends Error {
  readonly capability: AiCapability;
  readonly degraded: string;

  constructor(capability: AiCapability) {
    super(`capability_off: ${capability}`);
    this.name = 'CapabilityOffError';
    this.capability = capability;
    this.degraded = DEGRADED_COPY[capability];
  }
}

/**
 * The gate could not be evaluated — the row read failed, the actor is unknown, the database is
 * unreachable. Distinct from `CapabilityOffError` on purpose: "you turned this off" is a setting
 * the user can change, "we could not check" is an outage, and rendering one as the other sends
 * the user to a switch that is already on.
 */
export class CapabilityUnavailableError extends Error {
  readonly capability: AiCapability;

  constructor(capability: AiCapability, cause: unknown) {
    super(`capability_unavailable: ${capability}`, { cause });
    this.name = 'CapabilityUnavailableError';
    this.capability = capability;
  }
}

/**
 * The single evaluation, shared by `can` and `assertCan` so the two can never disagree — a gate
 * where the boolean form says yes and the throwing form says no is worse than either alone.
 * Throws on anything it cannot resolve; callers decide whether that means "refuse" or "outage".
 */
async function evaluate(tx: Tx, actor: Actor, capability: AiCapability): Promise<boolean> {
  const [row, me] = await Promise.all([
    tx.entitlement.findUnique({
      where: { userId_capability: { userId: actor.userId, capability } },
      select: { enabled: true, expiresAt: true, source: true },
    }),
    tx.user.findUnique({ where: { id: actor.userId }, select: { plan: true } }),
  ]);

  if (!me) throw new Error('actor_not_visible_to_itself');

  // User choices do not expire with the grant they replaced.
  if (row && (row.source === 'user' || row.expiresAt === null || row.expiresAt.getTime() > Date.now())) return row.enabled;

  return PLAN_DEFAULTS[me.plan].has(capability);
}

/**
 * True only when the actor's own switch says so, or when they have no row and their plan grants
 * it. Anything unexpected is `false`: failing closed means a missing row can never become an
 * unintended model call, the same reasoning as `demoMode` in `src/lib/env.ts`.
 */
export async function can(tx: Tx, actor: Actor, capability: AiCapability): Promise<boolean> {
  try {
    return await evaluate(tx, actor, capability);
  } catch (cause) {
    console.error(`entitlement_gate_failed: ${capability} for ${actor.userId}`, cause);
    return false;
  }
}

/** The spending path's entry point: it throws instead of returning, so the call site cannot ignore it. */
export async function assertCan(tx: Tx, actor: Actor, capability: AiCapability): Promise<void> {
  let allowed: boolean;
  try {
    allowed = await evaluate(tx, actor, capability);
  } catch (cause) {
    throw new CapabilityUnavailableError(capability, cause);
  }
  if (!allowed) throw new CapabilityOffError(capability);
}

/**
 * F12's toggle. An upsert on `(user_id, capability)` so a double tap cannot create two
 * conflicting rows, and `source: 'user'` so a later plan change knows this row was the user's
 * choice and not a grant it may revoke.
 */
export async function setCapability(
  tx: Tx,
  actor: Actor,
  capability: AiCapability,
  enabled: boolean,
): Promise<void> {
  await tx.entitlement.upsert({
    where: { userId_capability: { userId: actor.userId, capability } },
    create: { userId: actor.userId, capability, enabled, source: 'user', expiresAt: null },
    update: { enabled, source: 'user', expiresAt: null },
  });
}
