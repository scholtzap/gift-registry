import type { NextRequest } from "next/server";
import { getAppDb } from "@/server/db/client";
import { handleRegistryPost } from "@/server/routes/registry";

/** Adapter only. Registry writes live in `src/server/routes/registry.ts`. */
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest): Promise<Response> {
  return handleRegistryPost(getAppDb(), request);
}
