import { RgbaImage, createImage, blendPixel } from './RgbaImage';

// Фирменные цвета: оранжевый #FD6500 → тёплый #FF8A3A, крупная белая галочка.
// Мелкие размеры (трей 16px) читаются только по простому глифу — без пузыря.
const ORANGE_FROM: readonly [number, number, number] = [253, 101, 0];
const ORANGE_TO: readonly [number, number, number] = [255, 138, 58];
const WHITE: readonly [number, number, number] = [242, 244, 251];

// Суперсэмплинг: рисуем в SSAA× больше и усредняем блок, чтобы края были чёткими.
const SSAA = 4;

type Color = readonly [number, number, number];

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function mix(a: Color, b: Color, t: number): Color {
  return [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
  ];
}

/** Знаковая дистанция до скруглённого прямоугольника (отрицательная внутри). */
function roundedRectSdf(
  px: number, py: number,
  cx: number, cy: number,
  halfW: number, halfH: number,
  radius: number,
): number {
  const dx = Math.abs(px - cx) - (halfW - radius);
  const dy = Math.abs(py - cy) - (halfH - radius);
  const ax = Math.max(dx, 0);
  const ay = Math.max(dy, 0);
  return Math.sqrt(ax * ax + ay * ay) + Math.min(Math.max(dx, dy), 0) - radius;
}

/** Расстояние от точки до отрезка. */
function segmentDistance(
  px: number, py: number,
  x1: number, y1: number, x2: number, y2: number,
): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lengthSq = dx * dx + dy * dy;
  const t = lengthSq === 0
    ? 0
    : Math.min(1, Math.max(0, ((px - x1) * dx + (py - y1) * dy) / lengthSq));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

/** Осевая ломаная галочки в долях размера: короткое плечо вниз, длинное вверх. */
const CHECK_POINTS: ReadonlyArray<readonly [number, number]> = [
  [0.25, 0.52],
  [0.435, 0.68],
  [0.76, 0.33],
];
const CHECK_STROKE = 0.14;

function paintBackground(image: RgbaImage): void {
  const size = image.width;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d = roundedRectSdf(
        x + 0.5, y + 0.5, size / 2, size / 2,
        size / 2 - 0.5, size / 2 - 0.5, size * 0.22,
      );
      const cov = clamp01(0.5 - d);
      if (cov > 0) {
        const t = (x + y) / (2 * (size - 1));
        blendPixel(image, x, y, mix(ORANGE_FROM, ORANGE_TO, t), cov);
      }
    }
  }
}

/** Галочка — два капсульных штриха по осевой ломаной, со скруглёнными концами. */
function paintCheckmark(image: RgbaImage): void {
  const size = image.width;
  const half = (size * CHECK_STROKE) / 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let dist = Infinity;
      for (let i = 0; i + 1 < CHECK_POINTS.length; i++) {
        const [x1, y1] = CHECK_POINTS[i];
        const [x2, y2] = CHECK_POINTS[i + 1];
        dist = Math.min(
          dist,
          segmentDistance(x + 0.5, y + 0.5, x1 * size, y1 * size, x2 * size, y2 * size),
        );
      }
      const cov = clamp01(half - dist + 0.5);
      if (cov > 0) {
        blendPixel(image, x, y, WHITE, cov);
      }
    }
  }
}

/** Усредняет блок SSAA×SSAA hi-res пикселей в один итоговый пиксель. */
function downsample(hi: RgbaImage, factor: number): RgbaImage {
  const size = hi.width / factor;
  const out = createImage(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < factor; sy++) {
        for (let sx = 0; sx < factor; sx++) {
          const i = ((y * factor + sy) * hi.width + x * factor + sx) * 4;
          r += hi.pixels[i] * hi.pixels[i + 3];
          g += hi.pixels[i + 1] * hi.pixels[i + 3];
          b += hi.pixels[i + 2] * hi.pixels[i + 3];
          a += hi.pixels[i + 3];
        }
      }
      const o = (y * size + x) * 4;
      if (a === 0) {
        out.pixels[o] = 0;
        out.pixels[o + 1] = 0;
        out.pixels[o + 2] = 0;
        out.pixels[o + 3] = 0;
      } else {
        out.pixels[o] = Math.round(r / a);
        out.pixels[o + 1] = Math.round(g / a);
        out.pixels[o + 2] = Math.round(b / a);
        out.pixels[o + 3] = Math.round(a / (factor * factor));
      }
    }
  }
  return out;
}

/** Рисует иконку приложения: градиентный квадрат с крупной белой галочкой. */
export function paintIcon(size: number): RgbaImage {
  const hi = createImage(size * SSAA, size * SSAA);
  paintBackground(hi);
  paintCheckmark(hi);
  return downsample(hi, SSAA);
}
