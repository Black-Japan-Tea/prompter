import { watch, existsSync, type FSWatcher } from 'node:fs';

export type FileEvent = 'changed' | 'removed';

/**
 * Следит за одним файлом с debounce: редакторы часто пишут файл
 * серией быстрых операций, и без схлопывания UI дёргается на каждую.
 * На Windows fs.watch шлёт и change, и rename на одну правку —
 * поэтому различаем изменение и удаление проверкой existsSync в момент события.
 */
export class FileWatcher {
  private watcher: FSWatcher | null = null;
  private timer: NodeJS.Timeout | null = null;

  constructor(private readonly debounceMs: number = 150) {}

  /** Начать (или перезапустить) слежение за указанным файлом. */
  start(filePath: string, onEvent: (event: FileEvent) => void): void {
    this.stop();
    if (!existsSync(filePath)) {
      // Файла нет — это тоже состояние, о котором UI должен узнать сразу.
      onEvent('removed');
      return;
    }
    this.watcher = watch(filePath, () => this.schedule(filePath, onEvent));
  }

  stop(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.watcher?.close();
    this.watcher = null;
  }

  private schedule(
    filePath: string,
    onEvent: (event: FileEvent) => void,
  ): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
    }
    this.timer = setTimeout(() => {
      this.timer = null;
      onEvent(existsSync(filePath) ? 'changed' : 'removed');
    }, this.debounceMs);
  }
}
