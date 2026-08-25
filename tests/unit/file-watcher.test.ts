import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FileWatcher, FileEvent } from '../../src/main/files/FileWatcher';

// Реальные файлы и реальный fs.watch: никакой симуляции.
const tempDirs: string[] = [];

function tempFile(name = 'notes.md'): string {
  const dir = mkdtempSync(join(tmpdir(), 'prompter-watch-'));
  tempDirs.push(dir);
  return join(dir, name);
}

/** Ждём, пока условие не станет истинным (события fs.watch асинхронны). */
async function waitFor(condition: () => boolean, timeoutMs = 4000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!condition()) {
    if (Date.now() > deadline) {
      throw new Error('условие не наступило за отведённое время');
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

describe('FileWatcher', () => {
  let events: FileEvent[];

  beforeEach(() => {
    events = [];
  });

  afterEach(() => {
    while (tempDirs.length > 0) {
      rmSync(tempDirs.pop() as string, { recursive: true, force: true });
    }
  });

  it('сообщает об изменении файла', async () => {
    const path = tempFile();
    writeFileSync(path, 'версия 1', 'utf8');
    const watcher = new FileWatcher(150);
    watcher.start(path, (event) => events.push(event));

    writeFileSync(path, 'версия 2', 'utf8');

    await waitFor(() => events.length > 0);
    expect(events).toEqual(['changed']);
    watcher.stop();
  });

  it('схлопывает серию записей в одно событие (debounce)', async () => {
    const path = tempFile();
    writeFileSync(path, 'старт', 'utf8');
    const watcher = new FileWatcher(120);
    watcher.start(path, (event) => events.push(event));

    for (let i = 0; i < 5; i++) {
      writeFileSync(path, `правка ${i}`, 'utf8');
      await new Promise((resolve) => setTimeout(resolve, 20));
    }

    await waitFor(() => events.length > 0);
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(events).toEqual(['changed']);
    watcher.stop();
  });

  it('сообщает об удалении файла', async () => {
    const path = tempFile();
    writeFileSync(path, 'скоро удалят', 'utf8');
    const watcher = new FileWatcher(150);
    watcher.start(path, (event) => events.push(event));

    unlinkSync(path);

    await waitFor(() => events.length > 0);
    expect(events).toEqual(['removed']);
    watcher.stop();
  });

  it('после stop() события не приходят', async () => {
    const path = tempFile();
    writeFileSync(path, 'данные', 'utf8');
    const watcher = new FileWatcher(150);
    watcher.start(path, (event) => events.push(event));
    watcher.stop();

    writeFileSync(path, 'изменение после остановки', 'utf8');
    await new Promise((resolve) => setTimeout(resolve, 300));

    expect(events).toEqual([]);
  });

  it('не падает при старте на отсутствующем файле и сообщает removed', async () => {
    const path = join(tempFile(), 'нет-такого.md');
    const watcher = new FileWatcher(150);
    watcher.start(path, (event) => events.push(event));

    await waitFor(() => events.length > 0);
    expect(events).toEqual(['removed']);
    watcher.stop();
  });

  it('перезапуск следит за новым файлом', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'prompter-watch-'));
    tempDirs.push(dir);
    const first = join(dir, 'first.md');
    const second = join(dir, 'second.md');
    writeFileSync(first, 'первый', 'utf8');
    writeFileSync(second, 'второй', 'utf8');
    const watcher = new FileWatcher(150);
    watcher.start(first, (event) => events.push(event));
    watcher.stop();

    watcher.start(second, (event) => events.push(event));
    writeFileSync(second, 'второй (обновлён)', 'utf8');

    await waitFor(() => events.length > 0);
    expect(events).toEqual(['changed']);
    watcher.stop();
  });
});
