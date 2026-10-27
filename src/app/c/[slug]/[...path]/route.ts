import type { NextRequest } from 'next/server';
import { getAppDb } from '@/server/db/client';
import { handleCircleGet, handleCirclePost } from '@/server/routes/circle';

export const dynamic = 'force-dynamic';
type Context = { params: Promise<{ slug: string; path: string[] }> };

export async function GET(request: NextRequest, context: Context): Promise<Response> {
  const { slug } = await context.params;
  return handleCircleGet(getAppDb(), request, slug);
}

export async function POST(request: NextRequest, context: Context): Promise<Response> {
  const { slug } = await context.params;
  return handleCirclePost(getAppDb(), request, slug);
}
