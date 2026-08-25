import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { paintIcon } from './png/IconPainter';
import { encodePng } from './png/PngEncoder';
import { assembleIco } from './png/IcoAssembler';

const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256];
const TRAY_SIZE = 32;

export interface IconPaths {
  trayPath: string;
  icoPath: string;
}

/**
 * Генерирует все иконки приложения: tray.png для трея
 * и icon.ico (7 размеров) для окна, exe, установщика и ярлыков.
 */
export function generateIcons(outputDir: string): IconPaths {
  mkdirSync(outputDir, { recursive: true });

  const trayPath = join(outputDir, 'tray.png');
  writeFileSync(trayPath, encodePng(paintIcon(TRAY_SIZE)));

  const icoPath = join(outputDir, 'icon.ico');
  const entries = ICO_SIZES.map((size) => ({
    size,
    png: encodePng(paintIcon(size)),
  }));
  writeFileSync(icoPath, assembleIco(entries));

  return { trayPath, icoPath };
}

// Запуск как скрипта: кладём ассеты в assets/icons.
if (require.main === module) {
  const outputDir = join(process.cwd(), 'assets', 'icons');
  const paths = generateIcons(outputDir);
  console.log(`Иконки сгенерированы: ${paths.trayPath}, ${paths.icoPath}`);
}
