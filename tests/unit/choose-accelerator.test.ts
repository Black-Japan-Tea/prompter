import { describe, it, expect } from 'vitest';
import { chooseAccelerator } from '../../src/main/app/AppCommands';

describe('chooseAccelerator — выбор свободного хоткея с фолбэками', () => {
  it('возвращает первичный акселератор, если он свободен', () => {
    expect(chooseAccelerator('Control+Alt+P', ['Alt+Shift+P'], () => true, new Set())).toBe(
      'Control+Alt+P',
    );
  });

  it('перебирает фолбэки, пока не найдёт свободный', () => {
    const busy = new Set(['Control+Alt+P', 'Alt+Shift+P']);
    expect(
      chooseAccelerator('Control+Alt+P', ['Alt+Shift+P', 'Control+Shift+P'], (acc) => !busy.has(acc), busy),
    ).toBe('Control+Shift+P');
  });

  it('возвращает null, когда заняты все варианты', () => {
    expect(chooseAccelerator('Control+Alt+P', ['Alt+Shift+P'], () => false, new Set())).toBeNull();
  });

  it('не выбирает акселератор, уже занятый нашим же приложением в этой сессии', () => {
    const taken = new Set(['Alt+Shift+P']);
    expect(
      chooseAccelerator('Control+Alt+P', ['Alt+Shift+P', 'Control+Shift+P'], () => true, taken),
    ).toBe('Control+Shift+P');
  });
});
