import type { NextRequest } from "next/server";
import { getAppDb } from "@/server/db/client";
import { handleLookupGet, handleLookupPost } from "@/server/routes/lookup";

/**
 * Adapter only. The always-200 rule, the throttle and the create path live in
 * `src/server/routes/lookup.ts` so they can be tested without booting Next.
 * The number is a lookup key in the POST body, never a URL segment.
 */
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest): Promise<Response> {
  return handleLookupPost(getAppDb(), request);
}

export async function GET(): Promise<Response> {
  return handleLookupGet();
}
