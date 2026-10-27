import type { createModelClient, ModelEvidence, WishDraft } from '@/server/models/client';
import { convertVoice } from './voice';
import { expandRetailerLink } from './link';

export interface CandidateDraft {
  index: number; state: 'pending'; title: string; brand: string | null; size: string | null;
  priceMinor: number | null; currency: 'ZAR'; canonicalUrl: string | null; imagePath: string | null;
}
export interface IntakeInput {
  kind: 'audio' | 'image' | 'url'; bytes?: Uint8Array; mimeType?: string; url?: string;
  transcript?: string; evidence?: ModelEvidence[];
}
export interface IntakeStep {
  status: 'converted' | 'transcribed' | 'parsed'; evidence: ModelEvidence[];
  transcript?: string; candidates?: CandidateDraft[];
}
export interface PipelineOptions { ffmpegPath: string; demoMode?: 'on' | 'off'; convert?: (bytes: Uint8Array) => Promise<Buffer>; imagePath?: string; http?: typeof fetch }

function candidate(wish: WishDraft, imagePath: string | null = null): CandidateDraft {
  return { index: 0, state: 'pending', title: wish.title, brand: wish.brand, size: wish.size, priceMinor: wish.price_minor, currency: 'ZAR', canonicalUrl: wish.canonical_url_guess, imagePath };
}

/** Caller persists each yield in a short transaction; no transaction spans an external call. */
export async function* intakeSteps(input: IntakeInput, models: ReturnType<typeof createModelClient>, options: PipelineOptions): AsyncGenerator<IntakeStep> {
  const evidence = [...(input.evidence ?? [])];
  if (input.kind === 'audio') {
    let transcript = input.transcript;
    if (!transcript) {
      if (!input.bytes) throw new Error('media_missing');
      const wav = await (options.convert ? options.convert(input.bytes) : convertVoice(input.bytes, options.ffmpegPath));
      yield { status: 'converted', evidence: [...evidence] };
      const result = await models.transcribe(wav);
      transcript = result.text;
      evidence.push(result.evidence);
      yield { status: 'transcribed', transcript, evidence: [...evidence] };
    }
    const result = await models.parseWish(transcript, 'voice_transcribe');
    evidence.push(result.evidence);
    yield { status: 'parsed', transcript, evidence, candidates: [candidate(result.wish)] };
    return;
  }
  if (input.kind === 'image') {
    if (!input.bytes || !input.mimeType) throw new Error('media_missing');
    const result = await models.parseWish('Extract the product in this supplied screenshot. Return one draft, not a cutout or an action.', 'photo_extract', { bytes: input.bytes, mimeType: input.mimeType });
    evidence.push(result.evidence);
    yield { status: 'parsed', evidence, candidates: [candidate(result.wish, options.imagePath ?? null)] };
    return;
  }
  if (!input.url) throw new Error('retailer_url_missing');
  await models.requireCapability('link_expand');
  // Explicit demos use the committed model fixture; they never scrape a live retailer.
  const metadata = options.demoMode === 'on' ? null : await expandRetailerLink(input.url, options.http);
  if (metadata) { yield { status: 'parsed', evidence, candidates: [candidate(metadata)] }; return; }
  const result = await models.parseWish(`Extract a draft for the supplied retailer link. Never invent a price: ${input.url}`, 'link_expand');
  evidence.push(result.evidence);
  yield { status: 'parsed', evidence, candidates: [candidate({ ...result.wish, canonical_url_guess: input.url })] };
}
