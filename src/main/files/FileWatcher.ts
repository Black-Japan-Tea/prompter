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
  private notify: (event: FileEvent) => void = () => undefined;

  constructor(
    private readonly filePath: string,
    private readonly debounceMs: number = 150,
  ) {}

  start(onEvent: (event: FileEvent) => void): void {
    this.stop();
    this.notify = onEvent;
    if (!existsSync(this.filePath)) {
      // Файла нет — это тоже состояние, о котором UI должен узнать сразу.
      this.notify('removed');
      return;
    }
    this.watcher = watch(this.filePath, () => this.schedule());
  }

  stop(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.watcher?.close();
    this.watcher = null;
  }

  private schedule(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
    }
    this.timer = setTimeout(() => {
      this.timer = null;
      this.notify(existsSync(this.filePath) ? 'changed' : 'removed');
    }, this.debounceMs);
  }
}
