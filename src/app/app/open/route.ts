import type { NextRequest } from "next/server";
import { getAppDb } from "@/server/db/client";
import { handleHubOpenPost } from "@/server/routes/hub";

/** Adapter only. Slug parsing lives in `src/server/routes/hub.ts`; existence is decided by `/c/<slug>`, never here. */
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest): Promise<Response> {
  return handleHubOpenPost(getAppDb(), request);
}
