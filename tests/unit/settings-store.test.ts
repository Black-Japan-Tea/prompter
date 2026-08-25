import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SettingsStore } from '../../src/main/settings/SettingsStore';
import { DEFAULT_SETTINGS } from '../../src/shared/settings';

// Настоящие файлы во временной папке: без моков, реальный I/O.
const tempDirs: string[] = [];

function settingsPath(): string {
  const dir = mkdtempSync(join(tmpdir(), 'prompter-test-'));
  tempDirs.push(dir);
  return join(dir, 'settings.json');
}

afterEach(() => {
  while (tempDirs.length > 0) {
    rmSync(tempDirs.pop() as string, { recursive: true, force: true });
  }
});

describe('SettingsStore', () => {
  it('отдаёт дефолтные настройки, когда файла ещё нет', () => {
    const store = new SettingsStore(settingsPath());
    expect(store.load()).toEqual(DEFAULT_SETTINGS);
  });

  it('читает настройки, сохранённые в файле', () => {
    const path = settingsPath();
    const saved = { ...DEFAULT_SETTINGS, opacity: 0.4, fontSize: 22 };
    writeFileSync(path, JSON.stringify(saved), 'utf8');

    const store = new SettingsStore(path);
    expect(store.load()).toEqual(saved);
  });

  it('возвращает дефолты при битом JSON вместо падения', () => {
    const path = settingsPath();
    writeFileSync(path, '{не json}}', 'utf8');

    const store = new SettingsStore(path);
    expect(store.load()).toEqual(DEFAULT_SETTINGS);
  });

  it('домерживает частичный файл до полных настроек', () => {
    const path = settingsPath();
    writeFileSync(path, JSON.stringify({ opacity: 0.55 }), 'utf8');

    const loaded = new SettingsStore(path).load();
    expect(loaded.opacity).toBe(0.55);
    expect(loaded.autoScroll).toEqual(DEFAULT_SETTINGS.autoScroll);
  });

  it('отбрасывает значения неверного типа из файла', () => {
    const path = settingsPath();
    writeFileSync(path, JSON.stringify({ opacity: 'много', fontSize: null }), 'utf8');

    const loaded = new SettingsStore(path).load();
    expect(loaded.opacity).toBe(DEFAULT_SETTINGS.opacity);
    expect(loaded.fontSize).toBe(DEFAULT_SETTINGS.fontSize);
  });

  it('отбрасывает неизвестную скорость автопрокрутки', () => {
    const path = settingsPath();
    writeFileSync(
      path,
      JSON.stringify({ autoScroll: { enabled: true, speed: 'warp' } }),
      'utf8',
    );

    const loaded = new SettingsStore(path).load();
    expect(loaded.autoScroll.enabled).toBe(true);
    expect(loaded.autoScroll.speed).toBe('medium');
  });

  it('update мержит патч, пишет файл и переживает перечитывание', () => {
    const path = settingsPath();
    const store = new SettingsStore(path);
    store.load();

    store.update({ fontSize: 25 });

    const onDisk = JSON.parse(readFileSync(path, 'utf8')) as { fontSize: number };
    expect(onDisk.fontSize).toBe(25);
    expect(new SettingsStore(path).load().fontSize).toBe(25);
  });

  it('update вложенного объекта не затирает соседние поля', () => {
    const store = new SettingsStore(settingsPath());
    store.update({ autoScroll: { enabled: true, speed: 'slow' }, opacity: 0.3 });

    store.update({ autoScroll: { enabled: true, speed: 'fast' } });

    const loaded = store.load();
    expect(loaded.autoScroll).toEqual({ enabled: true, speed: 'fast' });
    expect(loaded.opacity).toBe(0.3);
  });

  it('сохраняет список недавних файлов', () => {
    const path = settingsPath();
    const store = new SettingsStore(path);
    store.update({ recentFiles: ['C:/a.md', 'C:/b.md'] });

    expect(new SettingsStore(path).load().recentFiles).toEqual(['C:/a.md', 'C:/b.md']);
  });

  it('фильтрует не-строки из списка недавних в файле', () => {
    const path = settingsPath();
    writeFileSync(path, JSON.stringify({ recentFiles: ['C:/a.md', 42, null] }), 'utf8');

    expect(new SettingsStore(path).load().recentFiles).toEqual(['C:/a.md']);
  });

  it('сохраняет и возвращает флаг поверха всех окон', () => {
    const path = settingsPath();
    const store = new SettingsStore(path);
    store.update({ alwaysOnTop: false });

    expect(new SettingsStore(path).load().alwaysOnTop).toBe(false);
  });

  it('дефолт alwaysOnTop — true', () => {
    expect(DEFAULT_SETTINGS.alwaysOnTop).toBe(true);
  });
});
