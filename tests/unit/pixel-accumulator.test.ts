import { describe, it, expect } from 'vitest';
import { createPixelAccumulator } from '../../src/renderer/autoscroll';

describe('createPixelAccumulator — дробные шаги в целые пиксели', () => {
  it('за 5 шагов по 0.4px отдаёт суммарно 2px (дробные не теряются)', () => {
    const acc = createPixelAccumulator();
    let moved = 0;
    for (let i = 0; i < 5; i++) {
      const portion = acc.add(0.4);
      expect(Number.isInteger(portion)).toBe(true); // только целые пиксели
      moved += portion;
    }
    expect(moved).toBe(2); // 2.0px суммарно, ничего не потерялось
  });

  it('медленная скорость даёт движение: 24px/s на 30 кадрах по 0.8px', () => {
    const acc = createPixelAccumulator();
    let moved = 0;
    for (let i = 0; i < 30; i++) {
      moved += acc.add(24 / 30);
    }
    expect(moved).toBeGreaterThanOrEqual(23); // ≈24px за секунду
  });

  it('большие шаги проходят с накоплением хвоста', () => {
    const acc = createPixelAccumulator();
    const portions = [acc.add(1.5), acc.add(1.5), acc.add(1.5)];
    expect(portions.reduce((a, b) => a + b, 0)).toBe(4); // 4.5px → 4px
    expect(portions.every(Number.isInteger)).toBe(true);
  });
});
