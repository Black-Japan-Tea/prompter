/** Тост-уведомления: обратная связь на каждое действие без модальных окон. */
export class ToastCenter {
  private readonly region: HTMLElement;
  private readonly timers = new Map<HTMLElement, ReturnType<typeof setTimeout>>();
  private readonly maxVisible = 3;

  constructor(region: HTMLElement) {
    this.region = region;
    this.region.setAttribute('aria-live', 'polite');
  }

  show(message: string, level: 'info' | 'error' = 'info'): void {
    this.trim();
    const toast = document.createElement('div');
    toast.className = `toast toast-${level}`;
    toast.textContent = message;
    this.region.append(toast);

    const timer = setTimeout(() => this.dismiss(toast), 2400);
    this.timers.set(toast, timer);
    toast.addEventListener('click', () => this.dismiss(toast));
  }

  private dismiss(toast: HTMLElement): void {
    const timer = this.timers.get(toast);
    if (timer !== undefined) {
      clearTimeout(timer);
      this.timers.delete(toast);
    }
    toast.remove();
  }

  private trim(): void {
    const toasts = [...this.region.children] as HTMLElement[];
    while (toasts.length >= this.maxVisible) {
      this.dismiss(toasts.shift() as HTMLElement);
    }
  }
}
