import { Menu, Tray, nativeImage } from 'electron';
import { AutoScrollSpeed } from '../../shared/settings';
import { ACCELERATORS, AppCommandType } from '../../shared/contracts';

/** Действия, которые меню трея запрашивает у приложения. */
export interface TrayActions {
  toggleWindow(): void;
  showWindow(): void;
  hideWindow(): void;
  openFile(): void;
  openRecent(path: string): void;
  recentFiles(): readonly string[];
  transparencyUp(): void;
  transparencyDown(): void;
  autoScrollEnabled(): boolean;
  toggleAutoScroll(): void;
  autoScrollSpeed(): AutoScrollSpeed;
  setAutoScrollSpeed(speed: AutoScrollSpeed): void;
  clickThroughEnabled(): boolean;
  toggleClickThrough(): void;
  alwaysTopEnabled(): boolean;
  toggleAlwaysTop(): void;
  captureProtectionEnabled(): boolean;
  toggleCaptureProtection(): void;
  accelerators(): Partial<Record<AppCommandType, string>>;
  speedAccelerators(): Record<AutoScrollSpeed, string>;
  quit(): void;
}

const SPEED_LABELS: Record<AutoScrollSpeed, string> = {
  slow: 'Медленно',
  medium: 'Средне',
  fast: 'Быстро',
};

/** Иконка в трее с полным меню управления суфлёром (с подписями хоткеев). */
export class TrayService {
  private readonly tray: Tray;
  private readonly icon: Electron.NativeImage;

  constructor(iconPath: string, private readonly actions: TrayActions) {
    this.icon = nativeImage.createFromPath(iconPath);
    this.tray = new Tray(this.icon);
    this.tray.setToolTip('Prompter — суфлёр для Markdown\nДвойной клик — показать окно');
    this.tray.setContextMenu(this.buildMenu());
    // Стандарт Windows: двойной клик — главное действие (показ окна),
    // правый — контекстное меню. Одиночный клик окно не дёргает.
    this.tray.on('double-click', () => this.actions.showWindow());
    this.tray.on('right-click', () => {
      this.tray.popUpContextMenu();
    });
  }

  /** Пересобирает меню после изменения чекбоксов/радиокнопок. */
  refresh(): void {
    this.tray.setContextMenu(this.buildMenu());
  }

  /** Жив ли системный трей (для диагностики и E2E). */
  get isAlive(): boolean {
    return !this.tray.isDestroyed();
  }

  showStartupHint(): void {
    if (typeof this.tray.displayBalloon !== 'function') {
      return;
    }
    try {
      this.tray.displayBalloon({
        icon: this.icon,
        title: 'Prompter запущен',
        content: 'Окно скрыто. Нажмите Ctrl+Alt+P, чтобы показать суфлёра.',
      });
    } catch (error) {
      // Балун — косметика: приложение живёт и без него, но молчать нельзя.
      console.error('Не удалось показать всплывающую подсказку:', error);
    }
  }

  destroy(): void {
    this.tray.destroy();
  }

  /** Активный хоткей команды с учётом фолбэков. */
  private accel(type: AppCommandType): string {
    return this.actions.accelerators()[type] ?? ACCELERATORS[type];
  }

  private buildMenu(): Menu {
    const recent = this.actions.recentFiles().slice(0, 10).map((path) => ({
      label: baseName(path),
      click: (): void => this.actions.openRecent(path),
    }));

    return Menu.buildFromTemplate([
      {
        label: 'Показать / Скрыть',
        accelerator: this.accel('toggle-window'),
        click: (): void => this.actions.toggleWindow(),
      },
      { type: 'separator' },
      {
        label: 'Открыть файл…',
        accelerator: this.accel('open-file'),
        click: (): void => this.actions.openFile(),
      },
      {
        label: 'Последний файл',
        accelerator: this.accel('repeat-last-file'),
        click: (): void => this.actions.openRecent(this.actions.recentFiles()[0] ?? ''),
      },
      {
        label: 'Недавние',
        submenu: recent.length > 0 ? recent : [{ label: 'Пусто', enabled: false }],
      },
      { type: 'separator' },
      {
        label: 'Прозрачность +',
        accelerator: this.accel('opacity-up'),
        click: (): void => this.actions.transparencyUp(),
      },
      {
        label: 'Прозрачность −',
        accelerator: this.accel('opacity-down'),
        click: (): void => this.actions.transparencyDown(),
      },
      { type: 'separator' },
      {
        label: 'Автопрокрутка',
        type: 'checkbox',
        checked: this.actions.autoScrollEnabled(),
        accelerator: this.accel('autoscroll-toggle'),
        click: (): void => this.actions.toggleAutoScroll(),
      },
      {
        label: 'Скорость прокрутки',
        submenu: (Object.keys(SPEED_LABELS) as AutoScrollSpeed[]).map((speed) => ({
          label: SPEED_LABELS[speed],
          type: 'radio' as const,
          checked: this.actions.autoScrollSpeed() === speed,
          accelerator: this.actions.speedAccelerators()[speed],
          click: (): void => this.actions.setAutoScrollSpeed(speed),
        })),
      },
      {
        label: 'Клик-сквозь',
        type: 'checkbox',
        checked: this.actions.clickThroughEnabled(),
        accelerator: this.accel('clickthrough-toggle'),
        click: (): void => this.actions.toggleClickThrough(),
      },
      {
        label: 'Невидимо в трансляции',
        type: 'checkbox',
        checked: this.actions.captureProtectionEnabled(),
        accelerator: this.accel('capture-protection-toggle'),
        click: (): void => this.actions.toggleCaptureProtection(),
      },
      {
        label: 'Поверх всех окон',
        type: 'checkbox',
        checked: this.actions.alwaysTopEnabled(),
        accelerator: this.accel('always-top-toggle'),
        click: (): void => this.actions.toggleAlwaysTop(),
      },
      { type: 'separator' },
      {
        label: 'Спрятать окно',
        click: (): void => this.actions.hideWindow(),
      },
      {
        label: 'Выход',
        accelerator: this.accel('quit'),
        click: (): void => this.actions.quit(),
      },
    ]);
  }
}

function baseName(path: string): string {
  const parts = path.split(/[\\/]/);
  return parts[parts.length - 1] || path;
}
