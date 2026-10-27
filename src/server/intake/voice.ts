import { spawn } from 'node:child_process';

export type FfmpegRunner = (command: string, args: string[], input: Uint8Array) => Promise<Buffer>;
const MAX_WAV = 20 * 1024 * 1024;

const runFfmpeg: FfmpegRunner = (command, args, input) => new Promise((resolve, reject) => {
  const child = spawn(command, args, { shell: false, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
  let done = false;
  let size = 0;
  const chunks: Buffer[] = [];
  const finish = (error?: Error) => {
    if (done) return;
    done = true;
    clearTimeout(timer);
    if (error) { child.kill(); reject(error); }
    else resolve(Buffer.concat(chunks, size));
  };
  const timer = setTimeout(() => finish(new Error('voice_conversion_timeout')), 15000);
  child.on('error', () => finish(new Error('voice_converter_unavailable')));
  child.stdin.on('error', () => finish(new Error('voice_conversion_failed')));
  child.stdout.on('data', (chunk: Buffer) => {
    size += chunk.length;
    if (size > MAX_WAV) finish(new Error('voice_output_too_large'));
    else chunks.push(chunk);
  });
  child.stderr.resume();
  child.on('close', code => finish(code === 0 ? undefined : new Error('voice_conversion_failed')));
  child.stdin.end(input);
});

export function assertVoiceWav(bytes: Uint8Array): void {
  const wav = Buffer.from(bytes);
  if (wav.length < 44 || wav.length > MAX_WAV || wav.toString('ascii', 0, 4) !== 'RIFF' || wav.toString('ascii', 8, 12) !== 'WAVE') throw new Error('voice_wav_rejected');
  let format = false;
  let audio = false;
  for (let offset = 12; offset + 8 <= wav.length;) {
    const name = wav.toString('ascii', offset, offset + 4);
    const size = wav.readUInt32LE(offset + 4);
    const start = offset + 8;
    if (name === 'fmt ') {
      if (size < 16 || start + size > wav.length || wav.readUInt16LE(start) !== 1 || wav.readUInt16LE(start + 2) !== 1 || wav.readUInt32LE(start + 4) !== 16000 || wav.readUInt16LE(start + 14) !== 16) throw new Error('voice_wav_rejected');
      format = true;
    }
    if (name === 'data') { audio = size > 0 && start < wav.length && (size === 0xffffffff || start + size <= wav.length); break; }
    if (start + size > wav.length) throw new Error('voice_wav_rejected');
    offset = start + size + (size % 2);
  }
  if (!format || !audio) throw new Error('voice_wav_rejected');
}

export async function convertVoice(input: Uint8Array, ffmpegPath: string, run: FfmpegRunner = runFfmpeg): Promise<Buffer> {
  if (input.byteLength === 0 || input.byteLength > 16 * 1024 * 1024) throw new Error('voice_input_rejected');
  const wav = await run(ffmpegPath, ['-hide_banner', '-loglevel', 'error', '-i', 'pipe:0', '-vn', '-ac', '1', '-ar', '16000', '-acodec', 'pcm_s16le', '-f', 'wav', 'pipe:1'], input);
  assertVoiceWav(wav);
  return wav;
}
