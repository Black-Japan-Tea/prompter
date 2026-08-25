import { test, expect, type ElectronApplication, type Page } from '@playwright/test';
import { mkdtempSync, writeFileSync, appendFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { launchPrompter, mainInvoke, mainState, type LaunchedApp, type AppState } from './helpers';

/**
 * Комбинаторный прогон: КАЖДОЕ действие выполняется в паре с КАЖДЫМ другим
 * (полная матрица N×N). После каждого шага проверяются инварианты —
 * защита контента, трей, границы значений, отсутствие ошибок renderer.
 */

let launched: LaunchedApp;
const workDir = mkdtempSync(join(tmpdir(), 'prompter-combo-'));
const fileA = join(workDir, 'combo-a.md');
const fileB = join(workDir, 'combo-b.md');
const pageErrors: string[] = [];

test.beforeAll(async () => {
  launched = await launchPrompter(join(workDir, 'ud'));
  launched.page.on('pageerror', (error) => pageErrors.push(error.message));
  const paragraphs = Array.from({ length: 40 }, (_, i) => `Строка ${i} длинного конспекта.`);
  writeFileSync(fileA, `# Матрица A\n\n${paragraphs.join('\n\n')}`, 'utf8');
  writeFileSync(fileB, '# Матрица B\n\nсодержимое файла B', 'utf8');
});

test.afterAll(async () => {
  await launched.app.close().catch(() => undefined);
  try {
    rmSync(workDir, { recursive: true, force: true });
  } catch {
    // Каталог может быть кратковременно занят.
  }
});

interface Action {
  name: string;
  run(electron: ElectronApplication, page: Page): Promise<void>;
}

function buildActions(accs: Record<string, string>): Action[] {
  const exec = (electron: ElectronApplication, type: string, extra?: unknown) =>
    mainInvoke(electron, 'executeCommand', { type, ...(extra as object) });
  return [
    { name: 'open-a', run: (electron) => mainInvoke(electron, 'openFile', fileA) },
    { name: 'open-b', run: (electron) => mainInvoke(electron, 'openFile', fileB) },
    {
      name: 'repeat-last',
      run: (electron) => mainInvoke(electron, 'dispatchAccelerator', accs['repeat-last-file']),
    },
    {
      name: 'file-edit',
      run: async () => {
        appendFileSync(fileA, '\n\nПравка из комбинаторики', 'utf8');
        await new Promise((resolve) => setTimeout(resolve, 350)); // debounce вотчера
      },
    },
    { name: 'hide', run: (electron) => exec(electron, 'hide-window') },
    { name: 'show', run: (electron) => exec(electron, 'show-window') },
    { name: 'toggle-window', run: (electron) => exec(electron, 'toggle-window') },
    {
      name: 'opacity-up',
      run: (electron) => mainInvoke(electron, 'dispatchAccelerator', accs['opacity-up']),
    },
    {
      name: 'opacity-down',
      run: (electron) => mainInvoke(electron, 'dispatchAccelerator', accs['opacity-down']),
    },
    {
      name: 'autoscroll-toggle',
      run: (electron) => mainInvoke(electron, 'dispatchAccelerator', accs['autoscroll-toggle']),
    },
    { name: 'speed-slow', run: (electron) => exec(electron, 'autoscroll-speed', { speed: 'slow' }) },
    { name: 'speed-fast', run: (electron) => exec(electron, 'autoscroll-speed', { speed: 'fast' }) },
    {
      name: 'clickthrough-toggle',
      run: (electron) => mainInvoke(electron, 'dispatchAccelerator', accs['clickthrough-toggle']),
    },
    {
      name: 'top-toggle',
      run: (electron) => mainInvoke(electron, 'dispatchAccelerator', accs['always-top-toggle']),
    },
    {
      name: 'capture-toggle',
      run: (electron) => mainInvoke(electron, 'dispatchAccelerator', accs['capture-protection-toggle']),
    },
    { name: 'font-up', run: (_electron, page) => page.keyboard.press('Control+=') },
    {
      name: 'menu-cycle',
      run: async (_electron, page) => {
        await page.keyboard.press('F10');
        await page.keyboard.press('Escape');
      },
    },
  ];
}

async function reset(launched: LaunchedApp): Promise<void> {
  const { app, page } = launched;
  const state = await mainState(app);
  if (state.autoScrollEnabled) {
    await mainInvoke(app, 'executeCommand', { type: 'autoscroll-toggle' });
  }
  if (state.clickThrough) {
    await mainInvoke(app, 'executeCommand', { type: 'clickthrough-toggle' });
  }
  if (!state.alwaysOnTop) {
    await mainInvoke(app, 'executeCommand', { type: 'always-top-toggle' });
  }
  if (!state.captureProtection) {
    await mainInvoke(app, 'executeCommand', { type: 'capture-protection-toggle' });
  }
  if (await page.locator('#menu').isVisible()) {
    await page.keyboard.press('Escape');
  }
  await mainInvoke(app, 'openFile', fileA);
  await mainInvoke(app, 'executeCommand', { type: 'show-window' });
}

function checkInvariants(state: AppState, label: string): void {
  // Защиту можно выключить намеренно — но флаг окна обязан совпадать с настройкой.
  expect(
    state.contentProtection,
    `${label}: рассинхрон защиты захвата и настройки`,
  ).toBe(state.captureProtection);
  expect(state.skipTaskbar, `${label}: окно вылезло на панель задач!`).toBe(true);
  expect(state.trayAlive, `${label}: трей умер!`).toBe(true);
  expect(state.opacity, `${label}: прозрачность вне диапазона`).toBeGreaterThanOrEqual(0.2);
  expect(state.opacity, `${label}: прозрачность вне диапазона`).toBeLessThanOrEqual(1);
  expect(state.fontSize, `${label}: кегль вне диапазона`).toBeGreaterThanOrEqual(12);
  expect(state.fontSize, `${label}: кегль вне диапазона`).toBeLessThanOrEqual(28);
}

test.describe.serial('комбинаторика: каждая пара действий', () => {
  const rowCount = 17;

  for (let rowIndex = 0; rowIndex < rowCount; rowIndex++) {
    test(`строка ${rowIndex}: действие «${rowIndex}» перед каждым другим`, async () => {
      const accs = (await mainState(launched.app)).accelerators;
      const actions = buildActions(accs);
      const first = actions[rowIndex];

      for (const second of actions) {
        pageErrors.length = 0;
        const label = `${first.name} → ${second.name}`;
        await reset(launched);

        await first.run(launched.app, launched.page);
        checkInvariants(await mainState(launched.app), `${label} [после первого]`);

        await second.run(launched.app, launched.page);
        await new Promise((resolve) => setTimeout(resolve, 60));
        checkInvariants(await mainState(launched.app), `${label} [после второго]`);

        // Окно всегда можно вернуть и контент остаётся на месте.
        await mainInvoke(launched.app, 'executeCommand', { type: 'show-window' });
        await expect(launched.page.locator('#content h1'), label).toHaveText(/Матрица [AB]/);
        expect(pageErrors, `${label}: ошибки renderer`).toEqual([]);
      }
    });
  }
});
