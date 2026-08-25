import { ipcMain } from 'electron';
import { IPC, AppCommand } from '../../shared/contracts';
import { parseCommandPayload } from './commands';

/** Чистые колбэки, которые мост вызывает после валидации входа. */
export interface IpcHandlers {
  executeCommand(command: AppCommand): void;
  openFile(path: string): void;
  setFontSize(size: number): void;
  hideWindow(): void;
  quit(): void;
  requestState(): void;
}

export const FONT_MIN = 12;
export const FONT_MAX = 28;

/**
 * Регистрирует IPC-каналы и валидирует всё недоверенное из renderer:
 * мусорные payload отбрасываются до бизнес-логики.
 */
export function registerAppIpc(handlers: IpcHandlers): void {
  ipcMain.on(IPC.command, (_event, raw: unknown) => {
    const command = parseCommandPayload(raw);
    if (command !== null) {
      handlers.executeCommand(command);
    }
  });

  ipcMain.on(IPC.openFileRequest, (_event, raw: unknown) => {
    if (typeof raw === 'string' && raw.length > 0) {
      handlers.openFile(raw);
    }
  });

  ipcMain.on(IPC.fontSizeRequest, (_event, raw: unknown) => {
    if (typeof raw === 'number' && Number.isFinite(raw)) {
      handlers.setFontSize(clampFontSize(raw));
    }
  });

  ipcMain.on(IPC.hideWindowRequest, () => handlers.hideWindow());
  ipcMain.on(IPC.quitRequest, () => handlers.quit());
  // Первичная синхронизация: renderer подписался и просит состояние.
  ipcMain.on(IPC.requestState, () => handlers.requestState());
}

export function clampFontSize(size: number): number {
  return Math.min(FONT_MAX, Math.max(FONT_MIN, Math.round(size)));
}
