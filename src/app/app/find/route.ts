import type { NextRequest } from "next/server";
import { getAppDb } from "@/server/db/client";
import { handleFindGet, handleFindPost } from "@/server/routes/otp";

/** Adapter only. The find-my-circles flow lives in `src/server/routes/otp.ts`. */
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  return handleFindGet(getAppDb());
}

export async function POST(request: NextRequest): Promise<Response> {
  return handleFindPost(getAppDb(), request);
}
