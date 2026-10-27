import { expect, it } from 'vitest';
import { convertVoice, type FfmpegRunner } from '@/server/intake/voice';

const wav = () => {
  const b = Buffer.alloc(46);
  b.write('RIFF'); b.writeUInt32LE(38, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(16000, 24); b.writeUInt32LE(32000, 28);
  b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(2, 40);
  return b;
};

it('converts voice using an argv-only FFmpeg process with mono PCM16 16kHz output, never a shell command', async () => {
  let ran = false;
  const run: FfmpegRunner = async (command, args, input) => {
    ran = true;
    expect(command).toBe('ffmpeg-fixture');
    expect(args).toEqual(['-hide_banner', '-loglevel', 'error', '-i', 'pipe:0', '-vn', '-ac', '1', '-ar', '16000', '-acodec', 'pcm_s16le', '-f', 'wav', 'pipe:1']);
    expect(input).toEqual(Buffer.from('fictional-ogg-fixture'));
    return wav();
  };
  const output = await convertVoice(Buffer.from('fictional-ogg-fixture'), 'ffmpeg-fixture', run);
  expect(ran).toBe(true);
  expect(output.subarray(0, 12).toString()).toBe('RIFF&\u0000\u0000\u0000WAVE');
});

it('refuses malformed converter output instead of sending it as WAV to a model', async () => {
  await expect(convertVoice(Buffer.from('fictional-ogg-fixture'), 'ffmpeg-fixture', async () => Buffer.from('not-a-wave'))).rejects.toThrow('voice_wav_rejected');
});
