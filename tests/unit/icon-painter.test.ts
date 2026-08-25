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

describe('paintIcon — форма и цвета', () => {
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

  it('центр непрозрачный', () => {
    expect(pixel(icon, Math.floor(size / 2), Math.floor(size / 2))[3]).toBe(255);
  });

  it('градиент: тёплые каналы растут от левого верхнего к правому нижнему', () => {
    // Оранжевый бренд: #FD6500 (253,101,0) → #FF8A3A (255,138,58).
    const topLeft = pixel(icon, Math.floor(size * 0.2), Math.floor(size * 0.2));
    const bottomRight = pixel(icon, Math.floor(size * 0.82), Math.floor(size * 0.82));
    expect(bottomRight[1]).toBeGreaterThan(topLeft[1]); // зелёный растёт
    expect(bottomRight[2]).toBeGreaterThan(topLeft[2]); // синий растёт
  });

  it('оранжевый доминирует: красный канал сильно больше синего', () => {
    const topLeft = pixel(icon, Math.floor(size * 0.2), Math.floor(size * 0.2));
    expect(topLeft[0]).toBeGreaterThan(topLeft[2] + 150); // 253 против ~0
  });

  it('в иконке есть белые пиксели пузыря', () => {
    const whites = countWhere(icon, ([r, g, b, a]) => a === 255 && r > 225 && g > 225 && b > 225);
    expect(whites).toBeGreaterThan(50);
  });

  it('в иконке есть акцентные пиксели строк текста (оранжевый доминирует)', () => {
    const accents = countWhere(icon, ([r, , b, a]) => a === 255 && r > 180 && b < 120);
    expect(accents).toBeGreaterThan(50);
  });
});

describe('paintIcon — мелкие размеры', () => {
  it('16px сохраняет форму: прозрачные углы и непрозрачный центр', () => {
    const small = paintIcon(16);
    expect(pixel(small, 0, 0)[3]).toBe(0);
    expect(pixel(small, 8, 8)[3]).toBe(255);
  });
});
