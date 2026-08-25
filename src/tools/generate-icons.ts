import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { paintIcon } from './png/IconPainter';
import { encodePng } from './png/PngEncoder';
import { assembleIco } from './png/IcoAssembler';

const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256];

// Слот трея Windows зависит от DPI: 16px при 100%, 20px при 125%,
// 24px при 150%, 32px при 200%. Каждый размер рендерим отдельно —
// даунскейл системной отрисовкой даёт мыло вместо чёткой галочки.
const TRAY_VARIANTS: ReadonlyArray<{ suffix: string; size: number }> = [
  { suffix: '1x', size: 16 },
  { suffix: '1.25x', size: 20 },
  { suffix: '1.5x', size: 24 },
  { suffix: '2x', size: 32 },
];

export interface IconPaths {
  /** Ключи — DPI-суффиксы ('1x', '1.25x', '1.5x', '2x'). */
  trayPaths: Record<string, string>;
  icoPath: string;
}

/**
 * Генерирует все иконки приложения: per-DPI набор tray@*.png для трея
 * и icon.ico (7 размеров) для окна, exe, установщика и ярлыков.
 */
export function generateIcons(outputDir: string): IconPaths {
  mkdirSync(outputDir, { recursive: true });

  const trayPaths: Record<string, string> = {};
  for (const { suffix, size } of TRAY_VARIANTS) {
    const path = join(outputDir, `tray@${suffix}.png`);
    writeFileSync(path, encodePng(paintIcon(size)));
    trayPaths[suffix] = path;
  }

  const icoPath = join(outputDir, 'icon.ico');
  const entries = ICO_SIZES.map((size) => ({
    size,
    png: encodePng(paintIcon(size)),
  }));
  writeFileSync(icoPath, assembleIco(entries));

  return { trayPaths, icoPath };
}

// Запуск как скрипта: кладём ассеты в assets/icons.
if (require.main === module) {
  const outputDir = join(process.cwd(), 'assets', 'icons');
  const paths = generateIcons(outputDir);
  const trayList = Object.values(paths.trayPaths).join(', ');
  console.log(`Иконки сгенерированы: ${trayList}, ${paths.icoPath}`);
}
