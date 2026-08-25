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

/** Состояние приложения, транслируемое в renderer при любом изменении. */
export interface BroadcastState {
  fileName: string | null;
  autoScrollEnabled: boolean;
  autoScrollSpeed: AutoScrollSpeed;
  fontSize: number;
  opacity: number;
  clickThrough: boolean;
}

/** API, которое preload выставляет в renderer через contextBridge. */
export interface PrompterApi {
  onFileOpened(handler: (payload: FilePayload) => void): () => void;
  onFileChanged(handler: (payload: ContentPayload) => void): () => void;
  onFileRemoved(handler: () => void): () => void;
  onStateChanged(handler: (state: BroadcastState) => void): () => void;
  openFile(path: string): void;
  setFontSize(size: number): void;
  hideWindow(): void;
  quit(): void;
  /** Путь файла из drag&drop: в современном Electron только так. */
  filePathFor(file: File): string;
}
