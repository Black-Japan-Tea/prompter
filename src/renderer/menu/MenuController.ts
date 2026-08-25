/** Модель пункта меню: вид, состояние, подпись и акселератор. */
export interface MenuItemModel {
  id: string;
  kind: 'item' | 'checkbox' | 'radio' | 'separator';
  label: string;
  accelerator?: string;
  checked?: boolean;
  disabled?: boolean;
}

/**
 * Клавиатурная машина состояний меню (стрелки/Home/End/фокус).
 * DOM не трогает — отрисовкой занимается menu.ts, что и делает
 * контроллер юнит-тестируемым без браузера.
 */
export class MenuController {
  private items: MenuItemModel[];
  private opened = false;
  private focusedIndex = -1;

  constructor(items: MenuItemModel[]) {
    this.items = items;
  }

  get isOpen(): boolean {
    return this.opened;
  }

  get focusedId(): string | null {
    return this.items[this.focusedIndex]?.id ?? null;
  }

  setItems(items: MenuItemModel[]): void {
    this.items = items;
    if (this.focusedIndex >= this.items.length) {
      this.focusedIndex = this.items.length - 1;
    }
    if (this.opened && this.focusedIndex < 0) {
      this.focusFirstAvailable();
    }
  }

  open(): void {
    this.opened = true;
    this.focusFirstAvailable();
  }

  close(): void {
    this.opened = false;
    this.focusedIndex = -1;
  }

  toggle(): void {
    if (this.opened) {
      this.close();
    } else {
      this.open();
    }
  }

  focusById(id: string): void {
    const index = this.selectable().findIndex((entry) => entry.item.id === id);
    if (index >= 0) {
      this.focusedIndex = entryIndexOf(this.items, this.selectable()[index].item);
    }
  }

  moveDown(): void {
    this.step(1);
  }

  moveUp(): void {
    this.step(-1);
  }

  moveFirst(): void {
    this.focusFirstAvailable();
  }

  moveLast(): void {
    const list = this.selectable();
    if (list.length > 0) {
      this.focusedIndex = entryIndexOf(this.items, list[list.length - 1].item);
    }
  }

  activateFocused(): MenuItemModel | null {
    const item = this.items[this.focusedIndex];
    if (item === undefined || item.disabled || item.kind === 'separator') {
      return null;
    }
    return item;
  }

  private selectable(): Array<{ item: MenuItemModel; index: number }> {
    return this.items
      .map((item, index) => ({ item, index }))
      .filter(({ item }) => item.kind !== 'separator' && !item.disabled);
  }

  private focusFirstAvailable(): void {
    const list = this.selectable();
    this.focusedIndex = list.length > 0 ? list[0].index : -1;
  }

  /** Шаг с переходом через край списка (wrap-around). */
  private step(direction: 1 | -1): void {
    const list = this.selectable();
    if (list.length === 0) {
      return;
    }
    const current = list.findIndex(({ index }) => index === this.focusedIndex);
    const next = current === -1 ? 0 : (current + direction + list.length) % list.length;
    this.focusedIndex = list[next].index;
  }
}

function entryIndexOf(items: MenuItemModel[], target: MenuItemModel): number {
  return items.indexOf(target);
}
