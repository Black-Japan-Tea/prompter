import { app } from 'electron';
import { PrompterApp } from './app/PrompterApp';
import { AutoScrollSpeed } from '../shared/settings';

let prompter: PrompterApp | null = null;

// Изоляция настроек для E2E: подменяем каталог userData до готовности app.
if (process.env.PROMPTER_TEST_USER_DATA) {
  app.setPath('userData', process.env.PROMPTER_TEST_USER_DATA);
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  // Второй запуск не плодит процессы, а показывает уже живой суфлёр.
  app.on('second-instance', () => prompter?.showWindow());

  void app.whenReady().then(() => {
    prompter = new PrompterApp();
    prompter.start();
    installTestHooks(prompter);
  });

  app.on('before-quit', () => {
    prompter?.dispose();
    prompter = null;
  });
}

/**
 * Диагностический API для E2E-тестов: дергает настоящие методы
 * приложения через evaluate в main-процессе. В проде не выставляется.
 */
function installTestHooks(instance: PrompterApp): void {
  if (process.env.PROMPTER_TEST_HOOKS !== '1') {
    return;
  }
  (globalThis as unknown as Record<string, unknown>).__prompterTest = {
    toggleWindow: (): void => instance.toggleWindow(),
    openFile: (path: string): void => instance.openFile(path),
    toggleAutoScroll: (): void => instance.toggleAutoScrollForTests(),
    setAutoScrollSpeed: (speed: AutoScrollSpeed): void =>
      instance.setAutoScrollSpeedForTests(speed),
    stepOpacity: (direction: 'up' | 'down'): void => instance.stepOpacityForTests(direction),
    state: (): unknown => instance.debugState(),
  };
}
