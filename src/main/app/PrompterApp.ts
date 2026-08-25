import { app, globalShortcut } from 'electron';
import { join } from 'node:path';
import { SettingsStore } from '../settings/SettingsStore';
import { PrompterWindow } from '../window/PrompterWindow';
import { TrayService } from '../tray/TrayService';
import { ShortcutManager } from '../shortcuts/ShortcutManager';
import { OpacityController, OpacityView } from '../state/OpacityController';
import { AutoScrollSpeed } from '../../shared/settings';
import {
  IPC,
  BroadcastState,
  FilePayload,
  NotifyPayload,
  AppCommand,
} from '../../shared/contracts';
import { AppCommandTarget, executeCommand } from './commands';
import { buildGlobalBindings, trayActionsFrom } from './AppCommands';
import { DocumentController } from './DocumentController';
import { registerAppIpc, clampFontSize } from './IpcBridge';

/** Собирает окно, трей, хоткеи, документ и настройки в одно приложение. */
export class PrompterApp implements AppCommandTarget {
  private readonly settings: SettingsStore;
  private readonly window: PrompterWindow;
  private readonly tray: TrayService;
  private readonly shortcuts: ShortcutManager;
  private readonly opacity: OpacityController;
  private readonly doc: DocumentController;

  constructor() {
    this.settings = new SettingsStore(join(app.getPath('userData'), 'settings.json'));
    const loaded = this.settings.load();
    this.window = new PrompterWindow(loaded);
    this.opacity = new OpacityController(this.opacityView(), loaded.opacity);
    this.doc = new DocumentController(this.settings, this.documentEvents());
    this.tray = new TrayService(this.trayIconPath(), trayActionsFrom(this, this.stateSource()));
    this.shortcuts = new ShortcutManager(this.shortcutHost());
    if (loaded.clickThrough) {
      this.window.setClickThrough(true);
    }
  }

  start(): void {
    registerAppIpc({
      executeCommand: (command) => executeCommand(this, command),
      openFile: (path) => this.openFile(path),
      setFontSize: (size) => {
        this.settings.update({ fontSize: clampFontSize(size) });
        this.broadcast();
      },
      hideWindow: () => this.hideWindow(),
      quit: () => this.quit(),
      requestState: () => this.broadcast(),
    });
    const failures = this.shortcuts.register(buildGlobalBindings(this));
    if (failures.length > 0) {
      const message = `Хоткеи заняты другими программами: ${failures.join(', ')}`;
      console.error(message);
      this.notify('error', message);
    }
    this.tray.showStartupHint();
    this.doc.restoreLastFile();
  }

  dispose(): void {
    // Сначала разрешаем окну закрываться, иначе перехват close отменит выход.
    this.window.prepareForQuit();
    this.saveBounds();
    this.shortcuts.dispose();
    this.doc.dispose();
    this.tray.destroy();
  }

  // ── Команды (AppCommandTarget) ─────────────────────────────────
  toggleWindow(): void {
    if (this.window.isVisible()) {
      this.saveBounds();
    }
    this.window.toggle();
  }

  showWindow(): void {
    this.window.show();
  }

  hideWindow(): void {
    this.saveBounds();
    this.window.hide();
  }

  quit(): void {
    app.quit();
  }

  openViaDialog(): void {
    this.doc.openViaDialog();
  }

  openFile(path: string): void {
    this.doc.openFile(path);
  }

  repeatLastFile(): void {
    this.doc.repeatLastFile();
  }

  opacityUp(): void {
    this.opacity.stepUp();
    this.settings.update({ opacity: this.opacity.value });
    this.broadcast();
  }

  opacityDown(): void {
    this.opacity.stepDown();
    this.settings.update({ opacity: this.opacity.value });
    this.broadcast();
  }

  toggleAutoScroll(): void {
    const auto = this.settings.load().autoScroll;
    this.settings.update({ autoScroll: { ...auto, enabled: !auto.enabled } });
    this.tray.refresh();
    this.broadcast();
  }

  setAutoScrollSpeed(speed: AutoScrollSpeed): void {
    const auto = this.settings.load().autoScroll;
    this.settings.update({ autoScroll: { ...auto, speed } });
    this.tray.refresh();
    this.broadcast();
  }

  toggleClickThrough(): void {
    const next = !this.settings.load().clickThrough;
    this.settings.update({ clickThrough: next });
    this.window.setClickThrough(next);
    this.tray.refresh();
    this.broadcast();
  }

  toggleAlwaysOnTop(): void {
    const next = !this.settings.load().alwaysOnTop;
    this.settings.update({ alwaysOnTop: next });
    this.window.setAlwaysOnTopEnabled(next);
    this.tray.refresh();
    this.broadcast();
  }

  // ── Диагностика и тест-хуки ────────────────────────────────────
  simulateNextPick(path: string | null): void {
    this.doc.simulateNextPick(path);
  }

  dispatchAccelerator(accelerator: string): void {
    this.shortcuts.dispatch(accelerator);
  }

  executeCommandForTests(command: AppCommand): void {
    executeCommand(this, command);
  }

  debugState(): BroadcastState & {
    windowVisible: boolean;
    contentProtection: boolean;
    skipTaskbar: boolean;
    alwaysOnTopActive: boolean;
    currentFile: string | null;
    trayAlive: boolean;
    registeredShortcuts: string[];
  } {
    return {
      ...this.broadcastState(),
      windowVisible: this.window.isVisible(),
      contentProtection: this.window.isContentProtected,
      skipTaskbar: this.window.isSkipTaskbar,
      alwaysOnTopActive: this.window.isAlwaysOnTop,
      currentFile: this.doc.currentPath,
      trayAlive: this.tray.isAlive,
      registeredShortcuts: this.shortcuts.registered(),
    };
  }

  // ── Внутреннее ─────────────────────────────────────────────────
  private documentEvents() {
    return {
      onOpened: (payload: FilePayload) => {
        this.window.win.webContents.send(IPC.fileOpened, payload);
        this.tray.refresh();
        this.broadcast();
      },
      onChanged: (content: string) => {
        this.window.win.webContents.send(IPC.fileChanged, { content });
      },
      onRemoved: (_fileName: string) => {
        this.window.win.webContents.send(IPC.fileRemoved);
        this.tray.refresh();
        this.broadcast();
      },
      onRecentChanged: () => this.broadcast(),
      notify: (level: NotifyPayload['level'], message: string) => this.notify(level, message),
    };
  }

  private notify(level: NotifyPayload['level'], message: string): void {
    this.window.win.webContents.send(IPC.notify, { level, message });
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
      fileName: this.doc.currentPath !== null ? baseName(this.doc.currentPath) : null,
      autoScrollEnabled: s.autoScroll.enabled,
      autoScrollSpeed: s.autoScroll.speed,
      fontSize: s.fontSize,
      opacity: this.opacity.value,
      clickThrough: s.clickThrough,
      alwaysOnTop: s.alwaysOnTop,
      recentFiles: this.doc.recentList(),
    };
  }

  private stateSource() {
    return {
      autoScrollEnabled: () => this.settings.load().autoScroll.enabled,
      autoScrollSpeed: () => this.settings.load().autoScroll.speed,
      clickThroughEnabled: () => this.settings.load().clickThrough,
      alwaysTopEnabled: () => this.settings.load().alwaysOnTop,
      recentFiles: () => this.doc.recentList(),
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

  private trayIconPath(): string {
    return join(app.getAppPath(), 'assets', 'icons', 'tray.png');
  }
}

function baseName(path: string): string {
  const parts = path.split(/[\\/]/);
  return parts[parts.length - 1] || path;
}
