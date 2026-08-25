// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { MarkdownRenderer } from '../../src/renderer/markdown/MarkdownRenderer';

describe('MarkdownRenderer — базовый рендер', () => {
  it('рендерит заголовки, списки и выделение', () => {
    const html = new MarkdownRenderer().render('# Тема\n\n**жирный** и *курсив*');
    expect(html).toContain('<h1>Тема</h1>');
    expect(html).toContain('<strong>жирный</strong>');
    expect(html).toContain('<em>курсив</em>');
  });

  it('рендерит таблицы GFM', () => {
    const html = new MarkdownRenderer().render(
      '| a | b |\n| --- | --- |\n| 1 | 2 |',
    );
    expect(html).toContain('<table>');
    expect(html).toContain('<td>1</td>');
  });

  it('рендерит чекбоксы списков задач', () => {
    const html = new MarkdownRenderer().render('- [x] сделано\n- [ ] план');
    expect(html).toContain('type="checkbox"');
    expect(html).toContain('checked');
  });

  it('рендерит код-блоки', () => {
    const html = new MarkdownRenderer().render('```\nconst a = 1;\n```');
    expect(html).toContain('<pre><code>');
  });
});

describe('MarkdownRenderer — санитизация', () => {
  it('вырезает script вместе с содержимым', () => {
    const html = new MarkdownRenderer().render(
      '# Заголовок\n\n<script>alert("взлом")</script>\n\nтекст',
    );
    expect(html).toContain('<h1>Заголовок</h1>');
    expect(html).not.toContain('script');
    expect(html).not.toContain('alert');
  });

  it('вырезает iframe', () => {
    const html = new MarkdownRenderer().render(
      '<iframe src="https://evil.example"></iframe>',
    );
    expect(html).not.toContain('iframe');
  });

  it('вырезает обработчики событий в атрибутах', () => {
    const html = new MarkdownRenderer().render(
      '<img src="x.png" onerror="alert(1)">',
    );
    expect(html).not.toContain('onerror');
  });

  it('вырезает javascript:-ссылки', () => {
    const html = new MarkdownRenderer().render('[клик](javascript:alert(1))');
    expect(html).not.toContain('javascript:');
  });

  it('сохраняет безопасные inline-теги', () => {
    const html = new MarkdownRenderer().render(
      '<b>жирный</b> и <em>курсив</em> и <code>code</code>',
    );
    expect(html).toContain('<b>жирный</b>');
    expect(html).toContain('<em>курсив</em>');
    expect(html).toContain('<code>code</code>');
  });
});

describe('MarkdownRenderer — ссылки', () => {
  it('открывает внешние ссылки в новом окне безопасно', () => {
    const html = new MarkdownRenderer().render('[сайт](https://example.com)');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
  });
});
