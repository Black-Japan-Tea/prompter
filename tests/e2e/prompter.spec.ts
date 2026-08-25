import {
  test,
  expect,
  _electron,
  type ElectronApplication,
  type Page,
} from '@playwright/test';
import { execFile } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

const exec = promisify(execFile);

/** Снимок состояния приложения из main через диагностический хук. */
interface AppState {
  windowVisible: boolean;
  contentProtection: boolean;
  skipTaskbar: boolean;
  trayAlive: boolean;
  currentFile: string | null;
  fontSize: number;
  opacity: number;
  autoScrollEnabled: boolean;
  autoScrollSpeed: string;
  fileName: string | null;
}

const workDir = mkdtempSync(join(tmpdir(), 'prompter-e2e-'));
const userDataDir = join(workDir, 'user-data');
const mdPath = join(workDir, 'speech.md');

writeFileSync(
  mdPath,
  [
    '# Доклад квартальный',
    '',
    '<script>window.__hacked = true</script>',
    '',
    '<img src="x.png" onerror="window.__boom = 1">',
    '',
    'Тезис первый: **рост выручки** на 12%.',
    '',
    '- пункт раз',
    '- пункт два',
    '',
    '> ключевая мысль доклада',
    '',
    '[ссылка](https://example.com)',
  ].join('\n'),
  'utf8',
);

let electronApp: ElectronApplication;
let page: Page;

/**
 * Вызывает метод диагностического хука ВНУТРИ main-процесса:
 * результат evaluate сериализуется, поэтому функции через границу не проходят.
 */
async function mainInvoke(name: string, ...args: unknown[]): Promise<void> {
  await electronApp.evaluate((_electronModule, payload) => {
    const hooks = (globalThis as unknown as {
      __prompterTest: Record<string, (...a: unknown[]) => void>;
    }).__prompterTest;
    hooks[payload.name](...payload.args);
  }, { name, args });
}

async function mainState(): Promise<AppState> {
  return (await electronApp.evaluate(() => {
    return (globalThis as unknown as { __prompterTest: { state(): unknown } })
      .__prompterTest.state();
  })) as AppState;
}

async function launch(): Promise<ElectronApplication> {
  const app = await _electron.launch({
    args: ['.'],
    env: {
      ...process.env,
      PROMPTER_TEST_HOOKS: '1',
      PROMPTER_TEST_USER_DATA: userDataDir,
    },
  });
  return app;
}

test.beforeAll(async () => {
  electronApp = await launch();
  page = await electronApp.firstWindow();
});

test.afterAll(async () => {
  await electronApp.close();
  rmSync(workDir, { recursive: true, force: true });
});

test('1. старт: окно скрыто, трей жив, защита контента и skipTaskbar включены', async () => {
  const state = await mainState();
  expect(state.windowVisible).toBe(false);
  expect(state.trayAlive).toBe(true);
  expect(state.contentProtection).toBe(true);
  expect(state.skipTaskbar).toBe(true);
});

test('2. тогл видимости показывает и прячет окно', async () => {
  await mainInvoke('toggleWindow');
  expect((await mainState()).windowVisible).toBe(true);

  await mainInvoke('toggleWindow');
  expect((await mainState()).windowVisible).toBe(false);
});

test('3. открытие md: рендер есть, санитизация вырезает угрозы', async () => {
  await mainInvoke('openFile', mdPath);

  await expect(page.locator('#content h1')).toHaveText('Доклад квартальный');
  await expect(page.locator('#content strong')).toHaveText('рост выручки');
  await expect(page.locator('#content li')).toHaveCount(2);

  const dirty = await page.evaluate(() => ({
    hacked: (window as unknown as { __hacked?: boolean }).__hacked === true,
    boom: (window as unknown as { __boom?: number }).__boom === 1,
    scripts: document.querySelectorAll('#content script').length,
    onerror: document.querySelector('#content img[onerror]') !== null,
  }));
  expect(dirty.hacked).toBe(false);
  expect(dirty.boom).toBe(false);
  expect(dirty.scripts).toBe(0);
  expect(dirty.onerror).toBe(false);

  expect((await mainState()).currentFile).toBe(mdPath);
  await expect(page.locator('#file-name')).toHaveText('speech.md');
});

