import MarkdownIt from 'markdown-it';
import taskLists from 'markdown-it-task-lists';
import DOMPurify from 'dompurify';

// Хук на уровне модуля (один раз): все ссылки после санитизации
// открываются в новом окне и без доступа к нашему окну.
DOMPurify.addHook('afterSanitizeAttributes', (currentNode) => {
  const node = currentNode as Element;
  if (node.tagName === 'A' && node.getAttribute('href') !== null) {
    node.setAttribute('target', '_blank');
    node.setAttribute('rel', 'noopener noreferrer');
  }
});

/**
 * Рендер Markdown в безопасный HTML: markdown-it (включая GFM-таблицы,
 * зачёркивание и чекбоксы) + обязательная санитизация DOMPurify.
 */
export class MarkdownRenderer {
  // Тип выводим из конструктора: у markdown-it v14 конструктор не является типом.
  private readonly md = new MarkdownIt({
    html: true,
    linkify: true,
    typographer: false,
  }).use(taskLists, { enabled: false, label: true });

  render(markdown: string): string {
    const rawHtml = this.md.render(markdown);
    return DOMPurify.sanitize(rawHtml, { ADD_ATTR: ['target'] });
  }
}
