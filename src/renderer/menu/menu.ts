import { MenuItemModel, MenuController } from './MenuController';
import { ACCELERATORS, AppCommand, BroadcastState } from '../../shared/contracts';

const SPEED_LABELS: Record<string, string> = {
  slow: 'Медленно',
  medium: 'Средне',
  fast: 'Быстро',
};

/** Человекочитаемый акселератор: Control+Alt+P → Ctrl+Alt+P. */
function display(accelerator: string): string {
  return accelerator.replaceAll('Control', 'Ctrl').replaceAll('CommandOrCtrl', 'Ctrl');
}

/** Модель меню из текущего состояния: значения → чекбоксы и радио. */
export function buildMenuItems(state: BroadcastState): MenuItemModel[] {
  // Подпись хоткея — из активных (могут быть фолбэками после конфликтов).
  const active = state.accelerators as Record<string, string | undefined>;
  const accel = (type: string): string =>
    display(active[type] ?? ACCELERATORS[type as keyof typeof ACCELERATORS]);

  const items: MenuItemModel[] = [
    { id: 'open', kind: 'item', label: 'Открыть файл…', accelerator: accel('open-file') },
    { id: 'repeat', kind: 'item', label: 'Последний файл', accelerator: 'Ctrl+Alt+↵' },
  ];
  for (const path of state.recentFiles.slice(0, 5)) {
    items.push({ id: `recent:${path}`, kind: 'item', label: baseName(path) });
  }
  items.push(
    { id: 'sep-1', kind: 'separator', label: '' },
    { id: 'opacity-up', kind: 'item', label: 'Прозрачность +', accelerator: accel('opacity-up') },
    { id: 'opacity-down', kind: 'item', label: 'Прозрачность −', accelerator: accel('opacity-down') },
    { id: 'sep-2', kind: 'separator', label: '' },
    {
      id: 'autoscroll',
      kind: 'checkbox',
      label: 'Автопрокрутка',
      accelerator: accel('autoscroll-toggle'),
      checked: state.autoScrollEnabled,
    },
  );
  for (const speed of ['slow', 'medium', 'fast'] as const) {
    items.push({
      id: `speed:${speed}`,
      kind: 'radio',
      label: SPEED_LABELS[speed],
      accelerator: display(state.speedAccelerators[speed]),
      checked: state.autoScrollSpeed === speed,
    });
  }
  items.push(
    { id: 'sep-3', kind: 'separator', label: '' },
    {
      id: 'clickthrough',
      kind: 'checkbox',
      label: 'Клик-сквозь',
      accelerator: accel('clickthrough-toggle'),
      checked: state.clickThrough,
    },
    {
      id: 'capture-protection',
      kind: 'checkbox',
      label: 'Невидимо в трансляции',
      accelerator: accel('capture-protection-toggle'),
      checked: state.captureProtection,
    },
    {
      id: 'always-top',
      kind: 'checkbox',
      label: 'Поверх всех окон',
      accelerator: accel('always-top-toggle'),
      checked: state.alwaysOnTop,
    },
    { id: 'sep-4', kind: 'separator', label: '' },
    { id: 'hide', kind: 'item', label: 'Спрятать окно' },
    { id: 'quit', kind: 'item', label: 'Выход', accelerator: 'Ctrl+Q' },
  );
  return items;
}

/** Идентификатор пункта → команда приложения. */
export function commandForItem(id: string): AppCommand | null {
  if (id === 'open') {
    return { type: 'open-file' };
  }
  if (id === 'repeat') {
    return { type: 'repeat-last-file' };
  }
  if (id.startsWith('recent:')) {
    return { type: 'open-recent', path: id.slice('recent:'.length) };
  }
  if (id === 'opacity-up') {
    return { type: 'opacity-up' };
  }
  if (id === 'opacity-down') {
    return { type: 'opacity-down' };
  }
  if (id === 'autoscroll') {
    return { type: 'autoscroll-toggle' };
  }
  if (id.startsWith('speed:')) {
    return { type: 'autoscroll-speed', speed: id.slice('speed:'.length) as 'slow' | 'medium' | 'fast' };
  }
  if (id === 'clickthrough') {
    return { type: 'clickthrough-toggle' };
  }
  if (id === 'capture-protection') {
    return { type: 'capture-protection-toggle' };
  }
  if (id === 'always-top') {
    return { type: 'always-top-toggle' };
  }
  if (id === 'hide') {
    return { type: 'hide-window' };
  }
  if (id === 'quit') {
    return { type: 'quit' };
  }
  return null;
}

