import { AutoScrollSpeed } from './settings';

/** Единые имена IPC-каналов: main и preload обязаны говорить одинаково. */
export const IPC = {
  fileOpened: 'prompter:file-opened',
  fileChanged: 'prompter:file-changed',
  fileRemoved: 'prompter:file-removed',
  stateChanged: 'prompter:state-changed',
  openFileRequest: 'prompter:open-file-request',
  fontSizeRequest: 'prompter:font-size-request',
  hideWindowRequest: 'prompter:hide-window-request',
  quitRequest: 'prompter:quit-request',
  command: 'prompter:command',
  notify: 'prompter:notify',
  requestState: 'prompter:request-state',
} as const;

/** Полное содержимое файла при открытии. */
export interface FilePayload {
  path: string;
  content: string;
}

/** Обновлённое содержимое при живой правке файла. */
export interface ContentPayload {
  content: string;
}

/** Команды приложения: единый вход для меню окна, трея и хоткеев. */
export type AppCommand =
  | { type: 'toggle-window' }
  | { type: 'show-window' }
  | { type: 'hide-window' }
  | { type: 'open-file' }
  | { type: 'open-recent'; path: string }
  | { type: 'repeat-last-file' }
  | { type: 'opacity-up' }
  | { type: 'opacity-down' }
  | { type: 'autoscroll-toggle' }
  | { type: 'autoscroll-speed'; speed: AutoScrollSpeed }
  | { type: 'clickthrough-toggle' }
  | { type: 'always-top-toggle' }
  | { type: 'capture-protection-toggle' }
  | { type: 'quit' };

export type AppCommandType = AppCommand['type'];

/** Все типы команд — для реестра и валидации. */
export const COMMAND_TYPES: readonly AppCommandType[] = [
  'toggle-window',
  'show-window',
  'hide-window',
  'open-file',
  'open-recent',
  'repeat-last-file',
  'opacity-up',
  'opacity-down',
  'autoscroll-toggle',
  'autoscroll-speed',
  'clickthrough-toggle',
  'always-top-toggle',
  'capture-protection-toggle',
  'quit',
];

/**
 * Команды с глобальными хоткеями. Показ/скрытие окна — только тогл
 * одной комбинацией; show/hide остаются для меню и internal-кода.
 */
export const HOTKEYED_COMMAND_TYPES: readonly AppCommandType[] = [
  'toggle-window',
  'open-file',
  'open-recent',
  'repeat-last-file',
  'opacity-up',
  'opacity-down',
  'autoscroll-toggle',
  'autoscroll-speed',
  'clickthrough-toggle',
  'always-top-toggle',
  'capture-protection-toggle',
  'quit',
];

/**
 * Глобальные акселераторы: у каждой хоткейной команды — комбинация.
 * In-window дополнения (Ctrl+O, Ctrl+Q, Ctrl+=/-, F10) живут в renderer.
 */
export const ACCELERATORS: Record<AppCommandType, string> = {
  'toggle-window': 'Control+Alt+P',
  'show-window': '',
  'hide-window': '',
  'open-file': 'Control+Alt+O',
  'open-recent': 'Control+Alt+R',
  'repeat-last-file': 'Control+Alt+Enter',
  'opacity-up': 'Control+Alt+=',
  'opacity-down': 'Control+Alt+-',
  'autoscroll-toggle': 'Control+Alt+Space',
  'autoscroll-speed': 'Control+Alt+1..3',
  'clickthrough-toggle': 'Control+Alt+T',
  'always-top-toggle': 'Control+Alt+A',
  'capture-protection-toggle': 'Control+Alt+V',
  quit: 'Control+Alt+Q',
};

/** Реальные первичные акселераторы выбора скорости (составная команда). */
export const SPEED_ACCELERATORS: Record<AutoScrollSpeed, string> = {
  slow: 'Control+Alt+1',
  medium: 'Control+Alt+2',
  fast: 'Control+Alt+3',
};

/** Фолбэки для скоростей: Alt+цифра часто занята системными переключателями. */
export const SPEED_ACCELERATOR_FALLBACKS: Record<AutoScrollSpeed, readonly string[]> = {
  slow: ['Control+Shift+Alt+1'],
  medium: ['Control+Shift+Alt+2'],
  fast: ['Control+Shift+Alt+3'],
};

/**
 * Фолбэки на случай, когда первичный хоткей занят другой программой
 * (Win32 RegisterHotKey отказывает индивидуально, состав зависит от машины).
 */
export const ACCELERATOR_FALLBACKS: Partial<Record<AppCommandType, readonly string[]>> = {
  'toggle-window': ['Alt+Shift+P', 'Control+Shift+P'],
  'open-file': ['Alt+Shift+O', 'Control+Shift+O'],
  'open-recent': ['Alt+Shift+R', 'Control+Shift+R'],
  'repeat-last-file': ['Alt+Shift+Enter'],
  'opacity-up': ['Control+Alt+Up', 'Control+Alt+0'],
  'opacity-down': ['Control+Alt+Down', 'Control+Alt+9'],
  'autoscroll-toggle': ['Alt+Shift+Space'],
  'clickthrough-toggle': ['Alt+Shift+T', 'Control+Shift+T'],
  'always-top-toggle': ['Alt+Shift+A', 'Control+Shift+A'],
  'capture-protection-toggle': ['Alt+Shift+V', 'Control+Shift+V'],
  quit: ['Alt+Shift+Q', 'Control+Shift+Q'],
};

/** Сообщения для тостов: ошибки и важные события из main. */
export interface NotifyPayload {
  level: 'info' | 'error';
  message: string;
}

/** Состояние приложения, транслируемое в renderer при любом изменении. */
export interface BroadcastState {
  fileName: string | null;
  autoScrollEnabled: boolean;
  autoScrollSpeed: AutoScrollSpeed;
  fontSize: number;
  opacity: number;
  clickThrough: boolean;
  alwaysOnTop: boolean;
  captureProtection: boolean;
  recentFiles: readonly string[];
  /** Активные хоткеи с учётом фолбэков: «что реально работает сейчас». */
  accelerators: Partial<Record<AppCommandType, string>>;
  /** Активные хоткеи скоростей (могли уехать на фолбэки). */
  speedAccelerators: Record<AutoScrollSpeed, string>;
}

/** API, которое preload выставляет в renderer через contextBridge. */
export interface PrompterApi {
  onFileOpened(handler: (payload: FilePayload) => void): () => void;
  onFileChanged(handler: (payload: ContentPayload) => void): () => void;
  onFileRemoved(handler: () => void): () => void;
  onStateChanged(handler: (state: BroadcastState) => void): () => void;
  onNotify(handler: (payload: NotifyPayload) => void): () => void;
  openFile(path: string): void;
  setFontSize(size: number): void;
  runCommand(command: AppCommand): void;
  hideWindow(): void;
  quit(): void;
  /** Первоначальный запрос состояния после подписок renderer. */
  requestState(): void;
  /** Путь файла из drag&drop: в современном Electron только так. */
  filePathFor(file: File): string;
}
