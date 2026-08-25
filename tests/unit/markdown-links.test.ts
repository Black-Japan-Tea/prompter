import { describe, it, expect } from 'vitest';
import { resolveMarkdownLink } from '../../src/shared/markdownLinks';

describe('resolveMarkdownLink', () => {
  const current = 'C:\\docs\\notes\\call.md';

  it('резолвит относительную ссылку от каталога текущего файла', () => {
    expect(resolveMarkdownLink('guide.md', current)).toBe('C:\\docs\\notes\\guide.md');
  });

  it('поддерживает вложенные каталоги и выход вверх', () => {
    expect(resolveMarkdownLink('sub/plan.md', current)).toBe('C:\\docs\\notes\\sub\\plan.md');
    expect(resolveMarkdownLink('../top.md', current)).toBe('C:\\docs\\top.md');
  });

  it('принимает URL-подобные слэши в относительных путях', () => {
    expect(resolveMarkdownLink('sub\\win.md', current)).toBe('C:\\docs\\notes\\sub\\win.md');
  });

  it('оставляет абсолютный windows-путь как есть (нормализованным)', () => {
    expect(resolveMarkdownLink('D:\\library\\big.MD', current)).toBe('D:\\library\\big.MD');
  });

  it('регистр расширения не важен, .markdown тоже markdown', () => {
    expect(resolveMarkdownLink('Note.MD', current)).toBe('C:\\docs\\notes\\Note.MD');
    expect(resolveMarkdownLink('book.markdown', current)).toBe('C:\\docs\\notes\\book.markdown');
  });

  it('внешние протоколы и не-markdown — не наша забота (null)', () => {
    expect(resolveMarkdownLink('https://example.com/a.md', current)).toBeNull();
    expect(resolveMarkdownLink('http://example.com', current)).toBeNull();
    expect(resolveMarkdownLink('mailto:a@b.c', current)).toBeNull();
    expect(resolveMarkdownLink('file:///C:/x.md', current)).toBeNull();
    expect(resolveMarkdownLink('photo.png', current)).toBeNull();
    expect(resolveMarkdownLink('notes.txt', current)).toBeNull();
  });

  it('якорь и пустая ссылка игнорируются', () => {
    expect(resolveMarkdownLink('#section', current)).toBeNull();
    expect(resolveMarkdownLink('', current)).toBeNull();
  });

  it('без текущего файла относительные ссылки не резолвятся', () => {
    expect(resolveMarkdownLink('guide.md', null)).toBeNull();
    expect(resolveMarkdownLink('D:\\a\\b.md', null)).toBe('D:\\a\\b.md');
  });
});
