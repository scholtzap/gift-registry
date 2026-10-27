import { z } from 'zod';
import type { InboundMessage } from '@/server/wa/protocol';
import { validateCardEntry, type CardEntryInput } from '@/server/cards/validation';

export const FIXED_MENU = 'Piñata AI helps with six tasks only: Voice wish; Photo wish; Link wish; Status; Claim or join a pool; Your card message. Open your circle link for choices and confirmation. If you have multiple circles, open the intended circle link first.';

/** Deterministic acknowledgement of the actor's validated line and stored confirmation. */
export function cardConfirmationReply(entry: CardEntryInput, previous: CardEntryInput | null): string {
  if (previous && (previous.message !== entry.message || previous.anonymous !== entry.anonymous || previous.displayNameShown !== entry.displayNameShown)) {
    return 'Piñata AI: A different card message was already confirmed. This line was not saved. Open your circle to review it. Nothing is sent to the gift recipient.';
  }
  return 'Piñata AI: Your card message is saved. Nothing is sent to the gift recipient.';
}

const uuid = z.string().uuid();
const amount = z.number().int().positive().max(2147483647);
const taskSchema = z.union([
  z.object({ task: z.literal('add_by_voice') }).strict(),
  z.object({ task: z.literal('add_by_photo') }).strict(),
  z.object({ task: z.literal('add_by_link'), url: z.string().url().max(2048).refine(url => new URL(url).protocol === 'https:') }).strict(),
  z.object({ task: z.literal('check_status') }).strict(),
  z.object({ task: z.literal('claim_or_pool'), action: z.literal('claim'), itemId: uuid }).strict(),
  z.object({ task: z.literal('claim_or_pool'), action: z.literal('join_pool'), poolId: uuid, amountMinor: amount }).strict(),
  z.object({ task: z.literal('claim_or_pool'), action: z.literal('not_now') }).strict(),
  z.object({ task: z.literal('write_card_message'), itemId: uuid, message: z.string().max(400), anonymous: z.boolean(), displayNameShown: z.string().max(160), confirmed: z.boolean().optional() }).strict(),
]);
export type TaskIntent = z.infer<typeof taskSchema>;
export type TaskRoute = { type: 'menu'; reply: string } | { type: 'task'; intent: TaskIntent };

/** Only explicit message types and payloads route; text is never interpreted by a model. */
export function routeWhatsAppTask(message: InboundMessage): TaskRoute {
  const menu: TaskRoute = { type: 'menu', reply: FIXED_MENU };
  let input: unknown;
  if (message.kind === 'audio' && message.mediaId) input = { task: 'add_by_voice' };
  else if (message.kind === 'image' && message.mediaId) input = { task: 'add_by_photo' };
  else if (message.kind === 'url' && message.text) input = { task: 'add_by_link', url: message.text };
  else if (message.interactiveId) {
    try { input = JSON.parse(message.interactiveId); } catch { return menu; }
  } else return menu;
  const parsed = taskSchema.safeParse(input);
  if (!parsed.success) return menu;
  if (parsed.data.task === 'write_card_message') {
    try { validateCardEntry({ displayNameShown: parsed.data.displayNameShown, message: parsed.data.message, anonymous: parsed.data.anonymous }); }
    catch { return menu; }
  }
  return { type: 'task', intent: parsed.data };
}
