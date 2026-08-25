import { describe, it, expect } from 'vitest';
import {
  AppCommand,
  ACCELERATORS,
  COMMAND_TYPES,
} from '../../src/shared/contracts';
import { parseCommandPayload } from '../../src/main/app/commands';

describe('ACCELERATORS — у каждой команды есть хоткей', () => {
  it('покрывает все типы команд без пропусков', () => {
    for (const type of COMMAND_TYPES) {
      expect(
        ACCELERATORS[type],
        `у команды «${type}» нет хоткея`,
      ).toBeTruthy();
    }
  });

  it('все хоткеи уникальны', () => {
    const values = Object.values(ACCELERATORS);
    expect(new Set(values).size).toBe(values.length);
  });
});

describe('parseCommandPayload — строгая валидация входа IPC', () => {
  it('разбирает валидные команды', () => {
    expect(parseCommandPayload({ type: 'toggle-window' })).toEqual({ type: 'toggle-window' });
    expect(parseCommandPayload({ type: 'autoscroll-speed', speed: 'fast' })).toEqual({
      type: 'autoscroll-speed',
      speed: 'fast',
    });
    expect(parseCommandPayload({ type: 'open-recent', path: 'C:/a.md' })).toEqual({
      type: 'open-recent',
      path: 'C:/a.md',
    });
  });

  it('отклоняет мусор вместо падения', () => {
    expect(parseCommandPayload(null)).toBeNull();
    expect(parseCommandPayload('toggle-window')).toBeNull();
    expect(parseCommandPayload(42)).toBeNull();
    expect(parseCommandPayload({})).toBeNull();
    expect(parseCommandPayload({ type: 'нет-такой' })).toBeNull();
  });

  it('отклоняет команды с невалидными полями', () => {
    expect(parseCommandPayload({ type: 'autoscroll-speed', speed: 'warp' })).toBeNull();
    expect(parseCommandPayload({ type: 'autoscroll-speed' })).toBeNull();
    expect(parseCommandPayload({ type: 'open-recent', path: 7 })).toBeNull();
    expect(parseCommandPayload({ type: 'open-recent' })).toBeNull();
  });

  it('проверяет типы аргументов по шаблону AppCommand', () => {
    const command: AppCommand = { type: 'opacity-up' };
    expect(parseCommandPayload(command)).toEqual(command);
  });
});
