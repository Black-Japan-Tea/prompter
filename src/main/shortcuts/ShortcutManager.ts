/** Обёртка над Electron globalShortcut, вынесенная за интерфейс для тестов. */
export interface ShortcutHost {
  register(accelerator: string): boolean;
  unregister(accelerator: string): void;
}

/**
 * Управление глобальными хоткеями: пакетная регистрация с отчётом
 * о неудачах (занято другой программой) и гарантированная очистка.
 */
export class ShortcutManager {
  private readonly handlers = new Map<string, () => void>();

  constructor(private readonly host: ShortcutHost) {}

  /**
   * Регистрирует набор хоткеев. Возвращает акселераторы, которые
   * зарегистрировать не удалось, — их надо показать пользователю.
   */
  register(bindings: Record<string, () => void>): string[] {
    const failures: string[] = [];
    for (const [accelerator, handler] of Object.entries(bindings)) {
      // Перезапись: сначала снимаем старую регистрацию, чтобы не плодить дубль.
      if (this.handlers.has(accelerator)) {
        this.host.unregister(accelerator);
      }
      if (this.host.register(accelerator)) {
        this.handlers.set(accelerator, handler);
      } else {
        failures.push(accelerator);
      }
    }
    return failures;
  }

  /** Диспетчеризация нажатия; неизвестный хоткей игнорируется молча — это штатный случай. */
  dispatch(accelerator: string): void {
    this.handlers.get(accelerator)?.();
  }

  /** Активные акселераторы — для диагностики и проверок покрытия хоткеев. */
  registered(): string[] {
    return [...this.handlers.keys()];
  }

  dispose(): void {
    for (const accelerator of this.handlers.keys()) {
      this.host.unregister(accelerator);
    }
    this.handlers.clear();
  }
}
