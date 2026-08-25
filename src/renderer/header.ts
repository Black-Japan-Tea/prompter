import { BroadcastState } from '../shared/contracts';

/** Шапка: имя файла, бейджи состояния, прогресс чтения, кнопки. */
export class Header {
  private readonly fileName: HTMLElement;
  private readonly progress: HTMLElement;
  private readonly opacity: HTMLElement;
  private readonly autoscroll: HTMLElement;
  private readonly hideButton: HTMLElement;
  private readonly quitButton: HTMLElement;

  constructor(doc: Document, actions: { onHide(): void; onQuit(): void }) {
    this.fileName = requireElement(doc, 'file-name');
    this.progress = requireElement(doc, 'badge-progress');
    this.opacity = requireElement(doc, 'badge-opacity');
    this.autoscroll = requireElement(doc, 'badge-autoscroll');
    this.hideButton = requireElement(doc, 'btn-hide');
    this.quitButton = requireElement(doc, 'btn-quit');
    this.hideButton.addEventListener('click', actions.onHide);
    this.quitButton.addEventListener('click', actions.onQuit);
  }

  setFileName(name: string | null): void {
    this.fileName.textContent = name ?? 'Файл не выбран';
  }

  setProgress(ratio: number): void {
    const clamped = Math.min(1, Math.max(0, ratio));
    const percent = Math.round(clamped * 100);
    this.progress.textContent = `${percent}%`;
    this.progress.hidden = clamped >= 0.999;
  }

  update(state: BroadcastState): void {
    // Шкала пользователя: 0% — непрозрачно, 95% — почти прозрачное окно.
    const transparency = Math.round((1 - state.opacity) * 100);
    this.opacity.textContent = `◐ ${transparency}%`;
    this.opacity.hidden = false;
    this.autoscroll.hidden = !state.autoScrollEnabled;
    document.body.classList.toggle('autoscroll-on', state.autoScrollEnabled);
  }
}

function requireElement(doc: Document, id: string): HTMLElement {
  const el = doc.getElementById(id);
  if (el === null) {
    throw new Error(`Не найден обязательный элемент #${id}`);
  }
  return el;
}
