/** Простейший холст: сырые RGBA-пиксели без сжатия. */
export interface RgbaImage {
  width: number;
  height: number;
  pixels: Buffer; // длина = width * height * 4
}

export function createImage(width: number, height: number): RgbaImage {
  return { width, height, pixels: Buffer.alloc(width * height * 4, 0) };
}

/** Записывает пиксель с альфа-смешиванием поверх текущего цвета. */
export function blendPixel(
  image: RgbaImage,
  x: number,
  y: number,
  color: readonly [number, number, number],
  coverage: number,
): void {
  if (x < 0 || y < 0 || x >= image.width || y >= image.height || coverage <= 0) {
    return;
  }
  const alpha = Math.min(1, Math.max(0, coverage));
  const index = (y * image.width + x) * 4;
  const oldAlpha = image.pixels[index + 3] / 255;
  // Стандартное «source over» смешивание.
  const newAlpha = alpha + oldAlpha * (1 - alpha);
  if (newAlpha === 0) {
    return;
  }
  for (let channel = 0; channel < 3; channel++) {
    const old = image.pixels[index + channel];
    const mixed = (color[channel] * alpha + old * oldAlpha * (1 - alpha)) / newAlpha;
    image.pixels[index + channel] = Math.round(mixed);
  }
  image.pixels[index + 3] = Math.round(newAlpha * 255);
}
