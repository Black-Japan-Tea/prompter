import { Menu, Tray, app, nativeImage } from 'electron';
import { AutoScrollSpeed } from '../../shared/settings';

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
  quit(): void;
}

const SPEED_LABELS: Record<AutoScrollSpeed, string> = {
  slow: 'Медленно',
  medium: 'Средне',
  fast: 'Быстро',
};

/** Иконка в трее с полным меню управления суфлёром. */
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

  private buildMenu(): Menu {
    const recent = this.actions.recentFiles().map((path) => ({
      label: baseName(path),
      click: (): void => this.actions.openRecent(path),
    }));

    return Menu.buildFromTemplate([
      { label: 'Показать / Скрыть', click: () => this.actions.toggleWindow() },
      { type: 'separator' },
      { label: 'Открыть файл…', click: () => this.actions.openFile() },
      {
        label: 'Недавние',
        submenu: recent.length > 0 ? recent : [{ label: 'Пусто', enabled: false }],
      },
      { type: 'separator' },
      { label: 'Прозрачность +', click: () => this.actions.opacityStepUp() },
      { label: 'Прозрачность −', click: () => this.actions.opacityStepDown() },
      { type: 'separator' },
      {
        label: 'Автопрокрутка',
        type: 'checkbox',
        checked: this.actions.autoScrollEnabled(),
        click: () => this.actions.toggleAutoScroll(),
      },
      {
        label: 'Скорость прокрутки',
        submenu: (Object.keys(SPEED_LABELS) as AutoScrollSpeed[]).map((speed) => ({
          label: SPEED_LABELS[speed],
          type: 'radio' as const,
          checked: this.actions.autoScrollSpeed() === speed,
          click: (): void => this.actions.setAutoScrollSpeed(speed),
        })),
      },
      {
        label: 'Клик-сквозь',
        type: 'checkbox',
        checked: this.actions.clickThroughEnabled(),
        click: () => this.actions.toggleClickThrough(),
      },
      { type: 'separator' },
      { label: 'Выход', click: () => this.actions.quit() },
    ]);
  }

  destroy(): void {
    this.tray.destroy();
    void app; // ссылка живёт для будущих platform-зависимостей меню
  }
}

function baseName(path: string): string {
  const parts = path.split(/[\\/]/);
  return parts[parts.length - 1] || path;
}
