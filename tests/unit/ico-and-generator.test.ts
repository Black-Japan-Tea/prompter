import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { assembleIco } from '../../src/tools/png/IcoAssembler';
import { generateIcons } from '../../src/tools/generate-icons';
import { encodePng } from '../../src/tools/png/PngEncoder';
import { createImage } from '../../src/tools/png/RgbaImage';

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

const tempDirs: string[] = [];

afterEach(() => {
  while (tempDirs.length > 0) {
    rmSync(tempDirs.pop() as string, { recursive: true, force: true });
  }
});

describe('assembleIco', () => {
  const png16 = encodePng(createImage(16, 16));
  const png256 = encodePng(createImage(256, 256));

  it('пишет корректный заголовок ICO: тип 1 и количество образов', () => {
    const ico = assembleIco([{ size: 16, png: png16 }]);
    expect(ico.readUInt16LE(0)).toBe(0); // reserved
    expect(ico.readUInt16LE(2)).toBe(1); // type: icon
    expect(ico.readUInt16LE(4)).toBe(1); // один образ
  });

  it('кодирует 256 как ширину 0 (соглашение формата)', () => {
    const ico = assembleIco([{ size: 256, png: png256 }]);
    expect(ico[6]).toBe(0); // ширина
    expect(ico[7]).toBe(0); // высота
  });

  it('записывает размеры и смещения образов, PNG лежат по смещениям', () => {
    const ico = assembleIco([
      { size: 16, png: png16 },
      { size: 256, png: png256 },
    ]);
    expect(ico.readUInt16LE(10)).toBe(1); // planes
    expect(ico.readUInt16LE(12)).toBe(32); // bpp
    const size0 = ico.readUInt32LE(14);
    const offset0 = ico.readUInt32LE(18);
    expect(size0).toBe(png16.length);
    expect([...ico.subarray(offset0, offset0 + 8)]).toEqual(PNG_SIGNATURE);
    // Вторая запись начинается после заголовка (6) + двух записей (2*16).
    const offset1 = ico.readUInt32LE(6 + 16 + 12);
    expect(offset1).toBe(offset0 + png16.length);
    expect([...ico.subarray(offset1, offset1 + 8)]).toEqual(PNG_SIGNATURE);
  });
});

describe('generateIcons', () => {
  it('создаёт per-DPI набор tray-иконок с точными размерами и icon.ico', () => {
    const dir = mkdtempSync(join(tmpdir(), 'prompter-icons-'));
    tempDirs.push(dir);

    const paths = generateIcons(dir);

    // Слот трея Windows — 16px (100%), 20px (125%), 24px (150%), 32px (200%):
    // каждый размер рендерится отдельно, чтобы не было даунскейла-мыла.
    const expected: Array<[string, number]> = [
      ['1x', 16],
      ['1.25x', 20],
      ['1.5x', 24],
      ['2x', 32],
    ];
    for (const [suffix, size] of expected) {
      const file = paths.trayPaths[suffix];
      expect(file, `tray@${suffix}.png не сгенерирован`).toBeDefined();
      const png = readFileSync(file as string);
      expect([...png.subarray(0, 8)]).toEqual(PNG_SIGNATURE);
      // IHDR: ширина и высота — big-endian uint32 на смещениях 16 и 20.
      expect(png.readUInt32BE(16)).toBe(size);
      expect(png.readUInt32BE(20)).toBe(size);
    }

    expect(existsSync(paths.icoPath)).toBe(true);
    const ico = readFileSync(paths.icoPath);
    expect(ico.readUInt16LE(4)).toBe(7); // 16,24,32,48,64,128,256
    const sizes = [16, 24, 32, 48, 64, 128, 0];
    for (let i = 0; i < 7; i++) {
      expect(ico[6 + i * 16]).toBe(sizes[i]);
    }
  });
});
