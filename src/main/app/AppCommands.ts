import {
  ACCELERATORS,
  SPEED_ACCELERATORS,
  AppCommandType,
} from '../../shared/contracts';
import { AutoScrollSpeed } from '../../shared/settings';
import { AppCommandTarget } from './commands';

/**
 * Выбирает первый свободный акселератор из первичного и фолбэков.
 * «Занято» — и другими программами (isFree от globalShortcut.register),
 * и нами же в этой сессии (taken). Возвращает null, если все варианты заняты.
 */
export function chooseAccelerator(
  primary: string,
  fallbacks: readonly string[],
  isFree: (accelerator: string) => boolean,
  taken: ReadonlySet<string>,
): string | null {
  for (const accelerator of [primary, ...fallbacks]) {
    if (!taken.has(accelerator) && isFree(accelerator)) {
      return accelerator;
    }
  }
  return null;
}

/** Карта «акселератор → действие»: единый источник для регистрации. */
export function buildGlobalBindings(app: AppCommandTarget): Record<string, () => void> {
  const bindings: Record<string, () => void> = {
    [ACCELERATORS['toggle-window']]: () => app.toggleWindow(),
    [ACCELERATORS['show-window']]: () => app.showWindow(),
    [ACCELERATORS['hide-window']]: () => app.hideWindow(),
    [ACCELERATORS['open-file']]: () => void app.openViaDialog(),
    [ACCELERATORS['open-recent']]: () => app.repeatLastFile(),
    [ACCELERATORS['repeat-last-file']]: () => app.repeatLastFile(),
    [ACCELERATORS['opacity-up']]: () => app.opacityUp(),
    [ACCELERATORS['opacity-down']]: () => app.opacityDown(),
    [ACCELERATORS['autoscroll-toggle']]: () => app.toggleAutoScroll(),
    [ACCELERATORS['clickthrough-toggle']]: () => app.toggleClickThrough(),
    [ACCELERATORS['always-top-toggle']]: () => app.toggleAlwaysOnTop(),
    [ACCELERATORS['quit']]: () => app.quit(),
  };
  for (const speed of Object.keys(SPEED_ACCELERATORS) as AutoScrollSpeed[]) {
    bindings[SPEED_ACCELERATORS[speed]] = () => app.setAutoScrollSpeed(speed);
  }
  return bindings;
}

/** Действия меню трея поверх AppCommandTarget + геттеры состояний для чекбоксов. */
export interface TrayStateSource {
  autoScrollEnabled(): boolean;
  autoScrollSpeed(): AutoScrollSpeed;
  clickThroughEnabled(): boolean;
  alwaysTopEnabled(): boolean;
  recentFiles(): readonly string[];
  accelerators(): Partial<Record<AppCommandType, string>>;
}

export function trayActionsFrom(
  app: AppCommandTarget,
  state: TrayStateSource,
): {
  toggleWindow(): void;
  openFile(): void;
  openRecent(path: string): void;
  recentFiles(): readonly string[];
  opacityStepUp(): void;
  opacityStepDown(): void;
  autoScrollEnabled(): boolean;
  toggleAutoScroll(): void;
  autoScrollSpeed(): AutoScrollSpeed;
  setAutoScrollSpeed(speed: AutoScrollSpeed): void;
  clickThroughEnabled(): boolean;
  toggleClickThrough(): void;
  alwaysTopEnabled(): boolean;
  toggleAlwaysTop(): void;
  accelerators(): Partial<Record<AppCommandType, string>>;
  quit(): void;
} {
  return {
    toggleWindow: () => app.toggleWindow(),
    openFile: () => void app.openViaDialog(),
    openRecent: (path: string) => app.openFile(path),
    recentFiles: () => state.recentFiles(),
    opacityStepUp: () => app.opacityUp(),
    opacityStepDown: () => app.opacityDown(),
    autoScrollEnabled: () => state.autoScrollEnabled(),
    toggleAutoScroll: () => app.toggleAutoScroll(),
    autoScrollSpeed: () => state.autoScrollSpeed(),
    setAutoScrollSpeed: (speed: AutoScrollSpeed) => app.setAutoScrollSpeed(speed),
    clickThroughEnabled: () => state.clickThroughEnabled(),
    toggleClickThrough: () => app.toggleClickThrough(),
    alwaysTopEnabled: () => state.alwaysTopEnabled(),
    toggleAlwaysTop: () => app.toggleAlwaysOnTop(),
    accelerators: () => state.accelerators(),
    quit: () => app.quit(),
  };
}
