import { z } from 'zod';
import { requestBytes } from './http';
import imageFixture from '../../../tests/fixtures/whatsapp/media.json';
import voiceFixture from '../../../tests/fixtures/models/pcm16-silence.json';

export interface MediaConfig { accessToken: string; graphVersion: string; demoMode?: 'on' | 'off' }

/** Download on ingest: Meta media IDs expire in seven days, signed URLs in five minutes. */
export async function downloadMedia(mediaId: string, kind: 'audio' | 'image', config: MediaConfig, http: typeof fetch = fetch): Promise<{ bytes: Uint8Array; mimeType: string }> {
  if (config.demoMode === 'on') return kind === 'image' ? { bytes: Buffer.from(imageFixture.pngBase64, 'base64'), mimeType: 'image/png' } : { bytes: Buffer.from(voiceFixture.wavBase64, 'base64'), mimeType: 'audio/wav' };
  if (!config.accessToken) throw new Error('whatsapp_not_configured');
  if (!/^[A-Za-z0-9_-]{1,512}$/.test(mediaId) || !/^v\d+\.\d+$/.test(config.graphVersion)) throw new Error('media_id_rejected');
  const headers = { Authorization: `Bearer ${config.accessToken}` };
  const info = await requestBytes(http, `https://graph.facebook.com/${config.graphVersion}/${encodeURIComponent(mediaId)}`, { headers }, 65536, 5000);
  const metadata = z.object({ url: z.string().url(), mime_type: z.string(), file_size: z.number().int().nonnegative().optional() }).parse(JSON.parse(info.bytes.toString('utf8')));
  const url = new URL(metadata.url);
  if (url.protocol !== 'https:' || url.hostname !== 'lookaside.fbsbx.com' || url.username || url.password || (url.port && url.port !== '443')) throw new Error('media_url_rejected');
  const mimeType = metadata.mime_type.split(';')[0]!.trim().toLowerCase();
  const allowed = kind === 'audio' ? ['audio/ogg', 'audio/opus', 'audio/mpeg', 'audio/mp4', 'audio/aac', 'audio/amr'] : ['image/jpeg', 'image/png'];
  if (!allowed.includes(mimeType)) throw new Error('media_type_rejected');
  const limit = (kind === 'image' ? 5 : 16) * 1024 * 1024;
  if (metadata.file_size !== undefined && metadata.file_size > limit) throw new Error('body_too_large');
  const result = await requestBytes(http, url.href, { headers }, limit, 10000);
  const responseType = result.contentType.split(';')[0]!.trim().toLowerCase();
  if (responseType && responseType !== 'application/octet-stream' && !allowed.includes(responseType)) throw new Error('media_type_rejected');
  if (result.bytes.length === 0) throw new Error('media_empty');
  return { bytes: result.bytes, mimeType };
}
