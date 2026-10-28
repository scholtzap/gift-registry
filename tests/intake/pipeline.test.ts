import { expect, it } from 'vitest';
import { createModelClient } from '@/server/models/client';
import { intakeSteps } from '@/server/intake/pipeline';
import silence from '../fixtures/models/pcm16-silence.json';

it('checkpoints voice transcription before parsing and leaves one pending draft requiring human confirmation', async () => {
  const permissions: string[] = [];
  const models = createModelClient({ demoMode: 'on', baseUrl: 'https://api.meta.ai/v1' }, async c => { permissions.push(c); });
  const steps = [];
  for await (const step of intakeSteps({ kind: 'audio', bytes: Buffer.from('fictional-source-audio') }, models, { ffmpegPath: 'fixture-ffmpeg', convert: async () => Buffer.from(silence.wavBase64, 'base64') })) steps.push(step);
  expect(steps.map(step => step.status)).toEqual(['converted', 'transcribed', 'parsed']);
  expect(steps[1]).toMatchObject({ transcript: 'I would like a fictional bicycle lamp.' });
  expect(steps[2]).toMatchObject({ candidates: [{ index: 0, state: 'pending', title: 'Fictional bicycle lamp', priceMinor: 12500, currency: 'USD', canonicalUrl: null }], evidence: [{ model: 'muse-voice-transcribe-1.0', mode: 'demo_fixture' }, { model: 'muse-spark-1.2', mode: 'demo_fixture' }] });
  expect(permissions).toEqual(['voice_transcribe', 'voice_transcribe']);
});

it('uses the same pending-draft contract for metadata-only links and photo extraction', async () => {
  const models = createModelClient({ demoMode: 'on', baseUrl: 'https://api.meta.ai/v1' }, async () => undefined);
  const http: typeof fetch = async () => new Response('<meta property="og:title" content="Fictional lamp"><meta property="product:price:amount" content="125.50"><meta property="product:price:currency" content="ZAR">', { headers: { 'content-type': 'text/html' } });
  const link = [];
  for await (const step of intakeSteps({ kind: 'url', url: 'https://www.specialized.com/fictional-lamp' }, models, { ffmpegPath: 'unused', http })) link.push(step);
  expect(link).toMatchObject([{ status: 'parsed', evidence: [], candidates: [{ state: 'pending', title: 'Fictional lamp', priceMinor: 12550 }] }]);
  const photo = [];
  for await (const step of intakeSteps({ kind: 'image', bytes: new Uint8Array([255, 216, 255]), mimeType: 'image/jpeg' }, models, { ffmpegPath: 'unused', imagePath: '/trusted/media/fixture-image.bin' })) photo.push(step);
  expect(photo).toMatchObject([{ status: 'parsed', candidates: [{ state: 'pending', imagePath: '/trusted/media/fixture-image.bin' }], evidence: [{ mode: 'demo_fixture' }] }]);
});

it('refuses metadata network fetches too when link expansion consent is off', async () => {
  let calls = 0;
  const models = createModelClient({ demoMode: 'on', baseUrl: 'https://api.meta.ai/v1' }, async () => { throw new Error('capability_off'); });
  const http: typeof fetch = async () => { calls++; return new Response('<meta property="og:title" content="Fictional lamp"><meta property="product:price:amount" content="125.50"><meta property="product:price:currency" content="ZAR">', { headers: { 'content-type': 'text/html' } }); };
  const run = async () => { for await (const _step of intakeSteps({ kind: 'url', url: 'https://www.specialized.com/fictional-lamp' }, models, { ffmpegPath: 'unused', http })) { /* consume public pipeline */ } };
  await expect(run()).rejects.toThrow('capability_off');
  expect(calls).toBe(0);
});

it('rechecks consent between transcription and parsing instead of spending under a stale earlier grant', async () => {
  let off = false;
  const models = createModelClient({ demoMode: 'on', baseUrl: 'https://api.meta.ai/v1' }, async () => { if (off) throw new Error('capability_off'); });
  const iterator = intakeSteps({ kind: 'audio', bytes: Buffer.from('fictional-source') }, models, { ffmpegPath: 'unused', convert: async () => Buffer.from(silence.wavBase64, 'base64') });
  expect((await iterator.next()).value?.status).toBe('converted');
  expect((await iterator.next()).value?.status).toBe('transcribed');
  off = true;
  await expect(iterator.next()).rejects.toThrow('capability_off');
});

it('resumes from a saved transcript without rerunning conversion or ASR', async () => {
  const calls: string[] = [];
  const models = createModelClient({ demoMode: 'on', baseUrl: 'https://api.meta.ai/v1' }, async capability => { calls.push(capability); });
  const steps = [];
  for await (const step of intakeSteps({ kind: 'audio', transcript: 'Saved fictional transcript', evidence: [{ model: 'muse-voice-transcribe-1.0', mode: 'demo_fixture', inputTokens: null, outputTokens: null, latencyMs: 0 }] }, models, { ffmpegPath: 'unused', convert: async () => { throw new Error('conversion_should_not_repeat'); } })) steps.push(step);
  expect(steps.map(step => step.status)).toEqual(['parsed']);
  expect(calls).toEqual(['voice_transcribe']);
});

it('keeps explicit demo link intake offline and labels the committed fixture rather than fetching a retailer', async () => {
  let calls = 0;
  const http: typeof fetch = async () => { calls++; throw new Error('demo_must_not_fetch'); };
  const models = createModelClient({ demoMode: 'on', baseUrl: 'https://api.meta.ai/v1' }, async () => undefined, http);
  const steps = [];
  for await (const step of intakeSteps({ kind: 'url', url: 'https://www.specialized.com/fictional-lamp' }, models, { ffmpegPath: 'unused', http, ...{ demoMode: 'on' as const } })) steps.push(step);
  expect(calls).toBe(0);
  expect(steps).toMatchObject([{ status: 'parsed', candidates: [{ state: 'pending', title: 'Fictional bicycle lamp', priceMinor: 12500 }], evidence: [{ mode: 'demo_fixture', model: 'muse-spark-1.2' }] }]);
});

it('threads the circle default currency into candidates when the caller supplies it', async () => {
  const models = createModelClient({ demoMode: 'on', baseUrl: 'https://api.meta.ai/v1' }, async () => undefined);
  const steps = [];
  for await (const step of intakeSteps({ kind: 'image', bytes: new Uint8Array([255, 216, 255]), mimeType: 'image/jpeg' }, models, { ffmpegPath: 'unused', imagePath: '/trusted/media/fixture-image.bin', currency: 'ZAR' })) steps.push(step);
  expect(steps[0]).toMatchObject({ candidates: [{ currency: 'ZAR' }] });
});
