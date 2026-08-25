import { RgbaImage, createImage, blendPixel } from './RgbaImage';

// Иконка — речевая выноска комикса: тёмный графитовый квадрат,
// оранжевый бабл с крупным хвостом-указателем («чьё это сообщение»),
// внутри бабла тёмные строки-текст.
const GRAPHITE: readonly [number, number, number] = [30, 32, 36]; // #1e2024
const ORANGE_FROM: readonly [number, number, number] = [253, 101, 0];
const ORANGE_TO: readonly [number, number, number] = [255, 138, 58];

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

/** Дистанция до треугольника: снаружи — до ближайшего ребра, внутри — отрицательная. */
function triangleSdf(
  px: number, py: number,
  [ax, ay]: [number, number],
  [bx, by]: [number, number],
  [cx, cy]: [number, number],
): number {
  const gx = (ax + bx + cx) / 3;
  const gy = (ay + by + cy) / 3;
  const edges: Array<[[number, number], [number, number]]> = [
    [[ax, ay], [bx, by]],
    [[bx, by], [cx, cy]],
    [[cx, cy], [ax, ay]],
  ];
  const signed: number[] = edges.map(([[x1, y1], [x2, y2]]) => {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.hypot(dx, dy);
    const cross = dx * (py - y1) - dy * (px - x1);
    const ref = dx * (gy - y1) - dy * (gx - x1) >= 0 ? 1 : -1;
    return (cross / len) * ref;
  });
  if (signed.some((value) => value < 0)) {
    return Math.min(
      ...edges.map(([[x1, y1], [x2, y2]]) => segmentDistance(px, py, x1, y1, x2, y2)),
    );
  }
  // Внутри signed-дистанции положительны (ориентация по центроиду):
  // возвращаем отрицательное, иначе клин не зальётся (баг «мелкого хвоста»).
  return -Math.min(...signed);
}

/** Покрытие 0..1 с однопиксельным сглаживанием по дистанции. */
function coverage(distance: number): number {
  return clamp01(0.5 - distance);
}

/** Геометрия выноски в долях размера: бабл и крупный хвост-указатель. */
const BUBBLE = { cx: 0.5, cy: 0.42, halfW: 0.33, halfH: 0.23, radius: 0.09 };
const TAIL: ReadonlyArray<readonly [number, number]> = [
  [0.26, 0.58],
  [0.30, 0.82],
  [0.50, 0.58],
];
const BAR_HEIGHT = 0.055;
const BAR_GAP = 0.05;
const BAR_WIDTHS = [0.36, 0.26, 0.32];

function paintBackground(image: RgbaImage): void {
  const size = image.width;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d = roundedRectSdf(
        x + 0.5, y + 0.5, size / 2, size / 2,
        size / 2 - 0.5, size / 2 - 0.5, size * 0.22,
      );
      const cov = coverage(d);
      if (cov > 0) {
        blendPixel(image, x, y, GRAPHITE, cov);
      }
    }
  }
}

/** Бабл с хвостом: единая оранжевая фигура «рамка» выноски. */
function paintBubble(image: RgbaImage): void {
  const size = image.width;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const bubble = roundedRectSdf(
        x + 0.5, y + 0.5,
        BUBBLE.cx * size, BUBBLE.cy * size,
        BUBBLE.halfW * size, BUBBLE.halfH * size, BUBBLE.radius * size,
      );
      const tail = triangleSdf(
        x + 0.5, y + 0.5,
        [TAIL[0][0] * size, TAIL[0][1] * size],
        [TAIL[1][0] * size, TAIL[1][1] * size],
        [TAIL[2][0] * size, TAIL[2][1] * size],
      );
      const cov = Math.max(coverage(bubble), coverage(tail));
      if (cov > 0) {
        const t = (x + y) / (2 * (size - 1));
        blendPixel(image, x, y, mix(ORANGE_FROM, ORANGE_TO, t), cov);
      }
    }
  }
}

/** Строки «текста» в бабле — тёмные, читаются на оранжевом. */
function paintBars(image: RgbaImage): void {
  // Геометрия — в hi-res единицах (image.width = size×SSAA);
  // количество строк выбираем по логическому размеру.
  const hi = image.width;
  const logical = hi / SSAA;
  // На мелких размерах строк меньше, но они жирнее: в слоте трея 16px
  // тонкие строки превращаются в мыльную смесь, а не читаемый «текст».
  const count = logical >= 32 ? 3 : logical >= 24 ? 2 : 1;
  const barHeight = count === 1 ? 0.11 : count === 2 ? 0.08 : BAR_HEIGHT;
  const gap = count === 3 ? BAR_GAP : 0.055;
  const width = count === 1 ? 0.36 : count === 2 ? 0.32 : 0;
  for (let i = 0; i < count; i++) {
    const barY = BUBBLE.cy * hi + (i - (count - 1) / 2) * (barHeight + gap) * hi;
    const halfW = ((count === 3 ? BAR_WIDTHS[i] : width) * hi) / 2;
    for (let y = 0; y < hi; y++) {
      for (let x = 0; x < hi; x++) {
        const d = roundedRectSdf(
          x + 0.5, y + 0.5, hi * 0.5, barY,
          halfW, (hi * barHeight) / 2, (hi * barHeight) / 2,
        );
        const cov = coverage(d);
        if (cov > 0) {
          blendPixel(image, x, y, GRAPHITE, cov);
        }
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

/** Рисует иконку приложения: речевая выноска на тёмном квадрате. */
export function paintIcon(size: number): RgbaImage {
  const hi = createImage(size * SSAA, size * SSAA);
  paintBackground(hi);
  paintBubble(hi);
  paintBars(hi);
  return downsample(hi, SSAA);
}
