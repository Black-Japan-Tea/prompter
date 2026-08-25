import { app, globalShortcut, shell } from 'electron';
import { join } from 'node:path';
import { SettingsStore } from '../settings/SettingsStore';
import { PrompterWindow } from '../window/PrompterWindow';
import { TrayService } from '../tray/TrayService';
import { buildTrayIcon } from '../tray/trayIcon';
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
  SPEED_ACCELERATOR_FALLBACKS,
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
  /** Активные хоткеи скоростей (с фолбэками). */
  private speedAccelerators: Record<AutoScrollSpeed, string> = { ...SPEED_ACCELERATORS };
  /** Открыватель внешних путей: shell.openPath, подменяется тест-хуком. */
  private externalOpener: (path: string) => Promise<string> = (path) => shell.openPath(path);
  /** Последний путь, запрошенный md-ссылкой (диагностика/E2E). */
  private lastOpenedExternalPath: string | null = null;

  constructor() {
    this.settings = new SettingsStore(join(app.getPath('userData'), 'settings.json'));
    const loaded = this.settings.load();
    this.window = new PrompterWindow(loaded);
    this.opacity = new OpacityController(this.opacityView(), loaded.opacity);
    this.doc = new DocumentController(this.settings, this.documentEvents());
    this.tray = new TrayService(
      buildTrayIcon(join(app.getAppPath(), 'assets', 'icons')),
      trayActionsFrom(this, this.stateSource()),
    );
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
      openExternalPath: (path) => void this.openExternalPath(path),
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
      ['opacity-up', () => this.transparencyUp()],
      ['opacity-down', () => this.transparencyDown()],
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

    // Скорости — три отдельные комбинации с собственными фолбэками.
    for (const speed of ['slow', 'medium', 'fast'] as AutoScrollSpeed[]) {
      const handler = (): void => this.setAutoScrollSpeed(speed);
      const isFree = (accelerator: string): boolean =>
        this.shortcuts.register({ [accelerator]: handler }).length === 0;
      const chosen = chooseAccelerator(
        SPEED_ACCELERATORS[speed],
        SPEED_ACCELERATOR_FALLBACKS[speed],
        isFree,
        taken,
      );
      if (chosen === null) {
        failed.push('autoscroll-speed');
        continue;
      }
      taken.add(chosen);
      this.speedAccelerators[speed] = chosen;
      this.activeAccelerators['autoscroll-speed'] = [
        this.speedAccelerators.slow,
        this.speedAccelerators.medium,
        this.speedAccelerators.fast,
      ].join(' / ');
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

  /** Прозрачность растёт — окно прозрачнее (непрозрачность вниз, до 0.05). */
  transparencyUp(): void {
    this.opacity.stepDown();
    this.settings.update({ opacity: this.opacity.value });
    this.broadcast();
  }

  /** Прозрачность падает — окно плотнее (непрозрачность вверх, до 1). */
  transparencyDown(): void {
    this.opacity.stepUp();
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
    // Единственный источник предупреждений о трансляции — здесь, в main.
    this.notify(
      next ? 'info' : 'error',
      next
        ? 'Окно снова невидимо в трансляции'
        : 'ВНИМАНИЕ: окно снова видно в трансляции экрана',
    );
  }

  // ── Диагностика и тест-хуки ────────────────────────────────────
  simulateNextPick(path: string | null): void {
    this.doc.simulateNextPick(path);
  }

  /** md-ссылка из конспекта: открыть файл приложением ОС по ассоциации. */
  async openExternalPath(path: string): Promise<void> {
    if (process.env.PROMPTER_TEST_HOOKS === '1') {
      // В тестах не поднимаем Typora: фиксируем путь для ассертов.
      this.lastOpenedExternalPath = path;
      return;
    }
    const error = await this.externalOpener(path);
    this.lastOpenedExternalPath = path;
    if (error !== '') {
      this.notify('error', `Не удалось открыть ${baseName(path)}: ${error}`);
    }
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
    lastOpenedExternalPath: string | null;
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
      lastOpenedExternalPath: this.lastOpenedExternalPath,
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
      speedAccelerators: this.speedAccelerators,
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
      speedAccelerators: () => this.speedAccelerators,
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
}

function baseName(path: string): string {
  const parts = path.split(/[\\/]/);
  return parts[parts.length - 1] || path;
}
