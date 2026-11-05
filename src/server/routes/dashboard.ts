import type { Db } from '@/server/db/client';
import { isSameOrigin } from '@/server/auth/same-origin';
import { sessionFromRequest } from '@/server/auth/session';
import { setMembershipDashboardHidden } from '@/server/views/dashboard';
import { z } from 'zod';

const BASE = process.env.PINATA_BASE_PATH ?? '';

/**
 * Dashboard list hygiene: archive / restore a friend membership from the active
 * list. Login-role write; does not leave the circle.
 */
export async function handleDashboardPost(db: Db, request: Request): Promise<Response> {
  const home = `${BASE}/app`;
  if (!isSameOrigin(request)) {
    return Response.redirect(new URL(home, request.url), 303);
  }
  const session = sessionFromRequest(request);
  if (!session) return Response.redirect(new URL(home, request.url), 303);
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.redirect(new URL(home, request.url), 303);
  }
  const intent = String(form.get('intent') ?? '');
  const circleId = String(form.get('circleId') ?? '');
  if (!z.uuid().safeParse(circleId).success) {
    return Response.redirect(new URL(home, request.url), 303);
  }
  if (intent === 'archive') {
    await setMembershipDashboardHidden(db, session.userId, circleId, true);
  } else if (intent === 'unarchive') {
    await setMembershipDashboardHidden(db, session.userId, circleId, false);
  }
  return Response.redirect(new URL(home, request.url), 303);
}
