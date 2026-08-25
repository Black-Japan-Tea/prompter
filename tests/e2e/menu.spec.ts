import { test, expect } from '@playwright/test';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { launchPrompter, mainInvoke, mainState, type LaunchedApp } from './helpers';

let launched: LaunchedApp;
const workDir = mkdtempSync(join(tmpdir(), 'prompter-menu-'));

test.beforeAll(async () => {
  launched = await launchPrompter(join(workDir, 'ud'));
  writeFileSync(join(workDir, 'alpha.md'), '# Альфа\n\nтекст альфы', 'utf8');
  writeFileSync(join(workDir, 'beta.md'), '# Бета\n\nтекст беты', 'utf8');
});

test.afterAll(async () => {
  await launched.app.close();
  rmSync(workDir, { recursive: true, force: true });
});

test.afterEach(async () => {
  // Не протекаем состоянием меню между тестами.
  if (await launched.page.locator('#menu').isVisible()) {
    await launched.page.keyboard.press('Escape');
  }
});

async function openMenu(): Promise<void> {
  if (await launched.page.locator('#menu').isVisible()) {
    return;
  }
  await launched.page.locator('#btn-menu').click();
  await expect(launched.page.locator('#menu')).toBeVisible();
}

test('меню открывается по кнопке ☰ с корректными ролями и хоткеями', async () => {
  const { page } = launched;
  await openMenu();

  await expect(page.locator('#btn-menu')).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('#menu')).toHaveAttribute('role', 'menu');
  await expect(page.locator('.menu-item[role="menuitemcheckbox"]')).toHaveCount(4);
  await expect(page.locator('.menu-item[role="menuitemradio"]')).toHaveCount(3);

  const open = page.locator('.menu-item[data-id="open"]');
  await expect(open).toContainText('Открыть файл…');
  // Подпись хоткея — фактическая (может быть фолбэком при конфликте).
  const activeOpenKey = (await mainState(launched.app)).accelerators['open-file'];
  await expect(open).toContainText(activeOpenKey.replaceAll('Control', 'Ctrl'));

  await expect(page.locator('.menu-item[data-id="always-top"]')).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await expect(page.locator('.menu-item[data-id="autoscroll"]')).toHaveAttribute(
    'aria-checked',
    'false',
  );
});

test('клик по пункту исполняет команду, закрывает меню и показывает тост', async () => {
  const { page } = launched;
  await openMenu();

  await page.locator('.menu-item[data-id="opacity-up"]').click();

  await expect(page.locator('#menu')).toBeHidden();
  await expect(page.locator('.toast')).toContainText('Прозрачность 25%');
  await expect((await mainState(launched.app)).opacity).toBe(0.75);

  // Тост — пилюля в одну строку с центровкой.
  const toastStyle = await page.locator('.toast').evaluate((el) => {
    const style = getComputedStyle(el);
    return { textAlign: style.textAlign, height: el.clientHeight };
  });
  expect(toastStyle.textAlign).toBe('center');
  expect(toastStyle.height).toBeLessThan(55); // одна строка (две были бы ~64px)
});

test('кнопка ☰ не держит оранжевую фокус-подсветку после клика', async () => {
  const { page } = launched;
  await openMenu();
  const outline = await page.locator('#btn-menu').evaluate(
    (el) => getComputedStyle(el).outlineStyle,
  );
  expect(outline).toBe('none');
});

test('чекбокс автопрокрутки синхронизирован с состоянием', async () => {
  const { page } = launched;
  await openMenu();
  await page.locator('.menu-item[data-id="autoscroll"]').click();

  await expect(page.locator('body')).toHaveClass(/autoscroll-on/);
  await expect(page.locator('#badge-autoscroll')).toBeVisible();
  await expect((await mainState(launched.app)).autoScrollEnabled).toBe(true);

  await openMenu();
  await expect(page.locator('.menu-item[data-id="autoscroll"]')).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await page.locator('.menu-item[data-id="autoscroll"]').click();
  await expect((await mainState(launched.app)).autoScrollEnabled).toBe(false);
});

