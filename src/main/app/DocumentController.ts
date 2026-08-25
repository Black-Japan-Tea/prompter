import { FileWatcher } from '../files/FileWatcher';
import { RecentFiles } from '../files/RecentFiles';
import { FileService } from '../files/FileService';
import { SettingsStore } from '../settings/SettingsStore';
import { FilePayload, NotifyPayload } from '../../shared/contracts';

/** События жизненного цикла документа, которые нужны остальному приложению. */
export interface DocumentEvents {
  onOpened(payload: FilePayload): void;
  onChanged(content: string): void;
  onRemoved(fileName: string): void;
  onRecentChanged(recent: readonly string[]): void;
  notify(level: NotifyPayload['level'], message: string): void;
}

/**
 * Работа с открытым файлом: диалог, чтение, слежение за правками,
 * список недавних и связь с настройками. Не знает про окно и трей.
 */
export class DocumentController {
  private readonly watcher = new FileWatcher(150);
  private readonly recent = new RecentFiles();
  private readonly files = new FileService();
  private current: string | null = null;
  private simulatedPick: string | null | undefined;

  constructor(
    private readonly settings: SettingsStore,
    private readonly events: DocumentEvents,
  ) {
    for (const path of settings.load().recentFiles) {
      this.recent.add(path);
    }
  }

  get currentPath(): string | null {
    return this.current;
  }

  recentList(): readonly string[] {
    return this.recent.list();
  }

  /** Симуляция результата диалога для E2E: undefined — реальный диалог. */
  simulateNextPick(path: string | null): void {
    this.simulatedPick = path;
  }

  openViaDialog(): void {
    if (this.simulatedPick !== undefined) {
      const picked = this.simulatedPick;
      this.simulatedPick = undefined;
      if (picked !== null) {
        this.openFile(picked);
      }
      return;
    }
    void this.files.pickFile().then((path) => {
      if (path !== null) {
        this.openFile(path);
      }
    });
  }

  openFile(path: string): boolean {
    const content = this.files.read(path);
    if (content === null) {
      this.events.notify('error', `Не удалось открыть файл: ${baseName(path)}`);
      return false;
    }
    this.current = path;
    this.watcher.start(path, (event) => this.onWatchEvent(event));
    this.recent.add(path);
    const recent = [...this.recent.list()];
    this.settings.update({ lastFile: path, recentFiles: recent });
    this.events.onOpened({ path, content });
    this.events.onRecentChanged(recent);
    return true;
  }

  repeatLastFile(): void {
    const last = this.settings.load().lastFile;
    if (last !== null) {
      this.openFile(last);
    } else {
      this.events.notify('info', 'Недавних файлов пока нет');
    }
  }

  restoreLastFile(): void {
    const last = this.settings.load().lastFile;
    if (last !== null && this.canRead(last)) {
      this.openFile(last);
    }
  }

  dispose(): void {
    this.watcher.stop();
  }

  private canRead(path: string): boolean {
    return this.files.read(path) !== null;
  }

  private onWatchEvent(event: 'changed' | 'removed'): void {
    const current = this.current;
    if (current === null) {
      return;
    }
    if (event === 'removed') {
      this.current = null;
      this.settings.update({ lastFile: null });
      this.events.notify('info', `Файл удалён: ${baseName(current)}`);
      this.events.onRemoved(baseName(current));
      return;
    }
    const content = this.files.read(current);
    if (content !== null) {
      this.events.onChanged(content);
    }
  }
}

function baseName(path: string): string {
  const parts = path.split(/[\\/]/);
  return parts[parts.length - 1] || path;
}
