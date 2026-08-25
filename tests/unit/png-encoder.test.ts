import { describe, it, expect } from 'vitest';
import { crc32 } from '../../src/tools/png/crc32';
import { encodePng } from '../../src/tools/png/PngEncoder';
import { RgbaImage } from '../../src/tools/png/RgbaImage';
import { inflateSync } from 'node:zlib';

describe('crc32', () => {
  it('считает эталонное значение для «123456789»', () => {
    expect(crc32(Buffer.from('123456789', 'ascii'))).toBe(0xcbf43926);
  });

  it('возвращает 0 для пустого буфера', () => {
    expect(crc32(Buffer.alloc(0))).toBe(0);
  });
});

/** Разбор PNG на чанки для проверок структуры. */
function parseChunks(png: Buffer): Array<{ type: string; data: Buffer }> {
  const chunks: Array<{ type: string; data: Buffer }> = [];
  let offset = 8; // после сигнатуры
  while (offset < png.length) {
    const length = png.readUInt32BE(offset);
    const type = png.subarray(offset + 4, offset + 8).toString('ascii');
    const data = png.subarray(offset + 8, offset + 8 + length);
    const storedCrc = png.readUInt32BE(offset + 8 + length);
    const actualCrc = crc32(Buffer.concat([Buffer.from(type, 'ascii'), data]));
    expect(actualCrc).toBe(storedCrc); // CRC каждого чанка обязан сойтись
    chunks.push({ type, data });
    offset += 12 + length;
  }
  return chunks;
}

describe('encodePng', () => {
  const image: RgbaImage = {
    width: 2,
    height: 1,
    pixels: Buffer.from([
      255, 0, 0, 255, // красный непрозрачный
      0, 255, 0, 128, // зелёный полупрозрачный
    ]),
  };

  it('начинается с сигнатуры PNG', () => {
    const png = encodePng(image);
    expect([...png.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  });

  it('содержит корректный IHDR с размерами и RGBA-типом', () => {
    const chunks = parseChunks(encodePng(image));
    const ihdr = chunks.find((chunk) => chunk.type === 'IHDR');
    expect(ihdr).toBeDefined();
    expect(ihdr?.data.readUInt32BE(0)).toBe(2);
    expect(ihdr?.data.readUInt32BE(4)).toBe(1);
    expect(ihdr?.data[8]).toBe(8); // бит на канал
    expect(ihdr?.data[9]).toBe(6); // цвет: RGBA
  });

  it('заканчивается IEND', () => {
    const chunks = parseChunks(encodePng(image));
    expect(chunks[chunks.length - 1].type).toBe('IEND');
  });

  it('IDAT распаковывается в сырые строки с фильтр-байтом', () => {
    const chunks = parseChunks(encodePng(image));
    const idat = chunks.find((chunk) => chunk.type === 'IDAT');
    const raw = inflateSync(idat?.data as Buffer);
    expect(raw).toHaveLength(1 * (1 + 2 * 4));
    expect(raw[0]).toBe(0); // фильтр None
    expect([...raw.subarray(1, 5)]).toEqual([255, 0, 0, 255]);
    expect([...raw.subarray(5, 9)]).toEqual([0, 255, 0, 128]);
  });

  it('реальный декодер Node принимает файл ( roundtrip через inflate )', () => {
    const png = encodePng(image);
    expect(() => inflateSync(parseChunks(png)[1].data)).not.toThrow();
  });
});
