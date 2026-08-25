import { AutoScrollSpeed } from '../shared/settings';

/** Скорости автопрокрутки в пикселях в секунду. */
const PIXELS_PER_SECOND: Record<AutoScrollSpeed, number> = {
  slow: 24,
  medium: 48,
  fast: 90,
};

/**
 * Аккумулятор дробных пикселей: scrollTop принимает только целые,
 * поэтому шаги меньше пикселя копятся и отдаются целыми порциями.
 * Без этого «медленно» (0.4px/кадр) стоит на месте.
 */
export function createPixelAccumulator(): { add(pixels: number): number } {
  let carry = 0;
  return {
    add(pixels: number): number {
      carry += pixels;
      const whole = Math.floor(carry);
      carry -= whole;
      return whole;
    },
  };
}

/** Плавная автопрокрутка контейнера контента через requestAnimationFrame. */
export class AutoScroller {
  private frame: number | null = null;
  private enabled = false;
  private speed: AutoScrollSpeed = 'medium';
  private accumulator = createPixelAccumulator();
  private lastTimestamp: number | null = null;

  constructor(
    private readonly scroller: HTMLElement,
    private readonly view: Window,
  ) {}

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (enabled) {
      // Новый заход прокрутки начинается без наследования прошлого темпа.
      this.accumulator = createPixelAccumulator();
      this.lastTimestamp = null;
      this.startLoop();
    } else if (this.frame !== null) {
      this.view.cancelAnimationFrame(this.frame);
      this.frame = null;
    }
  }

  setSpeed(speed: AutoScrollSpeed): void {
    this.speed = speed;
  }

  private startLoop(): void {
    if (this.frame !== null) {
      return;
    }
    this.frame = this.view.requestAnimationFrame((timestamp) => this.tick(timestamp));
  }

  private tick = (timestamp?: number): void => {
    this.frame = null;
    if (!this.enabled) {
      return;
    }

    // Шаг по реальному времени: не зависит от герцовки монитора.
    let step = 0;
    if (this.lastTimestamp !== null && timestamp !== undefined) {
      const dt = Math.min(100, timestamp - this.lastTimestamp);
      step = this.accumulator.add((PIXELS_PER_SECOND[this.speed] * dt) / 1000);
    }
    this.lastTimestamp = timestamp ?? null;

    const maxScroll = this.scroller.scrollHeight - this.scroller.clientHeight;
    if (this.scroller.scrollTop + step < maxScroll) {
      this.scroller.scrollTop += step;
      this.startLoop();
    } else {
      // Дошли до конца — останавливаемся, чтобы не молотить кадры впустую.
      this.enabled = false;
      this.view.dispatchEvent(new CustomEvent('prompter:autoscroll-finished'));
    }
  };
}
