import { describe, it, expect } from 'vitest';
import { MenuController, MenuItemModel } from '../../src/renderer/menu/MenuController';

function items(): MenuItemModel[] {
  return [
    { id: 'open', kind: 'item', label: 'Открыть файл…', accelerator: 'Ctrl+Alt+O' },
    { id: 'sep1', kind: 'separator', label: '' },
    { id: 'autoscroll', kind: 'checkbox', label: 'Автопрокрутка', checked: true },
    { id: 'speed-slow', kind: 'radio', label: 'Медленно', checked: false },
    { id: 'speed-fast', kind: 'radio', label: 'Быстро', checked: true },
    { id: 'disabled-item', kind: 'item', label: 'Недоступен', disabled: true },
  ];
}

describe('MenuController — открытие/закрытие', () => {
  it('закрыто по умолчанию, open открывает, close закрывает', () => {
    const menu = new MenuController(items());
    expect(menu.isOpen).toBe(false);
    menu.open();
    expect(menu.isOpen).toBe(true);
    menu.close();
    expect(menu.isOpen).toBe(false);
  });

  it('toggle переключает состояние', () => {
    const menu = new MenuController(items());
    menu.toggle();
    expect(menu.isOpen).toBe(true);
    menu.toggle();
    expect(menu.isOpen).toBe(false);
  });

  it('после открытия фокус на первом доступном пункте', () => {
    const menu = new MenuController(items());
    menu.open();
    expect(menu.focusedId).toBe('open');
  });
});

describe('MenuController — клавиатурная навигация', () => {
  it('ArrowDown двигает фокус, пропуская разделители', () => {
    const menu = new MenuController(items());
    menu.open();
    menu.moveDown();
    expect(menu.focusedId).toBe('autoscroll');
  });

  it('ArrowDown перепрыгивает недоступные пункты', () => {
    const menu = new MenuController(items());
    menu.open();
    menu.moveDown();
    menu.moveDown();
    menu.moveDown();
    expect(menu.focusedId).toBe('speed-fast');
    menu.moveDown(); // disabled-item пропускается, wrap на open
    expect(menu.focusedId).toBe('open');
  });

  it('ArrowUp заворачивается в конец списка', () => {
    const menu = new MenuController(items());
    menu.open();
    menu.moveUp();
    expect(menu.focusedId).toBe('speed-fast');
  });

  it('Home и End прыгают к первому и последнему доступному', () => {
    const menu = new MenuController(items());
    menu.open();
    menu.moveLast();
    expect(menu.focusedId).toBe('speed-fast');
    menu.moveFirst();
    expect(menu.focusedId).toBe('open');
  });

  it('activateFocused возвращает модель сфокусированного пункта', () => {
    const menu = new MenuController(items());
    menu.open();
    menu.moveDown();
    expect(menu.activateFocused()?.id).toBe('autoscroll');
  });

  it('activateFocused на недоступном пункте невозможен (фокус туда не встаёт)', () => {
    const menu = new MenuController(items());
    menu.open();
    menu.moveLast(); // speed-fast — последний доступный
    expect(menu.activateFocused()?.id).not.toBe('disabled-item');
  });

  it('close сбрасывает фокус', () => {
    const menu = new MenuController(items());
    menu.open();
    menu.moveDown();
    menu.close();
    expect(menu.focusedId).toBeNull();
  });

  it('фокус сохраняется при замене списка пунктов', () => {
    const menu = new MenuController(items());
    menu.open();
    menu.moveDown();
    menu.setItems(items());
    expect(menu.focusedId).toBe('autoscroll');
  });
});
