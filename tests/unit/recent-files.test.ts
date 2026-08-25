import { describe, it, expect } from 'vitest';
import { RecentFiles } from '../../src/main/files/RecentFiles';

describe('RecentFiles', () => {
  it('добавляет файл в список', () => {
    const recent = new RecentFiles();
    recent.add('C:/notes/a.md');
    expect(recent.list()).toEqual(['C:/notes/a.md']);
  });

  it('не дублирует повторно добавленный файл', () => {
    const recent = new RecentFiles();
    recent.add('C:/notes/a.md');
    recent.add('C:/notes/a.md');
    expect(recent.list()).toEqual(['C:/notes/a.md']);
  });

  it('повторное добавление поднимает файл в начало', () => {
    const recent = new RecentFiles();
    recent.add('C:/a.md');
    recent.add('C:/b.md');
    recent.add('C:/c.md');
    recent.add('C:/a.md');
    expect(recent.list()).toEqual(['C:/a.md', 'C:/c.md', 'C:/b.md']);
  });

  it('ограничивает список десятью самыми свежими', () => {
    const recent = new RecentFiles();
    for (let i = 1; i <= 12; i++) {
      recent.add(`C:/notes/file-${i}.md`);
    }
    expect(recent.list()).toHaveLength(10);
    expect(recent.list()[0]).toBe('C:/notes/file-12.md');
    expect(recent.list()).not.toContain('C:/notes/file-1.md');
  });

  it('remove убирает файл из списка', () => {
    const recent = new RecentFiles();
    recent.add('C:/a.md');
    recent.add('C:/b.md');
    recent.remove('C:/a.md');
    expect(recent.list()).toEqual(['C:/b.md']);
  });
});
