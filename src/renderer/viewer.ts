import { MarkdownRenderer } from './markdown/MarkdownRenderer';

/** Управляет областью контента: markdown → безопасный HTML, пустое состояние. */
export class Viewer {
  private readonly content: HTMLElement;
  private readonly app: HTMLElement;

  constructor(
    doc: Document,
    private readonly renderer: MarkdownRenderer,
  ) {
    this.content = requireElement(doc, 'content');
    this.app = requireElement(doc, 'app');
  }

  show(markdown: string): void {
    this.content.innerHTML = this.renderer.render(markdown);
    this.app.classList.add('has-file');
  }

  /** Живое обновление при правке файла: сохраняем позицию чтения. */
  update(markdown: string): void {
    this.show(markdown);
  }

  clear(): void {
    this.content.innerHTML = '';
    this.app.classList.remove('has-file');
  }
}

function requireElement(doc: Document, id: string): HTMLElement {
  const el = doc.getElementById(id);
  if (el === null) {
    throw new Error(`Не найден обязательный элемент #${id}`);
  }
  return el;
}
