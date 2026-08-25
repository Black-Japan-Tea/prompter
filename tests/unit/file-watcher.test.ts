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
    const watcher = new FileWatcher(path, 80);
    watcher.start((event) => events.push(event));

    writeFileSync(path, 'версия 2', 'utf8');

    await waitFor(() => events.length > 0);
    expect(events).toEqual(['changed']);
    watcher.stop();
  });

  it('схлопывает серию записей в одно событие (debounce)', async () => {
    const path = tempFile();
    writeFileSync(path, 'старт', 'utf8');
    const watcher = new FileWatcher(path, 120);
    watcher.start((event) => events.push(event));

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
    const watcher = new FileWatcher(path, 80);
    watcher.start((event) => events.push(event));

    unlinkSync(path);

    await waitFor(() => events.length > 0);
    expect(events).toEqual(['removed']);
    watcher.stop();
  });

  it('после stop() события не приходят', async () => {
    const path = tempFile();
    writeFileSync(path, 'данные', 'utf8');
    const watcher = new FileWatcher(path, 80);
    watcher.start((event) => events.push(event));
    watcher.stop();

    writeFileSync(path, 'изменение после остановки', 'utf8');
    await new Promise((resolve) => setTimeout(resolve, 300));

    expect(events).toEqual([]);
  });

  it('не падает при старте на отсутствующем файле и сообщает removed', async () => {
    const path = join(tempFile(), 'нет-такого.md');
    const watcher = new FileWatcher(path, 80);
    watcher.start((event) => events.push(event));

    await waitFor(() => events.length > 0);
    expect(events).toEqual(['removed']);
    watcher.stop();
  });
});
