import type { NextRequest } from "next/server";
import { getAppDb } from "@/server/db/client";
import { handleHubCreatePost } from "@/server/routes/hub";

/** Adapter only. Validation, ledger createCircle and owner session issuance live in `src/server/routes/hub.ts`. */
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest): Promise<Response> {
  return handleHubCreatePost(getAppDb(), request);
}