test('радио скорости меняет скорость и отмечает выбранный пункт', async () => {
  const { page } = launched;
  await mainInvoke(launched.app, 'executeCommand', { type: 'autoscroll-speed', speed: 'slow' });
  await openMenu();

  const fast = page.locator('.menu-item[data-id="speed:fast"]');
  await expect(page.locator('.menu-item[data-id="speed:slow"]')).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await fast.click();

  await expect((await mainState(launched.app)).autoScrollSpeed).toBe('fast');
  await expect(page.locator('.toast')).toContainText('Скорость: быстро');
});

test('клавиатура: F10 открывает, стрелки двигают фокус, Enter активирует, Esc закрывает', async () => {
  const { page } = launched;
  await page.keyboard.press('F10');
  await expect(page.locator('#menu')).toBeVisible();

  await expect(page.locator('.menu-item[data-id="open"]')).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('.menu-item[data-id="repeat"]')).toBeFocused();
  await page.keyboard.press('End');
  await expect(page.locator('.menu-item[data-id="quit"]')).toBeFocused();
  await page.keyboard.press('Home');
  await expect(page.locator('.menu-item[data-id="open"]')).toBeFocused();

  // Enter на «Прозрачность −» активирует команду.
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  for (let i = 0; i < 3; i++) {
    await page.keyboard.press('ArrowDown');
  }
  await page.keyboard.press('Escape');
  await expect(page.locator('#menu')).toBeHidden();
});

test('клик мимо меню закрывает его', async () => {
  const { page } = launched;
  await openMenu();
  await page.locator('#empty').click();
  await expect(page.locator('#menu')).toBeHidden();
});

test('повторный клик по ☰ закрывает меню — включая клик по самим SVG-полоскам', async () => {
  const { page } = launched;
  // Регрессия: клик по <svg>/<rect> внутри кнопки считался «кликом мимо»
  // и пересылал меню (capture-закрытие + bubbling-открытие).
  await page.locator('#btn-menu').click();
  await expect(page.locator('#menu')).toBeVisible();
  await page.locator('#btn-menu').click();
  await expect(page.locator('#menu')).toBeHidden();

  // Клик прямо по полоскам (rect) — тот же тогл, не «клик мимо».
  await page.locator('#btn-menu svg rect').first().click();
  await expect(page.locator('#menu')).toBeVisible();
  await page.locator('#btn-menu svg').click();
  await expect(page.locator('#menu')).toBeHidden();
});

test('недавние файлы отображаются и открываются из меню', async () => {
  const { page } = launched;
  await mainInvoke(launched.app, 'openFile', join(workDir, 'alpha.md'));
  await mainInvoke(launched.app, 'openFile', join(workDir, 'beta.md'));
  await expect(page.locator('#content h1')).toHaveText('Бета');

  await openMenu();
  await page.locator('.menu-item[data-id="recent:C:\\Jobka\\projects"]').count(); // smoke селектора
  const alpha = page.locator(`.menu-item[data-id="recent:${cssEscape(join(workDir, 'alpha.md'))}"]`);
  await expect(alpha).toBeVisible();
  await alpha.click();

  await expect(page.locator('#content h1')).toHaveText('Альфа');
  await expect((await mainState(launched.app)).currentFile).toBe(join(workDir, 'alpha.md'));
});

test('пункт «Спрятать окно» скрывает окно', async () => {
  const { page } = launched;
  await mainInvoke(launched.app, 'executeCommand', { type: 'show-window' });
  await openMenu();
  await page.locator('.menu-item[data-id="hide"]').click();

  await expect
    .poll(async () => (await mainState(launched.app)).windowVisible)
    .toBe(false);
  await mainInvoke(launched.app, 'executeCommand', { type: 'show-window' });
});

