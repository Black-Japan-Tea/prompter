import { Menu, Tray, nativeImage } from 'electron';
import { AutoScrollSpeed } from '../../shared/settings';
import { ACCELERATORS, SPEED_ACCELERATORS } from '../../shared/contracts';

/** Действия, которые меню трея запрашивает у приложения. */
export interface TrayActions {
  toggleWindow(): void;
  openFile(): void;
  openRecent(path: string): void;
  recentFiles(): readonly string[];
  opacityStepUp(): void;
  opacityStepDown(): void;
  autoScrollEnabled(): boolean;
  toggleAutoScroll(): void;
  autoScrollSpeed(): AutoScrollSpeed;
  setAutoScrollSpeed(speed: AutoScrollSpeed): void;
  clickThroughEnabled(): boolean;
  toggleClickThrough(): void;
  alwaysTopEnabled(): boolean;
  toggleAlwaysTop(): void;
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
    this.tray.setToolTip('Prompter — суфлёр для Markdown');
    this.tray.setContextMenu(this.buildMenu());
    // Левый клик по иконке тоже переключает окно — как хоткей.
    this.tray.on('click', () => this.actions.toggleWindow());
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

  private buildMenu(): Menu {
    const recent = this.actions.recentFiles().slice(0, 10).map((path) => ({
      label: baseName(path),
      click: (): void => this.actions.openRecent(path),
    }));

    return Menu.buildFromTemplate([
      {
        label: 'Показать / Скрыть',
        accelerator: ACCELERATORS['toggle-window'],
        click: (): void => this.actions.toggleWindow(),
      },
      { type: 'separator' },
      {
        label: 'Открыть файл…',
        accelerator: ACCELERATORS['open-file'],
        click: (): void => this.actions.openFile(),
      },
      {
        label: 'Последний файл',
        accelerator: ACCELERATORS['repeat-last-file'],
        click: (): void => this.actions.openRecent(this.actions.recentFiles()[0] ?? ''),
      },
      {
        label: 'Недавние',
        submenu: recent.length > 0 ? recent : [{ label: 'Пусто', enabled: false }],
      },
      { type: 'separator' },
      {
        label: 'Прозрачность +',
        accelerator: ACCELERATORS['opacity-up'],
        click: (): void => this.actions.opacityStepUp(),
      },
      {
        label: 'Прозрачность −',
        accelerator: ACCELERATORS['opacity-down'],
        click: (): void => this.actions.opacityStepDown(),
      },
      { type: 'separator' },
      {
        label: 'Автопрокрутка',
        type: 'checkbox',
        checked: this.actions.autoScrollEnabled(),
        accelerator: ACCELERATORS['autoscroll-toggle'],
        click: (): void => this.actions.toggleAutoScroll(),
      },
      {
        label: 'Скорость прокрутки',
        submenu: (Object.keys(SPEED_LABELS) as AutoScrollSpeed[]).map((speed) => ({
          label: SPEED_LABELS[speed],
          type: 'radio' as const,
          checked: this.actions.autoScrollSpeed() === speed,
          accelerator: SPEED_ACCELERATORS[speed],
          click: (): void => this.actions.setAutoScrollSpeed(speed),
        })),
      },
      {
        label: 'Клик-сквозь',
        type: 'checkbox',
        checked: this.actions.clickThroughEnabled(),
        accelerator: ACCELERATORS['clickthrough-toggle'],
        click: (): void => this.actions.toggleClickThrough(),
      },
      {
        label: 'Поверх всех окон',
        type: 'checkbox',
        checked: this.actions.alwaysTopEnabled(),
        accelerator: ACCELERATORS['always-top-toggle'],
        click: (): void => this.actions.toggleAlwaysTop(),
      },
      { type: 'separator' },
      {
        label: 'Спрятать окно',
        accelerator: ACCELERATORS['hide-window'],
        click: (): void => this.actions.toggleWindow(),
      },
      {
        label: 'Выход',
        accelerator: ACCELERATORS['quit'],
        click: (): void => this.actions.quit(),
      },
    ]);
  }
}

function baseName(path: string): string {
  const parts = path.split(/[\\/]/);
  return parts[parts.length - 1] || path;
}
