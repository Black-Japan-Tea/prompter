import { RgbaImage, createImage, blendPixel } from './RgbaImage';

// Фирменные цвета: индиго → фиолет, белый пузырь, строки чуть темнее индиго.
const INDIGO: readonly [number, number, number] = [99, 102, 241];
const VIOLET: readonly [number, number, number] = [139, 92, 246];
const WHITE: readonly [number, number, number] = [242, 244, 251];
const BAR: readonly [number, number, number] = [91, 94, 230];

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

/** Расстояние от точки до отрезка (для корректной внешней дистанции треугольника). */
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

/** Дистанция до треугольника: снаружи — до ближайшего ребра-отрезка, внутри — отрицательная. */
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
    // Точка вне треугольника: дистанция до ближайшего отрезка-ребра.
    return Math.min(
      ...edges.map(([[x1, y1], [x2, y2]]) => segmentDistance(px, py, x1, y1, x2, y2)),
    );
  }
  return Math.min(...signed);
}

/** Покрытие 0..1 с однопиксельным сглаживанием по дистанции. */
function coverage(distance: number): number {
  return clamp01(0.5 - distance);
}

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
        const t = (x + y) / (2 * (size - 1));
        blendPixel(image, x, y, mix(INDIGO, VIOLET, t), cov);
      }
    }
  }
}

function paintBubble(image: RgbaImage): void {
  const size = image.width;
  const tail: [number, number][] = [
    [size * 0.30, size * 0.60],
    [size * 0.30, size * 0.72],
    [size * 0.43, size * 0.60],
  ];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const bubble = roundedRectSdf(
        x + 0.5, y + 0.5, size * 0.5, size * 0.44,
        size * 0.32, size * 0.235, size * 0.08,
      );
      const tailDist = triangleSdf(x + 0.5, y + 0.5, tail[0], tail[1], tail[2]);
      const cov = Math.max(coverage(bubble), coverage(tailDist));
      if (cov > 0) {
        blendPixel(image, x, y, WHITE, cov);
      }
    }
  }
}

function paintBars(image: RgbaImage): void {
  const size = image.width;
  const count = size >= 24 ? 3 : 2;
  const barHeight = size * 0.05;
  const gap = size * 0.04;
  const widths = [0.34, 0.24, 0.30];
  const centerY = size * 0.44;
  for (let i = 0; i < count; i++) {
    const barY = centerY + (i - (count - 1) / 2) * (barHeight + gap);
    const halfW = (size * widths[i]) / 2;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const d = roundedRectSdf(
          x + 0.5, y + 0.5, size * 0.5, barY,
          halfW, barHeight / 2, barHeight / 2,
        );
        const cov = coverage(d);
        if (cov > 0) {
          blendPixel(image, x, y, BAR, cov);
        }
      }
    }
  }
}

/** Рисует иконку приложения: градиентный квадрат, пузырь, строки текста. */
export function paintIcon(size: number): RgbaImage {
  const image = createImage(size, size);
  paintBackground(image);
  paintBubble(image);
  paintBars(image);
  return image;
}
