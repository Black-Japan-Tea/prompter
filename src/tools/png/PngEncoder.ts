import { deflateSync } from 'node:zlib';
import { crc32 } from './crc32';
import { RgbaImage } from './RgbaImage';

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** Собирает один PNG-чанк: длина + тип + данные + CRC. */
function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([length, body, crc]);
}

function ihdr(width: number, height: number): Buffer {
  const data = Buffer.alloc(13);
  data.writeUInt32BE(width, 0);
  data.writeUInt32BE(height, 4);
  data[8] = 8; // глубина: 8 бит на канал
  data[9] = 6; // цветовое пространство: RGBA
  // Сжатие 0, фильтр 0, чересстрочность 0 — байты уже нулевые.
  return chunk('IHDR', data);
}

/** Кодирует RGBA-холст в минимальный валидный PNG (truecolor + alpha). */
export function encodePng(image: RgbaImage): Buffer {
  // Каждая строка предваряется фильтр-байтом 0 (None).
  const stride = image.width * 4;
  const raw = Buffer.alloc((stride + 1) * image.height);
  for (let y = 0; y < image.height; y++) {
    raw[y * (stride + 1)] = 0;
    image.pixels.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  return Buffer.concat([
    PNG_SIGNATURE,
    ihdr(image.width, image.height),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
