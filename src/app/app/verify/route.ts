import type { NextRequest } from "next/server";
import { getAppDb } from "@/server/db/client";
import { handleVerifyPost } from "@/server/routes/otp";

/** Adapter only. Code verification lives in `src/server/routes/otp.ts`. */
export const dynamic = "force-dynamic";

const BASE = process.env.PINATA_BASE_PATH ?? "";

export async function GET(): Promise<Response> {
  return new Response(null, { status: 303, headers: { Location: `${BASE}/app/find` } });
}

export async function POST(request: NextRequest): Promise<Response> {
  return handleVerifyPost(getAppDb(), request);
}
