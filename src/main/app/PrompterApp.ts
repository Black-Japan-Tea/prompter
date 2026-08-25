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
  AppCommandType,
  ACCELERATORS,
  ACCELERATOR_FALLBACKS,
  SPEED_ACCELERATORS,
} from '../../shared/contracts';
import { AppCommandTarget, executeCommand } from './commands';
import { trayActionsFrom, chooseAccelerator } from './AppCommands';
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
  /** Активные хоткеи после разрешения конфликтов с другими программами. */
  private activeAccelerators: Partial<Record<AppCommandType, string>> = {};

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
    this.registerHotkeysWithFallbacks();
    this.tray.showStartupHint();
    this.doc.restoreLastFile();
  }

  /**
   * Регистрирует хоткеи с фолбэками: Win32 RegisterHotKey отказывает
   * индивидуально (занято другими программами), состав зависит от машины.
   * Пользователю сообщаем реально работающие комбинации.
   */
  private registerHotkeysWithFallbacks(): void {
    const taken = new Set<string>();
    const remapped: string[] = [];
    const failed: AppCommandType[] = [];

    const singleKeyCommands: Array<[AppCommandType, () => void]> = [
      ['toggle-window', () => this.toggleWindow()],
      ['open-file', () => this.openViaDialog()],
      ['open-recent', () => this.repeatLastFile()],
      ['repeat-last-file', () => this.repeatLastFile()],
      ['opacity-up', () => this.opacityUp()],
      ['opacity-down', () => this.opacityDown()],
      ['autoscroll-toggle', () => this.toggleAutoScroll()],
      ['clickthrough-toggle', () => this.toggleClickThrough()],
      ['always-top-toggle', () => this.toggleAlwaysOnTop()],
      ['capture-protection-toggle', () => this.toggleCaptureProtection()],
      ['quit', () => this.quit()],
    ];

    for (const [type, handler] of singleKeyCommands) {
      const isFree = (accelerator: string): boolean =>
        this.shortcuts.register({ [accelerator]: handler }).length === 0;
      const chosen = chooseAccelerator(
        ACCELERATORS[type],
        ACCELERATOR_FALLBACKS[type] ?? [],
        isFree,
        taken,
      );
      if (chosen === null) {
        failed.push(type);
        continue;
      }
      taken.add(chosen);
      this.activeAccelerators[type] = chosen;
      if (chosen !== ACCELERATORS[type]) {
        remapped.push(`${type}: ${chosen}`);
      }
    }

    // Скорости — три отдельные комбинации, фолбэков не имеют.
    for (const speed of ['slow', 'medium', 'fast'] as AutoScrollSpeed[]) {
      const accelerator = SPEED_ACCELERATORS[speed];
      const ok =
        this.shortcuts.register({ [accelerator]: () => this.setAutoScrollSpeed(speed) })
          .length === 0;
      if (ok) {
        taken.add(accelerator);
        this.activeAccelerators['autoscroll-speed'] = 'Control+Alt+1..3';
      } else {
        failed.push('autoscroll-speed');
      }
    }

    if (remapped.length > 0) {
      this.notify('info', `Хоткеи переключены на свободные: ${remapped.join('; ')}`);
    }
    if (failed.length > 0) {
      const message = `Не удалось назначить хоткеи: ${failed.join(', ')} (все комбинации заняты)`;
      console.error(message);
      this.notify('error', message);
    }
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

  toggleCaptureProtection(): void {
    const next = !this.settings.load().captureProtection;
    this.settings.update({ captureProtection: next });
    this.window.setContentProtectionEnabled(next);
    this.tray.refresh();
    this.broadcast();
    if (!next) {
      this.notify('error', 'ВНИМАНИЕ: окно снова видно в трансляции экрана');
    }
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
      captureProtection: s.captureProtection,
      recentFiles: this.doc.recentList(),
      accelerators: this.activeAccelerators,
    };
  }

  private stateSource() {
    return {
      autoScrollEnabled: () => this.settings.load().autoScroll.enabled,
      autoScrollSpeed: () => this.settings.load().autoScroll.speed,
      clickThroughEnabled: () => this.settings.load().clickThrough,
      alwaysTopEnabled: () => this.settings.load().alwaysOnTop,
      captureProtectionEnabled: () => this.settings.load().captureProtection,
      recentFiles: () => this.doc.recentList(),
      accelerators: () => this.activeAccelerators,
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
