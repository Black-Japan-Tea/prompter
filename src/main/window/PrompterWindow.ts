import { BrowserWindow } from 'electron';
import { join } from 'node:path';
import { AppSettings } from '../../shared/settings';

const DEFAULT_WIDTH = 560;
const DEFAULT_HEIGHT = 680;
const MIN_WIDTH = 320;
const MIN_HEIGHT = 240;

/**
 * Окно суфлёра: безрамочное, без кнопки на панели задач, поверх всех
 * и полностью исключённое из захвата экрана (SetWindowDisplayAffinity).
 */
export class PrompterWindow {
  readonly win: BrowserWindow;
  private contentProtectionOn = false;
  private skipTaskbarOn = true;
  private quitting = false;

  constructor(settings: AppSettings) {
    this.win = new BrowserWindow({
      width: settings.windowBounds?.width ?? DEFAULT_WIDTH,
      height: settings.windowBounds?.height ?? DEFAULT_HEIGHT,
      x: settings.windowBounds?.x,
      y: settings.windowBounds?.y,
      minWidth: MIN_WIDTH,
      minHeight: MIN_HEIGHT,
      show: false,
      frame: false,
      skipTaskbar: true,
      transparent: true,
      resizable: true,
      webPreferences: {
        // __dirname здесь — dist/main/window, поэтому два уровня вверх до dist.
        preload: join(__dirname, '..', '..', 'preload', 'preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });

    this.win.setAlwaysOnTop(true, 'screen-saver');
    this.applyContentProtection();
    // Крестик и системные жесты не убивают приложение — только прячут окно.
    // При настоящем выходе (prepareForQuit) закрытие разрешаем.
    this.win.on('close', (event) => {
      if (!this.quitting) {
        event.preventDefault();
        this.win.hide();
      }
    });
    this.win
      .loadFile(join(__dirname, '..', '..', 'renderer', 'index.html'))
      .catch((error: unknown) => {
        console.error('Не удалось загрузить окно суфлёра:', error);
      });
  }

  /** Разрешает реальное закрытие окна при выходе из приложения. */
  prepareForQuit(): void {
    this.quitting = true;
  }

  /** Тот самый вызов, прячущий окно из трансляций: setContentProtection. */
  private applyContentProtection(): void {
    this.win.setContentProtection(true);
    this.contentProtectionOn = true;
  }

  get isContentProtected(): boolean {
    return this.contentProtectionOn;
  }

  get isSkipTaskbar(): boolean {
    // У BrowserWindow нет геттера — ведём флаг сами (в конструкторе skipTaskbar: true).
    return this.skipTaskbarOn;
  }

  show(): void {
    this.win.show();
    this.win.focus();
  }

  hide(): void {
    this.win.hide();
  }

  toggle(): void {
    if (this.win.isVisible()) {
      this.win.hide();
    } else {
      this.show();
    }
  }

  isVisible(): boolean {
    return this.win.isVisible();
  }

  setClickThrough(enabled: boolean): void {
    // forward:true оставляет окну события движения мыши для hover-эффектов.
    this.win.setIgnoreMouseEvents(enabled, { forward: true });
  }

  bounds(): AppSettings['windowBounds'] {
    const rect = this.win.getBounds();
    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
  }
}
