import { test, expect, _electron, type Page } from '@playwright/test';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** Путь к проверяемому бинарнику передаётся через PACKAGED_EXE. */
const exe = process.env.PACKAGED_EXE;
test.skip(!exe, 'PACKAGED_EXE не задан — smoke только для собранных бинарников');

interface PackagedState {
  windowVisible: boolean;
  contentProtection: boolean;
  skipTaskbar: boolean;
  trayAlive: boolean;
  currentFile: string | null;
}

async function stateOf(app: ReturnType<typeof launchApp>): Promise<PackagedState> {
  return (await app.evaluate(() => {
    return (globalThis as unknown as { __prompterTest: { state(): unknown } })
      .__prompterTest.state();
  })) as PackagedState;
}

function launchApp(path: string, userData: string) {
  // Для собранных бинарников путь к exe — в executablePath, а не в args:
  // иначе Playwright стартует dev-electron, передав exe как путь к приложению.
  return _electron.launch({
    executablePath: path,
    args: [],
    env: { ...process.env, PROMPTER_TEST_HOOKS: '1', PROMPTER_TEST_USER_DATA: userData },
  });
}

test('собранный бинарник: старт скрытым, трей, защита, тогл и загрузка md', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'prompter-smoke-'));
  const md = join(dir, 'smoke.md');
  writeFileSync(md, '# Дымовой тест\n\nсобранный бинарник', 'utf8');

  const app = await launchApp(exe as string, join(dir, 'ud'));
  let page: Page;
  try {
    page = await app.firstWindow();

    const initial = await stateOf(app);
    expect(initial.windowVisible).toBe(false);
    expect(initial.contentProtection).toBe(true);
    expect(initial.skipTaskbar).toBe(true);
    expect(initial.trayAlive).toBe(true);

    await app.evaluate((_electronModule, path) => {
      (globalThis as unknown as { __prompterTest: { openFile(p: string): void } })
        .__prompterTest.openFile(path);
    }, md);
    await expect(page.locator('#content h1')).toHaveText('Дымовой тест', { timeout: 15000 });
    await expect(page.locator('#file-name')).toHaveText('smoke.md');

    await app.evaluate(() => {
      (globalThis as unknown as { __prompterTest: { toggleWindow(): void } })
        .__prompterTest.toggleWindow();
    });
    expect((await stateOf(app)).windowVisible).toBe(true);
  } finally {
    await app.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
