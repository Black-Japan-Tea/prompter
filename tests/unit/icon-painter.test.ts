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

  it('крупная галочка: белые пиксели вдоль всей осевой линии', () => {
    // Осевая ломаная галочки A(0.25,0.52) → B(0.435,0.68) → C(0.76,0.33).
    const isWhite = (p: [number, number, number, number]) =>
      p[3] === 255 && p[0] > 225 && p[1] > 225 && p[2] > 225;
    expect(isWhite(pixel(icon, 16, 33))).toBe(true); // около A
    expect(isWhite(pixel(icon, 22, 39))).toBe(true); // середина A→B
    expect(isWhite(pixel(icon, 28, 44))).toBe(true); // около B
    expect(isWhite(pixel(icon, 38, 32))).toBe(true); // середина B→C
    expect(isWhite(pixel(icon, 49, 21))).toBe(true); // около C
  });

  it('галочка занимает заметную долю площади (крупный глиф)', () => {
    const whites = countWhere(icon, ([r, g, b, a]) => a === 255 && r > 225 && g > 225 && b > 225);
    expect(whites).toBeGreaterThan(size * size * 0.06);
  });

  it('строк текста больше нет: тёмно-оранжевый бар-цвет отсутствует', () => {
    // Прежний цвет строк (214,83,0) зеленее любого оттенка градиента (g ≥ 101).
    const bars = countWhere(icon, ([, g, , a]) => a === 255 && g < 90);
    expect(bars).toBe(0);
  });

  it('края сглажены суперсэмплингом: есть полупрозрачные пиксели', () => {
    const semi = countWhere(icon, ([, , , a]) => a > 0 && a < 255);
    expect(semi).toBeGreaterThan(20);
  });
});

describe('paintIcon — мелкие размеры', () => {
  it('16px читаем: прозрачные углы, оранжевый фон и белая галочка в центре', () => {
    const small = paintIcon(16);
    expect(pixel(small, 0, 0)[3]).toBe(0);
    expect(pixel(small, 8, 8)[3]).toBe(255);
    // Точка на осевой галочки при 16px: B(0.435,0.68) ≈ (7,11). Штрих тоньше
    // пикселя — на краю цвет смешан, поэтому порог мягче, но заметно белее фона.
    const onStroke = pixel(small, 7, 11);
    expect(onStroke[3]).toBe(255);
    expect(onStroke[0]).toBeGreaterThan(200);
    expect(onStroke[1]).toBeGreaterThan(170);
  });
});
