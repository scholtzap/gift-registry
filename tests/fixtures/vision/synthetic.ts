import sharp from 'sharp';

// Original pixel art, generated here; no photographs or third-party assets.
export const WIDTH = 12;
export const HEIGHT = 8;
export const LEFT_GIFT = { x: 1, y: 2, width: 3, height: 4 };
export const RIGHT_GIFT = { x: 5, y: 2, width: 2, height: 4 };
export const PERSON = { x: 8, y: 1, width: 3, height: 6 };

export function mask(box = LEFT_GIFT) {
  const pixels = new Uint8Array(WIDTH * HEIGHT);
  for (let y = box.y; y < box.y + box.height; y++) {
    for (let x = box.x; x < box.x + box.width; x++) pixels[y * WIDTH + x] = 1;
  }
  return { width: WIDTH, height: HEIGHT, box: { ...box }, pixels };
}

export async function syntheticPhoto(withPerson = false, variant = 0): Promise<Buffer> {
  const pixels = Buffer.alloc(WIDTH * HEIGHT * 3, 240 - variant);
  const paint = (box: typeof LEFT_GIFT, colour: number[]) => {
    for (let y = box.y; y < box.y + box.height; y++) {
      for (let x = box.x; x < box.x + box.width; x++) {
        const offset = (y * WIDTH + x) * 3;
        pixels[offset] = colour[0]!;
        pixels[offset + 1] = colour[1]!;
        pixels[offset + 2] = colour[2]!;
      }
    }
  };
  paint(LEFT_GIFT, [220, 20, 60]);
  paint(RIGHT_GIFT, [20, 80, 220]);
  if (withPerson) paint(PERSON, [180, 130, 90]);
  return sharp(pixels, { raw: { width: WIDTH, height: HEIGHT, channels: 3 } }).png().toBuffer();
}
