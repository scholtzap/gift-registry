import type { NextRequest } from "next/server";
import { getAppDb } from "@/server/db/client";
import { handleCircleGet, handleCirclePost } from "@/server/routes/circle";

/**
 * Adapter only. The role split, the 404-not-403 rule and the no-store rule live in
 * `src/server/routes/circle.ts` so they can be tested without booting Next.
 *
 * This URL is pasted into a WhatsApp group and must never move. When the brand round lands and
 * the placeholder markup becomes a styled `page.tsx`, this file is what gets replaced — the
 * module behind it and its tests stay.
 */

// One URL renders two different projections depending on the caller's role, so it can never be
// statically generated or cached by Next.
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ slug: string }> };

export async function GET(request: NextRequest, context: Context): Promise<Response> {
  const { slug } = await context.params;
  return handleCircleGet(getAppDb(), request, slug);
}

export async function POST(request: NextRequest, context: Context): Promise<Response> {
  const { slug } = await context.params;
  return handleCirclePost(getAppDb(), request, slug);
}
