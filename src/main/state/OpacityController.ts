/** «Окно», которому контроллер применяет прозрачность (в main это BrowserWindow). */
export interface OpacityView {
  setOpacity(value: number): void;
}

/** Границы прозрачности: ниже 0.2 текст уже нечитаем, выше 1 не бывает. */
const MIN_OPACITY = 0.2;
const MAX_OPACITY = 1;
const STEP = 0.1;
const DEFAULT_OPACITY = 0.85;

/**
 * Логика пошаговой регулировки прозрачности окна.
 * Значения хранятся с точностью до сотых, чтобы шаги не накапливали
 * артефакты плавающей точки (0.85 + 0.1 должно быть ровно 0.95).
 */
export class OpacityController {
  private current: number;

  constructor(private readonly view: OpacityView, initial: number = DEFAULT_OPACITY) {
    this.current = this.clamp(initial);
    this.view.setOpacity(this.current);
  }

  get value(): number {
    return this.current;
  }

  stepUp(): void {
    this.set(this.current + STEP);
  }

  stepDown(): void {
    this.set(this.current - STEP);
  }

  set(value: number): void {
    this.current = this.clamp(value);
    this.view.setOpacity(this.current);
  }

  private clamp(value: number): number {
    const rounded = Math.round(value * 100) / 100;
    return Math.min(MAX_OPACITY, Math.max(MIN_OPACITY, rounded));
  }
}
