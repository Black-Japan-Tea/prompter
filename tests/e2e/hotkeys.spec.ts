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
  await launched.app.close().catch(() => undefined);
  try {
    rmSync(workDir, { recursive: true, force: true });
  } catch {
    // Временный каталог может быть кратковременно занят — не роняем	suite.
  }
});

/** Хоткейные команды — каждая обязана иметь рабочий хоткей. */
const COMMAND_TYPES = [
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

test('каждая функция покрыта активным хоткеем (с фолбэками при конфликтах)', async () => {
  const state = await mainState(launched.app);
  for (const type of COMMAND_TYPES) {
    expect(
      state.accelerators[type],
      `у команды «${type}» нет активного хоткея`,
    ).toBeTruthy();
  }
  // Показ/скрытие — только тогл: отдельных show/hide хоткеев не существует.
  expect(state.accelerators['show-window']).toBeUndefined();
  expect(state.accelerators['hide-window']).toBeUndefined();
  // Активные хоткеи реально зарегистрированы в системе.
  for (const [type, accelerator] of Object.entries(state.accelerators)) {
    if (type === 'autoscroll-speed') {
      continue; // составная подпись, реальные комбинации — ниже
    }
    expect(state.registeredShortcuts, type).toContain(accelerator);
  }
  for (const speed of ['slow', 'medium', 'fast'] as const) {
    const accelerator = state.speedAccelerators[speed];
    expect(accelerator, `скорость ${speed} без хоткея`).toBeTruthy();
    expect(state.registeredShortcuts).toContain(accelerator);
  }
});

test('переключение окна работает через активный хоткей тогла', async () => {
  const { app } = launched;
  const toggle = (await mainState(app)).accelerators['toggle-window'];

  await mainInvoke(app, 'dispatchAccelerator', toggle);
  expect((await mainState(app)).windowVisible).toBe(true);

  await mainInvoke(app, 'dispatchAccelerator', toggle);
  expect((await mainState(app)).windowVisible).toBe(false);
});

test('хоткей прозрачности вверх клэмпит на 100% и шлёт тост', async () => {
  const { app, page } = launched;
  const up = (await mainState(app)).accelerators['opacity-up'];
  for (let i = 0; i < 5; i++) {
    await mainInvoke(app, 'dispatchAccelerator', up);
  }
  const state = await mainState(app);
  expect(state.opacity).toBe(1);
  await expect(page.locator('.toast').last()).toContainText('Прозрачность 100%');
});

test('хоткеи автопрокрутки и скорости включают быструю прокрутку', async () => {
  const { app } = launched;
  const scrollKey = (await mainState(app)).accelerators['autoscroll-toggle'];
  const fastKey = (await mainState(app)).speedAccelerators['fast'];
  await mainInvoke(app, 'dispatchAccelerator', scrollKey);
  await mainInvoke(app, 'dispatchAccelerator', fastKey);

  const state = await mainState(app);
  expect(state.autoScrollEnabled).toBe(true);
  expect(state.autoScrollSpeed).toBe('fast');

  await mainInvoke(app, 'dispatchAccelerator', scrollKey);
  expect((await mainState(app)).autoScrollEnabled).toBe(false);
});

test('хоткей клик-сквозь переключает и возвращает обратно', async () => {
  const { app } = launched;
  const key = (await mainState(app)).accelerators['clickthrough-toggle'];
  await mainInvoke(app, 'dispatchAccelerator', key);
  expect((await mainState(app)).clickThrough).toBe(true);

  await mainInvoke(app, 'dispatchAccelerator', key);
  expect((await mainState(app)).clickThrough).toBe(false);
});

test('хоткей поверх-всех переключает реальный флаг окна', async () => {
  const { app } = launched;
  const key = (await mainState(app)).accelerators['always-top-toggle'];
  await mainInvoke(app, 'dispatchAccelerator', key);
  expect((await mainState(app)).alwaysOnTopActive).toBe(false);

  await mainInvoke(app, 'dispatchAccelerator', key);
  expect((await mainState(app)).alwaysOnTopActive).toBe(true);
});

test('хоткей последнего файла переоткрывает документ', async () => {
  const { app, page } = launched;
  await mainInvoke(app, 'openFile', mdPath);
  await expect(page.locator('#content h1')).toHaveText('Заметки');

  const key = (await mainState(app)).accelerators['repeat-last-file'];
  await mainInvoke(app, 'dispatchAccelerator', key);
  expect((await mainState(app)).currentFile).toBe(mdPath);
});

test('хоткей открытия файла работает через симулированный диалог', async () => {
  const { app, page } = launched;
  const key = (await mainState(app)).accelerators['open-file'];
  await mainInvoke(app, 'simulateNextPick', mdPath);
  await mainInvoke(app, 'dispatchAccelerator', key);
  await expect(page.locator('#content h1')).toHaveText('Заметки');
});

test('хоткей невидимости переключает защиту от захвата с предупреждением', async () => {
  const { app, page } = launched;
  const key = (await mainState(app)).accelerators['capture-protection-toggle'];

  await mainInvoke(app, 'dispatchAccelerator', key);
  const off = await mainState(app);
  expect(off.captureProtection).toBe(false);
  expect(off.contentProtection).toBe(false);
  await expect(page.locator('.toast').last()).toContainText('видно в трансляции');

  await mainInvoke(app, 'dispatchAccelerator', key);
  const on = await mainState(app);
  expect(on.captureProtection).toBe(true);
  expect(on.contentProtection).toBe(true);
});

test('реальные клавиши в окне: Esc НЕ прячет окно, Ctrl+= увеличивает кегль', async () => {
  const { app, page } = launched;
  await mainInvoke(app, 'executeCommand', { type: 'show-window' });
  const before = (await mainState(app)).fontSize;

  await page.keyboard.press('Control+=');
  await expect
    .poll(async () => (await mainState(app)).fontSize)
    .toBe(before + 1);
  await expect(page.locator('.toast').last()).toContainText('Размер шрифта');

  // Esc на пустом окне ничего не делает: окно остаётся видимым.
  await page.keyboard.press('Escape');
  await new Promise((resolve) => setTimeout(resolve, 300));
  expect((await mainState(app)).windowVisible).toBe(true);

  // Скрытие — только тогл-хоткеем.
  const toggle = (await mainState(app)).accelerators['toggle-window'];
  await mainInvoke(app, 'dispatchAccelerator', toggle);
  await expect
    .poll(async () => (await mainState(app)).windowVisible)
    .toBe(false);
  // Тот же хоткей возвращает окно — «одна и та же комбинация».
  await mainInvoke(app, 'dispatchAccelerator', toggle);
  await expect
    .poll(async () => (await mainState(app)).windowVisible)
    .toBe(true);
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
  try {
    const page: Page = await app.firstWindow();
    await page.waitForFunction(
      () => (window as unknown as { prompter?: unknown }).prompter !== undefined,
      undefined,
      { timeout: 15000 },
    );
    await app.evaluate(() => {
      (globalThis as unknown as { __prompterTest: { toggleWindow(): void } }).__prompterTest.toggleWindow();
    });
    // Ждём именно смерти процесса: событие 'close' у ElectronApplication капризно.
    const exited = new Promise<void>((resolve) => {
      app.process().once('exit', () => resolve());
    });
    // Ctrl+Q убивает приложение мгновенно: сам press может реджектнуться
    // из-за смерти страницы — это и есть успех, ждём выхода процесса.
    await page.keyboard.press('Control+q').catch(() => undefined);
    await Promise.race([
      exited,
      new Promise<void>((_, reject) =>
        setTimeout(() => reject(new Error('процесс не завершился за 15с')), 15000),
      ),
    ]);
  } finally {
    await app.close().catch(() => undefined);
  }
});
