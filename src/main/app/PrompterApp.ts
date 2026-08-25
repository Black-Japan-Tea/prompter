import { app, globalShortcut, ipcMain } from 'electron';
import { join } from 'node:path';
import { SettingsStore } from '../settings/SettingsStore';
import { PrompterWindow } from '../window/PrompterWindow';
import { TrayService } from '../tray/TrayService';
import { ShortcutManager } from '../shortcuts/ShortcutManager';
import { OpacityController, OpacityView } from '../state/OpacityController';
import { FileWatcher } from '../files/FileWatcher';
import { RecentFiles } from '../files/RecentFiles';
import { FileService } from '../files/FileService';
import { AutoScrollSpeed } from '../../shared/settings';import { IPC, BroadcastState } from '../../shared/contracts';

/** Собирает окно, трей, хоткеи, файлы и настройки в одно приложение. */
export class PrompterApp {
  private readonly settings: SettingsStore;
  private readonly window: PrompterWindow;
  private readonly tray: TrayService;
  private readonly shortcuts: ShortcutManager;
  private readonly opacity: OpacityController;
  private readonly watcher = new FileWatcher(150);
  private readonly recent = new RecentFiles();
  private readonly files = new FileService();
  private currentFile: string | null = null;

  constructor() {
    this.settings = new SettingsStore(join(app.getPath('userData'), 'settings.json'));
    const loaded = this.settings.load();
    loaded.recentFiles.forEach((path) => this.recent.add(path));
    this.window = new PrompterWindow(loaded);
    this.opacity = new OpacityController(this.opacityView(), loaded.opacity);
    this.tray = new TrayService(this.trayIconPath(), this.trayActions());
    this.shortcuts = new ShortcutManager(this.shortcutHost());
    if (loaded.clickThrough) {
      this.window.setClickThrough(true);
    }
  }

  start(): void {
    this.registerIpc();
    const failures = this.shortcuts.register({
      'Control+Alt+P': () => this.toggleWindow(),
      'Control+Alt+=': () => this.opacityUp(),
      'Control+Alt+-': () => this.opacityDown(),
    });
    if (failures.length > 0) {
      console.error('Хоткеи не зарегистрированы (заняты):', failures.join(', '));
      this.tray.showStartupHint();
    }
    this.tray.showStartupHint();
    this.restoreLastFile();
  }

  dispose(): void {
    this.saveBounds();
    this.shortcuts.dispose();
    this.watcher.stop();
    this.tray.destroy();
  }

  toggleWindow(): void {
    if (this.window.isVisible()) {
      this.saveBounds();
    }
    this.window.toggle();
  }

  showWindow(): void {
    this.window.show();
  }

  /** Точки входа для E2E-хуков: реальные внутренние методы без обхода логики. */
  toggleAutoScrollForTests(): void {
    this.toggleAutoScroll();
  }

  setAutoScrollSpeedForTests(speed: AutoScrollSpeed): void {
    this.setAutoScrollSpeed(speed);
  }

  debugState(): BroadcastState & {
    windowVisible: boolean;
    contentProtection: boolean;
    skipTaskbar: boolean;
    currentFile: string | null;
  } {
    return {
      ...this.broadcastState(),
      windowVisible: this.window.isVisible(),
      contentProtection: this.window.isContentProtected,
      skipTaskbar: this.window.isSkipTaskbar,
      currentFile: this.currentFile,
    };
  }

  openFile(path: string): void {
    const content = this.files.read(path);
    if (content === null) {
      return;
    }
    this.currentFile = path;
    this.watcher.start(path, (event) => this.onWatchEvent(event));
    this.recent.add(path);
    this.settings.update({ lastFile: path, recentFiles: [...this.recent.list()] });
    this.window.win.webContents.send(IPC.fileOpened, { path, content });
    this.tray.refresh();
    this.broadcast();
  }

  async openViaDialog(): Promise<void> {
    const path = await this.files.pickFile();
    if (path !== null) {
      this.openFile(path);
    }
  }

