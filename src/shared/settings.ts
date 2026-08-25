/** Скорость автопрокрутки суфлёра. */
export type AutoScrollSpeed = 'slow' | 'medium' | 'fast';

export interface AutoScrollSettings {
  enabled: boolean;
  speed: AutoScrollSpeed;
}

/** Геометрия окна, которую восстанавливаем между запусками. */
export interface WindowBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Все настройки приложения, у каждой есть дефолт. */
export interface AppSettings {
  opacity: number;
  fontSize: number;
  lastFile: string | null;
  windowBounds: WindowBounds | null;
  autoScroll: AutoScrollSettings;
  clickThrough: boolean;
  alwaysOnTop: boolean;
  captureProtection: boolean;
  recentFiles: string[];
}

export const DEFAULT_SETTINGS: AppSettings = {
  opacity: 0.85,
  fontSize: 17,
  lastFile: null,
  windowBounds: null,
  autoScroll: { enabled: false, speed: 'medium' },
  clickThrough: false,
  alwaysOnTop: true,
  captureProtection: true,
  recentFiles: [],
};
