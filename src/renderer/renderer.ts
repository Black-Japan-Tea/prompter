import './styles.css';
import { MarkdownRenderer } from './markdown/MarkdownRenderer';
import { Viewer } from './viewer';
import { Header } from './header';
import { AutoScroller } from './autoscroll';
import { initDragAndDrop } from './dnd';

const viewer = new Viewer(document, new MarkdownRenderer());
const scroller = new AutoScroller(window);
const header = new Header(document, {
  onHide: () => window.prompter.hideWindow(),
  onQuit: () => window.prompter.quit(),
});

initDragAndDrop(document, (path) => window.prompter.openFile(path));

window.prompter.onFileOpened(({ path, content }) => {
  viewer.show(content);
  header.setFileName(fileName(path));
  updateProgress();
});

window.prompter.onFileChanged(({ content }) => {
  viewer.update(content);
});

window.prompter.onFileRemoved(() => {
  viewer.clear();
  header.setFileName(null);
});

window.prompter.onStateChanged((state) => {
  document.documentElement.style.setProperty('--font-size', `${state.fontSize}px`);
  scroller.setEnabled(state.autoScrollEnabled);
  scroller.setSpeed(state.autoScrollSpeed);
  header.update(state);
});

// Прогресс чтения: бейдж в шапке + рейка автопрокрутки у правого края.
const viewerEl = requireElement('viewer');
const rail = requireElement('rail');
const railFill = requireElement('rail-fill');
viewerEl.addEventListener('scroll', updateProgress);
updateProgress();

function updateProgress(): void {
  const scrollable = viewerEl.scrollHeight - viewerEl.clientHeight;
  const ratio = scrollable <= 0 ? 1 : viewerEl.scrollTop / scrollable;
  header.setProgress(ratio);
  rail.hidden = false;
  railFill.style.height = `${Math.round(Math.min(1, Math.max(0, ratio)) * 100)}%`;
}

// Ctrl+колесо — кегль текста (12..28px), сохраняется в настройках.
window.addEventListener(
  'wheel',
  (event) => {
    if (!event.ctrlKey) {
      return;
    }
    event.preventDefault();
    const current = Number(
      getComputedStyle(document.documentElement)
        .getPropertyValue('--font-size')
        .replace('px', '')
        .trim(),
    ) || 17;
    const next = Math.min(28, Math.max(12, current + (event.deltaY < 0 ? 1 : -1)));
    window.prompter.setFontSize(next);
  },
  { passive: false },
);

function fileName(path: string): string {
  const parts = path.split(/[\\/]/);
  return parts[parts.length - 1] || path;
}

function requireElement(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (el === null) {
    throw new Error(`Не найден обязательный элемент #${id}`);
  }
  return el;
}
