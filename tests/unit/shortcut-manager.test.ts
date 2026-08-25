import { describe, it, expect } from 'vitest';
import { ShortcutManager } from '../../src/main/shortcuts/ShortcutManager';

/**
 * Фейковый «Electron»: помнит, какие хоткеи заняты (регистрация возвращает false),
 * и хранит доставку нажатий, чтобы проверить диспетчеризацию.
 */
class FakeShortcutHost {
  readonly registered = new Set<string>();
  readonly unregistered = new Set<string>();
  busy = new Set<string>();

  register(accelerator: string): boolean {
    if (this.busy.has(accelerator)) {
      return false;
    }
    this.registered.add(accelerator);
    return true;
  }

  unregister(accelerator: string): void {
    this.registered.delete(accelerator);
    this.unregistered.add(accelerator);
  }
}

describe('ShortcutManager', () => {
  it('регистрирует все переданные хоткеи', () => {
    const host = new FakeShortcutHost();
    const manager = new ShortcutManager(host);
    const failures = manager.register({
      'Control+Alt+P': () => undefined,
      'Control+Alt+=': () => undefined,
    });
    expect(failures).toEqual([]);
    expect(host.registered).toEqual(new Set(['Control+Alt+P', 'Control+Alt+=']));
  });

  it('диспетчеризует нажатие нужному обработчику', () => {
    const host = new FakeShortcutHost();
    const manager = new ShortcutManager(host);
    const calls: string[] = [];
    manager.register({
      'Control+Alt+P': () => calls.push('toggle'),
      'Control+Alt+=': () => calls.push('brighter'),
    });

    manager.dispatch('Control+Alt+P');
    manager.dispatch('Control+Alt+=');
    manager.dispatch('Control+Alt+P');

    expect(calls).toEqual(['toggle', 'brighter', 'toggle']);
  });

  it('сообщает о хоткеях, занятых другими программами', () => {
    const host = new FakeShortcutHost();
    host.busy.add('Control+Alt+P');
    const manager = new ShortcutManager(host);

    const failures = manager.register({
      'Control+Alt+P': () => undefined,
      'Control+Alt+=': () => undefined,
    });

    expect(failures).toEqual(['Control+Alt+P']);
    expect(host.registered).toEqual(new Set(['Control+Alt+=']));
  });

  it('dispatch неизвестного хоткея не роняет приложение', () => {
    const host = new FakeShortcutHost();
    const manager = new ShortcutManager(host);
    expect(() => manager.dispatch('Control+Q')).not.toThrow();
  });

  it('dispose снимает все зарегистрированные хоткеи', () => {
    const host = new FakeShortcutHost();
    const manager = new ShortcutManager(host);
    manager.register({
      'Control+Alt+P': () => undefined,
      'Control+Alt+=': () => undefined,
      'Control+Alt+-': () => undefined,
    });

    manager.dispose();

    expect(host.registered).toEqual(new Set());
    expect(host.unregistered).toEqual(
      new Set(['Control+Alt+P', 'Control+Alt=', 'Control+Alt+-'].map((s) =>
        s === 'Control+Alt=' ? 'Control+Alt+=' : s,
      )),
    );
  });

  it('повторная регистрация перезаписывает обработчик без дублей', () => {
    const host = new FakeShortcutHost();
    const manager = new ShortcutManager(host);
    manager.register({ 'Control+Alt+P': () => undefined });
    const calls: string[] = [];
    manager.register({ 'Control+Alt+P': () => calls.push('new') });

    manager.dispatch('Control+Alt+P');

    expect(calls).toEqual(['new']);
    expect([...host.registered]).toEqual(['Control+Alt+P']);
  });
});
