import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { nativeImage } from 'electron';

// Per-DPI варианты сгенерированы в assets/icons: слот трея Windows
// выбирается по масштабу монитора, поэтому отдаём representations для всех.
const VARIANTS: ReadonlyArray<{ suffix: string; scale: number; size: number }> = [
  { suffix: '1x', scale: 1, size: 16 },
  { suffix: '1.25x', scale: 1.25, size: 20 },
  { suffix: '1.5x', scale: 1.5, size: 24 },
  { suffix: '2x', scale: 2, size: 32 },
];

/**
 * Собирает иконку трея с представлениями под все DPI-слоты Windows.
 * Базовый файл обязан существовать; недостающие варианты логируются.
 */
export function buildTrayIcon(iconsDir: string): Electron.NativeImage {
  const base = nativeImage.createFromPath(join(iconsDir, 'tray@1x.png'));
  if (base.isEmpty()) {
    console.error('Не найден базовый файл tray@1x.png — трей будет с пустой иконкой');
  }
  for (const variant of VARIANTS.slice(1)) {
    const file = join(iconsDir, `tray@${variant.suffix}.png`);
    try {
      base.addRepresentation({
        scaleFactor: variant.scale,
        buffer: readFileSync(file),
        width: variant.size,
        height: variant.size,
      });
    } catch (error) {
      console.error(`Не удалось загрузить ${file}:`, error);
    }
  }
  return base;
}
