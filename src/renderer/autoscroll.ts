import { AutoScrollSpeed } from '../shared/settings';

/** Скорости автопрокрутки в пикселях в секунду. */
const PIXELS_PER_SECOND: Record<AutoScrollSpeed, number> = {
  slow: 24,
  medium: 48,
  fast: 90,
};

/** Плавная автопрокрутка контейнера контента через requestAnimationFrame. */
export class AutoScroller {
  private frame: number | null = null;
  private enabled = false;
  private speed: AutoScrollSpeed = 'medium';

  constructor(
    private readonly scroller: HTMLElement,
    private readonly view: Window,
  ) {}

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (enabled) {
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
    this.frame = this.view.requestAnimationFrame(() => this.tick());
  }

  private tick = (): void => {
    this.frame = null;
    if (!this.enabled) {
      return;
    }
    // Скроллится именно .viewer: у html/body стоит overflow:hidden.
    const step = PIXELS_PER_SECOND[this.speed] / 60;
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
