/**
 * Хоткеи внутри окна (глобальные живут в main и перехватываются ОС):
 * F10 — меню, Esc — скрыть окно, Ctrl+O — открыть, Ctrl+Q — выход,
 * Ctrl+= / Ctrl+- — размер шрифта.
 */
export interface KeyboardDependencies {
  isMenuOpen(): boolean;
  openMenu(): void;
  closeMenu(): void;
  hideWindow(): void;
  openFile(): void;
  quit(): void;
  changeFontSize(delta: 1 | -1): void;
}

export function initKeyboard(deps: KeyboardDependencies): void {
  window.addEventListener('keydown', (event) => {
    const mod = event.ctrlKey && !event.altKey && !event.shiftKey;

    if (event.key === 'F10') {
      event.preventDefault();
      if (deps.isMenuOpen()) {
        deps.closeMenu();
      } else {
        deps.openMenu();
      }
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      if (deps.isMenuOpen()) {
        deps.closeMenu();
      } else {
        deps.hideWindow();
      }
      return;
    }
    if (mod && (event.key === 'o' || event.key === 'O' || event.key === 'щ')) {
      event.preventDefault();
      deps.openFile();
      return;
    }
    if (mod && (event.key === 'q' || event.key === 'Q' || event.key === 'й')) {
      event.preventDefault();
      deps.quit();
      return;
    }
    if (mod && (event.key === '=' || event.key === '+')) {
      event.preventDefault();
      deps.changeFontSize(1);
      return;
    }
    if (mod && (event.key === '-' || event.key === '_')) {
      event.preventDefault();
      deps.changeFontSize(-1);
    }
  });
}
