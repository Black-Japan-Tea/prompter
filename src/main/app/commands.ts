import { AppCommand, AppCommandType, COMMAND_TYPES } from '../../shared/contracts';
import { AutoScrollSpeed } from '../../shared/settings';

const SPEEDS: readonly AutoScrollSpeed[] = ['slow', 'medium', 'fast'];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * Строгий разбор команды из IPC: renderer — недоверенная сторона,
 * мусор на входе игнорируется, а не роняет main-процесс.
 */
export function parseCommandPayload(raw: unknown): AppCommand | null {
  if (!isRecord(raw) || typeof raw.type !== 'string') {
    return null;
  }
  if (!(COMMAND_TYPES as readonly string[]).includes(raw.type)) {
    return null;
  }
  const type = raw.type as AppCommandType;

  if (type === 'autoscroll-speed') {
    if (!isSpeed(raw.speed)) {
      return null;
    }
    return { type, speed: raw.speed };
  }
  if (type === 'open-recent') {
    if (typeof raw.path !== 'string' || raw.path.length === 0) {
      return null;
    }
    return { type, path: raw.path };
  }
  return { type };
}

function isSpeed(value: unknown): value is AutoScrollSpeed {
  return typeof value === 'string' && (SPEEDS as readonly string[]).includes(value);
}

/** Методы приложения, необходимые командам (реализуются PrompterApp). */
export interface AppCommandTarget {
  toggleWindow(): void;
  showWindow(): void;
  hideWindow(): void;
  openViaDialog(): void;
  openFile(path: string): void;
  repeatLastFile(): void;
  opacityUp(): void;
  opacityDown(): void;
  toggleAutoScroll(): void;
  setAutoScrollSpeed(speed: AutoScrollSpeed): void;
  toggleClickThrough(): void;
  toggleAlwaysOnTop(): void;
  toggleCaptureProtection(): void;
  quit(): void;
}

/** Исполняет валидную команду через публичные методы приложения. */
export function executeCommand(app: AppCommandTarget, command: AppCommand): void {
  switch (command.type) {
    case 'toggle-window':
      return app.toggleWindow();
    case 'show-window':
      return app.showWindow();
    case 'hide-window':
      return app.hideWindow();
    case 'open-file':
      return app.openViaDialog();
    case 'open-recent':
      return app.openFile(command.path);
    case 'repeat-last-file':
      return app.repeatLastFile();
    case 'opacity-up':
      return app.opacityUp();
    case 'opacity-down':
      return app.opacityDown();
    case 'autoscroll-toggle':
      return app.toggleAutoScroll();
    case 'autoscroll-speed':
      return app.setAutoScrollSpeed(command.speed);
    case 'clickthrough-toggle':
      return app.toggleClickThrough();
    case 'always-top-toggle':
      return app.toggleAlwaysOnTop();
    case 'capture-protection-toggle':
      return app.toggleCaptureProtection();
    case 'quit':
      return app.quit();
  }
}