/** Отрисовка и клавиатура меню поверх MenuController. */
export class MenuView {
  private readonly controller: MenuController;
  private lastItems: MenuItemModel[] = [];

  constructor(
    private readonly container: HTMLElement,
    private readonly trigger: HTMLElement,
    private readonly onCommand: (command: AppCommand) => void,
  ) {
    this.controller = new MenuController([]);
    this.bindKeyboard();
    this.bindOutsideClick();
    trigger.addEventListener('click', () => this.toggle());
    trigger.addEventListener('keydown', (event) => {
      if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        this.open();
      }
    });
  }

  get isOpen(): boolean {
    return this.controller.isOpen;
  }

  update(state: BroadcastState): void {
    this.lastItems = buildMenuItems(state);
    this.controller.setItems(this.lastItems);
    if (this.controller.isOpen) {
      // Перерисовка пересоздаёт DOM: возвращаем фокус на активный пункт.
      this.render();
      this.focusFocused();
    }
  }

  open(): void {
    this.controller.open();
    this.render();
    this.focusFocused();
    this.trigger.setAttribute('aria-expanded', 'true');
  }

  close(): void {
    this.controller.close();
    this.container.hidden = true;
    this.trigger.setAttribute('aria-expanded', 'false');
  }

  toggle(): void {
    if (this.controller.isOpen) {
      this.close();
    } else {
      this.open();
    }
  }

  private render(): void {
    this.container.hidden = false;
    this.container.replaceChildren(
      ...this.lastItems.map((item) => this.renderItem(item)),
    );
  }

  private renderItem(item: MenuItemModel): HTMLElement {
    if (item.kind === 'separator') {
      const sep = document.createElement('div');
      sep.className = 'menu-separator';
      sep.setAttribute('role', 'separator');
      return sep;
    }
    const button = document.createElement('button');
    button.className = 'menu-item';
    button.dataset.id = item.id;
    button.type = 'button';
    button.setAttribute('role', `menuitem${item.kind === 'item' ? '' : item.kind}`);
    if (item.kind !== 'item') {
      button.setAttribute('aria-checked', String(item.checked === true));
    }
    button.disabled = item.disabled === true;

    const label = document.createElement('span');
    label.className = 'menu-label';
    label.textContent = item.label;
    button.append(label);

    if (item.accelerator !== undefined) {
      const accel = document.createElement('span');
      accel.className = 'menu-accel';
      accel.textContent = item.accelerator;
      button.append(accel);
    }

    button.addEventListener('click', () => this.activate(item.id));
    button.addEventListener('mouseenter', () => {
      this.controller.focusById(item.id);
      this.focusFocused();
    });
    return button;
  }

  private activate(id: string): void {
    const command = commandForItem(id);
    if (command !== null) {
      this.onCommand(command);
    }
    this.close();
  }

  private bindKeyboard(): void {
    this.container.addEventListener('keydown', (event) => {
      const key = event.key;
      if (['ArrowDown', 'ArrowUp', 'Home', 'End', 'Enter', ' ', 'Escape', 'Tab'].includes(key)) {
        event.preventDefault();
      }
      if (key === 'ArrowDown') {
        this.controller.moveDown();
      } else if (key === 'ArrowUp') {
        this.controller.moveUp();
      } else if (key === 'Home') {
        this.controller.moveFirst();
      } else if (key === 'End') {
        this.controller.moveLast();
      } else if (key === 'Escape' || key === 'Tab') {
        this.close();
        this.trigger.focus();
        return;
      } else if (key === 'Enter' || key === ' ') {
        const focused = this.controller.activateFocused();
        if (focused !== null) {
          this.activate(focused.id);
          return;
        }
      } else {
        return;
      }
      this.focusFocused();
    });
  }

  private bindOutsideClick(): void {
    document.addEventListener('click', (event) => {
      if (!this.controller.isOpen) {
        return;
      }
      const target = event.target as Node;
      if (!this.container.contains(target) && target !== this.trigger) {
        this.close();
      }
    }, true);
  }

  private focusFocused(): void {
    const focusedId = this.controller.focusedId;
    const element = focusedId !== null
      ? this.container.querySelector<HTMLElement>(`[data-id="${cssEscape(focusedId)}"]`)
      : null;
    element?.focus();
  }
}

function cssEscape(value: string): string {
  return value.replace(/["\\]/g, '\\$&');
}

function baseName(path: string): string {
  const parts = path.split(/[\\/]/);
  return parts[parts.length - 1] || path;
}
