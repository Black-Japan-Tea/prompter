import { test, expect, _electron, type ElectronApplication, type Page } from '@playwright/test';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { launchPrompter, mainInvoke, mainState, type LaunchedApp, type AppState } from './helpers';

let launched: LaunchedApp;
const workDir = mkdtempSync(join(tmpdir(), 'prompter-keys-'));
const mdPath = join(workDir, 'notes.md');

test.beforeAll(async () => {
  launched = await launchPrompter(join(workDir, 'ud'));
  writeFileSync(mdPath, '# Заметки\n\nтекст заметок', 'utf8');
});

test.afterAll(async () => {
  await launched.app.close();
  rmSync(workDir, { recursive: true, force: true });
});

/** Полный эталонный набор глобальных акселераторов. */
function expectedGlobalShortcuts(): string[] {
  return [
    'Control+Alt+P',
    'Control+Alt+S',
    'Control+Alt+H',
    'Control+Alt+O',
    'Control+Alt+R',
    'Control+Alt+Enter',
    'Control+Alt+=',
    'Control+Alt+-',
    'Control+Alt+Space',
    'Control+Alt+T',
    'Control+Alt+A',
    'Control+Alt+Q',
    'Control+Alt+1',
    'Control+Alt+2',
    'Control+Alt+3',
  ];
}

test('все функции покрыты зарегистрированными глобальными хоткеями', async () => {
  const state = await mainState(launched.app);
  expect([...state.registeredShortcuts].sort()).toEqual(expectedGlobalShortcuts().sort());
});

test('Ctrl+Alt+P показывает и прячет окно через реальный диспетчер', async () => {
  const { app } = launched;
  await mainInvoke(app, 'dispatchAccelerator', 'Control+Alt+P');
  expect((await mainState(app)).windowVisible).toBe(true);

  await mainInvoke(app, 'dispatchAccelerator', 'Control+Alt+P');
  expect((await mainState(app)).windowVisible).toBe(false);
});

test('Ctrl+Alt+= клэмпит прозрачность на 100% и шлёт тост', async () => {
  const { app, page } = launched;
  for (let i = 0; i < 5; i++) {
    await mainInvoke(app, 'dispatchAccelerator', 'Control+Alt+=');
  }
  const state = await mainState(app);
  expect(state.opacity).toBe(1);
  await expect(page.locator('.toast').last()).toContainText('Прозрачность 100%');
});

test('Ctrl+Alt+Space и Ctrl+Alt+3 включают автопрокрутку на быстрой', async () => {
  const { app } = launched;
  await mainInvoke(app, 'dispatchAccelerator', 'Control+Alt+Space');
  await mainInvoke(app, 'dispatchAccelerator', 'Control+Alt+3');

  const state = await mainState(app);
  expect(state.autoScrollEnabled).toBe(true);
  expect(state.autoScrollSpeed).toBe('fast');

  await mainInvoke(app, 'dispatchAccelerator', 'Control+Alt+Space');
  expect((await mainState(app)).autoScrollEnabled).toBe(false);
});

test('Ctrl+Alt+T переключает клик-сквозь и возвращает обратно', async () => {
  const { app } = launched;
  await mainInvoke(app, 'dispatchAccelerator', 'Control+Alt+T');
  expect((await mainState(app)).clickThrough).toBe(true);

  await mainInvoke(app, 'dispatchAccelerator', 'Control+Alt+T');
  expect((await mainState(app)).clickThrough).toBe(false);
});

test('Ctrl+Alt+A переключает поверх-всех (реальный флаг окна)', async () => {
  const { app } = launched;
  await mainInvoke(app, 'dispatchAccelerator', 'Control+Alt+A');
  expect((await mainState(app)).alwaysOnTopActive).toBe(false);

  await mainInvoke(app, 'dispatchAccelerator', 'Control+Alt+A');
  expect((await mainState(app)).alwaysOnTopActive).toBe(true);
});

test('Ctrl+Alt+R переоткрывает последний файл', async () => {
  const { app, page } = launched;
  await mainInvoke(app, 'openFile', mdPath);
  await expect(page.locator('#content h1')).toHaveText('Заметки');

  await mainInvoke(app, 'dispatchAccelerator', 'Control+Alt+R');
  expect((await mainState(app)).currentFile).toBe(mdPath);
  await expect(page.locator('#content h1')).toHaveText('Заметки');
});

test('Ctrl+Alt+O открывает файл через симулированный диалог', async () => {
  const { app, page } = launched;
  await mainInvoke(app, 'simulateNextPick', mdPath);
  await mainInvoke(app, 'dispatchAccelerator', 'Control+Alt+O');
  await expect(page.locator('#content h1')).toHaveText('Заметки');
});

test('реальные клавиши в окне: Esc прячет окно, Ctrl+= увеличивает кегль', async () => {
  const { app, page } = launched;
  await mainInvoke(app, 'executeCommand', { type: 'show-window' });
  const before = (await mainState(app)).fontSize;

  await page.keyboard.press('Control+=');
  await expect
    .poll(async () => (await mainState(app)).fontSize)
    .toBe(before + 1);
  await expect(page.locator('.toast').last()).toContainText('Размер шрифта');

  await page.keyboard.press('Escape');
  await expect
    .poll(async () => (await mainState(app)).windowVisible)
    .toBe(false);
});

test('реальный Ctrl+O открывает симулированный выбор файла', async () => {
  const { app, page } = launched;
  await mainInvoke(app, 'executeCommand', { type: 'show-window' });
  await mainInvoke(app, 'simulateNextPick', mdPath);

  await page.keyboard.press('Control+o');
  await expect(page.locator('#content h1')).toHaveText('Заметки');
});

test('реальный Ctrl+Q завершает приложение', async () => {
  const app: ElectronApplication = await _electron.launch({
    args: ['.'],
    env: {
      ...process.env,
      PROMPTER_TEST_HOOKS: '1',
      PROMPTER_TEST_USER_DATA: join(workDir, 'ud-quit'),
    },
  });
  const page: Page = await app.firstWindow();
  await app.evaluate(() => {
    (globalThis as unknown as { __prompterTest: { toggleWindow(): void } }).__prompterTest.toggleWindow();
  });
  const closed = app.waitForEvent('close', { timeout: 15000 });
  await page.keyboard.press('Control+q');
  await closed;
  const state: AppState | null = await Promise.race([
    mainState(app).catch(() => null),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), 100)),
  ]);
  expect(state).toBeNull();
});
