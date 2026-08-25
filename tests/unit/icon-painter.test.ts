import { describe, it, expect } from 'vitest';
import { paintIcon } from '../../src/tools/png/IconPainter';
import { RgbaImage } from '../../src/tools/png/RgbaImage';

function pixel(image: RgbaImage, x: number, y: number): [number, number, number, number] {
  const i = (y * image.width + x) * 4;
  return [image.pixels[i], image.pixels[i + 1], image.pixels[i + 2], image.pixels[i + 3]];
}

function countWhere(image: RgbaImage, predicate: (p: [number, number, number, number]) => boolean): number {
  let count = 0;
  for (let y = 0; y < image.height; y++) {
    for (let x = 0; x < image.width; x++) {
      if (predicate(pixel(image, x, y))) {
        count++;
      }
    }
  }
  return count;
}

const isDark = (p: [number, number, number, number]) => p[3] === 255 && p[0] < 60 && p[1] < 64 && p[2] < 70;
const isOrange = (p: [number, number, number, number]) => p[3] === 255 && p[0] > 180 && p[2] < 130;

describe('paintIcon — речевая выноска: тёмный фон, оранжевый бабл, тёмные строки', () => {
  const size = 64;
  const icon = paintIcon(size);

  it('создаёт изображение заданного размера', () => {
    expect(icon.width).toBe(size);
    expect(icon.height).toBe(size);
    expect(icon.pixels).toHaveLength(size * size * 4);
  });

  it('углы холста прозрачные (скругление квадрата)', () => {
    expect(pixel(icon, 0, 0)[3]).toBe(0);
    expect(pixel(icon, size - 1, 0)[3]).toBe(0);
    expect(pixel(icon, 0, size - 1)[3]).toBe(0);
    expect(pixel(icon, size - 1, size - 1)[3]).toBe(0);
  });

  it('фон квадрата — тёмный графит #1e2024', () => {
    const corner = pixel(icon, 10, 10); // внутри квадрата, вне бабла и хвоста
    expect(isDark(corner)).toBe(true);
    const bottomRight = pixel(icon, Math.floor(size * 0.85), Math.floor(size * 0.85));
    expect(isDark(bottomRight)).toBe(true);
  });

  it('бабл — фирменный оранжевый, крупный', () => {
    const onBubble = pixel(icon, 32, 17); // верх бабла над строками
    expect(isOrange(onBubble)).toBe(true);
    const share = countWhere(icon, isOrange) / (size * size);
    expect(share).toBeGreaterThan(0.2);
  });

  it('строки текста внутри бабла — тёмные на оранжевом', () => {
    // Внутри бабла (зона y 20..36) фон оранжевый: тёмное там — только строки.
    let bars = 0;
    for (let y = 20; y <= 36; y++) {
      for (let x = 16; x <= 48; x++) {
        if (isDark(pixel(icon, x, y))) {
          bars++;
        }
      }
    }
    expect(bars).toBeGreaterThan(30);
  });

  it('белых пикселей больше нет', () => {
    const whites = countWhere(icon, ([r, g, b, a]) => a === 255 && r > 225 && g > 225 && b > 225);
    expect(whites).toBe(0);
  });

  it('хвост-указатель крупный: оранжевый клин глубоко вниз-влево', () => {
    // Прежний хвост кончался на 0.72 высоты — заметный должен доставать ниже.
    expect(isOrange(pixel(icon, 22, 45))).toBe(true); // основание хвоста
    expect(isOrange(pixel(icon, 20, 48))).toBe(true); // середина клина
  });

  it('края сглажены суперсэмплингом: есть полупрозрачные пиксели', () => {
    const semi = countWhere(icon, ([, , , a]) => a > 0 && a < 255);
    expect(semi).toBeGreaterThan(20);
  });
});

describe('paintIcon — мелкие размеры', () => {
  it('16px читаем: тёмный угол, оранжевый бабл, тёмные строки', () => {
    const small = paintIcon(16);
    expect(pixel(small, 0, 0)[3]).toBe(0); // скругление
    expect(isDark(pixel(small, 12, 14))).toBe(true); // фон квадрата (правый низ)
    expect(isOrange(pixel(small, 8, 4))).toBe(true); // бабл (выше первой строки)
    // Строки видны и в трее: в центре бабла есть тёмные пиксели.
    let bars = 0;
    for (let y = 5; y <= 10; y++) {
      for (let x = 5; x <= 11; x++) {
        if (pixel(small, x, y)[0] < 90 && pixel(small, x, y)[3] === 255) {
          bars++;
        }
      }
    }
    expect(bars).toBeGreaterThan(2);
  });
});
