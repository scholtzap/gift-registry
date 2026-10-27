import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { renderMaskedCutout } from '@/server/vision';
import { mask, PERSON, syntheticPhoto } from '../fixtures/vision/synthetic';

describe('public card/intake masked image compositor', () => {
  it('refuses an intersecting person even when used directly by card rendering', async () => {
    await expect(renderMaskedCutout(await syntheticPhoto(true), mask(PERSON), [PERSON]))
      .rejects.toMatchObject({ code: 'person_overlap' });
  });

  it('zeroes RGB as well as alpha outside the mask and preserves exact opaque gift pixels', async () => {
    const sparse = mask();
    sparse.pixels[25] = 0;
    const png = await renderMaskedCutout(await syntheticPhoto(), sparse, []);
    expect([...png.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    const { data, info } = await sharp(png).raw().toBuffer({ resolveWithObject: true });
    expect(info).toMatchObject({ width: 3, height: 4, channels: 4 });
    expect([...data.subarray(0, 8)]).toEqual([0, 0, 0, 0, 220, 20, 60, 255]);
  });
});
