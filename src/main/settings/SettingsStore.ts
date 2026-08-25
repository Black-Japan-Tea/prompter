import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import {
  AppSettings,
  AutoScrollSpeed,
  DEFAULT_SETTINGS,
} from '../../shared/settings';

const SPEEDS: readonly AutoScrollSpeed[] = ['slow', 'medium', 'fast'];

/**
 * Хранилище настроек в JSON-файле.
 * Файл может быть битым или частичным (правили руками) — тогда выживают
 * только поля с корректными типами, остальное берётся из дефолтов.
 */
export class SettingsStore {
  private settings: AppSettings = { ...DEFAULT_SETTINGS };

  constructor(private readonly filePath: string) {}

  load(): AppSettings {
    if (!existsSync(this.filePath)) {
      this.settings = { ...DEFAULT_SETTINGS };
      return this.settings;
    }
    this.settings = this.parse(readFileSync(this.filePath, 'utf8'));
    return this.settings;
  }

  update(patch: Partial<AppSettings>): AppSettings {
    this.settings = this.merge(this.settings, patch);
    this.writeToDisk();
    return this.settings;
  }

  private parse(raw: string): AppSettings {
    let candidate: unknown;
    try {
      candidate = JSON.parse(raw);
    } catch {
      return { ...DEFAULT_SETTINGS };
    }
    if (!isRecord(candidate)) {
      return { ...DEFAULT_SETTINGS };
    }
    return this.merge({ ...DEFAULT_SETTINGS }, candidate);
  }

  private merge(base: AppSettings, patch: Partial<AppSettings>): AppSettings {
    const next: AppSettings = { ...base };
    if (isNumber(patch.opacity)) {
      next.opacity = patch.opacity;
    }
    if (isNumber(patch.fontSize)) {
      next.fontSize = patch.fontSize;
    }
    if (typeof patch.lastFile === 'string' || patch.lastFile === null) {
      next.lastFile = patch.lastFile;
    }
    const bounds = patch.windowBounds;
    if (isWindowBounds(bounds)) {
      next.windowBounds = { ...bounds };
    }
    if (patch.autoScroll !== undefined) {
      const auto = patch.autoScroll;
      const merged = { ...base.autoScroll };
      if (typeof auto.enabled === 'boolean') {
        merged.enabled = auto.enabled;
      }
      if (isSpeed(auto.speed)) {
        merged.speed = auto.speed;
      }
      next.autoScroll = merged;
    }
    if (typeof patch.clickThrough === 'boolean') {
      next.clickThrough = patch.clickThrough;
    }
    if (Array.isArray(patch.recentFiles)) {
      next.recentFiles = patch.recentFiles.filter((item): item is string => typeof item === 'string');
    }
    return next;
  }

  // Атомарная запись: сначала во временный файл рядом с целевым, потом rename.
  private writeToDisk(): void {
    const tempPath = `${this.filePath}.tmp`;
    writeFileSync(tempPath, JSON.stringify(this.settings, null, 2), 'utf8');
    renameSync(tempPath, this.filePath);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isSpeed(value: unknown): value is AutoScrollSpeed {
  return typeof value === 'string' && (SPEEDS as readonly string[]).includes(value);
}

function isWindowBounds(
  value: unknown,
): value is NonNullable<AppSettings['windowBounds']> {
  if (!isRecord(value)) {
    return false;
  }
  return (
    isNumber(value.x) &&
    isNumber(value.y) &&
    isNumber(value.width) &&
    isNumber(value.height)
  );
}