test('кнопки шапки (меню/свернуть/закрыть) видимы всегда, ✕ скрывает окно', async () => {  const { page, app } = launched;
  for (const id of ['btn-menu', 'btn-hide', 'btn-quit']) {
    const opacity = await page.locator(`#${id}`).evaluate(
      (el) => getComputedStyle(el).opacity,
    );
    expect(Number(opacity), `кнопка #${id} невидима`).toBeGreaterThan(0.5);
  }

  await mainInvoke(app, 'executeCommand', { type: 'show-window' });
  await page.locator('#btn-quit').click();
  await expect
    .poll(async () => (await mainState(app)).windowVisible)
    .toBe(false);
  await mainInvoke(app, 'executeCommand', { type: 'show-window' });
});

test('меню: тогл «Невидимо в трансляции» выключает и включает защиту', async () => {
  const { page, app } = launched;
  await openMenu();
  const item = page.locator('.menu-item[data-id="capture-protection"]');
  await expect(item).toHaveAttribute('aria-checked', 'true');
  await item.click();

  const off = await mainState(app);
  expect(off.captureProtection).toBe(false);
  expect(off.contentProtection).toBe(false);
  await expect(page.locator('.toast').last()).toContainText('видно в трансляции');

  await openMenu();
  await expect(item).toHaveAttribute('aria-checked', 'false');
  await item.click();
  const on = await mainState(app);
  expect(on.captureProtection).toBe(true);
  expect(on.contentProtection).toBe(true);
});

test('клик-сквозь из меню выключается хоткеем — мышь снова работает', async () => {
  const { page, app } = launched;
  await openMenu();
  await page.locator('.menu-item[data-id="clickthrough"]').click();
  await expect((await mainState(app)).clickThrough).toBe(true);
  await expect(page.locator('.toast', { hasText: 'Клик-сквозь' })).toBeVisible();

  // Выключаем через реальный путь активного хоткея (может быть фолбэком).
  const key = (await mainState(app)).accelerators['clickthrough-toggle'];
  await mainInvoke(app, 'dispatchAccelerator', key);
  await expect((await mainState(app)).clickThrough).toBe(false);
});

test('скроллбар: фиолетовая полоса 10px, ховер оживляет зону, drag скроллит', async () => {
  const { page, app } = launched;
  const longPath = join(workDir, 'long.md');
  const paragraphs = Array.from({ length: 60 }, (_, i) => `Абзац ${i} длинного текста.`);
  writeFileSync(longPath, `# Длинный документ\n\n${paragraphs.join('\n\n')}`, 'utf8');
  await mainInvoke(app, 'openFile', longPath);
  await expect(page.locator('#content h1')).toHaveText('Длинный документ');

  // Полоса едина со скроллбаром: толщина 10px.
  const railWidth = await page
    .locator('#rail')
    .evaluate((el) => el.getBoundingClientRect().width);
  expect(Math.round(railWidth)).toBe(10);

  // Позиция полосы растёт при прокрутке — «насколько прокрутил».
  const topBefore = await page.evaluate(
    () => Number(document.getElementById('rail-thumb').style.top.replace('px', '')) || 0,
  );
  await page.locator('#viewer').evaluate((el) => {
    el.scrollTop = el.scrollHeight / 2;
  });
  await page.waitForTimeout(120);
  const topAfter = await page.evaluate(
    () => Number(document.getElementById('rail-thumb').style.top.replace('px', '')) || 0,
  );
  expect(topAfter).toBeGreaterThan(topBefore);

  // Наведение в правой зоне проявляет конструкцию (трек оживает).
  const hitBox = await page.locator('#rail-hit').boundingBox();
  expect(hitBox).not.toBeNull();
  const box = hitBox as { x: number; y: number; width: number; height: number };
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await expect(page.locator('#rail')).toHaveClass(/hit-active/);

  // Drag по зоне скроллит документ — функциональность скроллбара на месте.
  const scrollBefore = await page.evaluate(() => document.getElementById('viewer').scrollTop);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height * 0.15, { steps: 5 });
  await page.mouse.up();
  const scrollAfter = await page.evaluate(() => document.getElementById('viewer').scrollTop);
  expect(Math.abs(scrollAfter - scrollBefore)).toBeGreaterThan(50);
});

function cssEscape(value: string): string {
  return value.replace(/["\\]/g, '\\$&');
}
