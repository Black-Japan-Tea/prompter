import './styles.css';
import { MarkdownRenderer } from './markdown/MarkdownRenderer';
import { Viewer } from './viewer';
import { Header } from './header';
import { AutoScroller } from './autoscroll';
import { initDragAndDrop } from './dnd';
import { MenuView } from './menu/menu';
import { ToastCenter } from './toast';
import { initKeyboard } from './keyboard';
import { BroadcastState } from '../shared/contracts';

const viewerEl = requireElement('viewer');
const viewer = new Viewer(document, new MarkdownRenderer());
const scroller = new AutoScroller(viewerEl, window);
// Обе кнопки шапки (– и ✕) прячут окно: приложение живёт в трее.
const header = new Header(document, {
  onHide: () => window.prompter.runCommand({ type: 'hide-window' }),
  onQuit: () => window.prompter.runCommand({ type: 'hide-window' }),
});
const menu = new MenuView(requireElement('menu'), requireElement('btn-menu'), (command) => {
  window.prompter.runCommand(command);
});
const toasts = new ToastCenter(requireElement('toasts'));

initDragAndDrop(document, (path) => window.prompter.openFile(path));
initKeyboard({
  isMenuOpen: () => menu.isOpen,
  openMenu: () => menu.open(),
  closeMenu: () => menu.close(),
  openFile: () => window.prompter.runCommand({ type: 'open-file' }),
  quit: () => window.prompter.runCommand({ type: 'quit' }),
  changeFontSize: (delta) => changeFontSize(delta),
});

let previousState: BroadcastState | null = null;

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

window.prompter.onNotify(({ level, message }) => {
  toasts.show(message, level);
});

// Первичная синхронизация состояния: просим после всех подписок.
window.prompter.requestState();

window.prompter.onStateChanged((state) => {
  document.documentElement.style.setProperty('--font-size', `${state.fontSize}px`);
  scroller.setEnabled(state.autoScrollEnabled);
  scroller.setSpeed(state.autoScrollSpeed);
  header.update(state);
  menu.update(state);
  announceChanges(state);
  previousState = state;
});

// Единая фиолетовая конструкция у правого края: полоска-позиция «насколько
// прокрутил» видна всегда; при наведении в зоне проявляется трек и работает
// перетаскивание (нативный скроллбар скрыт полностью).
const rail = requireElement('rail');
const railThumb = requireElement('rail-thumb');
const railHit = requireElement('rail-hit');
viewerEl.addEventListener('scroll', updateProgress);
initRailScrub(viewerEl, rail, railThumb, railHit);
updateProgress();

// Ctrl+колесо — кегль текста, сохраняется в настройках.
window.addEventListener(
  'wheel',
  (event) => {
    if (!event.ctrlKey) {
      return;
    }
    event.preventDefault();
    changeFontSize(event.deltaY < 0 ? 1 : -1);
  },
  { passive: false },
);

function changeFontSize(delta: 1 | -1): void {
  const current = currentFontSize();
  window.prompter.setFontSize(current + delta);
}

function currentFontSize(): number {
  return (
    Number(
      getComputedStyle(document.documentElement)
        .getPropertyValue('--font-size')
        .replace('px', '')
        .trim(),
    ) || 17
  );
}

function updateProgress(): void {
  const scrollable = viewerEl.scrollHeight - viewerEl.clientHeight;
  const ratio = scrollable <= 0 ? 1 : Math.min(1, Math.max(0, viewerEl.scrollTop / scrollable));
  header.setProgress(ratio);
  rail.hidden = false;

  // Тумб: размер = доля видимой части документа, позиция = прогресс чтения.
  const railHeight = rail.clientHeight;
  const thumbHeight = Math.max(
    24,
    Math.round((viewerEl.clientHeight / viewerEl.scrollHeight) * railHeight),
  );
  railThumb.style.height = `${thumbHeight}px`;
  railThumb.style.top = `${Math.round(ratio * (railHeight - thumbHeight))}px`;
}

/** Перетаскивание/клик по зоне рейки скроллит документ (замена тумба). */
function initRailScrub(
  viewer: HTMLElement,
  railEl: HTMLElement,
  thumb: HTMLElement,
  hit: HTMLElement,
): void {
  let dragging = false;

  const scrollToPointer = (clientY: number): void => {
    const rect = railEl.getBoundingClientRect();
    const thumbHeight = thumb.offsetHeight || 24;
    const usable = rect.height - thumbHeight;
    if (usable <= 0) {
      return;
    }
    const position = Math.min(
      1,
      Math.max(0, (clientY - rect.top - thumbHeight / 2) / usable),
    );
    viewer.scrollTop = position * (viewer.scrollHeight - viewer.clientHeight);
  };

  hit.addEventListener('pointerdown', (event) => {
    dragging = true;
    hit.setPointerCapture(event.pointerId);
    scrollToPointer(event.clientY);
  });
  hit.addEventListener('pointermove', (event) => {
    if (dragging) {
      scrollToPointer(event.clientY);
    }
  });
  const release = (): void => {
    dragging = false;
  };
  hit.addEventListener('pointerup', release);
  hit.addEventListener('pointercancel', release);

  // Проявление скроллбара при наведении в зоне.
  hit.addEventListener('mouseenter', () => railEl.classList.add('hit-active'));
  hit.addEventListener('mouseleave', () => railEl.classList.remove('hit-active'));
}

const SPEED_TOAST: Record<string, string> = {
  slow: 'медленно',
  medium: 'средне',
  fast: 'быстро',
};

/** Обратная связь: каждое изменение настройки озвучивается тостом. */
function announceChanges(state: BroadcastState): void {
  const previous = previousState;
  if (previous === null) {
    return;
  }
  if (state.opacity !== previous.opacity) {
    // Шкала прозрачности: 0% — непрозрачно, максимум 95% — почти невидимо.
    const transparency = Math.round((1 - state.opacity) * 100);
    toasts.show(
      transparency >= 95
        ? 'Прозрачность 95% — почти невидимо'
        : `Прозрачность ${transparency}%`,
    );
  }
  if (state.autoScrollEnabled !== previous.autoScrollEnabled) {
    toasts.show(
      state.autoScrollEnabled
        ? `Автопрокрутка: вкл · ${SPEED_TOAST[state.autoScrollSpeed]}`
        : 'Автопрокрутка: выкл',
    );
  } else if (state.autoScrollSpeed !== previous.autoScrollSpeed) {
    toasts.show(`Скорость: ${SPEED_TOAST[state.autoScrollSpeed]}`);
  }
  if (state.clickThrough !== previous.clickThrough) {
    toasts.show(
      state.clickThrough
        ? 'Клик-сквозь: вкл — окно не ловит мышь (Ctrl+Alt+T выключит)'
        : 'Клик-сквозь: выкл',
    );
  }
  if (state.captureProtection !== previous.captureProtection) {
    // Предупреждение дублируем тостом: выключенная защита — риск засветить конспект.
    toasts.show(
      state.captureProtection
        ? 'Окно снова невидимо в трансляции'
        : 'ВНИМАНИЕ: окно видно в трансляции экрана',
      state.captureProtection ? 'info' : 'error',
    );
  }
  if (state.alwaysOnTop !== previous.alwaysOnTop) {
    toasts.show(state.alwaysOnTop ? 'Поверх всех окон: вкл' : 'Поверх всех окон: выкл');
  }
  if (state.fontSize !== previous.fontSize) {
    toasts.show(`Размер шрифта: ${state.fontSize}px`);
  }
}

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