test('4. drag&drop файла в окно открывает его', async () => {
  const dropPath = join(workDir, 'dropped.md');
  writeFileSync(dropPath, '# Брошенный файл\n\nсодержимое из drop', 'utf8');

  // Синтетический File не имеет пути на диске, а contextBridge-объект
  // заморожен. Поэтому кладём настоящий файл в скрытый input и дропаем
  // именно его: webUtils.getPathForFile вернёт реальный путь.
  await page.evaluate(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.id = 'e2e-file-input';
    input.style.display = 'none';
    document.body.appendChild(input);
  });
  await page.locator('#e2e-file-input').setInputFiles(dropPath);
  await page.evaluate(() => {
    const input = document.getElementById('e2e-file-input') as HTMLInputElement;
    const file = input.files?.[0];
    if (file === undefined) {
      throw new Error('тестовый input без файла');
    }
    const transfer = new DataTransfer();
    transfer.items.add(file);
    document.dispatchEvent(
      new DragEvent('drop', { dataTransfer: transfer, bubbles: true, cancelable: true }),
    );
    input.remove();
  });

  await expect(page.locator('#content h1')).toHaveText('Брошенный файл');
  await expect(page.locator('#file-name')).toHaveText('dropped.md');
});

test('5. правка файла на диске обновляет контент (live-reload с debounce)', async () => {
  const livePath = join(workDir, 'live.md');
  writeFileSync(livePath, '# Версия один', 'utf8');
  await mainInvoke('openFile', livePath);
  await expect(page.locator('#content h1')).toHaveText('Версия один');

  writeFileSync(livePath, '# Версия два (обновлено)', 'utf8');
  await expect(page.locator('#content h1')).toHaveText('Версия два (обновлено)', {
    timeout: 5000,
  });
});

test('6. прозрачность шагами меняется и отражается в шапке', async () => {
  const before = (await mainState()).opacity;

  // opacity-down = меньше прозрачности = окно плотнее (непрозрачность +0.1).
  await mainInvoke('executeCommand', { type: 'opacity-down' });
  const after = (await mainState()).opacity;
  expect(Math.round((after - before) * 100)).toBe(10);
  await expect(page.locator('#badge-opacity')).toContainText(`${Math.round((1 - after) * 100)}%`);

  await mainInvoke('executeCommand', { type: 'opacity-up' });
  expect((await mainState()).opacity).toBe(before);
});

test('7. автопрокрутка включается тоглом и скорость влияет на движение', async () => {
  const scrollPath = join(workDir, 'scroll.md');
  const paragraphs = Array.from({ length: 60 }, (_, i) => `Абзац номер ${i} с текстом.`);
  writeFileSync(scrollPath, `# Скролл\n\n${paragraphs.join('\n\n')}`, 'utf8');

  await mainInvoke('openFile', scrollPath);
  await expect(page.locator('#content h1')).toHaveText('Скролл');

  await mainInvoke('executeCommand', { type: 'autoscroll-speed', speed: 'fast' });
  // rAF троттлится в скрытом окне — показываем, как это бывает у живого пользователя.
  await mainInvoke('toggleWindow');
  await mainInvoke('executeCommand', { type: 'autoscroll-toggle' });
  await expect(page.locator('#badge-autoscroll')).toBeVisible();
  await expect(page.locator('body')).toHaveClass(/autoscroll-on/);

  await page.waitForTimeout(900);
  const scrollTopFast = await page.evaluate(() => document.getElementById('viewer')?.scrollTop ?? 0);
  expect(scrollTopFast).toBeGreaterThan(40);

  await mainInvoke('executeCommand', { type: 'autoscroll-toggle' });
  await mainInvoke('toggleWindow');
  expect((await mainState()).autoScrollEnabled).toBe(false);
});

test('8. настройки и последний файл переживают перезапуск', async () => {
  await page.evaluate(() => window.prompter.setFontSize(23));
  await expect
    .poll(async () => (await mainState()).fontSize)
    .toBe(23);

  await electronApp.close();

  electronApp = await launch();
  page = await electronApp.firstWindow();
  await page.waitForTimeout(300);

  const state = await mainState();
  expect(state.fontSize).toBe(23);
  expect(state.currentFile).toBe(join(workDir, 'scroll.md'));

  const onDisk = JSON.parse(readFileSync(join(userDataDir, 'settings.json'), 'utf8')) as {
    fontSize: number;
    lastFile: string;
  };
  expect(onDisk.fontSize).toBe(23);
  expect(onDisk.lastFile).toBe(join(workDir, 'scroll.md'));
});

test('9. второй экземпляр не живёт: показывает окно первого и выходит', async () => {
  // После перезапуска окно скрыто — второй запуск должен показать его.
  expect((await mainState()).windowVisible).toBe(false);

  const electronBin = join('node_modules', 'electron', 'dist', 'electron.exe');
  const second = await exec(electronBin, ['.'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PROMPTER_TEST_HOOKS: '1',
      PROMPTER_TEST_USER_DATA: userDataDir,
    },
    timeout: 20000,
  });
  expect(second.exitCode ?? 0).toBe(0);

  await expect
    .poll(async () => (await mainState()).windowVisible, { timeout: 5000 })
    .toBe(true);
});