  private onWatchEvent(event: 'changed' | 'removed'): void {
    if (this.currentFile === null) {
      return;
    }
    if (event === 'removed') {
      this.currentFile = null;
      this.settings.update({ lastFile: null });
      this.window.win.webContents.send(IPC.fileRemoved);
      return;
    }
    const content = this.files.read(this.currentFile);
    if (content !== null) {
      this.window.win.webContents.send(IPC.fileChanged, { content });
    }
  }

  private restoreLastFile(): void {
    const last = this.settings.load().lastFile;
    if (last !== null && this.files.read(last) !== null) {
      this.openFile(last);
    }
  }

  private registerIpc(): void {
    ipcMain.on(IPC.openFileRequest, (_event, path: unknown) => {
      if (typeof path === 'string' && path.length > 0) {
        this.openFile(path);
      }
    });
    ipcMain.on(IPC.fontSizeRequest, (_event, size: unknown) => {
      if (typeof size === 'number' && Number.isFinite(size)) {
        const clamped = Math.min(28, Math.max(12, Math.round(size)));
        this.settings.update({ fontSize: clamped });
        this.broadcast();
      }
    });
  }

  private opacityUp(): void {
    this.opacity.stepUp();
    this.settings.update({ opacity: this.opacity.value });
    this.broadcast();
  }

  private opacityDown(): void {
    this.opacity.stepDown();
    this.settings.update({ opacity: this.opacity.value });
    this.broadcast();
  }

  private toggleAutoScroll(): void {
    const auto = this.settings.load().autoScroll;
    this.settings.update({ autoScroll: { ...auto, enabled: !auto.enabled } });
    this.tray.refresh();
    this.broadcast();
  }

  private setAutoScrollSpeed(speed: AutoScrollSpeed): void {
    const auto = this.settings.load().autoScroll;
    this.settings.update({ autoScroll: { ...auto, speed } });
    this.tray.refresh();
    this.broadcast();
  }

  private toggleClickThrough(): void {
    const next = !this.settings.load().clickThrough;
    this.settings.update({ clickThrough: next });
    this.window.setClickThrough(next);
    this.tray.refresh();
    this.broadcast();
  }

  private saveBounds(): void {
    this.settings.update({ windowBounds: this.window.bounds() });
  }

  private broadcast(): void {
    this.window.win.webContents.send(IPC.stateChanged, this.broadcastState());
  }

  private broadcastState(): BroadcastState {
    const s = this.settings.load();
    return {
      fileName: this.currentFile !== null ? baseName(this.currentFile) : null,
      autoScrollEnabled: s.autoScroll.enabled,
      autoScrollSpeed: s.autoScroll.speed,
      fontSize: s.fontSize,
      opacity: this.opacity.value,
      clickThrough: s.clickThrough,
    };
  }

  private opacityView(): OpacityView {
    return {
      setOpacity: (value) => this.window.win.setOpacity(value),
    };
  }

  private shortcutHost() {
    return {
      register: (accelerator: string) =>
        globalShortcut.register(accelerator, () => this.shortcuts.dispatch(accelerator)),
      unregister: (accelerator: string) => globalShortcut.unregister(accelerator),
    };
  }

  private trayActions() {
    return {
      toggleWindow: () => this.toggleWindow(),
      openFile: () => void this.openViaDialog(),
      openRecent: (path: string) => this.openFile(path),
      recentFiles: () => this.recent.list(),
      opacityStepUp: () => this.opacityUp(),
      opacityStepDown: () => this.opacityDown(),
      autoScrollEnabled: () => this.settings.load().autoScroll.enabled,
      toggleAutoScroll: () => this.toggleAutoScroll(),
      autoScrollSpeed: () => this.settings.load().autoScroll.speed,
      setAutoScrollSpeed: (speed: AutoScrollSpeed) => this.setAutoScrollSpeed(speed),
      clickThroughEnabled: () => this.settings.load().clickThrough,
      toggleClickThrough: () => this.toggleClickThrough(),
      quit: () => app.quit(),
    };
  }

  private trayIconPath(): string {
    return join(app.getAppPath(), 'assets', 'icons', 'tray.png');
  }
}

function baseName(path: string): string {
  const parts = path.split(/[\\/]/);
  return parts[parts.length - 1] || path;
}
