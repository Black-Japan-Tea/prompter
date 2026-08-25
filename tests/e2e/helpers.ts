import { _electron, type ElectronApplication, type Page } from '@playwright/test';

/** Снимок диагностического состояния приложения из main. */
export interface AppState {
  windowVisible: boolean;
  contentProtection: boolean;
  skipTaskbar: boolean;
  alwaysOnTopActive: boolean;
  trayAlive: boolean;
  currentFile: string | null;
  fontSize: number;
  opacity: number;
  autoScrollEnabled: boolean;
  autoScrollSpeed: string;
  clickThrough: boolean;
  alwaysOnTop: boolean;
  fileName: string | null;
  registeredShortcuts: string[];
  accelerators: Record<string, string>;
  captureProtection: boolean;
  speedAccelerators: Record<string, string>;
  /** Последний путь, открытый md-ссылкой (тест-хук без реального openPath). */
  lastOpenedExternalPath: string | null;
}

export interface LaunchedApp {
  app: ElectronApplication;
  page: Page;
}

export async function launchPrompter(userDataDir: string): Promise<LaunchedApp> {
  const app = await _electron.launch({
    args: ['.'],
    env: {
      ...process.env,
      PROMPTER_TEST_HOOKS: '1',
      PROMPTER_TEST_USER_DATA: userDataDir,
    },
  });
  const page = await app.firstWindow();
  // firstWindow резолвится до загрузки renderer: ждём готовности preload-моста,
  // иначе первые нажатия уходят в страницу без подписчиков.
  await page.waitForFunction(
    () => (window as unknown as { prompter?: unknown }).prompter !== undefined,
    undefined,
    { timeout: 15000 },
  );
  return { app, page };
}

/** Вызывает метод диагностического хука внутри main-процесса. */
export async function mainInvoke(
  app: ElectronApplication,
  name: string,
  ...args: unknown[]
): Promise<void> {
  await app.evaluate((_electronModule, payload) => {
    const hooks = (globalThis as unknown as {
      __prompterTest: Record<string, (...a: unknown[]) => void>;
    }).__prompterTest;
    hooks[payload.name](...payload.args);
  }, { name, args });
}

export async function mainState(app: ElectronApplication): Promise<AppState> {
  return (await app.evaluate(() => {
    return (globalThis as unknown as { __prompterTest: { state(): unknown } })
      .__prompterTest.state();
  })) as AppState;
}
